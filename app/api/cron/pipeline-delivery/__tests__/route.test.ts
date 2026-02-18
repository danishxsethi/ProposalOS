/**
 * Unit tests for Pipeline Delivery Cron Endpoint
 * 
 * Tests the cron endpoint that processes delivery tasks and checks for overdue escalation.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/db';
import * as deliveryEngineModule from '@/lib/pipeline/deliveryEngine';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/db', () => ({
  prisma: {
    deliveryTask: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/pipeline/deliveryEngine', () => ({
  deliveryEngine: {
    dispatchToAgent: vi.fn(),
    verifyDeliverable: vi.fn(),
    escalateOverdue: vi.fn(),
    checkAllComplete: vi.fn(),
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTask(overrides: any = {}) {
  return {
    id: 'task-1',
    tenantId: 'tenant-1',
    proposalId: 'proposal-1',
    findingId: 'finding-1',
    agentType: 'speed_optimization',
    status: 'queued',
    estimatedCompletionDate: new Date(Date.now() + 86400000),
    completedAt: null,
    verificationAuditId: null,
    beforeAfterComparison: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockRequest(authHeader?: string) {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'authorization') {
          return authHeader || null;
        }
        return null;
      },
    },
  } as Request;
}

// ============================================================================
// Tests
// ============================================================================

describe('Pipeline Delivery Cron Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject requests without CRON_SECRET', async () => {
      const req = createMockRequest();

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid CRON_SECRET', async () => {
      const req = createMockRequest('Bearer wrong-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept requests with valid CRON_SECRET', async () => {
      vi.mocked(prisma.deliveryTask.findMany).mockResolvedValue([]);
      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // ==========================================================================
  // Queued Task Processing Tests
  // ==========================================================================

  describe('Queued Task Processing', () => {
    it('should dispatch queued tasks to agents', async () => {
      const queuedTasks = [
        createMockTask({ id: 'task-1', status: 'queued' }),
        createMockTask({ id: 'task-2', status: 'queued', agentType: 'seo_fix' }),
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce(queuedTasks) // First call for queued tasks
        .mockResolvedValueOnce([]) // Second call for completed tasks
        .mockResolvedValueOnce([]); // Third call for verified tasks

      vi.mocked(deliveryEngineModule.deliveryEngine.dispatchToAgent).mockResolvedValue();
      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dispatched).toBe(2);
      expect(deliveryEngineModule.deliveryEngine.dispatchToAgent).toHaveBeenCalledTimes(2);
    });

    it('should handle dispatch failures gracefully', async () => {
      const queuedTasks = [
        createMockTask({ id: 'task-1', status: 'queued' }),
        createMockTask({ id: 'task-2', status: 'queued' }),
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce(queuedTasks)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(deliveryEngineModule.deliveryEngine.dispatchToAgent)
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Agent unavailable'));
      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dispatched).toBe(2);
      expect(data.results.dispatchResults[0].status).toBe('Dispatched');
      expect(data.results.dispatchResults[1].status).toBe('Failed');
      expect(data.results.dispatchResults[1].error).toBe('Agent unavailable');
    });

    it('should limit queued tasks to MAX_TASKS_PER_RUN', async () => {
      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      await GET(req);

      // Verify findMany was called with take: 50
      expect(prisma.deliveryTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  // ==========================================================================
  // Completed Task Verification Tests
  // ==========================================================================

  describe('Completed Task Verification', () => {
    it('should verify completed tasks', async () => {
      const completedTasks = [
        createMockTask({ id: 'task-1', status: 'completed', completedAt: new Date() }),
        createMockTask({ id: 'task-2', status: 'completed', completedAt: new Date() }),
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([]) // Queued tasks
        .mockResolvedValueOnce(completedTasks) // Completed tasks
        .mockResolvedValueOnce([]); // Verified tasks

      vi.mocked(deliveryEngineModule.deliveryEngine.verifyDeliverable).mockResolvedValue({
        verified: true,
        improvementPercent: 35,
        beforeAfterComparison: { before: { score: 50 }, after: { score: 85 } },
      });
      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.verified).toBe(2);
      expect(deliveryEngineModule.deliveryEngine.verifyDeliverable).toHaveBeenCalledTimes(2);
    });

    it('should handle verification failures gracefully', async () => {
      const completedTasks = [
        createMockTask({ id: 'task-1', status: 'completed', completedAt: new Date() }),
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(completedTasks)
        .mockResolvedValueOnce([]);

      vi.mocked(deliveryEngineModule.deliveryEngine.verifyDeliverable).mockRejectedValue(
        new Error('Verification failed')
      );
      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.verified).toBe(1);
      expect(data.results.verificationResults[0].status).toBe('Verification Failed');
      expect(data.results.verificationResults[0].error).toBe('Verification failed');
    });
  });

  // ==========================================================================
  // Overdue Task Escalation Tests
  // ==========================================================================

  describe('Overdue Task Escalation', () => {
    it('should escalate overdue tasks', async () => {
      const escalatedTasks = [
        {
          id: 'task-1',
          proposalId: 'proposal-1',
          findingId: 'finding-1',
          agentType: 'speed_optimization' as const,
          status: 'escalated' as const,
          estimatedCompletionDate: new Date(Date.now() - 86400000),
        },
        {
          id: 'task-2',
          proposalId: 'proposal-1',
          findingId: 'finding-2',
          agentType: 'seo_fix' as const,
          status: 'escalated' as const,
          estimatedCompletionDate: new Date(Date.now() - 172800000),
        },
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue(
        escalatedTasks
      );

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.escalated).toBe(2);
      expect(data.results.escalatedTasks).toEqual(['task-1', 'task-2']);
      expect(deliveryEngineModule.deliveryEngine.escalateOverdue).toHaveBeenCalledTimes(1);
    });

    it('should handle no overdue tasks', async () => {
      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.escalated).toBe(0);
      expect(data.results.escalatedTasks).toEqual([]);
    });
  });

  // ==========================================================================
  // Proposal Completion Check Tests
  // ==========================================================================

  describe('Proposal Completion Check', () => {
    it('should check for completed proposals', async () => {
      const verifiedTasks = [
        createMockTask({ id: 'task-1', proposalId: 'proposal-1', status: 'verified' }),
        createMockTask({ id: 'task-2', proposalId: 'proposal-2', status: 'verified' }),
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(verifiedTasks);

      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);
      vi.mocked(deliveryEngineModule.deliveryEngine.checkAllComplete)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.delivered).toBe(1);
      expect(data.results.deliveredProposals).toEqual(['proposal-1']);
      expect(deliveryEngineModule.deliveryEngine.checkAllComplete).toHaveBeenCalledWith(
        'proposal-1'
      );
      expect(deliveryEngineModule.deliveryEngine.checkAllComplete).toHaveBeenCalledWith(
        'proposal-2'
      );
    });

    it('should handle completion check failures gracefully', async () => {
      const verifiedTasks = [
        createMockTask({ id: 'task-1', proposalId: 'proposal-1', status: 'verified' }),
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(verifiedTasks);

      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue([]);
      vi.mocked(deliveryEngineModule.deliveryEngine.checkAllComplete).mockRejectedValue(
        new Error('Check failed')
      );

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.delivered).toBe(0);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.deliveryTask.findMany).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
      expect(data.message).toBe('Database error');
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should process all stages in a single run', async () => {
      const queuedTasks = [createMockTask({ id: 'task-1', status: 'queued' })];
      const completedTasks = [
        createMockTask({ id: 'task-2', status: 'completed', completedAt: new Date() }),
      ];
      const verifiedTasks = [
        createMockTask({ id: 'task-3', proposalId: 'proposal-1', status: 'verified' }),
      ];
      const escalatedTasks = [
        {
          id: 'task-4',
          proposalId: 'proposal-2',
          findingId: 'finding-4',
          agentType: 'speed_optimization' as const,
          status: 'escalated' as const,
          estimatedCompletionDate: new Date(Date.now() - 86400000),
        },
      ];

      vi.mocked(prisma.deliveryTask.findMany)
        .mockResolvedValueOnce(queuedTasks)
        .mockResolvedValueOnce(completedTasks)
        .mockResolvedValueOnce(verifiedTasks);

      vi.mocked(deliveryEngineModule.deliveryEngine.dispatchToAgent).mockResolvedValue();
      vi.mocked(deliveryEngineModule.deliveryEngine.verifyDeliverable).mockResolvedValue({
        verified: true,
        improvementPercent: 40,
        beforeAfterComparison: {},
      });
      vi.mocked(deliveryEngineModule.deliveryEngine.escalateOverdue).mockResolvedValue(
        escalatedTasks
      );
      vi.mocked(deliveryEngineModule.deliveryEngine.checkAllComplete).mockResolvedValue(true);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dispatched).toBe(1);
      expect(data.verified).toBe(1);
      expect(data.escalated).toBe(1);
      expect(data.delivered).toBe(1);
    });
  });
});
