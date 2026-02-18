import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeEngagementScore, isHotLead } from '@/lib/pipeline/dealCloser';
import type { PipelineConfig } from '@/lib/pipeline/types';

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
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Pipeline Closing] Starting cron job...');

    // Get all active tenants with pipeline config
    const tenants = await prisma.tenant.findMany({
      where: {
        pipelineConfig: {
          isNot: null,
        },
      },
      include: {
        pipelineConfig: true,
      },
    });

    const results = {
      tenantsProcessed: 0,
      prospectsScored: 0,
      hotLeadsIdentified: 0,
      errors: [] as string[],
    };

    for (const tenant of tenants) {
      try {
        console.log(`[Pipeline Closing] Processing tenant: ${tenant.id}`);

        // Get pipeline config
        const config: PipelineConfig = {
          tenantId: tenant.id,
          concurrencyLimit: tenant.pipelineConfig?.concurrencyLimit || 10,
          batchSize: tenant.pipelineConfig?.batchSize || 50,
          painScoreThreshold: tenant.pipelineConfig?.painScoreThreshold || 60,
          dailyVolumeLimit: tenant.pipelineConfig?.dailyVolumeLimit || 200,
          spendingLimitCents: tenant.pipelineConfig?.spendingLimitCents || 100000,
          hotLeadPercentile: tenant.pipelineConfig?.hotLeadPercentile || 95,
        };

        // Get active prospects (outreach_sent status with recent engagement)
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

        console.log(
          `[Pipeline Closing] Found ${activeProspects.length} active prospects for tenant ${tenant.id}`
        );

        for (const prospect of activeProspects) {
          try {
            // Compute engagement score
            const score = await computeEngagementScore(prospect.id);
            results.prospectsScored++;

            console.log(
              `[Pipeline Closing] Prospect ${prospect.id} engagement score: ${score.total}`
            );

            // Check if hot lead
            const isHot = isHotLead(score, config);

            if (isHot) {
              console.log(`[Pipeline Closing] Hot lead identified: ${prospect.id}`);
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
                console.log(
                  `[Pipeline Closing] Routing to Human Review Queue: ${prospect.id}`
                );

                // TODO: Create human review queue entry
                // await prisma.humanReviewQueueEntry.create({
                //   data: {
                //     tenantId: tenant.id,
                //     leadId: prospect.id,
                //     reason: 'high_engagement_score',
                //     score: score.total,
                //   },
                // });
              }

              // Send automated follow-up
              // TODO: Integrate with outreach system
              console.log(`[Pipeline Closing] Sending follow-up to: ${prospect.id}`);
            }
          } catch (error) {
            console.error(
              `[Pipeline Closing] Error processing prospect ${prospect.id}:`,
              error
            );
            results.errors.push(
              `Prospect ${prospect.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        results.tenantsProcessed++;
      } catch (error) {
        console.error(`[Pipeline Closing] Error processing tenant ${tenant.id}:`, error);
        results.errors.push(
          `Tenant ${tenant.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log('[Pipeline Closing] Cron job completed:', results);

    return NextResponse.json({
      success: true,
      message: 'Pipeline closing cron job completed',
      results,
    });
  } catch (error) {
    console.error('[Pipeline Closing] Fatal error:', error);
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
