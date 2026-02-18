/**
 * Unit tests for Pipeline Outreach Cron Endpoint
 * 
 * Tests the cron endpoint that processes "proposed" prospects and sends
 * outreach emails in batches.
 * 
 * Requirements: 4.1, 4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { PipelineStage } from '@/lib/pipeline/types';
import * as outreach from '@/lib/pipeline/outreach';
import * as inboxRotation from '@/lib/pipeline/inboxRotation';
import * as stateMachine from '@/lib/pipeline/stateMachine';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pipelineConfig: {
      findMany: vi.fn(),
    },
    prospectLead: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    pipelineErrorLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/pipeline/outreach', () => ({
  generateAndQualifyEmail: vi.fn(),
  scheduleFollowUps: vi.fn(),
}));

vi.mock('@/lib/pipeline/inboxRotation', () => ({
  sendWithRotation: vi.fn(),
}));

vi.mock('@/lib/pipeline/stateMachine', () => ({
  transition: vi.fn(),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockConfig(overrides: any = {}) {
  return {
    id: 'config-1',
    tenantId: 'tenant-1',
    batchSize: 50,
    pausedStages: [],
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockProspect(overrides: any = {}) {
  return {
    id: 'prospect-1',
    tenantId: 'tenant-1',
    businessName: 'Test Business',
    pipelineStatus: 'proposed',
    vertical: 'dentist',
    painBreakdown: {
      websiteSpeed: 18,
      mobileBroken: 15,
      gbpNeglected: 10,
      noSsl: 10,
      zeroReviewResponses: 5,
      socialMediaDead: 8,
      competitorsOutperforming: 7,
      accessibilityViolations: 3,
    },
    createdAt: new Date(),
    audit: {
      id: 'audit-1',
      status: 'COMPLETE',
      findings: [
        {
          id: 'f1',
          title: 'Slow Page Speed',
          module: 'pagespeed',
          severity: 'high',
          impactScore: 85,
        },
        {
          id: 'f2',
          title: 'Mobile Not Responsive',
          module: 'mobile',
          severity: 'high',
          impactScore: 80,
        },
      ],
    },
    proposal: {
      id: 'proposal-1',
      webLinkToken: 'abc123',
    },
    ...overrides,
  };
}

function createMockTenant(overrides: any = {}) {
  return {
    id: 'tenant-1',
    branding: {
      brandName: 'Test Agency',
      contactEmail: 'hello@testagency.com',
    },
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

describe('Pipeline Outreach Cron Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set CRON_SECRET for auth tests
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should return 401 when CRON_SECRET is set but auth header is missing', async () => {
      const req = createMockRequest();
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when CRON_SECRET is set but auth header is incorrect', async () => {
      const req = createMockRequest('Bearer wrong-secret');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should proceed when CRON_SECRET is set and auth header is correct', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should proceed when CRON_SECRET is not set', async () => {
      delete process.env.CRON_SECRET;
      const req = createMockRequest();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // ==========================================================================
  // No Active Tenants Tests
  // ==========================================================================

  describe('No Active Tenants', () => {
    it('should return success with 0 processed when no configs exist', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
      expect(data.message).toBe('No active tenants for outreach');
    });

    it('should filter out tenants with outreach paused', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [
        createMockConfig({ tenantId: 'tenant-1', pausedStages: ['outreach'] }),
        createMockConfig({ tenantId: 'tenant-2', pausedStages: ['discovery'] }),
      ];
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.processed).toBe(1); // Only tenant-2 should be processed
      expect(data.results[0].tenantId).toBe('tenant-2');
    });
  });

  // ==========================================================================
  // No Prospects Tests
  // ==========================================================================

  describe('No Prospects', () => {
    it('should return success when tenant has no prospects in "proposed" status', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results[0].prospectsProcessed).toBe(0);
      expect(data.results[0].emailsSent).toBe(0);
    });
  });

  // ==========================================================================
  // Successful Email Sending Tests
  // ==========================================================================

  describe('Successful Email Sending', () => {
    it('should process prospects and send outreach emails', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [createMockProspect()];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);
      
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['Finding 1', 'Finding 2'],
        scorecardUrl: '/preview/abc123',
        generatedAt: new Date(),
      };
      
      vi.mocked(outreach.generateAndQualifyEmail).mockResolvedValue(mockEmail);
      vi.mocked(inboxRotation.sendWithRotation).mockResolvedValue({
        emailId: 'email-1',
        status: 'sent',
        sendingDomain: 'test@example.com',
        sentAt: new Date(),
      });
      vi.mocked(outreach.scheduleFollowUps).mockResolvedValue(undefined);
      vi.mocked(stateMachine.transition).mockResolvedValue({
        from: 'proposed',
        to: 'outreach_sent',
        timestamp: new Date(),
        stage: PipelineStage.OUTREACH,
        tenantId: 'tenant-1',
        metadata: {},
      });

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results[0].emailsSent).toBe(1);
      expect(data.results[0].failed).toBe(0);
      
      // Verify functions were called correctly
      expect(outreach.generateAndQualifyEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          prospect: prospects[0],
          vertical: 'dentist',
        })
      );
      expect(inboxRotation.sendWithRotation).toHaveBeenCalledWith(
        mockEmail,
        'tenant-1'
      );
      expect(outreach.scheduleFollowUps).toHaveBeenCalledWith(
        'prospect-1',
        'email-1'
      );
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'prospect-1',
        'outreach_sent',
        PipelineStage.OUTREACH
      );
    });

    it('should process multiple prospects in batch', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [
        createMockProspect({ id: 'prospect-1' }),
        createMockProspect({ id: 'prospect-2' }),
        createMockProspect({ id: 'prospect-3' }),
      ];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);
      
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['Finding 1', 'Finding 2'],
        scorecardUrl: '/preview/abc123',
        generatedAt: new Date(),
      };
      
      vi.mocked(outreach.generateAndQualifyEmail).mockResolvedValue(mockEmail);
      vi.mocked(inboxRotation.sendWithRotation).mockResolvedValue({
        emailId: 'email-1',
        status: 'sent',
        sendingDomain: 'test@example.com',
        sentAt: new Date(),
      });
      vi.mocked(outreach.scheduleFollowUps).mockResolvedValue(undefined);
      vi.mocked(stateMachine.transition).mockResolvedValue({
        from: 'proposed',
        to: 'outreach_sent',
        timestamp: new Date(),
        stage: PipelineStage.OUTREACH,
        tenantId: 'tenant-1',
        metadata: {},
      });

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].prospectsProcessed).toBe(3);
      expect(data.results[0].emailsSent).toBe(3);
      expect(outreach.generateAndQualifyEmail).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // Queued Email Tests
  // ==========================================================================

  describe('Queued Emails', () => {
    it('should handle queued emails when no domain available', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [createMockProspect()];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);
      
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['Finding 1', 'Finding 2'],
        scorecardUrl: '/preview/abc123',
        generatedAt: new Date(),
      };
      
      vi.mocked(outreach.generateAndQualifyEmail).mockResolvedValue(mockEmail);
      vi.mocked(inboxRotation.sendWithRotation).mockResolvedValue({
        emailId: 'email-1',
        status: 'queued',
        sendingDomain: 'none',
        error: 'No available sending domain',
      });

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].emailsQueued).toBe(1);
      expect(data.results[0].emailsSent).toBe(0);
      
      // Should not transition prospect or schedule follow-ups
      expect(stateMachine.transition).not.toHaveBeenCalled();
      expect(outreach.scheduleFollowUps).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle missing audit data gracefully', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [createMockProspect({ audit: null })];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].failed).toBe(1);
      expect(data.results[0].emailsSent).toBe(0);
    });

    it('should handle missing proposal data gracefully', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [createMockProspect({ proposal: null })];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].failed).toBe(1);
      expect(data.results[0].emailsSent).toBe(0);
    });

    it('should handle email generation failure', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [createMockProspect()];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);
      vi.mocked(outreach.generateAndQualifyEmail).mockRejectedValue(
        new Error('generation_failed')
      );
      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].failed).toBe(1);
      expect(prisma.pipelineErrorLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorType: 'OUTREACH_PROCESSING_ERROR',
            stage: PipelineStage.OUTREACH,
          }),
        })
      );
    });

    it('should handle send failure', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [createMockProspect()];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);
      
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['Finding 1', 'Finding 2'],
        scorecardUrl: '/preview/abc123',
        generatedAt: new Date(),
      };
      
      vi.mocked(outreach.generateAndQualifyEmail).mockResolvedValue(mockEmail);
      vi.mocked(inboxRotation.sendWithRotation).mockResolvedValue({
        emailId: 'email-1',
        status: 'failed',
        sendingDomain: 'test@example.com',
        error: 'SMTP error',
      });
      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].failed).toBe(1);
      expect(prisma.pipelineErrorLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorType: 'EMAIL_SEND_FAILED',
          }),
        })
      );
    });

    it('should continue processing other prospects when one fails', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig()];
      const prospects = [
        createMockProspect({ id: 'prospect-1' }),
        createMockProspect({ id: 'prospect-2' }),
      ];
      const tenant = createMockTenant();
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue(prospects);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(tenant);
      
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Subject',
        body: 'Test Body',
        prospectId: 'prospect-1',
        proposalId: 'proposal-1',
        findingReferences: ['Finding 1', 'Finding 2'],
        scorecardUrl: '/preview/abc123',
        generatedAt: new Date(),
      };
      
      // First prospect fails, second succeeds
      vi.mocked(outreach.generateAndQualifyEmail)
        .mockRejectedValueOnce(new Error('generation_failed'))
        .mockResolvedValueOnce(mockEmail);
      
      vi.mocked(inboxRotation.sendWithRotation).mockResolvedValue({
        emailId: 'email-1',
        status: 'sent',
        sendingDomain: 'test@example.com',
        sentAt: new Date(),
      });
      vi.mocked(outreach.scheduleFollowUps).mockResolvedValue(undefined);
      vi.mocked(stateMachine.transition).mockResolvedValue({
        from: 'proposed',
        to: 'outreach_sent',
        timestamp: new Date(),
        stage: PipelineStage.OUTREACH,
        tenantId: 'tenant-1',
        metadata: {},
      });
      vi.mocked(prisma.pipelineErrorLog.create).mockResolvedValue({} as any);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].prospectsProcessed).toBe(2);
      expect(data.results[0].emailsSent).toBe(1);
      expect(data.results[0].failed).toBe(1);
    });
  });

  // ==========================================================================
  // Multiple Tenants Tests
  // ==========================================================================

  describe('Multiple Tenants', () => {
    it('should process multiple tenants up to MAX_TENANTS_PER_RUN', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [
        createMockConfig({ tenantId: 'tenant-1' }),
        createMockConfig({ tenantId: 'tenant-2' }),
      ];
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.processed).toBe(2);
      expect(data.results).toHaveLength(2);
    });

    it('should handle tenant-level errors without affecting other tenants', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [
        createMockConfig({ tenantId: 'tenant-1' }),
        createMockConfig({ tenantId: 'tenant-2' }),
      ];
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      
      // First tenant throws error, second succeeds
      vi.mocked(prisma.prospectLead.findMany)
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce([]);

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].status).toBe('Failed');
      expect(data.results[1].status).toBe('Complete');
    });
  });

  // ==========================================================================
  // Batch Size Tests
  // ==========================================================================

  describe('Batch Size', () => {
    it('should respect configured batch size', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig({ batchSize: 10 })];
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue([]);

      await GET(req);

      expect(prisma.prospectLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should use default batch size when not configured', async () => {
      const req = createMockRequest('Bearer test-secret');
      
      const configs = [createMockConfig({ batchSize: null })];
      
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs);
      vi.mocked(prisma.prospectLead.findMany).mockResolvedValue([]);

      await GET(req);

      expect(prisma.prospectLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50, // DEFAULT_BATCH_SIZE
        })
      );
    });
  });
});
