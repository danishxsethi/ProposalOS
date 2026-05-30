/**
 * app/api/cron/email-sequence/route.ts
 *
 * Email Sequence Scheduler Cron API
 *
 * This endpoint is called by GCP Cloud Scheduler to process:
 * - Email sequence sending based on branching logic
 * - Determines next email to send based on open/click engagement
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { runEmailScheduler } from '@/lib/graph/email-scheduler-graph';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Inner handler for email sequence cron
 */
async function handleEmailSequenceCron(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  try {
    logger.info({}, 'Starting email scheduler');

    const result = await runEmailScheduler();

    const duration = Date.now() - startTime;

    logger.info(
      {
        duration,
        ...result,
      },
      'Email scheduler completed'
    );

    const response = NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      ...result,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        err: error,
        duration,
      },
      'Email scheduler failed'
    );

    const internalError = new InternalError('Email scheduler failed', {
      originalError: error.message || String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleEmailSequenceCron(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
export const POST = rateLimitedHandler;
