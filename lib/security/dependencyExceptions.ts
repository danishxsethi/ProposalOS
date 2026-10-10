/**
 * lib/security/dependencyExceptions.ts
 *
 * The dependency-advisory gate's exception mechanism — PREPARED but NOT
 * APPROVED. The gate (scripts/check-dependency-audits.ts) fails on any
 * HIGH/CRITICAL advisory. A single, narrowly-scoped exception is declared
 * here for the unpatchable braces advisory; it activates ONLY when the owner
 * sets PROPOSALOS_DEPENDENCY_EXCEPTIONS_APPROVED=true in the CI environment,
 * and even then it is honored only while ALL of these hold:
 *
 *   1. The advisory matches the exact declared GHSA id.
 *   2. The exception has not expired (expiry: 2026-11-09 — re-check upstream
 *      for a patched braces release or complete the planned Tailwind 4
 *      migration before then).
 *   3. The vulnerable package is NOT reachable in the production dependency
 *      tree (automatic failure the moment it becomes production-reachable).
 *   4. The production tree itself remains at zero HIGH/CRITICAL.
 *   5. Every other HIGH/CRITICAL advisory still fails the gate.
 *
 * No global threshold reduction: the only behavior change when active is
 * excusing the exact advisory below while dev-only.
 */

export interface PreparedException {
  advisoryId: string;
  packageName: string;
  /** 'dev' — the exception applies only while the package is dev-only. */
  scope: 'dev';
  /** ISO date; the exception is refused on/after this date. */
  expiry: string;
  rationale: string;
  transitivePaths: string[];
  compensatingControls: string[];
}

export const PREPARED_EXCEPTIONS: readonly PreparedException[] = [
  {
    advisoryId: 'GHSA-vfj7-8cjw-p6xm',
    packageName: 'braces',
    scope: 'dev',
    expiry: '2026-11-09',
    rationale:
      'No patched braces release exists (latest 3.0.3 is itself affected; the GHSA lists no fixed version). ' +
      'The vulnerable operation is parsing deeply nested brace patterns in glob expansion. Both affected ' +
      "chains are build/lint tooling that only ever globs this repository's own file names — never " +
      'attacker-controlled input in any deployed or CI context. The only version-level fix is a breaking ' +
      'Tailwind 4 + toolchain migration, deliberately deferred.',
    transitivePaths: [
      'tailwindcss@3.4.19 -> chokidar -> micromatch -> braces (build-time file watching)',
      'eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces (lint-time globs)',
    ],
    compensatingControls: [
      'Production dependency tree must remain at zero HIGH/CRITICAL (enforced by this gate on every run).',
      'Automatic gate failure if braces becomes reachable in the production tree (enforced on every run).',
      'Every other HIGH/CRITICAL advisory still fails the gate (enforced on every run).',
      'Time-boxed: expires 2026-11-09; renewal requires a fresh owner decision.',
    ],
  },
];

export const EXCEPTION_APPROVAL_ENV = 'PROPOSALOS_DEPENDENCY_EXCEPTIONS_APPROVED';

export interface AuditVulnerability {
  severity?: string;
  via?: Array<string | { url?: string; title?: string; severity?: string }>;
  isDirect?: boolean;
  effects?: string[];
}

export interface AuditReportLike {
  metadata?: {
    vulnerabilities?: { high?: number; critical?: number };
  };
  vulnerabilities?: Record<string, AuditVulnerability>;
}

export interface GateEvaluation {
  pass: boolean;
  failures: string[];
  excusedAdvisories: string[];
  expiredExceptions: string[];
  /** True when the exception mechanism is owner-activated. */
  exceptionsActive: boolean;
}

function advisoryIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/advisories\/(GHSA-[a-z0-9-]+)$/i.exec(url);
  return match ? match[1]!.toUpperCase() : null;
}

function severityIsHighOrCritical(severity: string | undefined): boolean {
  return severity === 'high' || severity === 'critical';
}

/**
 * Evaluate the dependency gate for a full-tree + production audit pair.
 *
 * Pure function of its inputs (tests fabricate reports); the script wires env
 * state (approval flag, current date) in.
 */
