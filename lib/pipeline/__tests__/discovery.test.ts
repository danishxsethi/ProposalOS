/**
 * Unit tests for Prospect Discovery Engine
 *
 * Tests the discovery pipeline: query sources → deduplicate → qualify →
 * threshold gate → persist → trigger enrichment.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queryExternalSources,
  deduplicateRecords,
  qualifyProspect,
  persistQualifiedProspect,
  deriveTopFindings,
  discover,
  getTodayDiscoveredCount,
  getRemainingDailyCapacity,
  triggerEnrichment,
  type RawBusinessRecord,
  type SourceProvider,
  type QualificationProvider,
} from '../discovery';
import type {
  DiscoveryConfig,
  QualificationSignals,
  PainScoreBreakdown,
} from '../types';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    prospectLead: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pipelineConfig: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-job-id'),
}));

import { prisma } from '@/lib/prisma';

const mockPrisma = vi.mocked(prisma);

// ============================================================================
// Test Helpers
// ============================================================================

function makeRecord(overrides: Partial<RawBusinessRecord> = {}): RawBusinessRecord {
  return {
    businessName: 'Test Business',
    website: 'https://test.com',
    city: 'Austin',
    vertical: 'dentist',
    source: 'google_places',
    sourceExternalId: 'gp-123',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<DiscoveryConfig> = {}): DiscoveryConfig {
  return {
    city: 'Austin',
    vertical: 'dentist',
    targetLeads: 50,
    painThreshold: 60,
    sources: { googlePlaces: true, yelp: true, directories: true },
    ...overrides,
  };
}

function makeHighPainSignals(): QualificationSignals {
  return {
    pageSpeedScore: 20,
    mobileResponsive: false,
    hasSsl: false,
    gbpClaimed: false,
    gbpReviewResponseRate: 0,
    socialPresent: false,
    competitorScoreGap: 40,
    accessibilityViolationCount: 15,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Prospect Discovery Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryExternalSources()', () => {
    it('should query all enabled sources and merge results', async () => {
      const gpRecords = [makeRecord({ source: 'google_places', sourceExternalId: 'gp-1' })];
      const yelpRecords = [makeRecord({ source: 'yelp', sourceExternalId: 'y-1' })];
      const dirRecords = [makeRecord({ source: 'directory', sourceExternalId: 'd-1' })];

      const providers = {
        googlePlaces: vi.fn().mockResolvedValue(gpRecords) as unknown as SourceProvider,
        yelp: vi.fn().mockResolvedValue(yelpRecords) as unknown as SourceProvider,
        directories: vi.fn().mockResolvedValue(dirRecords) as unknown as SourceProvider,
      };

      const config = makeConfig();
      const results = await queryExternalSources(config, providers);

      expect(results).toHaveLength(3);
      expect(providers.googlePlaces).toHaveBeenCalledWith('Austin', 'dentist', 50, undefined);
      expect(providers.yelp).toHaveBeenCalledWith('Austin', 'dentist', 50, undefined);
      expect(providers.directories).toHaveBeenCalledWith('Austin', 'dentist', 50, undefined);
    });

    it('should skip disabled sources', async () => {
      const gpProvider = vi.fn().mockResolvedValue([makeRecord()]) as unknown as SourceProvider;
      const yelpProvider = vi.fn().mockResolvedValue([]) as unknown as SourceProvider;

      const config = makeConfig({
        sources: { googlePlaces: true, yelp: false, directories: false },
      });

      const results = await queryExternalSources(config, {
        googlePlaces: gpProvider,
        yelp: yelpProvider,
      });

      expect(results).toHaveLength(1);
      expect(gpProvider).toHaveBeenCalled();
      expect(yelpProvider).not.toHaveBeenCalled();
    });

    it('should handle provider errors gracefully and continue', async () => {
      const gpProvider = vi.fn().mockRejectedValue(new Error('API error')) as unknown as SourceProvider;
      const yelpProvider = vi.fn().mockResolvedValue([
        makeRecord({ source: 'yelp', sourceExternalId: 'y-1' }),
      ]) as unknown as SourceProvider;

      const config = makeConfig({
        sources: { googlePlaces: true, yelp: true, directories: false },
      });

      const results = await queryExternalSources(config, {
        googlePlaces: gpProvider,
        yelp: yelpProvider,
      });

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('yelp');
    });

    it('should pass state parameter to providers', async () => {
      const gpProvider = vi.fn().mockResolvedValue([]) as unknown as SourceProvider;

      const config = makeConfig({ state: 'TX' });
      await queryExternalSources(config, { googlePlaces: gpProvider });

      expect(gpProvider).toHaveBeenCalledWith('Austin', 'dentist', 50, 'TX');
    });
  });

  describe('deduplicateRecords()', () => {
    it('should filter out records that already exist for the tenant', async () => {
      const records = [
        makeRecord({ sourceExternalId: 'gp-1' }),
        makeRecord({ sourceExternalId: 'gp-2' }),
        makeRecord({ sourceExternalId: 'gp-3' }),
      ];

      mockPrisma.prospectLead.findMany.mockResolvedValue([
        { source: 'google_places', sourceExternalId: 'gp-1' },
      ] as any);

      const result = await deduplicateRecords(records, 'tenant-1');

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.sourceExternalId)).toEqual(['gp-2', 'gp-3']);
    });

    it('should return all records when none exist', async () => {
      const records = [
        makeRecord({ sourceExternalId: 'gp-1' }),
        makeRecord({ sourceExternalId: 'gp-2' }),
      ];

      mockPrisma.prospectLead.findMany.mockResolvedValue([]);

      const result = await deduplicateRecords(records, 'tenant-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const result = await deduplicateRecords([], 'tenant-1');
      expect(result).toHaveLength(0);
    });

    it('should deduplicate by source + sourceExternalId combination', async () => {
      const records = [
        makeRecord({ source: 'google_places', sourceExternalId: 'ext-1' }),
        makeRecord({ source: 'yelp', sourceExternalId: 'ext-1' }),
      ];

      // Only google_places ext-1 exists
      mockPrisma.prospectLead.findMany.mockResolvedValue([
        { source: 'google_places', sourceExternalId: 'ext-1' },
      ] as any);

      const result = await deduplicateRecords(records, 'tenant-1');

      // yelp ext-1 should still pass since it's a different source
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('yelp');
    });
  });

  describe('qualifyProspect()', () => {
    it('should compute pain score from qualification signals', async () => {
      const record = makeRecord();
      const signals = makeHighPainSignals();
      const qualProvider: QualificationProvider = vi.fn().mockResolvedValue(signals);

      const result = await qualifyProspect(record, qualProvider);

      expect(result.painScore).toBeGreaterThan(60);
      expect(result.breakdown).toBeDefined();
      expect(result.signals).toEqual(signals);
    });

    it('should return low pain score for healthy business', async () => {
      const record = makeRecord();
      const signals: QualificationSignals = {
        pageSpeedScore: 95,
        mobileResponsive: true,
        hasSsl: true,
        gbpClaimed: true,
        gbpPhotoCount: 20,
        gbpReviewCount: 50,
        gbpReviewResponseRate: 0.9,
        gbpPostingFrequencyDays: 5,
        socialPresent: true,
        socialLastPostDays: 2,
        competitorScoreGap: 0,
        accessibilityViolationCount: 0,
      };
      const qualProvider: QualificationProvider = vi.fn().mockResolvedValue(signals);

      const result = await qualifyProspect(record, qualProvider);

      expect(result.painScore).toBeLessThan(10);
    });
  });

  describe('deriveTopFindings()', () => {
    it('should return top 3 dimensions by score', () => {
      const breakdown: PainScoreBreakdown = {
        websiteSpeed: 18,
        mobileBroken: 15,
        gbpNeglected: 12,
        noSsl: 10,
        zeroReviewResponses: 5,
        socialMediaDead: 3,
        competitorsOutperforming: 2,
        accessibilityViolations: 1,
      };

      const findings = deriveTopFindings(breakdown);

      expect(findings).toHaveLength(3);
      expect(findings[0].dimension).toBe('websiteSpeed');
      expect(findings[0].score).toBe(18);
      expect(findings[1].dimension).toBe('mobileBroken');
      expect(findings[2].dimension).toBe('gbpNeglected');
    });

    it('should return fewer than 3 if fewer dimensions have scores', () => {
      const breakdown: PainScoreBreakdown = {
        websiteSpeed: 10,
        mobileBroken: 0,
        gbpNeglected: 0,
        noSsl: 5,
        zeroReviewResponses: 0,
        socialMediaDead: 0,
        competitorsOutperforming: 0,
        accessibilityViolations: 0,
      };

      const findings = deriveTopFindings(breakdown);
      expect(findings).toHaveLength(2);
    });

    it('should return empty array when all scores are 0', () => {
      const breakdown: PainScoreBreakdown = {
        websiteSpeed: 0,
        mobileBroken: 0,
        gbpNeglected: 0,
        noSsl: 0,
        zeroReviewResponses: 0,
        socialMediaDead: 0,
        competitorsOutperforming: 0,
        accessibilityViolations: 0,
      };

      const findings = deriveTopFindings(breakdown);
      expect(findings).toHaveLength(0);
    });

    it('should include human-readable labels', () => {
      const breakdown: PainScoreBreakdown = {
        websiteSpeed: 15,
        mobileBroken: 0,
        gbpNeglected: 0,
        noSsl: 10,
        zeroReviewResponses: 0,
        socialMediaDead: 0,
        competitorsOutperforming: 0,
        accessibilityViolations: 8,
      };

      const findings = deriveTopFindings(breakdown);
      expect(findings[0].label).toBe('Slow website speed');
      expect(findings[1].label).toBe('Missing SSL/HTTPS');
      expect(findings[2].label).toBe('Accessibility violations');
    });
  });

  describe('persistQualifiedProspect()', () => {
    it('should create a ProspectLead with correct fields', async () => {
      const record = makeRecord({
        businessName: 'Acme Dental',
        website: 'https://acmedental.com',
        city: 'Austin',
        state: 'TX',
        vertical: 'dentist',
        source: 'google_places',
        sourceExternalId: 'gp-456',
      });

      const breakdown: PainScoreBreakdown = {
        websiteSpeed: 16,
        mobileBroken: 15,
        gbpNeglected: 9,
        noSsl: 10,
        zeroReviewResponses: 8,
        socialMediaDead: 7,
        competitorsOutperforming: 6,
        accessibilityViolations: 5,
      };

      const signals: QualificationSignals = { pageSpeedScore: 20 };

      mockPrisma.prospectLead.create.mockResolvedValue({ id: 'lead-1' } as any);

      const leadId = await persistQualifiedProspect(
        record,
        'tenant-1',
        'job-1',
        76,
        breakdown,
        signals
      );

      expect(leadId).toBe('lead-1');
      expect(mockPrisma.prospectLead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          discoveryJobId: 'job-1',
          businessName: 'Acme Dental',
          website: 'https://acmedental.com',
          city: 'Austin',
          state: 'TX',
          vertical: 'dentist',
          source: 'google_places',
          sourceExternalId: 'gp-456',
          painScore: 76,
          painBreakdown: breakdown,
          pipelineStatus: 'discovered',
        }),
      });
    });
  });

  describe('triggerEnrichment()', () => {
    it('should update lead status to ENRICH_PENDING', async () => {
      mockPrisma.prospectLead.update.mockResolvedValue({} as any);

      await triggerEnrichment('lead-1');

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { status: 'ENRICH_PENDING' },
      });
    });
  });

  describe('getTodayDiscoveredCount()', () => {
    it('should count prospects created today for the tenant', async () => {
      mockPrisma.prospectLead.count.mockResolvedValue(42);

      const count = await getTodayDiscoveredCount('tenant-1');

      expect(count).toBe(42);
      expect(mockPrisma.prospectLead.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          createdAt: { gte: expect.any(Date) },
        },
      });
    });
  });

  describe('getRemainingDailyCapacity()', () => {
    it('should return remaining capacity', async () => {
      mockPrisma.prospectLead.count.mockResolvedValue(150);

      const remaining = await getRemainingDailyCapacity('tenant-1', 200);
      expect(remaining).toBe(50);
    });

    it('should return 0 when limit is reached', async () => {
      mockPrisma.prospectLead.count.mockResolvedValue(200);

      const remaining = await getRemainingDailyCapacity('tenant-1', 200);
      expect(remaining).toBe(0);
    });

    it('should return 0 when limit is exceeded', async () => {
      mockPrisma.prospectLead.count.mockResolvedValue(250);

      const remaining = await getRemainingDailyCapacity('tenant-1', 200);
      expect(remaining).toBe(0);
    });
  });

  describe('discover() — full orchestration', () => {
    const highPainSignals = makeHighPainSignals();

    function setupProviders(records: RawBusinessRecord[] = []) {
      const gpProvider: SourceProvider = vi.fn().mockResolvedValue(records);
      const qualProvider: QualificationProvider = vi.fn().mockResolvedValue(highPainSignals);
      return {
        googlePlaces: gpProvider,
        yelp: vi.fn().mockResolvedValue([]) as unknown as SourceProvider,
        directories: vi.fn().mockResolvedValue([]) as unknown as SourceProvider,
        qualification: qualProvider,
      };
    }

    beforeEach(() => {
      // Default: pipeline config exists with 200 daily limit
      mockPrisma.pipelineConfig.findUnique.mockResolvedValue({
        dailyVolumeLimit: 200,
      } as any);

      // Default: no existing prospects today
      mockPrisma.prospectLead.count.mockResolvedValue(0);

      // Default: no existing duplicates
      mockPrisma.prospectLead.findMany.mockResolvedValue([]);

      // Default: create returns an id
      mockPrisma.prospectLead.create.mockImplementation(async (args: any) => ({
        id: `lead-${args.data.sourceExternalId}`,
      }));

      // Default: update succeeds
      mockPrisma.prospectLead.update.mockResolvedValue({} as any);
    });

    it('should return early when daily volume limit is reached', async () => {
      mockPrisma.prospectLead.count.mockResolvedValue(200);

      const config = makeConfig();
      const providers = setupProviders([makeRecord()]);

      const result = await discover(config, 'tenant-1', providers);

      expect(result.prospectsFound).toBe(0);
      expect(result.prospectsQualified).toBe(0);
    });

    it('should discover, qualify, and persist prospects', async () => {
      const records = [
        makeRecord({ sourceExternalId: 'gp-1', businessName: 'Biz 1' }),
        makeRecord({ sourceExternalId: 'gp-2', businessName: 'Biz 2' }),
      ];

      const providers = setupProviders(records);
      const config = makeConfig();

      const result = await discover(config, 'tenant-1', providers);

      expect(result.prospectsFound).toBe(2);
      expect(result.prospectsQualified).toBe(2);
      expect(result.tenantId).toBe('tenant-1');
      expect(mockPrisma.prospectLead.create).toHaveBeenCalledTimes(2);
    });

    it('should skip prospects below pain threshold', async () => {
      const lowPainSignals: QualificationSignals = {
        pageSpeedScore: 95,
        mobileResponsive: true,
        hasSsl: true,
        gbpClaimed: true,
        gbpPhotoCount: 20,
        gbpReviewCount: 50,
        gbpReviewResponseRate: 0.9,
        gbpPostingFrequencyDays: 5,
        socialPresent: true,
        socialLastPostDays: 2,
        competitorScoreGap: 0,
        accessibilityViolationCount: 0,
      };

      const records = [makeRecord({ sourceExternalId: 'gp-1' })];
      const providers = {
        googlePlaces: vi.fn().mockResolvedValue(records) as unknown as SourceProvider,
        yelp: vi.fn().mockResolvedValue([]) as unknown as SourceProvider,
        directories: vi.fn().mockResolvedValue([]) as unknown as SourceProvider,
        qualification: vi.fn().mockResolvedValue(lowPainSignals) as unknown as QualificationProvider,
      };

      const config = makeConfig({ painThreshold: 60 });
      const result = await discover(config, 'tenant-1', providers);

      expect(result.prospectsFound).toBe(1);
      expect(result.prospectsQualified).toBe(0);
      expect(mockPrisma.prospectLead.create).not.toHaveBeenCalled();
    });

    it('should deduplicate existing prospects', async () => {
      const records = [
        makeRecord({ sourceExternalId: 'gp-1' }),
        makeRecord({ sourceExternalId: 'gp-2' }),
      ];

      // gp-1 already exists
      mockPrisma.prospectLead.findMany.mockResolvedValue([
        { source: 'google_places', sourceExternalId: 'gp-1' },
      ] as any);

      const providers = setupProviders(records);
      const config = makeConfig();

      const result = await discover(config, 'tenant-1', providers);

      // Only gp-2 should be processed
      expect(result.prospectsQualified).toBe(1);
      expect(mockPrisma.prospectLead.create).toHaveBeenCalledTimes(1);
    });

    it('should cap at daily volume limit', async () => {
      // Already have 198 today, limit is 200
      mockPrisma.prospectLead.count.mockResolvedValue(198);

      const records = [
        makeRecord({ sourceExternalId: 'gp-1' }),
        makeRecord({ sourceExternalId: 'gp-2' }),
        makeRecord({ sourceExternalId: 'gp-3' }),
        makeRecord({ sourceExternalId: 'gp-4' }),
        makeRecord({ sourceExternalId: 'gp-5' }),
      ];

      const providers = setupProviders(records);
      const config = makeConfig();

      // After first persist, count goes to 199, then 200
      let callCount = 0;
      mockPrisma.prospectLead.count.mockImplementation(async () => {
        return 198 + callCount++;
      });

      const result = await discover(config, 'tenant-1', providers);

      // Should cap at remaining capacity (2 initially, but re-checks each time)
      expect(result.prospectsQualified).toBeLessThanOrEqual(2);
    });

    it('should trigger enrichment for each qualified prospect', async () => {
      const records = [makeRecord({ sourceExternalId: 'gp-1' })];
      const providers = setupProviders(records);
      const config = makeConfig();

      await discover(config, 'tenant-1', providers);

      expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith({
        where: { id: 'lead-gp-1' },
        data: { status: 'ENRICH_PENDING' },
      });
    });

    it('should use default daily volume limit when no config exists', async () => {
      mockPrisma.pipelineConfig.findUnique.mockResolvedValue(null);

      const records = [makeRecord({ sourceExternalId: 'gp-1' })];
      const providers = setupProviders(records);
      const config = makeConfig();

      const result = await discover(config, 'tenant-1', providers);

      // Should still work with default limit of 200
      expect(result.prospectsQualified).toBe(1);
    });

    it('should continue processing when individual prospect qualification fails', async () => {
      const records = [
        makeRecord({ sourceExternalId: 'gp-1', businessName: 'Failing Biz' }),
        makeRecord({ sourceExternalId: 'gp-2', businessName: 'Good Biz' }),
      ];

      let callCount = 0;
      const qualProvider: QualificationProvider = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Qualification failed');
        return highPainSignals;
      });

      const providers = {
        googlePlaces: vi.fn().mockResolvedValue(records) as unknown as SourceProvider,
        yelp: vi.fn().mockResolvedValue([]) as unknown as SourceProvider,
        directories: vi.fn().mockResolvedValue([]) as unknown as SourceProvider,
        qualification: qualProvider,
      };

      const config = makeConfig();
      const result = await discover(config, 'tenant-1', providers);

      // First fails, second succeeds
      expect(result.prospectsQualified).toBe(1);
    });

    it('should return a valid DiscoveryResult', async () => {
      const records = [makeRecord({ sourceExternalId: 'gp-1' })];
      const providers = setupProviders(records);
      const config = makeConfig();

      const result = await discover(config, 'tenant-1', providers);

      expect(result.jobId).toBeDefined();
      expect(result.tenantId).toBe('tenant-1');
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(typeof result.prospectsFound).toBe('number');
      expect(typeof result.prospectsQualified).toBe('number');
      expect(typeof result.costCents).toBe('number');
    });
  });
});
