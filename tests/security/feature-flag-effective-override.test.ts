// @vitest-environment node
/**
 * tests/security/feature-flag-effective-override.test.ts
 *
 * Wave 2 (P2-25): proves that a DB-persisted feature-flag override (written by
 * app/api/admin/feature-flags/route.ts) actually changes what module gating sees,
 * instead of only being reflected in the admin API's own read response.
 *
 * Before this fix: FEATURE_FLAGS was a plain object computed once from
 * process.env at import time; isFeatureEnabled() (used by
 * lib/audit/runner.ts's module gate) could never see a runtime DB override —
 * an admin toggle had zero effect on which modules actually ran.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  featureFlagFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    featureFlag: {
      findMany: mocks.featureFlagFindMany,
    },
  },
}));

describe('getEffectiveFeatureFlags / isFeatureEnabledEffective (P2-25)', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.featureFlagFindMany.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('falls back to the static env-derived default when no DB override exists', async () => {
    mocks.featureFlagFindMany.mockResolvedValue([]);
    const { isFeatureEnabledEffective } = await import('@/lib/config/feature-flags');

    // ENABLE_SECURITY_AUDIT_MODULE defaults to true (opt-out via env only).
    expect(await isFeatureEnabledEffective('ENABLE_SECURITY_AUDIT_MODULE')).toBe(true);
  });

  it('a DB override flips the effective value seen by module gating', async () => {
    mocks.featureFlagFindMany.mockResolvedValue([
      { key: 'ENABLE_SECURITY_AUDIT_MODULE', value: 'false' },
    ]);
    const { isFeatureEnabledEffective } = await import('@/lib/config/feature-flags');

    expect(await isFeatureEnabledEffective('ENABLE_SECURITY_AUDIT_MODULE')).toBe(false);
  });

  it('invalidating the cache picks up a newly-written override on the next read (admin toggle path)', async () => {
    mocks.featureFlagFindMany.mockResolvedValue([]);
    const { isFeatureEnabledEffective, invalidateEffectiveFeatureFlagsCache } =
      await import('@/lib/config/feature-flags');

    expect(await isFeatureEnabledEffective('ENABLE_ACCESSIBILITY_AUDIT_MODULE')).toBe(true);

    // Simulate the admin route's write path: persist an override, then invalidate.
    mocks.featureFlagFindMany.mockResolvedValue([
      { key: 'ENABLE_ACCESSIBILITY_AUDIT_MODULE', value: 'false' },
    ]);
    invalidateEffectiveFeatureFlagsCache();

    expect(await isFeatureEnabledEffective('ENABLE_ACCESSIBILITY_AUDIT_MODULE')).toBe(false);
  });

  it('ignores an unknown/stale DB flag key instead of injecting it (fails safe)', async () => {
    mocks.featureFlagFindMany.mockResolvedValue([
      { key: 'SOME_RETIRED_FLAG_NO_LONGER_REAL', value: 'true' },
    ]);
    const { getEffectiveFeatureFlags } = await import('@/lib/config/feature-flags');

    const flags = await getEffectiveFeatureFlags();
    expect(flags).not.toHaveProperty('SOME_RETIRED_FLAG_NO_LONGER_REAL');
  });

  it('falls back to static defaults (does not throw) when the DB is unavailable', async () => {
    mocks.featureFlagFindMany.mockRejectedValue(new Error('DB unreachable'));
    const { isFeatureEnabledEffective } = await import('@/lib/config/feature-flags');

    await expect(isFeatureEnabledEffective('ENABLE_SEO_AUDIT_MODULE')).resolves.toBe(true);
  });
});
