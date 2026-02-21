/**
 * Property-based tests for K-Anonymity enforcement in BenchmarkEngine
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 6.4: Write property tests for K-Anonymity
 *   - Property 33: K-Anonymity Enforcement
 *   - Property 34: Cohort Merging on K-Anonymity Violation
 *   - Property 56: K-Anonymity Guarantee
 *
 * Requirements: 8.4, 8.5, 12.3
 */

import * as fc from 'fast-check';
import { BenchmarkEngine, K_ANONYMITY_MINIMUM } from '../benchmark-engine';
import { AnonymizedMetric } from '../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const industryArb = fc.constantFrom('dental', 'medical', 'legal', 'retail', 'hospitality');

const businessSizeArb = fc.constantFrom('small', 'medium', 'large') as fc.Arbitrary<
  'small' | 'medium' | 'large'
>;

const localeArb = fc.constantFrom('en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES');

const metricTypeArb = fc.constantFrom('score', 'pageSpeed', 'mobileScore', 'seoScore');

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
 * Arbitrary that generates a batch of metrics for a single cohort with
 * a count strictly below K_ANONYMITY_MINIMUM (1–9 records).
 */
const smallCohortArb = fc
  .tuple(industryArb, businessSizeArb, localeArb, metricTypeArb)
  .chain(([industry, businessSize, locale, metricType]) =>
    fc
      .integer({ min: 1, max: K_ANONYMITY_MINIMUM - 1 })
      .map((count) => ({
        metrics: makeMetrics(count, { industry, businessSize, locale, metricType }),
        industry,
        businessSize,
        locale,
        metricType,
        count,
      })),
  );

/**
 * Arbitrary that generates multiple cohorts where the total record count
 * across all cohorts is >= K_ANONYMITY_MINIMUM, ensuring the broadest
 * fallback cohort (*|*|*) always satisfies k >= 10.
 */
const multiCohortArb = fc
  .array(
    fc
      .tuple(industryArb, businessSizeArb, localeArb, metricTypeArb)
      .chain(([industry, businessSize, locale, metricType]) =>
        fc
          .integer({ min: 1, max: 25 })
          .map((count) => makeMetrics(count, { industry, businessSize, locale, metricType })),
      ),
    { minLength: 1, maxLength: 5 },
  )
  .map((batches) => batches.flat())
  .filter((metrics) => metrics.length >= K_ANONYMITY_MINIMUM);

// ---------------------------------------------------------------------------
// Property 33: K-Anonymity Enforcement
// Validates: Requirements 8.4
// ---------------------------------------------------------------------------

