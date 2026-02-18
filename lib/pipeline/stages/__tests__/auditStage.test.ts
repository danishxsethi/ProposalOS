/**
 * Unit tests for Audit Pipeline Stage
 *
 * Tests processAuditStage() and processOneAudit() with mocked
 * Prisma, AuditOrchestrator, and state machine.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StageResult } from '../../types';

// --- Mocks ---

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockAuditCreate = vi.fn();
const mockAuditUpdate = vi.fn();
const mockProspectUpdate = vi.fn();
const mockErrorLogCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    prospectLead: {
      findMany: (...args: any[]) => mockFindMany(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockProspectUpdate(...args),
    },
    audit: {
      create: (...args: any[]) => mockAuditCreate(...args),
      update: (...args: any[]) => mockAuditUpdate(...args),
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

const mockOrchestratorRun = vi.fn();
vi.mock('@/lib/orchestrator/auditOrchestrator', () => {
  return {
    AuditOrchestrator: class MockAuditOrchestrator {
      constructor() {}
      run() {
        return mockOrchestratorRun();
      }
    },
  };
});

vi.mock('@/lib/costs/costTracker', () => {
  return {
    CostTracker: class MockCostTracker {
      getTotalCents() {
        return 42;
      }
    },
  };
});

import { processAuditStage, processOneAudit } from '../auditStage';

// --- Helpers ---

function makeProspect(overrides: Record<string, any> = {}) {
  return {
    id: 'prospect-1',
    tenantId: 'tenant-1',
    businessName: 'Test Biz',
    city: 'Portland',
    website: 'https://testbiz.com',
    vertical: 'dentist',
    pipelineStatus: 'discovered',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAudit(id = 'audit-1') {
  return { id, tenantId: 'tenant-1', status: 'QUEUED' };
}

// --- Tests ---

describe('Audit Stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditCreate.mockResolvedValue(makeAudit());
    mockAuditUpdate.mockResolvedValue({});
    mockProspectUpdate.mockResolvedValue({});
    mockTransition.mockResolvedValue({
      from: 'discovered',
      to: 'audited',
      timestamp: new Date(),
      stage: 'audit',
      tenantId: 'tenant-1',
    });
    mockErrorLogCreate.mockResolvedValue({});
    mockLogStageFailure.mockResolvedValue(undefined);
  });

  describe('processOneAudit', () => {
    it('transitions to "audited" when orchestrator returns COMPLETE', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [{ id: 'f1' }],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: ['website', 'gbp'],
      });

      const result = await processOneAudit('prospect-1');

      expect(result.success).toBe(true);
      expect(result.toStatus).toBe('audited');
      expect(result.costCents).toBe(42);
      expect(mockTransition).toHaveBeenCalledWith('prospect-1', 'audited', 'audit');
    });

    it('transitions to "audited" when orchestrator returns PARTIAL', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'PARTIAL',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 60,
        modulesCompleted: ['website'],
      });

      const result = await processOneAudit('prospect-1');

      expect(result.success).toBe(true);
      expect(result.toStatus).toBe('audited');
    });

    it('transitions to "audit_failed" when orchestrator returns FAILED', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'FAILED',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 0,
        modulesCompleted: [],
      });

      const result = await processOneAudit('prospect-1');

      expect(result.success).toBe(false);
      expect(result.toStatus).toBe('audit_failed');
      expect(mockTransition).toHaveBeenCalledWith('prospect-1', 'audit_failed', 'audit');
    });

    it('transitions to "audit_failed" when orchestrator throws', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockRejectedValue(new Error('Network timeout'));

      const result = await processOneAudit('prospect-1');

      expect(result.success).toBe(false);
      expect(result.toStatus).toBe('audit_failed');
      expect(result.error).toBe('Network timeout');
    });

    it('creates an Audit record before running the orchestrator', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: [],
      });

      await processOneAudit('prospect-1');

      expect(mockAuditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessName: 'Test Biz',
          businessCity: 'Portland',
          businessUrl: 'https://testbiz.com',
          businessIndustry: 'dentist',
          status: 'QUEUED',
          tenantId: 'tenant-1',
        }),
      });
    });

    it('links auditId to ProspectLead on success', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: [],
      });

      await processOneAudit('prospect-1');

      expect(mockProspectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prospect-1' },
          data: { auditId: 'audit-1' },
        })
      );
    });

    it('records audit cost against tenant on success', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: [],
      });

      await processOneAudit('prospect-1');

      expect(mockErrorLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          stage: 'audit',
          errorType: 'COST_RECORD',
          metadata: expect.objectContaining({ costCents: 42, auditId: 'audit-1' }),
        }),
      });
    });

    it('records audit cost against tenant on failure', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'FAILED',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 0,
        modulesCompleted: [],
      });

      await processOneAudit('prospect-1');

      expect(mockErrorLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          stage: 'audit',
          errorType: 'COST_RECORD',
          metadata: expect.objectContaining({ costCents: 42 }),
        }),
      });
    });

    it('throws when prospect is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(processOneAudit('nonexistent')).rejects.toThrow('Prospect not found');
    });

    it('throws when prospect is not in "discovered" status', async () => {
      mockFindUnique.mockResolvedValue(makeProspect({ pipelineStatus: 'audited' }));

      await expect(processOneAudit('prospect-1')).rejects.toThrow(
        'expected "discovered"'
      );
    });

    it('includes metadata with auditId and findings count on success', async () => {
      mockFindUnique.mockResolvedValue(makeProspect());
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: ['website', 'gbp'],
      });

      const result = await processOneAudit('prospect-1');

      expect(result.metadata).toEqual(
        expect.objectContaining({
          auditId: 'audit-1',
          auditStatus: 'COMPLETE',
          findingsCount: 3,
          modulesCompleted: ['website', 'gbp'],
        })
      );
    });
  });

  describe('processAuditStage', () => {
    it('processes a batch of discovered prospects', async () => {
      const prospects = [makeProspect({ id: 'p1' }), makeProspect({ id: 'p2' })];
      mockFindMany.mockResolvedValue(prospects);
      mockFindUnique
        .mockResolvedValueOnce(makeProspect({ id: 'p1' }))
        .mockResolvedValueOnce(makeProspect({ id: 'p2' }));
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: [],
      });

      const results = await processAuditStage('tenant-1', 10);

      expect(results).toHaveLength(2);
      expect(results.every((r: StageResult) => r.success)).toBe(true);
    });

    it('continues processing when one audit fails', async () => {
      const prospects = [makeProspect({ id: 'p1' }), makeProspect({ id: 'p2' })];
      mockFindMany.mockResolvedValue(prospects);
      // First prospect: not found (will throw)
      mockFindUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeProspect({ id: 'p2' }));
      mockOrchestratorRun.mockResolvedValue({
        status: 'COMPLETE',
        findings: [],
        evidenceSnapshots: [],
        moduleTimings: {},
        progress: 100,
        modulesCompleted: [],
      });

      const results = await processAuditStage('tenant-1', 10);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });

    it('returns empty array when no discovered prospects exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const results = await processAuditStage('tenant-1', 10);

      expect(results).toHaveLength(0);
    });

    it('queries prospects with correct filters and FIFO ordering', async () => {
      mockFindMany.mockResolvedValue([]);

      await processAuditStage('tenant-1', 5);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', pipelineStatus: 'discovered' },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
    });

    it('logs stage failure for individual audit errors', async () => {
      mockFindMany.mockResolvedValue([makeProspect({ id: 'p1' })]);
      mockFindUnique.mockResolvedValue(null);

      await processAuditStage('tenant-1', 10);

      expect(mockLogStageFailure).toHaveBeenCalledWith(
        'audit',
        'p1',
        expect.any(Error),
        'tenant-1'
      );
    });
  });
});
