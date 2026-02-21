/**
 * Property-based tests for BenchmarkEngine
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 6.2: Write property tests for Benchmark Engine
 *   - Property 13: Benchmark Metric Extraction
 *   - Property 14: Benchmark Cohort Matching
 *   - Property 15: Benchmark Cohort Fallback
 *   - Property 16: Benchmark Metadata Completeness
 *   - Property 35: Anonymized Metric Field Completeness
 *   - Property 36: Benchmark Query Privacy
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 8.6, 8.7
 */

import * as fc from 'fast-check';
import { BenchmarkEngine, K_ANONYMITY_MINIMUM } from '../benchmark-engine';
import { AnonymizedMetric, BenchmarkQuery } from '../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const industryArb = fc.oneof(
  fc.constant('dental'),
  fc.constant('medical'),
  fc.constant('legal'),
  fc.constant('retail'),
  fc.constant('hospitality'),
);

const businessSizeArb = fc.constantFrom('small', 'medium', 'large') as fc.Arbitrary<'small' | 'medium' | 'large'>;

const localeArb = fc.constantFrom(
  'en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES',
);

const metricTypeArb = fc.oneof(
  fc.constant('score'),
  fc.constant('pageSpeed'),
  fc.constant('mobileScore'),
  fc.constant('seoScore'),
);

/** Build a single AnonymizedMetric with optional overrides. */
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

/** Build `count` metrics sharing the same overrides, with varying values. */
function makeMetrics(count: number, overrides: Partial<AnonymizedMetric> = {}): AnonymizedMetric[] {
  return Array.from({ length: count }, (_, i) =>
    makeMetric({ value: 50 + i, ...overrides }),
  );
}

/**
 * Arbitrary that generates a batch of AnonymizedMetric objects for a single cohort.
 * Produces at least K_ANONYMITY_MINIMUM records so cohort queries return real data.
 */
const cohortMetricsBatchArb = fc
  .tuple(industryArb, businessSizeArb, localeArb, metricTypeArb)
  .chain(([industry, businessSize, locale, metricType]) =>
    fc
      .array(fc.float({ min: 0, max: 100, noNaN: true }), {
        minLength: K_ANONYMITY_MINIMUM,
        maxLength: 30,
      })
      .map((values) =>
        values.map((value) =>
          makeMetric({ industry, businessSize, locale, metricType, value }),
        ),
      )
      .map((metrics) => ({ metrics, industry, businessSize, locale, metricType })),
  );

/**
 * Arbitrary for a BenchmarkQuery that matches a known cohort.
 */
const benchmarkQueryArb = fc
  .tuple(industryArb, businessSizeArb, localeArb)
  .map(([industry, businessSize, locale]): BenchmarkQuery => ({ industry, businessSize, locale }));

// ---------------------------------------------------------------------------
// Property 13: Benchmark Metric Extraction
// Validates: Requirements 4.1
// ---------------------------------------------------------------------------

