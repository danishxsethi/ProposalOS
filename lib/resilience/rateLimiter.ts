/**
 * lib/resilience/rateLimiter.ts
 *
 * Distributed Rate Limiting for Third-Party Providers
 */

import { logger } from '@/lib/logger';
import { getSharedStore } from '@/lib/store/shared';

import { ProviderName, ProviderPolicy } from './types';

export interface ProviderRateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Checks and increments rate limit counter for a given provider/tenant combination.
 * Uses SharedStore to ensure multi-instance safety.
 */
export async function checkProviderRateLimit(
  provider: ProviderName,
  tenantId?: string,
  policy?: ProviderPolicy
): Promise<ProviderRateLimitResult> {
  const windowMs = policy?.rateLimitWindowMs ?? 60000;
  const maxCalls = policy?.rateLimitMaxCalls ?? 60;
  const windowSec = Math.ceil(windowMs / 1000);

  // Skip rate limiting in tests unless explicitly enabled
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_PROVIDER_RATE_LIMIT_TEST !== 'true') {
    return {
      success: true,
      limit: maxCalls,
      remaining: maxCalls,
      resetMs: windowMs,
    };
  }

  // Key design: rl:provider:{providerName} or rl:provider:{providerName}:tenant:{tenantId}
  const baseKey = `rl:provider:${provider}`;
  const key = tenantId ? `${baseKey}:tenant:${tenantId}` : baseKey;

  try {
    const store = await getSharedStore();
    const count = await store.increment(key, windowSec);
    const remaining = Math.max(0, maxCalls - count);
    const success = count <= maxCalls;

    return {
      success,
      limit: maxCalls,
      remaining,
      resetMs: windowMs,
    };
  } catch (err) {
    // Fail-open to avoid taking down the app if Redis goes down, but log the issue
    logger.error(
      { err, provider, tenantId },
      'Provider rate limiter database error — failing open'
    );
    return {
      success: true,
      limit: maxCalls,
      remaining: 1,
      resetMs: windowMs,
    };
  }
}
