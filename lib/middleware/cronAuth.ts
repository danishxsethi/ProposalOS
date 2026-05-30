import { createHash, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/middleware/rateLimit';

function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function timingSafeTokenEquals(a: string, b: string): boolean {
  // Hash to fixed-length buffers before comparison so we avoid length-based checks.
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Shared cron authentication helper.
 *
 * P0-B Fix: The old inline guard `if (CRON_SECRET && authHeader !== ...)` was broken —
 * if CRON_SECRET was unset, the `&&` short-circuited and the guard was never evaluated,
 * allowing unauthenticated access to all cron endpoints.
 *
 * This helper:
 *   - Returns generic HTTP 401 for all auth failures (including missing CRON_SECRET)
 *   - Uses timing-safe comparison for the bearer token
 *   - Returns null if authentication passes (caller should proceed)
 *
 * Usage:
 *   const authError = await verifyCronAuth(req);
 *   if (authError) return authError;
 */
export async function verifyCronAuth(req: Request | NextRequest): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error('[CRON] FATAL: CRON_SECRET environment variable is not set');
    return unauthorizedResponse();
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${cronSecret}`;

  if (!timingSafeTokenEquals(authHeader, expected)) {
    // Increment the failure rate limit counter on invalid attempts by IP
    const limitResult = await checkRateLimit(req, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      endpoint: 'cron-auth-failure',
      routeClass: 'cron',
      auditOnBlock: true,
      failClosed: true,
    });

    if (!limitResult.success) {
      return NextResponse.json(
        { error: 'Too many authentication attempts' },
        { status: 429, headers: { 'Retry-After': String(limitResult.retryAfter ?? 900) } }
      );
    }

    return unauthorizedResponse();
  }

  return null; // Auth passed
}
