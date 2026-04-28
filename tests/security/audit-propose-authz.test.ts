// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateApiKey: vi.fn(),
  auditFindFirst: vi.fn(),
  auditUpdate: vi.fn(),
  proposalCreate: vi.fn(),
  proposalTemplateFindFirst: vi.fn(),
  evidenceFindMany: vi.fn(),
  invokeDiagnosisGraphWithTimeout: vi.fn(),
  invokeProposalGraphWithTimeout: vi.fn(),
  runAutoQA: vi.fn(),
  createParentTrace: vi.fn(),
  detectVertical: vi.fn(),
  getPlaybook: vi.fn(),
  generateComparison: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/auth/apiKeys', () => ({
  validateApiKey: mocks.validateApiKey,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
  logError: mocks.logError,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findFirst: mocks.auditFindFirst,
      update: mocks.auditUpdate,
    },
    proposal: {
      create: mocks.proposalCreate,
    },
    proposalTemplate: {
      findFirst: mocks.proposalTemplateFindFirst,
    },
    evidenceSnapshot: {
      findMany: mocks.evidenceFindMany,
    },
  },
}));

vi.mock('@/lib/analysis/competitorComparison', () => ({
  generateComparison: mocks.generateComparison,
}));

vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class CostTracker {
    getTotalCents() {
      return 7;
    }
  },
}));

vi.mock('@/lib/graph/diagnosis-graph', () => ({
  invokeDiagnosisGraphWithTimeout: mocks.invokeDiagnosisGraphWithTimeout,
}));

vi.mock('@/lib/graph/proposal-graph', () => ({
  invokeProposalGraphWithTimeout: mocks.invokeProposalGraphWithTimeout,
}));

vi.mock('@/lib/playbooks', () => ({
  detectVertical: mocks.detectVertical,
  getPlaybook: mocks.getPlaybook,
}));

vi.mock('@/lib/qa/autoQA', () => ({
  runAutoQA: mocks.runAutoQA,
}));

vi.mock('@/lib/tracing', () => ({
  createParentTrace: mocks.createParentTrace,
}));

import { POST } from '@/app/api/audit/[id]/propose/route';

describe('audit propose authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue(null);
    mocks.detectVertical.mockReturnValue('general');
    mocks.getPlaybook.mockReturnValue({ id: 'general' });
    mocks.proposalTemplateFindFirst.mockResolvedValue(null);
    mocks.evidenceFindMany.mockResolvedValue([]);
    mocks.invokeDiagnosisGraphWithTimeout.mockResolvedValue({
      clusters: [{ findingIds: ['finding-1'] }],
      validation: { valid: true },
    });
    mocks.invokeProposalGraphWithTimeout.mockResolvedValue({
      proposalDef: {
        executiveSummary: 'Summary',
        tiers: { essentials: {}, growth: {}, premium: {} },
        pricing: { essentials: 100, growth: 200, premium: 300 },
        assumptions: [],
        disclaimers: [],
        nextSteps: [],
      },
    });
    mocks.runAutoQA.mockReturnValue({
      score: 95,
      passedChecks: 6,
      warnings: [],
      results: [],
      totalChecks: 6,
      needsReview: false,
      clientPerfect: {
        score: 92,
        hardFails: [],
        requiresHumanReview: false,
      },
    });
    mocks.createParentTrace.mockResolvedValue(undefined);
    mocks.auditUpdate.mockResolvedValue({});
    mocks.proposalCreate.mockResolvedValue({
      id: 'proposal-1',
      webLinkToken: 'token-1',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/audit/audit-1/propose', { method: 'POST' }), {
      params: Promise.resolve({ id: 'audit-1' }),
    });

    expect(response.status).toBe(401);
    expect(mocks.auditFindFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when the audit belongs to a different tenant', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'owner@example.com', tenantId: 'tenant-a' },
    });
    mocks.auditFindFirst.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/audit/audit-2/propose', { method: 'POST' }), {
      params: Promise.resolve({ id: 'audit-2' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.auditFindFirst).toHaveBeenCalledWith({
      where: { id: 'audit-2', tenantId: 'tenant-a' },
      include: {
        findings: true,
        proposals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        evidence: {
          where: { module: 'competitor' },
          orderBy: { collectedAt: 'desc' },
          take: 1,
        },
      },
    });
  });

  it('creates a proposal for the same tenant', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'owner@example.com', tenantId: 'tenant-a' },
    });
    mocks.auditFindFirst.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-a',
      businessName: 'Acme Dental',
      businessIndustry: 'Dental',
      businessCity: 'Regina',
      businessUrl: null,
      findings: [
        {
          id: 'finding-1',
          title: 'Slow site',
          category: 'Performance',
          module: 'performance',
        },
      ],
      proposals: [],
      evidence: [],
    });

    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      {
        params: Promise.resolve({ id: 'audit-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      auditId: 'audit-1',
      proposalId: 'proposal-1',
      webLinkToken: 'token-1',
    });
    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditId: 'audit-1',
          tenantId: 'tenant-a',
        }),
      })
    );
    expect(mocks.auditUpdate).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: {
        apiCostCents: { increment: 7 },
      },
    });
  });
});
