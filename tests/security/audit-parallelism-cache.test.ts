// @vitest-environment node
/**
 * tests/security/audit-parallelism-cache.test.ts
 *
 * Task #12: Audit latency reduction — parallelism + module cache.
 *
 * Covers:
 *   1. runWithConcurrency caps in-flight tasks
 *   2. runWithConcurrency settles all tasks (no early termination)
 *   3. Parallel execution beats sequential wall-clock time (mock benchmark)
 *   4. Module cache: hit returns cached value without calling fetcher
 *   5. Module cache: miss calls fetcher and stores result
 *   6. Module cache: different inputs produce different keys
 *   7. Module cache: different versions produce different keys (invalidation)
 *   8. Module cache: corrupted JSON entry is purged and treated as miss
 *   9. Module cache: SharedStore failure does not block caller
 *  10. invalidateCache deletes entry
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runWithConcurrency } from '@/lib/audit/concurrency';
import {
  buildCacheKey,
  getCached,
  invalidateCache,
  MODULE_CACHE_TTL,
  setCached,
  withModuleCache,
} from '@/lib/cache/moduleCache';
import { _resetSharedStore, createMemoryStore, getSharedStore } from '@/lib/store/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ─── runWithConcurrency ───────────────────────────────────────────────────────

describe('runWithConcurrency — bounded parallelism', () => {
  it('caps in-flight tasks at the configured limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(20, undefined);
      inFlight--;
      return 'ok';
    });

    await runWithConcurrency(tasks, { limit: 3 });

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(0);
  });

  it('settles all tasks even when some reject (Promise.allSettled-style)', async () => {
    const tasks = [
      async () => 'a',
      async () => {
        throw new Error('boom');
      },
      async () => 'c',
    ];

    const results = await runWithConcurrency(tasks, { limit: 2 });

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'a' });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'c' });
  });

  it('preserves result ordering (index-based, not completion-based)', async () => {
    // Out-of-order completion — long task at index 0
    const tasks = [
      async () => delay(40, 'first'),
      async () => delay(10, 'second'),
      async () => delay(20, 'third'),
    ];

    const results = await runWithConcurrency(tasks, { limit: 3 });

    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('handles empty task list', async () => {
    const results = await runWithConcurrency([], { limit: 4 });
    expect(results).toEqual([]);
  });

  it('runs sequentially when limit=1', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const tasks = Array.from({ length: 5 }, () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10, undefined);
      inFlight--;
    });

    await runWithConcurrency(tasks, { limit: 1 });
    expect(maxInFlight).toBe(1);
  });
});

// ─── Mock benchmark: parallel beats sequential ─────────────────────────────────

describe('runWithConcurrency — mock benchmark', () => {
  it('parallel execution is faster than sequential (mocked latency)', async () => {
    // 6 modules, each "takes" 50ms (mocked, no real I/O)
    const taskCount = 6;
    const taskLatencyMs = 50;

    const makeTasks = () =>
      Array.from({ length: taskCount }, () => async () => delay(taskLatencyMs, 'done'));

    // Sequential (limit=1) — expect ~6 × 50ms = ~300ms
    const seqStart = Date.now();
    await runWithConcurrency(makeTasks(), { limit: 1 });
    const seqMs = Date.now() - seqStart;

    // Parallel (limit=6) — expect ~50ms (one wave)
    const parStart = Date.now();
    await runWithConcurrency(makeTasks(), { limit: 6 });
    const parMs = Date.now() - parStart;

    // Parallel must be at least 2x faster than sequential.  Use a generous
    // ratio to keep the test reliable under CI noise.
    expect(parMs).toBeLessThan(seqMs / 2);
    expect(parMs).toBeLessThan(taskLatencyMs * 3); // headroom for scheduler jitter

    // Log for visibility — captured by reporter
    // eslint-disable-next-line no-console
    console.info(`[benchmark] sequential=${seqMs}ms parallel=${parMs}ms ratio=${(seqMs / parMs).toFixed(2)}x`);
  });
});

// ─── Module Cache ─────────────────────────────────────────────────────────────

describe('moduleCache — keys and versioning', () => {
  it('produces stable keys for same input', () => {
    const k1 = buildCacheKey({
      module: 'places-text-search',
      version: 1,
      input: { businessName: 'Acme', city: 'Regina' },
    });
    const k2 = buildCacheKey({
      module: 'places-text-search',
      version: 1,
      input: { city: 'Regina', businessName: 'Acme' }, // different key order
    });
    expect(k1).toBe(k2);
  });

  it('produces different keys for different inputs', () => {
    const k1 = buildCacheKey({
      module: 'places-text-search',
      version: 1,
      input: { businessName: 'Acme', city: 'Regina' },
    });
    const k2 = buildCacheKey({
      module: 'places-text-search',
      version: 1,
      input: { businessName: 'Beta', city: 'Regina' },
    });
    expect(k1).not.toBe(k2);
  });

  it('produces different keys for different versions (invalidation)', () => {
    const v1 = buildCacheKey({
      module: 'lighthouse',
      version: 1,
      input: { url: 'https://example.com' },
    });
    const v2 = buildCacheKey({
      module: 'lighthouse',
      version: 2,
      input: { url: 'https://example.com' },
    });
    expect(v1).not.toBe(v2);
  });

  it('exposes per-module recommended TTLs', () => {
    expect(MODULE_CACHE_TTL.LIGHTHOUSE).toBeGreaterThan(0);
    expect(MODULE_CACHE_TTL.PLACES_TEXT_SEARCH).toBeGreaterThan(0);
    expect(MODULE_CACHE_TTL.SERP).toBeGreaterThan(0);
    // Lighthouse + Places use 24h; SERP uses shorter
    expect(MODULE_CACHE_TTL.LIGHTHOUSE).toBeGreaterThanOrEqual(MODULE_CACHE_TTL.SERP);
  });
});

describe('moduleCache — get/set with in-memory store', () => {
  beforeEach(() => {
    _resetSharedStore();
  });

  afterEach(() => {
    _resetSharedStore();
  });

  it('returns miss when key has not been stored', async () => {
    const result = await getCached<string>({
      module: 'places-text-search',
      version: 1,
      input: { url: 'https://example.com' },
    });
    expect(result.hit).toBe(false);
    expect(result.value).toBeNull();
  });

  it('returns hit after set', async () => {
    const key = {
      module: 'places-text-search',
      version: 1,
      input: { url: 'https://example.com' },
    };

    await setCached(key, { placeId: 'XYZ' }, { ttlSeconds: 3600 });

    const result = await getCached<{ placeId: string }>(key);
    expect(result.hit).toBe(true);
    expect(result.value).toEqual({ placeId: 'XYZ' });
  });

  it('isolates entries by module name', async () => {
    await setCached(
      { module: 'mod-a', version: 1, input: { id: '1' } },
      { value: 'A' },
      { ttlSeconds: 60 }
    );
    await setCached(
      { module: 'mod-b', version: 1, input: { id: '1' } },
      { value: 'B' },
      { ttlSeconds: 60 }
    );

    const a = await getCached<{ value: string }>({ module: 'mod-a', version: 1, input: { id: '1' } });
    const b = await getCached<{ value: string }>({ module: 'mod-b', version: 1, input: { id: '1' } });

    expect(a.value).toEqual({ value: 'A' });
    expect(b.value).toEqual({ value: 'B' });
  });

  it('isolates entries by version (bump invalidates old)', async () => {
    await setCached(
      { module: 'lighthouse', version: 1, input: { url: 'https://a.com' } },
      { score: 80 },
      { ttlSeconds: 60 }
    );

    const v1 = await getCached<{ score: number }>({
      module: 'lighthouse',
      version: 1,
      input: { url: 'https://a.com' },
    });
    expect(v1.hit).toBe(true);

    // Bump version
    const v2 = await getCached<{ score: number }>({
      module: 'lighthouse',
      version: 2,
      input: { url: 'https://a.com' },
    });
    expect(v2.hit).toBe(false);
  });

  it('purges corrupted entries and returns miss', async () => {
    const key = {
      module: 'lighthouse',
      version: 1,
      input: { url: 'https://corrupt.com' },
    };
    const fullKey = buildCacheKey(key);

    // Manually inject corrupted JSON via the in-memory store
    const store = await getSharedStore();
    await store.set(fullKey, '{not valid json', 60);

    const result = await getCached(key);
    expect(result.hit).toBe(false);

    // Verify the corrupted entry was deleted
    const raw = await store.get(fullKey);
    expect(raw).toBeNull();
  });

  it('invalidateCache deletes a specific entry', async () => {
    const key = { module: 'lighthouse', version: 1, input: { url: 'https://x.com' } };
    await setCached(key, { score: 90 }, { ttlSeconds: 60 });

    expect((await getCached(key)).hit).toBe(true);
    await invalidateCache(key);
    expect((await getCached(key)).hit).toBe(false);
  });
});

describe('withModuleCache — hit skips fetcher', () => {
  beforeEach(() => {
    _resetSharedStore();
  });

  it('calls fetcher on miss and stores result', async () => {
    const fetcher = vi.fn().mockResolvedValue({ score: 85 });

    const result = await withModuleCache(
      { module: 'lighthouse', version: 1, input: { url: 'https://a.com' } },
      { ttlSeconds: 60 },
      fetcher
    );

    expect(result).toEqual({ score: 85 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not call fetcher on hit', async () => {
    const key = { module: 'lighthouse', version: 1, input: { url: 'https://b.com' } };
    await setCached(key, { score: 70 }, { ttlSeconds: 60 });

    const fetcher = vi.fn().mockResolvedValue({ score: 999 });

    const result = await withModuleCache(key, { ttlSeconds: 60 }, fetcher);

    expect(result).toEqual({ score: 70 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('moduleCache — store failure resilience', () => {
  beforeEach(() => {
    _resetSharedStore();
  });

  it('treats SharedStore.get errors as miss (does not block caller)', async () => {
    // Inject a failing store
    const failingStore = createMemoryStore();
    failingStore.get = vi.fn().mockRejectedValue(new Error('redis down'));

    // Replace the singleton via dynamic mock
    vi.doMock('@/lib/store/shared', async (importActual) => {
      const actual = await importActual<typeof import('@/lib/store/shared')>();
      return {
        ...actual,
        getSharedStore: vi.fn().mockResolvedValue(failingStore),
      };
    });

    // Re-import after mock
    const { getCached: getCachedReimported } = await import('@/lib/cache/moduleCache');

    const result = await getCachedReimported({
      module: 'lighthouse',
      version: 1,
      input: { url: 'https://broken.com' },
    });

    expect(result.hit).toBe(false);
    expect(result.value).toBeNull();

    vi.doUnmock('@/lib/store/shared');
  });
});
