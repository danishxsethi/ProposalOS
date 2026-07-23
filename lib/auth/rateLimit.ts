/**
 * Token Bucket Rate Limiter
 * 
 * Enforces rate limits on LLM API calls and general application usage
 * using the Token Bucket algorithm. This provides smooth bursting capability
 * while maintaining a strict average rate over time.
 * 
 * Requirement: 2A (Cost Control & Engine Limits)
 */

type BucketInfo = {
    tokens: number;
    lastRefill: number;
};

// In-memory store for rate limit buckets.
// Note: In a multi-instance production environment, this should ideally be backed by Redis.
const buckets = new Map<string, BucketInfo>();

export interface RateLimitConfig {
    maxTokens: number;      // Maximum burst capacity
    refillRate: number;     // Tokens added per second
    costPerRequest?: number; // How many tokens a request consumes (default: 1)
}

/**
 * Standard tier rate limits
 */
export const TIER_LIMITS = {
    // Free tier: 10 requests per minute with no bursting
    free: { maxTokens: 10, refillRate: 10 / 60 },
    // Pro tier: 60 requests per minute, burst up to 10
    pro: { maxTokens: 10, refillRate: 1 },
    // Enterprise tier: 600 requests per minute, burst up to 100
    enterprise: { maxTokens: 100, refillRate: 10 },
    // LLM Model specific limits (e.g. Gemini Pro has lower RPM limits than Flash)
    'gemini-3.1-pro': { maxTokens: 50, refillRate: 50 / 60 },
    'gemini-3.1-flash': { maxTokens: 200, refillRate: 200 / 60 },
};

/**
 * Attempt to consume tokens from a specific bucket.
 * 
 * @param bucketId - Unique identifier for the bucket (e.g. tenantId:modelName)
 * @param config - Rate limiting configuration for this bucket
 * @returns Object indicating whether the request is allowed and token metadata
 */
export function consumeTokens(bucketId: string, config: RateLimitConfig): {
    allowed: boolean;
    remainingTokens: number;
    retryAfterMs: number;
} {
    const now = Date.now();
    const cost = config.costPerRequest || 1;

    // Initialize bucket if it doesn't exist
    let bucket = buckets.get(bucketId);
    if (!bucket) {
        bucket = { tokens: config.maxTokens, lastRefill: now };
        buckets.set(bucketId, bucket);
    }

    // Time elapsed since last refill in seconds
    const elapsedSeconds = Math.max(0, (now - bucket.lastRefill) / 1000);

    // Calculate new tokens to add (capped at maxTokens)
    const tokensToAdd = elapsedSeconds * config.refillRate;
    const newTokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);

    // If we have enough tokens, consume them and allow the request
    if (newTokens >= cost) {
        bucket.tokens = newTokens - cost;
        bucket.lastRefill = now;

        return {
            allowed: true,
            remainingTokens: bucket.tokens,
            retryAfterMs: 0
        };
    }

    // Not enough tokens, calculate how long until we have enough for this request
    const tokensNeeded = cost - newTokens;
    const retryAfterSeconds = tokensNeeded / config.refillRate;

    // We don't update the bucket state for rejected requests
    // but we should store the partial refill time
    bucket.tokens = newTokens;
    bucket.lastRefill = now;

    return {
        allowed: false,
        remainingTokens: Math.floor(newTokens),
        retryAfterMs: Math.ceil(retryAfterSeconds * 1000)
    };
}

/**
 * Convenience wrapper for enforcing rate limits by tenant tier or model
 * 
 * @param tenantId - The ID of the tenant making the request
 * @param key - The rate limit tier/model key
 * @param cost - Optional cost multiplier for the request
 */
export function checkRateLimit(tenantId: string, key: keyof typeof TIER_LIMITS, cost: number = 1) {
    const bucketId = `${tenantId}:${key}`;
    const config = { ...TIER_LIMITS[key], costPerRequest: cost };
    return consumeTokens(bucketId, config);
}

/**
 * Clear all rate limit buckets (useful for testing)
 */
export function resetRateLimits() {
    buckets.clear();
}
