/**
 * app/api/cron/reconcile-billing/route.ts
 *
 * Billing Reconciliation Cron Job
 * Reconciles Stripe subscriptions with local database records
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { reconcileSubscriptions } from '@/lib/stripe/reconcile';

/**
 * Inner handler for billing reconciliation cron
 */
async function handleReconcileBilling(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const result = await reconcileSubscriptions();

    const response = NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Billing reconciliation cron error:', error);
    const internalError = new InternalError('Billing reconciliation cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleReconcileBilling(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
