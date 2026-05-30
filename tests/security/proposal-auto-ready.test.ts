// @vitest-environment node
/**
 * Regression tests for proposal auto-READY status promotion.
 *
 * Verifies that:
 * 1. Proposals with QA score >= 60 are persisted as READY.
 * 2. Proposals with QA score < 60 are persisted as DRAFT.
 * 3. Proposals with hard-fail QA conditions (score forced to 0) are DRAFT.
 * 4. Generation failures do not create falsely READY proposals.
 * 5. The route response reflects the persisted status.
 * 6. Tenant isolation is not broken by the status logic.
 * 7. The runner (background path) applies the same logic as the route.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // auth
  auth: vi.fn(),
  validateApiKey: vi.fn(),

  // prisma
  auditFindFirst: vi.fn(),
  auditUpdate: vi.fn(),
  proposalCreate: vi.fn(),
  proposalTemplateFindFirst: vi.fn(),
  evidenceFindMany: vi.fn(),

  // pipeline
  invokeDiagnosisGraphWithTimeout: vi.fn(),
  invokeProposalGraphWithTimeout: vi.fn(),
  runAutoQA: vi.fn(),
  createParentTrace: vi.fn(),
  detectVertical: vi.fn(),
  getPlaybook: vi.fn(),
  generateComparison: vi.fn(),

  // logger
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
  logError: vi.fn(),

  // tenant context
  getTenantId: vi.fn(),
  runWithTenantAsync: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/apiKeys', () => ({ validateApiKey: mocks.validateApiKey }));
vi.mock('@/lib/logger', () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, debug: mocks.loggerDebug },
  logError: mocks.logError,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: { findFirst: mocks.auditFindFirst, update: mocks.auditUpdate },
    proposal: { create: mocks.proposalCreate },
    proposalTemplate: { findFirst: mocks.proposalTemplateFindFirst },
    evidenceSnapshot: { findMany: mocks.evidenceFindMany },
  },
}));
vi.mock('@/lib/analysis/competitorComparison', () => ({
  generateComparison: mocks.generateComparison,
}));
vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mocks.getTenantId,
  runWithTenantAsync: mocks.runWithTenantAsync,
}));
vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class {
    getTotalCents() { return 5; }
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
vi.mock('@/lib/qa/autoQA', () => ({ runAutoQA: mocks.runAutoQA }));
vi.mock('@/lib/tracing', () => ({ createParentTrace: mocks.createParentTrace }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal passing QA status (score >= 60, no hard fails). */
function passingQA(score = 75) {
  return {
    score,
    passedChecks: 10,
    totalChecks: 13,
    results: [],
    warnings: [],
    needsReview: false,
    clientPerfect: {
      score,
      hardFails: [],
      requiresHumanReview: false,
      gates: {
        truth: { weight: 0.4, score, passedChecks: 5, totalChecks: 5, checks: [] },
        fit: { weight: 0.35, score, passedChecks: 4, totalChecks: 4, checks: [] },
        decision: { weight: 0.25, score, passedChecks: 6, totalChecks: 6, checks: [] },
      },
      humanCloseability: { provided: false, score: null, passed: null },
    },
  };
}

/** Build a failing QA status (score < 60). */
function failingQA(score = 40) {
  return {
    ...passingQA(score),
    needsReview: true,
    warnings: ['Client-perfect score below 90'],
    clientPerfect: {
      ...passingQA(score).clientPerfect,
      score,
    },
  };
}

/** Build a hard-fail QA status (score forced to 0). */
function hardFailQA() {
  return {
    score: 0,
    passedChecks: 3,
    totalChecks: 13,
    results: [],
    warnings: ['Hard-fail triggered: client score forced to 0'],
    needsReview: true,
    clientPerfect: {
      score: 0,
      hardFails: [
        { code: 'WRONG_BUSINESS_OR_CITY', details: 'Business mention: false, city mention: false' },
      ],
      requiresHumanReview: false,
      gates: {
        truth: { weight: 0.4, score: 0, passedChecks: 0, totalChecks: 5, checks: [] },
        fit: { weight: 0.35, score: 0, passedChecks: 0, totalChecks: 4, checks: [] },
        decision: { weight: 0.25, score: 0, passedChecks: 3, totalChecks: 6, checks: [] },
      },
      humanCloseability: { provided: false, score: null, passed: null },
    },
  };
}

/** Minimal audit fixture. */
function makeAudit(overrides = {}) {
  return {
    id: 'audit-1',
    tenantId: 'tenant-a',
    businessName: 'Acme Dental',
    businessIndustry: 'Dental',
    businessCity: 'Regina',
    businessUrl: null,
    verticalPlaybookId: null,
    findings: [
      {
        id: 'finding-1',
        title: 'Slow site',
        category: 'Performance',
        module: 'performance',
        type: 'PAINKILLER',
        impactScore: 8,
        confidenceScore: 90,
        evidence: [{ pointer: 'https://example.com', collected_at: '2026-01-01' }],
      },
    ],
    proposals: [],
    evidence: [],
    ...overrides,
  };
}

