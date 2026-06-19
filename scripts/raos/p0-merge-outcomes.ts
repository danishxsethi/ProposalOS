/**
 * RAOS Release_Gate — fold the secret-scan + dependency-audit GitHub Actions
 * step outcomes into the P0 results file (task 13.1).
 *
 * The tenant-isolation P0 check is computed in TypeScript (p0-tenant-isolation.ts),
 * but the secret scan (gitleaks) and dependency audit (npm audit) are GitHub
 * Actions steps whose pass/fail is an Actions step `outcome` string
 * (`success` | `failure`). This script appends a `StaticP0CheckResult` for each
 * so the Gate_Verdict computation sees EVERY P0 safety check, and a failing
 * secret scan or dependency audit contributes an unresolved Critical ⇒ the gate
 * fails (R17.1).
 *
 * Requirements: 17.1, 17.4
 */

import fs from 'fs';

import type { P0SafetyCheck, StaticP0CheckResult } from '../../lib/raos/releaseGate';

function parseArgs(argv: string[]): {
  results: string;
  secretScan?: string;
  dependencyAudit?: string;
} {
  let results = 'release-gate/p0-results.json';
  let secretScan: string | undefined;
  let dependencyAudit: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--results') results = argv[++i];
    else if (argv[i] === '--secret-scan') secretScan = argv[++i];
    else if (argv[i] === '--dependency-audit') dependencyAudit = argv[++i];
  }
  return { results, secretScan, dependencyAudit };
}

/** A GitHub Actions step `outcome` of `success` ⇒ passed; anything else ⇒ failed. */
function outcomePassed(outcome: string | undefined): boolean {
  return outcome === 'success';
}

function upsert(
  results: StaticP0CheckResult[],
  check: P0SafetyCheck,
  passed: boolean,
  detail: string
): void {
  const entry: StaticP0CheckResult = {
    check,
    passed,
    criticalCount: passed ? 0 : 1,
    detail,
  };
  const idx = results.findIndex((r) => r.check === check);
  if (idx >= 0) results[idx] = entry;
  else results.push(entry);
}

function main(): void {
  const { results: resultsPath, secretScan, dependencyAudit } = parseArgs(process.argv.slice(2));

  const results: StaticP0CheckResult[] = fs.existsSync(resultsPath)
    ? (JSON.parse(fs.readFileSync(resultsPath, 'utf8')) as StaticP0CheckResult[])
    : [];

  if (secretScan !== undefined) {
    const passed = outcomePassed(secretScan);
    upsert(
      results,
      'secret-scan',
      passed,
      passed ? 'gitleaks found no leaked secrets' : `gitleaks step outcome: ${secretScan}`
    );
  }

  if (dependencyAudit !== undefined) {
    const passed = outcomePassed(dependencyAudit);
    upsert(
      results,
      'dependency-audit',
      passed,
      passed
        ? 'npm audit clean at --audit-level=high'
        : `npm audit step outcome: ${dependencyAudit}`
    );
  }

  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n', 'utf8');

  for (const r of results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'} ${r.check}: ${r.detail ?? ''}`);
  }
}

main();
