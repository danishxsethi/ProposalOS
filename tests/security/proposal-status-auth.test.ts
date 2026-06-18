// @vitest-environment node
/**
 * tests/security/proposal-status-auth.test.ts
 *
 * Auth + tenant-isolation tests for PATCH /api/proposal-status/status [#4].
 *
 * Before the fix, this route had zero auth guards — any unauthenticated
 * caller could attempt to mutate proposal state.
 *
 * Task 1.2 verification criteria:
 *   - unauth (no tenant context) -> 401
 *   - cross-tenant (proposal not under caller's tenant) -> 404
 *
 * The route uses withAuth (sets tenant context) + getTenantId() for the 401
 * guard, and an explicit findFirst({ where: { id, tenantId } }) so a proposal
 * belonging to another tenant is simply not found -> 404.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  getTenantId: vi.fn(),
  proposalFindFirst: vi.fn(),
  proposalUpdate: vi.fn(),
}));

// withAuth passthrough — the route handler runs directly; tenant context is
// simulated via the getTenantId mock.
vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mocks.getTenantId,
  runWithTenantAsync: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    proposal: {
      findFirst: mocks.proposalFindFirst,
      update: mocks.proposalUpdate,
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const importRoute = () => import('@/app/api/proposal-status/status/route').then((m) => m.PATCH);

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/proposal-status/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

// ─── Unauthenticated -> 401 ───────────────────────────────────────────────────

describe('PATCH /api/proposal-status/status — unauthenticated', () => {
  it('returns 401 when there is no tenant context', async () => {
    mocks.getTenantId.mockResolvedValue(null);

    const PATCH = await importRoute();
    const res = await PATCH(makePatchRequest({ id: 'prop-1', status: 'ready' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    // Must not touch the database when unauthenticated
    expect(mocks.proposalFindFirst).not.toHaveBeenCalled();
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });
});

// ─── Cross-tenant -> 404 ──────────────────────────────────────────────────────

describe('PATCH /api/proposal-status/status — cross-tenant isolation', () => {
  it('returns 404 when the proposal belongs to a different tenant', async () => {
    // Caller is authenticated under tenant-A
    mocks.getTenantId.mockResolvedValue('tenant-A');
    // Proposal belongs to tenant-B → findFirst scoped to tenant-A finds nothing
    mocks.proposalFindFirst.mockResolvedValue(null);

    const PATCH = await importRoute();
    const res = await PATCH(makePatchRequest({ id: 'prop-owned-by-B', status: 'ready' }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');

    // The query must be scoped by tenantId (defense-in-depth over RLS)
    expect(mocks.proposalFindFirst).toHaveBeenCalledWith({
      where: { id: 'prop-owned-by-B', tenantId: 'tenant-A' },
    });
    // No update attempted on a foreign-tenant proposal
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });

  it('succeeds (200) for a proposal owned by the caller tenant', async () => {
    mocks.getTenantId.mockResolvedValue('tenant-A');
    mocks.proposalFindFirst.mockResolvedValue({
      id: 'prop-1',
      tenantId: 'tenant-A',
      status: 'draft',
      sentAt: null,
    });
    mocks.proposalUpdate.mockResolvedValue({
      id: 'prop-1',
      status: 'ready',
      sentAt: null,
    });

    const PATCH = await importRoute();
    const res = await PATCH(makePatchRequest({ id: 'prop-1', status: 'ready' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.proposal.status).toBe('ready');
    // Update is also tenant-scoped
    expect(mocks.proposalUpdate).toHaveBeenCalledWith({
      where: { id: 'prop-1', tenantId: 'tenant-A' },
      data: expect.objectContaining({ status: 'ready' }),
    });
  });
});

// ─── Input validation (authenticated) ─────────────────────────────────────────

describe('PATCH /api/proposal-status/status — validation', () => {
  it('returns 400 when id is missing', async () => {
    mocks.getTenantId.mockResolvedValue('tenant-A');

    const PATCH = await importRoute();
    const res = await PATCH(makePatchRequest({ status: 'ready' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing proposal id');
  });

  it('returns 400 for an invalid status value', async () => {
    mocks.getTenantId.mockResolvedValue('tenant-A');

    const PATCH = await importRoute();
    const res = await PATCH(makePatchRequest({ id: 'prop-1', status: 'bogus' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid status');
  });
});
