/**
 * Unit tests for BenchmarkEngine
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BenchmarkEngine, K_ANONYMITY_MINIMUM } from '../benchmark-engine';
import { AnonymizedMetric } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetric(overrides: Partial<AnonymizedMetric> = {}): AnonymizedMetric {
  return {
    industry: 'dental',
    businessSize: 'small',
    locale: 'en-US',
    metricType: 'score',
    value: 75,
    timestamp: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

/** Create `count` metrics with the given overrides. */
function makeMetrics(count: number, overrides: Partial<AnonymizedMetric> = {}): AnonymizedMetric[] {
  return Array.from({ length: count }, (_, i) =>
    makeMetric({ value: 50 + i, ...overrides }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BenchmarkEngine', () => {
  let engine: BenchmarkEngine;

  beforeEach(() => {
    engine = new BenchmarkEngine();
  });

  // -------------------------------------------------------------------------
  // addMetrics
  // -------------------------------------------------------------------------

  describe('addMetrics', () => {
    it('should accept an empty array without error', async () => {
      await expect(engine.addMetrics([])).resolves.toBeUndefined();
    });

    it('should store metrics and make them queryable', async () => {
      const metrics = makeMetrics(K_ANONYMITY_MINIMUM);
      await engine.addMetrics(metrics);

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      expect(cohort.recordCount).toBe(K_ANONYMITY_MINIMUM);
    });

    it('should accumulate metrics across multiple calls', async () => {
      await engine.addMetrics(makeMetrics(5));
      await engine.addMetrics(makeMetrics(5));

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      expect(cohort.recordCount).toBe(10);
    });

    it('should store metrics with provided id', async () => {
      const metric = makeMetric({ id: 'custom-id-1' });
      await engine.addMetrics([metric]);

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      expect(cohort.recordCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // queryBenchmarks
  // -------------------------------------------------------------------------

  describe('queryBenchmarks', () => {
    it('should return a BenchmarkCohort with required fields', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });

      expect(cohort).toBeDefined();
      expect(cohort.industry).toBe('dental');
      expect(cohort.locale).toBe('en-US');
      expect(cohort.recordCount).toBeGreaterThan(0);
      expect(cohort.metrics).toBeInstanceOf(Map);
      expect(cohort.kAnonymity).toBeGreaterThan(0);
      expect(cohort.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return metrics for the correct cohort', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { industry: 'dental', locale: 'en-US', businessSize: 'small' }));
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { industry: 'legal', locale: 'de-DE', businessSize: 'medium' }));

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      expect(cohort.industry).toBe('dental');
      expect(cohort.locale).toBe('en-US');
    });

    it('should include benchmark statistics in the metrics map', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });

      const metric = cohort.metrics.get('score');
      expect(metric).toBeDefined();
      expect(typeof metric!.mean).toBe('number');
      expect(typeof metric!.median).toBe('number');
      expect(typeof metric!.p25).toBe('number');
      expect(typeof metric!.p75).toBe('number');
      expect(typeof metric!.p95).toBe('number');
      expect(metric!.sampleSize).toBe(K_ANONYMITY_MINIMUM);
    });

    it('should fall back to industry+locale cohort when businessSize cohort has insufficient data', async () => {
      // Add enough records for industry+locale but not for specific businessSize
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { businessSize: 'medium' }));

      // Query for 'small' which has no data — should fall back to industry+locale
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
    });

    it('should fall back to industry-only cohort when industry+locale has insufficient data', async () => {
      // Add enough records for industry but spread across locales
      await engine.addMetrics(makeMetrics(5, { locale: 'en-US' }));
      await engine.addMetrics(makeMetrics(5, { locale: 'de-DE' }));

      // Query for fr-FR which has no data — should fall back to industry-only
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'fr-FR', businessSize: 'small' });
      expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
    });

    it('should fall back to all-records cohort as last resort', async () => {
      // Add enough records across different industries
      await engine.addMetrics(makeMetrics(5, { industry: 'dental' }));
      await engine.addMetrics(makeMetrics(5, { industry: 'legal' }));

      // Query for a completely unknown industry — should fall back to all records
      const cohort = await engine.queryBenchmarks({ industry: 'unknown-industry', locale: 'fr-FR' });
      expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
    });

    it('should return an empty cohort when no data exists at all', async () => {
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US' });
      expect(cohort.recordCount).toBe(0);
      expect(cohort.metrics.size).toBe(0);
    });

    it('should handle query without businessSize', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US' });
      expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
    });
  });

  // -------------------------------------------------------------------------
  // getCohortStats
  // -------------------------------------------------------------------------

  describe('getCohortStats', () => {
    it('should return stats with recordCount, kAnonymity, metrics, and confidence', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });

      const stats = await engine.getCohortStats(cohort.id!);
      expect(stats.recordCount).toBe(K_ANONYMITY_MINIMUM);
      expect(stats.kAnonymity).toBe(K_ANONYMITY_MINIMUM);
      expect(Array.isArray(stats.metrics)).toBe(true);
      expect(stats.confidence).toBeGreaterThan(0);
      expect(stats.confidence).toBeLessThanOrEqual(1);
    });

    it('should return zero stats for unknown cohort id', async () => {
      const stats = await engine.getCohortStats('nonexistent-cohort-id');
      expect(stats.recordCount).toBe(0);
      expect(stats.kAnonymity).toBe(0);
      expect(stats.confidence).toBe(0);
    });

    it('should include all metric types in stats', async () => {
      const metrics = makeMetrics(K_ANONYMITY_MINIMUM).map((m, i) => ({
        ...m,
        metricType: i % 2 === 0 ? 'score' : 'pageSpeed',
      }));
      await engine.addMetrics(metrics);

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const stats = await engine.getCohortStats(cohort.id!);

      const metricNames = stats.metrics.map((m) => m.name);
      expect(metricNames).toContain('score');
      expect(metricNames).toContain('pageSpeed');
    });

    it('should have higher confidence for larger sample sizes', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort10 = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const stats10 = await engine.getCohortStats(cohort10.id!);

      const engine2 = new BenchmarkEngine();
      await engine2.addMetrics(makeMetrics(100));
      const cohort100 = await engine2.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const stats100 = await engine2.getCohortStats(cohort100.id!);

      expect(stats100.confidence).toBeGreaterThan(stats10.confidence);
    });
  });

  // -------------------------------------------------------------------------
  // getTrendData
  // -------------------------------------------------------------------------

  describe('getTrendData', () => {
    it('should return empty trend data when no metrics exist', async () => {
      const trend = await engine.getTrendData('dental', 'en-US', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      expect(trend.timestamps).toHaveLength(0);
      expect(trend.values).toHaveLength(0);
      expect(trend.trend).toBe('stable');
    });

    it('should return trend data bucketed by month', async () => {
      const metrics: AnonymizedMetric[] = [
        makeMetric({ value: 60, timestamp: new Date('2024-01-15') }),
        makeMetric({ value: 65, timestamp: new Date('2024-02-10') }),
        makeMetric({ value: 70, timestamp: new Date('2024-03-20') }),
      ];
      await engine.addMetrics(metrics);

      const trend = await engine.getTrendData('dental', 'en-US', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(trend.timestamps.length).toBe(3);
      expect(trend.values.length).toBe(3);
    });

    it('should detect increasing trend', async () => {
      const metrics: AnonymizedMetric[] = [
        makeMetric({ value: 50, timestamp: new Date('2024-01-15') }),
        makeMetric({ value: 60, timestamp: new Date('2024-02-15') }),
        makeMetric({ value: 80, timestamp: new Date('2024-03-15') }),
      ];
      await engine.addMetrics(metrics);

      const trend = await engine.getTrendData('dental', 'en-US', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(trend.trend).toBe('increasing');
    });

    it('should detect decreasing trend', async () => {
      const metrics: AnonymizedMetric[] = [
        makeMetric({ value: 80, timestamp: new Date('2024-01-15') }),
        makeMetric({ value: 65, timestamp: new Date('2024-02-15') }),
        makeMetric({ value: 50, timestamp: new Date('2024-03-15') }),
      ];
      await engine.addMetrics(metrics);

      const trend = await engine.getTrendData('dental', 'en-US', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(trend.trend).toBe('decreasing');
    });

    it('should only include metrics within the time range', async () => {
      const metrics: AnonymizedMetric[] = [
        makeMetric({ value: 60, timestamp: new Date('2023-12-15') }), // outside range
        makeMetric({ value: 70, timestamp: new Date('2024-06-15') }), // inside range
      ];
      await engine.addMetrics(metrics);

      const trend = await engine.getTrendData('dental', 'en-US', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(trend.timestamps.length).toBe(1);
    });

    it('should filter by industry and locale', async () => {
      await engine.addMetrics([
        makeMetric({ industry: 'dental', locale: 'en-US', value: 70, timestamp: new Date('2024-06-01') }),
        makeMetric({ industry: 'legal', locale: 'de-DE', value: 90, timestamp: new Date('2024-06-01') }),
      ]);

      const trend = await engine.getTrendData('dental', 'en-US', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(trend.values[0]).toBeCloseTo(70);
    });
  });

  // -------------------------------------------------------------------------
  // enforceKAnonymity
  // -------------------------------------------------------------------------

  describe('enforceKAnonymity', () => {
    it('should not throw when all cohorts meet k-anonymity', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      await expect(engine.enforceKAnonymity()).resolves.toBeUndefined();
    });

    it('should merge under-populated cohorts into broader cohorts', async () => {
      // Add 5 records for small + 10 for medium (so small is under k=10)
      await engine.addMetrics(makeMetrics(5, { businessSize: 'small' }));
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { businessSize: 'medium' }));

      await engine.enforceKAnonymity();

      // After enforcement, querying for 'small' should return a merged cohort
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
    });
  });

  // -------------------------------------------------------------------------
  // getMergedCohort
  // -------------------------------------------------------------------------

  describe('getMergedCohort', () => {
    it('should return a broader cohort when given a specific cohort id', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { businessSize: 'small' }));
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { businessSize: 'medium' }));

      const specificCohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const merged = await engine.getMergedCohort(specificCohort.id!);

      // Merged cohort should have more records (includes both small and medium)
      expect(merged.recordCount).toBeGreaterThanOrEqual(specificCohort.recordCount);
    });

    it('should return empty cohort for unknown id', async () => {
      const merged = await engine.getMergedCohort('nonexistent-id');
      expect(merged.recordCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Benchmark metric statistics correctness
  // -------------------------------------------------------------------------

  describe('benchmark metric statistics', () => {
    it('should compute correct mean', async () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      await engine.addMetrics(values.map((v) => makeMetric({ value: v })));

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const metric = cohort.metrics.get('score')!;

      expect(metric.mean).toBeCloseTo(55);
    });

    it('should compute correct median', async () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      await engine.addMetrics(values.map((v) => makeMetric({ value: v })));

      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const metric = cohort.metrics.get('score')!;

      // Median of [10,20,30,40,50,60,70,80,90,100] = 55
      expect(metric.median).toBeCloseTo(55);
    });

    it('should have p25 ≤ median ≤ p75', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const metric = cohort.metrics.get('score')!;

      expect(metric.p25).toBeLessThanOrEqual(metric.median);
      expect(metric.median).toBeLessThanOrEqual(metric.p75);
    });

    it('should have p75 ≤ p95', async () => {
      await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM));
      const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
      const metric = cohort.metrics.get('score')!;

      expect(metric.p75).toBeLessThanOrEqual(metric.p95);
    });
  });
});
