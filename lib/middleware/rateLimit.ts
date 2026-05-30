/**
 * lib/middleware/rateLimit.ts
 *
 * Distributed Rate Limiting Middleware
 *
 * Uses lib/store/shared.ts for counters that are shared across all Cloud Run
 * instances.  In production REDIS_URL must be set; without it the factory in
 * shared.ts will either throw (NODE_ENV=production) or warn and fall back to
 * per-process in-memory (dev/test only).
 *
 * Per-instance in-memory counters are NOT used in this file.
 */

import { NextResponse } from 'next/server';

import { RateLimitError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { hashSensitive } from '@/lib/security/abuseDefense/policies';
import { getSharedStore } from '@/lib/store/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  tenantId?: string;
  sessionId?: string;
  useApiKey?: boolean;
  endpoint?: string;
  failClosed?: boolean;
  routeClass?: string;
  auditOnBlock?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a stable store key for a request + options combination.
 * Hashes all sensitive identifiers to protect client privacy and credentials.
 */
function buildRateLimitKey(req: Request, options: RateLimitOptions): string {
  const endpointSuffix = options.endpoint ? `:${options.endpoint}` : '';

  const apiKey =
    options.useApiKey &&
    (req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', ''));
  if (apiKey) return `rl:api:${hashSensitive(apiKey)}${endpointSuffix}`;

  if (options.sessionId) return `rl:session:${hashSensitive(options.sessionId)}${endpointSuffix}`;
  if (options.tenantId) return `rl:tenant:${options.tenantId}${endpointSuffix}`;

  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() ?? realIp?.split(',')[0]?.trim() ?? 'unknown';
  return `rl:ip:${hashSensitive(ip)}${endpointSuffix}`;
}

// ─── Core check ──────────────────────────────────────────────────────────────

/**
 * Increment the counter for this request and return the rate-limit result.
 * Uses the shared store so the count is consistent across all instances.
 */
export async function checkRateLimit(
  req: Request,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(options.windowMs / 1000);
  const resetAt = new Date(Date.now() + options.windowMs);

  // Bypass rate limiting in test environments unless explicitly enabled for testing the rate limiter itself
  if (
    (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_TEST !== 'true') ||
    (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.ENABLE_RATE_LIMIT_TEST !== 'true')
  ) {
    return {
      success: true,
      remaining: options.max,
      resetAt,
    };
  }

  const key = buildRateLimitKey(req, options);
  try {
    const store = await getSharedStore();
    const count = await store.increment(key, windowSeconds);
    const remaining = Math.max(0, options.max - count);
    const success = count <= options.max;

    if (!success && options.auditOnBlock) {
      const forwarded = req.headers.get('x-forwarded-for');
      const realIp = req.headers.get('x-real-ip');
      const ip = forwarded?.split(',')[0]?.trim() ?? realIp?.split(',')[0]?.trim() ?? 'unknown';
      await recordAuditTrailEvent({
        eventType: 'abuse.rate_limited',
        tenantId: options.tenantId || null,
        payload: {
          routeClass: options.routeClass || 'unknown',
          ipHash: hashSensitive(ip),
          endpoint: options.endpoint || req.url,
          limit: options.max,
          remaining,
          retryAfter: windowSeconds,
        },
      }).catch((err) => {
        logger.error(
          { event: 'rate_limit.audit_event_failed', err },
          'Failed to record audit trail block event'
        );
      });
    }

    return {
      success,
      remaining,
      resetAt,
      retryAfter: success ? undefined : windowSeconds,
    };
  } catch (err) {
    logger.error({ event: 'rate_limit.store_error', err }, 'Rate limit store error');
    if (options.failClosed) {
      logger.error({ event: 'rate_limit.failed_closed' }, 'Fail closed on rate limit store error');
      return {
        success: false,
        remaining: 0,
        resetAt,
        retryAfter: windowSeconds,
      };
    }
    // If failClosed is false, fail open
    return { success: true, remaining: 1, resetAt };
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Wrap an API route handler with distributed rate limiting.
 */
export function withRateLimit(options: RateLimitOptions) {
  return async function rateLimitMiddleware(
    req: Request,
    handler: () => Promise<Response | NextResponse>
  ): Promise<Response | NextResponse> {
    const result = await checkRateLimit(req, options);

    const headers = new Headers({
      'X-RateLimit-Limit': String(options.max),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(result.resetAt.getTime()),
    });

    if (!result.success) {
      const retryAfter = result.retryAfter ?? Math.ceil(options.windowMs / 1000);
      headers.set('Retry-After', String(retryAfter));

      const error = new RateLimitError(
        options.message ?? 'Too many requests, please try again later.',
        retryAfter,
        options.max,
        result.remaining,
        result.resetAt
      );

      return NextResponse.json(error.toEnvelope(req.url), { status: 429, headers });
    }

    const response = await handler();
    // Copy rate-limit headers onto the response
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  };
}

// ─── Tenant multiplier (unchanged) ───────────────────────────────────────────

export async function getTenantRateLimitMultiplier(tenantId: string): Promise<number> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true },
    });
    if (!tenant) return 1;
    switch (tenant.planTier) {
      case 'enterprise':
        return 10;
      case 'professional':
        return 5;
      case 'starter':
        return 2;
      default:
        return 1;
    }
  } catch {
    return 1;
  }
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export const RateLimitPresets = {
  auditTrigger: {
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many audit requests. Please wait before trying again.',
  } as RateLimitOptions,

  proposalGeneration: {
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many proposal requests. Please wait before trying again.',
  } as RateLimitOptions,

  readOperations: {
    windowMs: 10 * 1000,
    max: 30,
  } as RateLimitOptions,

  publicApi: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'API rate limit exceeded. Consider upgrading your plan.',
  } as RateLimitOptions,

  batchOperations: {
    windowMs: 60 * 1000,
    max: 2,
    message: 'Batch operation rate limit exceeded.',
  } as RateLimitOptions,

  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts. Please try again later.',
  } as RateLimitOptions,

  default: {
    windowMs: 60 * 1000,
    max: 60,
  } as RateLimitOptions,
} as const;

// ─── Legacy helpers (kept for backward compatibility) ─────────────────────────

/** @deprecated Use withRateLimit instead */
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  return function (req: any, res: any, next: any) {
    // Fire-and-forget counter; legacy callers don't await
    checkRateLimit(req as Request, options)
      .then((result) => {
        if (!result.success) {
          res.status(429).json({
            error: options.message ?? 'Too many requests, please try again later.',
            retryAfter: result.retryAfter,
          });
        } else {
          next();
        }
      })
      .catch(() => next());
  };
}

export interface SessionRateLimitOptions {
  windowMs: number;
  maxPerSession: number;
  maxPerIp: number;
}

/** @deprecated Use withRateLimit instead */
export function sessionRateLimit(options: SessionRateLimitOptions) {
  return function (_req: any, _res: any, next: any) {
    // No-op placeholder; legacy callers should migrate to withRateLimit
    next();
  };
}
