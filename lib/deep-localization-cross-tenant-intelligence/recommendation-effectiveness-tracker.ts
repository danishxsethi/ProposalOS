/**
 * RecommendationEffectivenessTracker
 *
 * Measures actual impact of implemented recommendations vs predicted impact.
 * Tracks traffic, ranking, and conversion changes to improve predictive accuracy.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import {
  RecommendationImplementation,
  EffectivenessRecord,
  EffectivenessStats,
  AccuracyMetrics,
} from './types';

// Minimum records required to surface effectiveness data in proposals (Req 10.5)
const MIN_RECORDS_FOR_PROPOSALS = 5;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Compute accuracy as 1 - mean absolute error (normalized to 0-1 scale).
 * Each impact dimension is treated as a percentage change; we normalize by
 * clamping the absolute error to [0, 1] so accuracy stays in [0, 1].
 */
function computeAccuracy(
  predicted: { trafficChange: number; rankingChange: number; conversionChange: number },
  actual: { trafficChange: number; rankingChange: number; conversionChange: number },
): number {
  const normalize = (err: number): number => Math.min(Math.abs(err) / 100, 1);

  const trafficErr = normalize(actual.trafficChange - predicted.trafficChange);
  const rankingErr = normalize(actual.rankingChange - predicted.rankingChange);
  const conversionErr = normalize(actual.conversionChange - predicted.conversionChange);

  const meanErr = (trafficErr + rankingErr + conversionErr) / 3;
  return Math.max(0, 1 - meanErr);
}

/**
 * Compute a simple confidence level based on sample size.
 * More records → higher confidence, capped at 1.
 */
function computeConfidence(sampleSize: number): number {
  return Math.min(sampleSize / 30, 1);
}

