/**
 * Unit tests for Cross-Tenant Learning
 *
 * Requirements: 11.1, 11.2, 11.4, 11.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  aggregatePatterns,
  getPatterns,
  computeLift,
  ensureAnonymized,
  getModelVersion,
  rollbackModel,
  optOut,
  optIn,
  isOptedOut,
} from '../crossTenantLearning';
import type { AnonymizedOutcome, AnonymizedPattern } from '../types';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => {
  const models: Record<string, unknown>[] = [];
  const tenants: Record<string, unknown>[] = [];

  const sharedIntelligenceModel = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `id-${Date.now()}`, ...data };
      models.push(record);
      return record;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> } = {}) => {
      let results = [...models];
      if (where?.isActive !== undefined) {
        results = results.filter((m) => m.isActive === where.isActive);
      }
      if (where?.version) {
        results = results.filter((m) => m.version === where.version);
      }
      return results[results.length - 1] ?? null;
    }),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return models.find((m) => m.version === where.version) ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      if (!where) return [...models];
      let results = [...models];
      if (where.isActive !== undefined) {
        results = results.filter((m) => m.isActive === where.isActive);
      }
      return results;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const m of models) {
        let match = true;
        if (where.isActive !== undefined && m.isActive !== where.isActive) match = false;
        if (where.version !== undefined) {
          const vf = where.version;
          if (typeof vf === 'object' && vf !== null && 'not' in (vf as object)) {
            // { version: { not: 'v123' } } — exclude records where version === 'v123'
            if (m.version === (vf as Record<string, unknown>).not) match = false;
          } else if (typeof vf === 'string') {
            if (m.version !== vf) match = false;
          }
        }
        if (match) {
          Object.assign(m, data);
          count++;
        }
      }
      return { count };
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const m = models.find((m) => m.version === where.version);
      if (!m) throw new Error('Not found');
      Object.assign(m, data);
      return m;
    }),
    deleteMany: vi.fn(async () => {
      models.length = 0;
      return { count: 0 };
    }),
    _reset: () => { models.length = 0; },
  };

  const tenant = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return tenants.find((t) => t.id === where.id) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `tenant-${Date.now()}`, ...data };
      tenants.push(record);
      return record;
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const t = tenants.find((t) => t.id === where.id);
      if (!t) throw new Error('Tenant not found');
      Object.assign(t, data);
      return t;
    }),
    deleteMany: vi.fn(async () => {
      tenants.length = 0;
      return { count: 0 };
    }),
    _reset: () => { tenants.length = 0; },
    _add: (record: Record<string, unknown>) => { tenants.push(record); },
  };

  const winLossRecord = {
    findMany: vi.fn(async () => []),
  };

  return {
    prisma: { sharedIntelligenceModel, tenant, winLossRecord },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function resetDB() {
  const { prisma } = await import('@/lib/db');
  (prisma.sharedIntelligenceModel as unknown as { _reset: () => void })._reset();
  (prisma.tenant as unknown as { _reset: () => void })._reset();
}

// ── Pure unit tests (no DB required) ──────────────────────────────────────────

describe('ensureAnonymized (pure)', () => {
  it('returns false when email address is present', () => {
    expect(ensureAnonymized({ email: 'user@example.com' })).toBe(false);
  });

  it('returns false when phone number is present', () => {
    expect(ensureAnonymized({ phone: '555-123-4567' })).toBe(false);
  });

  it('returns false when SSN is present', () => {
    expect(ensureAnonymized({ ssn: '123-45-6789' })).toBe(false);
  });

  it('returns false when tenantId field is present', () => {
    expect(ensureAnonymized({ tenantId: 'tenant-abc' })).toBe(false);
  });

  it('returns false when businessName field is present', () => {
    expect(ensureAnonymized({ businessName: 'Acme Corp' })).toBe(false);
  });

  it('returns false when prospectId field is present', () => {
    expect(ensureAnonymized({ prospectId: 'prospect-123' })).toBe(false);
  });

  it('returns true for clean anonymized data', () => {
    expect(
      ensureAnonymized({ vertical: 'dentistry', winRate: 0.65, sampleSize: 100 })
    ).toBe(true);
  });
});

// ── DB-dependent tests (mocked) ────────────────────────────────────────────────

describe('Cross-Tenant Learning', () => {
  beforeEach(async () => {
    await resetDB();
  });

  // ── aggregatePatterns ──────────────────────────────────────────────────────

  describe('aggregatePatterns', () => {
    it('creates a model from outcomes and stores patterns', async () => {
      const outcomes: AnonymizedOutcome[] = [
        { vertical: 'dentistry', geoRegion: 'New York', painScore: 75, outcome: 'won', findingTypes: ['speed', 'seo'] },
        { vertical: 'dentistry', geoRegion: 'New York', painScore: 60, outcome: 'lost', findingTypes: ['speed'] },
        { vertical: 'hvac', geoRegion: 'Chicago', painScore: 80, outcome: 'won', findingTypes: ['gbp'] },
      ];

      await aggregatePatterns(outcomes);

      const patterns = await getPatterns();
      expect(patterns.length).toBe(2); // dentistry/NY and hvac/Chicago
    });

    it('calculates win rate correctly', async () => {
      const outcomes: AnonymizedOutcome[] = [
        { vertical: 'hvac', geoRegion: 'LA', painScore: 70, outcome: 'won', findingTypes: [] },
        { vertical: 'hvac', geoRegion: 'LA', painScore: 75, outcome: 'won', findingTypes: [] },
        { vertical: 'hvac', geoRegion: 'LA', painScore: 60, outcome: 'lost', findingTypes: [] },
        { vertical: 'hvac', geoRegion: 'LA', painScore: 65, outcome: 'lost', findingTypes: [] },
      ];

      await aggregatePatterns(outcomes);

      const patterns = await getPatterns({ vertical: 'hvac' });
      expect(patterns[0].data.winRate).toBe(0.5);
    });

    it('does nothing when outcomes array is empty', async () => {
      await aggregatePatterns([]);
      const patterns = await getPatterns();
      expect(patterns).toHaveLength(0);
    });

    it('deactivates previous model when new one is created', async () => {
      const { prisma } = await import('@/lib/db');

      await aggregatePatterns([
        { vertical: 'dentistry', geoRegion: 'NY', painScore: 75, outcome: 'won', findingTypes: [] },
      ]);

      // Ensure different timestamp for second version
      await new Promise((r) => setTimeout(r, 2));

      await aggregatePatterns([
        { vertical: 'hvac', geoRegion: 'LA', painScore: 70, outcome: 'won', findingTypes: [] },
      ]);

      const activeModels = await prisma.sharedIntelligenceModel.findMany({
        where: { isActive: true },
      });
      expect(activeModels).toHaveLength(1);
    });

    it('strips PII — patterns contain no tenant-identifiable fields', async () => {
      const outcomes: AnonymizedOutcome[] = [
        { vertical: 'dentistry', geoRegion: 'NY', painScore: 75, outcome: 'won', findingTypes: [] },
      ];

      await aggregatePatterns(outcomes);
      const patterns = await getPatterns();

      for (const p of patterns) {
        const pRecord = p as unknown as Record<string, unknown>;
        // Check only the fields that matter — no tenant IDs, business names, contact info
        expect(pRecord).not.toHaveProperty('tenantId');
        expect(pRecord).not.toHaveProperty('businessName');
        expect(pRecord).not.toHaveProperty('email');
        expect(pRecord).not.toHaveProperty('prospectId');
        expect(pRecord).not.toHaveProperty('leadId');
        expect(pRecord).not.toHaveProperty('contactEmail');
        // Verify the pattern only has expected anonymized fields
        expect(p).toHaveProperty('vertical');
        expect(p).toHaveProperty('geoRegion');
        expect(p).toHaveProperty('sampleSize');
        expect(p).toHaveProperty('data');
      }
    });
  });

  // ── getPatterns with filters ───────────────────────────────────────────────

  describe('getPatterns', () => {
    beforeEach(async () => {
      await aggregatePatterns([
        { vertical: 'dentistry', geoRegion: 'New York', painScore: 75, outcome: 'won', findingTypes: [] },
        { vertical: 'dentistry', geoRegion: 'New York', painScore: 60, outcome: 'lost', findingTypes: [] },
        { vertical: 'hvac', geoRegion: 'Chicago', painScore: 80, outcome: 'won', findingTypes: [] },
        { vertical: 'plumbing', geoRegion: 'Houston', painScore: 55, outcome: 'lost', findingTypes: [] },
      ]);
    });

    it('returns all patterns when no filters applied', async () => {
      const patterns = await getPatterns();
      expect(patterns.length).toBe(3);
    });

    it('filters by vertical', async () => {
      const patterns = await getPatterns({ vertical: 'dentistry' });
      expect(patterns).toHaveLength(1);
      expect(patterns[0].vertical).toBe('dentistry');
    });

    it('filters by geoRegion', async () => {
      const patterns = await getPatterns({ geoRegion: 'Chicago' });
      expect(patterns).toHaveLength(1);
      expect(patterns[0].geoRegion).toBe('Chicago');
    });

    it('filters by minSampleSize', async () => {
      const patterns = await getPatterns({ minSampleSize: 2 });
      expect(patterns.every((p) => p.sampleSize >= 2)).toBe(true);
    });

    it('returns empty array when no model exists', async () => {
      await resetDB();
      const patterns = await getPatterns();
      expect(patterns).toHaveLength(0);
    });
  });

  // ── computeLift ────────────────────────────────────────────────────────────

  describe('computeLift', () => {
    it('returns valid numeric comparison with withSharedLearning and withoutSharedLearning', async () => {
      const lift = await computeLift('any-tenant-id');

      expect(typeof lift.withSharedLearning).toBe('number');
      expect(typeof lift.withoutSharedLearning).toBe('number');
      expect(typeof lift.liftPercent).toBe('number');
      expect(lift.withSharedLearning).toBeGreaterThanOrEqual(0);
      expect(lift.withSharedLearning).toBeLessThanOrEqual(1);
      expect(lift.withoutSharedLearning).toBeGreaterThanOrEqual(0);
      expect(lift.withoutSharedLearning).toBeLessThanOrEqual(1);
    });

    it('returns zero lift when no model exists', async () => {
      const lift = await computeLift('any-tenant-id');
      expect(lift.liftPercent).toBe(0);
    });
  });

  // ── getModelVersion / rollbackModel ───────────────────────────────────────

  describe('getModelVersion and rollbackModel', () => {
    it('returns "none" when no model exists', async () => {
      const version = await getModelVersion();
      expect(version).toBe('none');
    });

    it('returns the active model version after aggregation', async () => {
      await aggregatePatterns([
        { vertical: 'dentistry', geoRegion: 'NY', painScore: 75, outcome: 'won', findingTypes: [] },
      ]);
      const version = await getModelVersion();
      expect(version).not.toBe('none');
      expect(version).toMatch(/^v\d+$/);
    });

    it('rolls back to a previous version', async () => {
      await aggregatePatterns([
        { vertical: 'dentistry', geoRegion: 'NY', painScore: 75, outcome: 'won', findingTypes: [] },
      ]);
      const v1 = await getModelVersion();

      // Ensure different timestamp for v2
      await new Promise((r) => setTimeout(r, 2));

      await aggregatePatterns([
        { vertical: 'hvac', geoRegion: 'LA', painScore: 70, outcome: 'won', findingTypes: [] },
      ]);
      const v2 = await getModelVersion();
      expect(v2).not.toBe(v1);

      await rollbackModel(v1);
      const current = await getModelVersion();
      expect(current).toBe(v1);
    });

    it('throws when rolling back to a non-existent version', async () => {
      await expect(rollbackModel('v-nonexistent')).rejects.toThrow('Model version not found');
    });
  });

  // ── optOut / optIn ─────────────────────────────────────────────────────────

  describe('optOut and optIn', () => {
    let tenantId: string;

    beforeEach(async () => {
      const { prisma } = await import('@/lib/db');
      const tenant = await prisma.tenant.create({
        data: { name: 'Test Agency', settings: {} },
      });
      tenantId = tenant.id as string;
    });

    it('opted-out tenant is excluded from aggregation check', async () => {
      await optOut(tenantId);
      expect(await isOptedOut(tenantId)).toBe(true);
    });

    it('opted-in tenant is included in aggregation', async () => {
      await optOut(tenantId);
      await optIn(tenantId);
      expect(await isOptedOut(tenantId)).toBe(false);
    });

    it('new tenants are opted in by default', async () => {
      expect(await isOptedOut(tenantId)).toBe(false);
    });
  });
});
