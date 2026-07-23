/**
 * Vertical Specialization Engine
 *
 * Auto-detects emerging verticals from prospect data and generates playbooks
 * from win/loss patterns. Supports A/B testing, promotion, and continuous
 * optimization of vertical playbooks.
 *
 * Requirements: 12.1–12.8
 */

import { prisma } from '@/lib/db';
import type {
  VerticalPlaybook,
  VerticalPlaybookConfig,
  VerticalPlaybookPerformance,
  EmergingVertical,
  VerticalOutcome,
  ABTest,
  ABTestResult,
  PlaybookFilters,
} from './types';

// Default improvement threshold (10%) and significance level (p < 0.05)
const DEFAULT_IMPROVEMENT_THRESHOLD = 0.1;
const DEFAULT_SIGNIFICANCE_THRESHOLD = 0.05;
const DEFAULT_MIN_SAMPLE_SIZE = 30;

/**
 * Compute a two-proportion z-test p-value.
 * Returns the two-tailed p-value for the difference between two proportions.
 */
function computePValue(
  controlWins: number,
  controlTotal: number,
  testWins: number,
  testTotal: number
): number {
  if (controlTotal === 0 || testTotal === 0) return 1;

  const p1 = controlWins / controlTotal;
  const p2 = testWins / testTotal;
  const pooled = (controlWins + testWins) / (controlTotal + testTotal);

  if (pooled === 0 || pooled === 1) return 1;

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / controlTotal + 1 / testTotal));
  if (se === 0) return 1;

  const z = Math.abs(p2 - p1) / se;

  // Approximate two-tailed p-value using normal CDF approximation
  // Using Abramowitz and Stegun approximation for erfc
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const oneTail = phi * poly;
  return Math.min(2 * oneTail, 1);
}

/**
 * Build a VerticalPlaybookConfig from a set of outcomes.
 */
function buildConfig(outcomes: VerticalOutcome[]): VerticalPlaybookConfig {
  const findingCounts = new Map<string, number>();
  const templateWins = new Map<string, { wins: number; total: number }>();
  const dealValues: number[] = [];
  const closeTimes: number[] = [];

  for (const o of outcomes) {
    for (const ft of o.findingTypes) {
      findingCounts.set(ft, (findingCounts.get(ft) ?? 0) + 1);
    }
    if (o.emailTemplateId) {
      const entry = templateWins.get(o.emailTemplateId) ?? { wins: 0, total: 0 };
      entry.total++;
      if (o.outcome === 'won') entry.wins++;
      templateWins.set(o.emailTemplateId, entry);
    }
    if (o.outcome === 'won') {
      if (o.dealValue !== undefined) dealValues.push(o.dealValue);
      if (o.timeToClose !== undefined) closeTimes.push(o.timeToClose);
    }
  }

  const effectiveFindings = [...findingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, weight: count / outcomes.length }));

  const emailTemplates = [...templateWins.entries()]
    .map(([id, { wins, total }]) => ({ id, winRate: total > 0 ? wins / total : 0 }))
    .sort((a, b) => b.winRate - a.winRate);

  const sortedDeals = [...dealValues].sort((a, b) => a - b);
  const p25 = sortedDeals[Math.floor(sortedDeals.length * 0.25)] ?? 500;
  const p50 = sortedDeals[Math.floor(sortedDeals.length * 0.5)] ?? 1000;
  const p75 = sortedDeals[Math.floor(sortedDeals.length * 0.75)] ?? 2000;
  const p90 = sortedDeals[Math.floor(sortedDeals.length * 0.9)] ?? 3000;

  return {
    effectiveFindings,
    emailTemplates,
    pricingStrategy: {
      essentials: { min: p25, max: p50 },
      growth: { min: p50, max: p75 },
      premium: { min: p75, max: p90 },
    },
    commonObjections: [
      { objection: 'Too expensive', response: 'ROI typically exceeds cost within 90 days' },
      { objection: 'Already have someone', response: 'We complement existing efforts with automation' },
      { objection: 'Not the right time', response: 'Competitors are moving now — delay costs market share' },
    ],
    industryTerms: [],
  };
}

/**
 * Compute performance metrics from a set of outcomes.
 */
