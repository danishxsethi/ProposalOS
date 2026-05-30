/**
 * Auto-Promotion Logic for Prompt A/B Testing
 * Automatically promotes winning variants based on statistical significance
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

// Type-safe Prisma client extensions for new models
type PrismaWithNewModels = typeof prisma & {
  aBExperiment: any;
  promptVersion: any;
  promptPromotionLog: any;
};

export interface AutoPromotionConfig {
  minSampleSize: number;
  pValueThreshold: number;
  minQualityImprovement: number; // Minimum % improvement required
  maxLatencyIncrease: number; // Maximum % latency increase allowed
}

const DEFAULT_CONFIG: AutoPromotionConfig = {
  minSampleSize: 100,
  pValueThreshold: 0.05,
  minQualityImprovement: 2.0, // 2% improvement minimum
  maxLatencyIncrease: 10.0, // 10% latency increase max
};

/**
 * Check all active experiments for potential winners and auto-promote
 */
export async function checkAndPromoteWinners(
  config: AutoPromotionConfig = DEFAULT_CONFIG
): Promise<PromotionResult[]> {
  const activeExperiments = await prisma.aBExperiment.findMany({
    where: { status: 'active' },
    include: {
      variants: {
        include: {
          promptVersion: true,
        },
      },
    },
  });

  const results: PromotionResult[] = [];

  for (const experiment of activeExperiments) {
    const result = await evaluateExperiment(experiment, config);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Evaluate a single experiment for promotion
 */
async function evaluateExperiment(
  experiment: any,
  config: AutoPromotionConfig
): Promise<PromotionResult | null> {
  const { variants } = experiment;

  // Need at least 2 variants to compare
  if (variants.length < 2) {
    return null;
  }

  // Check if all variants have minimum sample size
  const hasMinSamples = variants.every((v: any) => v.sampleSize >= config.minSampleSize);

  if (!hasMinSamples) {
    logger.debug(
      {
        variants: variants.map((v: any) => ({
          id: v.id,
          sampleSize: v.sampleSize,
        })),
      },
      `Experiment ${experiment.id} - insufficient samples`
    );
    return null;
  }

  // Sort variants by quality score
  const sortedVariants = [...variants].sort(
    (a: any, b: any) => (b.avgQualityScore || 0) - (a.avgQualityScore || 0)
  );

  const winner = sortedVariants[0];
  const runnerUp = sortedVariants[1];

  // Calculate statistical significance (simplified t-test)
  const scoreDiff = (winner.avgQualityScore || 0) - (runnerUp.avgQualityScore || 0);
  const pooledStdDev = Math.sqrt(
    (winner.sampleSize + runnerUp.sampleSize) / (winner.sampleSize * runnerUp.sampleSize)
  );
  const tStat = scoreDiff / pooledStdDev;
  const pValue = Math.exp(-Math.abs(tStat));

  // Check if statistically significant
  if (pValue >= config.pValueThreshold) {
    logger.debug(
      {
        pValue,
        threshold: config.pValueThreshold,
      },
      `Experiment ${experiment.id} - not statistically significant`
    );
    return null;
  }

  // Check minimum quality improvement
  const qualityImprovementPct =
    (((winner.avgQualityScore || 0) - (runnerUp.avgQualityScore || 0)) /
      (runnerUp.avgQualityScore || 1)) *
    100;

  if (qualityImprovementPct < config.minQualityImprovement) {
    logger.debug(
      {
        qualityImprovementPct,
        minRequired: config.minQualityImprovement,
      },
      `Experiment ${experiment.id} - quality improvement too small`
    );
    return null;
  }

  // Check latency impact (if available)
  const latencyIncreasePct =
    (((winner.avgLatencyMs || 0) - (runnerUp.avgLatencyMs || 0)) / (runnerUp.avgLatencyMs || 1)) *
    100;

  if (latencyIncreasePct > config.maxLatencyIncrease) {
    logger.debug(
      {
        latencyIncreasePct,
        maxAllowed: config.maxLatencyIncrease,
      },
      `Experiment ${experiment.id} - latency increase too high`
    );
    return null;
  }

  // All checks passed - promote the winner
  await promoteWinner(experiment, winner, {
    pValue,
    qualityImprovementPct,
    latencyIncreasePct,
    runnerUpId: runnerUp.id,
  });

  return {
    experimentId: experiment.id,
    experimentName: experiment.name,
    winnerVariantId: winner.id,
    winnerPromptVersionHash: winner.promptVersionHash,
    pValue,
    qualityImprovementPct,
    latencyIncreasePct,
    promotedAt: new Date(),
  };
}

/**
 * Promote the winning variant and log the promotion
 */
async function promoteWinner(
  experiment: any,
  winner: any,
  stats: {
    pValue: number;
    qualityImprovementPct: number;
    latencyIncreasePct: number;
    runnerUpId: string;
  }
) {
  const tx = await prisma.$transaction(async (tx) => {
    // 1. Complete the experiment
    await tx.aBExperiment.update({
      where: { id: experiment.id },
      data: {
        status: 'completed',
        endDate: new Date(),
        winnerVariantId: winner.id,
        statisticalSignificance: stats.pValue,
      },
    });

    // 2. Activate the winning prompt version
    await tx.promptVersion.update({
      where: { versionHash: winner.promptVersionHash },
      data: { isActive: true },
    });

    // 3. Deactivate other versions for this node
    await tx.promptVersion.updateMany({
      where: {
        nodeId: experiment.nodeId,
        versionHash: { not: winner.promptVersionHash },
      },
      data: { isActive: false },
    });

    // 4. Log the promotion
    const promotionLog = await tx.promptPromotionLog.create({
      data: {
        promptId: experiment.name,
        winnerVariantId: winner.id,
        loserVariantId: stats.runnerUpId,
        winnerAvgQuality: winner.avgQualityScore || 0,
        loserAvgQuality:
          (experiment.variants.find((v: any) => v.id === stats.runnerUpId) as any)
            ?.avgQualityScore || 0,
        qualityDeltaPct: stats.qualityImprovementPct,
        winnerAvgLatencyMs: winner.avgLatencyMs || 0,
        loserAvgLatencyMs:
          (experiment.variants.find((v: any) => v.id === stats.runnerUpId) as any)?.avgLatencyMs ||
          0,
        latencyIncreasePct: stats.latencyIncreasePct,
        winnerSampleSize: winner.sampleSize,
        loserSampleSize:
          (experiment.variants.find((v: any) => v.id === stats.runnerUpId) as any)?.sampleSize || 0,
        note: `Auto-promoted via A/B test. p=${stats.pValue.toFixed(4)}, improvement=${stats.qualityImprovementPct.toFixed(2)}%`,
      },
    });

    return promotionLog;
  });

  logger.info(
    {
      experimentId: experiment.id,
      pValue: stats.pValue,
      qualityImprovement: stats.qualityImprovementPct,
    },
    `Auto-promoted prompt ${winner.promptVersionHash}`
  );

  return tx;
}

export interface PromotionResult {
  experimentId: string;
  experimentName: string;
  winnerVariantId: string;
  winnerPromptVersionHash: string;
  pValue: number;
  qualityImprovementPct: number;
  latencyIncreasePct: number;
  promotedAt: Date;
}

/**
 * Manual promotion endpoint handler
 */
export async function manualPromote(
  experimentId: string,
  variantId: string
): Promise<PromotionResult> {
  const prismaWithModels = prisma as PrismaWithNewModels;

  const experiment = await prismaWithModels.aBExperiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: {
        include: {
          promptVersion: true,
        },
      },
    },
  });

  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`);
  }

  const winner = experiment.variants.find((v: any) => v.id === variantId);
  if (!winner) {
    throw new Error(`Variant ${variantId} not found in experiment`);
  }

  const runnerUp = experiment.variants.find((v: any) => v.id !== variantId);

  await promoteWinner(experiment, winner, {
    pValue: 0, // Manual promotion - no statistical calculation
    qualityImprovementPct: 0,
    latencyIncreasePct: 0,
    runnerUpId: runnerUp?.id || 'unknown',
  });

  return {
    experimentId,
    experimentName: experiment.name,
    winnerVariantId: variantId,
    winnerPromptVersionHash: winner.promptVersionHash,
    pValue: 0,
    qualityImprovementPct: 0,
    latencyIncreasePct: 0,
    promotedAt: new Date(),
  };
}
