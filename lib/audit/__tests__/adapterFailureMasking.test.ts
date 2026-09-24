/**
 * Wave 3 (Step 8, AUDIT_REPORT.md Pass 4B): before this wave, `gbpAdapter` and
 * `competitorAdapter` unconditionally returned `ModuleResult.status: 'COMPLETE'` even
 * when the wrapped legacy module reported `status: 'failed'` — a real provider failure
 * (or genuine "not found") was silently reported as a successful module run, which is
 * exactly how a provider outage could end up producing a customer-facing finding.
 *
 * Red-before/green-after: with the fix, a legacy `status: 'failed'` result must produce
 * `ModuleResult.status: 'FAILED'`, which `extractFindingsFromRegistryResult` already
 * refuses to extract any finding from.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/modules/gbp', () => ({ runGBPModule: vi.fn() }));
vi.mock('@/lib/modules/competitor', () => ({ runCompetitorModule: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/cache/redisCache', () => ({ redisCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: vi.fn() }));
vi.mock('@/lib/observability/context', () => ({
  withChildObservabilityContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({ MetricsRecorder: { auditRun: vi.fn() } }));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn(async () => undefined) }));
vi.mock('langsmith', () => ({ RunTree: vi.fn() }));

import { runCompetitorModule } from '@/lib/modules/competitor';
import { runGBPModule } from '@/lib/modules/gbp';

import { MODULE_REGISTRY } from '../runner';

const gbpAdapter = MODULE_REGISTRY.find((m) => m.name === 'gbp')!.run;
const competitorAdapter = MODULE_REGISTRY.find((m) => m.name === 'competitor')!.run;

class FakeCostTracker {
  addApiCall() {}
}

describe('gbpAdapter (Step 8 regression)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports FAILED (not COMPLETE) when the legacy gbp module reports status: failed', async () => {
    vi.mocked(runGBPModule).mockResolvedValue({
      moduleId: 'gbp-audit',
      status: 'failed',
      timestamp: new Date().toISOString(),
      data: null,
      error: 'Business not found: Acme Dental in Springfield',
    } as never);

    const result = await gbpAdapter(
      { auditId: 'a1', tenantId: 't1', businessName: 'Acme Dental', city: 'Springfield' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('FAILED');
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/not found/);
  });

  it('reports COMPLETE with the unwrapped data on a genuine success', async () => {
    vi.mocked(runGBPModule).mockResolvedValue({
      moduleId: 'gbp-audit',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: { placeId: 'abc123', name: 'Acme Dental' },
    } as never);

    const result = await gbpAdapter(
      { auditId: 'a1', tenantId: 't1', businessName: 'Acme Dental', city: 'Springfield' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect((result.data as { placeId: string }).placeId).toBe('abc123');
  });
});

describe('competitorAdapter (Step 8 regression)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports FAILED (not COMPLETE) when the legacy competitor module reports status: failed', async () => {
    vi.mocked(runCompetitorModule).mockResolvedValue({
      moduleId: 'competitor-audit',
      status: 'failed',
      timestamp: new Date().toISOString(),
      costCents: 0,
      data: null,
      error: 'SerpAPI quota exceeded',
    } as never);

    const result = await competitorAdapter(
      { auditId: 'a1', tenantId: 't1', businessName: 'Acme Dental', city: 'Springfield' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/quota/);
  });

  it('reports UNAVAILABLE when the real module says its providers are not configured', async () => {
    vi.mocked(runCompetitorModule).mockResolvedValue({
      moduleId: 'competitor-audit',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        competitorSearchStatus: 'not_configured',
        execution: { state: 'unavailable', reason: 'Missing SerpAPI configuration' },
      },
    } as never);

    const result = await competitorAdapter(
      { auditId: 'a1', tenantId: 't1', businessName: 'Acme Dental', city: 'Springfield' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.error).toMatch(/SERP|provider|unavailable/i);
  });
});
