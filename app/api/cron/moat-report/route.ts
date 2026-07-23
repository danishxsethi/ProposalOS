/**
 * Moat Report Cron Endpoint
 * Runs weekly moat report generation and negative trend detection.
 * Schedule: every Monday at 9am ("0 9 * * 1")
 * Reqs: 20.7
 */

import { NextResponse } from 'next/server';
import { generateWeeklyMoatReport } from '@/lib/platform/metrics/moatAlerting';

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await generateWeeklyMoatReport();

    return NextResponse.json({
      success: true,
      negativeTrendsCount: result.negativeTrends.length,
      alertsSentCount: result.alertsSent.length,
      alertIds: result.alertsSent.map((a) => a.id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
