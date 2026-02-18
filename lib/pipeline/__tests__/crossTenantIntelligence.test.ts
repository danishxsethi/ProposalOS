import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  aggregatePatterns,
  predictCloseProb,
  rollbackModel,
  ensureAnonymized,
  anonymizeData,
  WinLossData,
  ProspectContext,
} from '../crossTenantIntelligence';
import { prisma } from '@/lib/db';

describe('Cross-Tenant Intelligence', () => {
  afterEach(async () => {
    await prisma.sharedIntelligenceModel.deleteMany({});
  });

  describe('aggregatePatterns', () => {
    it('should create intelligence model from win/loss outcomes', async () => {
      const outcomes: WinLossData[] = [
        {
          outcome: 'won',
          vertical: 'dentistry',
          city: 'New York',
          painScore: 75,
          dealValue: 5000,
        },
        {
          outcome: 'won',
          vertical: 'dentistry',
          city: 'New York',
          painScore: 80,
          dealValue: 6000,
        },
        {
          outcome: 'lost',
          vertical: 'dentistry',
          city: 'New York',
          painScore: 50,
          lostReason: 'price_sensitivity',
        },
      ];

      await aggregatePatterns('tenant-1', outcomes);

      const model = await prisma.sharedIntelligenceModel.findFirst({
        where: { isActive: true },
      });

      expect(model).toBeDefined();
      expect(model?.patterns).toBeDefined();
      const patterns = model?.patterns as any[];
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].vertical).toBe('dentistry');
      expect(patterns[0].geoRegion).toBe('New York');
      expect(patterns[0].sampleSize).toBe(3);
    });

    it('should calculate win rate correctly', async () => {
      const outcomes: WinLossData[] = [
        { outcome: 'won', vertical: 'hvac', city: 'LA', painScore: 70 },
        { outcome: 'won', vertical: 'hvac', city: 'LA', painScore: 75 },
        { outcome: 'lost', vertical: 'hvac', city: 'LA', painScore: 60 },
        { outcome: 'lost', vertical: 'hvac', city: 'LA', painScore: 65 },
      ];

      await aggregatePatterns('tenant-1', outcomes);

      const model = await prisma.sharedIntelligenceModel.findFirst({
        where: { isActive: true },
      });

      const patterns = model?.patterns as any[];
      const pattern = patterns.find((p) => p.vertical === 'hvac');
      expect(pattern?.winRate).toBe(0.5); // 2 wins out of 4
    });

    it('should handle empty outcomes', async () => {
      await aggregatePatterns('tenant-1', []);

      const models = await prisma.sharedIntelligenceModel.findMany();
      expect(models.length).toBe(0);
    });

    it('should deactivate previous models', async () => {
      const outcomes1: WinLossData[] = [
        { outcome: 'won', vertical: 'dentistry', city: 'NY', painScore: 75 },
      ];

      const outcomes2: WinLossData[] = [
        { outcome: 'won', vertical: 'hvac', city: 'LA', painScore: 70 },
      ];

      await aggregatePatterns('tenant-1', outcomes1);
      await aggregatePatterns('tenant-1', outcomes2);

      const activeModels = await prisma.sharedIntelligenceModel.findMany({
        where: { isActive: true },
      });

      expect(activeModels.length).toBe(1);
    });
  });

  describe('predictCloseProb', () => {
    beforeEach(async () => {
      const outcomes: WinLossData[] = [
        { outcome: 'won', vertical: 'dentistry', city: 'New York', painScore: 75 },
        { outcome: 'won', vertical: 'dentistry', city: 'New York', painScore: 80 },
        { outcome: 'lost', vertical: 'dentistry', city: 'New York', painScore: 50 },
      ];

      await aggregatePatterns('tenant-1', outcomes);
    });

    it('should predict close probability for prospect', async () => {
      const prospect: ProspectContext = {
        vertical: 'dentistry',
        painScore: 75,
        geoRegion: 'New York',
      };

      const prediction = await predictCloseProb(prospect);

      expect(prediction.closeProb).toBeGreaterThan(0);
      expect(prediction.closeProb).toBeLessThanOrEqual(100);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.factors.length).toBeGreaterThan(0);
    });

    it('should return neutral prediction when no model exists', async () => {
      await prisma.sharedIntelligenceModel.deleteMany({});

      const prospect: ProspectContext = {
        vertical: 'dentistry',
        painScore: 75,
        geoRegion: 'New York',
      };

      const prediction = await predictCloseProb(prospect);

      expect(prediction.closeProb).toBe(50);
      expect(prediction.confidence).toBe(0);
      expect(prediction.modelVersion).toBe('none');
    });

    it('should return neutral prediction for unknown vertical/region', async () => {
      const prospect: ProspectContext = {
        vertical: 'unknown',
        painScore: 75,
        geoRegion: 'Unknown City',
      };

      const prediction = await predictCloseProb(prospect);

      expect(prediction.closeProb).toBe(50);
      expect(prediction.confidence).toBe(0.3);
    });

    it('should include pain score in factors', async () => {
      const prospect: ProspectContext = {
        vertical: 'dentistry',
        painScore: 85,
        geoRegion: 'New York',
      };

      const prediction = await predictCloseProb(prospect);

      const painFactor = prediction.factors.find((f) => f.factor === 'pain_score');
      expect(painFactor).toBeDefined();
      expect(painFactor?.value).toBe(85);
    });
  });

  describe('rollbackModel', () => {
    it('should rollback to previous model version', async () => {
      const outcomes1: WinLossData[] = [
        { outcome: 'won', vertical: 'dentistry', city: 'NY', painScore: 75 },
      ];

      const outcomes2: WinLossData[] = [
        { outcome: 'lost', vertical: 'hvac', city: 'LA', painScore: 70 },
      ];

      await aggregatePatterns('tenant-1', outcomes1);
      const model1 = await prisma.sharedIntelligenceModel.findFirst({
        where: { isActive: true },
      });
      const version1 = model1?.version;

      await aggregatePatterns('tenant-1', outcomes2);
      const model2 = await prisma.sharedIntelligenceModel.findFirst({
        where: { isActive: true },
      });
      const version2 = model2?.version;

      expect(version1).not.toBe(version2);

      // Rollback to version 1
      await rollbackModel(version1!);

      const activeModel = await prisma.sharedIntelligenceModel.findFirst({
        where: { isActive: true },
      });

      expect(activeModel?.version).toBe(version1);
    });

    it('should throw error for non-existent version', async () => {
      await expect(rollbackModel('v-nonexistent')).rejects.toThrow('Model version not found');
    });
  });

  describe('ensureAnonymized', () => {
    it('should detect email addresses', () => {
      const data = { email: 'test@example.com' };
      expect(ensureAnonymized(data)).toBe(false);
    });

    it('should detect phone numbers', () => {
      const data = { phone: '555-123-4567' };
      expect(ensureAnonymized(data)).toBe(false);
    });

    it('should detect SSN', () => {
      const data = { ssn: '123-45-6789' };
      expect(ensureAnonymized(data)).toBe(false);
    });

    it('should detect credit card numbers', () => {
      const data = { card: '1234-5678-9012-3456' };
      expect(ensureAnonymized(data)).toBe(false);
    });

    it('should pass anonymized data', () => {
      const data = {
        vertical: 'dentistry',
        winRate: 0.65,
        sampleSize: 100,
      };
      expect(ensureAnonymized(data)).toBe(true);
    });
  });

  describe('anonymizeData', () => {
    it('should remove email addresses', () => {
      const data = { email: 'test@example.com', name: 'John' };
      const anonymized = anonymizeData(data);
      expect(JSON.stringify(anonymized)).not.toContain('test@example.com');
      expect(JSON.stringify(anonymized)).toContain('[EMAIL]');
    });

    it('should remove phone numbers', () => {
      const data = { phone: '555-123-4567' };
      const anonymized = anonymizeData(data);
      expect(JSON.stringify(anonymized)).not.toContain('555-123-4567');
      expect(JSON.stringify(anonymized)).toContain('[PHONE]');
    });

    it('should preserve non-PII data', () => {
      const data = { vertical: 'dentistry', winRate: 0.65 };
      const anonymized = anonymizeData(data);
      expect(anonymized.vertical).toBe('dentistry');
      expect(anonymized.winRate).toBe(0.65);
    });
  });
});
