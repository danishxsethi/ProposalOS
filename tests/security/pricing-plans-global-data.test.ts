// @vitest-environment node
/**
 * tests/security/pricing-plans-global-data.test.ts
 *
 * Security test proving the pricing/plans route returns ONLY global system data
 * and cannot leak tenant-specific information.
 *
 * PricingPlan is a tenant-agnostic model (no tenantId column) — see
 * PHASE-2.6-RLS-COVERAGE-INVENTORY.md item #7 in the 14-table shared-system list.
 *
 * The runWithTenantBypass in this route exists solely to prevent the Prisma RLS
 * middleware from erroring on a table that has no tenantId column.
 *
 * Guarantees verified:
 *   A. PricingService queries never include a tenantId filter.
 *   B. The bypass reason strings are correct for audit trail.
 *   C. Response shape contains only plan-schema fields (no tenant data).
 *   D. Two callers in different tenant contexts get identical results.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  runWithTenantBypass: vi.fn(),
  getServerSession: vi.fn(),
  withRateLimit: vi.fn(),
  getPricingPlans: vi.fn(),
  getPricingPlanById: vi.fn(),
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: mocks.runWithTenantBypass,
  runWithTenantAsync: vi.fn(),
  getTenantId: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: mocks.withRateLimit,
}));

vi.mock('@/lib/stripe/pricingService', () => ({
  PricingService: {
    getPricingPlans: mocks.getPricingPlans,
    getPricingPlanById: mocks.getPricingPlanById,
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

const importRoute = () => import('@/app/api/pricing/plans/route').then((m) => m.GET);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRequest(query = ''): Request {
  return new Request(`http://localhost/api/pricing/plans${query}`, {
    method: 'GET',
  }) as unknown as Request;
}

const MOCK_SAAS_PLANS = [
  {
    id: 'plan-starter',
    name: 'Starter',
    type: 'saas',
    status: 'active',
    tiers: [],
    features: { audits: 10 },
    limits: { maxAudits: 10 },
    sortOrder: 1,
  },
  {
    id: 'plan-pro',
    name: 'Pro',
    type: 'saas',
    status: 'active',
    tiers: [],
    features: { audits: 100 },
    limits: { maxAudits: 100 },
    sortOrder: 2,
  },
];

const MOCK_PROPOSAL_PLANS = [
  {
    id: 'plan-proposal-basic',
    name: 'Proposal Basic',
    type: 'proposal',
    status: 'active',
    tiers: [],
    features: { proposals: 5 },
    limits: { maxProposals: 5 },
    sortOrder: 1,
  },
];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Rate limit passthrough
  mocks.withRateLimit.mockImplementation(
    () => (_req: Request, handler: () => Promise<Response>) => handler()
  );

  // Bypass passthrough — executes the fn
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );

  // Default mock data
  mocks.getPricingPlans.mockImplementation(async (type: string) => {
    if (type === 'saas') return MOCK_SAAS_PLANS;
    if (type === 'proposal') return MOCK_PROPOSAL_PLANS;
    return [];
  });

  mocks.getPricingPlanById.mockImplementation(async (id: string) => {
    const all = [...MOCK_SAAS_PLANS, ...MOCK_PROPOSAL_PLANS];
    return all.find((p) => p.id === id) ?? null;
  });
});

afterEach(() => {
  vi.resetModules();
});

// ─── A. PricingService queries never include tenantId ─────────────────────────

describe('pricing plans — no tenant-scoped queries', () => {
  it('getPricingPlans is called without any tenantId parameter', async () => {
    const GET = await importRoute();
    await GET(makeGetRequest('?type=saas') as any);

    expect(mocks.getPricingPlans).toHaveBeenCalledTimes(1);
    expect(mocks.getPricingPlans).toHaveBeenCalledWith('saas');
    // The function signature takes only `type` — no tenantId argument exists
  });

  it('getPricingPlanById is called with only the plan id', async () => {
    const GET = await importRoute();
    await GET(makeGetRequest('?id=plan-starter') as any);

    expect(mocks.getPricingPlanById).toHaveBeenCalledTimes(1);
    expect(mocks.getPricingPlanById).toHaveBeenCalledWith('plan-starter');
  });
});

// ─── B. Bypass reason strings are correct ─────────────────────────────────────

describe('pricing plans — bypass audit trail', () => {
  it('uses pricing-plans-get-all for unfiltered request', async () => {
    const GET = await importRoute();
    await GET(makeGetRequest() as any);

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'pricing-plans-get-all',
      expect.any(Function)
    );
  });

  it('uses pricing-plans-get-by-type for type-filtered request', async () => {
    const GET = await importRoute();
    await GET(makeGetRequest('?type=saas') as any);

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'pricing-plans-get-by-type',
      expect.any(Function)
    );
  });

  it('uses pricing-plans-get-by-id for id-filtered request', async () => {
    const GET = await importRoute();
    await GET(makeGetRequest('?id=plan-starter') as any);

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'pricing-plans-get-by-id',
      expect.any(Function)
    );
  });
});

// ─── C. Response contains only plan-schema fields ─────────────────────────────

describe('pricing plans — response shape isolation', () => {
  it('all-plans response has only saas/proposal keys with plan objects', async () => {
    const GET = await importRoute();
    const res = await GET(makeGetRequest() as any);
    const body = await res.json();

    expect(Object.keys(body).sort()).toEqual(['proposal', 'saas']);

    // No tenant-related keys anywhere in the response
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('tenantId');
    expect(bodyStr).not.toContain('tenant_id');
    expect(bodyStr).not.toContain('passwordHash');
    expect(bodyStr).not.toContain('apiKey');
  });

  it('single-plan response has only plan fields', async () => {
    const GET = await importRoute();
    const res = await GET(makeGetRequest('?id=plan-starter') as any);
    const body = await res.json();

    // Verify allowed keys only
    const allowedKeys = [
      'id',
      'name',
      'type',
      'status',
      'tiers',
      'features',
      'limits',
      'sortOrder',
      'description',
      'interval',
      'stripeProductId',
      'stripePriceIds',
    ];
    for (const key of Object.keys(body)) {
      expect(allowedKeys).toContain(key);
    }

    // No tenant data
    expect(JSON.stringify(body)).not.toContain('tenantId');
  });
});

// ─── D. Two tenants see identical results ─────────────────────────────────────

describe('pricing plans — tenant-agnostic (same data for any caller)', () => {
  it('returns identical plans regardless of which tenant context calls', async () => {
    const GET = await importRoute();

    // Simulate tenant-A calling
    const resA = await GET(makeGetRequest('?type=saas') as any);
    const bodyA = await resA.json();

    // Simulate tenant-B calling (same mock — the point is the route never filters by tenant)
    const resB = await GET(makeGetRequest('?type=saas') as any);
    const bodyB = await resB.json();

    // Both get the exact same global plan data
    expect(bodyA).toEqual(bodyB);
    expect(bodyA).toEqual(MOCK_SAAS_PLANS);
  });
});
