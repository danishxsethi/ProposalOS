/**
 * Property 13: Predictive Score Bounds
 *
 * For any prospect scored by the model, `closeProbability` must be in [0, 100],
 * `confidence` in [0, 1], and `modelVersion` must be a non-empty string.
 *
 * Feature: sprint-5-6-integration-pilot, Property 13: Predictive Score Bounds
 * Validates: Requirements 13.2
 */

import { describe, it, vi, beforeEach } from 'vitest';
import { expect } from 'vitest';
import fc from 'fast-check';

// Mock prisma so scoreProspect falls back to rule-based scoring (no DB required)
vi.mock('@/lib/db', () => ({
  prisma: {
    predictiveModel: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    winLossRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { scoreProspect } from '../predictiveScoring';
import type { ProspectFeatures } from '../types';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Property 13: Predictive Score Bounds', () => {
  /**
   * Property 13: Predictive Score Bounds
   *
   * For any prospect scored by the model:
   * - closeProbability must be in [0, 100]
   * - confidence must be in [0, 1]
   * - modelVersion must be a non-empty string
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 13: Predictive Score Bounds
   */
  it(
    'Property 13: scoreProspect always returns closeProbability in [0,100], confidence in [0,1], and non-empty modelVersion',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            vertical: fc.constantFrom(
              'dentistry',
              'hvac',
              'plumbing',
              'roofing',
              'landscaping',
              'auto_repair',
              'legal',
              'accounting',
              'restaurant',
              'retail'
            ),
            painScore: fc.integer({ min: 0, max: 100 }),
            geoRegion: fc.constantFrom(
              'New York',
              'Los Angeles',
              'Chicago',
              'Houston',
              'Phoenix',
              'Philadelphia',
              'San Antonio',
              'San Diego'
            ),
            businessSize: fc.option(
              fc.constantFrom('small' as const, 'medium' as const, 'large' as const),
              { nil: undefined }
            ),
            websiteAge: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
            reviewCount: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
            competitorGap: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            engagementSignals: fc.option(
              fc.record({
                emailOpens: fc.integer({ min: 0, max: 50 }),
                proposalViews: fc.integer({ min: 0, max: 20 }),
                chatInteractions: fc.integer({ min: 0, max: 30 }),
              }),
              { nil: undefined }
            ),
          }),
          async (raw) => {
            const prospect: ProspectFeatures = {
              vertical: raw.vertical,
              painScore: raw.painScore,
              geoRegion: raw.geoRegion,
              businessSize: raw.businessSize ?? undefined,
              websiteAge: raw.websiteAge ?? undefined,
              reviewCount: raw.reviewCount ?? undefined,
              competitorGap: raw.competitorGap ?? undefined,
              engagementSignals: raw.engagementSignals ?? undefined,
            };

            const score = await scoreProspect(prospect);

            expect(
              score.closeProbability,
              `closeProbability ${score.closeProbability} is out of [0, 100]`
            ).toBeGreaterThanOrEqual(0);

            expect(
              score.closeProbability,
              `closeProbability ${score.closeProbability} is out of [0, 100]`
            ).toBeLessThanOrEqual(100);

            expect(
              score.confidence,
              `confidence ${score.confidence} is out of [0, 1]`
            ).toBeGreaterThanOrEqual(0);

            expect(
              score.confidence,
              `confidence ${score.confidence} is out of [0, 1]`
            ).toBeLessThanOrEqual(1);

            expect(
              score.modelVersion,
              'modelVersion must be a non-empty string'
            ).toBeTruthy();

            expect(typeof score.modelVersion).toBe('string');
            expect(score.modelVersion.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
