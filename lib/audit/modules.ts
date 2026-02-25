/**
 * Canonical audit module list. Single and batch audits MUST use this exact set.
 * Do not add/remove modules without updating both app/api/audit and lib/audit/runner.
 */
export const CANONICAL_MODULES = [
    'website',
    'gbp',
    'competitor',
    'reputation',
    'social',
] as const;

export type CanonicalModuleId = (typeof CANONICAL_MODULES)[number];
