import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/apiKeys';

/**
 * Middleware wrapper for API routes that enforces rate limiting
 * and adds rate limit headers to responses
 * 
 * @example
 * ```typescript
 * import { withRateLimit } from '@/lib/middleware/rateLimit';
 * 
 * async function handlePOST(req: Request) {
 *   // Your handler logic here
 *   return NextResponse.json({ success: true });
 * }
 * 
 * export const POST = withRateLimit(handlePOST);
 * ```
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
            // Type guard ensures we have all error properties
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
                    resetAt: error.resetAt
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': String(error.limit),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Used': String(error.used),
                        'X-RateLimit-Reset': error.resetAt.toISOString(),
                        'Retry-After': String(error.retryAfter)
                    }
                }
            );
        }

        // Rate limit OK - TypeScript now knows result has rateLimit property
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

        // Call the handler
        const response = await handler(req, ...args);

        // Add rate limit headers to successful responses
        if (response instanceof NextResponse) {
            response.headers.set('X-RateLimit-Limit', String(validResult.rateLimit.limit));
            response.headers.set('X-RateLimit-Remaining', String(validResult.rateLimit.remaining));
            response.headers.set('X-RateLimit-Used', String(validResult.rateLimit.used));
            response.headers.set('X-RateLimit-Reset', validResult.rateLimit.resetAt.toISOString());
        }

        return response;
    };
}

/**
 * Type guard to check if validation result is an error
 */
function isRateLimitError(result: any): result is {
    error: string;
    limit: number;
    used: number;
    remaining: number;
    resetAt: Date;
    retryAfter: number;
} {
    return 'error' in result;
}

/**
 * P1-8: Simple in-memory IP-based rate limiter for auth endpoints.
 * NOTE: Resets on process restart. For multi-replica deployments, use Redis.
 */
interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const _ipRequestCounts = new Map<string, RateLimitEntry>();

export function rateLimit({
    windowMs = 15 * 60 * 1000,
    maxRequests = 10,
}: {
    windowMs?: number;
    maxRequests?: number;
} = {}) {
    return (req: Request): { allowed: boolean; retryAfter?: number } => {
        const ip =
            req.headers.get('x-forwarded-for') ||
            req.headers.get('x-real-ip') ||
            'unknown';
        const now = Date.now();
        const entry = _ipRequestCounts.get(ip);

        if (!entry || now > entry.resetAt) {
            _ipRequestCounts.set(ip, { count: 1, resetAt: now + windowMs });
            return { allowed: true };
        }

        entry.count++;
        if (entry.count > maxRequests) {
            return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
        }

        return { allowed: true };
    };
}
