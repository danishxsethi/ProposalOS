// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEvidence } from '@/lib/modules/types';
import { buildProposalGrounding } from '@/lib/proposal/grounding';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateApiKey: vi.fn(),
  auditFindFirst: vi.fn(),
  auditUpdate: vi.fn(),
  proposalCreate: vi.fn(),
  compileProposal: vi.fn(),
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
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
  logError: vi.fn(),
  getTenantId: vi.fn(),
  runWithTenantAsync: vi.fn(),
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
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
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
vi.mock('@/lib/proposal/compiler', () => ({
  compileAndPersistProposal: mocks.compileProposal,
  getCurrentProposalVersion: vi.fn().mockResolvedValue(1),
}));

vi.mock('@/lib/analysis/competitorComparison', () => ({
  generateComparison: mocks.generateComparison,
}));

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mocks.getTenantId,
  runWithTenantAsync: mocks.runWithTenantAsync,
}));

vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class CostTracker {
    getTotalCents() {
      return 7;
    }
  },
  checkDailyAuditLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 100,
    todayCount: 5,
    remaining: 95,
  }),
}));

vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: () => (req: any, handler: any) => handler(),
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/middleware/idempotency', () => ({
  withIdempotency: (handler: any) => handler,
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

function finding() {
  return {
    id: 'finding-1',
    auditId: 'audit-1',
    tenantId: 'tenant-a',
    title: 'Slow site',
    description: 'Slow site delivery was measured.',
    category: 'Performance',
    module: 'performance',
    type: 'PAINKILLER',
    impactScore: 8,
    confidenceScore: 9,
    evidence: [
      createEvidence({
        pointer: 'https://acme.test/',
        source: 'pagespeed_v5',
        value: 4200,
        label: 'LCP',
      }),
    ],
    metrics: { lcpMs: 4200 },
    effortEstimate: 'MEDIUM',
    recommendedFix: ['Address Slow site'],
  } as any;
}

function completeProposal() {
  const findings = [finding()];
  const proposal: any = {
    executiveSummary: 'Acme Dental: Validated audit finding: Slow site.',
    painClusters: [
      {
        id: 'cluster-1',
        rootCause: 'Slow site',
        severity: 'high',
        findingIds: ['finding-1'],
      },
    ],
    topActions: [
      {
        findingId: 'finding-1',
        title: 'Slow site',
        impact: 8,
        effort: 'MEDIUM',
        timeline: '14-21 days',
      },
    ],
    tiers: {
      essentials: {
        name: 'Essentials',
        description: 'Addresses: Slow site',
        findingIds: ['finding-1'],
        deliveryTime: '5 business days',
        price: 100,
        features: ['Address Slow site'],
      },
      growth: {
        name: 'Growth',
        description: 'Addresses: Slow site',
        findingIds: ['finding-1'],
        deliveryTime: '10 business days',
        price: 200,
        features: ['Address Slow site'],
      },
      premium: {
        name: 'Premium',
        description: 'Addresses: Slow site',
        findingIds: ['finding-1'],
        deliveryTime: '15 business days',
        price: 300,
        features: ['Address Slow site'],
      },
    },
    pricing: { essentials: 100, growth: 200, premium: 300, currency: 'USD' },
    assumptions: ['Scope requires confirmation'],
    disclaimers: ['Automated findings require review'],
    nextSteps: ['Review and approve a tier'],
  };
  proposal.grounding = buildProposalGrounding(
    proposal,
    { auditId: 'audit-1', tenantId: 'tenant-a', findings },
    ['finding-1']
  );
  return proposal;
}

describe('audit propose authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantId.mockResolvedValue('tenant-a');
    mocks.runWithTenantAsync.mockImplementation(async (tenantId, fn) => {
      mocks.getTenantId.mockResolvedValue(tenantId);
      return fn();
    });
    mocks.validateApiKey.mockResolvedValue(null);
    mocks.detectVertical.mockReturnValue('general');
    mocks.getPlaybook.mockReturnValue({ id: 'general' });
    mocks.proposalTemplateFindFirst.mockResolvedValue(null);
    mocks.evidenceFindMany.mockResolvedValue([]);
    mocks.invokeDiagnosisGraphWithTimeout.mockResolvedValue({
      resultState: 'trusted',
      clusters: [{ findingIds: ['finding-1'] }],
      validation: { valid: true },
    });
    mocks.invokeProposalGraphWithTimeout.mockResolvedValue({
      completeProposal: completeProposal(),
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
    mocks.compileProposal.mockResolvedValue({
      proposalRecord: { id: 'proposal-1', webLinkToken: 'token-1', status: 'READY' },
      proposal: completeProposal(),
      evaluation: { autoQAStatus: { score: 95, clientPerfect: { score: 92, hardFails: [], requiresHumanReview: false } }, dimensions: {}, overallScore: 95, passed: true, feedbackLogs: [] },
      costTracker: { getTotalCents: () => 7 },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', { method: 'POST' }),
      {
        params: Promise.resolve({ id: 'audit-1' }),
      }
    );

    expect(response.status).toBe(401);
    expect(mocks.auditFindFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when the audit belongs to a different tenant', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'owner@example.com', tenantId: 'tenant-a' },
    });
    mocks.auditFindFirst.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/audit/audit-2/propose', { method: 'POST' }),
      {
        params: Promise.resolve({ id: 'audit-2' }),
      }
    );

    expect(response.status).toBe(404);
    expect(mocks.auditFindFirst).toHaveBeenCalledWith({
      where: { id: 'audit-2', tenantId: 'tenant-a' },
      include: {
        findings: true,
        proposals: {
          orderBy: { createdAt: 'desc' },
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
      status: 'COMPLETE',
      trustState: 'TRUSTED',
      businessName: 'Acme Dental',
      businessIndustry: 'Dental',
      businessCity: 'Regina',
      businessUrl: null,
      findings: [finding()],
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
    expect(mocks.compileProposal).toHaveBeenCalledWith(expect.objectContaining({
      auditId: 'audit-1', tenantId: 'tenant-a', version: 1,
    }));
  });
});
