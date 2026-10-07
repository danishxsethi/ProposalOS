/**
 * P1-05 / P2-18 regression tests for the tenant-scoping primitives introduced in Wave 1:
 * - runScopedToOwnerTenant (lib/tenant/context.ts): resolve-owner-tenant-then-scope pattern
 *   used to replace the unscoped `lib/db.ts` client for ID-only entry points.
 * - withSystemDbBypass (lib/db.ts): explicit, reason-required, audited bypass wrapper.
 *
 * These exercise the REAL AsyncLocalStorage implementation (no mocking) since the logic
 * under test is the tenant-context propagation itself, not any I/O.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  getTenantIdFromStore,
  getTenantRuntimeContextFromStore,
  runScopedToOwnerTenant,
  runWithTenantAsync,
  runWithTenantBypass,
} from '@/lib/tenant/context';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('P1-05: runScopedToOwnerTenant', () => {
  it('resolves the owner tenant via a bypassed lookup, then runs fn with real tenant context set', async () => {
    let tenantIdSeenInFn: string | null = null;

    const result = await runScopedToOwnerTenant(
      'test:resolve-record-tenant',
      async () => TENANT_A, // simulated narrow lookup (id -> tenantId only)
      async () => {
        tenantIdSeenInFn = getTenantIdFromStore();
        return 'ok';
      }
    );

    expect(result).toBe('ok');
    expect(tenantIdSeenInFn).toBe(TENANT_A);
  });

  it('the lookup callback itself runs under bypassRls (not a real tenant), then fn runs scoped', async () => {
    let bypassDuringLookup: boolean | null = null;

    await runScopedToOwnerTenant(
      'test:resolve-record-tenant',
      async () => {
        bypassDuringLookup = getTenantRuntimeContextFromStore().bypassRls;
        return TENANT_A;
      },
      async () => 'ok'
    );

    expect(bypassDuringLookup).toBe(true);
  });

  it('throws and never invokes fn when the lookup cannot resolve an owning tenant', async () => {
    const fn = vi.fn(async () => 'should not run');

    await expect(
      runScopedToOwnerTenant('test:resolve-record-tenant', async () => null, fn)
    ).rejects.toThrow(/could not resolve owning tenant/);

    expect(fn).not.toHaveBeenCalled();
  });

  it('does not leak bypassRls into fn — fn runs with bypassRls false under the real tenant', async () => {
    let bypassDuringFn: boolean | null = null;

    await runScopedToOwnerTenant(
      'test:resolve-record-tenant',
      async () => TENANT_A,
      async () => {
        bypassDuringFn = getTenantRuntimeContextFromStore().bypassRls;
        return 'ok';
      }
    );

    expect(bypassDuringFn).toBe(false);
  });
});

describe('P1-05: nested system-bypass inside an existing tenant context restores correctly', () => {
  it('a nested bypass call does not leak into the outer tenant-scoped continuation', async () => {
    const seenDuringOuter: Array<{ phase: string; tenantId: string | null; bypass: boolean }> = [];

    await runWithTenantAsync(TENANT_A, async () => {
      seenDuringOuter.push({
        phase: 'before-nested-bypass',
        tenantId: getTenantIdFromStore(),
        bypass: getTenantRuntimeContextFromStore().bypassRls,
      });

      await runWithTenantBypass('test:nested-global-check', async () => {
        seenDuringOuter.push({
          phase: 'inside-nested-bypass',
          tenantId: getTenantIdFromStore(),
          bypass: getTenantRuntimeContextFromStore().bypassRls,
        });
      });

      seenDuringOuter.push({
        phase: 'after-nested-bypass',
        tenantId: getTenantIdFromStore(),
        bypass: getTenantRuntimeContextFromStore().bypassRls,
      });
    });

    expect(seenDuringOuter).toEqual([
      { phase: 'before-nested-bypass', tenantId: TENANT_A, bypass: false },
      { phase: 'inside-nested-bypass', tenantId: TENANT_A, bypass: true },
      { phase: 'after-nested-bypass', tenantId: TENANT_A, bypass: false },
    ]);
  });
});

describe('P1-05: runWithTenantBypass requires a real reason (existing contract, re-verified)', () => {
  it('rejects an empty reason', async () => {
    await expect(runWithTenantBypass('', async () => 'x')).rejects.toThrow(/non-empty reason/);
  });

  it('rejects a whitespace-only reason', async () => {
    await expect(runWithTenantBypass('   ', async () => 'x')).rejects.toThrow(/non-empty reason/);
  });
});
