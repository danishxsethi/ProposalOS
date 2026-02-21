/**
 * Property-based tests for RecommendationEffectivenessTracker
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 9.2: Write property tests for Effectiveness Tracker
 *   - Property 42: Re-audit Impact Measurement
 *   - Property 43: Impact Metric Completeness
 *   - Property 44: Effectiveness Feedback Loop
 *   - Property 45: Effectiveness Data Display
 *   - Property 46: Effectiveness Data in Proposals
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import * as fc from 'fast-check';
import { RecommendationEffectivenessTracker } from '../recommendation-effectiveness-tracker';
import { RecommendationImplementation } from '../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const recommendationTypeArb = fc.oneof(
  fc.constant('schema_markup'),
  fc.constant('page_speed'),
  fc.constant('mobile_optimization'),
  fc.constant('content_quality'),
  fc.constant('backlink_strategy'),
);

const industryArb = fc.oneof(
  fc.constant('dental'),
  fc.constant('medical'),
  fc.constant('legal'),
  fc.constant('retail'),
  fc.constant('hospitality'),
);

const localeArb = fc.constantFrom(
  'en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES',
);

/** Arbitrary for a percentage change value in [-100, 100] */
const impactValueArb = fc.float({ min: -100, max: 100, noNaN: true });

/** Arbitrary for a full impact object */
const impactArb = fc.record({
  trafficChange: impactValueArb,
  rankingChange: impactValueArb,
  conversionChange: impactValueArb,
});

