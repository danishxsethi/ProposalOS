/**
 * Property-based tests for Differential Privacy
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Property 32: Differential Privacy Application
 *   For any anonymized metric stored, the Benchmark_Engine SHALL apply
 *   differential privacy with noise injection.
 *   Validates: Requirements 8.3
 *
 * Property 55: Differential Privacy Noise Injection
 *   For any privacy technique applied, the System SHALL use differential
 *   privacy with noise injection.
 *   Validates: Requirements 12.2
 */

import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { DifferentialPrivacyEngine } from '../differential-privacy-engine';
import { AnonymizationPipeline } from '../anonymization-pipeline';
import { AnonymizedAuditMetrics, RawAuditMetrics } from '../types';

// ---------------------------------------------------------------------------
// Property test configuration
// ---------------------------------------------------------------------------

const propertyTestConfig = {
  numRuns: 100,
  timeout: 10000,
  verbose: true,
};

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Valid epsilon values (privacy budget) — use double() for non-32-bit-constrained floats */
const epsilonArb = fc.double({ min: 0.01, max: 10.0, noNaN: true }).filter((e) => e > 0 && isFinite(e));

/** Valid sensitivity values */
const sensitivityArb = fc.double({ min: 0.1, max: 10.0, noNaN: true }).filter((s) => s > 0 && isFinite(s));

/** Metric names */
const metricKeyArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

/** Metric values — realistic SEO scores in [0, 100] */
const metricValueArb = fc.double({ min: 0, max: 100, noNaN: true });

/** Non-empty metrics map */
const metricsMapArb = fc
  .array(fc.tuple(metricKeyArb, metricValueArb), { minLength: 1, maxLength: 10 })
  .map((entries) => new Map(entries));

/** Possibly-empty metrics map */
const metricsMapMaybeEmptyArb = fc
  .array(fc.tuple(metricKeyArb, metricValueArb), { minLength: 0, maxLength: 10 })
  .map((entries) => new Map(entries));

/** Supported locales */
const localeArb = fc.oneof(
  fc.constant('en-US'),
  fc.constant('en-GB'),
  fc.constant('en-CA'),
  fc.constant('en-AU'),
  fc.constant('de-DE'),
  fc.constant('fr-FR'),
  fc.constant('es-ES'),
);

/** Industry strings */
const industryArb = fc.oneof(
  fc.constant('dental'),
  fc.constant('medical'),
  fc.constant('legal'),
  fc.constant('retail'),
  fc.constant('hospitality'),
);

/** Business size categories */
const businessSizeArb = fc.oneof(
  fc.constant('small'),
  fc.constant('medium'),
  fc.constant('large'),
);

/** 64-char lowercase hex string (SHA-256 hash format) */
const anonymousIdArb = fc.stringMatching(/^[a-f0-9]{64}$/);

/** Full AnonymizedAuditMetrics generator */
const anonymizedMetricsArb = fc.record({
  anonymousId: anonymousIdArb,
  industry: industryArb,
  businessSize: businessSizeArb,
  locale: localeArb,
  metrics: metricsMapArb,
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
  differentialPrivacyNoise: fc.constant(0),
});

/** AnonymizedAuditMetrics with possibly-empty metrics */
const anonymizedMetricsMaybeEmptyArb = fc.record({
  anonymousId: anonymousIdArb,
  industry: industryArb,
  businessSize: businessSizeArb,
  locale: localeArb,
  metrics: metricsMapMaybeEmptyArb,
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
  differentialPrivacyNoise: fc.constant(0),
});

/** RawAuditMetrics generator for pipeline tests */
const rawAuditMetricsArb = fc.record({
  clientId: fc.string({ minLength: 1, maxLength: 64 }),
  clientName: fc.string({ minLength: 1, maxLength: 80 }),
  domain: fc.domain(),
  contactInfo: fc.emailAddress(),
  auditResults: fc.record({
    industry: industryArb,
    locale: localeArb,
    businessSize: businessSizeArb,
    score: metricValueArb,
    pageSpeed: metricValueArb,
    mobileScore: metricValueArb,
  }),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
});

