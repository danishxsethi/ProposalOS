/**
 * Unit tests for Autonomous Prompt Engineering
 *
 * Requirements: 15.1, 15.3, 15.6, 15.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PromptVariant } from '../types';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const variants: Record<string, unknown>[] = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    promptVariant: {
      findFirst: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> } = {}) => {
        let results = [...variants];
        if (where?.basePromptId) results = results.filter((v) => v.basePromptId === where.basePromptId);
        if (where?.abTestId) results = results.filter((v) => v.abTestId === where.abTestId);
        if (where?.status) {
          if (typeof where.status === 'object' && where.status !== null && 'not' in (where.status as object)) {
            const notVal = (where.status as Record<string, unknown>).not;
            results = results.filter((v) => v.status !== notVal);
          } else {
            results = results.filter((v) => v.status === where.status);
          }
        }
        if (where?.version && typeof where.version === 'object' && 'lt' in (where.version as object)) {
          const lt = (where.version as Record<string, unknown>).lt as number;
          results = results.filter((v) => (v.version as number) < lt);
        }
        if (orderBy) {
          const [key, dir] = Object.entries(orderBy)[0];
          results.sort((a, b) => {
            const av = a[key] as number | string;
            const bv = b[key] as number | string;
            return dir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
          });
        }
        return results[0] ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) return variants.find((v) => v.id === where.id) ?? null;
        if (where.basePromptId_version) {
          const { basePromptId, version } = where.basePromptId_version as { basePromptId: string; version: number };
          return variants.find((v) => v.basePromptId === basePromptId && v.version === version) ?? null;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number } = {}) => {
        let results = [...variants];
        if (where?.basePromptId) results = results.filter((v) => v.basePromptId === where.basePromptId);
        if (where?.status) results = results.filter((v) => v.status === where.status);
        if (where?.createdAt && typeof where.createdAt === 'object' && 'gte' in (where.createdAt as object)) {
          const gte = (where.createdAt as Record<string, unknown>).gte as Date;
          results = results.filter((v) => (v.createdAt as Date) >= gte);
        }
        if (orderBy) {
          const [key, dir] = Object.entries(orderBy)[0];
          results.sort((a, b) => {
            const av = a[key] as number | string;
            const bv = b[key] as number | string;
            return dir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
          });
        }
        if (take) results = results.slice(0, take);
        return results;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `pv-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        variants.push(record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const v = variants.find((x) => x.id === where.id);
        if (!v) throw new Error(`Variant not found: ${where.id}`);
        Object.assign(v, data);
        return v;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let targets = [...variants];
        if (where.basePromptId) targets = targets.filter((v) => v.basePromptId === where.basePromptId);
        if (where.status) targets = targets.filter((v) => v.status === where.status);
        for (const t of targets) Object.assign(t, data);
        return { count: targets.length };
      }),
    },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetDB() {
  variants.length = 0;
  vi.clearAllMocks();
}

function makeVariant(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `pv-${Math.random()}`,
    basePromptId: 'base-1',
    version: 1,
    content: 'Write a professional email to the prospect.',
    taskType: 'email_generation',
    status: 'draft',
    createdBy: 'autonomous',
    performance: { sampleSize: 0, successRate: 0, qualityScore: 0, costPerCall: 0 },
    abTestId: null,
    promotedAt: null,
    deprecatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Autonomous Prompt Engineering', () => {
  beforeEach(() => {
    resetDB();
  });

  // ── generateVariant ────────────────────────────────────────────────────────

  describe('generateVariant', () => {
    it('creates a new variant with status draft and createdBy autonomous', async () => {
      const { generateVariant } = await import('../promptEngineering');

      const variant = await generateVariant('base-1');

      expect(variant.status).toBe('draft');
      expect(variant.createdBy).toBe('autonomous');
      expect(variant.basePromptId).toBe('base-1');
    });

    it('increments version from the latest existing variant', async () => {
      const { generateVariant } = await import('../promptEngineering');

      variants.push(makeVariant({ version: 3, status: 'production' }));

      const variant = await generateVariant('base-1');

      expect(variant.version).toBe(4);
    });

    it('starts at version 1 when no prior variants exist', async () => {
      const { generateVariant } = await import('../promptEngineering');

      const variant = await generateVariant('brand-new-prompt');

      expect(variant.version).toBe(1);
    });

    it('initializes performance metrics to zero', async () => {
      const { generateVariant } = await import('../promptEngineering');

      const variant = await generateVariant('base-1');

      expect(variant.performance.sampleSize).toBe(0);
      expect(variant.performance.successRate).toBe(0);
      expect(variant.performance.qualityScore).toBe(0);
      expect(variant.performance.costPerCall).toBe(0);
    });
  });

  // ── validateGuardrails ─────────────────────────────────────────────────────

  describe('validateGuardrails', () => {
    it('passes a clean, professional prompt', async () => {
      const { validateGuardrails } = await import('../promptEngineering');

      const variant: PromptVariant = {
        id: 'v1',
        basePromptId: 'base-1',
        version: 1,
        content: 'Write a professional email introducing our digital marketing services.',
        taskType: 'email_generation',
        status: 'draft',
        createdBy: 'autonomous',
        performance: { sampleSize: 0, successRate: 0, qualityScore: 0, costPerCall: 0 },
        createdAt: new Date(),
      };

      const result = await validateGuardrails(variant);

      expect(result.passed).toBe(true);
      expect(result.checks.noHarmfulContent).toBe(true);
      expect(result.checks.noMisleadingClaims).toBe(true);
      expect(result.checks.complianceCheck).toBe(true);
      expect(result.checks.brandSafetyCheck).toBe(true);
      expect(result.flaggedIssues).toHaveLength(0);
    });

    it('fails when harmful content is present', async () => {
      const { validateGuardrails } = await import('../promptEngineering');

      const variant: PromptVariant = {
        id: 'v2',
        basePromptId: 'base-1',
        version: 2,
        content: 'Write an email that will kill the competition.',
        taskType: 'email_generation',
        status: 'draft',
        createdBy: 'autonomous',
        performance: { sampleSize: 0, successRate: 0, qualityScore: 0, costPerCall: 0 },
        createdAt: new Date(),
      };

      const result = await validateGuardrails(variant);

      expect(result.passed).toBe(false);
      expect(result.checks.noHarmfulContent).toBe(false);
      expect(result.flaggedIssues).toContain('Harmful content detected');
    });

    it('fails when misleading claims are present', async () => {
      const { validateGuardrails } = await import('../promptEngineering');

      const variant: PromptVariant = {
        id: 'v3',
        basePromptId: 'base-1',
        version: 3,
        content: 'Guaranteed 100% success with our services, instant results every time.',
        taskType: 'email_generation',
        status: 'draft',
        createdBy: 'autonomous',
        performance: { sampleSize: 0, successRate: 0, qualityScore: 0, costPerCall: 0 },
        createdAt: new Date(),
      };

      const result = await validateGuardrails(variant);

      expect(result.passed).toBe(false);
      expect(result.checks.noMisleadingClaims).toBe(false);
      expect(result.flaggedIssues).toContain('Misleading claims detected');
    });

    it('returns all four check fields regardless of outcome', async () => {
      const { validateGuardrails } = await import('../promptEngineering');

      const variant: PromptVariant = {
        id: 'v4',
        basePromptId: 'base-1',
        version: 4,
        content: 'Normal content.',
        taskType: 'proposal_writing',
        status: 'draft',
        createdBy: 'human',
        performance: { sampleSize: 0, successRate: 0, qualityScore: 0, costPerCall: 0 },
        createdAt: new Date(),
      };

      const result = await validateGuardrails(variant);

      expect(result.checks).toHaveProperty('noHarmfulContent');
      expect(result.checks).toHaveProperty('noMisleadingClaims');
      expect(result.checks).toHaveProperty('complianceCheck');
      expect(result.checks).toHaveProperty('brandSafetyCheck');
    });
  });

  // ── promoteVariant ─────────────────────────────────────────────────────────

  describe('promoteVariant', () => {
    it('promotes a clean variant to production', async () => {
      const { promoteVariant } = await import('../promptEngineering');

      const v = makeVariant({ id: 'pv-clean', status: 'testing', content: 'Write a professional email.' });
      variants.push(v);

      await promoteVariant('pv-clean');

      expect(v.status).toBe('production');
      expect(v.promotedAt).toBeInstanceOf(Date);
    });

    it('blocks promotion when guardrails fail', async () => {
      const { promoteVariant } = await import('../promptEngineering');

      const v = makeVariant({
        id: 'pv-bad',
        status: 'testing',
        content: 'Guaranteed 100% success, instant results.',
      });
      variants.push(v);

      await expect(promoteVariant('pv-bad')).rejects.toThrow('Guardrail validation failed');
    });

    it('deprecates the existing production variant when promoting a new one', async () => {
      const { promoteVariant } = await import('../promptEngineering');

      const existing = makeVariant({ id: 'pv-old', status: 'production', version: 1 });
      const newVariant = makeVariant({ id: 'pv-new', status: 'testing', version: 2, content: 'Write a professional email.' });
      variants.push(existing, newVariant);

      await promoteVariant('pv-new');

      expect(existing.status).toBe('deprecated');
      expect(newVariant.status).toBe('production');
    });

    it('throws when variant does not exist', async () => {
      const { promoteVariant } = await import('../promptEngineering');

      await expect(promoteVariant('nonexistent')).rejects.toThrow('Prompt variant not found');
    });
  });

  // ── rollbackToVersion ──────────────────────────────────────────────────────

  describe('rollbackToVersion', () => {
    it('restores the target version to production', async () => {
      const { rollbackToVersion } = await import('../promptEngineering');

      const v1 = makeVariant({ id: 'pv-v1', version: 1, status: 'deprecated', basePromptId: 'base-rb' });
      const v2 = makeVariant({ id: 'pv-v2', version: 2, status: 'production', basePromptId: 'base-rb' });
      variants.push(v1, v2);

      await rollbackToVersion('base-rb', 1);

      expect(v1.status).toBe('production');
      expect(v2.status).toBe('deprecated');
    });

    it('throws when the target version does not exist', async () => {
      const { rollbackToVersion } = await import('../promptEngineering');

      await expect(rollbackToVersion('base-missing', 99)).rejects.toThrow('Prompt variant not found');
    });

    it('sets deprecatedAt to null on the restored variant', async () => {
      const { rollbackToVersion } = await import('../promptEngineering');

      const v1 = makeVariant({
        id: 'pv-rb1',
        version: 1,
        status: 'deprecated',
        basePromptId: 'base-rb2',
        deprecatedAt: new Date('2024-01-01'),
      });
      variants.push(v1);

      await rollbackToVersion('base-rb2', 1);

      expect(v1.deprecatedAt).toBeNull();
    });
  });

  // ── evaluateTest ───────────────────────────────────────────────────────────

  describe('evaluateTest', () => {
    it('returns inconclusive when sample size is too small', async () => {
      const { evaluateTest } = await import('../promptEngineering');

      const control = makeVariant({
        id: 'ctrl-1',
        basePromptId: 'base-eval',
        version: 1,
        status: 'production',
        performance: { sampleSize: 5, successRate: 0.5, qualityScore: 70, costPerCall: 0.01 },
      });
      const test = makeVariant({
        id: 'test-1',
        basePromptId: 'base-eval',
        version: 2,
        status: 'testing',
        abTestId: `abtest_ctrl-1_test-1_12345`,
        performance: { sampleSize: 5, successRate: 0.6, qualityScore: 75, costPerCall: 0.01 },
      });
      variants.push(control, test);

      const result = await evaluateTest('abtest_ctrl-1_test-1_12345');

      // With only 5 samples each, the result should be inconclusive
      expect(result.testId).toBe('abtest_ctrl-1_test-1_12345');
      expect(result.winner).toBe('inconclusive');
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('computes improvement delta correctly', async () => {
      const { evaluateTest } = await import('../promptEngineering');

      const control = makeVariant({
        id: 'ctrl-2',
        basePromptId: 'base-eval2',
        version: 1,
        status: 'production',
        performance: { sampleSize: 200, successRate: 0.4, qualityScore: 70, costPerCall: 0.01 },
      });
      const test = makeVariant({
        id: 'test-2',
        basePromptId: 'base-eval2',
        version: 2,
        status: 'testing',
        abTestId: 'abtest_ctrl-2_test-2_99999',
        performance: { sampleSize: 200, successRate: 0.6, qualityScore: 80, costPerCall: 0.01 },
      });
      variants.push(control, test);

      const result = await evaluateTest('abtest_ctrl-2_test-2_99999');

      // 0.6 vs 0.4 = 50% improvement
      expect(result.improvement).toBeCloseTo(0.5, 1);
      expect(result.controlMetric).toBe(0.4);
      expect(result.testMetric).toBe(0.6);
    });

    it('throws when test ID is not found', async () => {
      const { evaluateTest } = await import('../promptEngineering');

      await expect(evaluateTest('nonexistent-test')).rejects.toThrow('A/B test not found');
    });
  });

  // ── generateWeeklyReport ───────────────────────────────────────────────────

  describe('generateWeeklyReport', () => {
    it('returns a report with all required fields', async () => {
      const { generateWeeklyReport } = await import('../promptEngineering');

      const report = await generateWeeklyReport();

      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('totalVariantsTested');
      expect(report).toHaveProperty('promoted');
      expect(report).toHaveProperty('rolledBack');
      expect(report).toHaveProperty('averageImprovementPercent');
      expect(report).toHaveProperty('topPerformingVariants');
      expect(report).toHaveProperty('generatedAt');
    });

    it('counts promoted variants correctly', async () => {
      const { generateWeeklyReport } = await import('../promptEngineering');

      const now = new Date();
      variants.push(
        makeVariant({ id: 'r1', status: 'production', createdAt: now }),
        makeVariant({ id: 'r2', status: 'production', createdAt: now }),
        makeVariant({ id: 'r3', status: 'draft', createdAt: now }),
      );

      const report = await generateWeeklyReport();

      expect(report.promoted).toBe(2);
      expect(report.totalVariantsTested).toBe(3);
    });
  });
});
