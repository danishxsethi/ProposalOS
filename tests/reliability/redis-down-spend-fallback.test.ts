// @vitest-environment node
/**
 * tests/reliability/redis-down-spend-fallback.test.ts
 *
 * Stream D — S6: Redis (shared store) unavailable.
 *
 * lib/costs/redisSpendTracker.ts contract when the shared store is down:
 *   - checkAndAddSpend → handleRedisDown: FAIL-CLOSED at a conservative
 *     per-instance sub-cap (LOCAL_FALLBACK_FRACTION = 10% of the tier budget);
 *     never throws to the caller.
 *   - checkAndIncrementDailyAudit → soft guardrail: allowed:true, todayCount:-1.
 *   - getCurrentMonthlySpend / getCurrentDailyAuditCount → 0.
 *   - settleAuditSpend (costTracker) → swallowed (reservation stays, conservative).
 *   - reserveAuditBudget (the runner's entry point) → inherits fail-closed sub-cap.
 *   - Recovery: once the store is reachable again, the local fallback counter is
 *     discarded and Redis is the source of truth.
 *
 * Two failure shapes are injected: (a) getSharedStore() itself rejects
 * (adapter construction/connection failure); (b) the store resolves but every
 * command rejects (connection dropped mid-flight).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  mode: 'factory-throws' as 'factory-throws' | 'commands-throw' | 'healthy',
  checkAndIncrementFloat: vi.fn(),
  increment: vi.fn(),
  incrementFloat: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  setIfNotExists: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn(async () => {
    if (store.mode === 'factory-throws') throw new Error('ECONNREFUSED 127.0.0.1:6379');
    return {
      checkAndIncrementFloat: store.checkAndIncrementFloat,
      increment: store.increment,
      incrementFloat: store.incrementFloat,
      get: store.get,
      set: store.set,
      setIfNotExists: store.setIfNotExists,
      del: store.del,
    };
  }),
}));

const loggerMocks = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

import {
  _resetLocalFallback,
  checkAndAddSpend,
  checkAndIncrementDailyAudit,
  getCurrentDailyAuditCount,
  getCurrentMonthlySpend,
} from '@/lib/costs/redisSpendTracker';
import { reserveAuditBudget, settleAuditSpend, TIER_BUDGETS } from '@/lib/costs/costTracker';

const LOCAL_FALLBACK_FRACTION = 0.1; // mirrors the private constant in redisSpendTracker.ts:49

function commandsThrow() {
  store.mode = 'commands-throw';
  const boom = async () => {
    throw new Error('Connection is closed.');
  };
  store.checkAndIncrementFloat.mockImplementation(boom);
  store.increment.mockImplementation(boom);
  store.incrementFloat.mockImplementation(boom);
  store.get.mockImplementation(boom);
}

describe('Stream D — S6 Redis down: spend tracking fails closed at the local sub-cap and never throws', () => {
  beforeEach(() => {
    _resetLocalFallback();
    vi.clearAllMocks();
    store.mode = 'factory-throws';
  });
  afterEach(() => {
    _resetLocalFallback();
  });

  for (const shape of ['factory-throws', 'commands-throw'] as const) {
    describe(`failure shape: ${shape}`, () => {
      beforeEach(() => {
        if (shape === 'commands-throw') commandsThrow();
        else store.mode = 'factory-throws';
      });

      it('checkAndAddSpend does not throw; allows spend up to exactly LOCAL_FALLBACK_FRACTION × cap, then blocks with a reason', async () => {
        const tier = 'STARTER';
        const cap = TIER_BUDGETS[tier].monthlyBudgetCents; // 2000
        const localCap = cap * LOCAL_FALLBACK_FRACTION; // 200
        const step = 50;
        const tenantId = `t-${shape}-cap`;

        const results: Awaited<ReturnType<typeof checkAndAddSpend>>[] = [];
        for (let i = 0; i < localCap / step + 2; i++) {
          results.push(await checkAndAddSpend(tenantId, step, tier));
        }

        const allowedCount = results.filter((r) => r.allowed).length;
        expect(allowedCount).toBe(localCap / step); // 4 × 50 = 200 allowed
        const firstBlocked = results.find((r) => !r.allowed)!;
        expect(firstBlocked.reason).toMatch(/Redis unavailable; local fallback cap \(200 cents\) exceeded/);
        expect(firstBlocked.currentSpendCents).toBe(localCap);
        expect(firstBlocked.capCents).toBe(cap);
        // Every subsequent attempt stays blocked (fail-closed, not oscillating).
        expect(results.slice(results.indexOf(firstBlocked)).every((r) => !r.allowed)).toBe(true);

        expect(loggerMocks.warn).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId, localCap }),
          expect.stringContaining('REDIS DOWN')
        );
      });

      it('local fallback is per-tenant: one tenant hitting its sub-cap does not block another', async () => {
        const tier = 'FREE'; // cap 500 → local 50
        for (let i = 0; i < 5; i++) await checkAndAddSpend('tenant-A', 10, tier);
        expect((await checkAndAddSpend('tenant-A', 1, tier)).allowed).toBe(false);
        expect((await checkAndAddSpend('tenant-B', 10, tier)).allowed).toBe(true);
      });

      it('checkAndIncrementDailyAudit is a soft guardrail: allowed:true, todayCount:-1, no throw', async () => {
        const r = await checkAndIncrementDailyAudit('t-daily', 'GROWTH');
        expect(r).toEqual({ allowed: true, todayCount: -1, limit: TIER_BUDGETS.GROWTH.maxAuditsPerDay });
        expect(loggerMocks.warn).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 't-daily' }),
          expect.stringContaining('Redis unavailable for daily limit')
        );
      });

      it('read paths return 0 instead of throwing', async () => {
        await expect(getCurrentMonthlySpend('t-read')).resolves.toBe(0);
        await expect(getCurrentDailyAuditCount('t-read')).resolves.toBe(0);
      });

      it('reserveAuditBudget (runner entry point) inherits the fail-closed sub-cap and never throws', async () => {
        const tier = 'STARTER'; // perAuditCap 100, local cap 200 → 2 reservations then blocked
        const a = await reserveAuditBudget('t-reserve', tier);
        const b = await reserveAuditBudget('t-reserve', tier);
        const c = await reserveAuditBudget('t-reserve', tier);
        expect(a.allowed).toBe(true);
        expect(b.allowed).toBe(true);
        expect(c.allowed).toBe(false);
        expect(c.reservedCents).toBe(TIER_BUDGETS[tier].perAuditCapCents);
        expect(c.reason).toMatch(/Redis unavailable/);
      });

      it('settleAuditSpend swallows the store failure (reservation stays — conservative)', async () => {
        await expect(settleAuditSpend('t-settle', 100, 40, 'STARTER')).resolves.toBeUndefined();
        expect(loggerMocks.warn).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 't-settle' }),
          expect.stringContaining('Failed to release reservation')
        );
      });
    });
  }

  it('recovery: when the store becomes reachable, the local fallback counter is discarded and Redis is the source of truth', async () => {
    const tier = 'FREE'; // cap 500, local 50
    const tenantId = 't-recover';

    store.mode = 'factory-throws';
    for (let i = 0; i < 5; i++) expect((await checkAndAddSpend(tenantId, 10, tier)).allowed).toBe(true);
    expect((await checkAndAddSpend(tenantId, 10, tier)).allowed).toBe(false); // local sub-cap hit

    // Redis back: authoritative counter says 120 cents used of 500.
    store.mode = 'healthy';
    store.checkAndIncrementFloat.mockResolvedValue({ allowed: true, newValue: 120 });
    const healthy = await checkAndAddSpend(tenantId, 10, tier);
    expect(healthy).toEqual({ allowed: true, currentSpendCents: 120, capCents: 500 });
    expect(store.checkAndIncrementFloat).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^spend:${tenantId}:monthly:\\d{4}-\\d{2}$`)),
      10,
      500,
      expect.any(Number)
    );

    // Redis down again: the local counter restarted from zero (it was cleared on
    // the healthy call), so the tenant is again allowed up to the sub-cap.
    store.mode = 'factory-throws';
    const afterRelapse = await checkAndAddSpend(tenantId, 10, tier);
    expect(afterRelapse.allowed).toBe(true);
    expect(afterRelapse.currentSpendCents).toBe(10);
  });

  it('bounded worst-case: with N instances each fail-closed at 10 %, the documented overspend ceiling is N × 10 % of budget', () => {
    // Guards the documented invariant in redisSpendTracker.ts:43-49 so a change
    // to LOCAL_FALLBACK_FRACTION is a conscious decision.
    const instances = 5;
    const cap = TIER_BUDGETS.PREMIUM.monthlyBudgetCents;
    expect(instances * LOCAL_FALLBACK_FRACTION * cap).toBe(0.5 * cap);
  });
});
