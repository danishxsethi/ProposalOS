/**
 * Critical-completion module subset for lib/audit/runner.ts's completeness guardrail.
 *
 * P1-03: this is NOT the canonical/complete audit module list — that is
 * MODULE_REGISTRY (lib/audit/runner.ts, 27 modules). See CRITICAL_COMPLETION_MODULES's
 * doc comment in packages/shared/src/audit.ts for the full explanation of the naming
 * fix and why full module-count reconciliation is deferred to Wave 16.
 */
export {
  CRITICAL_COMPLETION_MODULES as CANONICAL_MODULES,
  type CriticalCompletionModuleId as CanonicalModuleId,
} from '@shared/audit';
