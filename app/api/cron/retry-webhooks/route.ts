/**
 * app/api/cron/retry-webhooks/route.ts
 *
 * Webhook Retry Cron Job
 * Retries failed Stripe webhook deliveries
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { WebhookRetryService } from '@/lib/stripe/webhookRetryService';

/**
 * Inner handler for webhook retry cron
 */
async function handleRetryWebhooks(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    logger.info({ event: 'webhook_retry.start' }, 'Starting webhook retry cron job');

    const startTime = Date.now();
    const result = await WebhookRetryService.retryFailedWebhooks();
    const duration = Date.now() - startTime;

    logger.info(
      {
        event: 'webhook_retry.complete',
        processed: result.processed,
        errors: result.errors,
        durationMs: duration,
      },
      'Webhook retry completed'
    );

    const response = NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      duration: `${duration}ms`,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Webhook retry cron job failed:', error);
    const internalError = new InternalError('Webhook retry cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleRetryWebhooks(req);
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
