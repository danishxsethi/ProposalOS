/**
 * Baseline correction (pre-existing defect, not a Wave 1 finding): lib/audit/runner.ts's
 * BUDGET_EXCEEDED branch wrote `error: 'BUDGET_EXCEEDED'` directly on the Audit row, but
 * the Prisma `Audit` model has no `error` scalar column (TS2353 at clean HEAD `dc6591a`).
 * The correct, already-established shape for recording a module failure is the
 * `modulesFailed: Json` array (`{ module, error }[]`), as used by the per-module FAILED
 * branch in this same file, app/api/analytics/route.ts's reader, and the retry/blitz
 * scripts. This test proves the fix writes only schema-valid fields, keeps
 * BUDGET_EXCEEDED observable, reaches a terminal status, and merges rather than
 * discards any module failures already recorded on the row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findUnique: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
    },
    evidenceSnapshot: { create: vi.fn() },
  },
}));
vi.mock('@/lib/cache/redisCache', () => ({
  redisCache: { get: vi.fn(() => Promise.resolve(null)), set: vi.fn(() => Promise.resolve()) },
}));
vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class {
    getTotalCents() {
      return 0;
    }
    getReport() {
      return {};
    }
    complete() {}
    addApiCall() {}
    addLlmCall() {}
  },
  reserveAuditBudget: vi.fn(() => Promise.resolve({ allowed: false, reservedCents: 0 })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/metrics', () => ({
  Metrics: { increment: vi.fn() },
}));
vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/observability/context', () => ({
  withChildObservabilityContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({
  MetricsRecorder: { auditRun: vi.fn() },
}));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn(() => Promise.resolve({})) }));
vi.mock('langsmith', () => ({ RunTree: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { runAudit } from '@/lib/audit/runner';

function baseAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    tenantId: 'tenant-1',
    businessUrl: 'https://example.com',
    businessName: 'Acme',
    businessCity: 'Austin',
    businessIndustry: 'General',
    modulesFailed: [],
    ...overrides,
  };
}

function findFailedUpdateCall() {
  const calls = (prisma.audit.update as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls.find(
    ([args]) => (args as { data?: { status?: string } }).data?.status === 'FAILED'
  ) as [{ data: Record<string, unknown> }] | undefined;
}

describe('runAudit — BUDGET_EXCEEDED write shape (baseline repair)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes only schema-valid Audit fields and stays observable/terminal', async () => {
    (
      prisma.audit.findUnique as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(baseAudit());

    const result = await runAudit('audit-1');

    expect(result).toEqual({
      success: false,
      auditId: 'audit-1',
      status: 'FAILED',
      error: 'BUDGET_EXCEEDED',
      modulesCompleted: [],
      modulesFailed: [{ module: 'budget', status: 'FAILED', error: 'BUDGET_EXCEEDED' }],
      findingsCount: 0,
      duration_ms: 0,
      costCents: 0,
      apiCostCents: 0,
    });

    const call = findFailedUpdateCall();
    expect(call).toBeDefined();
    const data = call![0].data;

    // No invalid `error` scalar column — this is the exact defect being fixed.
    expect(data).not.toHaveProperty('error');
    // Terminal, observable state.
    expect(data.status).toBe('FAILED');
    expect(data.completedAt).toBeInstanceOf(Date);
    // BUDGET_EXCEEDED remains persistently observable via modulesFailed.
    expect(data.modulesFailed).toEqual([{ module: 'budget', error: 'BUDGET_EXCEEDED' }]);
  });

  it('merges into pre-existing modulesFailed instead of discarding them', async () => {
    (
      prisma.audit.findUnique as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(baseAudit({ modulesFailed: [{ module: 'seoDeep', error: 'timeout' }] }));

    await runAudit('audit-1');

    const call = findFailedUpdateCall();
    expect(call![0].data.modulesFailed).toEqual([
      { module: 'seoDeep', error: 'timeout' },
      { module: 'budget', error: 'BUDGET_EXCEEDED' },
    ]);
  });
});
