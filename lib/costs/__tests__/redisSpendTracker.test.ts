// @vitest-environment node
/**
 * lib/costs/__tests__/redisSpendTracker.test.ts
 *
 * Tests for the Redis-backed global spend tracker [#8].
 *
 * Tests:
 *   1. Concurrent increments from multiple "instances" never exceed cap
 *   2. Single tenant hitting the cap gets blocked
 *   3. Redis-down → fail-closed with local fallback at 10% cap
 *   4. Redis recovery → local fallback cleared, Redis is source of truth
 *   5. Daily audit limit enforced atomically
 *   6. TTL keys expire (monthly/daily reset)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, SharedStore, _resetSharedStore } from '@/lib/store/shared';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockStore: SharedStore & { _store: Map<string, { value: string; expiresAt: number }> };
let storeError: Error | null = null; // Set this to simulate Redis failure

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

// Fresh import each test (picks up mock state)
async function importTracker() {
  const mod = await import('@/lib/costs/redisSpendTracker');
  mod._resetLocalFallback();
  return mod;
}

// ─── 1. Concurrent increments never exceed cap ───────────────────────────────

describe('Concurrency: multiple instances racing against cap', () => {
  it('total spend never exceeds the monthly budget cap', async () => {
    const { checkAndAddSpend } = await importTracker();

    const tenantId = 'tenant-concurrent';
    const tier = 'FREE'; // 500 cents cap
    const capCents = 500;
    const incrementCents = 50; // Each "instance" tries to add 50 cents

    // Simulate 15 concurrent requests (total 750 > cap 500)
    const promises = Array.from({ length: 15 }, () =>
      checkAndAddSpend(tenantId, incrementCents, tier)
    );

    const results = await Promise.all(promises);

    // Count how many were allowed
    const allowed = results.filter((r) => r.allowed);
    const blocked = results.filter((r) => !r.allowed);

    // Exactly 10 should be allowed (10 * 50 = 500 = cap), 5 blocked
    expect(allowed.length).toBe(10);
    expect(blocked.length).toBe(5);

    // No allowed result should show spend exceeding cap
    for (const r of allowed) {
      expect(r.currentSpendCents).toBeLessThanOrEqual(capCents);
    }

    // Final spend in store should be exactly at cap
    const finalVal = await mockStore.get(
      `spend:${tenantId}:monthly:${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
    );
    expect(parseFloat(finalVal!)).toBe(500);
  });

  it('fractional increments are handled correctly', async () => {
    const { checkAndAddSpend } = await importTracker();

    const tenantId = 'tenant-fractional';
    const tier = 'FREE'; // 500 cents
    const increment = 3.7; // fractional

    // 135 * 3.7 = 499.5 (under cap), 136th = 503.2 (over cap)
    const promises = Array.from({ length: 136 }, () => checkAndAddSpend(tenantId, increment, tier));

    const results = await Promise.all(promises);
    const allowed = results.filter((r) => r.allowed);

    // 135 allowed (499.5 <= 500), 136th blocked (503.2 > 500)
    expect(allowed.length).toBe(135);

    // Total spend should be 499.5
    const finalVal = await mockStore.get(
      `spend:${tenantId}:monthly:${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
    );
    expect(parseFloat(finalVal!)).toBeCloseTo(499.5, 1);
  });
});

// ─── 2. Cap enforcement ──────────────────────────────────────────────────────

describe('Cap enforcement', () => {
  it('blocks when spend would exceed monthly budget', async () => {
    const { checkAndAddSpend } = await importTracker();

    const tenantId = 'tenant-cap';
    const tier = 'FREE'; // 500 cents

    // First: spend 490 cents (allowed)
    const r1 = await checkAndAddSpend(tenantId, 490, tier);
    expect(r1.allowed).toBe(true);
    expect(r1.currentSpendCents).toBe(490);

    // Second: try to spend 20 more (490 + 20 = 510 > 500) → blocked
    const r2 = await checkAndAddSpend(tenantId, 20, tier);
    expect(r2.allowed).toBe(false);
    expect(r2.currentSpendCents).toBe(490); // Not incremented
  });

  it('allows spend exactly at the cap boundary', async () => {
    const { checkAndAddSpend } = await importTracker();

    const tenantId = 'tenant-boundary';
    const tier = 'FREE'; // 500 cents

    // Spend exactly 500 (at cap, should be allowed)
    const r1 = await checkAndAddSpend(tenantId, 500, tier);
    expect(r1.allowed).toBe(true);
    expect(r1.currentSpendCents).toBe(500);

    // Any additional spend → blocked
    const r2 = await checkAndAddSpend(tenantId, 1, tier);
    expect(r2.allowed).toBe(false);
  });
});

// ─── 3. Redis-down → fail-closed with local fallback ─────────────────────────

describe('Redis-down policy: fail-closed with local sub-cap', () => {
  it('allows spend up to LOCAL_FALLBACK_FRACTION (10%) of cap when Redis is down', async () => {
    const { checkAndAddSpend } = await importTracker();

    storeError = new Error('Redis connection refused');

    const tenantId = 'tenant-redis-down';
    const tier = 'FREE'; // 500 cents → local cap = 50 cents (10%)

    // 50 cents should be allowed under local fallback
    const r1 = await checkAndAddSpend(tenantId, 40, tier);
    expect(r1.allowed).toBe(true);

    // 10 more = 50 total (at local cap boundary)
    const r2 = await checkAndAddSpend(tenantId, 10, tier);
    expect(r2.allowed).toBe(true);

    // 1 more = 51 > 50 → blocked
    const r3 = await checkAndAddSpend(tenantId, 1, tier);
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toContain('local fallback cap');
  });

  it('does NOT take down all audits — only blocks when local cap exceeded', async () => {
    const { checkAndAddSpend } = await importTracker();

    storeError = new Error('Redis timeout');

    // First request from a fresh tenant should succeed (under 10% local cap)
    const r1 = await checkAndAddSpend('tenant-fresh', 5, 'AGENCY'); // 200000 * 0.1 = 20000 local
    expect(r1.allowed).toBe(true);
  });
});

// ─── 4. Redis recovery ───────────────────────────────────────────────────────

describe('Redis recovery', () => {
  it('clears local fallback when Redis recovers', async () => {
    const { checkAndAddSpend } = await importTracker();

    const tenantId = 'tenant-recovery';
    const tier = 'FREE'; // 500 cap, 50 local

    // Redis down — spend 30 locally
    storeError = new Error('Redis down');
    await checkAndAddSpend(tenantId, 30, tier);

    // Redis recovers — should use Redis (fresh start, 0 spend in Redis)
    storeError = null;
    const r = await checkAndAddSpend(tenantId, 100, tier);
    expect(r.allowed).toBe(true);
    expect(r.currentSpendCents).toBe(100); // Redis only, not 130
  });
});

// ─── 5. Daily audit limit ────────────────────────────────────────────────────

describe('Daily audit limit', () => {
  it('enforces daily audit count limit', async () => {
    const { checkAndIncrementDailyAudit } = await importTracker();

    const tenantId = 'tenant-daily';
    const tier = 'FREE'; // 10 audits/day

    // First 10 should be allowed
    for (let i = 0; i < 10; i++) {
      const r = await checkAndIncrementDailyAudit(tenantId, tier);
      expect(r.allowed).toBe(true);
      expect(r.todayCount).toBe(i + 1);
    }

    // 11th → blocked
    const r11 = await checkAndIncrementDailyAudit(tenantId, tier);
    expect(r11.allowed).toBe(false);
    expect(r11.todayCount).toBe(11);
  });

  it('daily limit allows (soft guardrail) when Redis is down', async () => {
    const { checkAndIncrementDailyAudit } = await importTracker();

    storeError = new Error('Redis timeout');

    // Daily is a soft guardrail — allows on Redis failure
    const r = await checkAndIncrementDailyAudit('tenant-x', 'FREE');
    expect(r.allowed).toBe(true);
    expect(r.todayCount).toBe(-1); // indicates unknown
  });
});

// ─── 6. TTL-based reset ──────────────────────────────────────────────────────

describe('TTL-based key expiry (window reset)', () => {
  it('monthly key has TTL set on first write', async () => {
    const { checkAndAddSpend } = await importTracker();

    await checkAndAddSpend('tenant-ttl', 10, 'FREE');

    // Check that the key exists with an expiry
    const now = new Date();
    const monthKey = `spend:tenant-ttl:monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const entry = mockStore._store.get(monthKey);
    expect(entry).toBeDefined();
    expect(entry!.expiresAt).toBeGreaterThan(Date.now());

    // Expiry should be roughly end-of-month (within 31 days)
    const maxExpiry = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(entry!.expiresAt).toBeLessThan(maxExpiry);
  });

  it('daily key has TTL until midnight UTC', async () => {
    const { checkAndIncrementDailyAudit } = await importTracker();

    await checkAndIncrementDailyAudit('tenant-ttl-daily', 'FREE');

    const now = new Date();
    const dayKey = `spend:tenant-ttl-daily:daily:${now.toISOString().slice(0, 10)}`;
    const entry = mockStore._store.get(dayKey);
    expect(entry).toBeDefined();

    // Expiry should be within 24 hours
    const maxExpiry = Date.now() + 24 * 60 * 60 * 1000;
    expect(entry!.expiresAt).toBeLessThanOrEqual(maxExpiry);
    expect(entry!.expiresAt).toBeGreaterThan(Date.now());
  });
});
