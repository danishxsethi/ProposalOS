/**
 * P1-03 (partial fix — full reconciliation is Wave 16 scope): this is NOT the
 * canonical/complete audit module list. The canonical, complete module set is
 * MODULE_REGISTRY in lib/audit/runner.ts (27 modules, all phases). This is the
 * much smaller subset of modules whose success is required for runner.ts's
 * completeness guardrail to allow a COMPLETE verdict (see CRITICAL_COMPLETION_MODULES
 * usage in lib/audit/runner.ts) — if any of these 5 fail, the audit is downgraded to
 * PARTIAL even when the overall completion percentage would otherwise qualify as
 * COMPLETE.
 *
 * The previous name (CANONICAL_AUDIT_MODULES) implied this was the full/authoritative
 * module list, which the audit report flagged as one of three divergent "how many
 * modules does an audit run" answers (this list=5, MODULE_REGISTRY=27,
 * AuditOrchestrator=14). Renamed for clarity; membership is unchanged (a behavior
 * change to which modules are "critical" is a product decision, deferred to Wave 16's
 * full reconciliation pass).
 */
export const CRITICAL_COMPLETION_MODULES = [
  'website',
  'gbp',
  'competitor',
  'reputation',
  'social',
] as const;

export type CriticalCompletionModuleId = (typeof CRITICAL_COMPLETION_MODULES)[number];

export const FRONTEND_AUDIT_CATEGORIES = [
  'website',
  'google',
  'seo',
  'reviews',
  'social',
  'competitors',
] as const;

export type FrontendAuditCategoryId = (typeof FRONTEND_AUDIT_CATEGORIES)[number];

export const FRONTEND_AUDIT_CATEGORY_MAP: Record<string, FrontendAuditCategoryId[]> = {
  website: ['website', 'seo'],
  gbp: ['google', 'reviews'],
  competitor: ['competitors'],
  reputation: ['reviews'],
  social: ['social'],
};

export function mapModuleToFrontendCategories(moduleId: string): string[] {
  return FRONTEND_AUDIT_CATEGORY_MAP[moduleId] || [moduleId];
}

// ============================================================================
// Canonical audit module manifest (Wave 2 / P1-03)
// ============================================================================
//
// Single declarative source of truth for the 27 legitimate primary-engine audit
// module IDs, their phase, dependency graph, optionality, per-module timeout, and
// (where applicable) the ENABLE_*_AUDIT_MODULE rollout flag that gates them.
//
// `lib/audit/runner.ts`'s MODULE_REGISTRY (the executable engine — adapters,
// `run()` functions) is validated against this manifest by
// `tests/architecture/canonical-module-manifest.test.ts`, which fails the build if
// the two ever diverge (wrong module count, mismatched phase/deps/optional/timeout,
// or an ID that exists in one but not the other). That test is the mechanism that
// keeps "packages/shared/src/audit.ts, server execution, status APIs, and
// customer-visible module metadata" from silently diverging (requirement 3 of the
// Wave 2 canonical-module-contract task) without requiring every one of those
// consumers to import server-only adapter code.
//
// Screenshot capture (`lib/evidence/screenshotCapture.ts`) is shared input-acquisition
// infrastructure for the `vision` module, not a module in its own right — it has no
// module ID here and is not counted toward the 27. (The deprecated
// `AuditOrchestrator` never registered it as a module either; it called it inline as a
// preprocessing step before invoking its own vision logic. See P1-43 (Wave 5, out of
// this wave's scope) for the tracked gap where the *canonical* engine's
// `websiteCrawler` does not yet feed `vision` a screenshot, so `vision` cannot
// currently produce output in the primary engine even though it is registered.)
export interface CanonicalAuditModuleDefinition {
  id: string;
  phase: 1 | 2 | 3;
  dependsOn?: readonly string[];
  optional?: boolean;
  timeoutMs: number;
  /** ENABLE_*_AUDIT_MODULE flag key (lib/config/feature-flags.ts) gating this module, if any. */
  rolloutFlag?: string;
}

export const CANONICAL_AUDIT_MODULE_IDS = [
  'website',
  'websiteCrawler',
  'gbp',
  'competitor',
  'techStack',
  'security',
  'emailFinder',
  'coreWebVitals',
  'schemaAnalysis',
  'reputation',
  'social',
  'socialDeep',
  'gbpDeep',
  'seoDeep',
  'accessibility',
  'mobileUX',
  'contentQuality',
  'conversion',
  'citations',
  'paidSearch',
  'backlinks',
  'privacyCompliance',
  'schemaMarkup',
  'keywordGap',
  'videoPresence',
  'competitorStrategy',
  'vision',
] as const;

export type CanonicalAuditModuleId = (typeof CANONICAL_AUDIT_MODULE_IDS)[number];

