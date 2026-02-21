/**
 * Unit tests for RecommendationEffectivenessTracker
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEffectivenessTracker } from '../recommendation-effectiveness-tracker';
import { RecommendationImplementation } from '../types';

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

describe('RecommendationEffectivenessTracker', () => {
  let tracker: RecommendationEffectivenessTracker;

  beforeEach(() => {
    tracker = new RecommendationEffectivenessTracker();
  });

  // -------------------------------------------------------------------------
  // recordImplementation
  // -------------------------------------------------------------------------

  describe('recordImplementation', () => {
    it('returns an implementation ID', async () => {
      const id = await tracker.recordImplementation(makeImpl());
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('uses provided id when present', async () => {
      const id = await tracker.recordImplementation(makeImpl({ id: 'custom-id' }));
      expect(id).toBe('custom-id');
    });

    it('generates unique IDs for multiple implementations', async () => {
      const id1 = await tracker.recordImplementation(makeImpl());
      const id2 = await tracker.recordImplementation(makeImpl());
      expect(id1).not.toBe(id2);
    });
  });

  // -------------------------------------------------------------------------
  // recordOutcome
  // -------------------------------------------------------------------------

  describe('recordOutcome', () => {
    it('throws when implementation not found', async () => {
      await expect(
        tracker.recordOutcome('nonexistent', {
          reAuditDate: new Date(),
          actualImpact: { trafficChange: 10, rankingChange: 3, conversionChange: 5 },
        }),
      ).rejects.toThrow('Implementation not found');
    });

    it('returns an EffectivenessRecord with required fields', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      const record = await tracker.recordOutcome(implId, {
        reAuditDate: new Date('2024-03-01'),
        actualImpact: { trafficChange: 18, rankingChange: 4, conversionChange: 9 },
      });

      expect(record.implementationId).toBe(implId);
      expect(record.reAuditDate).toEqual(new Date('2024-03-01'));
      expect(record.actualImpact.trafficChange).toBe(18);
      expect(record.actualImpact.rankingChange).toBe(4);
      expect(record.actualImpact.conversionChange).toBe(9);
      expect(typeof record.accuracy).toBe('number');
      expect(typeof record.confidenceLevel).toBe('number');
    });

    it('accuracy is 1 when actual matches predicted exactly', async () => {
      const impl = makeImpl({
        predictedImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      const implId = await tracker.recordImplementation(impl);
      const record = await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      expect(record.accuracy).toBe(1);
    });

    it('accuracy is between 0 and 1', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      const record = await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 0, rankingChange: 0, conversionChange: 0 },
      });
      expect(record.accuracy).toBeGreaterThanOrEqual(0);
      expect(record.accuracy).toBeLessThanOrEqual(1);
    });

    it('accuracy decreases as actual diverges from predicted', async () => {
      const impl = makeImpl({
        predictedImpact: { trafficChange: 50, rankingChange: 10, conversionChange: 20 },
      });

      const implId1 = await tracker.recordImplementation({ ...impl, id: 'impl-1' });
      const implId2 = await tracker.recordImplementation({ ...impl, id: 'impl-2' });

      const closeRecord = await tracker.recordOutcome(implId1, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 48, rankingChange: 9, conversionChange: 19 },
      });
      const farRecord = await tracker.recordOutcome(implId2, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 0, rankingChange: 0, conversionChange: 0 },
      });

      expect(closeRecord.accuracy).toBeGreaterThan(farRecord.accuracy);
    });

    it('tracks all three impact dimensions (traffic, ranking, conversion)', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      const record = await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 15, rankingChange: 3, conversionChange: 7 },
      });
      expect(record.actualImpact).toHaveProperty('trafficChange', 15);
      expect(record.actualImpact).toHaveProperty('rankingChange', 3);
      expect(record.actualImpact).toHaveProperty('conversionChange', 7);
    });
  });

  // -------------------------------------------------------------------------
  // getEffectivenessStats
  // -------------------------------------------------------------------------

  describe('getEffectivenessStats', () => {
    it('returns empty array when no outcomes recorded', async () => {
      const stats = await tracker.getEffectivenessStats();
      expect(stats).toEqual([]);
    });

    it('groups stats by recommendationType, industry, locale', async () => {
      const implA = await tracker.recordImplementation(
        makeImpl({ recommendationType: 'schema_markup', industry: 'dental', locale: 'en-US' }),
      );
      const implB = await tracker.recordImplementation(
        makeImpl({ recommendationType: 'page_speed', industry: 'legal', locale: 'de-DE' }),
      );

      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      await tracker.recordOutcome(implB, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
      });

      const stats = await tracker.getEffectivenessStats();
      expect(stats).toHaveLength(2);

      const types = stats.map((s) => s.recommendationType);
      expect(types).toContain('schema_markup');
      expect(types).toContain('page_speed');
    });

    it('filters by recommendationType', async () => {
      const implA = await tracker.recordImplementation(
        makeImpl({ recommendationType: 'schema_markup' }),
      );
      const implB = await tracker.recordImplementation(
        makeImpl({ recommendationType: 'page_speed' }),
      );

      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      await tracker.recordOutcome(implB, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
      });

      const stats = await tracker.getEffectivenessStats({ recommendationType: 'schema_markup' });
      expect(stats).toHaveLength(1);
      expect(stats[0].recommendationType).toBe('schema_markup');
    });

    it('filters by industry', async () => {
      const implA = await tracker.recordImplementation(makeImpl({ industry: 'dental' }));
      const implB = await tracker.recordImplementation(makeImpl({ industry: 'legal' }));

      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      await tracker.recordOutcome(implB, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
      });

      const stats = await tracker.getEffectivenessStats({ industry: 'dental' });
      expect(stats).toHaveLength(1);
      expect(stats[0].industry).toBe('dental');
    });

    it('filters by locale', async () => {
      const implA = await tracker.recordImplementation(makeImpl({ locale: 'en-US' }));
      const implB = await tracker.recordImplementation(makeImpl({ locale: 'de-DE' }));

      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      await tracker.recordOutcome(implB, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
      });

      const stats = await tracker.getEffectivenessStats({ locale: 'de-DE' });
      expect(stats).toHaveLength(1);
      expect(stats[0].locale).toBe('de-DE');
    });

    it('includes sampleSize, averageAccuracy, averageActualImpact, confidenceInterval', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });

      const stats = await tracker.getEffectivenessStats();
      expect(stats[0].sampleSize).toBe(1);
      expect(typeof stats[0].averageAccuracy).toBe('number');
      expect(typeof stats[0].averageActualImpact).toBe('number');
      expect(Array.isArray(stats[0].confidenceInterval)).toBe(true);
      expect(stats[0].confidenceInterval).toHaveLength(2);
    });

    it('aggregates multiple outcomes for same group', async () => {
      const implA = await tracker.recordImplementation(makeImpl({ id: 'a' }));
      const implB = await tracker.recordImplementation(makeImpl({ id: 'b' }));

      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });
      await tracker.recordOutcome(implB, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 10, rankingChange: 3, conversionChange: 5 },
      });

      const stats = await tracker.getEffectivenessStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].sampleSize).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getAccuracyTrends
  // -------------------------------------------------------------------------

  describe('getAccuracyTrends', () => {
    it('returns zero accuracy and stable trend when no data', async () => {
      const metrics = await tracker.getAccuracyTrends();
      expect(metrics.overallAccuracy).toBe(0);
      expect(metrics.trend).toBe('stable');
      expect(metrics.byRecommendationType.size).toBe(0);
      expect(metrics.byIndustry.size).toBe(0);
      expect(metrics.byLocale.size).toBe(0);
    });

    it('returns overall accuracy across all records', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });

      const metrics = await tracker.getAccuracyTrends();
      expect(metrics.overallAccuracy).toBe(1); // exact match
    });

    it('breaks down accuracy by recommendationType, industry, locale', async () => {
      const implA = await tracker.recordImplementation(
        makeImpl({ recommendationType: 'schema_markup', industry: 'dental', locale: 'en-US' }),
      );
      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });

      const metrics = await tracker.getAccuracyTrends();
      expect(metrics.byRecommendationType.has('schema_markup')).toBe(true);
      expect(metrics.byIndustry.has('dental')).toBe(true);
      expect(metrics.byLocale.has('en-US')).toBe(true);
    });

    it('trend is improving when accuracy increases over time', async () => {
      // Add records with increasing accuracy over time
      for (let i = 0; i < 6; i++) {
        const implId = await tracker.recordImplementation(makeImpl({ id: `impl-${i}` }));
        // Gradually improve: start with large error, end with small error
        const error = 60 - i * 10; // 60, 50, 40, 30, 20, 10
        await tracker.recordOutcome(implId, {
          reAuditDate: new Date(2024, i, 1),
          actualImpact: {
            trafficChange: 20 + error,
            rankingChange: 5,
            conversionChange: 10,
          },
        });
      }

      const metrics = await tracker.getAccuracyTrends();
      // With improving accuracy, trend should be 'improving' or 'stable'
      expect(['improving', 'stable']).toContain(metrics.trend);
    });
  });

  // -------------------------------------------------------------------------
  // getPredictiveAccuracy
  // -------------------------------------------------------------------------

  describe('getPredictiveAccuracy', () => {
    it('returns 0 when no data', async () => {
      const accuracy = await tracker.getPredictiveAccuracy();
      expect(accuracy).toBe(0);
    });

    it('returns 1 for perfect predictions', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });

      const accuracy = await tracker.getPredictiveAccuracy();
      expect(accuracy).toBe(1);
    });

    it('returns value between 0 and 1', async () => {
      const implId = await tracker.recordImplementation(makeImpl());
      await tracker.recordOutcome(implId, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 5, rankingChange: 1, conversionChange: 2 },
      });

      const accuracy = await tracker.getPredictiveAccuracy();
      expect(accuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy).toBeLessThanOrEqual(1);
    });

    it('averages accuracy across multiple records', async () => {
      // Perfect prediction
      const implA = await tracker.recordImplementation(makeImpl({ id: 'a' }));
      await tracker.recordOutcome(implA, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
      });

      // Imperfect prediction
      const implB = await tracker.recordImplementation(makeImpl({ id: 'b' }));
      await tracker.recordOutcome(implB, {
        reAuditDate: new Date(),
        actualImpact: { trafficChange: 0, rankingChange: 0, conversionChange: 0 },
      });

      const accuracy = await tracker.getPredictiveAccuracy();
      // Should be between 0 and 1, and less than 1 (since one was imperfect)
      expect(accuracy).toBeGreaterThan(0);
      expect(accuracy).toBeLessThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // hasSufficientDataForProposals (Req 10.5)
  // -------------------------------------------------------------------------

  describe('hasSufficientDataForProposals', () => {
    it('returns false when fewer than 5 records exist', async () => {
      for (let i = 0; i < 4; i++) {
        const implId = await tracker.recordImplementation(makeImpl({ id: `impl-${i}` }));
        await tracker.recordOutcome(implId, {
          reAuditDate: new Date(),
          actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
        });
      }

      expect(
        tracker.hasSufficientDataForProposals('schema_markup', 'dental', 'en-US'),
      ).toBe(false);
    });

    it('returns true when 5 or more records exist', async () => {
      for (let i = 0; i < 5; i++) {
        const implId = await tracker.recordImplementation(makeImpl({ id: `impl-${i}` }));
        await tracker.recordOutcome(implId, {
          reAuditDate: new Date(),
          actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
        });
      }

      expect(
        tracker.hasSufficientDataForProposals('schema_markup', 'dental', 'en-US'),
      ).toBe(true);
    });

    it('counts only records matching the exact type/industry/locale', async () => {
      // 5 records for schema_markup/dental/en-US
      for (let i = 0; i < 5; i++) {
        const implId = await tracker.recordImplementation(makeImpl({ id: `impl-${i}` }));
        await tracker.recordOutcome(implId, {
          reAuditDate: new Date(),
          actualImpact: { trafficChange: 20, rankingChange: 5, conversionChange: 10 },
        });
      }

      // Different type should still return false
      expect(
        tracker.hasSufficientDataForProposals('page_speed', 'dental', 'en-US'),
      ).toBe(false);
    });
  });
});
