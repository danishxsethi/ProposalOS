/**
 * app/api/cron/prompt-promotion/route.ts
 *
 * Task 2: Auto-Promotion Cron Job
 *
 * Runs daily. Queries the last 7 days of prompt_performance_logs, computes
 * per-variant quality and latency metrics, and auto-promotes winning variants
 * when they beat control by >= 10% quality with <= 20% latency increase.
 *
 * Minimum 50 samples per variant required before promotion is considered.
 */

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

const MIN_SAMPLE_SIZE = 50;
const MIN_QUALITY_IMPROVEMENT_PCT = 10; // >= 10% quality improvement
const MAX_LATENCY_INCREASE_PCT = 20; // <= 20% latency increase allowed

type PrismaWithPromptPromotionModels = typeof prisma & {
  promptPerformanceLog: {
    groupBy: (args: {
      by: ['experimentId', 'variantId'];
      where: {
        tenantId: string;
        timestamp: { gte: Date };
        experimentId: { not: null };
        variantId: { not: null };
      };
      _avg: {
        qualityScore: true;
        latencyMs: true;
      };
      _count: {
        _all: true;
      };
    }) => Promise<
      Array<{
        experimentId: string | null;
        variantId: string | null;
        _avg: {
          qualityScore: number | null;
          latencyMs: number | null;
        };
        _count: {
          _all: number;
        };
      }>
    >;
  };
  promptPromotionLog: {
    create: (args: {
      data: {
        promptId: string;
        winnerVariantId: string;
        loserVariantId: string;
        winnerAvgQuality: number;
        loserAvgQuality: number;
        qualityDeltaPct: number;
        winnerAvgLatencyMs: number;
        loserAvgLatencyMs: number;
        latencyIncreasePct: number;
        winnerSampleSize: number;
        loserSampleSize: number;
        note: string;
      };
    }) => Promise<{ id: string }>;
  };
  tenant: {
    findMany: (args: { select: { id: true } }) => Promise<Array<{ id: string }>>;
  };
};

export async function GET(req: Request) {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const promotions: Array<{
    experimentId: string;
    qualityDeltaPct: number;
    latencyIncreasePct: number;
    promotionLogId: string;
  }> = [];
  const skipped: Array<{ experimentId: string; reason: string }> = [];
  const prismaWithModels = prisma as PrismaWithPromptPromotionModels;

  try {
    const tenants = await runWithTenantBypass('cron-prompt-promotion-tenant-enumeration', () =>
      prismaWithModels.tenant.findMany({ select: { id: true } })
    );

    for (const tenant of tenants) {
      await runWithTenantAsync(tenant.id, async () => {
        const rows = await prismaWithModels.promptPerformanceLog.groupBy({
          by: ['experimentId', 'variantId'],
          where: {
            tenantId: tenant.id,
            timestamp: { gte: sevenDaysAgo },
            experimentId: { not: null },
            variantId: { not: null },
          },
          _avg: {
            qualityScore: true,
            latencyMs: true,
          },
          _count: {
            _all: true,
          },
        });

        const byExperiment = new Map<
          string,
          Map<
            string,
            {
              avgQuality: number;
              avgLatencyMs: number;
              sampleSize: number;
            }
          >
        >();

        for (const row of rows) {
          if (!row.experimentId || !row.variantId) {
            continue;
          }

          if (!byExperiment.has(row.experimentId)) {
            byExperiment.set(row.experimentId, new Map());
          }

          byExperiment.get(row.experimentId)!.set(row.variantId, {
            avgQuality: row._avg.qualityScore ?? 0,
            avgLatencyMs: row._avg.latencyMs ?? 0,
            sampleSize: row._count._all ?? 0,
          });
        }

        for (const [experimentId, variants] of byExperiment.entries()) {
          const controlMetrics = variants.get('control');
          const variantMetrics = variants.get('variant');

          if (!controlMetrics || !variantMetrics) {
            skipped.push({ experimentId, reason: 'Missing control or variant data' });
            continue;
          }

          if (
            controlMetrics.sampleSize < MIN_SAMPLE_SIZE ||
            variantMetrics.sampleSize < MIN_SAMPLE_SIZE
          ) {
            skipped.push({
              experimentId,
              reason: `Insufficient samples (control=${controlMetrics.sampleSize}, variant=${variantMetrics.sampleSize})`,
            });
            continue;
          }

          const qualityDeltaPct =
            ((variantMetrics.avgQuality - controlMetrics.avgQuality) /
              Math.max(0.01, controlMetrics.avgQuality)) *
            100;

          const latencyIncreasePct =
            ((variantMetrics.avgLatencyMs - controlMetrics.avgLatencyMs) /
              Math.max(1, controlMetrics.avgLatencyMs)) *
            100;

          const qualityWins = qualityDeltaPct >= MIN_QUALITY_IMPROVEMENT_PCT;
          const latencyOk = latencyIncreasePct <= MAX_LATENCY_INCREASE_PCT;

          if (qualityWins && latencyOk) {
            const log = await prismaWithModels.promptPromotionLog.create({
              data: {
                promptId: experimentId,
                winnerVariantId: 'variant',
                loserVariantId: 'control',
                winnerAvgQuality: variantMetrics.avgQuality,
                loserAvgQuality: controlMetrics.avgQuality,
                qualityDeltaPct,
                winnerAvgLatencyMs: variantMetrics.avgLatencyMs,
                loserAvgLatencyMs: controlMetrics.avgLatencyMs,
                latencyIncreasePct,
                winnerSampleSize: variantMetrics.sampleSize,
                loserSampleSize: controlMetrics.sampleSize,
                note: `Auto-promoted by cron: +${qualityDeltaPct.toFixed(1)}% quality, +${latencyIncreasePct.toFixed(1)}% latency`,
              },
            });

            logger.info(
              { tenantId: tenant.id, experimentId, qualityDeltaPct, latencyIncreasePct },
              '[PromptPromotion] Variant B promoted'
            );

            promotions.push({
              experimentId,
              qualityDeltaPct: Math.round(qualityDeltaPct * 10) / 10,
              latencyIncreasePct: Math.round(latencyIncreasePct * 10) / 10,
              promotionLogId: log.id,
            });
          } else {
            skipped.push({
              experimentId,
              reason: qualityWins
                ? `Latency increase too high (${latencyIncreasePct.toFixed(1)}%)`
                : `Quality improvement below threshold (${qualityDeltaPct.toFixed(1)}%)`,
            });
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      promoted: promotions.length,
      skippedCount: skipped.length,
      promotions,
      skippedDetails: skipped,
    });
  } catch (error) {
    logger.error({ err: error }, '[PromptPromotion] Cron failed');
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
