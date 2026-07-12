import { NextResponse } from 'next/server';

import { withSystemDbBypass } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { computeEngagementScore, isHotLead } from '@/lib/pipeline/dealCloser';
import type { PipelineConfig } from '@/lib/pipeline/types';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

/**
 * Pipeline Closing Cron Job
 *
 * Runs periodically to:
 * 1. Compute engagement scores for active prospects
 * 2. Identify hot leads (top N percentile)
 * 3. Transition hot leads to hot_lead status
 * 4. Route top 5% to Human Review Queue
 * 5. Send automated follow-ups to hot leads
 *
 * Triggered by: Vercel Cron or external scheduler
 * Frequency: Every 1 hour
 */

export async function GET(req: Request) {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;

  try {
    // Get all active tenants with pipeline config
    const tenants = await withSystemDbBypass('cron:pipeline-closing:list-tenants', (client) =>
      client.tenant.findMany({
        where: {
          pipelineConfig: {
            isNot: null,
          },
        },
        include: { pipelineConfig: true },
      })
    );

    const results = {
      tenantsProcessed: 0,
      prospectsScored: 0,
      hotLeadsIdentified: 0,
      errors: [] as string[],
    };

    for (const tenant of tenants) {
      try {
        await runWithTenantAsync(tenant.id, async () => {
          logger.info(
            { event: 'pipeline_closing.tenant_start', tenantId: tenant.id },
            'Processing tenant'
          );

          const config: PipelineConfig = {
            tenantId: tenant.id,
            concurrencyLimit: tenant.pipelineConfig?.concurrencyLimit || 10,
            batchSize: tenant.pipelineConfig?.batchSize || 50,
            painScoreThreshold: tenant.pipelineConfig?.painScoreThreshold || 60,
            dailyVolumeLimit: tenant.pipelineConfig?.dailyVolumeLimit || 200,
            spendingLimitCents: tenant.pipelineConfig?.spendingLimitCents || 100000,
            hotLeadPercentile: tenant.pipelineConfig?.hotLeadPercentile || 95,
          };

          const activeProspects = await prisma.prospectLead.findMany({
            where: {
              tenantId: tenant.id,
              pipelineStatus: 'outreach_sent',
              lastEngagementAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
              },
            },
            take: config.batchSize,
          });

          logger.info(
            {
              event: 'pipeline_closing.prospects_found',
              tenantId: tenant.id,
              count: activeProspects.length,
            },
            'Active prospects found'
          );

          for (const prospect of activeProspects) {
            try {
              // Compute engagement score
              const score = await computeEngagementScore(prospect.id);
              results.prospectsScored++;

              logger.info(
                {
                  event: 'pipeline_closing.prospect_scored',
                  prospectId: prospect.id,
                  score: score.total,
                },
                'Prospect scored'
              );

              // Check if hot lead
              const isHot = isHotLead(score, config);

              if (isHot) {
                logger.info(
                  {
                    event: 'pipeline_closing.hot_lead',
                    prospectId: prospect.id,
                    score: score.total,
                  },
                  'Hot lead identified'
                );
                results.hotLeadsIdentified++;

                // Transition to hot_lead status
                await prisma.prospectLead.update({
                  where: { id: prospect.id },
                  data: {
                    pipelineStatus: 'hot_lead',
                  },
                });

                // Check if in top 5% for human review
                const topPercentile = config.hotLeadPercentile || 95;
                if (topPercentile >= 95 && score.total >= 150) {
                  // Route to Human Review Queue
                  // In production, this would create a notification or queue entry
                  logger.info(
                    {
                      event: 'pipeline_closing.human_review_routed',
                      prospectId: prospect.id,
                      score: score.total,
                    },
                    'Routing to Human Review Queue'
                  );

                  await prisma.pipelineErrorLog.create({
                    data: {
                      tenantId: tenant.id,
                      stage: 'human_handoff',
                      prospectId: prospect.id,
                      errorType: 'HANDOFF_NOTIFICATION_PENDING',
                      errorMessage: 'High engagement lead requires human review',
                      metadata: { reason: 'high_engagement_score_hot_lead', score: score.total },
                    },
                  });
                }

                // Send automated follow-up
                // Future: Integrate with outreach system for personalized follow-up sequences
                logger.info(
                  { event: 'pipeline_closing.followup_eligible', prospectId: prospect.id },
                  'Follow-up eligibility recorded; dispatch remains in the durable outbound worker'
                );
              }
            } catch (error) {
              logger.error(`[Pipeline Closing] Error processing prospect ${prospect.id}:`, error);
              results.errors.push(
                `Prospect ${prospect.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }

          results.tenantsProcessed++;
        });
      } catch (error) {
        logger.error(`[Pipeline Closing] Error processing tenant ${tenant.id}:`, error);
        results.errors.push(
          `Tenant ${tenant.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    logger.info({ event: 'pipeline_closing.complete', results }, 'Cron job completed');

    return NextResponse.json({
      success: true,
      message: 'Pipeline closing cron job completed',
      results,
    });
  } catch (error) {
    logger.error('[Pipeline Closing] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for manual triggering (testing/admin)
 */
export async function POST(req: Request) {
  // Reuse GET logic for manual triggers
  return GET(req);
}
