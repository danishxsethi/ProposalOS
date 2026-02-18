import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordEvent,
  computeEngagementScore,
  isHotLead,
  createCheckoutSession,
  handlePaymentSuccess,
  handlePaymentFailure,
} from '../dealCloser';
import type { EngagementEvent, EngagementScore, PipelineConfig } from '../types';
import { createScopedPrisma } from '@/lib/tenant/context';
import { stripe } from '@/lib/billing/stripe';
import { OutreachEventType } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/tenant/context', () => ({
  createScopedPrisma: vi.fn(),
}));

vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  },
}));

describe('Deal Closer Unit Tests', () => {
  const mockPrisma = {
    prospectLead: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    outreachEmailEvent: {
      create: vi.fn(),
    },
    proposal: {
      findUnique: vi.fn(),
    },
    winLossRecord: {
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createScopedPrisma as any).mockReturnValue(mockPrisma);
  });

  describe('recordEvent', () => {
    it('should record an email open event', async () => {
      const leadId = 'lead-123';
      const event: EngagementEvent = {
        leadId,
        eventType: 'email_open',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        metadata: { emailId: 'email-456' },
      };

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
      });
      mockPrisma.outreachEmailEvent.create.mockResolvedValue({});
      mockPrisma.prospectLead.update.mockResolvedValue({});

      await recordEvent(leadId, event);

      expect(mockPrisma.outreachEmailEvent.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-123',
          leadId,
          emailId: 'email-456',
          type: OutreachEventType.EMAIL_OPEN,
          metadata: { emailId: 'email-456' },
          occurredAt: event.timestamp,
        },
      });

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: {
          lastEngagementAt: event.timestamp,
          outreachOpenCount: { increment: 1 },
        },
      });
    });

    it('should record an email click event', async () => {
      const leadId = 'lead-123';
      const event: EngagementEvent = {
        leadId,
        eventType: 'email_click',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      };

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
      });
      mockPrisma.outreachEmailEvent.create.mockResolvedValue({});
      mockPrisma.prospectLead.update.mockResolvedValue({});

      await recordEvent(leadId, event);

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: {
          lastEngagementAt: event.timestamp,
          outreachClickCount: { increment: 1 },
        },
      });
    });

    it('should record a proposal view event with dwell time', async () => {
      const leadId = 'lead-123';
      const event: EngagementEvent = {
        leadId,
        eventType: 'proposal_view',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        metadata: { dwellSeconds: 120 },
      };

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
      });
      mockPrisma.outreachEmailEvent.create.mockResolvedValue({});
      mockPrisma.prospectLead.update.mockResolvedValue({});

      await recordEvent(leadId, event);

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: {
          lastEngagementAt: event.timestamp,
          scorecardTotalViewSeconds: { increment: 120 },
        },
      });
    });

    it('should throw error for unknown event type', async () => {
      const leadId = 'lead-123';
      const event = {
        leadId,
        eventType: 'unknown_event' as any,
        timestamp: new Date(),
      };

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
      });

      await expect(recordEvent(leadId, event)).rejects.toThrow(
        'Unknown engagement event type: unknown_event'
      );
    });

    it('should throw error when lead not found', async () => {
      const leadId = 'nonexistent-lead';
      const event: EngagementEvent = {
        leadId,
        eventType: 'email_open',
        timestamp: new Date(),
      };

      mockPrisma.prospectLead.findUnique.mockResolvedValue(null);

      await expect(recordEvent(leadId, event)).rejects.toThrow(
        'Lead not found: nonexistent-lead'
      );
    });
  });

  describe('computeEngagementScore', () => {
    it('should compute score with all event types', async () => {
      const leadId = 'lead-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        scorecardTotalViewSeconds: 100,
        outreachEvents: [
          { type: OutreachEventType.EMAIL_OPEN, metadata: {} },
          { type: OutreachEventType.EMAIL_OPEN, metadata: {} },
          { type: OutreachEventType.EMAIL_CLICK, metadata: {} },
          {
            type: OutreachEventType.PROPOSAL_VIEW_2M,
            metadata: { dwellSeconds: 120, scrollDepth: 0.8, tierInteraction: true },
          },
        ],
      });
      mockPrisma.prospectLead.update.mockResolvedValue({});

      const score = await computeEngagementScore(leadId);

      // 2 opens * 5 = 10
      // 1 click * 10 = 10
      // 1 proposal view * 20 = 20
      // (100 + 120) / 10 = 22 dwell score
      // 0.8 * 20 = 16 scroll score
      // 1 tier interaction * 15 = 15
      // Total = 10 + 10 + 20 + 22 + 16 + 15 = 93

      expect(score).toEqual({
        emailOpens: 2,
        emailClicks: 1,
        proposalViews: 1,
        proposalDwellSeconds: 220,
        scrollDepth: 0.8,
        tierInteractions: 1,
        total: 93,
      });

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: { engagementScore: 93 },
      });
    });

    it('should handle zero events', async () => {
      const leadId = 'lead-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        scorecardTotalViewSeconds: 0,
        outreachEvents: [],
      });
      mockPrisma.prospectLead.update.mockResolvedValue({});

      const score = await computeEngagementScore(leadId);

      expect(score).toEqual({
        emailOpens: 0,
        emailClicks: 0,
        proposalViews: 0,
        proposalDwellSeconds: 0,
        scrollDepth: 0,
        tierInteractions: 0,
        total: 0,
      });
    });

    it('should throw error when lead not found', async () => {
      const leadId = 'nonexistent-lead';

      mockPrisma.prospectLead.findUnique.mockResolvedValue(null);

      await expect(computeEngagementScore(leadId)).rejects.toThrow(
        'Lead not found: nonexistent-lead'
      );
    });
  });

  describe('isHotLead', () => {
    it('should identify hot lead with score >= 100', () => {
      const score: EngagementScore = {
        emailOpens: 10,
        emailClicks: 5,
        proposalViews: 2,
        proposalDwellSeconds: 300,
        scrollDepth: 0.9,
        tierInteractions: 3,
        total: 150,
      };

      const config: PipelineConfig = {
        tenantId: 'tenant-123',
        concurrencyLimit: 10,
        batchSize: 50,
        painScoreThreshold: 60,
        dailyVolumeLimit: 200,
        spendingLimitCents: 100000,
        hotLeadPercentile: 95,
      };

      const result = isHotLead(score, config);

      expect(result).toBe(true);
    });

    it('should not identify hot lead with score < 100', () => {
      const score: EngagementScore = {
        emailOpens: 5,
        emailClicks: 2,
        proposalViews: 1,
        proposalDwellSeconds: 50,
        scrollDepth: 0.5,
        tierInteractions: 1,
        total: 50,
      };

      const config: PipelineConfig = {
        tenantId: 'tenant-123',
        concurrencyLimit: 10,
        batchSize: 50,
        painScoreThreshold: 60,
        dailyVolumeLimit: 200,
        spendingLimitCents: 100000,
        hotLeadPercentile: 95,
      };

      const result = isHotLead(score, config);

      expect(result).toBe(false);
    });

    it('should handle edge case with score exactly 100', () => {
      const score: EngagementScore = {
        emailOpens: 10,
        emailClicks: 5,
        proposalViews: 0,
        proposalDwellSeconds: 0,
        scrollDepth: 0,
        tierInteractions: 0,
        total: 100,
      };

      const config: PipelineConfig = {
        tenantId: 'tenant-123',
        concurrencyLimit: 10,
        batchSize: 50,
        painScoreThreshold: 60,
        dailyVolumeLimit: 200,
        spendingLimitCents: 100000,
        hotLeadPercentile: 95,
      };

      const result = isHotLead(score, config);

      expect(result).toBe(true);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create Stripe checkout session for essentials tier', async () => {
      const leadId = 'lead-123';
      const tier = 'essentials';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        businessName: 'Test Business',
        decisionMakerEmail: 'owner@test.com',
        proposalId: 'proposal-456',
        tenant: { id: 'tenant-123' },
      });

      mockPrisma.proposal.findUnique.mockResolvedValue({
        id: 'proposal-456',
        webLinkToken: 'abc123',
      });

      (stripe.checkout.sessions.create as any).mockResolvedValue({
        url: 'https://checkout.stripe.com/session-123',
      });

      mockPrisma.prospectLead.update.mockResolvedValue({});

      const url = await createCheckoutSession(leadId, tier);

      expect(url).toBe('https://checkout.stripe.com/session-123');

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Test Business - Essentials Package',
                  description: 'Proposal for Test Business',
                },
                unit_amount: 250000, // $2500 in cents
              },
              quantity: 1,
            },
          ],
          customer_email: 'owner@test.com',
          metadata: {
            leadId,
            tier,
            tenantId: 'tenant-123',
            proposalId: 'proposal-456',
          },
        })
      );

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: { pipelineStatus: 'closing' },
      });
    });

    it('should throw error when lead not found', async () => {
      const leadId = 'nonexistent-lead';

      mockPrisma.prospectLead.findUnique.mockResolvedValue(null);

      await expect(createCheckoutSession(leadId, 'essentials')).rejects.toThrow(
        'Lead not found: nonexistent-lead'
      );
    });

    it('should throw error when proposal not found', async () => {
      const leadId = 'lead-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        proposalId: null,
        tenant: { id: 'tenant-123' },
      });

      await expect(createCheckoutSession(leadId, 'essentials')).rejects.toThrow(
        'No proposal found for lead: lead-123'
      );
    });

    it('should throw error for invalid tier', async () => {
      const leadId = 'lead-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        proposalId: 'proposal-456',
        tenant: { id: 'tenant-123' },
      });

      mockPrisma.proposal.findUnique.mockResolvedValue({
        id: 'proposal-456',
      });

      await expect(createCheckoutSession(leadId, 'invalid-tier')).rejects.toThrow(
        'Invalid tier: invalid-tier'
      );
    });
  });

  describe('handlePaymentSuccess', () => {
    it('should transition to closed_won and record win', async () => {
      const leadId = 'lead-123';
      const sessionId = 'session-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        proposalId: 'proposal-456',
        vertical: 'dentist',
        city: 'San Francisco',
        tenant: { id: 'tenant-123' },
      });

      (stripe.checkout.sessions.retrieve as any).mockResolvedValue({
        metadata: { tier: 'growth' },
        amount_total: 500000, // $5000
      });

      mockPrisma.prospectLead.update.mockResolvedValue({});
      mockPrisma.winLossRecord.create.mockResolvedValue({});

      await handlePaymentSuccess(leadId, sessionId);

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: { pipelineStatus: 'closed_won' },
      });

      expect(mockPrisma.winLossRecord.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-123',
          proposalId: 'proposal-456',
          leadId,
          vertical: 'dentist',
          city: 'San Francisco',
          outcome: 'won',
          tierChosen: 'growth',
          dealValue: 5000,
        },
      });
    });

    it('should throw error when lead not found', async () => {
      const leadId = 'nonexistent-lead';
      const sessionId = 'session-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue(null);

      await expect(handlePaymentSuccess(leadId, sessionId)).rejects.toThrow(
        'Lead not found: nonexistent-lead'
      );
    });
  });

  describe('handlePaymentFailure', () => {
    it('should return to hot_lead status for retry', async () => {
      const leadId = 'lead-123';
      const sessionId = 'session-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
      });

      (stripe.checkout.sessions.retrieve as any).mockResolvedValue({
        metadata: { retryCount: '1' },
      });

      mockPrisma.prospectLead.update.mockResolvedValue({});

      await handlePaymentFailure(leadId, sessionId);

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: { pipelineStatus: 'hot_lead' },
      });
    });

    it('should transition to closed_lost after max retries', async () => {
      const leadId = 'lead-123';
      const sessionId = 'session-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue({
        id: leadId,
        tenantId: 'tenant-123',
        proposalId: 'proposal-456',
        vertical: 'dentist',
        city: 'San Francisco',
      });

      (stripe.checkout.sessions.retrieve as any).mockResolvedValue({
        metadata: { retryCount: '3' },
      });

      mockPrisma.prospectLead.update.mockResolvedValue({});
      mockPrisma.winLossRecord.create.mockResolvedValue({});

      await handlePaymentFailure(leadId, sessionId);

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: leadId },
        data: { pipelineStatus: 'closed_lost' },
      });

      expect(mockPrisma.winLossRecord.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-123',
          proposalId: 'proposal-456',
          leadId,
          vertical: 'dentist',
          city: 'San Francisco',
          outcome: 'lost',
          lostReason: 'payment_failed',
        },
      });
    });

    it('should throw error when lead not found', async () => {
      const leadId = 'nonexistent-lead';
      const sessionId = 'session-123';

      mockPrisma.prospectLead.findUnique.mockResolvedValue(null);

      await expect(handlePaymentFailure(leadId, sessionId)).rejects.toThrow(
        'Lead not found: nonexistent-lead'
      );
    });
  });
});
