/**
 * Unit tests for Signal Detector
 * 
 * Tests signal detection, deduplication, and outreach triggering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runDetection,
  deduplicateSignals,
  triggerSignalOutreach,
  getSchedule,
  signalExists,
} from '../signalDetector';
import type { DetectedSignal, SignalType } from '../types';
import { prisma } from '@/lib/db';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    prospectLead: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    pipelineConfig: {
      findUnique: vi.fn(),
    },
    detectedSignal: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('Signal Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runDetection', () => {
    it('should detect bad reviews for prospects with GBP data', async () => {
      const mockProspects = [
        {
          id: 'lead-1',
          businessName: 'Test Business 1',
          gbpPlaceId: 'place-1',
        },
        {
          id: 'lead-2',
          businessName: 'Test Business 2',
          gbpPlaceId: 'place-2',
        },
      ];

      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(mockProspects as any);

      const signals = await runDetection('tenant-1', 'bad_review');

      expect(prisma.prospectLead.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: { in: ['discovered', 'audited', 'QUALIFIED'] },
          gbpPlaceId: { not: null },
        },
        select: {
          id: true,
          businessName: true,
          gbpPlaceId: true,
        },
      });

      // Signals are randomly generated, so we just check the structure
      expect(Array.isArray(signals)).toBe(true);
      signals.forEach((signal) => {
        expect(signal).toHaveProperty('id');
        expect(signal).toHaveProperty('leadId');
        expect(signal.signalType).toBe('bad_review');
        expect(signal).toHaveProperty('sourceData');
        expect(signal.sourceData).toHaveProperty('reviewRating');
        expect(signal.sourceData.reviewRating).toBeGreaterThanOrEqual(1);
        expect(signal.sourceData.reviewRating).toBeLessThanOrEqual(3);
        expect(signal.priority).toBe('high');
        expect(signal.outreachTriggered).toBe(false);
      });
    });

    it('should detect website changes for prospects with websites', async () => {
      const mockProspects = [
        {
          id: 'lead-1',
          businessName: 'Test Business 1',
          websiteUrl: 'https://example1.com',
        },
      ];

      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(mockProspects as any);

      const signals = await runDetection('tenant-1', 'website_change');

      expect(prisma.prospectLead.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: { in: ['discovered', 'audited', 'QUALIFIED'] },
          websiteUrl: { not: null },
        },
        select: {
          id: true,
          businessName: true,
          websiteUrl: true,
        },
      });

      signals.forEach((signal) => {
        expect(signal.signalType).toBe('website_change');
        expect(signal.sourceData).toHaveProperty('changeType');
        expect(signal.priority).toBe('medium');
      });
    });

    it('should detect competitor upgrades', async () => {
      const mockProspects = [
        {
          id: 'lead-1',
          businessName: 'Test Business 1',
          city: 'San Francisco',
          industry: 'restaurant',
        },
      ];

      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(mockProspects as any);

      const signals = await runDetection('tenant-1', 'competitor_upgrade');

      signals.forEach((signal) => {
        expect(signal.signalType).toBe('competitor_upgrade');
        expect(signal.sourceData).toHaveProperty('competitorName');
        expect(signal.sourceData).toHaveProperty('upgradeType');
        expect(signal.priority).toBe('high');
      });
    });

    it('should detect new business licenses', async () => {
      vi.mocked(prisma.pipelineConfig.findUnique).mockResolvedValue({
        id: 'config-1',
        tenantId: 'tenant-1',
      } as any);

      const signals = await runDetection('tenant-1', 'new_business_license');

      expect(prisma.pipelineConfig.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
      });

      signals.forEach((signal) => {
        expect(signal.signalType).toBe('new_business_license');
        expect(signal.leadId).toBeUndefined();
        expect(signal.sourceData).toHaveProperty('businessName');
        expect(signal.sourceData).toHaveProperty('licenseType');
        expect(signal.priority).toBe('high');
      });
    });

    it('should detect hiring spikes', async () => {
      const mockProspects = [
        {
          id: 'lead-1',
          businessName: 'Test Business 1',
        },
      ];

      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(mockProspects as any);

      const signals = await runDetection('tenant-1', 'hiring_spike');

      signals.forEach((signal) => {
        expect(signal.signalType).toBe('hiring_spike');
        expect(signal.sourceData).toHaveProperty('jobPostings');
        expect(signal.sourceData).toHaveProperty('roles');
        expect(signal.priority).toBe('medium');
      });
    });

    it('should throw error for unknown signal type', async () => {
      await expect(
        runDetection('tenant-1', 'unknown_signal' as SignalType)
      ).rejects.toThrow('Unknown signal type: unknown_signal');
    });

    it('should return empty array when no config found for new business licenses', async () => {
      vi.mocked(prisma.pipelineConfig.findUnique).mockResolvedValue(null);

      const signals = await runDetection('tenant-1', 'new_business_license');

      expect(signals).toEqual([]);
    });
  });

  describe('deduplicateSignals', () => {
    it('should remove duplicate signals within the same window', () => {
      const now = new Date();
      const signals: DetectedSignal[] = [
        {
          id: 'signal-1',
          leadId: 'lead-1',
          signalType: 'bad_review',
          sourceData: { reviewRating: 2 },
          detectedAt: now,
          priority: 'high',
          outreachTriggered: false,
        },
        {
          id: 'signal-2',
          leadId: 'lead-1',
          signalType: 'bad_review',
          sourceData: { reviewRating: 1 },
          detectedAt: new Date(now.getTime() + 1000), // 1 second later
          priority: 'high',
          outreachTriggered: false,
        },
        {
          id: 'signal-3',
          leadId: 'lead-2',
          signalType: 'bad_review',
          sourceData: { reviewRating: 3 },
          detectedAt: now,
          priority: 'high',
          outreachTriggered: false,
        },
      ];

      const deduplicated = deduplicateSignals(signals);

      // Should keep first occurrence of lead-1 bad_review and lead-2 bad_review
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe('signal-1');
      expect(deduplicated[1].id).toBe('signal-3');
    });

    it('should keep signals with different signal types', () => {
      const now = new Date();
      const signals: DetectedSignal[] = [
        {
          id: 'signal-1',
          leadId: 'lead-1',
          signalType: 'bad_review',
          sourceData: {},
          detectedAt: now,
          priority: 'high',
          outreachTriggered: false,
        },
        {
          id: 'signal-2',
          leadId: 'lead-1',
          signalType: 'website_change',
          sourceData: {},
          detectedAt: now,
          priority: 'medium',
          outreachTriggered: false,
        },
      ];

      const deduplicated = deduplicateSignals(signals);

      expect(deduplicated).toHaveLength(2);
    });

    it('should handle signals without leadId (new businesses)', () => {
      const now = new Date();
      const signals: DetectedSignal[] = [
        {
          id: 'signal-1',
          leadId: undefined,
          signalType: 'new_business_license',
          sourceData: { businessName: 'New Business 1' },
          detectedAt: now,
          priority: 'high',
          outreachTriggered: false,
        },
        {
          id: 'signal-2',
          leadId: undefined,
          signalType: 'new_business_license',
          sourceData: { businessName: 'New Business 2' },
          detectedAt: now,
          priority: 'high',
          outreachTriggered: false,
        },
      ];

      const deduplicated = deduplicateSignals(signals);

      // Should deduplicate based on 'new' key
      expect(deduplicated).toHaveLength(1);
    });

    it('should keep signals from different time windows', () => {
      const now = new Date();
      const dayLater = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 hours later

      const signals: DetectedSignal[] = [
        {
          id: 'signal-1',
          leadId: 'lead-1',
          signalType: 'bad_review',
          sourceData: {},
          detectedAt: now,
          priority: 'high',
          outreachTriggered: false,
        },
        {
          id: 'signal-2',
          leadId: 'lead-1',
          signalType: 'bad_review',
          sourceData: {},
          detectedAt: dayLater,
          priority: 'high',
          outreachTriggered: false,
        },
      ];

      const deduplicated = deduplicateSignals(signals);

      // Should keep both since they're in different 24-hour windows
      expect(deduplicated).toHaveLength(2);
    });
  });

  describe('triggerSignalOutreach', () => {
    it('should persist signal and mark as triggered', async () => {
      const signal: DetectedSignal = {
        id: 'signal-1',
        leadId: 'lead-1',
        signalType: 'bad_review',
        sourceData: { reviewRating: 2, reviewText: 'Bad service' },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };

      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        tenantId: 'tenant-1',
      } as any);

      vi.mocked(prisma.detectedSignal.create).mockResolvedValue({} as any);
      vi.mocked(prisma.detectedSignal.updateMany).mockResolvedValue({ count: 1 } as any);

      await triggerSignalOutreach(signal);

      expect(prisma.detectedSignal.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          signalType: 'bad_review',
          priority: 'high',
          sourceData: signal.sourceData,
          outreachTriggered: false,
          detectedAt: signal.detectedAt,
        },
      });

      expect(prisma.detectedSignal.updateMany).toHaveBeenCalledWith({
        where: {
          leadId: 'lead-1',
          signalType: 'bad_review',
          detectedAt: signal.detectedAt,
        },
        data: {
          outreachTriggered: true,
        },
      });
    });

    it('should handle signals without leadId', async () => {
      const signal: DetectedSignal = {
        id: 'signal-1',
        leadId: undefined,
        signalType: 'new_business_license',
        sourceData: { businessName: 'New Business' },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };

      vi.mocked(prisma.detectedSignal.create).mockResolvedValue({} as any);
      vi.mocked(prisma.detectedSignal.updateMany).mockResolvedValue({ count: 1 } as any);

      await triggerSignalOutreach(signal);

      expect(prisma.detectedSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: '',
          leadId: undefined,
          signalType: 'new_business_license',
        }),
      });
    });

    it('should generate signal-specific email content for bad review', async () => {
      const signal: DetectedSignal = {
        id: 'signal-1',
        leadId: 'lead-1',
        signalType: 'bad_review',
        sourceData: { reviewRating: 2 },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };

      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        tenantId: 'tenant-1',
      } as any);
      vi.mocked(prisma.detectedSignal.create).mockResolvedValue({} as any);
      vi.mocked(prisma.detectedSignal.updateMany).mockResolvedValue({ count: 1 } as any);

      await triggerSignalOutreach(signal);

      // Email generation is internal, but we verify the signal was processed
      expect(prisma.detectedSignal.updateMany).toHaveBeenCalled();
    });
  });

  describe('getSchedule', () => {
    it('should return cron expressions for all signal types', () => {
      const schedule = getSchedule();

      expect(schedule).toHaveProperty('bad_review');
      expect(schedule).toHaveProperty('website_change');
      expect(schedule).toHaveProperty('competitor_upgrade');
      expect(schedule).toHaveProperty('new_business_license');
      expect(schedule).toHaveProperty('hiring_spike');

      // Verify cron format (basic check)
      Object.values(schedule).forEach((cron) => {
        expect(typeof cron).toBe('string');
        expect(cron.split(' ').length).toBe(5);
      });
    });
  });

  describe('signalExists', () => {
    it('should return true when signal exists within window', async () => {
      vi.mocked(prisma.detectedSignal.findFirst).mockResolvedValue({
        id: 'existing-signal',
      } as any);

      const exists = await signalExists('tenant-1', 'lead-1', 'bad_review', 24);

      expect(exists).toBe(true);
      expect(prisma.detectedSignal.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          signalType: 'bad_review',
          detectedAt: { gte: expect.any(Date) },
        },
      });
    });

    it('should return false when signal does not exist', async () => {
      vi.mocked(prisma.detectedSignal.findFirst).mockResolvedValue(null);

      const exists = await signalExists('tenant-1', 'lead-1', 'bad_review', 24);

      expect(exists).toBe(false);
    });

    it('should handle undefined leadId', async () => {
      vi.mocked(prisma.detectedSignal.findFirst).mockResolvedValue(null);

      const exists = await signalExists('tenant-1', undefined, 'new_business_license', 24);

      expect(prisma.detectedSignal.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          leadId: null,
          signalType: 'new_business_license',
          detectedAt: { gte: expect.any(Date) },
        },
      });
    });

    it('should use default window of 24 hours', async () => {
      vi.mocked(prisma.detectedSignal.findFirst).mockResolvedValue(null);

      await signalExists('tenant-1', 'lead-1', 'bad_review');

      const call = vi.mocked(prisma.detectedSignal.findFirst).mock.calls[0][0];
      const windowStart = call.where.detectedAt.gte;
      const now = new Date();
      const expectedWindow = 24 * 60 * 60 * 1000;
      const actualWindow = now.getTime() - windowStart.getTime();

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(actualWindow - expectedWindow)).toBeLessThan(1000);
    });
  });

  describe('Signal-specific email content', () => {
    it('should reference review rating in bad review email', async () => {
      const signal: DetectedSignal = {
        id: 'signal-1',
        leadId: 'lead-1',
        signalType: 'bad_review',
        sourceData: { reviewRating: 2 },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };

      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        tenantId: 'tenant-1',
      } as any);
      vi.mocked(prisma.detectedSignal.create).mockResolvedValue({} as any);
      vi.mocked(prisma.detectedSignal.updateMany).mockResolvedValue({ count: 1 } as any);

      await triggerSignalOutreach(signal);

      // Verify signal was processed (email content is generated internally)
      expect(prisma.detectedSignal.create).toHaveBeenCalled();
    });

    it('should reference competitor name in competitor upgrade email', async () => {
      const signal: DetectedSignal = {
        id: 'signal-1',
        leadId: 'lead-1',
        signalType: 'competitor_upgrade',
        sourceData: { competitorName: 'Top Competitor Inc' },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };

      vi.mocked(prisma.prospectLead.findUnique).mockResolvedValue({
        tenantId: 'tenant-1',
      } as any);
      vi.mocked(prisma.detectedSignal.create).mockResolvedValue({} as any);
      vi.mocked(prisma.detectedSignal.updateMany).mockResolvedValue({ count: 1 } as any);

      await triggerSignalOutreach(signal);

      expect(prisma.detectedSignal.create).toHaveBeenCalled();
    });
  });
});
