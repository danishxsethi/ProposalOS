/**
 * Unit tests for Signal Detection Cron Endpoint
 * 
 * Tests the cron endpoint that runs signal checks on configurable schedule
 * and triggers signal-specific outreach.
 * 
 * Requirements: 14.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import * as signalDetector from '@/lib/pipeline/signalDetector';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pipelineConfig: {
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

vi.mock('@/lib/pipeline/signalDetector', () => ({
  runDetection: vi.fn(),
  deduplicateSignals: vi.fn(),
  triggerSignalOutreach: vi.fn(),
  signalExists: vi.fn(),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockConfig(overrides: any = {}) {
  return {
    id: '1',
    tenantId: 'tenant-1',
    pausedStages: [],
    batchSize: 50,
    concurrencyLimit: 10,
    painScoreThreshold: 60,
    dailyVolumeLimit: 200,
    spendingLimitCents: 100000,
    hotLeadPercentile: 95,
    emailMinQualityScore: 90,
    maxEmailsPerDomainPerDay: 50,
    followUpSchedule: [3, 7, 14],
    country: 'US',
    language: 'en',
    currency: 'USD',
    pricingMultiplier: 1.0,
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

describe('Signal Detection Cron Endpoint', () => {
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
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // ==========================================================================
  // Tenant Processing Tests
  // ==========================================================================

  describe('Tenant Processing', () => {
    it('should return early if no active tenants', async () => {
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
      expect(data.message).toBe('No active tenants for signal detection');
    });

    it('should skip tenants with signal_detection paused', async () => {
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
        createMockConfig({ pausedStages: ['signal_detection'] }),
      ]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
      expect(data.message).toBe('No active tenants for signal detection');
    });

    it('should process active tenants', async () => {
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
        createMockConfig(),
      ]);

      vi.mocked(signalDetector.runDetection).mockResolvedValue([]);
      vi.mocked(signalDetector.deduplicateSignals).mockReturnValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(1);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].tenantId).toBe('tenant-1');
      expect(data.results[0].status).toBe('Started');
    });

    it('should process up to MAX_TENANTS_PER_RUN tenants', async () => {
      const configs = Array.from({ length: 10 }, (_, i) =>
        createMockConfig({ id: `${i + 1}`, tenantId: `tenant-${i + 1}` })
      );

      // Mock should return only first 5 configs (MAX_TENANTS_PER_RUN)
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue(configs.slice(0, 5));
      vi.mocked(signalDetector.runDetection).mockResolvedValue([]);
      vi.mocked(signalDetector.deduplicateSignals).mockReturnValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Should process only MAX_TENANTS_PER_RUN (5) tenants
      expect(data.processed).toBe(5);
    });
  });

  // ==========================================================================
  // Signal Detection Tests
  // ==========================================================================

  describe('Signal Detection', () => {
    it('should run detection for all signal types', async () => {
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
        createMockConfig(),
      ]);

      vi.mocked(signalDetector.runDetection).mockResolvedValue([]);
      vi.mocked(signalDetector.deduplicateSignals).mockReturnValue([]);

      const req = createMockRequest('Bearer test-secret');

      await GET(req);

      // Wait a bit for fire-and-forget to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should call runDetection for each signal type
      expect(signalDetector.runDetection).toHaveBeenCalledWith(
        'tenant-1',
        'bad_review'
      );
      expect(signalDetector.runDetection).toHaveBeenCalledWith(
        'tenant-1',
        'website_change'
      );
      expect(signalDetector.runDetection).toHaveBeenCalledWith(
        'tenant-1',
        'competitor_upgrade'
      );
      expect(signalDetector.runDetection).toHaveBeenCalledWith(
        'tenant-1',
        'new_business_license'
      );
      expect(signalDetector.runDetection).toHaveBeenCalledWith(
        'tenant-1',
        'hiring_spike'
      );
    });

    it('should deduplicate signals before triggering outreach', async () => {
      const mockSignals = [
        {
          id: '1',
          leadId: 'lead-1',
          signalType: 'bad_review' as const,
          sourceData: { reviewRating: 2 },
          detectedAt: new Date(),
          priority: 'high' as const,
          outreachTriggered: false,
        },
        {
          id: '2',
          leadId: 'lead-1',
          signalType: 'bad_review' as const,
          sourceData: { reviewRating: 1 },
          detectedAt: new Date(),
          priority: 'high' as const,
          outreachTriggered: false,
        },
      ];

      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
        createMockConfig(),
      ]);

      vi.mocked(signalDetector.runDetection).mockResolvedValue(mockSignals);
      vi.mocked(signalDetector.deduplicateSignals).mockReturnValue([mockSignals[0]]);
      vi.mocked(signalDetector.signalExists).mockResolvedValue(false);
      vi.mocked(signalDetector.triggerSignalOutreach).mockResolvedValue();

      const req = createMockRequest('Bearer test-secret');

      await GET(req);

      // Wait for fire-and-forget to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(signalDetector.deduplicateSignals).toHaveBeenCalledWith(mockSignals);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      vi.mocked(prisma.pipelineConfig.findMany).mockRejectedValue(
        new Error('Database error')
      );

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
      expect(data.message).toBe('Database error');
    });

    it('should continue processing other tenants if one fails', async () => {
      vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
        createMockConfig({ tenantId: 'tenant-1' }),
        createMockConfig({ id: '2', tenantId: 'tenant-2' }),
      ]);

      vi.mocked(signalDetector.runDetection)
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Detection failed'));
      vi.mocked(signalDetector.deduplicateSignals).mockReturnValue([]);

      const req = createMockRequest('Bearer test-secret');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(2);
      expect(data.results).toHaveLength(2);
    });
  });
});
