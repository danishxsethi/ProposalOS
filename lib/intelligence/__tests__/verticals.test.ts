/**
 * Unit tests for Vertical Specialization Engine
 *
 * Requirements: 12.1, 12.3, 12.4, 12.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VerticalPlaybook, VerticalPlaybookPerformance, VerticalOutcome } from '../types';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const playbooks: Record<string, unknown>[] = [];
const audits: { businessIndustry: string | null; _count?: number }[] = [];
const winLossRecords: { vertical: string; outcome: string }[] = [];
const prospectLeads: { vertical: string; painScore: number | null }[] = [];

vi.mock('@/lib/db', () => {
  return {
    prisma: {
      verticalPlaybook: {
        findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          let results = [...playbooks];
          if (where?.status) {
            if (typeof where.status === 'object' && where.status !== null && 'not' in (where.status as object)) {
              const notVal = (where.status as Record<string, unknown>).not;
              results = results.filter((p) => p.status !== notVal);
            } else {
              results = results.filter((p) => p.status === where.status);
            }
          }
          if (where?.vertical) results = results.filter((p) => p.vertical === where.vertical);
          return results;
        }),
        findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          let results = [...playbooks];
          if (where?.vertical) results = results.filter((p) => p.vertical === where.vertical);
          if (where?.tenantId === null) results = results.filter((p) => p.tenantId == null);
          return results[0] ?? null;
        }),
        findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          return playbooks.find((p) => p.id === where.id) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: `pb-${Date.now()}-${Math.random()}`, ...data };
          playbooks.push(record);
          return record;
        }),
        update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const pb = playbooks.find((p) => p.id === where.id);
          if (!pb) throw new Error(`Playbook not found: ${where.id}`);
          Object.assign(pb, data);
          return pb;
        }),
      },
      audit: {
        groupBy: vi.fn(async () => {
          // Aggregate audits by businessIndustry
          const counts = new Map<string, number>();
          for (const a of audits) {
            if (a.businessIndustry) {
              counts.set(a.businessIndustry, (counts.get(a.businessIndustry) ?? 0) + 1);
            }
          }
          return [...counts.entries()].map(([businessIndustry, count]) => ({
            businessIndustry,
            _count: { id: count },
          }));
        }),
      },
      winLossRecord: {
        findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          if (where?.vertical) {
            return winLossRecords.filter((r) => r.vertical === where.vertical);
          }
          return [...winLossRecords];
        }),
      },
      prospectLead: {
        findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          if (where?.vertical) {
            return prospectLeads.filter((l) => l.vertical === where.vertical);
          }
          return [...prospectLeads];
        }),
      },
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetDB() {
  playbooks.length = 0;
  audits.length = 0;
  winLossRecords.length = 0;
  prospectLeads.length = 0;
}

function makeOutcomes(
  vertical: string,
  wins: number,
  losses: number,
  dealValue = 1000,
  timeToClose = 14
): VerticalOutcome[] {
  const outcomes: VerticalOutcome[] = [];
  for (let i = 0; i < wins; i++) {
    outcomes.push({
      vertical,
      outcome: 'won',
      findingTypes: ['speed', 'seo'],
      emailTemplateId: 'tmpl-1',
      dealValue,
      timeToClose,
    });
  }
  for (let i = 0; i < losses; i++) {
    outcomes.push({
      vertical,
      outcome: 'lost',
      findingTypes: ['speed'],
    });
  }
  return outcomes;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Vertical Specialization Engine', () => {
  beforeEach(() => {
    resetDB();
    vi.clearAllMocks();
  });

  // ── detectEmergingVerticals ────────────────────────────────────────────────

  describe('detectEmergingVerticals', () => {
    it('returns verticals with prospect count >= threshold', async () => {
      const { detectEmergingVerticals } = await import('../verticalSpecialization');

      // Add audits for two verticals
      for (let i = 0; i < 10; i++) audits.push({ businessIndustry: 'roofing' });
      for (let i = 0; i < 3; i++) audits.push({ businessIndustry: 'landscaping' });

      const emerging = await detectEmergingVerticals(5);

      expect(emerging.some((e) => e.vertical === 'roofing')).toBe(true);
      expect(emerging.some((e) => e.vertical === 'landscaping')).toBe(false);
    });

    it('does not return verticals that already have a non-deprecated playbook', async () => {
      const { detectEmergingVerticals } = await import('../verticalSpecialization');

      // Add existing playbook for 'roofing'
      playbooks.push({ id: 'pb-1', vertical: 'roofing', status: 'production', config: {}, performance: {} });

      // Add audits for roofing
      for (let i = 0; i < 20; i++) audits.push({ businessIndustry: 'roofing' });

      const emerging = await detectEmergingVerticals(5);
      expect(emerging.some((e) => e.vertical === 'roofing')).toBe(false);
    });

    it('returns verticals below threshold as empty', async () => {
      const { detectEmergingVerticals } = await import('../verticalSpecialization');

      for (let i = 0; i < 2; i++) audits.push({ businessIndustry: 'plumbing' });

      const emerging = await detectEmergingVerticals(5);
      expect(emerging.some((e) => e.vertical === 'plumbing')).toBe(false);
    });
  });

  // ── generatePlaybook ───────────────────────────────────────────────────────

  describe('generatePlaybook', () => {
    it('produces a playbook with all required config fields', async () => {
      const { generatePlaybook } = await import('../verticalSpecialization');

      const outcomes = makeOutcomes('dentistry', 20, 10);
      const playbook = await generatePlaybook('dentistry', outcomes);

      expect(playbook.vertical).toBe('dentistry');
      expect(playbook.config).toBeDefined();
      expect(playbook.config.effectiveFindings).toBeDefined();
      expect(playbook.config.emailTemplates).toBeDefined();
      expect(playbook.config.pricingStrategy).toBeDefined();
      expect(playbook.config.pricingStrategy.essentials).toBeDefined();
      expect(playbook.config.pricingStrategy.growth).toBeDefined();
      expect(playbook.config.pricingStrategy.premium).toBeDefined();
      expect(playbook.config.commonObjections).toBeDefined();
      expect(playbook.config.industryTerms).toBeDefined();
    });

    it('computes correct win rate in performance', async () => {
      const { generatePlaybook } = await import('../verticalSpecialization');

      const outcomes = makeOutcomes('hvac', 30, 10); // 75% win rate
      const playbook = await generatePlaybook('hvac', outcomes);

      expect(playbook.performance.winRate).toBeCloseTo(0.75, 2);
      expect(playbook.performance.sampleSize).toBe(40);
    });

    it('sets status to emerging for new playbooks', async () => {
      const { generatePlaybook } = await import('../verticalSpecialization');

      const outcomes = makeOutcomes('plumbing', 5, 5);
      const playbook = await generatePlaybook('plumbing', outcomes);

      expect(playbook.status).toBe('emerging');
    });

    it('ranks effective findings by frequency', async () => {
      const { generatePlaybook } = await import('../verticalSpecialization');

      const outcomes: VerticalOutcome[] = [
        { vertical: 'legal', outcome: 'won', findingTypes: ['speed', 'seo', 'speed'] },
        { vertical: 'legal', outcome: 'won', findingTypes: ['speed', 'gbp'] },
        { vertical: 'legal', outcome: 'lost', findingTypes: ['seo'] },
      ];
      const playbook = await generatePlaybook('legal', outcomes);

      // 'speed' appears most often
      expect(playbook.config.effectiveFindings[0].type).toBe('speed');
    });
  });

  // ── promotePlaybook ────────────────────────────────────────────────────────

  describe('promotePlaybook', () => {
    it('rejects promotion when improvement threshold is not met', async () => {
      const { generatePlaybook, startABTest, promotePlaybook } = await import('../verticalSpecialization');

      // Control: 50% win rate
      const controlOutcomes = makeOutcomes('auto_repair', 50, 50);
      const control = await generatePlaybook('auto_repair', controlOutcomes);

      // Test: 52% win rate — below 10% improvement threshold
      const testOutcomes = makeOutcomes('auto_repair_v2', 52, 48);
      const testPlaybook = await generatePlaybook('auto_repair_v2', testOutcomes);

      await startABTest(testPlaybook.id, control.id);

      await expect(promotePlaybook(testPlaybook.id)).rejects.toThrow();
    });

    it('promotes playbook when it clearly outperforms control', async () => {
      const { generatePlaybook, startABTest, promotePlaybook, listPlaybooks } = await import('../verticalSpecialization');

      // Control: 30% win rate with large sample
      const controlOutcomes = makeOutcomes('roofing_ctrl', 90, 210); // 30%
      const control = await generatePlaybook('roofing_ctrl', controlOutcomes);

      // Test: 45% win rate with large sample (50% improvement)
      const testOutcomes = makeOutcomes('roofing_test', 135, 165); // 45%
      const testPlaybook = await generatePlaybook('roofing_test', testOutcomes);

      await startABTest(testPlaybook.id, control.id);
      await promotePlaybook(testPlaybook.id);

      const promoted = playbooks.find((p) => p.id === testPlaybook.id);
      expect(promoted?.status).toBe('production');
    });

    it('throws when playbook has no A/B test', async () => {
      const { generatePlaybook, promotePlaybook } = await import('../verticalSpecialization');

      const outcomes = makeOutcomes('landscaping', 10, 10);
      const playbook = await generatePlaybook('landscaping', outcomes);

      await expect(promotePlaybook(playbook.id)).rejects.toThrow('no associated A/B test');
    });
  });

  // ── optimizePlaybook ───────────────────────────────────────────────────────

  describe('optimizePlaybook', () => {
    it('updates performance metrics after new outcomes', async () => {
      const { generatePlaybook, optimizePlaybook } = await import('../verticalSpecialization');

      // Initial: 50% win rate, 100 samples
      const initial = makeOutcomes('accounting', 50, 50, 2000, 21);
      const playbook = await generatePlaybook('accounting', initial);

      expect(playbook.performance.winRate).toBeCloseTo(0.5, 2);

      // New outcomes: 80% win rate, 50 samples
      const newOutcomes = makeOutcomes('accounting_new', 40, 10, 3000, 14);
      const optimized = await optimizePlaybook(playbook.id, newOutcomes);

      // Weighted merge: (0.5 * 100 + 0.8 * 50) / 150 ≈ 0.6
      expect(optimized.performance.winRate).toBeGreaterThan(0.5);
      expect(optimized.performance.sampleSize).toBe(150);
    });

    it('increases sample size after optimization', async () => {
      const { generatePlaybook, optimizePlaybook } = await import('../verticalSpecialization');

      const initial = makeOutcomes('insurance', 20, 20);
      const playbook = await generatePlaybook('insurance', initial);

      const newOutcomes = makeOutcomes('insurance_new', 10, 10);
      const optimized = await optimizePlaybook(playbook.id, newOutcomes);

      expect(optimized.performance.sampleSize).toBe(60);
    });

    it('throws when playbook does not exist', async () => {
      const { optimizePlaybook } = await import('../verticalSpecialization');

      await expect(
        optimizePlaybook('nonexistent-id', makeOutcomes('x', 5, 5))
      ).rejects.toThrow('Playbook not found');
    });
  });

  // ── listPlaybooks ──────────────────────────────────────────────────────────

  describe('listPlaybooks', () => {
    it('returns all playbooks when no filters applied', async () => {
      const { generatePlaybook, listPlaybooks } = await import('../verticalSpecialization');

      await generatePlaybook('dentistry', makeOutcomes('dentistry', 10, 10));
      await generatePlaybook('hvac', makeOutcomes('hvac', 10, 10));

      const all = await listPlaybooks();
      expect(all.length).toBe(2);
    });

    it('filters by status', async () => {
      const { generatePlaybook, listPlaybooks } = await import('../verticalSpecialization');

      await generatePlaybook('dentistry', makeOutcomes('dentistry', 10, 10));
      // Manually set one to production
      playbooks[0].status = 'production';

      const production = await listPlaybooks({ status: 'production' });
      expect(production.length).toBe(1);
      expect(production[0].status).toBe('production');
    });

    it('filters by minWinRate', async () => {
      const { generatePlaybook, listPlaybooks } = await import('../verticalSpecialization');

      await generatePlaybook('dentistry', makeOutcomes('dentistry', 80, 20)); // 80%
      await generatePlaybook('hvac', makeOutcomes('hvac', 20, 80)); // 20%

      const highWinRate = await listPlaybooks({ minWinRate: 0.5 });
      expect(highWinRate.length).toBe(1);
      expect(highWinRate[0].vertical).toBe('dentistry');
    });
  });
});