export function evaluateAuditGate(input: {
  productionReport: AuditReportLike;
  fullReport: AuditReportLike;
  exceptionsApproved: boolean;
  now: Date;
  /** Package names present in the production dependency tree. */
  productionPackages?: Set<string>;
}): GateEvaluation {
  const { productionReport, fullReport, exceptionsApproved, now } = input;
  const failures: string[] = [];

  // Production gate: absolute, never excepted.
  const prodHigh = productionReport.metadata?.vulnerabilities?.high ?? 0;
  const prodCritical = productionReport.metadata?.vulnerabilities?.critical ?? 0;
  if (prodCritical > 0) failures.push('Production dependency audit has CRITICAL advisories');
  if (prodHigh > 0) failures.push('Production dependency audit has HIGH advisories');

  // Production reachability of excepted packages: automatic failure.
  const productionPackages =
    input.productionPackages ??
    new Set<string>(Object.keys(productionReport.vulnerabilities ?? {}));

  // Determine which exceptions are currently valid (approved + unexpired).
  const expiredExceptions: string[] = [];
  const activeExceptions = PREPARED_EXCEPTIONS.filter((exception) => {
    if (new Date(exception.expiry).getTime() <= now.getTime()) {
      expiredExceptions.push(`${exception.advisoryId} (expired ${exception.expiry})`);
      return false;
    }
    return true;
  });
  const exceptionsActive = exceptionsApproved && expiredExceptions.length === 0;

  // Excused advisory ids — only when the mechanism is owner-activated.
  // GHSA ids are matched case-insensitively (normalize both sides).
  const excusedAdvisories = new Set<string>(
    exceptionsActive ? activeExceptions.map((e) => e.advisoryId.toUpperCase()) : []
  );
  const excusedPackages = new Set<string>(
    exceptionsActive ? activeExceptions.map((e) => e.packageName) : []
  );

  if (exceptionsApproved) {
    for (const exception of PREPARED_EXCEPTIONS) {
      if (productionPackages.has(exception.packageName)) {
        failures.push(
          `Exception auto-failure: ${exception.packageName} (${exception.advisoryId}) is now reachable in the production dependency tree`
        );
      }
    }
    if (expiredExceptions.length > 0) {
      failures.push(`Expired dependency exception(s): ${expiredExceptions.join(', ')}`);
    }
  }

  // Full-tree walk: every HIGH/CRITICAL vulnerability must trace only to
  // excused advisories (or to packages that themselves trace to excused
  // advisories). Fixpoint over name-only transitive vias.
  const fullVulns = fullReport.vulnerabilities ?? {};
  const verdict: Record<string, boolean> = {}; // packageName -> excused?
  const objectAdvisories = (vuln: AuditVulnerability) =>
    (vuln.via ?? []).filter((via): via is { url?: string } => typeof via === 'object');

  const isExcused = (packageName: string, seen: Set<string> = new Set()): boolean => {
    if (packageName in verdict) return verdict[packageName]!;
    if (seen.has(packageName)) return false; // cycle guard
    seen.add(packageName);
    const vuln = fullVulns[packageName];
    if (!vuln) return false;
    const advisories = objectAdvisories(vuln)
      .map((via) => advisoryIdFromUrl(via.url))
      .filter((id): id is string => id !== null);
    if (advisories.length > 0) {
      // Has its own advisory objects: excused only if ALL are excused.
      const result = advisories.every((id) => excusedAdvisories.has(id));
      verdict[packageName] = result;
      return result;
    }
    // Pure transitive: excused when every named parent is excused.
    const parents = (vuln.via ?? []).filter((via): via is string => typeof via === 'string');
    const result =
      excusedPackages.has(packageName) ||
      (parents.length > 0 && parents.every((parent) => isExcused(parent, seen)));
    verdict[packageName] = result;
    return result;
  };

  const remainingHighCritical: string[] = [];
  for (const [packageName, vuln] of Object.entries(fullVulns)) {
    if (!severityIsHighOrCritical(vuln.severity)) continue;
    // CRITICAL findings are never excusable, regardless of advisory id — the
    // prepared exception is scoped to the HIGH braces finding only.
    if (vuln.severity === 'critical') {
      remainingHighCritical.push(packageName);
      continue;
    }
    if (!isExcused(packageName)) {
      remainingHighCritical.push(packageName);
    }
  }
  if (remainingHighCritical.length > 0) {
    failures.push(
      `Full dependency audit has HIGH/CRITICAL advisories not covered by an approved exception: ${remainingHighCritical.join(', ')}`
    );
  }
  if ((fullReport.metadata?.vulnerabilities?.critical ?? 0) > 0) {
    // Critical advisories are never excusable.
    const hasUnexcusedCritical = Object.entries(fullVulns).some(
      ([name, vuln]) => vuln.severity === 'critical' && !isExcused(name)
    );
    if (hasUnexcusedCritical) {
      failures.push('Full dependency audit has CRITICAL advisories');
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    excusedAdvisories: Array.from(excusedAdvisories),
    expiredExceptions,
    exceptionsActive,
  };
}
