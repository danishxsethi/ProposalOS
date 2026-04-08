/**
 * Enhanced Rate Limiting Middleware
 *
 * Supports both in-memory (development) and Redis-backed (production) rate limiting.
 * Provides per-tenant, per-user, and per-endpoint rate limiting with proper 429 responses.
 */

import { NextResponse } from 'next/server';

import { RateLimitError } from '@/lib/api/errors';
import { prisma } from '@/lib/prisma';

// Types
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

// In-memory store for development
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const memoryStore: RateLimitStore = {};

// Redis client (lazy-loaded for production)
let redisClient: ReturnType<typeof createRedisClient> | null = null;

function createRedisClient() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    if (process.env.REDIS_URL) {
      return new Redis(process.env.REDIS_URL);
    }
  } catch {
    // Redis not available, will use memory store
  }
  return null;
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

/**
 * Get client identifier based on request context
 */
function getClientIdentifier(req: Request, options: RateLimitOptions): string {
  const headers = req.headers;

  const apiKey = headers.get('x-api-key') || headers.get('authorization')?.replace('Bearer ', '');
  if (apiKey && options.useApiKey) {
    return `api:${apiKey}`;
  }

  if (options.sessionId) {
    return `session:${options.sessionId}`;
  }

  if (options.tenantId) {
    return `tenant:${options.tenantId}`;
  }

  const forwarded = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp?.split(',')[0]?.trim() || 'unknown';
  return `ip:${ip}`;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  tenantId?: string;
  sessionId?: string;
  useApiKey?: boolean;
  endpoint?: string;
}

/**
 * Get custom rate limit multiplier for tenant from database
 */
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

/**
 * Check rate limit and return result
 */
export async function checkRateLimit(
  req: Request,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const clientKey = getClientIdentifier(req, options);
  const endpointKey = options.endpoint ? `:${options.endpoint}` : '';
  const fullKey = `ratelimit:${clientKey}${endpointKey}`;

  const now = Date.now();
  const resetTime = now + options.windowMs;

  const redis = getRedisClient();

  if (redis) {
    const multi = redis.multi();
    multi.incr(fullKey);
    multi.expire(fullKey, Math.ceil(options.windowMs / 1000));
    const results = await multi.exec();

    if (results && results[0]) {
      const count = results[0][1] as number;
      const remaining = Math.max(0, options.max - count);

      return {
        success: count <= options.max,
        remaining,
        resetAt: new Date(resetTime),
        retryAfter: count > options.max ? Math.ceil(options.windowMs / 1000) : undefined,
      };
    }
  }

  if (!memoryStore[fullKey]) {
    memoryStore[fullKey] = {
      count: 1,
      resetTime: resetTime,
    };
    return {
      success: true,
      remaining: options.max - 1,
      resetAt: new Date(resetTime),
    };
  }

  if (memoryStore[fullKey].resetTime < now) {
    memoryStore[fullKey] = {
      count: 1,
      resetTime: resetTime,
    };
    return {
      success: true,
      remaining: options.max - 1,
      resetAt: new Date(resetTime),
    };
  }

  memoryStore[fullKey].count++;
  const count = memoryStore[fullKey].count;
  const remaining = Math.max(0, options.max - count);

  return {
    success: count <= options.max,
    remaining,
    resetAt: new Date(memoryStore[fullKey].resetTime),
    retryAfter:
      count > options.max ? Math.ceil((memoryStore[fullKey].resetTime - now) / 1000) : undefined,
  };
}

/**
 * Create rate limit middleware for Next.js API routes
 */
export function withRateLimit(options: RateLimitOptions) {
  return async function rateLimitMiddleware(
    req: Request,
    handler: () => Promise<Response | NextResponse>
  ): Promise<Response | NextResponse> {
    const result = await checkRateLimit(req, options);

    const headers = new Headers({
      'X-RateLimit-Limit': options.max.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetAt.getTime().toString(),
    });

    if (!result.success) {
      const retryAfter = result.retryAfter || Math.ceil(options.windowMs / 1000);
      headers.set('Retry-After', retryAfter.toString());

      const error = new RateLimitError(
        options.message || 'Too many requests, please try again later.',
        retryAfter,
        options.max,
        result.remaining,
        result.resetAt
      );

      return NextResponse.json(error.toEnvelope(req.url), {
        status: 429,
        headers,
      });
    }

    const response = await handler();

    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

/**
 * Pre-configured rate limit presets
 */
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
};

/**
 * Legacy rate limit function (backward compatibility)
 * @deprecated Use withRateLimit instead
 */
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  return function (req: any, res: any, next: any) {
    const clientIp = getClientIp(req);
    const key = `legacy:${clientIp}:${req.url}`;

    const now = Date.now();

    if (!memoryStore[key]) {
      memoryStore[key] = {
        count: 1,
        resetTime: now + options.windowMs,
      };
      return next();
    }

    if (memoryStore[key].resetTime < now) {
      memoryStore[key] = {
        count: 1,
        resetTime: now + options.windowMs,
      };
      return next();
    }

    if (memoryStore[key].count < options.max) {
      memoryStore[key].count++;
      return next();
    }

    res.status(429).json({
      error: options.message || 'Too many requests, please try again later.',
      retryAfter: Math.ceil((memoryStore[key].resetTime - now) / 1000),
    });
  };
}

function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
    'unknown'
  );
}

export interface SessionRateLimitOptions {
  windowMs: number;
  maxPerSession: number;
  maxPerIp: number;
}

export function sessionRateLimit(options: SessionRateLimitOptions) {
  return function (req: any, res: any, next: any) {
    const clientIp = getClientIp(req);
    const sessionId = req.body?.sessionId || req.query?.sessionId || req.headers['x-session-id'];

    const ipKey = `ip:${clientIp}:${req.url}`;
    const sessionKey = `session:${sessionId}:${req.url}`;

    const now = Date.now();

    if (!memoryStore[ipKey]) {
      memoryStore[ipKey] = {
        count: 1,
        resetTime: now + options.windowMs,
      };
    } else {
      if (memoryStore[ipKey].resetTime < now) {
        memoryStore[ipKey] = {
          count: 1,
          resetTime: now + options.windowMs,
        };
      } else if (memoryStore[ipKey].count >= options.maxPerIp) {
        res.status(429).json({
          error: 'Too many requests from this IP address.',
          retryAfter: Math.ceil((memoryStore[ipKey].resetTime - now) / 1000),
        });
        return;
      } else {
        memoryStore[ipKey].count++;
      }
    }

    if (sessionId) {
      if (!memoryStore[sessionKey]) {
        memoryStore[sessionKey] = {
          count: 1,
          resetTime: now + options.windowMs,
        };
      } else {
        if (memoryStore[sessionKey].resetTime < now) {
          memoryStore[sessionKey] = {
            count: 1,
            resetTime: now + options.windowMs,
          };
        } else if (memoryStore[sessionKey].count >= options.maxPerSession) {
          res.status(429).json({
            error: 'Too many requests for this conversation session.',
            retryAfter: Math.ceil((memoryStore[sessionKey].resetTime - now) / 1000),
          });
          return;
        } else {
          memoryStore[sessionKey].count++;
        }
      }
    }

    next();
  };
}
