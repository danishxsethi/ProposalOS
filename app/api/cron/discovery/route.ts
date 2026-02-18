import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { discover } from '@/lib/pipeline/discovery';
import type { DiscoveryConfig } from '@/lib/pipeline/types';

const MAX_TENANTS_PER_RUN = 5;

export async function GET(req: Request) {
  // 1. CRON_SECRET auth
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Find tenants with active PipelineConfig where discovery is not paused
    const configs = await prisma.pipelineConfig.findMany({
      take: MAX_TENANTS_PER_RUN,
      orderBy: { updatedAt: 'asc' },
    });

    // Filter out tenants that have 'discovery' in their pausedStages
    const activeConfigs = configs.filter((cfg) => {
      const paused = Array.isArray(cfg.pausedStages)
        ? (cfg.pausedStages as string[])
        : [];
      return !paused.includes('discovery');
    });

    if (activeConfigs.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No active tenants for discovery',
      });
    }

    logger.info(
      {
        event: 'cron.discovery.start',
        count: activeConfigs.length,
      },
      `Processing discovery for ${activeConfigs.length} tenants`
    );

    const results: Array<{
      tenantId: string;
      status: string;
      prospectsFound?: number;
      prospectsQualified?: number;
      error?: string;
    }> = [];

    // 3. Process each tenant
    for (const config of activeConfigs) {
      try {
        // Look for a queued/pending discovery job for this tenant to get city/vertical
        const job = await prisma.prospectDiscoveryJob.findFirst({
          where: {
            tenantId: config.tenantId,
            status: 'QUEUED',
          },
          orderBy: { nextRunAt: 'asc' },
        });

        // Build DiscoveryConfig from the job or use defaults
        const discoveryConfig: DiscoveryConfig = job
          ? {
              city: job.city,
              state: job.state ?? undefined,
              vertical: job.vertical,
              targetLeads: job.targetLeads,
              painThreshold: job.painThreshold,
              sources: (job.sourceConfig as {
                googlePlaces: boolean;
                yelp: boolean;
                directories: boolean;
              }) ?? {
                googlePlaces: true,
                yelp: true,
                directories: true,
              },
            }
          : {
              city: 'default',
              vertical: 'general',
              targetLeads: config.dailyVolumeLimit,
              painThreshold: config.painScoreThreshold,
              sources: {
                googlePlaces: true,
                yelp: true,
                directories: true,
              },
            };

        logger.info(
          {
            event: 'cron.discovery.tenant_start',
            tenantId: config.tenantId,
            city: discoveryConfig.city,
            vertical: discoveryConfig.vertical,
            hasJob: !!job,
          },
          `Starting discovery for tenant ${config.tenantId}`
        );

        // Mark job as running if we have one
        if (job) {
          await prisma.prospectDiscoveryJob.update({
            where: { id: job.id },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
              runAttempts: { increment: 1 },
            },
          });
        }

        // Fire-and-forget: kick off discovery without awaiting full completion
        discover(discoveryConfig, config.tenantId)
          .then(async (result) => {
            logger.info(
              {
                event: 'cron.discovery.tenant_complete',
                tenantId: config.tenantId,
                prospectsFound: result.prospectsFound,
                prospectsQualified: result.prospectsQualified,
              },
              `Discovery complete for tenant ${config.tenantId}`
            );

            // Update job status if we had one
            if (job) {
              await prisma.prospectDiscoveryJob.update({
                where: { id: job.id },
                data: {
                  status: 'COMPLETE',
                  completedAt: new Date(),
                  discoveredCount: result.prospectsFound,
                  qualifiedCount: result.prospectsQualified,
                },
              });
            }
          })
          .catch(async (err) => {
            logger.error(
              {
                event: 'cron.discovery.tenant_failed',
                tenantId: config.tenantId,
                error: err instanceof Error ? err.message : String(err),
              },
              `Discovery failed for tenant ${config.tenantId}`
            );

            if (job) {
              await prisma.prospectDiscoveryJob.update({
                where: { id: job.id },
                data: {
                  status: 'FAILED',
                  lastError: err instanceof Error ? err.message : String(err),
                },
              });
            }
          });

        results.push({
          tenantId: config.tenantId,
          status: 'Started',
          ...(job ? { city: discoveryConfig.city, vertical: discoveryConfig.vertical } as Record<string, string> : {}),
        });
      } catch (err) {
        logger.error(
          {
            event: 'cron.discovery.tenant_error',
            tenantId: config.tenantId,
            error: err,
          },
          `Error processing tenant ${config.tenantId}`
        );

        results.push({
          tenantId: config.tenantId,
          status: 'Failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info(
      {
        event: 'cron.discovery.complete',
        processed: results.length,
        started: results.filter((r) => r.status === 'Started').length,
        failed: results.filter((r) => r.status === 'Failed').length,
      },
      'Discovery cron complete'
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    logger.error(
      {
        event: 'cron.discovery.error',
        error,
      },
      'Discovery Cron Error'
    );

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