export const CANONICAL_AUDIT_MODULES: readonly CanonicalAuditModuleDefinition[] = [
  { id: 'website', phase: 1, timeoutMs: 30000 },
  { id: 'websiteCrawler', phase: 1, timeoutMs: 45000 },
  { id: 'gbp', phase: 1, timeoutMs: 20000 },
  { id: 'competitor', phase: 1, timeoutMs: 25000 },
  { id: 'techStack', phase: 1, timeoutMs: 15000 },
  { id: 'security', phase: 1, timeoutMs: 20000, rolloutFlag: 'ENABLE_SECURITY_AUDIT_MODULE' },
  { id: 'emailFinder', phase: 1, optional: true, timeoutMs: 15000 },
  {
    id: 'coreWebVitals',
    phase: 2,
    dependsOn: ['website'],
    timeoutMs: 10000,
    rolloutFlag: 'ENABLE_PERFORMANCE_AUDIT_MODULE',
  },
  { id: 'schemaAnalysis', phase: 2, dependsOn: ['websiteCrawler'], timeoutMs: 20000 },
  { id: 'reputation', phase: 2, dependsOn: ['gbp'], timeoutMs: 30000 },
  { id: 'social', phase: 2, dependsOn: ['website'], timeoutMs: 30000 },
  { id: 'socialDeep', phase: 2, dependsOn: ['social'], optional: true, timeoutMs: 45000 },
  { id: 'gbpDeep', phase: 2, dependsOn: ['gbp'], optional: true, timeoutMs: 45000 },
  {
    id: 'seoDeep',
    phase: 2,
    dependsOn: ['website', 'websiteCrawler'],
    timeoutMs: 60000,
    rolloutFlag: 'ENABLE_SEO_AUDIT_MODULE',
  },
  {
    id: 'accessibility',
    phase: 2,
    dependsOn: ['website'],
    timeoutMs: 45000,
    rolloutFlag: 'ENABLE_ACCESSIBILITY_AUDIT_MODULE',
  },
  { id: 'mobileUX', phase: 2, dependsOn: ['website'], timeoutMs: 45000 },
  { id: 'contentQuality', phase: 2, dependsOn: ['websiteCrawler'], timeoutMs: 60000 },
  { id: 'conversion', phase: 2, dependsOn: ['website'], timeoutMs: 45000 },
  { id: 'citations', phase: 2, dependsOn: ['gbp'], timeoutMs: 30000 },
  { id: 'paidSearch', phase: 2, optional: true, timeoutMs: 30000 },
  { id: 'backlinks', phase: 2, optional: true, timeoutMs: 30000 },
  { id: 'privacyCompliance', phase: 2, dependsOn: ['website'], timeoutMs: 30000 },
  { id: 'schemaMarkup', phase: 2, dependsOn: ['websiteCrawler', 'gbp'], timeoutMs: 30000 },
  { id: 'keywordGap', phase: 2, dependsOn: ['gbp', 'competitor'], timeoutMs: 45000 },
  {
    id: 'videoPresence',
    phase: 2,
    dependsOn: ['competitor'],
    optional: true,
    timeoutMs: 30000,
  },
  {
    id: 'competitorStrategy',
    phase: 3,
    dependsOn: ['competitor', 'seoDeep'],
    timeoutMs: 60000,
  },
  { id: 'vision', phase: 3, dependsOn: ['websiteCrawler'], optional: true, timeoutMs: 60000 },
];

/**
 * Named execution profiles: intentionally-reduced subsets of the canonical 27
 * modules for use cases that cannot or should not run the full audit (e.g. an
 * embeddable widget). Every ID must be a real CanonicalAuditModuleId — this is
 * enforced by validateExecutionProfiles() below and by the architecture contract
 * test. Adding a new reduced-scope entry point should add a profile here rather
 * than hand-picking module calls at the call site (Wave 2 / P1-21).
 */
export const EXECUTION_PROFILES = {
  /** Widget quick-audit (P1-21): website + GBP only, clearly labeled reduced coverage. */
  QUICK_AUDIT: ['website', 'gbp'] as const,
} satisfies Record<string, readonly CanonicalAuditModuleId[]>;

export type ExecutionProfileName = keyof typeof EXECUTION_PROFILES;

export function validateExecutionProfiles(): void {
  const idSet = new Set<string>(CANONICAL_AUDIT_MODULE_IDS);
  for (const [name, ids] of Object.entries(EXECUTION_PROFILES)) {
    for (const id of ids) {
      if (!idSet.has(id)) {
        throw new Error(`Execution profile "${name}" references unknown module "${id}"`);
      }
    }
  }
}

/**
 * Validates the canonical manifest's own internal integrity: exactly 27 unique IDs,
 * every `dependsOn` entry references a real canonical ID, and the dependency graph
 * has no cycles. Called by the architecture contract test at test time (requirement
 * 9 of the Wave 2 canonical-module-contract task); also safe to call at process
 * startup.
 */
export function validateCanonicalModuleManifest(): void {
  const ids = CANONICAL_AUDIT_MODULES.map((m) => m.id);
  const idSet = new Set(ids);

  if (ids.length !== 27) {
    throw new Error(`Canonical module manifest must have exactly 27 modules, got ${ids.length}`);
  }
  if (idSet.size !== ids.length) {
    throw new Error('Canonical module manifest contains duplicate module IDs');
  }

  for (const mod of CANONICAL_AUDIT_MODULES) {
    for (const dep of mod.dependsOn ?? []) {
      if (!idSet.has(dep)) {
        throw new Error(`Canonical module "${mod.id}" depends on unknown module "${dep}"`);
      }
    }
  }

  // Cycle detection (DFS with recursion-stack tracking).
  const byId = new Map(CANONICAL_AUDIT_MODULES.map((m) => [m.id, m]));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(id: string, path: string[]): void {
    if (inStack.has(id)) {
      throw new Error(
        `Cycle detected in canonical module dependency graph: ${[...path, id].join(' -> ')}`
      );
    }
    if (visited.has(id)) return;

    inStack.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      visit(dep, [...path, id]);
    }
    inStack.delete(id);
    visited.add(id);
  }

  for (const id of ids) visit(id, []);
}
