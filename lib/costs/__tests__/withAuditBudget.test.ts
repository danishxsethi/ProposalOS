// @vitest-environment node
/**
 * lib/costs/__tests__/withAuditBudget.test.ts
 *
 * Tests for the withAuditBudget reserve-then-settle wrapper [#8].
 *
 * Tests:
 *   1. Happy path: reserves, runs fn, settles (releases unused portion)
 *   2. THROW PATH: fn throws → reservation is still released (finally fires)
 *   3. Budget exceeded → fn never called, returns { allowed: false }
 *   4. Reservation key has short TTL (MAX_AUDIT_DURATION_SECONDS)
 *   5. Hard-kill simulation: reservation key expires via TTL (self-heals)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, SharedStore, _resetSharedStore } from '@/lib/store/shared';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockStore: ReturnType<typeof createMemoryStore>;
let storeError: Error | null = null;

vi.mock('@/lib/store/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/store/shared')>();
  return {
    ...original,
    getSharedStore: async () => {
      if (storeError) throw storeError;
      return mockStore;
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock redisSpendTracker to use our mockStore directly
vi.mock('@/lib/costs/redisSpendTracker', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/costs/redisSpendTracker')>();
  return {
    ...original,
    // Use the real implementation (it calls getSharedStore which we mocked)
  };
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockStore = createMemoryStore();
  storeError = null;
});

afterEach(() => {
  _resetSharedStore();
});

async function importWrapper() {
  return import('@/lib/costs/withAuditBudget');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthlySpendKey(tenantId: string): string {
  const now = new Date();
  return `spend:${tenantId}:monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getCurrentSpend(tenantId: string): Promise<number> {
  const val = await mockStore.get(getMonthlySpendKey(tenantId));
  return val ? parseFloat(val) : 0;
}

// ─── 1. Happy path ───────────────────────────────────────────────────────────

describe('withAuditBudget — happy path', () => {
  it('reserves, runs fn, settles (releases unused portion)', async () => {
    const { withAuditBudget } = await importWrapper();
    const tenantId = 'tenant-happy';

    const result = await withAuditBudget(tenantId, 'FREE', async () => {
      // Simulate an audit that costs 30 cents (reserved 50 for FREE tier)
      return { actualCostCents: 30, auditId: 'test-audit' };
    });

    expect(result.allowed).toBe(true);
    expect(result.result?.actualCostCents).toBe(30);

    // Monthly spend should be 30 (not 50 — the 20 unused was released)
    const finalSpend = await getCurrentSpend(tenantId);
    expect(finalSpend).toBe(30);
  });
});

// ─── 2. THROW PATH (the critical test) ──────────────────────────────────────

describe('withAuditBudget — throw path', () => {
  it('fn throws → reservation is FULLY released (spend returns to 0)', async () => {
    const { withAuditBudget } = await importWrapper();
    const tenantId = 'tenant-throws';

    // Confirm spend starts at 0
    expect(await getCurrentSpend(tenantId)).toBe(0);

    // Call withAuditBudget where fn throws
    await expect(
      withAuditBudget(tenantId, 'FREE', async () => {
        // Simulate a crash mid-audit
        throw new Error('OOM: audit worker killed');
      })
    ).rejects.toThrow('OOM: audit worker killed');

    // CRITICAL ASSERTION: spend returns to 0 (full reservation released)
    const finalSpend = await getCurrentSpend(tenantId);
    expect(finalSpend).toBe(0);
  });

  it('fn throws after partial work → spend returns to 0 (actual=0 on crash)', async () => {
    const { withAuditBudget } = await importWrapper();
    const tenantId = 'tenant-partial-crash';

    await expect(
      withAuditBudget(tenantId, 'STARTER', async () => {
        // Partial work happened but we crashed before returning
        // The fn never returns actualCostCents, so settle uses 0
        throw new Error('Timeout exceeded');
      })
    ).rejects.toThrow('Timeout exceeded');

    // Spend back to 0 — full reservation released
    expect(await getCurrentSpend(tenantId)).toBe(0);
  });
});

// ─── 3. Budget exceeded ──────────────────────────────────────────────────────

describe('withAuditBudget — budget exceeded', () => {
  it('returns allowed=false without calling fn when cap would be exceeded', async () => {
    const { withAuditBudget } = await importWrapper();
    const tenantId = 'tenant-over-budget';

    // Pre-fill to near cap (FREE = 500 cents cap, 50 per audit)
    const monthKey = getMonthlySpendKey(tenantId);
    await mockStore.set(monthKey, '480', 31 * 24 * 3600);

    let fnCalled = false;
    const result = await withAuditBudget(tenantId, 'FREE', async () => {
      fnCalled = true;
      return { actualCostCents: 30 };
    });

    expect(result.allowed).toBe(false);
    expect(fnCalled).toBe(false); // fn was never invoked
    expect(result.reason).toContain('budget exceeded');

    // Spend unchanged (no reservation was made)
    expect(await getCurrentSpend(tenantId)).toBe(480);
  });
});

// ─── 4. Reservation key has short TTL ────────────────────────────────────────

describe('withAuditBudget — reservation TTL', () => {
  it('reservation key is set with short TTL (≤ 10 min)', async () => {
    const { withAuditBudget } = await importWrapper();
    const tenantId = 'tenant-ttl';

    await withAuditBudget(tenantId, 'FREE', async () => {
      // While running, check that a reservation key exists with short expiry
      const keys = Array.from(mockStore._store.keys());
      const reservationKeys = keys.filter((k) => k.startsWith('reservation:'));
      expect(reservationKeys.length).toBe(1);

      const entry = mockStore._store.get(reservationKeys[0]);
      expect(entry).toBeDefined();

      // TTL should be ~10 minutes (600s) from now
      const ttlMs = entry!.expiresAt - Date.now();
      expect(ttlMs).toBeLessThanOrEqual(10 * 60 * 1000 + 1000); // ≤ 10min + 1s tolerance
      expect(ttlMs).toBeGreaterThan(9 * 60 * 1000); // > 9min (just created)

      return { actualCostCents: 10 };
    });

    // After settle, reservation key is deleted
    const keys = Array.from(mockStore._store.keys());
    const remainingReservations = keys.filter((k) => k.startsWith('reservation:'));
    expect(remainingReservations.length).toBe(0);
  });
});

// ─── 5. Hard-kill simulation ─────────────────────────────────────────────────

describe('withAuditBudget — hard-kill self-heal', () => {
  it('reservation key expires automatically (simulating hard-kill)', async () => {
    const { withAuditBudget } = await importWrapper();
    const tenantId = 'tenant-killed';

    // Manually simulate what happens: reserve is made, then process dies
    // We can't actually kill the process, but we can verify the TTL-based
    // self-healing by checking the reservation key expires

    // Set up a reservation key with 1-second TTL (simulating short expiry)
    await mockStore.set('reservation:tenant-killed:simulated', '50', 1);

    // Key exists now
    const val = await mockStore.get('reservation:tenant-killed:simulated');
    expect(val).toBe('50');

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1100));

    // Key expired (self-healed)
    const expired = await mockStore.get('reservation:tenant-killed:simulated');
    expect(expired).toBeNull();
  });
});
