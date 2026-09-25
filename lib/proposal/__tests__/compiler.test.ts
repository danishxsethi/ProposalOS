import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvidence } from '@/lib/modules/types';

const mocks = vi.hoisted(() => ({
  auditFindFirst: vi.fn(),
  snapshotFindMany: vi.fn(),
  proposalFindFirst: vi.fn(),
  proposalGraph: vi.fn(),
  diagnosisGraph: vi.fn(),
  proposalCreate: vi.fn(),
  proposalUpdate: vi.fn(),
  proposalUpdateMany: vi.fn(),
  transaction: vi.fn(),
  auditUpdate: vi.fn(),
  evaluate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: { findFirst: mocks.auditFindFirst, update: mocks.auditUpdate },
    evidenceSnapshot: { findMany: mocks.snapshotFindMany },
    proposal: { create: mocks.proposalCreate, update: mocks.proposalUpdate, updateMany: mocks.proposalUpdateMany, findFirst: mocks.proposalFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/graph/diagnosis-graph', () => ({ invokeDiagnosisGraphWithTimeout: mocks.diagnosisGraph }));
vi.mock('@/lib/graph/proposal-graph', () => ({ invokeProposalGraphWithTimeout: mocks.proposalGraph }));
vi.mock('@/lib/proposal/ProposalQAService', () => ({
  ProposalQAService: { evaluateProposal: mocks.evaluate },
  isProposalQAPublishable: (evaluation: any) =>
    evaluation.passed &&
    evaluation.autoQAStatus?.status === 'PASS' &&
    evaluation.autoQAStatus?.hardFailures?.length === 0 &&
    evaluation.autoQAStatus?.clientPerfect?.hardFails?.length === 0 &&
    !evaluation.autoQAStatus?.clientPerfect?.requiresHumanReview,
}));

import { compileAndPersistProposal } from '../compiler';

const finding = {
  id: 'finding-1', auditId: 'audit-1', tenantId: 'tenant-1', title: 'Slow site',
  description: 'Slow site loading performance measured on the business website.',
  category: 'Performance', module: 'performance', type: 'PAINKILLER', impactScore: 8,
  confidenceScore: 9, effortEstimate: 'MEDIUM',
  evidence: [createEvidence({
    pointer: 'https://acme.test/', source: 'pagespeed_v5', value: 4200, label: 'LCP',
  })],
  metrics: { lcpMs: 4200 }, recommendedFix: ['Improve slow site'],
} as any;
const qaStatus = {
  score: 75,
  status: 'PASS',
  hardFailures: [],
  clientPerfect: { score: 75, hardFails: [], requiresHumanReview: false },
};
const proposal = {
  executiveSummary: 'Acme Dental experienced measured slow site loading, missing page metadata, and a broken customer contact link on its audited website.',
  painClusters: [{ id: 'cluster-1', rootCause: 'Slow site loading', severity: 'high', findingIds: ['finding-1'] }],
  tiers: {
    essentials: { name: 'Essentials', price: 100, findingIds: ['finding-1'], description: 'd', features: ['f'], deliveryTime: '5 days' },
    growth: { name: 'Growth', price: 200, findingIds: ['finding-1'], description: 'd', features: ['f'], deliveryTime: '5 days' },
    premium: { name: 'Premium', price: 300, findingIds: ['finding-1'], description: 'd', features: ['f'], deliveryTime: '5 days' },
  },
  pricing: { essentials: 100, growth: 200, premium: 300, currency: 'USD' },
  assumptions: ['Current site configuration remains available during implementation.'],
  disclaimers: ['All recommendations require customer review before implementation.'],
  nextSteps: ['Review and approve'],
  topActions: [],
} as any;

describe('canonical proposal compiler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFindFirst.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-1',
      status: 'COMPLETE',
      trustState: 'TRUSTED',
      businessName: 'Acme',
      businessIndustry: 'Dental',
      businessCity: 'Regina',
      findings: [finding],
      evidence: [],
    });
    mocks.proposalFindFirst.mockResolvedValue(null);
    mocks.snapshotFindMany.mockResolvedValue([{ id: 'snapshot-1', module: 'performance', observationStatus: 'COMPLETE' }]);
    mocks.diagnosisGraph.mockResolvedValue({
      resultState: 'trusted',
      validation: { valid: true, issues: [], clusterCount: 1, findingsCovered: 1, totalFindings: 1 },
      errors: [],
      degraded: false,
      staleFindingsCount: 0,
      clusters: [{ id: 'cluster-1', findingIds: ['finding-1'] }],
    });
    mocks.proposalGraph.mockResolvedValue({ completeProposal: proposal, validation: { valid: true }, errors: [], lastQaScore: 0 });
    mocks.evaluate.mockReturnValue({
      passed: true,
      dimensions: {},
      overallScore: 9,
      feedbackLogs: [],
      autoQAStatus: qaStatus,
    });
    mocks.proposalCreate.mockResolvedValue({ id: 'proposal-1', webLinkToken: 'token', status: 'DRAFT' });
    mocks.proposalUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback({
      proposal: {
        findFirst: mocks.proposalFindFirst,
        create: mocks.proposalCreate,
        updateMany: mocks.proposalUpdateMany,
        findUnique: vi.fn().mockResolvedValue({ id: 'proposal-1', webLinkToken: 'token', status: 'READY' }),
      },
    }));
  });

  it('uses DB identity and evidence and gates readiness through QA and publication eligibility', async () => {
    const result = await compileAndPersistProposal({ auditId: 'audit-1', tenantId: 'tenant-1' });

    expect(mocks.auditFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'audit-1', tenantId: 'tenant-1' },
    }));
    expect(mocks.snapshotFindMany).toHaveBeenCalledWith({
      where: { auditId: 'audit-1', tenantId: 'tenant-1' },
    });
    expect(mocks.diagnosisGraph).toHaveBeenCalledWith(expect.objectContaining({
      auditId: 'audit-1', tenantId: 'tenant-1', evidenceSnapshots: [{ id: 'snapshot-1', module: 'performance', observationStatus: 'COMPLETE' }],
    }));
    expect(mocks.proposalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT', qaResults: expect.any(Object) }),
    }));
    expect(mocks.proposalUpdateMany).toHaveBeenCalledWith({
      where: { id: 'proposal-1', tenantId: 'tenant-1', version: 1, status: 'DRAFT' },
      data: expect.objectContaining({ status: 'READY', qaResults: expect.any(Object) }),
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(result.proposalRecord.status).toBe('READY');
  });

  it('fails closed if a validated finding cannot be tied to persisted COMPLETE evidence', async () => {
    mocks.snapshotFindMany.mockResolvedValue([]);
    await expect(compileAndPersistProposal({ auditId: 'audit-1', tenantId: 'tenant-1' }))
      .rejects.toThrow('PROPOSAL_EVIDENCE_INCOMPLETE');
    expect(mocks.diagnosisGraph).not.toHaveBeenCalled();
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['incomplete', { status: 'PARTIAL', trustState: 'TRUSTED' }],
    ['untrusted', { status: 'COMPLETE', trustState: 'DEGRADED_REVIEW_REQUIRED' }],
  ])('rejects %s audits before diagnosis', async (_label, state) => {
    mocks.auditFindFirst.mockResolvedValue({ ...await mocks.auditFindFirst(), ...state });
    await expect(compileAndPersistProposal({ auditId: 'audit-1', tenantId: 'tenant-1' }))
      .rejects.toThrow('AUDIT_NOT_TRUSTED');
    expect(mocks.diagnosisGraph).not.toHaveBeenCalled();
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it.each(['degraded', 'failed'])('rejects %s diagnosis results before proposal generation', async (resultState) => {
    mocks.diagnosisGraph.mockResolvedValue({ resultState, clusters: [{ findingIds: ['finding-1'] }] });
    await expect(compileAndPersistProposal({ auditId: 'audit-1', tenantId: 'tenant-1' }))
      .rejects.toThrow(`DIAGNOSIS_NOT_TRUSTED: Diagnosis result state is ${resultState}`);
    expect(mocks.proposalGraph).not.toHaveBeenCalled();
    expect(mocks.proposalCreate).not.toHaveBeenCalled();
  });

  it('keeps DRAFT when canonical QA does not pass', async () => {
    mocks.evaluate.mockReturnValue({
      passed: false,
      dimensions: {},
      overallScore: 5,
      feedbackLogs: ['not ready'],
      autoQAStatus: qaStatus,
    });
    const { proposalPublicationFingerprint } = await import('../publication');
    mocks.proposalUpdateMany.mockResolvedValue({ count: 1 });
    await compileAndPersistProposal({ auditId: 'audit-1', tenantId: 'tenant-1' });
    expect(mocks.proposalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT' }),
    }));
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });

  it('keeps DRAFT when QA reports a hard fail even if the aggregate passes', async () => {
    mocks.evaluate.mockReturnValue({
      passed: true,
      dimensions: {},
      overallScore: 9,
      feedbackLogs: [],
      autoQAStatus: {
        ...qaStatus,
        clientPerfect: { ...qaStatus.clientPerfect, hardFails: [{ code: 'IDENTITY', details: 'Mismatch' }] },
      },
    });
    await compileAndPersistProposal({ auditId: 'audit-1', tenantId: 'tenant-1' });
    expect(mocks.proposalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT' }),
    }));
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });
});
