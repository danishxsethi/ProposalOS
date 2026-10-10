import { createHash, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/middleware/rateLimit';

function timingSafeTokenEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Verify the bearer credentials used by read-only admin telemetry routes.
 * Missing configuration fails closed. Invalid attempts use the shared
 * fail-closed rate limiter, matching the cron authentication boundary.
 */
export async function verifyAdminOrCronAuth(req: Request): Promise<NextResponse | null> {
  const configuredSecrets = [process.env.ADMIN_API_KEY, process.env.CRON_SECRET].filter(
    (secret): secret is string => Boolean(secret)
  );

  if (configuredSecrets.length === 0) {
    logger.error('[ADMIN] FATAL: ADMIN_API_KEY and CRON_SECRET are not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supplied = req.headers.get('authorization') ?? '';
  if (configuredSecrets.some((secret) => timingSafeTokenEquals(supplied, `Bearer ${secret}`))) {
    return null;
  }

  const limitResult = await checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 5,
    endpoint: 'admin-auth-failure',
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

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
