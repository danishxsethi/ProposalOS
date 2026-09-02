/**
 * app/api/cron/nps-surveys/route.ts
 *
 * Task 4: NPS Automation Cron
 *
 * Runs daily. Finds projects that have hit the Day-30 or Day-90 completion milestone
 * and sends NPS surveys if not already sent for that day.
 */

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { processPendingNPSSurveys } from '@/lib/retention/nps';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;

  try {
    const result = await processPendingNPSSurveys();

    logger.info(
      {
        event: 'cron.nps_surveys.complete',
        processed: result.day30Processed + result.day90Processed,
        sent: result.sent,
      },
      'NPS survey cron complete'
    );

    return NextResponse.json({
      success: true,
      processed: result.day30Processed + result.day90Processed,
      ...result,
    });
  } catch (error) {
    logger.error({ event: 'cron.nps_surveys.error', error }, 'NPS Surveys Cron Error');
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
