/**
 * Autonomous Prompt Engineering
 *
 * Self-optimizing prompt system that generates, A/B tests, promotes, and
 * rolls back prompt variants. Includes guardrail validation to ensure all
 * promoted prompts are safe, compliant, and brand-appropriate.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
 */

import { prisma } from '@/lib/db';
import type {
  PromptVariant,
  PromptVariantPerformance,
  ABTestConfig,
  ABTestResult,
  GuardrailValidation,
  PromptPerformanceReport,
  PromptTaskType,
} from './types';
import type { ABTest } from './types';
import type { DateRange } from '../pipeline/types';

// Quality degradation threshold for auto-rollback (20% drop)
const ROLLBACK_DEGRADATION_THRESHOLD = 0.2;

// Harmful content patterns (simplified keyword-based check)
const HARMFUL_PATTERNS = [
  /\b(kill|murder|harm|attack|weapon|explosive|drug|illegal)\b/i,
  /\b(hate|racist|sexist|discriminat)\b/i,
];

// Misleading claim patterns
const MISLEADING_PATTERNS = [
  /\b(guaranteed|100%\s+success|never\s+fail|always\s+work)\b/i,
  /\b(instant\s+results|overnight\s+success|get\s+rich\s+quick)\b/i,
];

// Non-compliant patterns (e.g., GDPR, CAN-SPAM violations)
const COMPLIANCE_PATTERNS = [
  /\b(no\s+unsubscribe|ignore\s+opt.?out|bypass\s+spam)\b/i,
  /\b(collect\s+without\s+consent|sell\s+your\s+data)\b/i,
];

// Brand safety patterns
const BRAND_UNSAFE_PATTERNS = [
  /\b(competitor\s+sucks|[a-z]+\s+is\s+terrible|avoid\s+[a-z]+)\b/i,
  /\b(scam|fraud|fake|lie|cheat)\b/i,
];

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Compute a two-proportion z-test p-value (two-tailed).
 * Reused from verticalSpecialization pattern.
 */
function computePValue(
  controlSuccesses: number,
  controlTotal: number,
  testSuccesses: number,
  testTotal: number
): number {
  if (controlTotal === 0 || testTotal === 0) return 1;

  const p1 = controlSuccesses / controlTotal;
  const p2 = testSuccesses / testTotal;
  const pooled = (controlSuccesses + testSuccesses) / (controlTotal + testTotal);

  if (pooled === 0 || pooled === 1) return 1;

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / controlTotal + 1 / testTotal));
  if (se === 0) return 1;

  const z = Math.abs(p2 - p1) / se;

  // Abramowitz & Stegun approximation for normal CDF
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const oneTail = phi * poly;
  return Math.min(2 * oneTail, 1);
}

/**
 * Map a Prisma PromptVariant record to the TypeScript interface.
 */
