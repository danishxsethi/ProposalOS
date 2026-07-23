/**
 * Prompt Optimization Cron Endpoint
 * Runs weekly to evaluate A/B tests and generate performance reports.
 * Schedule: weekly (e.g., "0 0 * * 0" — every Sunday at midnight)
 * Requirements: 15.2, 15.5
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { evaluateTest, promoteVariant, generateWeeklyReport } from '@/lib/intelligence/promptEngineering';
import { prisma } from '@/lib/prisma';

// Minimum sample size required before evaluating an A/B test
const DEFAULT_MIN_SAMPLE_SIZE = 100;

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    logger.info(
      { event: 'cron.prompt_optimization.start' },
      'Starting weekly prompt optimization'
    );

    // 1. Fetch all variants currently in A/B testing with sufficient sample size
    const testingVariants = await prisma.promptVariant.findMany({
      where: { status: 'testing', abTestId: { not: null } },
    });

    const evaluationResults: Array<{
      testId: string;
      variantId: string;
      winner: string;
      improvement: number;
      pValue: number;
      promoted: boolean;
      skipped?: boolean;
      skipReason?: string;
      error?: string;
    }> = [];

    let promoted = 0;
    let inconclusive = 0;
    let skipped = 0;
    let errors = 0;

    // 2. Evaluate each A/B test that has reached minSampleSize
    for (const variant of testingVariants) {
      const perf = (variant.performance as Record<string, number>) ?? {};
      const sampleSize = perf.sampleSize ?? 0;
      const minSampleSize = perf.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;

      if (sampleSize < minSampleSize) {
        skipped++;
        evaluationResults.push({
          testId: variant.abTestId!,
          variantId: variant.id,
          winner: 'pending',
          improvement: 0,
          pValue: 1,
          promoted: false,
          skipped: true,
          skipReason: `Sample size ${sampleSize} < minSampleSize ${minSampleSize}`,
        });
        continue;
      }

      try {
        const result = await evaluateTest(variant.abTestId!);

        let wasPromoted = false;
        if (result.winner === 'test' && result.significant) {
          await promoteVariant(variant.id);
          wasPromoted = true;
          promoted++;
        } else {
          inconclusive++;
        }

        evaluationResults.push({
          testId: variant.abTestId!,
          variantId: variant.id,
          winner: result.winner,
          improvement: result.improvement,
          pValue: result.pValue,
          promoted: wasPromoted,
        });
      } catch (err) {
        errors++;
        logger.error(
          {
            event: 'cron.prompt_optimization.evaluation_error',
            variantId: variant.id,
            testId: variant.abTestId,
            error: err,
          },
          `Failed to evaluate A/B test for variant ${variant.id}`
        );
        evaluationResults.push({
          testId: variant.abTestId!,
          variantId: variant.id,
          winner: 'error',
          improvement: 0,
          pValue: 1,
          promoted: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // 3. Generate weekly performance report
    const report = await generateWeeklyReport();

    const durationMs = Date.now() - startedAt;

    logger.info(
      {
        event: 'cron.prompt_optimization.complete',
        variantsEvaluated: testingVariants.length,
        promoted,
        inconclusive,
        skipped,
        errors,
        reportPeriod: report.period,
        reportTotalVariantsTested: report.totalVariantsTested,
        durationMs,
      },
      'Weekly prompt optimization complete'
    );

    return NextResponse.json({
      success: true,
      variantsEvaluated: testingVariants.length,
      promoted,
      inconclusive,
      skipped,
      errors,
      durationMs,
      report: {
        period: report.period,
        totalVariantsTested: report.totalVariantsTested,
        promoted: report.promoted,
        rolledBack: report.rolledBack,
        averageImprovementPercent: report.averageImprovementPercent,
        topPerformingVariants: report.topPerformingVariants.map((v) => ({
          id: v.id,
          basePromptId: v.basePromptId,
          version: v.version,
          taskType: v.taskType,
          qualityScore: v.performance.qualityScore,
          successRate: v.performance.successRate,
        })),
        generatedAt: report.generatedAt,
      },
      evaluations: evaluationResults,
    });
  } catch (error) {
    logger.error(
      { event: 'cron.prompt_optimization.error', error },
      'Prompt optimization cron failed'
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
