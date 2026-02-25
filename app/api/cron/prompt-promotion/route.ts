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
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MIN_SAMPLE_SIZE = 50;
const MIN_QUALITY_IMPROVEMENT_PCT = 10; // >= 10% quality improvement
const MAX_LATENCY_INCREASE_PCT = 20;    // <= 20% latency increase allowed

// Raw SQL is used for this module because prompt_performance_logs lives
// in the self-evolving-prompts raw schema, not Prisma-managed tables.
// We use Prisma's $queryRaw for consistency with the rest of the codebase.

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const promotions: any[] = [];
    const skipped: any[] = [];

    try {
        // Aggregate metrics per (experiment_id, variant_id) for last 7 days
        const rows: any[] = await prisma.$queryRaw`
            SELECT
                experiment_id  AS "experimentId",
                variant_id     AS "variantId",
                AVG(quality_score)  AS "avgQuality",
                AVG(latency_ms)     AS "avgLatencyMs",
                COUNT(*)::int       AS "sampleSize"
            FROM prompt_performance_logs
            WHERE timestamp >= ${sevenDaysAgo}
              AND experiment_id IS NOT NULL
              AND variant_id    IS NOT NULL
            GROUP BY experiment_id, variant_id
        `;

        // Group by experimentId -> map variantId -> metrics
        const byExperiment = new Map<string, Map<string, typeof rows[0]>>();
        for (const row of rows) {
            if (!byExperiment.has(row.experimentId)) {
                byExperiment.set(row.experimentId, new Map());
            }
            byExperiment.get(row.experimentId)!.set(row.variantId, row);
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
                    Math.max(0.01, controlMetrics.avgQuality)) * 100;

            const latencyIncreasePct =
                ((variantMetrics.avgLatencyMs - controlMetrics.avgLatencyMs) /
                    Math.max(1, controlMetrics.avgLatencyMs)) * 100;

            const qualityWins = qualityDeltaPct >= MIN_QUALITY_IMPROVEMENT_PCT;
            const latencyOk = latencyIncreasePct <= MAX_LATENCY_INCREASE_PCT;

            if (qualityWins && latencyOk) {
                // Promote variant B as the new primary
                const log = await (prisma as any).promptPromotionLog.create({
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
                    { experimentId, qualityDeltaPct, latencyIncreasePct },
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
            { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
