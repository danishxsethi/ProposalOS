/**
 * Unit tests for Pre-Warming Engine
 * 
 * Tests action scheduling logic, daily limit enforcement, and window completion checking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scheduleActions, executeAction, checkWindowComplete, getDailyActionCount } from '../preWarming';
import { prisma } from '@/lib/db';
import type { PreWarmingConfig } from '../types';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    prospectLead: {
      findUnique: vi.fn(),
    },
    preWarmingAction: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Pre-Warming Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scheduleActions', () => {
    it('should schedule actions for all available platforms', async () => {
      const leadId = 'lead-123';
      const tenantId = 'tenant-456';
      const outreachDate = new Date('2024-01-10T10:00:00Z');

      // Mock lead with all platforms available
      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        id: leadId,
        tenantId,
        gbpUrl: 'https://maps.google.com/business',
        facebookUrl: 'https://facebook.com/business',
        instagramUrl: 'https://instagram.com/business',
      } as any);

      // Mock daily count check (no actions yet)
      vi.mocked(prisma.preWarmingAction.count).mockResolvedValue(0);

      // Mock action creation
      let actionCounter = 0;
      vi.mocked(prisma.preWarmingAction.create).mockImplementation(async ({ data }) => {
        actionCounter++;
        return {
          id: `action-${actionCounter}`,
          ...data,
          executedAt: null,
          errorMessage: null,
          createdAt: new Date(),
        } as any;
      });

      const actions = await scheduleActions(leadId, outreachDate);

      // Should schedule at least one action per platform
      expect(actions.length).toBeGreaterThan(0);
      
      // Check that actions are scheduled within the window (3-5 days before outreach)
      const windowStart = new Date(outreachDate);
      windowStart.setDate(windowStart.getDate() - 5);
      const windowEnd = new Date(outreachDate);
      windowEnd.setDate(windowEnd.getDate() - 3);

      for (const action of actions) {
        expect(action.scheduledAt.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
        expect(action.scheduledAt.getTime()).toBeLessThanOrEqual(windowEnd.getTime());
        expect(action.status).toBe('scheduled');
      }
    });

    it('should respect daily limits per platform', async () => {
      const leadId = 'lead-123';
      const tenantId = 'tenant-456';
      const outreachDate = new Date('2024-01-10T10:00:00Z');

      const config: PreWarmingConfig = {
        windowDays: { min: 3, max: 5 },
        dailyLimits: { gbp: 1, facebook: 1, instagram: 1 }, // Very low limits
      };

      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        id: leadId,
        tenantId,
        gbpUrl: 'https://maps.google.com/business',
        facebookUrl: 'https://facebook.com/business',
        instagramUrl: 'https://instagram.com/business',
      } as any);

      // Mock daily count to return limit reached
      vi.mocked(prisma.preWarmingAction.count).mockResolvedValue(1);

      const actions = await scheduleActions(leadId, outreachDate, config);

      // Should schedule no actions because limits are reached
      expect(actions.length).toBe(0);
    });

    it('should only schedule actions for available platforms', async () => {
      const leadId = 'lead-123';
      const tenantId = 'tenant-456';
      const outreachDate = new Date('2024-01-10T10:00:00Z');

      // Mock lead with only GBP available
      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        id: leadId,
        tenantId,
        gbpUrl: 'https://maps.google.com/business',
        facebookUrl: null,
        instagramUrl: null,
      } as any);

      vi.mocked(prisma.preWarmingAction.count).mockResolvedValue(0);

      let actionCounter = 0;
      vi.mocked(prisma.preWarmingAction.create).mockImplementation(async ({ data }) => {
        actionCounter++;
        return {
          id: `action-${actionCounter}`,
          ...data,
          executedAt: null,
          errorMessage: null,
          createdAt: new Date(),
        } as any;
      });

      const actions = await scheduleActions(leadId, outreachDate);

      // All actions should be for GBP only
      for (const action of actions) {
        expect(action.platform).toBe('gbp');
      }
    });

    it('should throw error if lead not found', async () => {
      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue(null);

      await expect(
        scheduleActions('nonexistent-lead', new Date())
      ).rejects.toThrow('Lead nonexistent-lead not found');
    });
  });

  describe('executeAction', () => {
    it('should mark action as completed on success', async () => {
      const action = {
        id: 'action-123',
        leadId: 'lead-123',
        platform: 'gbp' as const,
        actionType: 'like' as const,
        scheduledAt: new Date(),
        status: 'scheduled' as const,
      };

      vi.mocked(prisma.preWarmingAction.update).mockResolvedValue({
        ...action,
        status: 'completed',
        executedAt: new Date(),
      } as any);

      await executeAction(action);

      expect(prisma.preWarmingAction.update).toHaveBeenCalledWith({
        where: { id: action.id },
        data: {
          status: 'completed',
          executedAt: expect.any(Date),
        },
      });
    });

    it('should mark action as failed on error', async () => {
      const action = {
        id: 'action-123',
        leadId: 'lead-123',
        platform: 'facebook' as const,
        actionType: 'comment' as const,
        scheduledAt: new Date(),
        status: 'scheduled' as const,
      };

      // Mock update to throw error on first call (simulating API failure)
      vi.mocked(prisma.preWarmingAction.update)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          ...action,
          status: 'failed',
          errorMessage: 'API error',
        } as any);

      await executeAction(action);

      // Should have been called twice: once for the failed attempt, once to mark as failed
      expect(prisma.preWarmingAction.update).toHaveBeenCalledTimes(2);
      expect(prisma.preWarmingAction.update).toHaveBeenLastCalledWith({
        where: { id: action.id },
        data: {
          status: 'failed',
          errorMessage: 'API error',
        },
      });
    });
  });

  describe('checkWindowComplete', () => {
    it('should return true if no actions scheduled', async () => {
      vi.mocked(prisma.preWarmingAction.findMany).mockResolvedValue([]);

      const result = await checkWindowComplete('lead-123');

      expect(result).toBe(true);
    });

    it('should return true if all actions are completed', async () => {
      vi.mocked(prisma.preWarmingAction.findMany).mockResolvedValue([
        {
          id: 'action-1',
          status: 'completed',
          scheduledAt: new Date(),
        },
        {
          id: 'action-2',
          status: 'completed',
          scheduledAt: new Date(),
        },
      ] as any);

      const result = await checkWindowComplete('lead-123');

      expect(result).toBe(true);
    });

    it('should return true if all actions are in terminal states', async () => {
      vi.mocked(prisma.preWarmingAction.findMany).mockResolvedValue([
        {
          id: 'action-1',
          status: 'completed',
          scheduledAt: new Date(),
        },
        {
          id: 'action-2',
          status: 'failed',
          scheduledAt: new Date(),
        },
        {
          id: 'action-3',
          status: 'skipped',
          scheduledAt: new Date(),
        },
      ] as any);

      const result = await checkWindowComplete('lead-123');

      expect(result).toBe(true);
    });

    it('should return false if actions are still scheduled', async () => {
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 1); // 1 hour ago

      vi.mocked(prisma.preWarmingAction.findMany).mockResolvedValue([
        {
          id: 'action-1',
          status: 'scheduled',
          scheduledAt: recentDate,
        },
      ] as any);

      const result = await checkWindowComplete('lead-123');

      expect(result).toBe(false);
    });

    it('should return true if scheduled actions are more than 24 hours old', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

      vi.mocked(prisma.preWarmingAction.findMany).mockResolvedValue([
        {
          id: 'action-1',
          status: 'scheduled',
          scheduledAt: oldDate,
        },
      ] as any);

      const result = await checkWindowComplete('lead-123');

      expect(result).toBe(true);
    });
  });

  describe('getDailyActionCount', () => {
    it('should count actions for a specific platform and date', async () => {
      const date = new Date('2024-01-05T12:00:00Z');
      
      vi.mocked(prisma.preWarmingAction.count).mockResolvedValue(5);

      const count = await getDailyActionCount('gbp', date);

      expect(count).toBe(5);
      expect(prisma.preWarmingAction.count).toHaveBeenCalledWith({
        where: {
          platform: 'gbp',
          scheduledAt: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
          status: {
            in: ['scheduled', 'completed'],
          },
        },
      });
    });

    it('should only count scheduled and completed actions', async () => {
      const date = new Date('2024-01-05T12:00:00Z');
      
      vi.mocked(prisma.preWarmingAction.count).mockResolvedValue(3);

      await getDailyActionCount('facebook', date);

      const call = vi.mocked(prisma.preWarmingAction.count).mock.calls[0][0];
      expect(call?.where?.status).toEqual({ in: ['scheduled', 'completed'] });
    });
  });
});