/** Build a RecommendationImplementation with optional overrides */
function makeImpl(overrides: Partial<RecommendationImplementation> = {}): RecommendationImplementation {
  return {
    recommendationId: 'rec-1',
    recommendationType: 'schema_markup',
    industry: 'dental',
    locale: 'en-US',
    predictedImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
    implementedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/** Arbitrary for a full RecommendationImplementation */
const implementationArb = fc
  .tuple(recommendationTypeArb, industryArb, localeArb, impactArb)
  .map(([recommendationType, industry, locale, predictedImpact]) =>
    makeImpl({ recommendationType, industry, locale, predictedImpact }),
  );

// ---------------------------------------------------------------------------
// Property 42: Re-audit Impact Measurement
// Validates: Requirements 10.1
// ---------------------------------------------------------------------------

describe('Property 42: Re-audit Impact Measurement', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 42: Re-audit Impact Measurement
   *
   * For any implementation + outcome pair, recordOutcome() must return an
   * EffectivenessRecord with accuracy computed from actual vs predicted.
   *
   * Validates: Requirements 10.1
   */
  it('should return an EffectivenessRecord with accuracy in [0, 1] for any predicted/actual pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        implementationArb,
        impactArb,
        async (impl, actualImpact) => {
          const tracker = new RecommendationEffectivenessTracker();
          const implId = await tracker.recordImplementation(impl);

          const record = await tracker.recordOutcome(implId, {
            reAuditDate: new Date(),
            actualImpact,
          });

          expect(record).toBeDefined();
          expect(typeof record.accuracy).toBe('number');
          expect(record.accuracy).toBeGreaterThanOrEqual(0);
          expect(record.accuracy).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 42: Re-audit Impact Measurement
   *
   * Accuracy must be 1 when actual impact exactly matches predicted impact.
   *
   * Validates: Requirements 10.1
   */
  it('should compute accuracy of 1 when actual matches predicted exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        implementationArb,
        async (impl) => {
          const tracker = new RecommendationEffectivenessTracker();
          const implId = await tracker.recordImplementation(impl);

          const record = await tracker.recordOutcome(implId, {
            reAuditDate: new Date(),
            actualImpact: { ...impl.predictedImpact },
          });

          expect(record.accuracy).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 42: Re-audit Impact Measurement
   *
   * Accuracy must be higher when actual is closer to predicted.
   *
   * Validates: Requirements 10.1
   */
  it('should compute higher accuracy when actual is closer to predicted', async () => {
    await fc.assert(
      fc.asyncProperty(
        implementationArb,
        fc.float({ min: 1, max: 30, noNaN: true }),
        async (impl, smallDelta) => {
          const tracker = new RecommendationEffectivenessTracker();

          const implClose = await tracker.recordImplementation({ ...impl, id: 'close' });
          const implFar = await tracker.recordImplementation({ ...impl, id: 'far' });

          const closeRecord = await tracker.recordOutcome(implClose, {
            reAuditDate: new Date(),
            actualImpact: {
              trafficChange: impl.predictedImpact.trafficChange + smallDelta,
              rankingChange: impl.predictedImpact.rankingChange + smallDelta,
              conversionChange: impl.predictedImpact.conversionChange + smallDelta,
            },
          });

          const farRecord = await tracker.recordOutcome(implFar, {
            reAuditDate: new Date(),
            actualImpact: {
              trafficChange: impl.predictedImpact.trafficChange + smallDelta * 3,
              rankingChange: impl.predictedImpact.rankingChange + smallDelta * 3,
              conversionChange: impl.predictedImpact.conversionChange + smallDelta * 3,
            },
          });

          expect(closeRecord.accuracy).toBeGreaterThanOrEqual(farRecord.accuracy);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 42: Re-audit Impact Measurement
   *
   * The returned record must link back to the correct implementationId.
   *
   * Validates: Requirements 10.1
   */
  it('should link the EffectivenessRecord to the correct implementationId', async () => {
    await fc.assert(
      fc.asyncProperty(
        implementationArb,
        impactArb,
        async (impl, actualImpact) => {
          const tracker = new RecommendationEffectivenessTracker();
          const implId = await tracker.recordImplementation(impl);

          const record = await tracker.recordOutcome(implId, {
            reAuditDate: new Date(),
            actualImpact,
          });

          expect(record.implementationId).toBe(implId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 43: Impact Metric Completeness
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------

describe('Property 43: Impact Metric Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 43: Impact Metric Completeness
   *
   * For any outcome, the EffectivenessRecord must have trafficChange,
   * rankingChange, and conversionChange in actualImpact.
   *
   * Validates: Requirements 10.2
   */
  it('should include trafficChange, rankingChange, and conversionChange in every EffectivenessRecord', async () => {
    await fc.assert(
      fc.asyncProperty(
        implementationArb,
        impactArb,
        async (impl, actualImpact) => {
          const tracker = new RecommendationEffectivenessTracker();
          const implId = await tracker.recordImplementation(impl);

          const record = await tracker.recordOutcome(implId, {
            reAuditDate: new Date(),
            actualImpact,
          });

          expect(record.actualImpact).toHaveProperty('trafficChange');
          expect(record.actualImpact).toHaveProperty('rankingChange');
          expect(record.actualImpact).toHaveProperty('conversionChange');
          expect(typeof record.actualImpact.trafficChange).toBe('number');
          expect(typeof record.actualImpact.rankingChange).toBe('number');
          expect(typeof record.actualImpact.conversionChange).toBe('number');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 43: Impact Metric Completeness
   *
   * The actualImpact values in the record must exactly match what was passed in.
   *
   * Validates: Requirements 10.2
   */
  it('should preserve all three impact dimension values exactly as recorded', async () => {
    await fc.assert(
      fc.asyncProperty(
        implementationArb,
        impactArb,
        async (impl, actualImpact) => {
          const tracker = new RecommendationEffectivenessTracker();
          const implId = await tracker.recordImplementation(impl);

          const record = await tracker.recordOutcome(implId, {
            reAuditDate: new Date(),
            actualImpact,
          });

          expect(record.actualImpact.trafficChange).toBe(actualImpact.trafficChange);
          expect(record.actualImpact.rankingChange).toBe(actualImpact.rankingChange);
          expect(record.actualImpact.conversionChange).toBe(actualImpact.conversionChange);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 44: Effectiveness Feedback Loop
// Validates: Requirements 10.3
// ---------------------------------------------------------------------------

describe('Property 44: Effectiveness Feedback Loop', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 44: Effectiveness Feedback Loop
   *
   * After recording outcomes, getPredictiveAccuracy() must return a value
   * reflecting the accuracy data (average of individual accuracies).
   *
   * Validates: Requirements 10.3
   */
  it('should return 0 predictive accuracy when no outcomes are recorded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const tracker = new RecommendationEffectivenessTracker();
          const accuracy = await tracker.getPredictiveAccuracy();
          expect(accuracy).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 44: Effectiveness Feedback Loop
   *
   * getPredictiveAccuracy() must return a value in [0, 1] for any set of outcomes.
   *
   * Validates: Requirements 10.3
   */
  it('should return predictive accuracy in [0, 1] for any set of outcomes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(implementationArb, impactArb),
          { minLength: 1, maxLength: 10 },
        ),
        async (pairs) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < pairs.length; i++) {
            const [impl, actualImpact] = pairs[i];
            const implId = await tracker.recordImplementation({ ...impl, id: `impl-${i}` });
            await tracker.recordOutcome(implId, { reAuditDate: new Date(), actualImpact });
          }

          const accuracy = await tracker.getPredictiveAccuracy();
          expect(accuracy).toBeGreaterThanOrEqual(0);
          expect(accuracy).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 44: Effectiveness Feedback Loop
   *
   * getPredictiveAccuracy() must equal the average of individual record accuracies.
   *
   * Validates: Requirements 10.3
   */
  it('should return the average of individual record accuracies', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(implementationArb, impactArb),
          { minLength: 1, maxLength: 10 },
        ),
        async (pairs) => {
          const tracker = new RecommendationEffectivenessTracker();
          const recordedAccuracies: number[] = [];

          for (let i = 0; i < pairs.length; i++) {
            const [impl, actualImpact] = pairs[i];
            const implId = await tracker.recordImplementation({ ...impl, id: `impl-${i}` });
            const record = await tracker.recordOutcome(implId, { reAuditDate: new Date(), actualImpact });
            recordedAccuracies.push(record.accuracy);
          }

          const expectedAvg = recordedAccuracies.reduce((a, b) => a + b, 0) / recordedAccuracies.length;
          const actualAccuracy = await tracker.getPredictiveAccuracy();

          expect(actualAccuracy).toBeCloseTo(expectedAvg, 10);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 44: Effectiveness Feedback Loop
   *
   * getPredictiveAccuracy() must be 1 when all predictions are perfect.
   *
   * Validates: Requirements 10.3
   */
  it('should return 1 when all predictions are perfect', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(implementationArb, { minLength: 1, maxLength: 10 }),
        async (impls) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < impls.length; i++) {
            const impl = impls[i];
            const implId = await tracker.recordImplementation({ ...impl, id: `impl-${i}` });
            await tracker.recordOutcome(implId, {
              reAuditDate: new Date(),
              actualImpact: { ...impl.predictedImpact },
            });
          }

          const accuracy = await tracker.getPredictiveAccuracy();
          expect(accuracy).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 45: Effectiveness Data Display
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------

describe('Property 45: Effectiveness Data Display', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 45: Effectiveness Data Display
   *
   * getEffectivenessStats() must return records with recommendationType,
   * industry, locale, and averageActualImpact for any set of outcomes.
   *
   * Validates: Requirements 10.4
   */
  it('should include recommendationType, industry, locale, and averageActualImpact in every stats record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(implementationArb, impactArb),
          { minLength: 1, maxLength: 10 },
        ),
        async (pairs) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < pairs.length; i++) {
            const [impl, actualImpact] = pairs[i];
            const implId = await tracker.recordImplementation({ ...impl, id: `impl-${i}` });
            await tracker.recordOutcome(implId, { reAuditDate: new Date(), actualImpact });
          }

          const stats = await tracker.getEffectivenessStats();

          expect(stats.length).toBeGreaterThan(0);
          for (const stat of stats) {
            expect(typeof stat.recommendationType).toBe('string');
            expect(stat.recommendationType.length).toBeGreaterThan(0);
            expect(typeof stat.industry).toBe('string');
            expect(stat.industry.length).toBeGreaterThan(0);
            expect(typeof stat.locale).toBe('string');
            expect(stat.locale.length).toBeGreaterThan(0);
            expect(typeof stat.averageActualImpact).toBe('number');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 45: Effectiveness Data Display
   *
   * Each stats record must also include sampleSize and averageAccuracy.
   *
   * Validates: Requirements 10.4
   */
  it('should include sampleSize and averageAccuracy in every stats record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(implementationArb, impactArb),
          { minLength: 1, maxLength: 10 },
        ),
        async (pairs) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < pairs.length; i++) {
            const [impl, actualImpact] = pairs[i];
            const implId = await tracker.recordImplementation({ ...impl, id: `impl-${i}` });
            await tracker.recordOutcome(implId, { reAuditDate: new Date(), actualImpact });
          }

          const stats = await tracker.getEffectivenessStats();

          for (const stat of stats) {
            expect(typeof stat.sampleSize).toBe('number');
            expect(stat.sampleSize).toBeGreaterThan(0);
            expect(typeof stat.averageAccuracy).toBe('number');
            expect(stat.averageAccuracy).toBeGreaterThanOrEqual(0);
            expect(stat.averageAccuracy).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 45: Effectiveness Data Display
   *
   * Stats must be grouped by (recommendationType, industry, locale) — each unique
   * combination produces exactly one stats entry.
   *
   * Validates: Requirements 10.4
   */
  it('should produce one stats entry per unique (recommendationType, industry, locale) combination', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(recommendationTypeArb, industryArb, localeArb, impactArb),
          { minLength: 1, maxLength: 10 },
        ),
        async (tuples) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < tuples.length; i++) {
            const [recommendationType, industry, locale, actualImpact] = tuples[i];
            const impl = makeImpl({ id: `impl-${i}`, recommendationType, industry, locale });
            const implId = await tracker.recordImplementation(impl);
            await tracker.recordOutcome(implId, { reAuditDate: new Date(), actualImpact });
          }

          const stats = await tracker.getEffectivenessStats();

          // Count unique (type, industry, locale) combinations in input
          const uniqueKeys = new Set(
            tuples.map(([t, ind, loc]) => `${t}|${ind}|${loc}`),
          );

          expect(stats.length).toBe(uniqueKeys.size);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 46: Effectiveness Data in Proposals
// Validates: Requirements 10.5
// ---------------------------------------------------------------------------

describe('Property 46: Effectiveness Data in Proposals', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 46: Effectiveness Data in Proposals
   *
   * hasSufficientDataForProposals() returns false when fewer than 5 records
   * exist for the given type/industry/locale.
   *
   * Validates: Requirements 10.5
   */
  it('should return false when fewer than 5 records exist for a type/industry/locale', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(recommendationTypeArb, industryArb, localeArb),
        fc.integer({ min: 0, max: 4 }),
        async ([recommendationType, industry, locale], count) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < count; i++) {
            const impl = makeImpl({ id: `impl-${i}`, recommendationType, industry, locale });
            const implId = await tracker.recordImplementation(impl);
            await tracker.recordOutcome(implId, {
              reAuditDate: new Date(),
              actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
            });
          }

          expect(tracker.hasSufficientDataForProposals(recommendationType, industry, locale)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 46: Effectiveness Data in Proposals
   *
   * hasSufficientDataForProposals() returns true when 5 or more records exist
   * for the given type/industry/locale.
   *
   * Validates: Requirements 10.5
   */
  it('should return true when 5 or more records exist for a type/industry/locale', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(recommendationTypeArb, industryArb, localeArb),
        fc.integer({ min: 5, max: 15 }),
        async ([recommendationType, industry, locale], count) => {
          const tracker = new RecommendationEffectivenessTracker();

          for (let i = 0; i < count; i++) {
            const impl = makeImpl({ id: `impl-${i}`, recommendationType, industry, locale });
            const implId = await tracker.recordImplementation(impl);
            await tracker.recordOutcome(implId, {
              reAuditDate: new Date(),
              actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
            });
          }

          expect(tracker.hasSufficientDataForProposals(recommendationType, industry, locale)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 46: Effectiveness Data in Proposals
   *
   * hasSufficientDataForProposals() must only count records matching the exact
   * type/industry/locale — records for other combinations must not count.
   *
   * Validates: Requirements 10.5
   */
  it('should count only records matching the exact type/industry/locale combination', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(recommendationTypeArb, industryArb, localeArb),
        fc.tuple(recommendationTypeArb, industryArb, localeArb).filter(
          ([t2, i2, l2]) => true, // we'll differentiate by using different IDs
        ),
        fc.integer({ min: 5, max: 10 }),
        async ([type1, industry1, locale1], [type2, industry2, locale2], count) => {
          // Ensure the two combinations are different
          if (type1 === type2 && industry1 === industry2 && locale1 === locale2) return;

          const tracker = new RecommendationEffectivenessTracker();

          // Add `count` records for combination 1
          for (let i = 0; i < count; i++) {
            const impl = makeImpl({ id: `impl1-${i}`, recommendationType: type1, industry: industry1, locale: locale1 });
            const implId = await tracker.recordImplementation(impl);
            await tracker.recordOutcome(implId, {
              reAuditDate: new Date(),
              actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
            });
          }

          // Add only 2 records for combination 2 (insufficient)
          for (let i = 0; i < 2; i++) {
            const impl = makeImpl({ id: `impl2-${i}`, recommendationType: type2, industry: industry2, locale: locale2 });
            const implId = await tracker.recordImplementation(impl);
            await tracker.recordOutcome(implId, {
              reAuditDate: new Date(),
              actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
            });
          }

          // Combination 1 should have sufficient data
          expect(tracker.hasSufficientDataForProposals(type1, industry1, locale1)).toBe(true);
          // Combination 2 should NOT have sufficient data
          expect(tracker.hasSufficientDataForProposals(type2, industry2, locale2)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