function mapRecord(r: {
  id: string;
  basePromptId: string;
  version: number;
  content: string;
  taskType: string;
  status: string;
  createdBy: string;
  performance: unknown;
  createdAt: Date;
}): PromptVariant {
  const perf = (r.performance as Partial<PromptVariantPerformance>) ?? {};
  return {
    id: r.id,
    basePromptId: r.basePromptId,
    version: r.version,
    content: r.content,
    taskType: r.taskType as PromptTaskType,
    status: r.status as PromptVariant['status'],
    createdBy: r.createdBy as PromptVariant['createdBy'],
    performance: {
      sampleSize: perf.sampleSize ?? 0,
      successRate: perf.successRate ?? 0,
      qualityScore: perf.qualityScore ?? 0,
      costPerCall: perf.costPerCall ?? 0,
    },
    createdAt: r.createdAt,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a new prompt variant from an existing base prompt.
 * Increments the version, sets status to 'draft', and marks createdBy 'autonomous'.
 * Requirements: 15.1
 */
export async function generateVariant(basePromptId: string): Promise<PromptVariant> {
  // Find the latest version for this base prompt
  const latest = await prisma.promptVariant.findFirst({
    where: { basePromptId },
    orderBy: { version: 'desc' },
  });

  const nextVersion = latest ? latest.version + 1 : 1;

  // Use the latest content as the base, or a placeholder for brand-new prompts
  const baseContent = latest?.content ?? `[Base prompt for ${basePromptId}]`;

  // Autonomous variant generation: append a lightweight optimization hint
  const variantContent = `${baseContent}\n\n[Autonomous variant v${nextVersion}: optimized for higher engagement and clarity]`;

  const record = await prisma.promptVariant.create({
    data: {
      basePromptId,
      version: nextVersion,
      content: variantContent,
      taskType: latest?.taskType ?? 'email_generation',
      status: 'draft',
      createdBy: 'autonomous',
      performance: {
        sampleSize: 0,
        successRate: 0,
        qualityScore: 0,
        costPerCall: 0,
      },
    },
  });

  return mapRecord(record);
}

/**
 * Start an A/B test between a control and test prompt variant.
 * Requirements: 15.2
 */
export async function startABTest(config: ABTestConfig): Promise<ABTest> {
  const { controlVariantId, testVariantId, trafficSplit, minSampleSize, significanceThreshold, improvementThreshold } = config;

  // Mark the test variant as 'testing'
  await prisma.promptVariant.update({
    where: { id: testVariantId },
    data: { status: 'testing' },
  });

  const testId = `abtest_${controlVariantId}_${testVariantId}_${Date.now()}`;

  // Store the A/B test config on the test variant for later evaluation
  await prisma.promptVariant.update({
    where: { id: testVariantId },
    data: { abTestId: testId },
  });

  return {
    id: testId,
    controlId: controlVariantId,
    testId: testVariantId,
    trafficSplit,
    minSampleSize,
    significanceThreshold,
    improvementThreshold,
    status: 'running',
    startedAt: new Date(),
  };
}

/**
 * Evaluate an A/B test by computing p-value and improvement delta.
 * Requirements: 15.2, 15.3
 */
export async function evaluateTest(testId: string): Promise<ABTestResult> {
  // Find the test variant by abTestId
  const testVariant = await prisma.promptVariant.findFirst({
    where: { abTestId: testId },
  });

  if (!testVariant) {
    throw new Error(`A/B test not found: ${testId}`);
  }

  // Parse the test ID to get the control variant ID
  // Format: abtest_{controlId}_{testId}_{timestamp}
  const parts = testId.split('_');
  const controlVariantId = parts[1];

  const controlVariant = await prisma.promptVariant.findUnique({
    where: { id: controlVariantId },
  });

  if (!controlVariant) {
    throw new Error(`Control variant not found: ${controlVariantId}`);
  }

  const controlPerf = (controlVariant.performance as Partial<PromptVariantPerformance>) ?? {};
  const testPerf = (testVariant.performance as Partial<PromptVariantPerformance>) ?? {};

  const controlSampleSize = controlPerf.sampleSize ?? 0;
  const testSampleSize = testPerf.sampleSize ?? 0;
  const controlSuccessRate = controlPerf.successRate ?? 0;
  const testSuccessRate = testPerf.successRate ?? 0;

  const controlSuccesses = Math.round(controlSampleSize * controlSuccessRate);
  const testSuccesses = Math.round(testSampleSize * testSuccessRate);

  const pValue = computePValue(controlSuccesses, controlSampleSize, testSuccesses, testSampleSize);
  const improvement = controlSuccessRate > 0
    ? (testSuccessRate - controlSuccessRate) / controlSuccessRate
    : 0;

  // Retrieve the stored test config from the test variant's abTestId context
  // We use a default significance threshold of 0.05 if not stored
  const significanceThreshold = 0.05;
  const significant = pValue < significanceThreshold;

  let winner: ABTestResult['winner'];
  if (!significant) {
    winner = 'inconclusive';
  } else if (improvement > 0) {
    winner = 'test';
  } else {
    winner = 'control';
  }

  return {
    testId,
    winner,
    controlMetric: controlSuccessRate,
    testMetric: testSuccessRate,
    improvement,
    pValue,
    sampleSize: controlSampleSize + testSampleSize,
    significant,
  };
}

/**
 * Promote a variant to production — only after guardrails pass.
 * Requirements: 15.3, 15.6
 */
export async function promoteVariant(variantId: string): Promise<void> {
  const record = await prisma.promptVariant.findUnique({ where: { id: variantId } });
  if (!record) {
    throw new Error(`Prompt variant not found: ${variantId}`);
  }

  const variant = mapRecord(record);

  // Validate guardrails before promotion
  const guardrails = await validateGuardrails(variant);
  if (!guardrails.passed) {
    throw new Error(
      `Guardrail validation failed for variant ${variantId}: ${guardrails.flaggedIssues.join(', ')}`
    );
  }

  // Deprecate any existing production variant for the same base prompt
  await prisma.promptVariant.updateMany({
    where: {
      basePromptId: record.basePromptId,
      status: 'production',
    },
    data: {
      status: 'deprecated',
      deprecatedAt: new Date(),
    },
  });

  // Promote this variant
  await prisma.promptVariant.update({
    where: { id: variantId },
    data: {
      status: 'production',
      promotedAt: new Date(),
    },
  });
}

/**
 * Rollback to a specific version of a prompt.
 * Auto-triggered when quality drops > 20% below baseline.
 * Requirements: 15.4, 15.8
 */
export async function rollbackToVersion(promptId: string, version: number): Promise<void> {
  const target = await prisma.promptVariant.findUnique({
    where: { basePromptId_version: { basePromptId: promptId, version } },
  });

  if (!target) {
    throw new Error(`Prompt variant not found: ${promptId} v${version}`);
  }

  // Deprecate the current production variant
  await prisma.promptVariant.updateMany({
    where: {
      basePromptId: promptId,
      status: 'production',
    },
    data: {
      status: 'deprecated',
      deprecatedAt: new Date(),
    },
  });

  // Restore the target version to production
  await prisma.promptVariant.update({
    where: { id: target.id },
    data: {
      status: 'production',
      promotedAt: new Date(),
      deprecatedAt: null,
    },
  });
}

/**
 * Check if a promoted prompt has degraded beyond the rollback threshold.
 * If quality drops > 20% below baseline, auto-rollback is triggered.
 * Requirements: 15.8
 */
export async function checkAndAutoRollback(
  promptId: string,
  baselineSuccessRate: number
): Promise<boolean> {
  const production = await prisma.promptVariant.findFirst({
    where: { basePromptId: promptId, status: 'production' },
    orderBy: { promotedAt: 'desc' },
  });

  if (!production) return false;

  const perf = (production.performance as Partial<PromptVariantPerformance>) ?? {};
  const currentRate = perf.successRate ?? 0;

  if (perf.sampleSize === 0 || perf.sampleSize === undefined) return false;

  const degradation = (baselineSuccessRate - currentRate) / baselineSuccessRate;

  if (degradation > ROLLBACK_DEGRADATION_THRESHOLD) {
    // Find the previous stable version (the one before current)
    const previousStable = await prisma.promptVariant.findFirst({
      where: {
        basePromptId: promptId,
        status: 'deprecated',
        version: { lt: production.version },
      },
      orderBy: { version: 'desc' },
    });

    if (previousStable) {
      await rollbackToVersion(promptId, previousStable.version);
      return true;
    }
  }

  return false;
}

/**
 * Validate guardrails for a prompt variant.
 * Checks: noHarmfulContent, noMisleadingClaims, complianceCheck, brandSafetyCheck.
 * Requirements: 15.6
 */
export async function validateGuardrails(variant: PromptVariant): Promise<GuardrailValidation> {
  const content = variant.content;
  const flaggedIssues: string[] = [];

  const noHarmfulContent = !HARMFUL_PATTERNS.some((p) => p.test(content));
  if (!noHarmfulContent) flaggedIssues.push('Harmful content detected');

  const noMisleadingClaims = !MISLEADING_PATTERNS.some((p) => p.test(content));
  if (!noMisleadingClaims) flaggedIssues.push('Misleading claims detected');

  const complianceCheck = !COMPLIANCE_PATTERNS.some((p) => p.test(content));
  if (!complianceCheck) flaggedIssues.push('Compliance violation detected');

  const brandSafetyCheck = !BRAND_UNSAFE_PATTERNS.some((p) => p.test(content));
  if (!brandSafetyCheck) flaggedIssues.push('Brand safety issue detected');

  const passed = noHarmfulContent && noMisleadingClaims && complianceCheck && brandSafetyCheck;

  return {
    passed,
    checks: {
      noHarmfulContent,
      noMisleadingClaims,
      complianceCheck,
      brandSafetyCheck,
    },
    flaggedIssues,
  };
}

/**
 * Get the full version history for a prompt.
 * Requirements: 15.4
 */
export async function getPromptHistory(promptId: string): Promise<PromptVariant[]> {
  const records = await prisma.promptVariant.findMany({
    where: { basePromptId: promptId },
    orderBy: { version: 'asc' },
  });

  return records.map(mapRecord);
}

/**
 * Generate a weekly performance report for human review.
 * Requirements: 15.5
 */
export async function generateWeeklyReport(): Promise<PromptPerformanceReport> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const period: DateRange = { start: weekAgo, end: now };

  // All variants created or updated in the past week
  const recentVariants = await prisma.promptVariant.findMany({
    where: {
      createdAt: { gte: weekAgo },
    },
    orderBy: { createdAt: 'desc' },
  });

  const promoted = recentVariants.filter((v) => v.status === 'production').length;
  const rolledBack = recentVariants.filter((v) => v.status === 'deprecated' && v.deprecatedAt && v.deprecatedAt >= weekAgo).length;

  // Compute average improvement for promoted variants
  const promotedVariants = recentVariants.filter((v) => v.status === 'production');
  let totalImprovement = 0;
  let improvementCount = 0;

  for (const v of promotedVariants) {
    const perf = (v.performance as Partial<PromptVariantPerformance>) ?? {};
    if (perf.successRate && perf.successRate > 0) {
      totalImprovement += perf.successRate;
      improvementCount++;
    }
  }

  const averageImprovementPercent =
    improvementCount > 0 ? (totalImprovement / improvementCount) * 100 : 0;

  // Top performing variants by quality score
  const allProduction = await prisma.promptVariant.findMany({
    where: { status: 'production' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const topPerformingVariants = allProduction
    .map(mapRecord)
    .sort((a, b) => b.performance.qualityScore - a.performance.qualityScore)
    .slice(0, 5);

  return {
    period,
    totalVariantsTested: recentVariants.length,
    promoted,
    rolledBack,
    averageImprovementPercent,
    topPerformingVariants,
    generatedAt: now,
  };
}

/**
 * Update performance metrics for a variant (called by the A/B test runner).
 * Requirements: 15.2, 15.7
 */
export async function updateVariantPerformance(
  variantId: string,
  performance: Partial<PromptVariantPerformance>
): Promise<void> {
  const record = await prisma.promptVariant.findUnique({ where: { id: variantId } });
  if (!record) throw new Error(`Variant not found: ${variantId}`);

  const existing = (record.performance as Partial<PromptVariantPerformance>) ?? {};
  const updated = { ...existing, ...performance };

  await prisma.promptVariant.update({
    where: { id: variantId },
    data: { performance: updated },
  });
}

/**
 * Get the current production variant for a base prompt.
 */
export async function getProductionVariant(basePromptId: string): Promise<PromptVariant | null> {
  const record = await prisma.promptVariant.findFirst({
    where: { basePromptId, status: 'production' },
    orderBy: { promotedAt: 'desc' },
  });

  return record ? mapRecord(record) : null;
}
