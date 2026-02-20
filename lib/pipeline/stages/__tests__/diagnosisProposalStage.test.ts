/**
 * Unit tests for Diagnosis & Proposal Pipeline Stage
 *
 * Tests processDiagnosisProposalStage() and processOneDiagnosisProposal()
 * with mocked Prisma, diagnosis pipeline, proposal pipeline, and state machine.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StageResult } from '../../types';

// --- Mocks ---

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockAuditFindUnique = vi.fn();
const mockProspectUpdate = vi.fn();
const mockProposalCreate = vi.fn();
const mockErrorLogCreate = vi.fn();
const mockPipelineConfigFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    prospectLead: {
      findMany: (...args: any[]) => mockFindMany(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockProspectUpdate(...args),
    },
    audit: {
      findUnique: (...args: any[]) => mockAuditFindUnique(...args),
    },
    proposal: {
      create: (...args: any[]) => mockProposalCreate(...args),
    },
    pipelineConfig: {
      findUnique: (...args: any[]) => mockPipelineConfigFindUnique(...args),
    },
    pipelineErrorLog: {
      create: (...args: any[]) => mockErrorLogCreate(...args),
    },
  },
}));

const mockTransition = vi.fn();
vi.mock('../../stateMachine', () => ({
  transition: (...args: any[]) => mockTransition(...args),
}));

const mockLogStageFailure = vi.fn();
vi.mock('../../metrics', () => ({
  logStageFailure: (...args: any[]) => mockLogStageFailure(...args),
}));

const mockRunDiagnosisPipeline = vi.fn();
vi.mock('@/lib/diagnosis/index', () => ({
  runDiagnosisPipeline: (...args: any[]) => mockRunDiagnosisPipeline(...args),
}));

const mockRunProposalPipeline = vi.fn();
vi.mock('@/lib/proposal/index', () => ({
  runProposalPipeline: (...args: any[]) => mockRunProposalPipeline(...args),
}));

vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class MockCostTracker {
    getTotalCents() {
      return 50;
    }
  },
}));

vi.mock('@/lib/playbooks/registry', () => ({
  detectVertical: () => 'dentist',
  getPlaybook: () => ({ id: 'dentist', pricingMultiplier: 1.0 }),
}));

vi.mock('crypto', () => ({
  default: { randomUUID: () => 'test-uuid-token' },
}));

import {
  processDiagnosisProposalStage,
  processOneDiagnosisProposal,
} from '../diagnosisProposalStage';

// --- Helpers ---

function makeProspect(overrides: Record<string, any> = {}) {
  return {
    id: 'prospect-1',
    tenantId: 'tenant-1',
    businessName: 'Test Dental',
    city: 'Portland',
    website: 'https://testdental.com',
    vertical: 'dentist',
    pipelineStatus: 'audited',
    auditId: 'audit-1',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAudit(overrides: Record<string, any> = {}) {
  return {
    id: 'audit-1',
    tenantId: 'tenant-1',
    businessName: 'Test Dental',
    businessCity: 'Portland',
    businessIndustry: 'dentist',
    status: 'COMPLETE',
    findings: [
      { id: 'f1', title: 'Slow page speed', auditId: 'audit-1' },
      { id: 'f2', title: 'Missing meta tags', auditId: 'audit-1' },
    ],
    ...overrides,
  };
}

function makeDiagnosisResult(clusterCount = 2) {
  const clusters = Array.from({ length: clusterCount }, (_, i) => ({
    id: `cluster-${i + 1}`,
    rootCause: `Issue group ${i + 1}`,
    severity: 'high' as const,
    findingIds: [`f${i + 1}`],
  }));
  return {
    clusters,
    metadata: {
      totalFindings: 2,
      clusteredFindings: clusterCount,
      clusteringConfidence: 0.9,
    },
  };
}

function makeProposalResult() {
  return {
    executiveSummary: 'Your dental practice needs help.',
    painClusters: [{ id: 'cluster-1', rootCause: 'Speed', severity: 'high', findingIds: ['f1'] }],
    tiers: {
      essentials: { name: 'Starter', findingIds: ['f1'], price: 500 },
      growth: { name: 'Growth', findingIds: ['f1', 'f2'], price: 1000 },
      premium: { name: 'Premium', findingIds: ['f1', 'f2'], price: 2000 },
    },
    pricing: { essentials: 500, growth: 1000, premium: 2000, currency: 'USD' },
    assumptions: ['Assumption 1'],
    disclaimers: ['Disclaimer 1'],
    nextSteps: ['Step 1'],
    normalizedFindings: [],
  };
}

// --- Tests ---

describe('Diagnosis & Proposal Stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProspectUpdate.mockResolvedValue({});
    mockProposalCreate.mockResolvedValue({ id: 'proposal-1', webLinkToken: 'test-uuid-token' });
    mockTransition.mockResolvedValue({
      from: 'audited',
      to: 'QUALIFIED',
      timestamp: new Date(),
      stage: 'proposal',
      tenantId: 'tenant-1',
    });
    mockErrorLogCreate.mockResolvedValue({});
    mockLogStageFailure.mockResolvedValue(undefined);
    mockPipelineConfigFindUnique.mockResolvedValue({ pricingMultiplier: 1.0 });
  });

  describe('processOneDiagnosisProposal', () => {
    it('transitions to "QUALIFIED" when diagnosis produces clusters', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      const result = await processOneDiagnosisProposal('prospect-1');

      expect(result.success).toBe(true);
      expect(result.toStatus).toBe('QUALIFIED');
      expect(mockTransition).toHaveBeenCalledWith('prospect-1', 'QUALIFIED', 'proposal');
    });

    it('transitions to "low_value" when diagnosis produces zero clusters', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(0));

      const result = await processOneDiagnosisProposal('prospect-1');

      expect(result.success).toBe(true);
      expect(result.toStatus).toBe('low_value');
      expect(mockTransition).toHaveBeenCalledWith('prospect-1', 'low_value', 'diagnosis');
      expect(mockRunProposalPipeline).not.toHaveBeenCalled();
    });

    it('fetches audit with findings', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      await processOneDiagnosisProposal('prospect-1');

      expect(mockAuditFindUnique).toHaveBeenCalledWith({
        where: { id: 'audit-1' },
        include: { findings: true },
      });
    });

    it('passes audit findings to diagnosis pipeline', async () => {
      const audit = makeAudit();
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(audit);
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      await processOneDiagnosisProposal('prospect-1');

      expect(mockRunDiagnosisPipeline).toHaveBeenCalledWith(
        audit.findings,
        expect.any(Object), // CostTracker
        undefined,
        expect.objectContaining({ id: 'dentist' })
      );
    });

    it('creates a Proposal record with unique web link token', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      await processOneDiagnosisProposal('prospect-1');

      expect(mockProposalCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          auditId: 'audit-1',
          tenantId: 'tenant-1',
          status: 'DRAFT',
          webLinkToken: 'test-uuid-token',
          executiveSummary: expect.any(String),
        }),
      });
    });

    it('links proposalId to ProspectLead', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      await processOneDiagnosisProposal('prospect-1');

      expect(mockProspectUpdate).toHaveBeenCalledWith({
        where: { id: 'prospect-1' },
        data: { proposalId: 'proposal-1' },
      });
    });

    it('applies tenant pricing multiplier to proposal pricing', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());
      mockPipelineConfigFindUnique.mockResolvedValue({ pricingMultiplier: 1.5 });

      const result = await processOneDiagnosisProposal('prospect-1');

      // Pricing should be multiplied by 1.5
      expect(mockProposalCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pricing: JSON.parse(
            JSON.stringify({
              essentials: 750,  // 500 * 1.5
              growth: 1500,     // 1000 * 1.5
              premium: 3000,    // 2000 * 1.5
              currency: 'USD',
            })
          ),
        }),
      });
      expect(result.metadata?.pricingMultiplier).toBe(1.5);
    });

    it('uses default multiplier of 1.0 when no PipelineConfig exists', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());
      mockPipelineConfigFindUnique.mockResolvedValue(null);

      const result = await processOneDiagnosisProposal('prospect-1');

      expect(result.metadata?.pricingMultiplier).toBe(1.0);
    });

    it('records cost against tenant on success', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      await processOneDiagnosisProposal('prospect-1');

      expect(mockErrorLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          stage: 'diagnosis',
          errorType: 'COST_RECORD',
          metadata: expect.objectContaining({ costCents: 50, auditId: 'audit-1' }),
        }),
      });
    });

    it('records cost against tenant on low_value transition', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(0));

      await processOneDiagnosisProposal('prospect-1');

      expect(mockErrorLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          stage: 'diagnosis',
          errorType: 'COST_RECORD',
        }),
      });
    });

    it('throws when prospect is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(processOneDiagnosisProposal('nonexistent')).rejects.toThrow(
        'Prospect not found'
      );
    });

    it('throws when prospect is not in "audited" status', async () => {
      mockFindUnique.mockResolvedValue(makeProspect({ pipelineStatus: 'discovered' }));

      await expect(processOneDiagnosisProposal('prospect-1')).rejects.toThrow(
        'expected "audited"'
      );
    });

    it('throws when prospect has no linked audit', async () => {
      mockFindUnique.mockResolvedValue(makeProspect({ auditId: null }));

      await expect(processOneDiagnosisProposal('prospect-1')).rejects.toThrow(
        'has no linked audit'
      );
    });

    it('throws when audit is not found in database', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(null);

      await expect(processOneDiagnosisProposal('prospect-1')).rejects.toThrow(
        'Audit not found'
      );
    });

    it('includes metadata with proposalId, clusterCount, and webLinkToken', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      const result = await processOneDiagnosisProposal('prospect-1');

      expect(result.metadata).toEqual(
        expect.objectContaining({
          auditId: 'audit-1',
          proposalId: 'proposal-1',
          webLinkToken: 'test-uuid-token',
          clusterCount: 2,
        })
      );
    });
  });

  describe('processDiagnosisProposalStage', () => {
    it('processes a batch of audited prospects', async () => {
      const prospects = [makeProspect({ id: 'p1' }), makeProspect({ id: 'p2' })];
      mockFindMany.mockResolvedValue(prospects);
      mockFindUnique
        .mockResolvedValueOnce(makeProspect({ id: 'p1' }))
        .mockResolvedValueOnce(makeProspect({ id: 'p2' }));
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      const results = await processDiagnosisProposalStage('tenant-1', 10);

      expect(results).toHaveLength(2);
      expect(results.every((r: StageResult) => r.success)).toBe(true);
    });

    it('continues processing when one prospect fails', async () => {
      const prospects = [makeProspect({ id: 'p1' }), makeProspect({ id: 'p2' })];
      mockFindMany.mockResolvedValue(prospects);
      // First prospect: not found (will throw)
      mockFindUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeProspect({ id: 'p2' }));
      mockAuditFindUnique.mockResolvedValue(makeAudit());
      mockRunDiagnosisPipeline.mockResolvedValue(makeDiagnosisResult(2));
      mockRunProposalPipeline.mockResolvedValue(makeProposalResult());

      const results = await processDiagnosisProposalStage('tenant-1', 10);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });

    it('returns empty array when no audited prospects exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const results = await processDiagnosisProposalStage('tenant-1', 10);

      expect(results).toHaveLength(0);
    });

    it('queries prospects with correct filters and FIFO ordering', async () => {
      mockFindMany.mockResolvedValue([]);

      await processDiagnosisProposalStage('tenant-1', 5);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', pipelineStatus: 'audited' },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
    });

    it('logs stage failure for individual prospect errors', async () => {
      mockFindMany.mockResolvedValue([makeProspect({ id: 'p1' })]);
      mockFindUnique.mockResolvedValue(null);

      await processDiagnosisProposalStage('tenant-1', 10);

      expect(mockLogStageFailure).toHaveBeenCalledWith(
        'diagnosis',
        'p1',
        expect.any(Error),
        'tenant-1'
      );
    });
  });
});
