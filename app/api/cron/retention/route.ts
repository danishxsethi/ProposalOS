/**
 * app/api/cron/retention/route.ts
 *
 * Cron endpoint for running all retention workflows
 * Runs daily to process:
 * - Re-engagement campaigns for inactive clients
 * - Win-back campaigns for churned clients
 * - Health score updates
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { updateClientDashboard } from '@/lib/client/health-score';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { runReEngagementCampaign } from '@/lib/retention/re-engagement';
import { runWinBackCampaign } from '@/lib/retention/win-back';

export const dynamic = 'force-dynamic';

/**
 * Inner handler for retention cron
 */
async function handleRetentionCron(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  try {
    const results = {
      reEngagement: { campaignsCreated: 0, emailsSent: 0, errors: [] as string[] },
      winBack: { campaignsCreated: 0, emailsSent: 0, errors: [] as string[] },
      healthScores: { updated: 0, errors: [] as string[] },
    };

    // Run re-engagement campaign
    try {
      const reEngagementResult = await runReEngagementCampaign();
      results.reEngagement = reEngagementResult;
    } catch (error) {
      logger.error({ error }, 'Re-engagement campaign failed');
      results.reEngagement.errors.push(String(error));
    }

    // Run win-back campaign
    try {
      const winBackResult = await runWinBackCampaign();
      results.winBack = winBackResult;
    } catch (error) {
      logger.error({ error }, 'Win-back campaign failed');
      results.winBack.errors.push(String(error));
    }

    // Update health scores for recent audits
    try {
      const recentAudits = await prisma.audit.findMany({
        where: {
          status: 'COMPLETE',
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        select: { id: true },
      });

      for (const audit of recentAudits) {
        try {
          await updateClientDashboard(audit.id);
          results.healthScores.updated++;
        } catch (error) {
          results.healthScores.errors.push(`Audit ${audit.id}: ${error}`);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Health score update failed');
      results.healthScores.errors.push(String(error));
    }

    const duration = Date.now() - startTime;

    logger.info(
      {
        duration,
        reEngagement: results.reEngagement,
        winBack: results.winBack,
        healthScores: results.healthScores,
      },
      'Retention cron completed'
    );

    const response = NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      results,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Retention cron failed');
    const internalError = new InternalError('Retention cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  return handleRetentionCron(req);
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