function computeTrend(values: number[]): 'improving' | 'stable' | 'declining' {
  if (values.length < 2) return 'stable';
  const first = values.slice(0, Math.ceil(values.length / 2));
  const second = values.slice(Math.floor(values.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  const delta = avgSecond - avgFirst;
  if (delta > 0.02) return 'improving';
  if (delta < -0.02) return 'declining';
  return 'stable';
}

export class RecommendationEffectivenessTracker {
  private implementations: Map<string, RecommendationImplementation> = new Map();
  private outcomes: Map<string, EffectivenessRecord> = new Map(); // keyed by outcome id
  // Map from implementationId → outcome id for quick lookup
  private outcomeByImpl: Map<string, string> = new Map();

  /**
   * Record when a recommendation is implemented.
   * Returns the implementation ID.
   */
  async recordImplementation(impl: RecommendationImplementation): Promise<string> {
    const id = impl.id ?? generateId();
    const stored: RecommendationImplementation = { ...impl, id };
    this.implementations.set(id, stored);
    return id;
  }

  /**
   * Capture re-audit results and compute accuracy vs predicted impact.
   * Accuracy = 1 - average absolute error between predicted and actual (normalized).
   */
  async recordOutcome(
    implementationId: string,
    outcome: {
      reAuditDate: Date;
      actualImpact: { trafficChange: number; rankingChange: number; conversionChange: number };
    },
  ): Promise<EffectivenessRecord> {
    const impl = this.implementations.get(implementationId);
    if (!impl) {
      throw new Error(`Implementation not found: ${implementationId}`);
    }

    const accuracy = computeAccuracy(impl.predictedImpact, outcome.actualImpact);

    // Confidence based on how many outcomes exist for this type/industry/locale
    const relatedCount = this.countRelatedOutcomes(
      impl.recommendationType,
      impl.industry,
      impl.locale,
    );
    const confidenceLevel = computeConfidence(relatedCount + 1);

    const record: EffectivenessRecord = {
      id: generateId(),
      implementationId,
      reAuditDate: outcome.reAuditDate,
      actualImpact: outcome.actualImpact,
      accuracy,
      confidenceLevel,
    };

    this.outcomes.set(record.id!, record);
    this.outcomeByImpl.set(implementationId, record.id!);

    return record;
  }

  /**
   * Returns statistics grouped by recommendationType, industry, locale.
   * Optionally filtered by any combination of those dimensions.
   */
  async getEffectivenessStats(filters?: {
    recommendationType?: string;
    industry?: string;
    locale?: string;
  }): Promise<EffectivenessStats[]> {
    // Collect all (implementation, outcome) pairs
    const pairs = this.getMatchedPairs();

    // Apply filters
    const filtered = pairs.filter(({ impl }) => {
      if (filters?.recommendationType && impl.recommendationType !== filters.recommendationType)
        return false;
      if (filters?.industry && impl.industry !== filters.industry) return false;
      if (filters?.locale && impl.locale !== filters.locale) return false;
      return true;
    });

    // Group by (recommendationType, industry, locale)
    const groups = new Map<
      string,
      { impl: RecommendationImplementation; outcome: EffectivenessRecord }[]
    >();

    for (const pair of filtered) {
      const key = `${pair.impl.recommendationType}|${pair.impl.industry}|${pair.impl.locale}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pair);
    }

    const stats: EffectivenessStats[] = [];

    for (const [, group] of groups) {
      const { impl } = group[0];
      const accuracies = group.map((p) => p.outcome.accuracy);
      const impacts = group.map(
        (p) =>
          (Math.abs(p.outcome.actualImpact.trafficChange) +
            Math.abs(p.outcome.actualImpact.rankingChange) +
            Math.abs(p.outcome.actualImpact.conversionChange)) /
          3,
      );

      const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
      const avgImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;
      const n = group.length;

      // 95% confidence interval using normal approximation (simplified)
      const stdErr = n > 1 ? Math.sqrt(avgAccuracy * (1 - avgAccuracy) / n) : 0;
      const margin = 1.96 * stdErr;

      stats.push({
        recommendationType: impl.recommendationType,
        industry: impl.industry,
        locale: impl.locale,
        sampleSize: n,
        averageAccuracy: avgAccuracy,
        averageActualImpact: avgImpact,
        confidenceInterval: [
          Math.max(0, avgAccuracy - margin),
          Math.min(1, avgAccuracy + margin),
        ],
      });
    }

    return stats;
  }

  /**
   * Returns overall accuracy and breakdowns by type, industry, locale.
   */
  async getAccuracyTrends(): Promise<AccuracyMetrics> {
    const pairs = this.getMatchedPairs();

    if (pairs.length === 0) {
      return {
        overallAccuracy: 0,
        byRecommendationType: new Map(),
        byIndustry: new Map(),
        byLocale: new Map(),
        trend: 'stable',
      };
    }

    const allAccuracies = pairs.map((p) => p.outcome.accuracy);
    const overallAccuracy = allAccuracies.reduce((a, b) => a + b, 0) / allAccuracies.length;

    const byRecommendationType = this.groupAccuracies(pairs, (p) => p.impl.recommendationType);
    const byIndustry = this.groupAccuracies(pairs, (p) => p.impl.industry);
    const byLocale = this.groupAccuracies(pairs, (p) => p.impl.locale);

    // Sort by reAuditDate to compute trend
    const sorted = [...pairs].sort(
      (a, b) => a.outcome.reAuditDate.getTime() - b.outcome.reAuditDate.getTime(),
    );
    const trend = computeTrend(sorted.map((p) => p.outcome.accuracy));

    return {
      overallAccuracy,
      byRecommendationType,
      byIndustry,
      byLocale,
      trend,
    };
  }

  /**
   * Returns overall predictive accuracy as a 0-1 number.
   */
  async getPredictiveAccuracy(): Promise<number> {
    const pairs = this.getMatchedPairs();
    if (pairs.length === 0) return 0;
    const sum = pairs.reduce((acc, p) => acc + p.outcome.accuracy, 0);
    return sum / pairs.length;
  }

  /**
   * Returns whether sufficient data exists to surface effectiveness in proposals.
   * Requirement 10.5: >= MIN_RECORDS_FOR_PROPOSALS records needed.
   */
  hasSufficientDataForProposals(
    recommendationType: string,
    industry: string,
    locale: string,
  ): boolean {
    return (
      this.countRelatedOutcomes(recommendationType, industry, locale) >= MIN_RECORDS_FOR_PROPOSALS
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getMatchedPairs(): {
    impl: RecommendationImplementation;
    outcome: EffectivenessRecord;
  }[] {
    const pairs: { impl: RecommendationImplementation; outcome: EffectivenessRecord }[] = [];
    for (const [implId, outcomeId] of this.outcomeByImpl) {
      const impl = this.implementations.get(implId);
      const outcome = this.outcomes.get(outcomeId);
      if (impl && outcome) pairs.push({ impl, outcome });
    }
    return pairs;
  }

  private countRelatedOutcomes(
    recommendationType: string,
    industry: string,
    locale: string,
  ): number {
    return this.getMatchedPairs().filter(
      ({ impl }) =>
        impl.recommendationType === recommendationType &&
        impl.industry === industry &&
        impl.locale === locale,
    ).length;
  }

  private groupAccuracies(
    pairs: { impl: RecommendationImplementation; outcome: EffectivenessRecord }[],
    keyFn: (p: { impl: RecommendationImplementation; outcome: EffectivenessRecord }) => string,
  ): Map<string, number> {
    const groups = new Map<string, number[]>();
    for (const pair of pairs) {
      const key = keyFn(pair);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pair.outcome.accuracy);
    }
    const result = new Map<string, number>();
    for (const [key, values] of groups) {
      result.set(key, values.reduce((a, b) => a + b, 0) / values.length);
    }
    return result;
  }
}