function computePerformance(outcomes: VerticalOutcome[]): VerticalPlaybookPerformance {
  const total = outcomes.length;
  const wins = outcomes.filter((o) => o.outcome === 'won').length;
  const winRate = total > 0 ? wins / total : 0;

  const wonOutcomes = outcomes.filter((o) => o.outcome === 'won');
  const dealValues = wonOutcomes.map((o) => o.dealValue ?? 0).filter((v) => v > 0);
  const closeTimes = wonOutcomes.map((o) => o.timeToClose ?? 0).filter((v) => v > 0);

  const averageDealSize =
    dealValues.length > 0 ? dealValues.reduce((s, v) => s + v, 0) / dealValues.length : 0;
  const timeToClose =
    closeTimes.length > 0 ? closeTimes.reduce((s, v) => s + v, 0) / closeTimes.length : 0;

  return { winRate, averageDealSize, timeToClose, sampleSize: total };
}

// ============================================================
// Public API
// ============================================================

/**
 * Detect emerging verticals not covered by existing playbooks.
 * Returns verticals with prospect count >= threshold.
 *
 * Requirements: 12.1
 */
export async function detectEmergingVerticals(threshold: number): Promise<EmergingVertical[]> {
  // Get all verticals that already have a non-deprecated playbook
  const existing = await prisma.verticalPlaybook.findMany({
    where: { status: { not: 'deprecated' } },
    select: { vertical: true },
  });
  const existingVerticals = new Set(existing.map((p) => p.vertical));

  // Aggregate prospect counts by industry from recent audits
  const audits = await prisma.audit.groupBy({
    by: ['businessIndustry'],
    _count: { id: true },
    where: {
      businessIndustry: { not: null },
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  });

  const emerging: EmergingVertical[] = [];

  for (const row of audits) {
    const vertical = row.businessIndustry!;
    if (existingVerticals.has(vertical)) continue;
    if (row._count.id < threshold) continue;

    // Compute win rate from win/loss records for this vertical
    const records = await prisma.winLossRecord.findMany({
      where: { vertical },
    });
    const wins = records.filter((r) => r.outcome === 'won').length;
    const winRate = records.length > 0 ? wins / records.length : 0;

    // Get average pain score from prospect leads for this vertical
    const leads = await prisma.prospectLead.findMany({
      where: { vertical },
      select: { painScore: true },
    });
    const painScores = leads.map((a) => a.painScore ?? 0).filter((v) => v > 0);
    const avgPainScore =
      painScores.length > 0 ? painScores.reduce((s, v) => s + v, 0) / painScores.length : 0;

    emerging.push({
      vertical,
      prospectCount: row._count.id,
      winRate,
      averagePainScore: avgPainScore,
      detectedAt: new Date(),
    });
  }

  return emerging.sort((a, b) => b.prospectCount - a.prospectCount);
}

/**
 * Generate a new VerticalPlaybook from win/loss outcome data.
 *
 * Requirements: 12.2, 12.3
 */
export async function generatePlaybook(
  vertical: string,
  outcomes: VerticalOutcome[]
): Promise<VerticalPlaybook> {
  const config = buildConfig(outcomes);
  const performance = computePerformance(outcomes);
  const now = new Date();

  // Check if a global playbook for this vertical already exists
  const existing = await prisma.verticalPlaybook.findFirst({
    where: { vertical, tenantId: null },
  });

  let record;
  if (existing) {
    record = await prisma.verticalPlaybook.update({
      where: { id: existing.id },
      data: {
        config: config as unknown as object,
        performance: performance as unknown as object,
        lastOptimized: now,
      },
    });
  } else {
    record = await prisma.verticalPlaybook.create({
      data: {
        vertical,
        status: 'emerging',
        config: config as unknown as object,
        performance: performance as unknown as object,
        createdAt: now,
        lastOptimized: now,
      },
    });
  }

  return {
    id: record.id,
    vertical: record.vertical,
    status: record.status as VerticalPlaybook['status'],
    config: record.config as unknown as VerticalPlaybookConfig,
    performance: record.performance as unknown as VerticalPlaybookPerformance,
    createdAt: record.createdAt,
    lastOptimized: record.lastOptimized,
  };
}

/**
 * Start an A/B test between a new playbook and a control playbook.
 *
 * Requirements: 12.4
 */
export async function startABTest(playbookId: string, controlId: string): Promise<ABTest> {
  // Store both IDs in the abTestId field as JSON for reliable retrieval
  const testId = `abtest::${playbookId}::${controlId}`;

  // Mark the test playbook as 'testing'
  await prisma.verticalPlaybook.update({
    where: { id: playbookId },
    data: { status: 'testing', abTestId: testId },
  });

  const test: ABTest = {
    id: testId,
    controlId,
    testId: playbookId,
    trafficSplit: 0.5,
    minSampleSize: DEFAULT_MIN_SAMPLE_SIZE,
    significanceThreshold: DEFAULT_SIGNIFICANCE_THRESHOLD,
    improvementThreshold: DEFAULT_IMPROVEMENT_THRESHOLD,
    status: 'running',
    startedAt: new Date(),
  };

  return test;
}

/**
 * Evaluate an A/B test using win/loss data for both playbooks.
 * Computes p-value and improvement delta.
 *
 * Requirements: 12.4, 12.5
 */
export async function evaluateABTest(testId: string): Promise<ABTestResult> {
  // Parse IDs from test ID format: "abtest::{testPlaybookId}::{controlPlaybookId}"
  const parts = testId.split('::');
  if (parts.length !== 3 || parts[0] !== 'abtest') {
    throw new Error(`Invalid test ID format: ${testId}`);
  }
  const testPlaybookId = parts[1];
  const controlPlaybookId = parts[2];

  const [testPlaybook, controlPlaybook] = await Promise.all([
    prisma.verticalPlaybook.findUnique({ where: { id: testPlaybookId } }),
    prisma.verticalPlaybook.findUnique({ where: { id: controlPlaybookId } }),
  ]);

  if (!testPlaybook || !controlPlaybook) {
    throw new Error(`Playbook not found for test: ${testId}`);
  }

  const testPerf = testPlaybook.performance as unknown as VerticalPlaybookPerformance;
  const controlPerf = controlPlaybook.performance as unknown as VerticalPlaybookPerformance;

  const testWins = Math.round(testPerf.winRate * testPerf.sampleSize);
  const controlWins = Math.round(controlPerf.winRate * controlPerf.sampleSize);

  const pValue = computePValue(controlWins, controlPerf.sampleSize, testWins, testPerf.sampleSize);
  const improvement =
    controlPerf.winRate > 0
      ? (testPerf.winRate - controlPerf.winRate) / controlPerf.winRate
      : 0;

  const significant = pValue < DEFAULT_SIGNIFICANCE_THRESHOLD;
  const meetsThreshold = improvement >= DEFAULT_IMPROVEMENT_THRESHOLD;

  let winner: ABTestResult['winner'] = 'inconclusive';
  if (significant && meetsThreshold) winner = 'test';
  else if (significant && improvement < -DEFAULT_IMPROVEMENT_THRESHOLD) winner = 'control';

  return {
    testId,
    winner,
    controlMetric: controlPerf.winRate,
    testMetric: testPerf.winRate,
    improvement,
    pValue,
    sampleSize: testPerf.sampleSize + controlPerf.sampleSize,
    significant,
  };
}

/**
 * Promote a playbook to production status.
 * Only promotes if the playbook outperforms its control by the configured
 * improvement threshold with statistical significance.
 *
 * Requirements: 12.4, 12.5
 */
export async function promotePlaybook(playbookId: string): Promise<void> {
  const playbook = await prisma.verticalPlaybook.findUnique({
    where: { id: playbookId },
  });

  if (!playbook) throw new Error(`Playbook not found: ${playbookId}`);
  if (!playbook.abTestId) throw new Error(`Playbook ${playbookId} has no associated A/B test`);
  const result = await evaluateABTest(playbook.abTestId);

  if (result.winner !== 'test') {
    throw new Error(
      `Playbook ${playbookId} cannot be promoted: ` +
        `improvement=${(result.improvement * 100).toFixed(1)}%, ` +
        `p-value=${result.pValue.toFixed(4)}, ` +
        `winner=${result.winner}`
    );
  }

  await prisma.verticalPlaybook.update({
    where: { id: playbookId },
    data: { status: 'production', promotedAt: new Date() },
  });
}

/**
 * Optimize an existing playbook with new outcome data.
 *
 * Requirements: 12.6
 */
export async function optimizePlaybook(
  playbookId: string,
  newOutcomes: VerticalOutcome[]
): Promise<VerticalPlaybook> {
  const existing = await prisma.verticalPlaybook.findUnique({
    where: { id: playbookId },
  });

  if (!existing) throw new Error(`Playbook not found: ${playbookId}`);

  const existingPerf = existing.performance as unknown as VerticalPlaybookPerformance;
  const existingConfig = existing.config as unknown as VerticalPlaybookConfig;

  // Merge new outcomes with existing performance data
  const newPerf = computePerformance(newOutcomes);
  const newConfig = buildConfig(newOutcomes);

  // Weighted merge: weight by sample size
  const totalSamples = existingPerf.sampleSize + newPerf.sampleSize;
  const existingWeight = existingPerf.sampleSize / totalSamples;
  const newWeight = newPerf.sampleSize / totalSamples;

  const mergedPerf: VerticalPlaybookPerformance = {
    winRate: existingPerf.winRate * existingWeight + newPerf.winRate * newWeight,
    averageDealSize:
      existingPerf.averageDealSize * existingWeight + newPerf.averageDealSize * newWeight,
    timeToClose: existingPerf.timeToClose * existingWeight + newPerf.timeToClose * newWeight,
    sampleSize: totalSamples,
  };

  // Merge finding effectiveness: combine and re-rank
  const findingMap = new Map<string, number>();
  for (const f of existingConfig.effectiveFindings) {
    findingMap.set(f.type, (findingMap.get(f.type) ?? 0) + f.weight * existingWeight);
  }
  for (const f of newConfig.effectiveFindings) {
    findingMap.set(f.type, (findingMap.get(f.type) ?? 0) + f.weight * newWeight);
  }
  const mergedFindings = [...findingMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, weight]) => ({ type, weight }));

  const mergedConfig: VerticalPlaybookConfig = {
    ...existingConfig,
    effectiveFindings: mergedFindings,
  };

  const now = new Date();
  const updated = await prisma.verticalPlaybook.update({
    where: { id: playbookId },
    data: {
      config: mergedConfig as unknown as object,
      performance: mergedPerf as unknown as object,
      lastOptimized: now,
    },
  });

  return {
    id: updated.id,
    vertical: updated.vertical,
    status: updated.status as VerticalPlaybook['status'],
    config: updated.config as unknown as VerticalPlaybookConfig,
    performance: updated.performance as unknown as VerticalPlaybookPerformance,
    createdAt: updated.createdAt,
    lastOptimized: updated.lastOptimized,
  };
}

