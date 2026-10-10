import path from 'path';
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs-extra';

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  scan: vi.fn(),
  del: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor() {
      return redisMock;
    }
  },
}));

describe('apiCache safety and fallback behavior', () => {
  const originalEnv = { ...process.env };
  const CACHE_DIR = path.join(process.cwd(), 'lib', 'cache', 'store');

  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
    vi.resetModules();
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    redisMock.scan.mockReset();
    redisMock.del.mockReset();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    // Cleanup filesystem if directory was created
    if (await fs.pathExists(CACHE_DIR)) {
      await fs.remove(CACHE_DIR);
    }
  });

  test('throws fatal error in production if REDIS_URL is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;

    // Dynamically import to ensure initialization block runs with the correct env variables
    const { cachedFetch } = await import('../apiCache');

    const fetchFn = vi.fn().mockResolvedValue({ status: 'live' });

    await expect(cachedFetch('test-api', { param: 1 }, fetchFn)).rejects.toThrow(
      /FATAL: apiCache.cachedFetch called in production with no Redis configured/
    );

    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('clears only the API-cache key namespace in Redis', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://isolated-test.invalid:6379';
    redisMock.scan
      .mockResolvedValueOnce([
        '17',
        ['proposalos-api-cache-audit-1', 'rate-limit:tenant:1', 'proposalos-api-cache-audit-2'],
      ])
      .mockResolvedValueOnce(['0', ['proposalos-api-cache-proposal-1']]);
    redisMock.del.mockResolvedValue(1);

    const { clearCache } = await import('../apiCache');
    await clearCache();

    expect(redisMock.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'proposalos-api-cache-*',
      'COUNT',
      100
    );
    expect(redisMock.scan).toHaveBeenNthCalledWith(
      2,
      '17',
      'MATCH',
      'proposalos-api-cache-*',
      'COUNT',
      100
    );
    expect(redisMock.del).toHaveBeenNthCalledWith(
      1,
      'proposalos-api-cache-audit-1',
      'proposalos-api-cache-audit-2'
    );
    expect(redisMock.del).toHaveBeenNthCalledWith(2, 'proposalos-api-cache-proposal-1');
    expect(redisMock).not.toHaveProperty('flushdb');
  });

  test('behaves as a silent no-op in dev/test environments when ALLOW_LOCAL_CACHE is not set', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;
    delete process.env.ALLOW_LOCAL_CACHE;

    const { cachedFetch } = await import('../apiCache');

    const fetchFn = vi.fn().mockResolvedValue({ fresh: true });

    // First call: calls fetchFn
    const res1 = await cachedFetch('test-api-noop', { param: 'x' }, fetchFn);
    expect(res1).toEqual({ fresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call: still calls fetchFn because caching is no-op
    const res2 = await cachedFetch('test-api-noop', { param: 'x' }, fetchFn);
    expect(res2).toEqual({ fresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // File cache directory should NOT exist
    const exists = await fs.pathExists(CACHE_DIR);
    expect(exists).toBe(false);
  });

  test('enables filesystem caching in dev/test if ALLOW_LOCAL_CACHE is true', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;
    process.env.ALLOW_LOCAL_CACHE = 'true';

    const { cachedFetch } = await import('../apiCache');

    const fetchFn = vi.fn().mockResolvedValue({ value: 'local-cached' });

    // First call: cache miss, calls fetchFn, writes to filesystem
    const res1 = await cachedFetch('test-api-local', { item: 123 }, fetchFn);
    expect(res1).toEqual({ value: 'local-cached' });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // File cache directory MUST exist
    const exists = await fs.pathExists(CACHE_DIR);
    expect(exists).toBe(true);

    // Second call: cache hit, reads from filesystem, does NOT call fetchFn
    const res2 = await cachedFetch('test-api-local', { item: 123 }, fetchFn);
    expect(res2).toEqual({ value: 'local-cached' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
