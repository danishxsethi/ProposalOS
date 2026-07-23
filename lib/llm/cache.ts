/**
 * FIX-36: Semantic LLM response caching.
 * Caches LLM responses in Redis by prompt hash to avoid redundant API calls.
 */

import { createHash } from 'crypto';
import { logger } from '@/lib/logger';

// Lazy-init Redis — only starts if REDIS_URL is set
let redisClient: any = null;

async function getRedis() {
    if (redisClient) return redisClient;
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;
    try {
        const { default: Redis } = await import('ioredis');
        redisClient = new Redis(redisUrl);
        return redisClient;
    } catch {
        return null;
    }
}

const DEFAULT_TTL_SECONDS = 86400; // 24 hours

/**
 * Generates a stable cache key from prompt + model + temperature.
 */
export function makeCacheKey(prompt: string, model: string, temperature = 0): string {
    const content = `${model}::${temperature}::${prompt}`;
    return `llm:${createHash('sha256').update(content).digest('hex').substring(0, 32)}`;
}

export interface LLMCacheOptions {
    skipCache?: boolean;
    ttlSeconds?: number;
}

/**
 * Wraps an LLM call with Redis caching.
 * Falls back to direct LLM call if Redis is unavailable.
 */
export async function withLLMCache<T>(
    cacheKey: string,
    llmCall: () => Promise<T>,
    options: LLMCacheOptions = {}
): Promise<T> {
    const { skipCache = false, ttlSeconds = DEFAULT_TTL_SECONDS } = options;

    const redis = await getRedis();

    // Try cache read
    if (redis && !skipCache) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                logger.debug({ cacheKey }, 'LLM cache HIT');
                return JSON.parse(cached) as T;
            }
        } catch (err) {
            logger.warn({ cacheKey, err }, 'LLM cache read failed, continuing without cache');
        }
    }

    // Execute LLM call
    const result = await llmCall();

    // Write to cache
    if (redis && !skipCache) {
        try {
            await redis.setex(cacheKey, ttlSeconds, JSON.stringify(result));
            logger.debug({ cacheKey, ttlSeconds }, 'LLM cache WRITE');
        } catch (err) {
            logger.warn({ cacheKey, err }, 'LLM cache write failed');
        }
    }

    return result;
}
