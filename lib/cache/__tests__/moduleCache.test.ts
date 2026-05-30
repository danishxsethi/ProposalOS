import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getSharedStore, _resetSharedStore } from '@/lib/store/shared';
import {
  withModuleCache,
  buildCacheKey,
  MODULE_CACHE_TTL,
  getCached,
  setCached,
  invalidateCache,
} from '../moduleCache';

describe('moduleCache (Multi-instance safe caching)', () => {
  beforeEach(async () => {
    _resetSharedStore();
    // Ensure we are working with a fresh memory store in tests
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;
    const store = await getSharedStore();
    if (store.clear) {
      await store.clear();
    }
  });

  test('buildCacheKey produces a stable, deterministic, hashed key', () => {
    const key1 = buildCacheKey({
      module: 'gbp',
      version: 1,
      input: { query: 'test', location: 'Denver', api_key: 'SECRET_XYZ' },
    });

    const key2 = buildCacheKey({
      module: 'gbp',
      version: 1,
      input: { location: 'Denver', query: 'test', api_key: 'SECRET_XYZ' }, // keys shuffled
    });

    // Keys must be identical regardless of input key ordering
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^module-cache:gbp:v1:[a-f0-9]{32}$/);

    // Raw secrets like API key should not be visible in the key string
    expect(key1).not.toContain('SECRET_XYZ');
  });

  test('tenant-specific keys are isolated', () => {
    const keyTenant1 = buildCacheKey({
      module: 'seoDeep',
      version: 1,
      input: { url: 'https://example.com', tenantId: 'tenant-abc' },
    });

    const keyTenant2 = buildCacheKey({
      module: 'seoDeep',
      version: 1,
      input: { url: 'https://example.com', tenantId: 'tenant-xyz' },
    });

    expect(keyTenant1).not.toBe(keyTenant2);
  });

  test('withModuleCache performs lookup, miss, fetch, store, and then subsequent hit', async () => {
    const cacheKey = {
      module: 'citations',
      version: 2,
      input: { term: 'pizza' },
    };

    const fetchFn = vi.fn().mockResolvedValue({ citationsCount: 42 });

    // 1st call: Cache Miss -> calls fetchFn
    const res1 = await withModuleCache(cacheKey, { ttlSeconds: MODULE_CACHE_TTL.SHORT }, fetchFn);
    expect(res1).toEqual({ citationsCount: 42 });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 2nd call: Cache Hit -> returns cached result, does NOT call fetchFn again
    const res2 = await withModuleCache(cacheKey, { ttlSeconds: MODULE_CACHE_TTL.SHORT }, fetchFn);
    expect(res2).toEqual({ citationsCount: 42 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('invalid or corrupted cached payload is discarded and re-calculated', async () => {
    const cacheKey = {
      module: 'competitor',
      version: 1,
      input: { query: 'marketing' },
    };

    const fullKey = buildCacheKey(cacheKey);
    const store = await getSharedStore();

    // Store corrupted JSON manually
    await store.set(fullKey, 'this is NOT JSON', 3600);

    const fetchFn = vi.fn().mockResolvedValue({ safe: true });

    // withModuleCache should catch parse error, discard, and run fetchFn
    const res = await withModuleCache(cacheKey, { ttlSeconds: MODULE_CACHE_TTL.SHORT }, fetchFn);
    expect(res).toEqual({ safe: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // The corrupt key should have been purged or overwritten
    const cleanedVal = await store.get(fullKey);
    expect(cleanedVal).toBe(JSON.stringify({ safe: true }));
  });

  test('cache lookup or write failures do not block live execution', async () => {
    const cacheKey = {
      module: 'videoPresence',
      version: 1,
      input: { query: 'cats' },
    };

    const store = await getSharedStore();
    // Force get/set to fail by mock-rejecting
    vi.spyOn(store, 'get').mockRejectedValue(new Error('Redis is down'));
    vi.spyOn(store, 'set').mockRejectedValue(new Error('Redis is down'));

    const fetchFn = vi.fn().mockResolvedValue({ success: true });

    // Call should still succeed seamlessly (resiliency fallback)
    const res = await withModuleCache(cacheKey, { ttlSeconds: MODULE_CACHE_TTL.SHORT }, fetchFn);
    expect(res).toEqual({ success: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
