/**
 * Unit tests for Inbox Rotation Manager
 * 
 * Tests:
 * - Domain selection logic (lowest usage)
 * - Daily limit enforcement
 * - Reply detection and follow-up pause
 * 
 * Requirements: 4.6, 4.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  selectSendingDomain,
  getDomainSentCount,
  sendWithRotation,
  handleReply,
  hasReplied,
} from '../inboxRotation';
import type { GeneratedEmail } from '../types';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    outreachSendingDomain: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    outreachDomainDailyStat: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    outreachEmail: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    outreachEmailEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('Inbox Rotation Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('selectSendingDomain', () => {
    it('should select domain with lowest usage', async () => {
      const tenantId = 'tenant-1';
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Mock domains
      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
        { id: 'domain-2', domain: 'mail2.example.com', fromEmail: 'sales@mail2.example.com', dailyLimit: 50 },
        { id: 'domain-3', domain: 'mail3.example.com', fromEmail: 'sales@mail3.example.com', dailyLimit: 50 },
      ];

      // Mock usage stats (domain-2 has lowest usage)
      const stats = [
        { domainId: 'domain-1', sentCount: 30 },
        { domainId: 'domain-2', sentCount: 10 }, // Lowest
        { domainId: 'domain-3', sentCount: 25 },
      ];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await selectSendingDomain(tenantId);

      expect(result).toBe('domain-2');
    });

    it('should exclude domains at daily limit', async () => {
      const tenantId = 'tenant-1';

      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
        { id: 'domain-2', domain: 'mail2.example.com', fromEmail: 'sales@mail2.example.com', dailyLimit: 50 },
      ];

      // domain-1 is at limit, domain-2 has room
      const stats = [
        { domainId: 'domain-1', sentCount: 50 }, // At limit
        { domainId: 'domain-2', sentCount: 20 },
      ];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await selectSendingDomain(tenantId);

      expect(result).toBe('domain-2');
    });

    it('should return null when all domains are at limit', async () => {
      const tenantId = 'tenant-1';

      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
        { id: 'domain-2', domain: 'mail2.example.com', fromEmail: 'sales@mail2.example.com', dailyLimit: 50 },
      ];

      const stats = [
        { domainId: 'domain-1', sentCount: 50 },
        { domainId: 'domain-2', sentCount: 50 },
      ];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await selectSendingDomain(tenantId);

      expect(result).toBeNull();
    });

    it('should return null when no domains are configured', async () => {
      const tenantId = 'tenant-1';

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue([]);

      const result = await selectSendingDomain(tenantId);

      expect(result).toBeNull();
    });

    it('should handle domains with no usage stats (treat as 0)', async () => {
      const tenantId = 'tenant-1';

      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
        { id: 'domain-2', domain: 'mail2.example.com', fromEmail: 'sales@mail2.example.com', dailyLimit: 50 },
      ];

      // Only domain-1 has stats, domain-2 has none (should be treated as 0)
      const stats = [
        { domainId: 'domain-1', sentCount: 10 },
      ];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await selectSendingDomain(tenantId);

      // Should select domain-2 (usage 0 < domain-1 usage 10)
      expect(result).toBe('domain-2');
    });
  });

  describe('getDomainSentCount', () => {
    it('should return sent count for domain on current day', async () => {
      const domainId = 'domain-1';

      vi.mocked(prisma.outreachDomainDailyStat.findUnique).mockResolvedValue({
        sentCount: 25,
      } as any);

      const result = await getDomainSentCount(domainId);

      expect(result).toBe(25);
    });

    it('should return 0 when no stats exist for the day', async () => {
      const domainId = 'domain-1';

      vi.mocked(prisma.outreachDomainDailyStat.findUnique).mockResolvedValue(null);

      const result = await getDomainSentCount(domainId);

      expect(result).toBe(0);
    });
  });

  describe('sendWithRotation', () => {
    it('should send email using selected domain', async () => {
      const tenantId = 'tenant-1';
      const email: GeneratedEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['finding-1', 'finding-2'],
        scorecardUrl: '/preview/token-123',
        generatedAt: new Date(),
      };

      // Mock domain selection
      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
      ];
      const stats = [{ domainId: 'domain-1', sentCount: 10 }];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);
      vi.mocked(prisma.outreachSendingDomain.findUnique).mockResolvedValue({
        domain: 'mail1.example.com',
        fromEmail: 'sales@mail1.example.com',
        fromName: 'Sales Team',
      } as any);

      const createdEmail = {
        id: 'outreach-email-1',
        tenantId,
        leadId: email.prospectId,
        domainId: 'domain-1',
        type: 'INITIAL',
        status: 'SENT',
        subject: email.subject,
        body: email.body,
        qualityScore: 100,
        scorecardUrl: email.scorecardUrl,
        sentAt: new Date(),
      };

      vi.mocked(prisma.outreachEmail.create).mockResolvedValue(createdEmail as any);
      vi.mocked(prisma.outreachDomainDailyStat.upsert).mockResolvedValue({} as any);

      const result = await sendWithRotation(email, tenantId);

      expect(result.status).toBe('sent');
      expect(result.sendingDomain).toBe('sales@mail1.example.com');
      expect(result.emailId).toBe('outreach-email-1');
      expect(prisma.outreachEmail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          leadId: email.prospectId,
          domainId: 'domain-1',
          type: 'INITIAL',
          status: 'SENT',
          subject: email.subject,
          body: email.body,
          qualityScore: 100,
          scorecardUrl: email.scorecardUrl,
        }),
      });
    });

    it('should return queued status when no domain available', async () => {
      const tenantId = 'tenant-1';
      const email: GeneratedEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['finding-1', 'finding-2'],
        scorecardUrl: '/preview/token-123',
        generatedAt: new Date(),
      };

      // All domains at limit
      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
      ];
      const stats = [{ domainId: 'domain-1', sentCount: 50 }];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await sendWithRotation(email, tenantId);

      expect(result.status).toBe('queued');
      expect(result.error).toContain('No available sending domain');
    });

    it('should increment domain sent count after sending', async () => {
      const tenantId = 'tenant-1';
      const email: GeneratedEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['finding-1', 'finding-2'],
        scorecardUrl: '/preview/token-123',
        generatedAt: new Date(),
      };

      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
      ];
      const stats = [{ domainId: 'domain-1', sentCount: 10 }];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);
      vi.mocked(prisma.outreachSendingDomain.findUnique).mockResolvedValue({
        domain: 'mail1.example.com',
        fromEmail: 'sales@mail1.example.com',
        fromName: 'Sales Team',
      } as any);
      vi.mocked(prisma.outreachEmail.create).mockResolvedValue({
        id: 'outreach-email-1',
      } as any);
      vi.mocked(prisma.outreachDomainDailyStat.upsert).mockResolvedValue({} as any);

      await sendWithRotation(email, tenantId);

      expect(prisma.outreachDomainDailyStat.upsert).toHaveBeenCalledWith({
        where: {
          domainId_day: {
            domainId: 'domain-1',
            day: expect.any(Date),
          },
        },
        create: expect.objectContaining({
          tenantId,
          domainId: 'domain-1',
          sentCount: 1,
        }),
        update: {
          sentCount: { increment: 1 },
        },
      });
    });
  });

  describe('handleReply', () => {
    it('should pause follow-up sequence on reply', async () => {
      const tenantId = 'tenant-1';
      const leadId = 'lead-1';
      const emailId = 'email-1';

      vi.mocked(prisma.outreachEmail.findUnique).mockResolvedValue({
        domainId: 'domain-1',
        sentAt: new Date(),
      } as any);
      vi.mocked(prisma.outreachEmail.updateMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.outreachEmailEvent.create).mockResolvedValue({} as any);
      vi.mocked(prisma.outreachDomainDailyStat.upsert).mockResolvedValue({} as any);

      await handleReply(tenantId, leadId, emailId);

      // Should pause follow-ups
      expect(prisma.outreachEmail.updateMany).toHaveBeenCalledWith({
        where: { leadId, status: 'PENDING' },
        data: { status: 'SUPPRESSED' },
      });

      // Should record reply event
      expect(prisma.outreachEmailEvent.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          leadId,
          type: 'REPLY_RECEIVED',
          metadata: {
            emailId,
            pausedFollowUps: true,
          },
        },
      });

      // Should increment reply count
      expect(prisma.outreachDomainDailyStat.upsert).toHaveBeenCalled();
    });

    it('should throw error if email not found', async () => {
      const tenantId = 'tenant-1';
      const leadId = 'lead-1';
      const emailId = 'email-1';

      vi.mocked(prisma.outreachEmail.findUnique).mockResolvedValue(null);

      await expect(handleReply(tenantId, leadId, emailId)).rejects.toThrow(
        'Email not found or has no domain'
      );
    });
  });

  describe('hasReplied', () => {
    it('should return true when lead has replied', async () => {
      const leadId = 'lead-1';

      vi.mocked(prisma.outreachEmailEvent.findFirst).mockResolvedValue({
        id: 'event-1',
        type: 'REPLY_RECEIVED',
      } as any);

      const result = await hasReplied(leadId);

      expect(result).toBe(true);
    });

    it('should return false when lead has not replied', async () => {
      const leadId = 'lead-1';

      vi.mocked(prisma.outreachEmailEvent.findFirst).mockResolvedValue(null);

      const result = await hasReplied(leadId);

      expect(result).toBe(false);
    });
  });

  describe('Daily limit enforcement', () => {
    it('should respect custom daily limits per domain', async () => {
      const tenantId = 'tenant-1';

      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 30 }, // Custom limit
        { id: 'domain-2', domain: 'mail2.example.com', fromEmail: 'sales@mail2.example.com', dailyLimit: 100 }, // Higher limit
      ];

      const stats = [
        { domainId: 'domain-1', sentCount: 30 }, // At custom limit
        { domainId: 'domain-2', sentCount: 50 }, // Under higher limit
      ];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await selectSendingDomain(tenantId);

      // Should select domain-2 since domain-1 is at its custom limit
      expect(result).toBe('domain-2');
    });

    it('should enforce default 50 emails/domain/day limit', async () => {
      const tenantId = 'tenant-1';

      const domains = [
        { id: 'domain-1', domain: 'mail1.example.com', fromEmail: 'sales@mail1.example.com', dailyLimit: 50 },
      ];

      const stats = [
        { domainId: 'domain-1', sentCount: 50 }, // At default limit
      ];

      vi.mocked(prisma.outreachSendingDomain.findMany).mockResolvedValue(domains as any);
      vi.mocked(prisma.outreachDomainDailyStat.findMany).mockResolvedValue(stats as any);

      const result = await selectSendingDomain(tenantId);

      expect(result).toBeNull();
    });
  });
});
