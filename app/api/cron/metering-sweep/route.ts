/**
 * app/api/cron/metering-sweep/route.ts
 *
 * Cron endpoint: sweep unreported UsageRecords and submit to Stripe.
 *
 * Schedule: every 5 minutes (configured in Cloud Scheduler / cron.yaml)
 * Auth: CRON_SECRET bearer token (same as pipeline-outreach)
 *
 * This is the durable delivery guarantee for metering — the inline
 * fire-and-forget in trackUsage is best-effort; this sweep catches
 * anything that failed or was lost in a serverless cold-shutdown.
 *
 * Poison handling:
 * - Tenants without stripeCustomerId → marked NOT_BILLABLE (never retried)
 * - Records older than 34 days → marked EXPIRED_UNDELIVERED (Stripe rejects)
 *
 * [#1]
 */

import { NextResponse } from 'next/server';

import { sweepUnreportedUsage } from '@/lib/billing/metering';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';

export async function POST(req: Request) {
  const authResult = verifyCronAuth(req);
  if (authResult) return authResult; // 401 if auth fails

  try {
    const result = await sweepUnreportedUsage(100);

    logger.info(
      { ...result, endpoint: '/api/cron/metering-sweep' },
      '[Cron] Metering sweep completed'
    );

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, '[Cron] Metering sweep failed');
    return NextResponse.json(
      { error: 'Sweep failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
