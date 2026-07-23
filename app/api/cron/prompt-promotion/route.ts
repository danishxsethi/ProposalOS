/**
 * FIX-26: Auto-promotion cron for A/B prompt experiments.
 * Runs every 6 hours and promotes winning prompt variants automatically.
 *
 * POST/GET /api/cron/prompt-promotion
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendAlert } from '@/lib/alerts/webhook';

const CRON_SECRET = process.env.CRON_SECRET;

interface PromotionResult {
    experimentId: string;
    status: 'promoted' | 'no_winner' | 'error';
    winnerVariantId?: string;
    message?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const authHeader = req.headers.get('Authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: PromotionResult[] = [];

    try {
        // Dynamically import to avoid issues if experiment module isn't configured
        const { getActiveExperiments, checkForWinner, completeExperiment } =
            await import('@/lib/self-evolving-prompts/data-access/ab-experiments');

        const experiments = await getActiveExperiments();

        for (const experiment of experiments) {
            try {
                // Check for degradation (FIX-27)
                const degradingVariants = experiment.variants.filter(
                    (v: any) => v.sampleSize >= 10 && v.avgQualityScore !== undefined && v.avgQualityScore < 0.3
                );

                if (degradingVariants.length > 0) {
                    await sendAlert({
                        title: `🚨 Prompt Degradation Detected`,
                        message: `Experiment "${experiment.name}" has variants performing poorly (${degradingVariants.length} variants < 0.3 avg score). Needs immediate review.`,
                        severity: 'error',
                        pipeline: 'Self-Evolving Prompts',
                        tenantId: 'system',
                        fields: { 'Experiment ID': experiment.id }
                    });
                    logger.warn({ experimentId: experiment.id }, 'Alerted on prompt degradation');
                    results.push({ experimentId: experiment.id, status: 'error', message: 'Degradation detected' });
                    continue; // Skip promotion check if degrading
                }

                const winnerResult = await checkForWinner(experiment.id);

                if (winnerResult && winnerResult.winnerId) {
                    await completeExperiment(experiment.id, winnerResult.winnerId);
                    logger.info(
                        { experimentId: experiment.id, winnerId: winnerResult.winnerId },
                        'Prompt variant auto-promoted'
                    );
                    results.push({
                        experimentId: experiment.id,
                        status: 'promoted',
                        winnerVariantId: winnerResult.winnerId,
                        message: `Promoted with confidence ${(winnerResult.confidence * 100).toFixed(1)}%`,
                    });
                } else {
                    results.push({ experimentId: experiment.id, status: 'no_winner' });
                }
            } catch (err: any) {
                logger.error({ experimentId: experiment.id, err: err?.message }, 'Promotion check failed');
                results.push({ experimentId: experiment.id, status: 'error', message: err?.message });
            }
        }
    } catch (err: any) {
        logger.warn({ err: err?.message }, 'Self-evolving prompts module not available');
    }

    const promoted = results.filter(r => r.status === 'promoted').length;
    logger.info({ total: results.length, promoted }, 'Prompt promotion cron complete');

    return NextResponse.json({ processed: results.length, promoted, results });
}

export const GET = POST;
