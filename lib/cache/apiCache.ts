import crypto from 'crypto';
import path from 'path';

import fs from 'fs-extra';
import Redis from 'ioredis';

import { logger } from '@/lib/logger';

import { Metrics } from '../metrics';

const CACHE_DIR = path.join(process.cwd(), 'lib', 'cache', 'store');
const USE_REDIS = !!process.env.REDIS_URL;
const ALLOW_LOCAL_CACHE = process.env.ALLOW_LOCAL_CACHE === 'true';
const IS_PROD = process.env.NODE_ENV === 'production';

let redis: Redis | null = null;
if (USE_REDIS && process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  logger.info('[Cache] Using Redis for caching');
} else if (!IS_PROD && ALLOW_LOCAL_CACHE) {
  // Ensure cache dir exists only if allowed
  fs.ensureDirSync(CACHE_DIR);
  logger.info('[Cache] Using File System for caching (explicitly allowed)');
} else {
  logger.warn(
    '[Cache] apiCache.ts: Caching disabled (no Redis configured and local cache not allowed)'
  );
}

export interface CacheOptions {
  ttlHours?: number;
}

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Generate a consistent hash key for the cache
 */
function generateKey(apiName: string, params: Record<string, any>): string {
  const paramString = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('sha256').update(paramString).digest('hex');
  return `${apiName}:${hash}`;
}

/**
 * Wrapper for API calls with caching
 */
export async function cachedFetch<T>(
  apiName: string,
  params: Record<string, any>,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const key = generateKey(apiName, params);
  const ttlHours = options.ttlHours || 24;
  const ttlMs = ttlHours * 60 * 60 * 1000;

  // 1. Protection checks
  if (!USE_REDIS) {
    if (IS_PROD) {
      const msg = `[Cache] FATAL: apiCache.cachedFetch called in production with no Redis configured (unsafe local filesystem fallback prevented) for API: ${apiName}`;
      logger.error({ apiName }, msg);
      throw new Error(msg);
    }
    if (!ALLOW_LOCAL_CACHE) {
      // Act as a silent no-op cache (fall through directly to live execution)
      logger.debug(
        { apiName },
        '[Cache] apiCache.cachedFetch: local cache disabled, falling through to fetchFn'
      );
      return fetchFn();
    }
  }

  // 2. Try to get from cache
  try {
    if (USE_REDIS && redis) {
      const cached = await redis.get(key);
      if (cached) {
        const entry: CacheEntry<T> = JSON.parse(cached);
        Metrics.increment('cache_hit');
        return entry.data;
      }
    } else if (ALLOW_LOCAL_CACHE) {
      // File Cache
      const filePath = path.join(CACHE_DIR, `${key}.json`);
      if (await fs.pathExists(filePath)) {
        const entry: CacheEntry<T> = await fs.readJson(filePath);
        if (Date.now() < entry.expiresAt) {
          Metrics.increment('cache_hit');
          return entry.data;
        } else {
          // Expired
          await fs.remove(filePath);
        }
      }
    }
  } catch (error) {
    logger.warn({ key, error }, '[Cache] Error reading cache');
  }

  // 3. Fetch fresh data
  Metrics.increment('cache_miss');
  const data = await fetchFn();

  // 4. Save to cache
  try {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    if (USE_REDIS && redis) {
      // Set with TTL in seconds
      await redis.set(key, JSON.stringify(entry), 'EX', ttlHours * 60 * 60);
    } else if (ALLOW_LOCAL_CACHE) {
      const filePath = path.join(CACHE_DIR, `${key}.json`);
      await fs.writeJson(filePath, entry);
    }
  } catch (error) {
    logger.warn({ key, error }, '[Cache] Error writing cache');
  }

  return data;
}

/**
 * Manually clear the cache
 */
export async function clearCache(): Promise<void> {
  if (USE_REDIS && redis) {
    await redis.flushdb();
    logger.info('[Cache] Redis cleared');
  } else if (!IS_PROD && ALLOW_LOCAL_CACHE) {
    await fs.emptyDir(CACHE_DIR);
    logger.info('[Cache] File cache cleared');
  } else {
    logger.info('[Cache] clearCache: No-op (no Redis and local cache disabled)');
  }
}
