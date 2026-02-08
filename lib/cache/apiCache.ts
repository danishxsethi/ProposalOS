import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';
import { Metrics } from '../metrics';

const CACHE_DIR = path.join(process.cwd(), 'lib', 'cache', 'store');
const USE_REDIS = !!process.env.REDIS_URL;

let redis: Redis | null = null;
if (USE_REDIS && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
    console.log('[Cache] Using Redis for caching');
} else {
    // Ensure cache dir exists
    fs.ensureDirSync(CACHE_DIR);
    console.log('[Cache] Using File System for caching');
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

    // 1. Try to get from cache
    try {
        if (USE_REDIS && redis) {
            const cached = await redis.get(key);
            if (cached) {
                const entry: CacheEntry<T> = JSON.parse(cached);
                // Redis handles TTL usually, but we double check or just rely on Redis TTL
                Metrics.increment('cache_hit');
                // console.log(`[Cache] HIT: ${apiName}`);
                return entry.data;
            }
        } else {
            // File Cache
            const filePath = path.join(CACHE_DIR, `${key}.json`);
            if (await fs.pathExists(filePath)) {
                const entry: CacheEntry<T> = await fs.readJson(filePath);
                if (Date.now() < entry.expiresAt) {
                    Metrics.increment('cache_hit');
                    // console.log(`[Cache] HIT: ${apiName}`);
                    return entry.data;
                } else {
                    // Expired
                    await fs.remove(filePath);
                }
            }
        }
    } catch (error) {
        console.warn(`[Cache] Error reading cache for ${key}:`, error);
    }

    // 2. Fetch fresh data
    Metrics.increment('cache_miss');
    // console.log(`[Cache] MISS: ${apiName}`);
    const data = await fetchFn();

    // 3. Save to cache
    try {
        const entry: CacheEntry<T> = {
            data,
            cachedAt: Date.now(),
            expiresAt: Date.now() + ttlMs,
        };

        if (USE_REDIS && redis) {
            // Set with TTL in seconds
            await redis.set(key, JSON.stringify(entry), 'EX', ttlHours * 60 * 60);
        } else {
            const filePath = path.join(CACHE_DIR, `${key}.json`);
            await fs.writeJson(filePath, entry);
        }
    } catch (error) {
        console.warn(`[Cache] Error writing cache for ${key}:`, error);
    }

    return data;
}

/**
 * Manually clear the cache
 */
export async function clearCache(): Promise<void> {
    if (USE_REDIS && redis) {
        await redis.flushdb();
        console.log('[Cache] Redis cleared');
    } else {
        await fs.emptyDir(CACHE_DIR);
        console.log('[Cache] File cache cleared');
    }
}
