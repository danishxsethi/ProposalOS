import { createHash, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

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
 *   const authError = verifyCronAuth(req);
 *   if (authError) return authError;
 */
export function verifyCronAuth(req: Request | NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[CRON] FATAL: CRON_SECRET environment variable is not set');
    return unauthorizedResponse();
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${cronSecret}`;

  if (!timingSafeTokenEquals(authHeader, expected)) {
    return unauthorizedResponse();
  }

  return null; // Auth passed
}
