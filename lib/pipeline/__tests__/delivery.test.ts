import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryEngine } from '../deliveryEngine';

import type { Deliverable } from '../types';

// Mock the canonical scoped Prisma client (delivery engine now imports from @/lib/prisma,
// and resolves the owning tenant via runScopedToOwnerTenant / withSystemDbBypass — Wave 1 P1-05).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    proposal: {
      findUnique: vi.fn(),
    },
    deliveryTask: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

// Tenant-context helpers are exercised for real elsewhere (tests/security/wave1-tenant-scoping.test.ts).
// Here we make them transparent passthroughs so existing prisma-call assertions stay focused on
// business logic, while still calling through to the (mocked) lookup/prisma the way production does.
vi.mock('@/lib/tenant/context', () => ({
  runScopedToOwnerTenant: async (
    _reason: string,
    lookupTenantId: () => Promise<string | null>,
    fn: (tenantId: string) => Promise<unknown>
  ) => {
    const tenantId = await lookupTenantId();
    if (!tenantId) throw new Error('runScopedToOwnerTenant: could not resolve owning tenant');
    return fn(tenantId);
  },
  runWithTenantAsync: async (_tenantId: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/db', () => ({
  withSystemDbBypass: async (_reason: string, fn: (client: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/prisma');
    return fn(prisma);
  },
}));

import { prisma } from '@/lib/prisma';

describe('Delivery Engine Unit Tests', () => {
  let deliveryEngine: DeliveryEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    deliveryEngine = new DeliveryEngine();
    // Default: resolve to a tenant for checkAllComplete's owner-tenant lookup;
    // individual tests override deliveryTask.findMany/findUnique as needed.
    (prisma.deliveryTask.findFirst as any).mockResolvedValue({ tenantId: 'tenant-123' });
  });

  describe('generateDeliverables', () => {
    it('should generate deliverables for essentials tier', async () => {
      const proposalId = 'proposal-123';
      const tenantId = 'tenant-123';
      const findingIds = ['finding-1', 'finding-2'];

      const mockProposal = {
        id: proposalId,
        tenantId,
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds },
        audit: {
          findings: [
            { id: 'finding-1', category: 'SPEED', title: 'Slow page load' },
            { id: 'finding-2', category: 'SEO', title: 'Missing meta tags' },
          ],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `task-${data.findingId}`, ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables(proposalId, 'essentials');

      expect(deliverables).toHaveLength(2);
      expect(deliverables[0].findingId).toBe('finding-1');
      expect(deliverables[0].agentType).toBe('speed_optimization');
      expect(deliverables[1].findingId).toBe('finding-2');
      expect(deliverables[1].agentType).toBe('seo_fix');
      expect(deliverables[0].status).toBe('queued');
      expect(deliverables[1].status).toBe('queued');
    });

    it('should generate deliverables for growth tier', async () => {
      const proposalId = 'proposal-456';
      const tenantId = 'tenant-123';
      const findingIds = ['finding-3', 'finding-4', 'finding-5'];

      const mockProposal = {
        id: proposalId,
        tenantId,
        acceptance: { tier: 'growth' },
        tierGrowth: { findingIds },
        audit: {
          findings: [
            { id: 'finding-3', category: 'ACCESSIBILITY', title: 'Missing alt text' },
            { id: 'finding-4', category: 'SECURITY', title: 'Weak SSL config' },
            { id: 'finding-5', category: 'CONTENT', title: 'Thin content' },
          ],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `task-${data.findingId}`, ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables(proposalId, 'growth');

      expect(deliverables).toHaveLength(3);
      expect(deliverables[0].agentType).toBe('accessibility');
      expect(deliverables[1].agentType).toBe('security_hardening');
      expect(deliverables[2].agentType).toBe('content_generation');
    });

    it('should generate deliverables for premium tier', async () => {
      const proposalId = 'proposal-789';
      const tenantId = 'tenant-123';
      const findingIds = ['finding-6'];

      const mockProposal = {
        id: proposalId,
        tenantId,
        acceptance: { tier: 'premium' },
        tierPremium: { findingIds },
        audit: {
          findings: [{ id: 'finding-6', category: 'PERFORMANCE', title: 'Large images' }],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `task-${data.findingId}`, ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables(proposalId, 'premium');

      expect(deliverables).toHaveLength(1);
      expect(deliverables[0].agentType).toBe('speed_optimization');
    });

    it('should throw error if proposal not found', async () => {
      (prisma.proposal.findUnique as any).mockResolvedValue(null);

      await expect(deliveryEngine.generateDeliverables('invalid-id', 'essentials')).rejects.toThrow(
        'Proposal not found'
      );
    });

    it('should throw error if proposal not accepted', async () => {
      const mockProposal = {
        id: 'proposal-123',
        tenantId: 'tenant-123',
        acceptance: null,
        tierEssentials: { findingIds: [] },
        audit: { findings: [] },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);

      await expect(
        deliveryEngine.generateDeliverables('proposal-123', 'essentials')
      ).rejects.toThrow('Proposal not accepted');
    });

    it('should throw error if proposal missing tenantId', async () => {
      const mockProposal = {
        id: 'proposal-123',
        tenantId: null,
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds: [] },
        audit: { findings: [] },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);

      await expect(
        deliveryEngine.generateDeliverables('proposal-123', 'essentials')
      ).rejects.toThrow('Proposal missing tenantId');
    });

    it('should skip findings not in audit', async () => {
      const proposalId = 'proposal-123';
      const tenantId = 'tenant-123';
      const findingIds = ['finding-1', 'finding-missing', 'finding-2'];

      const mockProposal = {
        id: proposalId,
        tenantId,
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds },
        audit: {
          findings: [
            { id: 'finding-1', category: 'SPEED', title: 'Slow page load' },
            { id: 'finding-2', category: 'SEO', title: 'Missing meta tags' },
          ],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `task-${data.findingId}`, ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables(proposalId, 'essentials');

      // Should only create deliverables for found findings
      expect(deliverables).toHaveLength(2);
      expect(deliverables.find((d) => d.findingId === 'finding-missing')).toBeUndefined();
    });

    it('should set correct estimated completion dates by tier', async () => {
      const proposalId = 'proposal-123';
      const tenantId = 'tenant-123';
      const findingIds = ['finding-1'];

      const mockProposal = {
        id: proposalId,
        tenantId,
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds },
        audit: {
          findings: [{ id: 'finding-1', category: 'SPEED', title: 'Slow page load' }],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `task-${data.findingId}`, ...data })
      );

      const now = Date.now();
      const deliverables = await deliveryEngine.generateDeliverables(proposalId, 'essentials');

      // Essentials tier should have 14 day timeline
      const expectedDate = now + 14 * 24 * 60 * 60 * 1000;
      const actualDate = deliverables[0].estimatedCompletionDate.getTime();

      // Allow 1 minute tolerance
      expect(Math.abs(actualDate - expectedDate)).toBeLessThan(60000);
    });
  });

  describe('dispatchToAgent', () => {
    it('should update status to in_progress', async () => {
      const deliverable: Deliverable = {
        id: 'task-123',
        proposalId: 'proposal-123',
        findingId: 'finding-123',
        agentType: 'speed_optimization',
        status: 'queued',
        estimatedCompletionDate: new Date(),
      };

      (prisma.deliveryTask.update as any).mockResolvedValue({
        ...deliverable,
        status: 'in_progress',
      });
      (prisma.deliveryTask.findUnique as any).mockResolvedValue({
        tenantId: 'tenant-123',
      });

      await deliveryEngine.dispatchToAgent(deliverable);

      expect(prisma.deliveryTask.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: { status: 'in_progress' },
      });

      // No approved delivery executor exists, so execution must remain visible for human action.
      expect(prisma.deliveryTask.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: {
          status: 'escalated',
          errorMessage: expect.stringContaining('DELIVERY_EXECUTOR_UNAVAILABLE'),
        },
      });
    });

    it('does not fabricate a provider failure or completion when no executor exists', async () => {
      const deliverable: Deliverable = {
        id: 'task-123',
        proposalId: 'proposal-123',
        findingId: 'finding-123',
        agentType: 'seo_fix',
        status: 'queued',
        estimatedCompletionDate: new Date(),
      };

      (prisma.deliveryTask.update as any).mockResolvedValue({
        ...deliverable,
        status: 'in_progress',
      });
      (prisma.deliveryTask.findUnique as any).mockResolvedValue({
        tenantId: 'tenant-123',
      });

      await deliveryEngine.dispatchToAgent(deliverable);

      expect(prisma.deliveryTask.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: {
          status: 'escalated',
          errorMessage: expect.stringContaining('DELIVERY_EXECUTOR_UNAVAILABLE'),
        },
      });
    });
  });

  describe('verifyDeliverable', () => {
    it('refuses to verify a completed deliverable without a canonical re-audit gate', async () => {
      const deliverableId = 'task-123';

      (prisma.deliveryTask.findUnique as any).mockResolvedValue({
        id: deliverableId,
        tenantId: 'tenant-123',
        status: 'completed',
      });

      await expect(deliveryEngine.verifyDeliverable(deliverableId)).rejects.toThrow(
        'DELIVERY_VERIFICATION_UNAVAILABLE'
      );
      expect(prisma.deliveryTask.update).not.toHaveBeenCalled();
    });

    it('should throw error if deliverable not found', async () => {
      (prisma.deliveryTask.findUnique as any).mockResolvedValue(null);

      await expect(deliveryEngine.verifyDeliverable('invalid-id')).rejects.toThrow(
        'Deliverable not found'
      );
    });

    it('should throw error if deliverable not completed', async () => {
      (prisma.deliveryTask.findUnique as any).mockResolvedValue({
        id: 'task-123',
        status: 'in_progress',
      });

      await expect(deliveryEngine.verifyDeliverable('task-123')).rejects.toThrow(
        'Deliverable not completed'
      );
    });
  });

  describe('escalateOverdue', () => {
    it('should escalate overdue tasks', async () => {
      const overdueTasks = [
        {
          id: 'task-1',
          proposalId: 'proposal-123',
          findingId: 'finding-1',
          agentType: 'speed_optimization',
          status: 'in_progress',
          estimatedCompletionDate: new Date(Date.now() - 86400000), // 1 day ago
          tenantId: 'tenant-123',
          completedAt: null,
          verificationAuditId: null,
          beforeAfterComparison: null,
        },
        {
          id: 'task-2',
          proposalId: 'proposal-123',
          findingId: 'finding-2',
          agentType: 'seo_fix',
          status: 'queued',
          estimatedCompletionDate: new Date(Date.now() - 172800000), // 2 days ago
          tenantId: 'tenant-123',
          completedAt: null,
          verificationAuditId: null,
          beforeAfterComparison: null,
        },
      ];

      (prisma.deliveryTask.findMany as any).mockResolvedValue(overdueTasks);
      (prisma.deliveryTask.updateMany as any).mockResolvedValue({ count: 2 });

      const escalated = await deliveryEngine.escalateOverdue();

      expect(escalated).toHaveLength(2);
      expect(escalated[0].status).toBe('escalated');
      expect(escalated[1].status).toBe('escalated');

      expect(prisma.deliveryTask.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['task-1', 'task-2'] } },
        data: { status: 'escalated' },
      });
    });

    it('should return empty array if no overdue tasks', async () => {
      (prisma.deliveryTask.findMany as any).mockResolvedValue([]);
      (prisma.deliveryTask.updateMany as any).mockResolvedValue({ count: 0 });

      const escalated = await deliveryEngine.escalateOverdue();

      expect(escalated).toHaveLength(0);
    });

    it('should not escalate completed or verified tasks', async () => {
      (prisma.deliveryTask.findMany as any).mockResolvedValue([]);

      await deliveryEngine.escalateOverdue();

      expect(prisma.deliveryTask.findMany).toHaveBeenCalledWith({
        where: {
          estimatedCompletionDate: { lt: expect.any(Date) },
          status: { notIn: ['completed', 'verified', 'escalated'] },
        },
      });
    });
  });

  describe('checkAllComplete', () => {
    it('should return true when all tasks are verified', async () => {
      const tasks = [
        { id: 'task-1', status: 'verified' },
        { id: 'task-2', status: 'verified' },
        { id: 'task-3', status: 'verified' },
      ];

      (prisma.deliveryTask.findMany as any).mockResolvedValue(tasks);

      const result = await deliveryEngine.checkAllComplete('proposal-123');

      expect(result).toBe(true);
    });

    it('should return false when some tasks are not verified', async () => {
      const tasks = [
        { id: 'task-1', status: 'verified' },
        { id: 'task-2', status: 'completed' },
        { id: 'task-3', status: 'in_progress' },
      ];

      (prisma.deliveryTask.findMany as any).mockResolvedValue(tasks);

      const result = await deliveryEngine.checkAllComplete('proposal-123');

      expect(result).toBe(false);
    });

    it('should return false when no tasks exist', async () => {
      (prisma.deliveryTask.findMany as any).mockResolvedValue([]);

      const result = await deliveryEngine.checkAllComplete('proposal-123');

      expect(result).toBe(false);
    });

    it('should query tasks by proposalId', async () => {
      (prisma.deliveryTask.findMany as any).mockResolvedValue([]);

      await deliveryEngine.checkAllComplete('proposal-456');

      expect(prisma.deliveryTask.findMany).toHaveBeenCalledWith({
        where: { proposalId: 'proposal-456' },
      });
    });
  });

  describe('agent type mapping', () => {
    it('should map SPEED category to speed_optimization', async () => {
      const mockProposal = {
        id: 'proposal-123',
        tenantId: 'tenant-123',
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds: ['finding-1'] },
        audit: {
          findings: [{ id: 'finding-1', category: 'SPEED', title: 'Slow load' }],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'task-1', ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables('proposal-123', 'essentials');

      expect(deliverables[0].agentType).toBe('speed_optimization');
    });

    it('should map PERFORMANCE category to speed_optimization', async () => {
      const mockProposal = {
        id: 'proposal-123',
        tenantId: 'tenant-123',
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds: ['finding-1'] },
        audit: {
          findings: [{ id: 'finding-1', category: 'PERFORMANCE', title: 'Large images' }],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'task-1', ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables('proposal-123', 'essentials');

      expect(deliverables[0].agentType).toBe('speed_optimization');
    });

    it('should default to seo_fix for unknown categories', async () => {
      const mockProposal = {
        id: 'proposal-123',
        tenantId: 'tenant-123',
        acceptance: { tier: 'essentials' },
        tierEssentials: { findingIds: ['finding-1'] },
        audit: {
          findings: [{ id: 'finding-1', category: 'UNKNOWN', title: 'Unknown issue' }],
        },
      };

      (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
      (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'task-1', ...data })
      );

      const deliverables = await deliveryEngine.generateDeliverables('proposal-123', 'essentials');

      expect(deliverables[0].agentType).toBe('seo_fix');
    });
  });
});