/**
 * Get performance metrics for a specific playbook.
 *
 * Requirements: 12.7
 */
export async function getPlaybookPerformance(
  playbookId: string
): Promise<VerticalPlaybookPerformance> {
  const playbook = await prisma.verticalPlaybook.findUnique({
    where: { id: playbookId },
    select: { performance: true },
  });

  if (!playbook) throw new Error(`Playbook not found: ${playbookId}`);

  return playbook.performance as unknown as VerticalPlaybookPerformance;
}

/**
 * List playbooks with optional filters.
 *
 * Requirements: 12.8
 */
export async function listPlaybooks(filters?: PlaybookFilters): Promise<VerticalPlaybook[]> {
  const where: Record<string, unknown> = {};

  if (filters?.vertical) where.vertical = filters.vertical;
  if (filters?.status) where.status = filters.status;

  const records = await prisma.verticalPlaybook.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  let playbooks = records.map((r) => ({
    id: r.id,
    vertical: r.vertical,
    status: r.status as VerticalPlaybook['status'],
    config: r.config as unknown as VerticalPlaybookConfig,
    performance: r.performance as unknown as VerticalPlaybookPerformance,
    createdAt: r.createdAt,
    lastOptimized: r.lastOptimized,
  }));

  if (filters?.minWinRate !== undefined) {
    playbooks = playbooks.filter(
      (p) => p.performance.winRate >= filters.minWinRate!
    );
  }

  return playbooks;
}
