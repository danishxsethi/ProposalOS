/**
 * Unit tests for Pipeline Metrics and Observability
 * 
 * These tests verify specific examples and edge cases for metrics calculation,
 * stage failure logging, circuit breaker functionality, and admin alerting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getMetrics, logStageFailure, checkCircuitBreaker, alertAdmin } from '../metrics';
import { PipelineStage } from '../types';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    prospectLead: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    outreachEmail: {
      count: vi.fn(),
    },
    outreachEmailEvent: {
      groupBy: vi.fn(),
    },
    audit: {
      aggregate: vi.fn(),
    },
    pipelineErrorLog: {
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    prospectStateTransition: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    pipelineConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock orchestrator pauseStage function
vi.mock('../orchestrator', () => ({
  pauseStage: vi.fn(),
}));

describe('Pipeline Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMetrics()', () => {
    it('should calculate metrics for a 1-day period', async () => {
      const tenantId = 'tenant-1';
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-02T00:00:00Z');

      // Mock prospect counts
      vi.mocked(prisma.prospectLead.count)
        .mockResolvedValueOnce(10) // discovered
        .mockResolvedValueOnce(8)  // audited
        .mockResolvedValueOnce(6)  // proposed
        .mockResolvedValueOnce(2)  // conversions
        .mockResolvedValueOnce(1)  // human touch
        .mockResolvedValueOnce(10); // total prospects

      // Mock email counts
      vi.mocked(prisma.outreachEmail.count).mockResolvedValue(5);

      // Mock email events
      vi.mocked(prisma.outreachEmailEvent.groupBy).mockResolvedValue([
        { type: 'EMAIL_OPEN', _count: 3 },
        { type: 'REPLY_RECEIVED', _count: 1 },
      ] as any);

      // Mock cost aggregates
      vi.mocked(prisma.prospectLead.aggregate).mockResolvedValue({
        _sum: { estimatedCostCents: 1000 },
      } as any);

      vi.mocked(prisma.audit.aggregate).mockResolvedValue({
        _sum: { apiCostCents: 2000 },
      } as any);

      // Mock error and transition counts for stage error rates
      vi.mocked(prisma.pipelineErrorLog.groupBy).mockResolvedValue([
        { stage: PipelineStage.AUDIT, _count: 1 },
      ] as any);

      vi.mocked(prisma.prospectStateTransition.groupBy).mockResolvedValue([
        { stage: PipelineStage.AUDIT, _count: 10 },
      ] as any);

      const metrics = await getMetrics(tenantId, { start, end });

      expect(metrics.tenantId).toBe(tenantId);
      expect(metrics.discoveredPerDay).toBe(10);
      expect(metrics.auditsCompletedPerDay).toBe(8);
      expect(metrics.proposalsGeneratedPerDay).toBe(6);
      expect(metrics.emailsSentPerDay).toBe(5);
      expect(metrics.openRate).toBe(0.6); // 3/5
      expect(metrics.replyRate).toBe(0.2); // 1/5
      expect(metrics.conversionRate).toBe(0.4); // 2/5
      expect(metrics.totalCostCents).toBe(3000); // 1000 + 2000
      expect(metrics.humanTouchRate).toBe(0.1); // 1/10
      expect(metrics.stageErrorRates[PipelineStage.AUDIT]).toBe(0.1); // 1/10
    });

    it('should handle zero emails sent', async () => {
      const tenantId = 'tenant-1';
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-02T00:00:00Z');

      vi.mocked(prisma.prospectLead.count).mockResolvedValue(0);
      vi.mocked(prisma.outreachEmail.count).mockResolvedValue(0);
      vi.mocked(prisma.outreachEmailEvent.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.prospectLead.aggregate).mockResolvedValue({
        _sum: { estimatedCostCents: 0 },
      } as any);
      vi.mocked(prisma.audit.aggregate).mockResolvedValue({
        _sum: { apiCostCents: 0 },
      } as any);
      vi.mocked(prisma.pipelineErrorLog.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.prospectStateTransition.groupBy).mockResolvedValue([]);

      const metrics = await getMetrics(tenantId, { start, end });

      expect(metrics.openRate).toBe(0);
      expect(metrics.replyRate).toBe(0);
      expect(metrics.conversionRate).toBe(0);
    });

    it('should calculate per-day averages for multi-day periods', async () => {
      const tenantId = 'tenant-1';
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-08T00:00:00Z'); // 7 days

      vi.mocked(prisma.prospectLead.count)
        .mockResolvedValueOnce(70) // discovered
        .mockResolvedValueOnce(56) // audited
        .mockResolvedValueOnce(42) // proposed
        .mockResolvedValueOnce(14) // conversions
        .mockResolvedValueOnce(7)  // human touch
        .mockResolvedValueOnce(70); // total

      vi.mocked(prisma.outreachEmail.count).mockResolvedValue(35);
      vi.mocked(prisma.outreachEmailEvent.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.prospectLead.aggregate).mockResolvedValue({
        _sum: { estimatedCostCents: 0 },
      } as any);
      vi.mocked(prisma.audit.aggregate).mockResolvedValue({
        _sum: { apiCostCents: 0 },
      } as any);
      vi.mocked(prisma.pipelineErrorLog.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.prospectStateTransition.groupBy).mockResolvedValue([]);

      const metrics = await getMetrics(tenantId, { start, end });

      expect(metrics.discoveredPerDay).toBe(10); // 70/7
      expect(metrics.auditsCompletedPerDay).toBe(8); // 56/7
      expect(metrics.proposalsGeneratedPerDay).toBe(6); // 42/7
      expect(metrics.emailsSentPerDay).toBe(5); // 35/7
    });
  });

  describe('logStageFailure()', () => {
    it('should log stage failure with all required fields', async () => {
      const stage = PipelineStage.AUDIT;
      const prospectId = 'prospect-123';
      const error = new Error('Audit failed');
      error.stack = 'Error: Audit failed\n  at ...';
      const tenantId = 'tenant-1';

      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      await logStageFailure(stage, prospectId, error, tenantId);

      expect(prisma.pipelineErrorLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          stage,
          prospectId,
          errorType: 'Error',
          errorMessage: 'Audit failed',
          stackTrace: error.stack,
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
          }),
        },
      });
    });

    it('should handle null prospectId', async () => {
      const stage = PipelineStage.DISCOVERY;
      const error = new Error('Discovery failed');
      const tenantId = 'tenant-1';

      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      await logStageFailure(stage, null, error, tenantId);

      expect(prisma.pipelineErrorLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          prospectId: undefined,
        }),
      });
    });

    it('should handle errors without stack traces', async () => {
      const stage = PipelineStage.OUTREACH;
      const error = new Error('Outreach failed');
      delete error.stack;
      const tenantId = 'tenant-1';

      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      await logStageFailure(stage, 'prospect-123', error, tenantId);

      expect(prisma.pipelineErrorLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stackTrace: undefined,
        }),
      });
    });
  });

  describe('checkCircuitBreaker()', () => {
    it('should return false when error rate is below threshold', async () => {
      const stage = PipelineStage.AUDIT;
      const tenantId = 'tenant-1';

      // 5 errors out of 100 operations = 5% error rate (below 10% threshold)
      vi.mocked(prisma.pipelineErrorLog.count).mockResolvedValue(5);
      vi.mocked(prisma.prospectStateTransition.count).mockResolvedValue(100);

      const tripped = await checkCircuitBreaker(stage, tenantId);

      expect(tripped).toBe(false);
    });

    it('should return true and pause stage when error rate exceeds threshold', async () => {
      const stage = PipelineStage.AUDIT;
      const tenantId = 'tenant-1';

      // 15 errors out of 100 operations = 15% error rate (above 10% threshold)
      vi.mocked(prisma.pipelineErrorLog.count).mockResolvedValue(15);
      vi.mocked(prisma.prospectStateTransition.count).mockResolvedValue(100);
      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      const { pauseStage } = await import('../orchestrator');

      const tripped = await checkCircuitBreaker(stage, tenantId);

      expect(tripped).toBe(true);
      expect(pauseStage).toHaveBeenCalledWith(stage, tenantId);
      expect(prisma.pipelineErrorLog.create).toHaveBeenCalled();
    });

    it('should handle exactly 10% error rate as not tripped', async () => {
      const stage = PipelineStage.OUTREACH;
      const tenantId = 'tenant-1';

      // 10 errors out of 100 operations = 10% error rate (at threshold, not above)
      vi.mocked(prisma.pipelineErrorLog.count).mockResolvedValue(10);
      vi.mocked(prisma.prospectStateTransition.count).mockResolvedValue(100);

      const tripped = await checkCircuitBreaker(stage, tenantId);

      expect(tripped).toBe(false);
    });

    it('should handle zero operations gracefully', async () => {
      const stage = PipelineStage.DELIVERY;
      const tenantId = 'tenant-1';

      vi.mocked(prisma.pipelineErrorLog.count).mockResolvedValue(0);
      vi.mocked(prisma.prospectStateTransition.count).mockResolvedValue(0);

      const tripped = await checkCircuitBreaker(stage, tenantId);

      expect(tripped).toBe(false);
    });

    it('should query rolling 1-hour window', async () => {
      const stage = PipelineStage.AUDIT;
      const tenantId = 'tenant-1';

      vi.mocked(prisma.pipelineErrorLog.count).mockResolvedValue(5);
      vi.mocked(prisma.prospectStateTransition.count).mockResolvedValue(100);

      await checkCircuitBreaker(stage, tenantId);

      // Verify that the query includes a time window
      const errorCountCall = vi.mocked(prisma.pipelineErrorLog.count).mock.calls[0][0];
      expect(errorCountCall?.where?.createdAt).toBeDefined();
      expect(errorCountCall?.where?.createdAt?.gte).toBeInstanceOf(Date);
      expect(errorCountCall?.where?.createdAt?.lte).toBeInstanceOf(Date);

      const transitionCountCall = vi.mocked(prisma.prospectStateTransition.count).mock.calls[0][0];
      expect(transitionCountCall?.where?.createdAt).toBeDefined();
      expect(transitionCountCall?.where?.createdAt?.gte).toBeInstanceOf(Date);
      expect(transitionCountCall?.where?.createdAt?.lte).toBeInstanceOf(Date);
    });
  });

  describe('alertAdmin()', () => {
    it('should log alert to console and database', async () => {
      const tenantId = 'tenant-1';
      const message = 'Circuit breaker tripped';

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      await alertAdmin(tenantId, message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(tenantId)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(message)
      );

      expect(prisma.pipelineErrorLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          stage: 'system',
          errorType: 'ADMIN_ALERT',
          errorMessage: message,
          metadata: expect.objectContaining({
            alertType: 'circuit_breaker',
            timestamp: expect.any(String),
          }),
        },
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
