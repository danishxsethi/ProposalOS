/**
 * lib/store/shared.ts
 *
 * Shared Key-Value Store Abstraction
 *
 * Provides a minimal interface for operations that must be consistent across
 * all Cloud Run instances: idempotency keys and rate-limit counters.
 *
 * Production: Redis (ioredis via REDIS_URL) or Upstash REST (UPSTASH_REDIS_REST_URL).
 * Dev/test:   Deterministic in-memory adapter (safe, no external dependency).
 *
 * The factory function resolves the right adapter at startup and logs a clear
 * warning if the in-memory fallback is used in a non-dev/test environment.
 *
 * Multi-instance safety:
 *   - In production every Cloud Run instance connects to the same Redis/Upstash.
 *   - In local/test mode each process has its own Map – sufficient for single-
 *     process dev and fully deterministic in unit tests.
 *
 * IMPORTANT: Do NOT add business logic here.  This file is infrastructure only.
 */

import { logger } from '@/lib/logger';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface SharedStore {
  /**
   * Get a value by key.  Returns undefined when the key does not exist or has
   * expired.
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value with an explicit TTL (seconds).
   * Overwrites any existing value.
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /**
   * Set a value only if the key does not already exist.
   * Returns true when the key was set, false when it already existed.
   */
  setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Atomically increment a counter and (on first increment) set its TTL.
   * Returns the counter value after increment.
   * Safe to call concurrently from multiple instances.
   */
  increment(key: string, ttlSeconds: number): Promise<number>;

  /**
   * Delete a key.  No-op when the key does not exist.
   */
  del(key: string): Promise<void>;

  /**
   * Clear all keys in the store. Mainly for admin/tests.
   */
  clear?(): Promise<void>;
}

// ─── Redis adapter (ioredis) ─────────────────────────────────────────────────

/** Lazy-loaded singleton so we don't open a connection at import time. */
let _redisInstance: import('ioredis').Redis | null = null;

async function getRedisInstance(): Promise<import('ioredis').Redis | null> {
  if (_redisInstance) return _redisInstance;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { default: Redis } = await import('ioredis');
    _redisInstance = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    await _redisInstance.connect();
    logger.info({ event: 'shared_store.redis_connected' }, 'SharedStore: Redis connected');
    return _redisInstance;
  } catch (err) {
    logger.error(
      { event: 'shared_store.redis_connect_failed', err },
      'SharedStore: Redis connection failed'
    );
    _redisInstance = null;
    return null;
  }
}

function makeRedisAdapter(redis: import('ioredis').Redis): SharedStore {
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
    async setIfNotExists(key, value, ttlSeconds) {
      const result = await redis.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    },
    async increment(key, ttlSeconds) {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds);
      const results = await pipeline.exec();
      // results[0] = [err, count]
      const count = results?.[0]?.[1] as number | undefined;
      return count ?? 1;
    },
    async del(key) {
      await redis.del(key);
    },
    async clear() {
      await redis.flushdb();
    },
  };
}

// ─── In-memory adapter (dev / test) ──────────────────────────────────────────

/**
 * Deterministic in-memory shared store.
 * A single Map<key, {value, expiresAt}> keyed per process.
 *
 * Exported so tests can import and reset it directly:
 *   import { createMemoryStore } from '@/lib/store/shared';
 *   const store = createMemoryStore();
 */
export function createMemoryStore(): SharedStore & {
  _store: Map<string, { value: string; expiresAt: number }>;
} {
  const _store = new Map<string, { value: string; expiresAt: number }>();

  function isExpired(entry: { expiresAt: number }): boolean {
    return Date.now() > entry.expiresAt;
  }

  return {
    _store,
    async get(key) {
      const entry = _store.get(key);
      if (!entry || isExpired(entry)) {
        _store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      _store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async setIfNotExists(key, value, ttlSeconds) {
      const entry = _store.get(key);
      if (entry && !isExpired(entry)) return false;
      _store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async increment(key, ttlSeconds) {
      const entry = _store.get(key);
      if (!entry || isExpired(entry)) {
        _store.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
        return 1;
      }
      const next = parseInt(entry.value, 10) + 1;
      _store.set(key, { value: String(next), expiresAt: entry.expiresAt });
      return next;
    },
    async del(key) {
      _store.delete(key);
    },
    async clear() {
      _store.clear();
    },
  };
}

// ─── Singleton instance ───────────────────────────────────────────────────────

let _instance: SharedStore | null = null;

/**
 * Get (or lazily create) the shared store singleton.
 *
 * Resolution order:
 *   1. Redis via REDIS_URL (production, staging)
 *   2. In-memory fallback (dev, test)
 *
 * If NODE_ENV=production and no Redis is configured, this function logs an
 * error and throws unless SHARED_STORE_REQUIRED is set to 'false' (escape hatch
 * for gradual rollout).
 */
export async function getSharedStore(): Promise<SharedStore> {
  if (_instance) return _instance;

  const redis = await getRedisInstance();
  if (redis) {
    _instance = makeRedisAdapter(redis);
    return _instance;
  }

  // No Redis available — check whether we're allowed to fall back
  const isProd = process.env.NODE_ENV === 'production';
  const requiredDisabled = process.env.SHARED_STORE_REQUIRED === 'false';

  if (isProd && !requiredDisabled) {
    const msg =
      '[SharedStore] FATAL: NODE_ENV=production but no Redis is configured. ' +
      'Set REDIS_URL to a Redis/Upstash instance, or set SHARED_STORE_REQUIRED=false ' +
      'to allow in-memory fallback (unsafe in multi-instance deployments).';
    logger.error({ event: 'shared_store.production_no_redis' }, msg);
    throw new Error(msg);
  }

  if (isProd && requiredDisabled) {
    logger.warn(
      { event: 'shared_store.unsafe_memory_fallback' },
      '[SharedStore] WARNING: Using unsafe in-memory store in production. ' +
        'Rate limits and idempotency keys are NOT shared across instances. ' +
        'Set REDIS_URL for production-safe behaviour.'
    );
  } else if (process.env.NODE_ENV !== 'test') {
    logger.warn(
      { event: 'shared_store.memory_fallback' },
      '[SharedStore] Using in-memory store (dev mode). Not safe for multi-instance deployments.'
    );
  }

  _instance = createMemoryStore();
  return _instance;
}

/**
 * Reset the singleton — only for use in tests.
 */
export function _resetSharedStore(): void {
  _instance = null;
  _redisInstance = null;
}
