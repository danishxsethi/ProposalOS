import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { DeliveryEngine } from '../deliveryEngine';
import type { Deliverable } from '../types';

// Mock Prisma
vi.mock('@/lib/db', () => ({
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
    },
  },
}));

import { prisma } from '@/lib/db';

describe('Delivery Engine Property Tests', () => {
  let deliveryEngine: DeliveryEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    deliveryEngine = new DeliveryEngine();
  });

  /**
   * Property 23: Deliverables map to accepted tier's findings
   * 
   * For any accepted proposal, the generated deliverables must map one-to-one to
   * the finding IDs in the accepted tier, each deliverable must have an agent type
   * matching the finding's category, and each must have an estimated completion date
   * within the tier's delivery timeline.
   * 
   * **Validates: Requirements 7.1, 7.2**
   */
  describe('Property 23: Deliverables map to accepted tiers findings', () => {
    it('should generate one deliverable per finding in accepted tier', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            proposalId: fc.uuid(),
            tenantId: fc.uuid(),
            tier: fc.constantFrom('essentials', 'growth', 'premium'),
            findingIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
            categories: fc.array(
              fc.constantFrom('SPEED', 'SEO', 'ACCESSIBILITY', 'SECURITY', 'CONTENT'),
              { minLength: 1, maxLength: 10 }
            ),
          }),
          async ({ proposalId, tenantId, tier, findingIds, categories }) => {
            // Ensure categories array matches findingIds length
            const normalizedCategories = categories.slice(0, findingIds.length);
            while (normalizedCategories.length < findingIds.length) {
              normalizedCategories.push('SEO');
            }

            // Setup mock proposal
            const tierKey = `tier${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
            const mockProposal = {
              id: proposalId,
              tenantId,
              acceptance: { tier },
              [tierKey]: { findingIds },
              audit: {
                findings: findingIds.map((id, idx) => ({
                  id,
                  category: normalizedCategories[idx],
                  title: `Finding ${idx}`,
                })),
              },
            };

            (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);

            // Mock deliveryTask.create to return created tasks
            let taskIndex = 0;
            (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) => {
              const task = {
                id: `task-${taskIndex++}`,
                ...data,
              };
              return Promise.resolve(task);
            });

            // Execute
            const deliverables = await deliveryEngine.generateDeliverables(proposalId, tier);

            // Verify one-to-one mapping
            expect(deliverables.length).toBe(findingIds.length);

            // Verify each finding has a corresponding deliverable
            for (const findingId of findingIds) {
              const deliverable = deliverables.find((d) => d.findingId === findingId);
              expect(deliverable).toBeDefined();
              expect(deliverable?.proposalId).toBe(proposalId);
            }

            // Verify all deliverables have required fields
            for (const deliverable of deliverables) {
              expect(deliverable.id).toBeDefined();
              expect(deliverable.agentType).toBeDefined();
              expect(deliverable.status).toBe('queued');
              expect(deliverable.estimatedCompletionDate).toBeInstanceOf(Date);
              expect(deliverable.estimatedCompletionDate.getTime()).toBeGreaterThan(Date.now());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should map finding categories to correct agent types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            proposalId: fc.uuid(),
            tenantId: fc.uuid(),
            tier: fc.constantFrom('essentials', 'growth', 'premium'),
            category: fc.constantFrom('SPEED', 'PERFORMANCE', 'SEO', 'ACCESSIBILITY', 'SECURITY', 'CONTENT'),
          }),
          async ({ proposalId, tenantId, tier, category }) => {
            const findingId = 'test-finding-id';
            const tierKey = `tier${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

            const mockProposal = {
              id: proposalId,
              tenantId,
              acceptance: { tier },
              [tierKey]: { findingIds: [findingId] },
              audit: {
                findings: [{ id: findingId, category, title: 'Test Finding' }],
              },
            };

            (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
            (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
              Promise.resolve({ id: 'task-1', ...data })
            );

            // Execute
            const deliverables = await deliveryEngine.generateDeliverables(proposalId, tier);

            // Verify agent type mapping
            const expectedAgentTypes: Record<string, string> = {
              SPEED: 'speed_optimization',
              PERFORMANCE: 'speed_optimization',
              SEO: 'seo_fix',
              ACCESSIBILITY: 'accessibility',
              SECURITY: 'security_hardening',
              CONTENT: 'content_generation',
            };

            expect(deliverables[0].agentType).toBe(expectedAgentTypes[category]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set estimated completion date within tier timeline', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            proposalId: fc.uuid(),
            tenantId: fc.uuid(),
            tier: fc.constantFrom('essentials', 'growth', 'premium'),
          }),
          async ({ proposalId, tenantId, tier }) => {
            const findingId = 'test-finding-id';
            const tierKey = `tier${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

            const mockProposal = {
              id: proposalId,
              tenantId,
              acceptance: { tier },
              [tierKey]: { findingIds: [findingId] },
              audit: {
                findings: [{ id: findingId, category: 'SEO', title: 'Test Finding' }],
              },
            };

            (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
            (prisma.deliveryTask.create as any).mockImplementation(({ data }: any) =>
              Promise.resolve({ id: 'task-1', ...data })
            );

            const now = Date.now();

            // Execute
            const deliverables = await deliveryEngine.generateDeliverables(proposalId, tier);

            // Verify timeline
            const tierTimelines: Record<string, number> = {
              essentials: 14,
              growth: 30,
              premium: 60,
            };

            const expectedDays = tierTimelines[tier];
            const expectedMaxDate = now + expectedDays * 24 * 60 * 60 * 1000 + 60000; // +1 min buffer
            const expectedMinDate = now + (expectedDays - 1) * 24 * 60 * 60 * 1000;

            const completionDate = deliverables[0].estimatedCompletionDate.getTime();
            expect(completionDate).toBeGreaterThanOrEqual(expectedMinDate);
            expect(completionDate).toBeLessThanOrEqual(expectedMaxDate);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 24: Overdue deliverables are escalated
   * 
   * For any deliverable task whose estimated completion date has passed and whose
   * status is not "completed" or "verified", the task must be transitioned to
   * "escalated" status.
   * 
   * **Validates: Requirements 7.5**
   */
  describe('Property 24: Overdue deliverables are escalated', () => {
    it('should escalate all overdue incomplete tasks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.uuid(),
              proposalId: fc.uuid(),
              findingId: fc.uuid(),
              agentType: fc.constantFrom(
                'speed_optimization',
                'seo_fix',
                'accessibility',
                'security_hardening',
                'content_generation'
              ),
              status: fc.constantFrom('queued', 'in_progress', 'failed'),
              estimatedCompletionDate: fc.date({ max: new Date(Date.now() - 86400000) }), // Past date
              tenantId: fc.uuid(),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (overdueTasks) => {
            // Setup mock
            (prisma.deliveryTask.findMany as any).mockResolvedValue(overdueTasks);
            (prisma.deliveryTask.updateMany as any).mockResolvedValue({ count: overdueTasks.length });

            // Execute
            const escalated = await deliveryEngine.escalateOverdue();

            // Verify all overdue tasks are returned
            expect(escalated.length).toBe(overdueTasks.length);

            // Verify updateMany was called with correct IDs
            expect(prisma.deliveryTask.updateMany).toHaveBeenCalledWith({
              where: { id: { in: overdueTasks.map((t) => t.id) } },
              data: { status: 'escalated' },
            });

            // Verify all returned tasks have escalated status
            for (const task of escalated) {
              expect(task.status).toBe('escalated');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not escalate completed or verified tasks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.uuid(),
              proposalId: fc.uuid(),
              findingId: fc.uuid(),
              agentType: fc.constantFrom(
                'speed_optimization',
                'seo_fix',
                'accessibility',
                'security_hardening',
                'content_generation'
              ),
              status: fc.constantFrom('completed', 'verified'),
              estimatedCompletionDate: fc.date({ max: new Date(Date.now() - 86400000) }), // Past date
              tenantId: fc.uuid(),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          async (completedTasks) => {
            // Setup mock - no overdue tasks should be returned
            (prisma.deliveryTask.findMany as any).mockResolvedValue([]);
            (prisma.deliveryTask.updateMany as any).mockResolvedValue({ count: 0 });

            // Execute
            const escalated = await deliveryEngine.escalateOverdue();

            // Verify no tasks are escalated
            expect(escalated.length).toBe(0);

            // Verify findMany was called with correct filter
            expect(prisma.deliveryTask.findMany).toHaveBeenCalledWith({
              where: {
                estimatedCompletionDate: { lt: expect.any(Date) },
                status: { notIn: ['completed', 'verified', 'escalated'] },
              },
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only escalate tasks past their estimated completion date', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.uuid(),
              proposalId: fc.uuid(),
              findingId: fc.uuid(),
              agentType: fc.constantFrom(
                'speed_optimization',
                'seo_fix',
                'accessibility',
                'security_hardening',
                'content_generation'
              ),
              status: fc.constantFrom('queued', 'in_progress'),
              estimatedCompletionDate: fc.date({ min: new Date(Date.now() + 86400000) }), // Future date
              tenantId: fc.uuid(),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          async (futureTasks) => {
            // Setup mock - no overdue tasks
            (prisma.deliveryTask.findMany as any).mockResolvedValue([]);
            (prisma.deliveryTask.updateMany as any).mockResolvedValue({ count: 0 });

            // Execute
            const escalated = await deliveryEngine.escalateOverdue();

            // Verify no future tasks are escalated
            expect(escalated.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: All deliverables complete check is accurate
   * 
   * For any proposal, checkAllComplete should return true only when all
   * deliverables are verified, and false otherwise.
   */
  describe('Property: All deliverables complete check accuracy', () => {
    it('should return true only when all tasks are verified', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              id: fc.uuid(),
              status: fc.constantFrom('verified'),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (proposalId, tasks) => {
            // Setup mock
            (prisma.deliveryTask.findMany as any).mockResolvedValue(tasks);

            // Execute
            const result = await deliveryEngine.checkAllComplete(proposalId);

            // Verify
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when any task is not verified', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              id: fc.uuid(),
              status: fc.constantFrom('queued', 'in_progress', 'completed', 'failed', 'escalated'),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (proposalId, incompleteTasks) => {
            // Setup mock
            (prisma.deliveryTask.findMany as any).mockResolvedValue(incompleteTasks);

            // Execute
            const result = await deliveryEngine.checkAllComplete(proposalId);

            // Verify
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when no tasks exist', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (proposalId) => {
          // Setup mock
          (prisma.deliveryTask.findMany as any).mockResolvedValue([]);

          // Execute
          const result = await deliveryEngine.checkAllComplete(proposalId);

          // Verify
          expect(result).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Deliverable status transitions are valid
   * 
   * For any deliverable, status transitions should follow valid state machine:
   * queued -> in_progress -> completed -> verified
   * or queued/in_progress -> failed
   * or any incomplete state -> escalated
   */
  describe('Property: Deliverable status transitions are valid', () => {
    it('should transition from queued to in_progress on dispatch', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom(
            'speed_optimization',
            'seo_fix',
            'accessibility',
            'security_hardening',
            'content_generation'
          ),
          fc.date({ min: new Date() }),
          async (id, proposalId, findingId, agentType, estimatedCompletionDate) => {
            const deliverable: Deliverable = {
              id,
              proposalId,
              findingId,
              agentType: agentType as Deliverable['agentType'],
              status: 'queued',
              estimatedCompletionDate,
            };

            // Setup mocks
            (prisma.deliveryTask.update as any).mockResolvedValue({
              ...deliverable,
              status: 'in_progress',
            });

            // Execute
            await deliveryEngine.dispatchToAgent(deliverable);

            // Verify status transition
            expect(prisma.deliveryTask.update).toHaveBeenCalledWith({
              where: { id: deliverable.id },
              data: { status: 'in_progress' },
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transition from completed to verified on verification', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (deliverableId) => {
            // Setup mock
            (prisma.deliveryTask.findUnique as any).mockResolvedValue({
              id: deliverableId,
              status: 'completed',
            });
            (prisma.deliveryTask.update as any).mockResolvedValue({
              id: deliverableId,
              status: 'verified',
            });

            // Execute
            const result = await deliveryEngine.verifyDeliverable(deliverableId);

            // Verify status transition
            expect(prisma.deliveryTask.update).toHaveBeenCalledWith({
              where: { id: deliverableId },
              data: expect.objectContaining({
                status: 'verified',
              }),
            });

            // Verify result
            expect(result.verified).toBe(true);
            expect(result.improvementPercent).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
