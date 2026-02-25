/**
 * Email Sequence Scheduler Cron API
 * 
 * This endpoint is called by GCP Cloud Scheduler to process:
 * - Email sequence sending based on branching logic
 * - Determines next email to send based on open/click engagement
 * 
 * Schedule: Every hour (integrates with pipeline-outreach)
 */

import { NextResponse } from 'next/server';
import { runEmailScheduler } from '@/lib/graph/email-scheduler-graph';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startTime = Date.now();
  
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    logger.info({}, 'Starting email scheduler');
    
    const result = await runEmailScheduler();
    
    const duration = Date.now() - startTime;
    
    logger.info({
      duration,
      ...result
    }, 'Email scheduler completed');

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
    }, 'Email scheduler failed');

    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
