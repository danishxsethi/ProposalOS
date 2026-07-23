/**
 * BenchmarkEngine: Aggregates anonymized metrics by industry, size, and locale.
 *
 * Provides:
 * - addMetrics()        - store anonymized metrics and update cohort statistics
 * - queryBenchmarks()   - retrieve cohort-specific benchmarks with fallback
 * - getCohortStats()    - return benchmark statistics with sample size and confidence
 * - getTrendData()      - trend analysis over time for a given industry/locale
 * - enforceKAnonymity() - ensure all cohorts meet k ≥ 10 requirement
 * - getMergedCohort()   - return merged cohort when k-anonymity would be violated
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 8.4, 8.5, 8.6, 8.7, 12.3
 */

import {
  AnonymizedMetric,
  BenchmarkCohort,
  BenchmarkMetric,
  BenchmarkQuery,
  CohortStats,
  TimeRange,
  TrendData,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Minimum k-anonymity requirement: every cohort must have at least this many records. */
export const K_ANONYMITY_MINIMUM = 10;

/**
 * Confidence is computed as a function of sample size.
 * Returns a value in [0, 1] that grows toward 1 as sampleSize grows.
 * Formula: 1 - 1 / (1 + sampleSize / K_ANONYMITY_MINIMUM)
 */
function computeConfidence(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  return 1 - 1 / (1 + sampleSize / K_ANONYMITY_MINIMUM);
}

// ============================================================================
// In-memory storage types
// ============================================================================

interface StoredMetric extends AnonymizedMetric {
  id: string;
}

// ============================================================================
// BenchmarkEngine
// ============================================================================

export class BenchmarkEngine {
  /**
   * All stored anonymized metrics, keyed by a generated UUID-like id.
   */
  private metrics: Map<string, StoredMetric> = new Map();

  /**
   * Cohort cache: key is `${industry}|${businessSize}|${locale}`.
   * Rebuilt lazily whenever metrics are added.
   */
  private cohortCache: Map<string, BenchmarkCohort> = new Map();

  /** Whether the cohort cache is stale and needs rebuilding. */
  private cacheDirty = false;

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Store a batch of anonymized metrics and invalidate the cohort cache.
   *
   * Requirements: 4.1, 8.6
   */
  async addMetrics(metrics: AnonymizedMetric[]): Promise<void> {
    for (const metric of metrics) {
      const id = metric.id ?? this.generateId();
      const stored: StoredMetric = { ...metric, id };
      this.metrics.set(id, stored);
    }
    this.cacheDirty = true;
  }

  /**
   * Retrieve cohort-specific benchmarks for the given query.
   *
   * Falls back to broader cohorts when the specific cohort has insufficient
   * data (< K_ANONYMITY_MINIMUM records):
   *   1. industry + businessSize + locale  (exact match)
   *   2. industry + locale                 (drop businessSize)
   *   3. industry                          (drop locale)
   *   4. all records                       (broadest fallback)
   *
   * Requirements: 4.2, 4.3
   */
  async queryBenchmarks(query: BenchmarkQuery): Promise<BenchmarkCohort> {
    this.rebuildCacheIfDirty();

    // Attempt progressively broader cohorts until we find one with enough data.
    const candidates = this.buildFallbackChain(query);

    for (const cohortKey of candidates) {
      const cohort = this.cohortCache.get(cohortKey);
      if (cohort && cohort.recordCount >= K_ANONYMITY_MINIMUM) {
        return cohort;
      }
    }

    // If no cohort meets k-anonymity, return the broadest available cohort
    // (or an empty cohort if there is no data at all).
    const broadest = candidates[candidates.length - 1];
    return this.cohortCache.get(broadest) ?? this.emptyBenchmarkCohort(query);
  }

  /**
   * Return benchmark statistics for a specific cohort id.
   *
   * Includes sample size and confidence level as required by Requirement 4.4.
   *
   * Requirements: 4.4
   */
  async getCohortStats(cohortId: string): Promise<CohortStats> {
    this.rebuildCacheIfDirty();

    for (const cohort of this.cohortCache.values()) {
      if (cohort.id === cohortId) {
        return this.cohortToStats(cohort);
      }
    }

    // Cohort not found — return empty stats.
    return {
      recordCount: 0,
      kAnonymity: 0,
      metrics: [],
      confidence: 0,
    };
  }

  /**
   * Enforce k-anonymity across all cohorts.
   *
   * Any cohort with fewer than `minK` records is merged into the next broader
   * cohort (industry+locale → industry → all).
   *
   * Requirements: 8.4, 8.5, 12.3
   */
  async enforceKAnonymity(minK: number = K_ANONYMITY_MINIMUM): Promise<void> {
    this.rebuildCacheIfDirty();

    for (const [key, cohort] of this.cohortCache.entries()) {
      if (cohort.recordCount < minK) {
        // Merge into broader cohort by removing the most specific dimension.
        const merged = await this.getMergedCohort(key);
        // Replace the under-populated cohort with the merged version.
        this.cohortCache.set(key, merged);
      }
    }
  }

  /**
   * Return a merged (broader) cohort for the given cohort key.
   *
   * Merging strategy:
   *   industry|businessSize|locale → industry|locale → industry → all
   *
   * Requirements: 8.5
   */
  async getMergedCohort(cohortId: string): Promise<BenchmarkCohort> {
    this.rebuildCacheIfDirty();

    // cohortId may be a cache key like "dental|small|en-US" or an actual UUID.
    // Try to find the cohort by id first, then by key.
    let cohort = this.findCohortById(cohortId) ?? this.cohortCache.get(cohortId);

    if (!cohort) {
      return this.emptyBenchmarkCohort({ industry: 'unknown', locale: 'en-US' });
    }

    // Build a query that drops the most specific dimension.
    const broaderQuery = this.buildBroaderQuery(cohort);
    return this.queryBenchmarks(broaderQuery);
  }

  /**
   * Return trend data for a given industry and locale over a time range.
   *
   * Aggregates the mean of all metric values per time bucket (monthly).
   *
   * Requirements: 4.1 (trend analysis)
   */
  async getTrendData(
    industry: string,
    locale: string,
    timeRange: TimeRange,
  ): Promise<TrendData> {
    const relevant = Array.from(this.metrics.values()).filter(
      (m) =>
        m.industry === industry &&
        m.locale === locale &&
        m.timestamp >= timeRange.startDate &&
        m.timestamp <= timeRange.endDate,
    );

    if (relevant.length === 0) {
      return { timestamps: [], values: [], trend: 'stable' };
    }

    // Bucket by month (YYYY-MM).
    const buckets = new Map<string, number[]>();
    for (const m of relevant) {
      const bucket = this.monthBucket(m.timestamp);
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(m.value);
    }

    // Sort buckets chronologically.
    const sortedKeys = Array.from(buckets.keys()).sort();
    const timestamps = sortedKeys.map((k) => new Date(`${k}-01T00:00:00Z`));
    const values = sortedKeys.map((k) => {
      const vals = buckets.get(k)!;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });

    const trend = this.computeTrend(values);
    return { timestamps, values, trend };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Rebuild the cohort cache from all stored metrics.
   * Groups metrics by (industry, businessSize, locale) and computes statistics.
   */
  private rebuildCacheIfDirty(): void {
    if (!this.cacheDirty) return;

    this.cohortCache.clear();

    // Group metrics by cohort key.
    const groups = new Map<string, StoredMetric[]>();
    for (const metric of this.metrics.values()) {
      const key = this.cohortKey(metric.industry, metric.businessSize, metric.locale);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(metric);
    }

    // Build cohort for each group.
    for (const [key, groupMetrics] of groups.entries()) {
      const [industry, businessSize, locale] = key.split('|');
      const cohort = this.buildCohort(industry, businessSize, locale, groupMetrics);
      this.cohortCache.set(key, cohort);
    }

    // Also build aggregate cohorts for fallback queries.
    this.buildAggregateCohorts();

    this.cacheDirty = false;
  }

  /**
   * Build aggregate cohorts for fallback:
   *   - industry + locale (all sizes)
   *   - industry only (all sizes, all locales)
   *   - all (broadest)
   */
  private buildAggregateCohorts(): void {
    // industry + locale (drop businessSize → use '*')
    const byIndustryLocale = new Map<string, StoredMetric[]>();
    for (const metric of this.metrics.values()) {
      const key = this.cohortKey(metric.industry, '*', metric.locale);
      if (!byIndustryLocale.has(key)) byIndustryLocale.set(key, []);
      byIndustryLocale.get(key)!.push(metric);
    }
    for (const [key, groupMetrics] of byIndustryLocale.entries()) {
      const [industry, , locale] = key.split('|');
      const cohort = this.buildCohort(industry, '*', locale, groupMetrics);
      this.cohortCache.set(key, cohort);
    }

    // industry only (drop businessSize and locale → use '*')
    const byIndustry = new Map<string, StoredMetric[]>();
    for (const metric of this.metrics.values()) {
      const key = this.cohortKey(metric.industry, '*', '*');
      if (!byIndustry.has(key)) byIndustry.set(key, []);
      byIndustry.get(key)!.push(metric);
    }
    for (const [key, groupMetrics] of byIndustry.entries()) {
      const [industry] = key.split('|');
      const cohort = this.buildCohort(industry, '*', '*', groupMetrics);
      this.cohortCache.set(key, cohort);
    }

    // All records (broadest fallback)
    const allMetrics = Array.from(this.metrics.values());
    if (allMetrics.length > 0) {
      const allCohort = this.buildCohort('*', '*', '*', allMetrics);
      this.cohortCache.set(this.cohortKey('*', '*', '*'), allCohort);
    }
  }

  /**
   * Build a BenchmarkCohort from a group of metrics.
   */
  private buildCohort(
    industry: string,
    businessSize: string,
    locale: string,
    groupMetrics: StoredMetric[],
  ): BenchmarkCohort {
    // Group values by metricType.
    const byType = new Map<string, number[]>();
    for (const m of groupMetrics) {
      if (!byType.has(m.metricType)) byType.set(m.metricType, []);
      byType.get(m.metricType)!.push(m.value);
    }

    const metricsMap = new Map<string, BenchmarkMetric>();
    for (const [metricType, values] of byType.entries()) {
      metricsMap.set(metricType, this.computeBenchmarkMetric(metricType, values));
    }

    const key = this.cohortKey(industry, businessSize, locale);
    return {
      id: key,
      industry,
      businessSize,
      locale,
      recordCount: groupMetrics.length,
      metrics: metricsMap,
      kAnonymity: groupMetrics.length,
      lastUpdated: new Date(),
    };
  }

  /**
   * Compute statistical summary for a set of values.
   */
  private computeBenchmarkMetric(name: string, values: number[]): BenchmarkMetric {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const median = this.percentile(sorted, 50);
    const p25 = this.percentile(sorted, 25);
    const p75 = this.percentile(sorted, 75);
    const p95 = this.percentile(sorted, 95);

    return { name, mean, median, p25, p75, p95, sampleSize: n };
  }

  /**
   * Compute the p-th percentile of a sorted array.
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  }

  /**
   * Convert a BenchmarkCohort to CohortStats.
   */
  private cohortToStats(cohort: BenchmarkCohort): CohortStats {
    return {
      recordCount: cohort.recordCount,
      kAnonymity: cohort.kAnonymity,
      metrics: Array.from(cohort.metrics.values()),
      confidence: computeConfidence(cohort.recordCount),
    };
  }

  /**
   * Build the fallback chain of cohort keys for a query.
   * Returns keys from most specific to broadest.
   */
  private buildFallbackChain(query: BenchmarkQuery): string[] {
    const { industry, businessSize, locale } = query;
    const chain: string[] = [];

    if (businessSize) {
      chain.push(this.cohortKey(industry, businessSize, locale));
    }
    chain.push(this.cohortKey(industry, '*', locale));
    chain.push(this.cohortKey(industry, '*', '*'));
    chain.push(this.cohortKey('*', '*', '*'));

    return chain;
  }

  /**
   * Build a broader query by dropping the most specific dimension.
   */
  private buildBroaderQuery(cohort: BenchmarkCohort): BenchmarkQuery {
    if (cohort.businessSize !== '*') {
      // Drop businessSize
      return { industry: cohort.industry, locale: cohort.locale };
    }
    if (cohort.locale !== '*') {
      // Drop locale
      return { industry: cohort.industry, locale: '*' };
    }
    // Already broadest
    return { industry: '*', locale: '*' };
  }

  /**
   * Find a cohort by its UUID-like id field.
   */
  private findCohortById(id: string): BenchmarkCohort | undefined {
    for (const cohort of this.cohortCache.values()) {
      if (cohort.id === id) return cohort;
    }
    return undefined;
  }

  /**
   * Return an empty BenchmarkCohort for a query with no data.
   */
  private emptyBenchmarkCohort(query: BenchmarkQuery): BenchmarkCohort {
    return {
      id: this.cohortKey(query.industry, query.businessSize ?? '*', query.locale),
      industry: query.industry,
      businessSize: query.businessSize ?? '*',
      locale: query.locale,
      recordCount: 0,
      metrics: new Map(),
      kAnonymity: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Compute the trend direction from an array of values.
   */
  private computeTrend(values: number[]): 'increasing' | 'stable' | 'decreasing' {
    if (values.length < 2) return 'stable';
    const first = values[0];
    const last = values[values.length - 1];
    const delta = last - first;
    const threshold = Math.abs(first) * 0.05; // 5% change threshold
    if (delta > threshold) return 'increasing';
    if (delta < -threshold) return 'decreasing';
    return 'stable';
  }

  /**
   * Format a Date as a YYYY-MM bucket string.
   */
  private monthBucket(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * Build a cohort cache key.
   */
  private cohortKey(industry: string, businessSize: string, locale: string): string {
    return `${industry}|${businessSize}|${locale}`;
  }

  /**
   * Generate a simple unique id.
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
