/**
 * lib/middleware/workerAuth.ts
 *
 * Internal Worker Authentication
 *
 * Authenticates requests from the internal job dispatcher (Cloud Tasks,
 * Cloud Run jobs, or cron) to the worker endpoint.
 *
 * Uses the same timing-safe bearer-token pattern as verifyCronAuth.
 * Secret is WORKER_SECRET in env.
 *
 * Returns null when auth passes; returns NextResponse 401 on failure.
 */

import { createHash, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/middleware/rateLimit';

function timingSafeTokenEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function verifyWorkerAuth(req: Request | NextRequest): Promise<NextResponse | null> {
  const secret = process.env.WORKER_SECRET;

  if (!secret) {
    logger.error(
      { event: 'worker_auth.missing_secret' },
      '[WorkerAuth] FATAL: WORKER_SECRET environment variable is not set'
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  if (!timingSafeTokenEquals(authHeader, expected)) {
    logger.warn({ event: 'worker_auth.invalid_token' }, '[WorkerAuth] Invalid token');

    const limitResult = await checkRateLimit(req, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      endpoint: 'worker_auth_failure',
      routeClass: 'worker',
      auditOnBlock: true,
      failClosed: true,
    });

    if (!limitResult.success) {
      return NextResponse.json(
        { error: 'Too many unauthorized attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limitResult.retryAfter ?? 900) } }
      );
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null; // Auth passed
}
