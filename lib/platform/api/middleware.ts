/**
 * Shared middleware for Public REST API v1 routes.
 * Validates API key, enforces rate limits, and returns tenant context.
 */

import { NextResponse } from 'next/server';
import { validateAPIKey, checkRateLimit } from './auth';
import type { APIPermission, ValidatedKey } from './auth';

export type { ValidatedKey };

export interface AuthContext {
  tenantId: string;
  keyId: string;
  permissions: APIPermission[];
}

/**
 * Authenticate a request and check rate limits.
 * Returns AuthContext on success, or a NextResponse error on failure.
 */
export async function authenticateRequest(
  req: Request
): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
      { status: 401 }
    );
  }

  const rawKey = authHeader.slice(7);
  const validated = await validateAPIKey(rawKey);

  if (!validated) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or expired API key' },
      { status: 401 }
    );
  }

  const rateResult = checkRateLimit(
    validated.keyId,
    validated.rateLimitHour,
    validated.rateLimitDay
  );

  if (!rateResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        resetAt: rateResult.resetAt,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateResult.resetAt.toISOString(),
          'Retry-After': String(
            Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  return {
    tenantId: validated.tenantId,
    keyId: validated.keyId,
    permissions: validated.permissions,
  };
}

/** Add rate-limit headers to a successful response */
export function withRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: Date
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
  return response;
}
