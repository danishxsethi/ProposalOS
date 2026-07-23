import { cleanupDb } from '@/lib/__tests__/utils/cleanup';
/**
 * Unit Tests for Human Review Queue
 * 
 * Tests routing logic, approve/reject workflows, and queue filtering/sorting.
 * 
 * Requirements: 10.3, 10.4, 10.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import {
  routeToReview,
  getReviewQueue,
  approveProspect,
  rejectProspect,
  getProspectContext,
  getReviewQueueStats,
  overrideProspectStatus,
} from '../humanReview';

describe('Human Review Queue', () => {
  const testTenantId = 'test-tenant-review';
  const testProspectIds: string[] = [];

  beforeEach(async () => {
    // Clean up test data
    await cleanupDb(prisma);
});

  afterEach(async () => {
    // Clean up test data
    await cleanupDb(prisma);
});

  describe('Routing Logic', () => {
    it('should route prospect to review queue', async () => {
      // Create test prospect
      const prospect = await prisma.prospectLead.create({
        data: {
          tenantId: testTenantId,
          businessName: 'Test Business',
          website: 'https://test.com',
          city: 'Test City',
          vertical: 'dental',
          source: 'google_maps',
          sourceExternalId: 'test-123',
          pipelineStatus: 'QUALIFIED',
          painScoreBreakdown: { websiteSpeed: 20, mobileBroken: 15 },
          engagementScore: 85,
        },
      });

      testProspectIds.push(prospect.id);

      await routeToReview(prospect.id, 'High engagement score');

      // Verify prospect was transitioned to hot_lead
      const updated = await prisma.prospectLead.findUnique({
        where: { id: prospect.id },
      });

      expect(updated?.pipelineStatus).toBe('hot_lead');

      // Verify routing was logged
      const logs = await prisma.pipelineErrorLog.findMany({
        where: {
          prospectId: prospect.id,
          errorType: 'ROUTED_TO_REVIEW',
        },
      });

      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Review Queue Retrieval', () => {
    it('should get review queue with default filters', async () => {
      // Create test prospects
      const prospects = await Promise.all([
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'Business 1',
            website: 'https://test1.com',
            city: 'City 1',
            vertical: 'dental',
            source: 'google_maps',
            sourceExternalId: 'test-1',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 20 },
            engagementScore: 90,
          },
        }),
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'Business 2',
            website: 'https://test2.com',
            city: 'City 2',
            vertical: 'hvac',
            source: 'google_maps',
            sourceExternalId: 'test-2',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 15, mobileBroken: 10 },
            engagementScore: 75,
          },
        }),
      ]);

      testProspectIds.push(...prospects.map(p => p.id));

      const queue = await getReviewQueue(testTenantId);

      expect(queue.items.length).toBe(2);
      expect(queue.total).toBe(2);
      expect(queue.items[0].engagementScore).toBeGreaterThanOrEqual(queue.items[1].engagementScore);
    });

    it('should filter by vertical', async () => {
      const prospects = await Promise.all([
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'Dental Practice',
            website: 'https://dental.com',
            city: 'City 1',
            vertical: 'dental',
            source: 'google_maps',
            sourceExternalId: 'dental-1',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 20 },
            engagementScore: 80,
          },
        }),
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'HVAC Company',
            website: 'https://hvac.com',
            city: 'City 2',
            vertical: 'hvac',
            source: 'google_maps',
            sourceExternalId: 'hvac-1',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 15 },
            engagementScore: 70,
          },
        }),
      ]);

      testProspectIds.push(...prospects.map(p => p.id));

      const queue = await getReviewQueue(testTenantId, {
        vertical: ['dental'],
      });

      expect(queue.items.length).toBe(1);
      expect(queue.items[0].prospect.vertical).toBe('dental');
    });

    it('should filter by engagement score', async () => {
      const prospects = await Promise.all([
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'High Engagement',
            website: 'https://high.com',
            city: 'City 1',
            vertical: 'dental',
            source: 'google_maps',
            sourceExternalId: 'high-1',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 20 },
            engagementScore: 95,
          },
        }),
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'Low Engagement',
            website: 'https://low.com',
            city: 'City 2',
            vertical: 'dental',
            source: 'google_maps',
            sourceExternalId: 'low-1',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 15 },
            engagementScore: 60,
          },
        }),
      ]);

      testProspectIds.push(...prospects.map(p => p.id));

      const queue = await getReviewQueue(testTenantId, {
        minEngagementScore: 80,
      });

      expect(queue.items.length).toBe(1);
      expect(queue.items[0].engagementScore).toBeGreaterThanOrEqual(80);
    });

    it('should support pagination', async () => {
      // Create 5 prospects
      const prospects = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          prisma.prospectLead.create({
            data: {
              tenantId: testTenantId,
              businessName: `Business ${i}`,
              website: `https://test${i}.com`,
              city: 'City',
              vertical: 'dental',
              source: 'google_maps',
              sourceExternalId: `test-${i}`,
              pipelineStatus: 'hot_lead',
              painScoreBreakdown: { websiteSpeed: 20 },
              engagementScore: 80 + i,
            },
          })
        )
      );

      testProspectIds.push(...prospects.map(p => p.id));

      // Get page 1
      const page1 = await getReviewQueue(testTenantId, {
        page: 1,
        pageSize: 2,
      });

      expect(page1.items.length).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBeGreaterThanOrEqual(2);

      // Get page 2
      const page2 = await getReviewQueue(testTenantId, {
        page: 2,
        pageSize: 2,
      });

      expect(page2.items.length).toBe(2);
      expect(page2.page).toBe(2);
    });
  });

  describe('Approve/Reject Workflows', () => {
    it('should approve prospect and log action', async () => {
      const prospect = await prisma.prospectLead.create({
        data: {
          tenantId: testTenantId,
          businessName: 'Approve Test',
          website: 'https://approve.com',
          city: 'City',
          vertical: 'dental',
          source: 'google_maps',
          sourceExternalId: 'approve-1',
          pipelineStatus: 'hot_lead',
          painScoreBreakdown: { websiteSpeed: 20 },
          engagementScore: 90,
        },
      });

      testProspectIds.push(prospect.id);

      await approveProspect({
        prospectId: prospect.id,
        action: 'approve',
        operatorId: 'operator-123',
        operatorEmail: 'operator@test.com',
        notes: 'Looks good',
      });

      // Verify status transition
      const updated = await prisma.prospectLead.findUnique({
        where: { id: prospect.id },
      });

      expect(updated?.pipelineStatus).toBe('closing');

      // Verify approval was logged
      const logs = await prisma.pipelineErrorLog.findMany({
        where: {
          prospectId: prospect.id,
          errorType: 'APPROVED',
        },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].errorMessage).toContain('operator@test.com');
    });

    it('should reject prospect and log action with reason', async () => {
      const prospect = await prisma.prospectLead.create({
        data: {
          tenantId: testTenantId,
          businessName: 'Reject Test',
          website: 'https://reject.com',
          city: 'City',
          vertical: 'dental',
          source: 'google_maps',
          sourceExternalId: 'reject-1',
          pipelineStatus: 'hot_lead',
          painScoreBreakdown: { websiteSpeed: 20 },
          engagementScore: 90,
        },
      });

      testProspectIds.push(prospect.id);

      await rejectProspect({
        prospectId: prospect.id,
        action: 'reject',
        operatorId: 'operator-123',
        operatorEmail: 'operator@test.com',
        reason: 'Not a good fit',
        notes: 'Budget too low',
      });

      // Verify status transition
      const updated = await prisma.prospectLead.findUnique({
        where: { id: prospect.id },
      });

      expect(updated?.pipelineStatus).toBe('closed_lost');

      // Verify rejection was logged
      const logs = await prisma.pipelineErrorLog.findMany({
        where: {
          prospectId: prospect.id,
          errorType: 'REJECTED',
        },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].errorMessage).toContain('Not a good fit');
    });
  });

  describe('Prospect Context', () => {
    it('should get full prospect context', async () => {
      const prospect = await prisma.prospectLead.create({
        data: {
          tenantId: testTenantId,
          businessName: 'Context Test',
          website: 'https://context.com',
          city: 'City',
          vertical: 'dental',
          source: 'google_maps',
          sourceExternalId: 'context-1',
          pipelineStatus: 'hot_lead',
          painScoreBreakdown: { websiteSpeed: 20, mobileBroken: 15 },
          engagementScore: 85,
        },
      });

      testProspectIds.push(prospect.id);

      const context = await getProspectContext(prospect.id);

      expect(context).toBeDefined();
      expect(context?.prospect.id).toBe(prospect.id);
      expect(context?.painScore).toBe(35); // 20 + 15
      expect(context?.painBreakdown).toEqual({ websiteSpeed: 20, mobileBroken: 15 });
      expect(context?.engagementScore).toBe(85);
    });

    it('should return null for non-existent prospect', async () => {
      const context = await getProspectContext('non-existent-id');
      expect(context).toBeNull();
    });
  });

  describe('Manual Status Override', () => {
    it('should override prospect status and log action', async () => {
      const prospect = await prisma.prospectLead.create({
        data: {
          tenantId: testTenantId,
          businessName: 'Override Test',
          website: 'https://override.com',
          city: 'City',
          vertical: 'dental',
          source: 'google_maps',
          sourceExternalId: 'override-1',
          pipelineStatus: 'hot_lead',
          painScoreBreakdown: { websiteSpeed: 20 },
          engagementScore: 90,
        },
      });

      testProspectIds.push(prospect.id);

      await overrideProspectStatus(
        prospect.id,
        'closed_won',
        'operator-123',
        'operator@test.com',
        'Manual conversion'
      );

      // Verify status was overridden
      const updated = await prisma.prospectLead.findUnique({
        where: { id: prospect.id },
      });

      expect(updated?.pipelineStatus).toBe('closed_won');

      // Verify override was logged
      const logs = await prisma.pipelineErrorLog.findMany({
        where: {
          prospectId: prospect.id,
          errorType: 'STATUS_OVERRIDE',
        },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].errorMessage).toContain('Manual conversion');
    });
  });

  describe('Review Queue Statistics', () => {
    it('should calculate queue statistics', async () => {
      // Create test prospects
      await Promise.all([
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'Stats 1',
            website: 'https://stats1.com',
            city: 'City',
            vertical: 'dental',
            source: 'google_maps',
            sourceExternalId: 'stats-1',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 20, mobileBroken: 10 },
            engagementScore: 80,
          },
        }),
        prisma.prospectLead.create({
          data: {
            tenantId: testTenantId,
            businessName: 'Stats 2',
            website: 'https://stats2.com',
            city: 'City',
            vertical: 'dental',
            source: 'google_maps',
            sourceExternalId: 'stats-2',
            pipelineStatus: 'hot_lead',
            painScoreBreakdown: { websiteSpeed: 15, mobileBroken: 15 },
            engagementScore: 90,
          },
        }),
      ]);

      const stats = await getReviewQueueStats(testTenantId);

      expect(stats.totalInReview).toBe(2);
      expect(stats.avgPainScore).toBeGreaterThan(0);
      expect(stats.avgEngagementScore).toBe(85); // (80 + 90) / 2
    });
  });
});