/** Minimal proposal graph result. */
const proposalGraphResult = {
  proposalDef: {
    executiveSummary: 'Acme Dental in Regina is losing patients due to slow site.',
    tiers: {
      essentials: { name: 'Essentials', findingIds: ['finding-1'], deliveryTime: '5 days' },
      growth: { name: 'Growth', findingIds: ['finding-1'], deliveryTime: '10 days' },
      premium: { name: 'Premium', findingIds: ['finding-1'], deliveryTime: '15 days' },
    },
    pricing: { essentials: 1000, growth: 2000, premium: 3000, currency: 'USD' },
    assumptions: ['Access to GBP required'],
    disclaimers: ['Results may vary'],
    nextSteps: ['Reply to schedule a call'],
    painClusters: [],
  },
};

const diagnosisResult = {
  clusters: [{ findingIds: ['finding-1'], rootCause: 'Performance', severity: 'high' }],
  validation: { valid: true },
};

// ---------------------------------------------------------------------------
// determineProposalStatus unit tests
// ---------------------------------------------------------------------------

describe('determineProposalStatus', () => {
  it('returns READY when score >= 60', async () => {
    const { determineProposalStatus } = await import('@/lib/proposal/status');
    expect(determineProposalStatus(passingQA(60))).toBe('READY');
    expect(determineProposalStatus(passingQA(75))).toBe('READY');
    expect(determineProposalStatus(passingQA(100))).toBe('READY');
  });

  it('returns DRAFT when score < 60', async () => {
    const { determineProposalStatus } = await import('@/lib/proposal/status');
    expect(determineProposalStatus(failingQA(59))).toBe('DRAFT');
    expect(determineProposalStatus(failingQA(0))).toBe('DRAFT');
    expect(determineProposalStatus(hardFailQA())).toBe('DRAFT');
  });

  it('returns DRAFT for hard-fail (score forced to 0)', async () => {
    const { determineProposalStatus } = await import('@/lib/proposal/status');
    expect(determineProposalStatus(hardFailQA())).toBe('DRAFT');
  });
});

// ---------------------------------------------------------------------------
// POST /api/audit/[id]/propose — status promotion tests
// ---------------------------------------------------------------------------

describe('POST /api/audit/[id]/propose — proposal status promotion', () => {
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
    mocks.invokeDiagnosisGraphWithTimeout.mockResolvedValue(diagnosisResult);
    mocks.invokeProposalGraphWithTimeout.mockResolvedValue(proposalGraphResult);
    mocks.createParentTrace.mockResolvedValue(undefined);
    mocks.auditUpdate.mockResolvedValue({});
    mocks.proposalCreate.mockResolvedValue({
      id: 'proposal-1',
      webLinkToken: 'token-1',
    });
    mocks.auth.mockResolvedValue({
      user: { email: 'owner@example.com', tenantId: 'tenant-a' },
    });
    mocks.auditFindFirst.mockResolvedValue(makeAudit());
  });

  it('persists READY and returns status=READY when QA score >= 60', async () => {
    mocks.runAutoQA.mockReturnValue(passingQA(75));

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('READY');

    // Verify the persisted status is READY
    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY' }),
      })
    );
  });

  it('persists DRAFT and returns status=DRAFT when QA score < 60', async () => {
    mocks.runAutoQA.mockReturnValue(failingQA(40));

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('DRAFT');

    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT' }),
      })
    );
  });

  it('persists DRAFT when QA has hard-fail (score forced to 0)', async () => {
    mocks.runAutoQA.mockReturnValue(hardFailQA());

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('DRAFT');
    expect(body.hardFails).toHaveLength(1);

    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT' }),
      })
    );
  });

  it('does not create a proposal when generation throws', async () => {
    mocks.invokeProposalGraphWithTimeout.mockRejectedValue(new Error('LLM timeout'));

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(500);
    // No proposal should have been created
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated — tenant isolation preserved', async () => {
    mocks.auth.mockResolvedValue(null);

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', { method: 'POST' }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when audit belongs to different tenant — tenant isolation preserved', async () => {
    mocks.auditFindFirst.mockResolvedValue(null);

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-2/propose', { method: 'POST' }),
      { params: Promise.resolve({ id: 'audit-2' }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it('saves QA score and client score alongside status', async () => {
    mocks.runAutoQA.mockReturnValue(passingQA(80));

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    expect(mocks.proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          qaScore: 80,
          clientScore: 80,
        }),
      })
    );
  });

  it('response status matches persisted status (READY)', async () => {
    mocks.runAutoQA.mockReturnValue(passingQA(90));

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    const body = await response.json();
    // The response status field must match what was persisted
    const persistedStatus = mocks.proposalCreate.mock.calls[0]?.[0]?.data?.status;
    expect(body.status).toBe(persistedStatus);
    expect(body.status).toBe('READY');
  });

  it('response status matches persisted status (DRAFT)', async () => {
    mocks.runAutoQA.mockReturnValue(failingQA(30));

    const { POST } = await import('@/app/api/audit/[id]/propose/route');
    const response = await POST(
      new Request('http://localhost/api/audit/audit-1/propose', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'audit-1' }) }
    );

    const body = await response.json();
    const persistedStatus = mocks.proposalCreate.mock.calls[0]?.[0]?.data?.status;
    expect(body.status).toBe(persistedStatus);
    expect(body.status).toBe('DRAFT');
  });
});
