/**
 * P1-17 regression tests: /api/predictions must be authenticated and tenant-scoped
 * exclusively from validated auth context, never from client-supplied tenantId.
 */
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockGetTenantId, mockRunWithTenantAsync } = vi.hoisted(() => ({
  mockPrisma: {
    prediction: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
  mockGetTenantId: vi.fn(),
  mockRunWithTenantAsync: vi.fn(async (_tenantId: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mockGetTenantId,
  runWithTenantAsync: mockRunWithTenantAsync,
}));
// withAuth/withRole just call handler directly in this unit test — auth boundary itself
// is covered by tests/security/wave0-*.test.ts; here we test the route's own logic.
vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: (req: Request) => Promise<NextResponse>) => handler,
}));
vi.mock('@/lib/middleware/withRole', () => ({
  withRole: (_role: string, handler: (req: Request) => Promise<NextResponse>) => handler,
}));

import { GET, POST } from '@/app/api/predictions/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockRunWithTenantAsync.mockImplementation(async (_tenantId: string, fn: () => Promise<unknown>) =>
    fn()
  );
});

function makeGetRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function makePostRequest(body: unknown): Request {
  return new Request('https://example.com/api/predictions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('P1-17: GET /api/predictions', () => {
  it('returns 401 when no tenant context is established (anonymous)', async () => {
    mockGetTenantId.mockResolvedValue(null);

    const res = await GET(makeGetRequest('https://example.com/api/predictions'));

    expect(res.status).toBe(401);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied tenantId query param and scopes to the real session tenant', async () => {
    mockGetTenantId.mockResolvedValue('real-tenant');
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    await GET(
      makeGetRequest('https://example.com/api/predictions?tenantId=attacker-supplied-tenant')
    );

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'real-tenant' }) })
    );
    // Never the attacker-supplied value.
    const call = mockPrisma.prediction.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe('real-tenant');
    expect(call.where.tenantId).not.toBe('attacker-supplied-tenant');
  });

  it('scopes the query inside runWithTenantAsync with the real tenant', async () => {
    mockGetTenantId.mockResolvedValue('real-tenant');
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    await GET(makeGetRequest('https://example.com/api/predictions'));

    expect(mockRunWithTenantAsync).toHaveBeenCalledWith('real-tenant', expect.any(Function));
  });
});

describe('P1-17: POST /api/predictions', () => {
  it('returns 401 when no tenant context is established', async () => {
    mockGetTenantId.mockResolvedValue(null);

    const res = await POST(
      makePostRequest({
        predictionType: 'close_prob',
        predictedValue: 0.5,
        confidenceIntervalLower: 0.4,
        confidenceIntervalUpper: 0.6,
        tenantId: 'attacker-supplied-tenant',
      })
    );

    expect(res.status).toBe(401);
    expect(mockPrisma.prediction.create).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied tenantId in the body and writes the real session tenant', async () => {
    mockGetTenantId.mockResolvedValue('real-tenant');
    mockPrisma.prediction.create.mockResolvedValue({ id: 'pred-1' });

    await POST(
      makePostRequest({
        predictionType: 'close_prob',
        predictedValue: 0.5,
        confidenceIntervalLower: 0.4,
        confidenceIntervalUpper: 0.6,
        tenantId: 'attacker-supplied-tenant',
      })
    );

    const call = mockPrisma.prediction.create.mock.calls[0][0];
    expect(call.data.tenantId).toBe('real-tenant');
  });

  it('rejects malformed input (missing predictionType)', async () => {
    mockGetTenantId.mockResolvedValue('real-tenant');

    const res = await POST(
      makePostRequest({
        predictedValue: 0.5,
        confidenceIntervalLower: 0.4,
        confidenceIntervalUpper: 0.6,
      })
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.prediction.create).not.toHaveBeenCalled();
  });

  it('rejects malformed input (non-numeric predictedValue)', async () => {
    mockGetTenantId.mockResolvedValue('real-tenant');

    const res = await POST(
      makePostRequest({
        predictionType: 'close_prob',
        predictedValue: 'not-a-number',
        confidenceIntervalLower: 0.4,
        confidenceIntervalUpper: 0.6,
      })
    );

    expect(res.status).toBe(400);
  });
});