describe('Property 13: Benchmark Metric Extraction', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 13: Benchmark Metric Extraction
   *
   * For any completed audit, the Benchmark_Engine SHALL extract anonymized metrics
   * and categorize them by industry, business size, and locale.
   *
   * Validates: Requirements 4.1
   */
  it('should categorize stored metrics by industry, businessSize, and locale', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

        // The cohort must reflect the correct categorization dimensions
        expect(cohort.industry).toBe(industry);
        expect(cohort.locale).toBe(locale);
        expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 13: Benchmark Metric Extraction
   *
   * Metrics from different cohorts must be stored independently.
   *
   * Validates: Requirements 4.1
   */
  it('should store metrics from different cohorts independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, industryArb).filter(([a, b]) => a !== b),
        async ([industryA, industryB]) => {
          const engine = new BenchmarkEngine();
          await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { industry: industryA, locale: 'en-US', businessSize: 'small' }));
          await engine.addMetrics(makeMetrics(K_ANONYMITY_MINIMUM, { industry: industryB, locale: 'en-US', businessSize: 'small' }));

          const cohortA = await engine.queryBenchmarks({ industry: industryA, locale: 'en-US', businessSize: 'small' });
          const cohortB = await engine.queryBenchmarks({ industry: industryB, locale: 'en-US', businessSize: 'small' });

          expect(cohortA.industry).toBe(industryA);
          expect(cohortB.industry).toBe(industryB);
          // Each cohort should have exactly K_ANONYMITY_MINIMUM records (not mixed)
          expect(cohortA.recordCount).toBe(K_ANONYMITY_MINIMUM);
          expect(cohortB.recordCount).toBe(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Benchmark Cohort Matching
// Validates: Requirements 4.2
// ---------------------------------------------------------------------------

describe('Property 14: Benchmark Cohort Matching', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 14: Benchmark Cohort Matching
   *
   * For any benchmark query, the System SHALL return benchmarks for the requested
   * industry, business size, and locale cohort.
   *
   * Validates: Requirements 4.2
   */
  it('should return the correct cohort for any valid query with sufficient data', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

        // The returned cohort must match the queried dimensions
        expect(cohort.industry).toBe(industry);
        expect(cohort.locale).toBe(locale);
        expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        expect(cohort.metrics).toBeInstanceOf(Map);
        expect(cohort.metrics.size).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 14: Benchmark Cohort Matching
   *
   * The returned cohort must contain the metric types that were stored.
   *
   * Validates: Requirements 4.2
   */
  it('should include stored metric types in the returned cohort', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, businessSizeArb, localeArb, metricTypeArb),
        async ([industry, businessSize, locale, metricType]) => {
          const engine = new BenchmarkEngine();
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM, { industry, businessSize, locale, metricType }),
          );

          const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });
          expect(cohort.metrics.has(metricType)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 14: Benchmark Cohort Matching
   *
   * The cohort must have a lastUpdated date.
   *
   * Validates: Requirements 4.2
   */
  it('should return a cohort with a valid lastUpdated timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });
        expect(cohort.lastUpdated).toBeInstanceOf(Date);
        expect(isNaN(cohort.lastUpdated.getTime())).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Benchmark Cohort Fallback
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------

describe('Property 15: Benchmark Cohort Fallback', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 15: Benchmark Cohort Fallback
   *
   * For any benchmark query where the specific cohort has insufficient data,
   * the System SHALL fall back to broader cohorts.
   *
   * Validates: Requirements 4.3
   */
  it('should fall back to industry+locale cohort when businessSize cohort is insufficient', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, localeArb),
        async ([industry, locale]) => {
          const engine = new BenchmarkEngine();
          // Add enough records for 'medium' but not for 'small'
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM, { industry, locale, businessSize: 'medium' }),
          );

          // Query for 'small' which has no data — should fall back
          const cohort = await engine.queryBenchmarks({ industry, locale, businessSize: 'small' });

          // Must return a cohort with data (from fallback)
          expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 15: Benchmark Cohort Fallback
   *
   * When industry+locale cohort is insufficient, fall back to industry-only.
   *
   * Validates: Requirements 4.3
   */
  it('should fall back to industry-only cohort when industry+locale is insufficient', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, localeArb, localeArb).filter(([, a, b]) => a !== b),
        async ([industry, localeA, localeB]) => {
          const engine = new BenchmarkEngine();
          // Add records for localeA only (not enough for localeB)
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM, { industry, locale: localeA, businessSize: 'small' }),
          );

          // Query for localeB which has no data — should fall back to industry-only
          const cohort = await engine.queryBenchmarks({ industry, locale: localeB, businessSize: 'small' });

          expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 15: Benchmark Cohort Fallback
   *
   * When all specific cohorts are insufficient, fall back to all-records cohort.
   *
   * Validates: Requirements 4.3
   */
  it('should fall back to all-records cohort as last resort', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, industryArb).filter(([a, b]) => a !== b),
        async ([industryA, industryB]) => {
          const engine = new BenchmarkEngine();
          // Add records for industryA only
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM, { industry: industryA, locale: 'en-US', businessSize: 'small' }),
          );

          // Query for industryB with a locale that has no data — should fall back to all records
          const cohort = await engine.queryBenchmarks({ industry: industryB, locale: 'fr-FR', businessSize: 'large' });

          expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 15: Benchmark Cohort Fallback
   *
   * When no data exists at all, return an empty cohort (not an error).
   *
   * Validates: Requirements 4.3
   */
  it('should return an empty cohort (not throw) when no data exists', async () => {
    await fc.assert(
      fc.asyncProperty(benchmarkQueryArb, async (query) => {
        const engine = new BenchmarkEngine();
        const cohort = await engine.queryBenchmarks(query);

        expect(cohort).toBeDefined();
        expect(cohort.recordCount).toBe(0);
        expect(cohort.metrics).toBeInstanceOf(Map);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Benchmark Metadata Completeness
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('Property 16: Benchmark Metadata Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 16: Benchmark Metadata Completeness
   *
   * For any benchmark displayed, the display SHALL include sample size and confidence level.
   *
   * Validates: Requirements 4.4
   */
  it('should include sampleSize in every BenchmarkMetric returned', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

        for (const [, metric] of cohort.metrics) {
          expect(typeof metric.sampleSize).toBe('number');
          expect(metric.sampleSize).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 16: Benchmark Metadata Completeness
   *
   * getCohortStats() must include confidence level for any cohort.
   *
   * Validates: Requirements 4.4
   */
  it('should include confidence level in CohortStats for any cohort', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });
        const stats = await engine.getCohortStats(cohort.id!);

        expect(typeof stats.confidence).toBe('number');
        expect(stats.confidence).toBeGreaterThanOrEqual(0);
        expect(stats.confidence).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 16: Benchmark Metadata Completeness
   *
   * getCohortStats() must include recordCount for any cohort.
   *
   * Validates: Requirements 4.4
   */
  it('should include recordCount in CohortStats for any cohort', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });
        const stats = await engine.getCohortStats(cohort.id!);

        expect(typeof stats.recordCount).toBe('number');
        expect(stats.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 16: Benchmark Metadata Completeness
   *
   * Confidence must increase monotonically with sample size.
   *
   * Validates: Requirements 4.4
   */
  it('should have higher confidence for larger sample sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, businessSizeArb, localeArb),
        fc.integer({ min: K_ANONYMITY_MINIMUM, max: 20 }),
        fc.integer({ min: 21, max: 50 }),
        async ([industry, businessSize, locale], smallCount, largeCount) => {
          const engineSmall = new BenchmarkEngine();
          await engineSmall.addMetrics(makeMetrics(smallCount, { industry, businessSize, locale }));
          const cohortSmall = await engineSmall.queryBenchmarks({ industry, businessSize, locale });
          const statsSmall = await engineSmall.getCohortStats(cohortSmall.id!);

          const engineLarge = new BenchmarkEngine();
          await engineLarge.addMetrics(makeMetrics(largeCount, { industry, businessSize, locale }));
          const cohortLarge = await engineLarge.queryBenchmarks({ industry, businessSize, locale });
          const statsLarge = await engineLarge.getCohortStats(cohortLarge.id!);

          expect(statsLarge.confidence).toBeGreaterThan(statsSmall.confidence);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 35: Anonymized Metric Field Completeness
// Validates: Requirements 8.6
// ---------------------------------------------------------------------------

describe('Property 35: Anonymized Metric Field Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 35: Anonymized Metric Field Completeness
   *
   * For any stored anonymized metric, the record SHALL include industry,
   * business size, locale, and performance metrics.
   *
   * Validates: Requirements 8.6
   */
  it('should require industry, businessSize, locale, metricType, and value on every stored metric', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            industry: industryArb,
            businessSize: businessSizeArb,
            locale: localeArb,
            metricType: metricTypeArb,
            value: fc.float({ min: 0, max: 100, noNaN: true }),
            timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          }),
          { minLength: K_ANONYMITY_MINIMUM, maxLength: 30 },
        ),
        async (rawMetrics) => {
          const engine = new BenchmarkEngine();
          await engine.addMetrics(rawMetrics);

          // Query using the first metric's cohort dimensions
          const first = rawMetrics[0];
          const cohort = await engine.queryBenchmarks({
            industry: first.industry,
            businessSize: first.businessSize,
            locale: first.locale,
          });

          // The cohort must have been built from metrics that had all required fields
          expect(cohort.industry).toBeTruthy();
          expect(cohort.businessSize).toBeTruthy();
          expect(cohort.locale).toBeTruthy();
          expect(cohort.metrics.size).toBeGreaterThan(0);

          // Every metric in the cohort must have all statistical fields
          for (const [, metric] of cohort.metrics) {
            expect(metric.name).toBeTruthy();
            expect(typeof metric.mean).toBe('number');
            expect(typeof metric.median).toBe('number');
            expect(typeof metric.p25).toBe('number');
            expect(typeof metric.p75).toBe('number');
            expect(typeof metric.p95).toBe('number');
            expect(typeof metric.sampleSize).toBe('number');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 35: Anonymized Metric Field Completeness
   *
   * Metrics with optional differentialPrivacyNoise field must still be accepted.
   *
   * Validates: Requirements 8.6
   */
  it('should accept metrics with differentialPrivacyNoise field set', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: 0, max: 5, noNaN: true }),
        async (noise) => {
          const engine = new BenchmarkEngine();
          const metrics = makeMetrics(K_ANONYMITY_MINIMUM, {
            differentialPrivacyNoise: noise,
          });
          await engine.addMetrics(metrics);

          const cohort = await engine.queryBenchmarks({ industry: 'dental', locale: 'en-US', businessSize: 'small' });
          expect(cohort.recordCount).toBe(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 35: Anonymized Metric Field Completeness
   *
   * The cohort must include kAnonymity field reflecting the record count.
   *
   * Validates: Requirements 8.6
   */
  it('should include kAnonymity field in every returned cohort', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

        expect(typeof cohort.kAnonymity).toBe('number');
        expect(cohort.kAnonymity).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 36: Benchmark Query Privacy
// Validates: Requirements 8.7
// ---------------------------------------------------------------------------

/** Known PII field names that must never appear as keys in benchmark results. */
const PII_FIELD_NAMES = ['clientId', 'clientName', 'domain', 'contactInfo', 'email', 'phone'];

/** Known PII value patterns that must never appear in benchmark results. */
const PII_VALUE_PATTERNS = [
  /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/, // email address
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,                     // phone number
];

/** Check that a value contains no PII field names or value patterns. */
function containsPII(value: unknown): boolean {
  const serialized = JSON.stringify(value, (_key, val) => {
    if (val instanceof Map) {
      return Object.fromEntries(val);
    }
    return val;
  });

  // Check for PII field names as JSON keys (e.g., "clientId":)
  for (const field of PII_FIELD_NAMES) {
    if (serialized.includes(`"${field}"`)) return true;
  }

  // Check for PII value patterns
  for (const pattern of PII_VALUE_PATTERNS) {
    if (pattern.test(serialized)) return true;
  }

  return false;
}

describe('Property 36: Benchmark Query Privacy', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 36: Benchmark Query Privacy
   *
   * For any benchmark query result, the result SHALL not contain data that
   * could identify individual clients.
   *
   * Validates: Requirements 8.7
   */
  it('should not include any PII in returned BenchmarkCohort', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

        expect(containsPII(cohort)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 36: Benchmark Query Privacy
   *
   * CohortStats returned by getCohortStats() must not contain PII.
   *
   * Validates: Requirements 8.7
   */
  it('should not include any PII in CohortStats', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });
        const stats = await engine.getCohortStats(cohort.id!);

        expect(containsPII(stats)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 36: Benchmark Query Privacy
   *
   * The cohort must not expose individual metric values — only aggregates.
   * Specifically, the cohort metrics map must contain BenchmarkMetric objects
   * (with mean/median/percentiles), not raw individual values.
   *
   * Validates: Requirements 8.7
   */
  it('should expose only aggregate statistics, not individual metric values', async () => {
    await fc.assert(
      fc.asyncProperty(cohortMetricsBatchArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

        // Each entry in the metrics map must be a BenchmarkMetric (aggregate), not a raw array
        for (const [, metric] of cohort.metrics) {
          expect(typeof metric).toBe('object');
          expect(Array.isArray(metric)).toBe(false);
          // Must have aggregate fields
          expect('mean' in metric).toBe(true);
          expect('median' in metric).toBe(true);
          expect('sampleSize' in metric).toBe(true);
          // Must NOT expose individual raw values as an array
          expect('values' in metric).toBe(false);
          expect('rawValues' in metric).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 36: Benchmark Query Privacy
   *
   * TrendData returned by getTrendData() must not contain PII.
   *
   * Validates: Requirements 8.7
   */
  it('should not include PII in TrendData results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, localeArb),
        fc.array(fc.float({ min: 0, max: 100, noNaN: true }), { minLength: 3, maxLength: 10 }),
        async ([industry, locale], values) => {
          const engine = new BenchmarkEngine();
          const metrics = values.map((value, i) =>
            makeMetric({
              industry,
              locale,
              businessSize: 'small',
              value,
              timestamp: new Date(2024, i % 12, 15),
            }),
          );
          await engine.addMetrics(metrics);

          const trend = await engine.getTrendData(industry, locale, {
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
          });

          expect(containsPII(trend)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