describe('Property 33: K-Anonymity Enforcement', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 33: K-Anonymity Enforcement
   *
   * For any stored anonymized metric, the Benchmark_Engine SHALL ensure the
   * cohort has k ≥ 10 records after enforceKAnonymity() is called.
   *
   * Validates: Requirements 8.4
   */
  it('should ensure all cohorts have kAnonymity >= 10 after enforceKAnonymity()', async () => {
    await fc.assert(
      fc.asyncProperty(multiCohortArb, async (metrics) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);
        await engine.enforceKAnonymity();

        // Collect all cohort keys by querying each unique (industry, businessSize, locale)
        const seen = new Set<string>();
        for (const m of metrics) {
          const key = `${m.industry}|${m.businessSize}|${m.locale}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const cohort = await engine.queryBenchmarks({
            industry: m.industry,
            businessSize: m.businessSize,
            locale: m.locale,
          });

          // After enforcement, every cohort returned must satisfy k >= 10
          // (either it had enough records, or it was merged into a broader cohort)
          expect(cohort.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 33: K-Anonymity Enforcement
   *
   * Cohorts that already meet k >= 10 must not be altered by enforceKAnonymity().
   *
   * Validates: Requirements 8.4
   */
  it('should leave cohorts with recordCount >= 10 unchanged after enforceKAnonymity()', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, businessSizeArb, localeArb),
        fc.integer({ min: K_ANONYMITY_MINIMUM, max: 30 }),
        async ([industry, businessSize, locale], count) => {
          const engine = new BenchmarkEngine();
          await engine.addMetrics(makeMetrics(count, { industry, businessSize, locale }));

          const before = await engine.queryBenchmarks({ industry, businessSize, locale });
          await engine.enforceKAnonymity();
          const after = await engine.queryBenchmarks({ industry, businessSize, locale });

          // Record count must be preserved (cohort was already valid)
          expect(after.recordCount).toBe(before.recordCount);
          expect(after.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 33: K-Anonymity Enforcement
   *
   * enforceKAnonymity() must be idempotent — calling it multiple times
   * produces the same result as calling it once.
   *
   * Validates: Requirements 8.4
   */
  it('should be idempotent — calling enforceKAnonymity() twice has the same effect as once', async () => {
    await fc.assert(
      fc.asyncProperty(multiCohortArb, async (metrics) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        await engine.enforceKAnonymity();

        // Snapshot kAnonymity values after first call
        const snapshot: Record<string, number> = {};
        for (const m of metrics) {
          const key = `${m.industry}|${m.businessSize}|${m.locale}`;
          if (key in snapshot) continue;
          const cohort = await engine.queryBenchmarks({
            industry: m.industry,
            businessSize: m.businessSize,
            locale: m.locale,
          });
          snapshot[key] = cohort.kAnonymity;
        }

        // Call again
        await engine.enforceKAnonymity();

        // Values must be the same
        for (const m of metrics) {
          const key = `${m.industry}|${m.businessSize}|${m.locale}`;
          const cohort = await engine.queryBenchmarks({
            industry: m.industry,
            businessSize: m.businessSize,
            locale: m.locale,
          });
          expect(cohort.kAnonymity).toBe(snapshot[key]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 34: Cohort Merging on K-Anonymity Violation
// Validates: Requirements 8.5
// ---------------------------------------------------------------------------

describe('Property 34: Cohort Merging on K-Anonymity Violation', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 34: Cohort Merging on K-Anonymity Violation
   *
   * For any cohort that would have fewer than 10 records, getMergedCohort()
   * SHALL return a broader cohort with >= 10 records (when broader data exists).
   *
   * Validates: Requirements 8.5
   */
  it('should return a broader cohort with >= 10 records when the specific cohort is too small', async () => {
    await fc.assert(
      fc.asyncProperty(smallCohortArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();

        // Add the small cohort (< 10 records)
        await engine.addMetrics(metrics);

        // Also add enough records at a broader level so merging can succeed
        await engine.addMetrics(
          makeMetrics(K_ANONYMITY_MINIMUM, { industry, locale, businessSize: 'medium' }),
        );

        // The specific cohort key
        const cohortKey = `${industry}|${businessSize}|${locale}`;
        const merged = await engine.getMergedCohort(cohortKey);

        // The merged cohort must have >= 10 records
        expect(merged.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        expect(merged.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 34: Cohort Merging on K-Anonymity Violation
   *
   * getMergedCohort() must return a cohort that is strictly broader than the
   * original — i.e., it drops at least one specificity dimension.
   *
   * Validates: Requirements 8.5
   */
  it('should return a cohort broader than the original (drops at least one dimension)', async () => {
    await fc.assert(
      fc.asyncProperty(smallCohortArb, async ({ metrics, industry, businessSize, locale }) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);

        // Add broader data so merging has something to fall back to
        await engine.addMetrics(
          makeMetrics(K_ANONYMITY_MINIMUM, { industry, locale, businessSize: 'medium' }),
        );

        const cohortKey = `${industry}|${businessSize}|${locale}`;
        const merged = await engine.getMergedCohort(cohortKey);

        // The merged cohort must not be the exact same specific cohort.
        // It should have dropped businessSize (businessSize becomes '*') or be even broader.
        const isBusinessSizeDropped = merged.businessSize === '*';
        const isLocaleDropped = merged.locale === '*';
        const isIndustryDropped = merged.industry === '*';

        expect(isBusinessSizeDropped || isLocaleDropped || isIndustryDropped).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 34: Cohort Merging on K-Anonymity Violation
   *
   * After enforceKAnonymity(), any cohort that was below k=10 must have been
   * replaced with a merged cohort that satisfies k >= 10.
   *
   * Validates: Requirements 8.5
   */
  it('should replace under-populated cohorts with merged cohorts after enforceKAnonymity()', async () => {
    await fc.assert(
      fc.asyncProperty(
        smallCohortArb,
        fc.tuple(industryArb, localeArb),
        async ({ metrics, industry, businessSize, locale }, [broadIndustry, broadLocale]) => {
          const engine = new BenchmarkEngine();

          // Add the small cohort
          await engine.addMetrics(metrics);

          // Add a broad cohort with enough records to absorb the merge
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM, {
              industry,
              locale,
              businessSize: businessSize === 'small' ? 'medium' : 'small',
            }),
          );

          await engine.enforceKAnonymity();

          // After enforcement, querying the original cohort must return k >= 10
          const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });
          expect(cohort.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 34: Cohort Merging on K-Anonymity Violation
   *
   * The merging strategy must follow the defined order:
   * industry+businessSize+locale → industry+locale → industry → all.
   *
   * Validates: Requirements 8.5
   */
  it('should follow the merging strategy: drop businessSize first, then locale, then industry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, businessSizeArb, localeArb).filter(
          ([, bs]) => bs !== 'medium', // ensure we can add a different businessSize
        ),
        async ([industry, businessSize, locale]) => {
          const engine = new BenchmarkEngine();

          // Add a small cohort for the specific combination
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM - 1, { industry, businessSize, locale }),
          );

          // Add enough records for industry+locale (dropping businessSize)
          await engine.addMetrics(
            makeMetrics(K_ANONYMITY_MINIMUM, { industry, locale, businessSize: 'medium' }),
          );

          const cohortKey = `${industry}|${businessSize}|${locale}`;
          const merged = await engine.getMergedCohort(cohortKey);

          // First merge step drops businessSize → should find industry+locale cohort
          expect(merged.industry).toBe(industry);
          expect(merged.locale).toBe(locale);
          expect(merged.businessSize).toBe('*');
          expect(merged.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 56: K-Anonymity Guarantee
// Validates: Requirements 12.3
// ---------------------------------------------------------------------------

describe('Property 56: K-Anonymity Guarantee', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 56: K-Anonymity Guarantee
   *
   * For any stored anonymized data, the System SHALL ensure no cohort has
   * fewer than 10 records (k ≥ 10) after enforceKAnonymity() is called.
   *
   * Validates: Requirements 12.3
   */
  it('should guarantee no cohort has fewer than 10 records after enforceKAnonymity()', async () => {
    await fc.assert(
      fc.asyncProperty(multiCohortArb, async (metrics) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);
        await engine.enforceKAnonymity();

        // Check every unique cohort combination present in the input
        const cohortKeys = new Set(
          metrics.map((m) => `${m.industry}|${m.businessSize}|${m.locale}`),
        );

        for (const key of cohortKeys) {
          const [industry, businessSize, locale] = key.split('|');
          const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

          // The invariant: no cohort returned should have fewer than 10 records
          expect(cohort.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
          expect(cohort.recordCount).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 56: K-Anonymity Guarantee
   *
   * The k-anonymity guarantee must hold even when metrics are added in
   * multiple batches before enforceKAnonymity() is called.
   *
   * Validates: Requirements 12.3
   */
  it('should maintain k-anonymity guarantee across multiple addMetrics() calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, businessSizeArb, localeArb),
        // Ensure total across batches is >= K_ANONYMITY_MINIMUM
        fc.array(fc.integer({ min: 2, max: 5 }), { minLength: 5, maxLength: 8 }),
        async ([industry, businessSize, locale], batchSizes) => {
          const engine = new BenchmarkEngine();

          // Add metrics in multiple batches
          for (const size of batchSizes) {
            await engine.addMetrics(makeMetrics(size, { industry, businessSize, locale }));
          }

          await engine.enforceKAnonymity();

          const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

          // The guarantee must hold regardless of how many batches were used
          expect(cohort.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 56: K-Anonymity Guarantee
   *
   * The k-anonymity value stored in the cohort must equal the recordCount
   * (since kAnonymity is derived from the number of records in the cohort).
   *
   * Validates: Requirements 12.3
   */
  it('should have kAnonymity equal to recordCount for every cohort', async () => {
    await fc.assert(
      fc.asyncProperty(multiCohortArb, async (metrics) => {
        const engine = new BenchmarkEngine();
        await engine.addMetrics(metrics);
        await engine.enforceKAnonymity();

        const cohortKeys = new Set(
          metrics.map((m) => `${m.industry}|${m.businessSize}|${m.locale}`),
        );

        for (const key of cohortKeys) {
          const [industry, businessSize, locale] = key.split('|');
          const cohort = await engine.queryBenchmarks({ industry, businessSize, locale });

          // kAnonymity must reflect the actual record count
          expect(cohort.kAnonymity).toBe(cohort.recordCount);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 56: K-Anonymity Guarantee
   *
   * When the entire dataset has fewer than 10 records total, the engine must
   * still not expose any cohort with fewer than 10 records — it returns the
   * broadest available cohort (which may itself be under k=10 only if there
   * is truly no data to merge into).
   *
   * Validates: Requirements 12.3
   */
  it('should not expose under-populated cohorts — always returns merged result when possible', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(industryArb, businessSizeArb, localeArb),
        fc.integer({ min: K_ANONYMITY_MINIMUM, max: 30 }),
        async ([industry, businessSize, locale], totalCount) => {
          const engine = new BenchmarkEngine();

          // Add enough records across two different businessSizes so the
          // aggregate cohort (industry+locale) meets k >= 10
          const half = Math.ceil(totalCount / 2);
          const otherSize = businessSize === 'small' ? 'medium' : 'small';

          await engine.addMetrics(makeMetrics(half, { industry, businessSize, locale }));
          await engine.addMetrics(makeMetrics(totalCount - half, { industry, businessSize: otherSize, locale }));

          await engine.enforceKAnonymity();

          // The aggregate cohort (industry+locale, all sizes) must satisfy k >= 10
          const aggregateCohort = await engine.queryBenchmarks({ industry, locale });
          expect(aggregateCohort.kAnonymity).toBeGreaterThanOrEqual(K_ANONYMITY_MINIMUM);
        },
      ),
      { numRuns: 100 },
    );
  });
});
