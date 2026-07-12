// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEvidence } from '@/lib/modules/types';
import { buildProposalGrounding } from '@/lib/proposal/grounding';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateApiKey: vi.fn(),
  auditFindFirst: vi.fn(),
  evidenceFindMany: vi.fn(),
  proposalCreate: vi.fn(),
  auditUpdate: vi.fn(),
  invokeDiagnosisGraphWithTimeout: vi.fn(),
  runProposalPipeline: vi.fn(),
  runAutoQA: vi.fn(),
  evaluateProposal: vi.fn(),
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
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
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

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mocks.getTenantId,
  runWithTenantAsync: mocks.runWithTenantAsync,
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

vi.mock('@/lib/proposal', () => ({
  runProposalPipeline: mocks.runProposalPipeline,
}));

vi.mock('@/lib/qa/autoQA', () => ({
  runAutoQA: mocks.runAutoQA,
}));

vi.mock('@/lib/proposal/ProposalQAService', () => ({
  ProposalQAService: {
    evaluateProposal: mocks.evaluateProposal,
  },
}));

import { POST } from '@/app/api/audit/[id]/regenerate/route';

function finding() {
  return {
    id: 'finding-1',
    auditId: 'audit-1',
    tenantId: 'tenant-a',
    module: 'performance',
    category: 'Performance',
    type: 'PAINKILLER',
    title: 'Slow site',
    description: 'Slow site delivery was measured.',
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

function proposalResult() {
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

describe('audit regenerate authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantId.mockResolvedValue('tenant-a');
    mocks.runWithTenantAsync.mockImplementation(async (tenantId, fn) => {
      mocks.getTenantId.mockResolvedValue(tenantId);
      return fn();
    });
    mocks.validateApiKey.mockResolvedValue(null);
    mocks.evidenceFindMany.mockResolvedValue([]);
    mocks.invokeDiagnosisGraphWithTimeout.mockResolvedValue({
      clusters: [{ findingIds: ['finding-1'] }],
    });
    mocks.runProposalPipeline.mockResolvedValue(proposalResult());
    mocks.runAutoQA.mockReturnValue({
      score: 75,
      passedChecks: 10,
      totalChecks: 13,
      results: [],
      warnings: [],
      needsReview: false,
      clientPerfect: {
        score: 75,
        hardFails: [],
        requiresHumanReview: false,
        gates: {
          truth: { weight: 0.4, score: 75, passedChecks: 5, totalChecks: 5, checks: [] },
          fit: { weight: 0.35, score: 75, passedChecks: 4, totalChecks: 4, checks: [] },
          decision: { weight: 0.25, score: 75, passedChecks: 6, totalChecks: 6, checks: [] },
        },
        humanCloseability: { provided: false, score: null, passed: null },
      },
    });
    mocks.proposalCreate.mockImplementation(async (args: any) => {
      return {
        id: 'proposal-2',
        version: args?.data?.version ?? 1,
        webLinkToken: 'token-2',
        executiveSummary: args?.data?.executiveSummary ?? 'Updated summary',
        pricing: args?.data?.pricing ?? { essentials: 100 },
        status: args?.data?.status ?? 'READY',
      };
    });
    mocks.auditUpdate.mockResolvedValue({});

    // Bridge evaluateProposal to runAutoQA
    mocks.evaluateProposal.mockImplementation(
      (proposal: any, findings: any, businessName: any, city: any, context: any) => {
        const autoQAStatus = mocks.runAutoQA(proposal, findings, businessName, city, context);
        const passed =
          autoQAStatus.score >= 60 &&
          (!autoQAStatus.clientPerfect?.hardFails ||
            autoQAStatus.clientPerfect.hardFails.length === 0);
        return {
          dimensions: {
            evidenceQuality: 10,
            relevance: 10,
            specificity: 10,
            clarity: 10,
            pricingFit: 10,
            copywritingSafety: 10,
            clientReadiness: 10,
          },
          overallScore: autoQAStatus.score,
          passed,
          feedbackLogs: autoQAStatus.warnings,
          autoQAStatus,
        };
      }
    );
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
      businessCity: 'Regina',
      businessUrl: null,
      findings: [finding()],
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
      status: 'READY', // QA score 75 >= 60 → READY
      regenerationsRemaining: 2,
      costCents: 11,
    });
    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditId: 'audit-1',
          tenantId: 'tenant-a',
          status: 'READY',
        }),
      })
    );
  });
});
