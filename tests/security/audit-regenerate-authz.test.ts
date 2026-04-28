// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateApiKey: vi.fn(),
  auditFindFirst: vi.fn(),
  evidenceFindMany: vi.fn(),
  proposalCreate: vi.fn(),
  auditUpdate: vi.fn(),
  invokeDiagnosisGraphWithTimeout: vi.fn(),
  runProposalPipeline: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/auth/apiKeys', () => ({
  validateApiKey: mocks.validateApiKey,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findFirst: mocks.auditFindFirst,
      update: mocks.auditUpdate,
    },
    evidenceSnapshot: {
      findMany: mocks.evidenceFindMany,
    },
    proposal: {
      create: mocks.proposalCreate,
    },
  },
}));

vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class CostTracker {
    getTotalCents() {
      return 11;
    }

    getReport() {
      return {};
    }
  },
}));

vi.mock('@/lib/graph/diagnosis-graph', () => ({
  invokeDiagnosisGraphWithTimeout: mocks.invokeDiagnosisGraphWithTimeout,
}));

vi.mock('@/lib/proposal', () => ({
  runProposalPipeline: mocks.runProposalPipeline,
}));

import { POST } from '@/app/api/audit/[id]/regenerate/route';

describe('audit regenerate authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue(null);
    mocks.evidenceFindMany.mockResolvedValue([]);
    mocks.invokeDiagnosisGraphWithTimeout.mockResolvedValue({
      clusters: [{ findingIds: ['finding-1'] }],
    });
    mocks.runProposalPipeline.mockResolvedValue({
      executiveSummary: 'Updated summary',
      tiers: { essentials: {}, growth: {}, premium: {} },
      pricing: { essentials: 100, growth: 200, premium: 300 },
      assumptions: [],
      disclaimers: [],
      nextSteps: [],
    });
    mocks.proposalCreate.mockResolvedValue({
      id: 'proposal-2',
      version: 1,
      webLinkToken: 'token-2',
      executiveSummary: 'Updated summary',
      pricing: { essentials: 100 },
    });
    mocks.auditUpdate.mockResolvedValue({});
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/regenerate', { method: 'POST' }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.auditFindFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when the audit belongs to another tenant', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'owner@example.com', tenantId: 'tenant-a' },
    });
    mocks.auditFindFirst.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/audit/audit-2/regenerate', { method: 'POST' }),
      { params: Promise.resolve({ id: 'audit-2' }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.auditFindFirst).toHaveBeenCalledWith({
      where: { id: 'audit-2', tenantId: 'tenant-a' },
      include: {
        findings: {
          where: { excluded: false },
          orderBy: { impactScore: 'desc' },
        },
        proposals: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
  });

  it('creates a new proposal version for the same tenant', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'owner@example.com', tenantId: 'tenant-a' },
    });
    mocks.auditFindFirst.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-a',
      businessName: 'Acme Dental',
      businessIndustry: 'Dental',
      findings: [{ id: 'finding-1' }],
      proposals: [],
    });

    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/regenerate', { method: 'POST' }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'proposal-2',
      version: 1,
      webLinkToken: 'token-2',
      regenerationsRemaining: 2,
      costCents: 11,
    });
    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditId: 'audit-1',
          tenantId: 'tenant-a',
        }),
      })
    );
  });
});
