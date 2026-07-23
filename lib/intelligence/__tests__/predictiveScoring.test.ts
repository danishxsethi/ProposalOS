/**
 * Unit tests for Predictive Lead Scoring
 * Requirements: 13.2, 13.3, 13.5, 13.8
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    predictiveModel: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    winLossRecord: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  trainModel,
  validateModel,
  compareToRuleBased,
  scoreProspect,
  batchScore,
  getFeatureImportance,
  rollbackModel,
} from '../predictiveScoring';
import type { TrainingOutcome, ProspectFeatures } from '../types';

const mockPrisma = prisma as unknown as {
  predictiveModel: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  winLossRecord: { findMany: ReturnType<typeof vi.fn> };
};

function makeOutcomes(n: number, winRate = 0.4): TrainingOutcome[] {
  return Array.from({ length: n }, (_, i) => ({
    features: {
      vertical: 'dentist',
      painScore: 50 + (i % 50),
      geoRegion: 'NYC',
      businessSize: 'small' as const,
      reviewCount: 20 + i,
      websiteAge: 3,
      competitorGap: 10,
    },
    outcome: i / n < winRate ? 'won' : 'lost',
    dealValue: 1500,
    timeToClose: 14,
  }));
}

const mockGBModel = {
  stumps: [{ featureIndex: 0, threshold: 0.5, leftValue: -0.5, rightValue: 0.5 }],
  learningRate: 0.1,
  featureWeights: [0.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05],
  baseScore: 0,
};

const mockModelRecord = {
  version: 'v123',
  modelType: 'gradient_boosting',
  features: ['painScore', 'reviewCount'],
  status: 'production',
  performance: { accuracy: 0.75, precision: 0.7, recall: 0.65, aucRoc: 0.8, f1Score: 0.67 },
  trainedOn: 100,
  modelData: mockGBModel,
  trainedAt: new Date(),
  promotedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.winLossRecord.findMany.mockResolvedValue([
    { outcome: 'won' },
    { outcome: 'won' },
    { outcome: 'lost' },
  ]);
});

describe('trainModel', () => {
  it('returns a PredictiveModelConfig with all required fields', async () => {
    mockPrisma.predictiveModel.create.mockResolvedValue({ version: 'v1' });

    const outcomes = makeOutcomes(60);
    const result = await trainModel(outcomes);

    expect(result.version).toBeTruthy();
    expect(result.type).toBe('gradient_boosting');
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.trainedOn).toBe(60);
    expect(result.performance.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.performance.precision).toBeGreaterThanOrEqual(0);
    expect(result.performance.recall).toBeGreaterThanOrEqual(0);
    expect(result.performance.aucRoc).toBeGreaterThanOrEqual(0);
    expect(result.performance.f1Score).toBeGreaterThanOrEqual(0);
    expect(result.status).toBe('validating');
  });

  it('throws when outcomes array is empty', async () => {
    await expect(trainModel([])).rejects.toThrow('Cannot train model with empty outcomes');
  });
});

describe('validateModel', () => {
  it('returns ValidationResult with all metrics and promotes model', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(mockModelRecord);
    mockPrisma.predictiveModel.update.mockResolvedValue({ ...mockModelRecord, status: 'production' });

    const testSet = makeOutcomes(30);
    const result = await validateModel('v123', testSet);

    expect(result.modelId).toBe('v123');
    expect(result.sampleSize).toBe(30);
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.precision).toBeGreaterThanOrEqual(0);
    expect(result.recall).toBeGreaterThanOrEqual(0);
    expect(result.aucRoc).toBeGreaterThanOrEqual(0);
    expect(mockPrisma.predictiveModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { version: 'v123' },
        data: expect.objectContaining({ status: 'production' }),
      })
    );
  });

  it('throws when model not found', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(null);
    await expect(validateModel('nonexistent', makeOutcomes(10))).rejects.toThrow('Model not found');
  });
});

describe('compareToRuleBased', () => {
  it('returns ComparisonResult with all required fields', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(mockModelRecord);

    const testSet = makeOutcomes(50, 0.4);
    const result = await compareToRuleBased('v123', testSet);

    expect(result.mlModelId).toBe('v123');
    expect(result.ruleBasedPrecision).toBeGreaterThanOrEqual(0);
    expect(result.mlPrecision).toBeGreaterThanOrEqual(0);
    expect(result.ruleBasedRecall).toBeGreaterThanOrEqual(0);
    expect(result.mlRecall).toBeGreaterThanOrEqual(0);
    expect(result.improvementFactor).toBeGreaterThan(0);
  });

  it('throws when model not found', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(null);
    await expect(compareToRuleBased('bad', makeOutcomes(10))).rejects.toThrow('Model not found');
  });
});

describe('scoreProspect', () => {
  const prospect: ProspectFeatures = {
    vertical: 'dentist',
    painScore: 75,
    geoRegion: 'NYC',
    businessSize: 'medium',
    reviewCount: 50,
    websiteAge: 5,
    competitorGap: 25,
    engagementSignals: { emailOpens: 3, proposalViews: 2, chatInteractions: 1 },
  };

  it('returns closeProbability in [0, 100]', async () => {
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(mockModelRecord);

    const result = await scoreProspect(prospect);

    expect(result.closeProbability).toBeGreaterThanOrEqual(0);
    expect(result.closeProbability).toBeLessThanOrEqual(100);
  });

  it('returns confidence in [0, 1]', async () => {
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(mockModelRecord);

    const result = await scoreProspect(prospect);

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns non-empty factors array', async () => {
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(mockModelRecord);

    const result = await scoreProspect(prospect);

    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.factors[0]).toHaveProperty('factor');
    expect(result.factors[0]).toHaveProperty('contribution');
    expect(result.factors[0]).toHaveProperty('value');
  });

  it('returns modelVersion as non-empty string', async () => {
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(mockModelRecord);

    const result = await scoreProspect(prospect);

    expect(result.modelVersion).toBeTruthy();
    expect(typeof result.modelVersion).toBe('string');
  });

  it('falls back to rule-based when no production model exists', async () => {
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(null);

    const result = await scoreProspect(prospect);

    expect(result.modelVersion).toBe('rule-based-fallback');
    expect(result.closeProbability).toBeGreaterThanOrEqual(0);
    expect(result.closeProbability).toBeLessThanOrEqual(100);
  });
});

describe('batchScore', () => {
  it('returns a score for each prospect', async () => {
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(mockModelRecord);

    const prospects: ProspectFeatures[] = [
      { vertical: 'dentist', painScore: 60, geoRegion: 'NYC' },
      { vertical: 'plumber', painScore: 80, geoRegion: 'LA' },
      { vertical: 'lawyer', painScore: 40, geoRegion: 'Chicago' },
    ];

    const results = await batchScore(prospects);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.closeProbability).toBeGreaterThanOrEqual(0);
      expect(r.closeProbability).toBeLessThanOrEqual(100);
    }
  });
});

describe('getFeatureImportance', () => {
  it('returns non-empty ranked FeatureImportance list', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(mockModelRecord);

    const result = await getFeatureImportance('v123');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('feature');
    expect(result[0]).toHaveProperty('importance');
    expect(result[0]).toHaveProperty('direction');
    // Should be sorted descending by importance
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].importance).toBeGreaterThanOrEqual(result[i].importance);
    }
  });

  it('throws when model not found', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(null);
    await expect(getFeatureImportance('bad')).rejects.toThrow('Model not found');
  });
});

describe('rollbackModel', () => {
  it('promotes target version to production and deprecates current', async () => {
    const currentModel = { ...mockModelRecord, version: 'v200', performance: { aucRoc: 0.85 } };
    const targetModel = { ...mockModelRecord, version: 'v100', performance: { aucRoc: 0.82 } };

    mockPrisma.predictiveModel.findUnique.mockResolvedValue(targetModel);
    mockPrisma.predictiveModel.findFirst.mockResolvedValue(currentModel);
    mockPrisma.predictiveModel.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.predictiveModel.update.mockResolvedValue({ ...targetModel, status: 'production' });

    await rollbackModel('v100');

    expect(mockPrisma.predictiveModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'deprecated' }) })
    );
    expect(mockPrisma.predictiveModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { version: 'v100' },
        data: expect.objectContaining({ status: 'production' }),
      })
    );
  });

  it('throws when target version not found', async () => {
    mockPrisma.predictiveModel.findUnique.mockResolvedValue(null);
    await expect(rollbackModel('nonexistent')).rejects.toThrow('Model version not found');
  });
});
