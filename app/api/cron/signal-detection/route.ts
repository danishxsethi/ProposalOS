import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  runDetection,
  deduplicateSignals,
  triggerSignalOutreach,
  signalExists,
} from '@/lib/pipeline/signalDetector';
import type { SignalType } from '@/lib/pipeline/types';

const MAX_TENANTS_PER_RUN = 5;

/**
 * Signal detection cron endpoint
 * 
 * Runs signal checks on configurable schedule:
 * - bad_review: Every 6 hours
 * - website_change: Daily
 * - competitor_upgrade: Daily
 * - new_business_license: Weekly
 * - hiring_spike: Weekly
 * 
 * Requirements: 14.6
 */
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
    // 2. Find tenants with active PipelineConfig where signal_detection is not paused
    const configs = await prisma.pipelineConfig.findMany({
      take: MAX_TENANTS_PER_RUN,
      orderBy: { updatedAt: 'asc' },
    });

    const activeConfigs = configs.filter((cfg) => {
      const paused = Array.isArray(cfg.pausedStages)
        ? (cfg.pausedStages as string[])
        : [];
      return !paused.includes('signal_detection');
    });

    if (activeConfigs.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No active tenants for signal detection',
      });
    }

    logger.info(
      {
        event: 'cron.signal_detection.start',
        count: activeConfigs.length,
      },
      `Processing signal detection for ${activeConfigs.length} tenants`
    );

    const results: Array<{
      tenantId: string;
      status: string;
      signalsDetected?: number;
      signalsTriggered?: number;
      signalsByType?: Record<string, number>;
      error?: string;
    }> = [];

    // 3. Define signal types to check based on schedule
    // In a real implementation, this would check the current time against schedules
    // For now, we'll run all signal types
    const signalTypes: SignalType[] = [
      'bad_review',
      'website_change',
      'competitor_upgrade',
      'new_business_license',
      'hiring_spike',
    ];

    // 4. Process each tenant
    for (const config of activeConfigs) {
      try {
        logger.info(
          {
            event: 'cron.signal_detection.tenant_start',
            tenantId: config.tenantId,
          },
          `Starting signal detection for tenant ${config.tenantId}`
        );

        let totalDetected = 0;
        let totalTriggered = 0;
        const signalsByType: Record<string, number> = {};

        // Fire-and-forget: kick off signal detection without awaiting full completion
        (async () => {
          try {
            // Run detection for each signal type
            for (const signalType of signalTypes) {
              try {
                logger.info(
                  {
                    event: 'cron.signal_detection.type_start',
                    tenantId: config.tenantId,
                    signalType,
                  },
                  `Running ${signalType} detection for tenant ${config.tenantId}`
                );

                // Run detection
                const signals = await runDetection(config.tenantId, signalType);

                // Deduplicate signals
                const dedupedSignals = deduplicateSignals(signals);

                logger.info(
                  {
                    event: 'cron.signal_detection.type_detected',
                    tenantId: config.tenantId,
                    signalType,
                    detected: signals.length,
                    afterDedup: dedupedSignals.length,
                  },
                  `Detected ${dedupedSignals.length} ${signalType} signals for tenant ${config.tenantId}`
                );

                totalDetected += dedupedSignals.length;
                signalsByType[signalType] = dedupedSignals.length;

                // Trigger outreach for each signal (with DB-level deduplication)
                for (const signal of dedupedSignals) {
                  try {
                    // Check if signal already exists in DB
                    const exists = await signalExists(
                      config.tenantId,
                      signal.leadId,
                      signalType
                    );

                    if (!exists) {
                      await triggerSignalOutreach(signal);
                      totalTriggered++;

                      logger.info(
                        {
                          event: 'cron.signal_detection.outreach_triggered',
                          tenantId: config.tenantId,
                          signalType,
                          leadId: signal.leadId,
                          priority: signal.priority,
                        },
                        `Triggered outreach for ${signalType} signal`
                      );
                    } else {
                      logger.info(
                        {
                          event: 'cron.signal_detection.signal_duplicate',
                          tenantId: config.tenantId,
                          signalType,
                          leadId: signal.leadId,
                        },
                        `Skipping duplicate ${signalType} signal`
                      );
                    }
                  } catch (err) {
                    logger.error(
                      {
                        event: 'cron.signal_detection.outreach_error',
                        tenantId: config.tenantId,
                        signalType,
                        leadId: signal.leadId,
                        error: err instanceof Error ? err.message : String(err),
                      },
                      `Error triggering outreach for ${signalType} signal`
                    );
                  }
                }
              } catch (err) {
                logger.error(
                  {
                    event: 'cron.signal_detection.type_error',
                    tenantId: config.tenantId,
                    signalType,
                    error: err instanceof Error ? err.message : String(err),
                  },
                  `Error running ${signalType} detection for tenant ${config.tenantId}`
                );
              }
            }

            logger.info(
              {
                event: 'cron.signal_detection.tenant_complete',
                tenantId: config.tenantId,
                totalDetected,
                totalTriggered,
                signalsByType,
              },
              `Signal detection complete for tenant ${config.tenantId}`
            );
          } catch (err) {
            logger.error(
              {
                event: 'cron.signal_detection.tenant_failed',
                tenantId: config.tenantId,
                error: err instanceof Error ? err.message : String(err),
              },
              `Signal detection failed for tenant ${config.tenantId}`
            );
          }
        })();

        results.push({
          tenantId: config.tenantId,
          status: 'Started',
        });
      } catch (err) {
        logger.error(
          {
            event: 'cron.signal_detection.tenant_error',
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
        event: 'cron.signal_detection.complete',
        processed: results.length,
        started: results.filter((r) => r.status === 'Started').length,
        failed: results.filter((r) => r.status === 'Failed').length,
      },
      'Signal detection cron complete'
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    logger.error(
      {
        event: 'cron.signal_detection.error',
        error,
      },
      'Signal Detection Cron Error'
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
