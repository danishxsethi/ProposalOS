/**
 * Retention Cron API
 * 
 * This endpoint is called by GCP Cloud Scheduler to process:
 * - NPS Surveys (Day 30 and Day 90)
 * - Scheduled re-audits
 * - Competitor monitoring for upsells
 * 
 * Schedule: Every day at 6:00 AM UTC
 */

import { NextResponse } from 'next/server';
import { runRetentionWorkflow } from '@/lib/graph/retention-graph';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startTime = Date.now();

  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    logger.info({}, 'Starting retention workflow');

    const result = await runRetentionWorkflow();

    const duration = Date.now() - startTime;

    logger.info({
      duration,
      ...result
    }, 'Retention workflow completed');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      ...result
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error({
      err: error,
      duration
    }, 'Retention workflow failed');

    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`
    }, { status: 500 });
  }
}

// Also handle POST for manual triggering
export async function POST(request: Request) {
  return GET(request);
}