// ---------------------------------------------------------------------------
// Property 32: Differential Privacy Application
// ---------------------------------------------------------------------------

describe('Property 32: Differential Privacy Application', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 32: Differential Privacy Application
   *
   * For any anonymized metric stored, the Benchmark_Engine SHALL apply
   * differential privacy with noise injection.
   *
   * Validates: Requirements 8.3
   */

  it('should apply noise to all metric values for any anonymized record', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        const result = engine.applyDifferentialPrivacy(data);

        // All original metric keys must be present in the result
        expect(result.metrics.size).toBe(data.metrics.size);
        for (const key of data.metrics.keys()) {
          expect(result.metrics.has(key)).toBe(true);
        }

        // All result metric values must be finite numbers
        for (const [, value] of result.metrics.entries()) {
          expect(typeof value).toBe('number');
          expect(isFinite(value)).toBe(true);
        }
      }),
      propertyTestConfig,
    );
  });

  it('should record non-negative differentialPrivacyNoise after applying DP', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        const result = engine.applyDifferentialPrivacy(data);

        // differentialPrivacyNoise must be set and non-negative
        expect(typeof result.differentialPrivacyNoise).toBe('number');
        expect(isFinite(result.differentialPrivacyNoise)).toBe(true);
        expect(result.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);
      }),
      propertyTestConfig,
    );
  });

  it('should preserve all non-metric fields after applying DP', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        const result = engine.applyDifferentialPrivacy(data);

        // Non-metric fields must be unchanged
        expect(result.anonymousId).toBe(data.anonymousId);
        expect(result.industry).toBe(data.industry);
        expect(result.businessSize).toBe(data.businessSize);
        expect(result.locale).toBe(data.locale);
        expect(result.timestamp).toEqual(data.timestamp);
      }),
      propertyTestConfig,
    );
  });

  it('should not mutate the original metrics map', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        // Snapshot original values
        const originalValues = new Map(data.metrics);

        engine.applyDifferentialPrivacy(data);

        // Original map must be unchanged
        for (const [key, originalValue] of originalValues.entries()) {
          expect(data.metrics.get(key)).toBe(originalValue);
        }
      }),
      propertyTestConfig,
    );
  });

  it('should handle empty metrics map without error', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsMaybeEmptyArb, (data: AnonymizedAuditMetrics) => {
        fc.pre(data.metrics.size === 0);

        const result = engine.applyDifferentialPrivacy(data);

        expect(result.metrics.size).toBe(0);
        expect(result.differentialPrivacyNoise).toBe(0);
      }),
      propertyTestConfig,
    );
  });

  it('should produce larger average noise with smaller epsilon (stronger privacy)', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, epsilonArb, epsilonArb, (data, eps1, eps2) => {
        // Ensure eps1 < eps2 (eps1 = stronger privacy = more noise)
        const smallEps = Math.min(eps1, eps2);
        const largeEps = Math.max(eps1, eps2);
        fc.pre(largeEps > smallEps * 2); // ensure meaningful difference

        // Run multiple times to get stable averages
        const runs = 20;
        let totalNoiseSmall = 0;
        let totalNoiseLarge = 0;

        for (let i = 0; i < runs; i++) {
          totalNoiseSmall += engine.applyDifferentialPrivacy(data, smallEps).differentialPrivacyNoise;
          totalNoiseLarge += engine.applyDifferentialPrivacy(data, largeEps).differentialPrivacyNoise;
        }

        const avgSmall = totalNoiseSmall / runs;
        const avgLarge = totalNoiseLarge / runs;

        // Smaller epsilon should produce more noise on average
        expect(avgSmall).toBeGreaterThan(avgLarge);
      }),
      { ...propertyTestConfig, numRuns: 50 }, // fewer runs since each run does 20 internal iterations
    );
  });

  it('should apply DP with any valid epsilon override', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, epsilonArb, (data, epsilon) => {
        const result = engine.applyDifferentialPrivacy(data, epsilon);

        // Result must be valid regardless of epsilon value
        expect(result.metrics.size).toBe(data.metrics.size);
        expect(result.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);
        expect(isFinite(result.differentialPrivacyNoise)).toBe(true);
      }),
      propertyTestConfig,
    );
  });

  it('should apply DP with any valid epsilon and sensitivity combination', () => {
    fc.assert(
      fc.property(anonymizedMetricsArb, epsilonArb, sensitivityArb, (data, epsilon, sensitivity) => {
        const engine = new DifferentialPrivacyEngine({ epsilon, sensitivity });
        const result = engine.applyDifferentialPrivacy(data);

        // Result must be valid for any valid epsilon/sensitivity
        expect(result.metrics.size).toBe(data.metrics.size);
        expect(result.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);
        expect(isFinite(result.differentialPrivacyNoise)).toBe(true);

        for (const [, value] of result.metrics.entries()) {
          expect(isFinite(value)).toBe(true);
        }
      }),
      propertyTestConfig,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 55: Differential Privacy Noise Injection
// ---------------------------------------------------------------------------

describe('Property 55: Differential Privacy Noise Injection', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 55: Differential Privacy Noise Injection
   *
   * For any privacy technique applied, the System SHALL use differential
   * privacy with noise injection.
   *
   * Validates: Requirements 12.2
   */

  it('should inject noise into every metric value (noise is non-zero across many runs)', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        // Run multiple times; at least one run must produce noise for each metric
        const runs = 10;
        const noiseSeen = new Map<string, boolean>();
        for (const key of data.metrics.keys()) {
          noiseSeen.set(key, false);
        }

        for (let i = 0; i < runs; i++) {
          const result = engine.applyDifferentialPrivacy(data);
          for (const [key, originalValue] of data.metrics.entries()) {
            const noisedValue = result.metrics.get(key)!;
            if (noisedValue !== originalValue) {
              noiseSeen.set(key, true);
            }
          }
        }

        // Every metric must have received noise in at least one of the runs
        for (const [key, sawNoise] of noiseSeen.entries()) {
          expect(sawNoise).toBe(true);
        }
      }),
      propertyTestConfig,
    );
  });

  it('should set differentialPrivacyNoise > 0 for non-empty metrics (across many runs)', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        // Over multiple runs, at least one should have non-zero noise
        let sawNonZeroNoise = false;
        for (let i = 0; i < 10; i++) {
          const result = engine.applyDifferentialPrivacy(data);
          if (result.differentialPrivacyNoise > 0) {
            sawNonZeroNoise = true;
            break;
          }
        }
        expect(sawNonZeroNoise).toBe(true);
      }),
      propertyTestConfig,
    );
  });

  it('should apply noise via AnonymizationPipeline.applyDifferentialPrivacy for any record', async () => {
    const pipeline = new AnonymizationPipeline({ differentialPrivacyEpsilon: 1.0 });

    await fc.assert(
      fc.asyncProperty(anonymizedMetricsArb, async (data: AnonymizedAuditMetrics) => {
        const result = await pipeline.applyDifferentialPrivacy(data);

        // All metric keys must be preserved
        expect(result.metrics.size).toBe(data.metrics.size);
        for (const key of data.metrics.keys()) {
          expect(result.metrics.has(key)).toBe(true);
        }

        // differentialPrivacyNoise must be set
        expect(typeof result.differentialPrivacyNoise).toBe('number');
        expect(isFinite(result.differentialPrivacyNoise)).toBe(true);
        expect(result.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);

        // All metric values must be finite numbers
        for (const [, value] of result.metrics.entries()) {
          expect(typeof value).toBe('number');
          expect(isFinite(value)).toBe(true);
        }
      }),
      propertyTestConfig,
    );
  });

  it('should apply noise through the full anonymization pipeline for any raw audit', async () => {
    const pipeline = new AnonymizationPipeline({ differentialPrivacyEpsilon: 1.0 });

    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        // Step 1: anonymize
        const anonymized = await pipeline.anonymizeMetrics(raw);

        // Step 2: apply differential privacy
        const withNoise = await pipeline.applyDifferentialPrivacy(anonymized);

        // differentialPrivacyNoise must be recorded
        expect(typeof withNoise.differentialPrivacyNoise).toBe('number');
        expect(isFinite(withNoise.differentialPrivacyNoise)).toBe(true);
        expect(withNoise.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);

        // All metric values must be finite
        for (const [, value] of withNoise.metrics.entries()) {
          expect(isFinite(value)).toBe(true);
        }

        // Non-metric fields must be preserved
        expect(withNoise.anonymousId).toBe(anonymized.anonymousId);
        expect(withNoise.industry).toBe(anonymized.industry);
        expect(withNoise.locale).toBe(anonymized.locale);
      }),
      propertyTestConfig,
    );
  });

  it('should produce different noised values across independent applications (noise is random)', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(anonymizedMetricsArb, (data: AnonymizedAuditMetrics) => {
        const result1 = engine.applyDifferentialPrivacy(data);
        const result2 = engine.applyDifferentialPrivacy(data);

        // With high probability, two independent applications produce different noise
        // (probability of exact match is essentially 0 for continuous distribution)
        // We check across all metrics — at least one should differ
        let anyDiffers = false;
        for (const key of data.metrics.keys()) {
          if (result1.metrics.get(key) !== result2.metrics.get(key)) {
            anyDiffers = true;
            break;
          }
        }
        // This should be true for virtually all inputs with non-empty metrics
        expect(anyDiffers).toBe(true);
      }),
      propertyTestConfig,
    );
  });

  it('should use Laplace noise (mean ≈ 0) so noise does not systematically bias metrics', () => {
    const engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });

    fc.assert(
      fc.property(
        fc.record({
          anonymousId: anonymousIdArb,
          industry: industryArb,
          businessSize: businessSizeArb,
          locale: localeArb,
          // Use a single metric with a fixed value to measure noise distribution
          metrics: fc.constant(new Map([['score', 50.0]])),
          timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          differentialPrivacyNoise: fc.constant(0),
        }),
        (data: AnonymizedAuditMetrics) => {
          // Collect 200 noised values for the single metric
          const noisedValues: number[] = [];
          for (let i = 0; i < 200; i++) {
            const result = engine.applyDifferentialPrivacy(data);
            noisedValues.push(result.metrics.get('score')! - 50.0); // extract noise
          }

          const mean = noisedValues.reduce((a, b) => a + b, 0) / noisedValues.length;

          // Laplace distribution has mean 0; with 200 samples the sample mean
          // should be within ±1.5 of 0 (very conservative bound)
          expect(Math.abs(mean)).toBeLessThan(1.5);
        },
      ),
      { ...propertyTestConfig, numRuns: 20 }, // fewer outer runs since each does 200 inner iterations
    );
  });

  it('should apply noise with any valid epsilon via AnonymizationPipeline', async () => {
    await fc.assert(
      fc.asyncProperty(anonymizedMetricsArb, epsilonArb, async (data, epsilon) => {
        const pipeline = new AnonymizationPipeline({ differentialPrivacyEpsilon: epsilon });
        const result = await pipeline.applyDifferentialPrivacy(data, epsilon);

        expect(result.metrics.size).toBe(data.metrics.size);
        expect(result.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);
        expect(isFinite(result.differentialPrivacyNoise)).toBe(true);
      }),
      propertyTestConfig,
    );
  });
});
