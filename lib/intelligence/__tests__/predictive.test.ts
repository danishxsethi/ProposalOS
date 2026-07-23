/**
 * Unit tests for Predictive Lead Scoring
 *
 * Requirements: 13.2, 13.3, 13.5, 13.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scoreProspect,
  compareToRuleBased,
  getFeatureImportance,
  rollbackModel,
  trainModel,
} from '../predictiveScoring';
import type { ProspectFeatures, TrainingOutcome } from '../types';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const models: Record<string, unknown>[] = [];

vi.mock('@/lib/db', () => {
  return {
    prisma: {
      predictiveModel: {
        findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          let results = [...models];
          if (where?.status) results = results.filter((m) => m.status === where.status);
          if (results.length === 0) return null;
          return results[results.length - 1];
        }),
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          return models.find((m) => m.version === where.version) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: `id-${Date.now()}`, ...data };
          models.push(record);
          return record;
        }),
        update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const m = models.find((m) => m.version === where.version);
          if (!m) throw new Error('Not found');
          Object.assign(m, data);
          return m;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          let count = 0;
          for (const m of models) {
            if (where.status && m.status !== where.status) continue;
            Object.assign(m, data);
            count++;
          }
          return { count };
        }),
      },
      winLossRecord: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetModels() {
  models.length = 0;
}

function makeOutcomes(count: number, winRate = 0.5): TrainingOutcome[] {
  return Array.from({ length: count }, (_, i) => ({
    features: {
      vertical: i % 2 === 0 ? 'dentistry' : 'hvac',
      painScore: 50 + (i % 50),
      geoRegion: i % 2 === 0 ? 'New York' : 'Chicago',
      businessSize: 'small' as const,
      reviewCount: 10 + i,
    },
    outcome: (i / count < winRate ? 'won' : 'lost') as 'won' | 'lost',
  }));
}

const baseProspect: ProspectFeatures = {
  vertical: 'dentistry',
  painScore: 75,
  geoRegion: 'New York',
  businessSize: 'small',
  reviewCount: 20,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('scoreProspect', () => {
  beforeEach(() => {
    resetModels();
    vi.clearAllMocks();
  });

  it('returns all required fields', async () => {
    const score = await scoreProspect(baseProspect);

    expect(score).toHaveProperty('leadId');
    expect(score).toHaveProperty('closeProbability');
    expect(score).toHaveProperty('confidence');
    expect(score).toHaveProperty('factors');
    expect(score).toHaveProperty('modelVersion');
    expect(score).toHaveProperty('scoredAt');
  });

  it('closeProbability is in [0, 100]', async () => {
    const score = await scoreProspect(baseProspect);
    expect(score.closeProbability).toBeGreaterThanOrEqual(0);
    expect(score.closeProbability).toBeLessThanOrEqual(100);
  });

  it('confidence is in [0, 1]', async () => {
    const score = await scoreProspect(baseProspect);
    expect(score.confidence).toBeGreaterThanOrEqual(0);
    expect(score.confidence).toBeLessThanOrEqual(1);
  });

  it('modelVersion is a non-empty string', async () => {
    const score = await scoreProspect(baseProspect);
    expect(typeof score.modelVersion).toBe('string');
    expect(score.modelVersion.length).toBeGreaterThan(0);
  });

  it('factors is a non-empty array', async () => {
    const score = await scoreProspect(baseProspect);
    expect(Array.isArray(score.factors)).toBe(true);
    expect(score.factors.length).toBeGreaterThan(0);
  });

  it('scoredAt is a Date', async () => {
    const score = await scoreProspect(baseProspect);
    expect(score.scoredAt).toBeInstanceOf(Date);
  });

  it('falls back to rule-based when no production model exists', async () => {
    const score = await scoreProspect(baseProspect);
    expect(score.modelVersion).toBe('rule-based-fallback');
  });

  it('uses ML model version when a production model exists', async () => {
    const outcomes = makeOutcomes(20);
    const trained = await trainModel(outcomes);
    // Promote to production
    const m = models.find((m) => m.version === trained.version);
    if (m) m.status = 'production';

    const score = await scoreProspect(baseProspect);
    expect(score.modelVersion).toBe(trained.version);
  });
});

describe('compareToRuleBased', () => {
  beforeEach(() => {
    resetModels();
    vi.clearAllMocks();
  });

  it('returns all required comparison fields', async () => {
    const outcomes = makeOutcomes(30);
    const trained = await trainModel(outcomes);

    const result = await compareToRuleBased(trained.version, outcomes);

    expect(result).toHaveProperty('mlModelId', trained.version);
    expect(result).toHaveProperty('ruleBasedPrecision');
    expect(result).toHaveProperty('mlPrecision');
    expect(result).toHaveProperty('ruleBasedRecall');
    expect(result).toHaveProperty('mlRecall');
    expect(result).toHaveProperty('improvementFactor');
  });

  it('improvementFactor is a positive number', async () => {
    const outcomes = makeOutcomes(30);
    const trained = await trainModel(outcomes);

    const result = await compareToRuleBased(trained.version, outcomes);

    expect(typeof result.improvementFactor).toBe('number');
    expect(result.improvementFactor).toBeGreaterThan(0);
  });

  it('precision and recall values are in [0, 1]', async () => {
    const outcomes = makeOutcomes(30);
    const trained = await trainModel(outcomes);

    const result = await compareToRuleBased(trained.version, outcomes);

    expect(result.ruleBasedPrecision).toBeGreaterThanOrEqual(0);
    expect(result.ruleBasedPrecision).toBeLessThanOrEqual(1);
    expect(result.mlPrecision).toBeGreaterThanOrEqual(0);
    expect(result.mlPrecision).toBeLessThanOrEqual(1);
    expect(result.ruleBasedRecall).toBeGreaterThanOrEqual(0);
    expect(result.ruleBasedRecall).toBeLessThanOrEqual(1);
    expect(result.mlRecall).toBeGreaterThanOrEqual(0);
    expect(result.mlRecall).toBeLessThanOrEqual(1);
  });

  it('throws when model does not exist', async () => {
    await expect(compareToRuleBased('v-nonexistent', makeOutcomes(10))).rejects.toThrow(
      'Model not found: v-nonexistent'
    );
  });
});

describe('getFeatureImportance', () => {
  beforeEach(() => {
    resetModels();
    vi.clearAllMocks();
  });

  it('returns a non-empty ranked list', async () => {
    const outcomes = makeOutcomes(20);
    const trained = await trainModel(outcomes);

    const importance = await getFeatureImportance(trained.version);

    expect(Array.isArray(importance)).toBe(true);
    expect(importance.length).toBeGreaterThan(0);
  });

  it('each entry has feature, importance, and direction fields', async () => {
    const outcomes = makeOutcomes(20);
    const trained = await trainModel(outcomes);

    const importance = await getFeatureImportance(trained.version);

    for (const entry of importance) {
      expect(typeof entry.feature).toBe('string');
      expect(entry.feature.length).toBeGreaterThan(0);
      expect(typeof entry.importance).toBe('number');
      expect(['positive', 'negative']).toContain(entry.direction);
    }
  });

  it('list is sorted by importance descending', async () => {
    const outcomes = makeOutcomes(20);
    const trained = await trainModel(outcomes);

    const importance = await getFeatureImportance(trained.version);

    for (let i = 1; i < importance.length; i++) {
      expect(importance[i - 1].importance).toBeGreaterThanOrEqual(importance[i].importance);
    }
  });

  it('throws when model does not exist', async () => {
    await expect(getFeatureImportance('v-nonexistent')).rejects.toThrow(
      'Model not found: v-nonexistent'
    );
  });
});

describe('rollbackModel', () => {
  beforeEach(() => {
    resetModels();
    vi.clearAllMocks();
  });

  it('switches active model to the target version', async () => {
    // Train v1 and promote it
    const v1 = await trainModel(makeOutcomes(20));
    const m1 = models.find((m) => m.version === v1.version)!;
    m1.status = 'production';

    // Train v2 and promote it
    await new Promise((r) => setTimeout(r, 2));
    const v2 = await trainModel(makeOutcomes(20));
    const m2 = models.find((m) => m.version === v2.version)!;
    m1.status = 'deprecated';
    m2.status = 'production';

    // Rollback to v1
    await rollbackModel(v1.version);

    const nowProduction = models.filter((m) => m.status === 'production');
    expect(nowProduction).toHaveLength(1);
    expect(nowProduction[0].version).toBe(v1.version);
  });

  it('deprecates the current production model on rollback', async () => {
    const v1 = await trainModel(makeOutcomes(20));
    const m1 = models.find((m) => m.version === v1.version)!;
    m1.status = 'production';

    await new Promise((r) => setTimeout(r, 2));
    const v2 = await trainModel(makeOutcomes(20));
    const m2 = models.find((m) => m.version === v2.version)!;
    m1.status = 'deprecated';
    m2.status = 'production';

    await rollbackModel(v1.version);

    const deprecated = models.filter((m) => m.status === 'deprecated');
    expect(deprecated.some((m) => m.version === v2.version)).toBe(true);
  });

  it('throws when target version does not exist', async () => {
    await expect(rollbackModel('v-does-not-exist')).rejects.toThrow(
      'Model version not found: v-does-not-exist'
    );
  });
});
