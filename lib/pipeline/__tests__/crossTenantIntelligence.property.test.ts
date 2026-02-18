import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  aggregatePatterns,
  predictCloseProb,
  ensureAnonymized,
  anonymizeData,
  WinLossData,
  ProspectContext,
} from '../crossTenantIntelligence';
import { prisma } from '@/lib/db';

describe('Cross-Tenant Intelligence - Property Tests', () => {
  afterEach(async () => {
    await prisma.sharedIntelligenceModel.deleteMany({});
  });

  /**
   * Property 39: Cross-tenant intelligence contains no PII
   *
   * For any aggregated intelligence model, the patterns must not contain
   * any personally identifiable information (email, phone, SSN, credit card).
   */
  it('Property 39: Cross-tenant intelligence contains no PII', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            outcome: fc.constantFrom('won', 'lost', 'ghosted'),
            vertical: fc.string({ minLength: 1, maxLength: 20 }),
            city: fc.string({ minLength: 1, maxLength: 20 }),
            painScore: fc.integer({ min: 0, max: 100 }),
            dealValue: fc.option(fc.integer({ min: 1000, max: 100000 })),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        async (outcomes) => {
          const winLossData: WinLossData[] = outcomes.map((o) => ({
            outcome: o.outcome as 'won' | 'lost' | 'ghosted',
            vertical: o.vertical,
            city: o.city,
            painScore: o.painScore,
            dealValue: o.dealValue || undefined,
          }));

          await aggregatePatterns('tenant-1', winLossData);

          const model = await prisma.sharedIntelligenceModel.findFirst({
            where: { isActive: true },
          });

          if (model) {
            const patterns = model.patterns as any[];
            for (const pattern of patterns) {
              expect(ensureAnonymized(pattern)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 40: Predictive close probability is bounded
   *
   * For any prospect context, the predicted close probability must be
   * between 0 and 100 inclusive, and confidence must be between 0 and 1.
   */
  it('Property 40: Predictive close probability is bounded', async () => {
    // Create a model first
    const outcomes: WinLossData[] = [
      { outcome: 'won', vertical: 'dentistry', city: 'New York', painScore: 75 },
      { outcome: 'lost', vertical: 'dentistry', city: 'New York', painScore: 50 },
    ];
    await aggregatePatterns('tenant-1', outcomes);

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vertical: fc.string({ minLength: 1, maxLength: 20 }),
          painScore: fc.integer({ min: 0, max: 100 }),
          geoRegion: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        async (prospectData) => {
          const prospect: ProspectContext = {
            vertical: prospectData.vertical,
            painScore: prospectData.painScore,
            geoRegion: prospectData.geoRegion,
          };

          const prediction = await predictCloseProb(prospect);

          // Verify bounds
          expect(prediction.closeProb).toBeGreaterThanOrEqual(0);
          expect(prediction.closeProb).toBeLessThanOrEqual(100);
          expect(prediction.confidence).toBeGreaterThanOrEqual(0);
          expect(prediction.confidence).toBeLessThanOrEqual(1);

          // Verify factors
          for (const factor of prediction.factors) {
            expect(factor.weight).toBeGreaterThan(0);
            expect(factor.weight).toBeLessThanOrEqual(1);
            expect(factor.value).toBeGreaterThanOrEqual(0);
            expect(factor.value).toBeLessThanOrEqual(100);
          }

          // Verify weighted sum
          const weightSum = prediction.factors.reduce((sum, f) => sum + f.weight, 0);
          expect(weightSum).toBeCloseTo(1, 1); // Allow small floating point error
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 41: Anonymization is idempotent
   *
   * For any data, anonymizing it twice should produce the same result as
   * anonymizing it once.
   */
  it('Property 41: Anonymization is idempotent', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          vertical: fc.string({ minLength: 1, maxLength: 20 }),
          winRate: fc.float({ min: 0, max: 1 }),
          sampleSize: fc.integer({ min: 1, max: 1000 }),
        }),
        (data) => {
          const anonymized1 = anonymizeData(data);
          const anonymized2 = anonymizeData(anonymized1);

          expect(JSON.stringify(anonymized1)).toBe(JSON.stringify(anonymized2));
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 42: Win rate is bounded
   *
   * For any set of outcomes, the calculated win rate must be between 0 and 1.
   */
  it('Property 42: Win rate is bounded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            outcome: fc.constantFrom('won', 'lost', 'ghosted'),
            vertical: fc.constant('dentistry'),
            city: fc.constant('New York'),
            painScore: fc.integer({ min: 0, max: 100 }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (outcomes) => {
          const winLossData: WinLossData[] = outcomes.map((o) => ({
            outcome: o.outcome as 'won' | 'lost' | 'ghosted',
            vertical: o.vertical,
            city: o.city,
            painScore: o.painScore,
          }));

          await aggregatePatterns('tenant-1', winLossData);

          const model = await prisma.sharedIntelligenceModel.findFirst({
            where: { isActive: true },
          });

          if (model) {
            const patterns = model.patterns as any[];
            for (const pattern of patterns) {
              expect(pattern.winRate).toBeGreaterThanOrEqual(0);
              expect(pattern.winRate).toBeLessThanOrEqual(1);
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 43: Sample size matches outcome count
   *
   * For any aggregated patterns, the sample size must equal the number of
   * outcomes that contributed to that pattern.
   */
  it('Property 43: Sample size matches outcome count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            outcome: fc.constantFrom('won', 'lost', 'ghosted'),
            vertical: fc.constant('dentistry'),
            city: fc.constant('New York'),
            painScore: fc.integer({ min: 0, max: 100 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        async (outcomes) => {
          const winLossData: WinLossData[] = outcomes.map((o) => ({
            outcome: o.outcome as 'won' | 'lost' | 'ghosted',
            vertical: o.vertical,
            city: o.city,
            painScore: o.painScore,
          }));

          await aggregatePatterns('tenant-1', winLossData);

          const model = await prisma.sharedIntelligenceModel.findFirst({
            where: { isActive: true },
          });

          if (model) {
            const patterns = model.patterns as any[];
            const pattern = patterns.find((p) => p.vertical === 'dentistry');
            expect(pattern?.sampleSize).toBe(outcomes.length);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
