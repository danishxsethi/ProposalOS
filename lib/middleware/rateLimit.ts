import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/apiKeys';

// ─── IP-Based In-Memory Limiter ────────────────────────────────────────────────
/**
 * P1-8: Simple in-memory IP-based rate limiter for auth endpoints.
 *
 * NOTE: Resets on process restart. For multi-replica Cloud Run deployments,
 * replace `limitMap` with a Redis client (ioredis) using INCR + EXPIRE.
 *
 * Usage (preset):
 *   const blocked = registerRateLimit(req);
 *   if (blocked) return blocked;
 *
 * Usage (custom):
 *   const check = rateLimit({ windowMs: 60_000, maxRequests: 30 });
 *   const { allowed, retryAfter } = check(req);
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const _limitMap = new Map<string, RateLimitEntry>();

// Stale-entry cleanup — prevent unbounded memory growth
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _limitMap) {
        if (now > entry.resetAt) _limitMap.delete(key);
    }
}, 10 * 60 * 1000); // every 10 minutes

export function rateLimit({
    windowMs = 15 * 60 * 1000,
    maxRequests = 10,
}: {
    windowMs?: number;
    maxRequests?: number;
} = {}) {
    return (req: Request): { allowed: boolean; retryAfter?: number } => {
        const ip =
            req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
            req.headers.get('x-real-ip') ||
            'unknown';
        const now = Date.now();
        const entry = _limitMap.get(ip);

        if (!entry || now > entry.resetAt) {
            _limitMap.set(ip, { count: 1, resetAt: now + windowMs });
            return { allowed: true };
        }

        entry.count++;
        if (entry.count > maxRequests) {
            return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
        }

        return { allowed: true };
    };
}

/**
 * Returns NextResponse 429 if rate limit exceeded, null if allowed.
 * Drop-in helper that produces a ready response instead of a boolean.
 */
export function withRateLimitCheck(
    limiter: ReturnType<typeof rateLimit>
) {
    return (req: Request): NextResponse | null => {
        const { allowed, retryAfter } = limiter(req);
        if (!allowed) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': String(retryAfter ?? 60) },
                }
            );
        }
        return null;
    };
}

// ─── Preset Limiters ──────────────────────────────────────────────────────────
/** 10 attempts per 15 minutes — for registration */
export const registerRateLimit = withRateLimitCheck(
    rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10 })
);

/** 10 sign-in attempts per 15 minutes — for NextAuth callbacks */
export const authRateLimit = withRateLimitCheck(
    rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10 })
);

/** 60 requests per minute — for general API endpoints */
export const apiRateLimit = withRateLimitCheck(
    rateLimit({ windowMs: 60 * 1000, maxRequests: 60 })
);

// ─── API-Key–Based Rate Limiter (per-tenant, DB-backed) ────────────────────────
/**
 * Original withRateLimit — validates the Bearer API key AND enforces the
 * per-day quota stored in the ApiKey DB record.
 *
 * Keep separate from the IP-based limiter above; different concern.
 */
export function withRateLimit(handler: Function) {
    return async (req: Request, ...args: any[]) => {
        // Extract API key from Authorization header
        const authHeader = req.headers.get('authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
                { status: 401 }
            );
        }

        const apiKey = authHeader.split(' ')[1];
        const result = await validateApiKey(apiKey);

        if (!result) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Invalid or expired API key' },
                { status: 401 }
            );
        }

        // Check if rate limit exceeded
        if ('error' in result && result.error) {
            const error = result as {
                error: string;
                limit: number;
                used: number;
                remaining: number;
                resetAt: Date;
                retryAfter: number;
            };

            return NextResponse.json(
                {
                    error: error.error,
                    message: `Rate limit of ${error.limit} requests per day exceeded. Resets at ${error.resetAt.toISOString()}`,
                    limit: error.limit,
                    used: error.used,
                    resetAt: error.resetAt,
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': String(error.limit),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Used': String(error.used),
                        'X-RateLimit-Reset': error.resetAt.toISOString(),
                        'Retry-After': String(error.retryAfter),
                    },
                }
            );
        }

        const validResult = result as {
            tenantId: string;
            scopes: string[];
            planTier: string;
            rateLimit: {
                limit: number;
                used: number;
                remaining: number;
                resetAt: Date;
            };
        };

        const response = await handler(req, ...args);

        if (response instanceof NextResponse) {
            response.headers.set('X-RateLimit-Limit', String(validResult.rateLimit.limit));
            response.headers.set('X-RateLimit-Remaining', String(validResult.rateLimit.remaining));
            response.headers.set('X-RateLimit-Used', String(validResult.rateLimit.used));
            response.headers.set('X-RateLimit-Reset', validResult.rateLimit.resetAt.toISOString());
        }

        return response;
    };
}
