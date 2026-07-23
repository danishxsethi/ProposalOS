/**
 * Property-Based Tests for Prospect Discovery Engine
 *
 * Tests Properties 3, 4, 5, and 6 from the design document using fast-check.
 * Minimum 100 iterations per property.
 *
 * Feature: autonomous-proposal-engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  enrichProspect,
  withTimeout,
  hasVerifiedEmail,
  PROVIDER_ORDER,
  type EnrichmentProvider,
  type EnrichmentProviders,
  type ProviderResult,
} from '../waterfallEnrichment';
import {
  deduplicateRecords,
  persistQualifiedProspect,
  discover,
  getRemainingDailyCapacity,
  type RawBusinessRecord,
  type SourceProvider,
  type QualificationProvider,
} from '../discovery';
import type {
  DiscoveryConfig,
  QualificationSignals,
  PainScoreBreakdown,
} from '../types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    prospectLead: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    prospectEnrichmentRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
    pipelineConfig: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-job-id'),
}));

import { prisma } from '@/lib/prisma';

const mockPrisma = vi.mocked(prisma);

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * Generate a provider name from the waterfall order.
 */
const providerNameArb = fc.constantFrom(...PROVIDER_ORDER);

/**
 * Generate a ProviderResult with optional email.
 */
const providerResultArb = (withEmail: boolean): fc.Arbitrary<ProviderResult> =>
  withEmail
    ? fc.record({
        email: fc.emailAddress(),
        phone: fc.option(fc.string({ minLength: 7, maxLength: 15 }), { nil: undefined }),
        decisionMaker: fc.option(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            title: fc.constantFrom('Owner', 'Marketing Director', 'GM', 'CEO'),
          }),
          { nil: undefined }
        ),
      })
    : fc.record({
        email: fc.constant(undefined),
        phone: fc.option(fc.string({ minLength: 7, maxLength: 15 }), { nil: undefined }),
        decisionMaker: fc.constant(undefined),
      });

/**
 * Generate a scenario for waterfall enrichment:
 * - Which provider index (0-3) returns a verified email (or none: 4)
 * - Which providers fail/timeout (boolean array)
 */
const waterfallScenarioArb = fc.record({
  winnerIndex: fc.integer({ min: 0, max: 4 }), // 4 = no winner
  failures: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
});

/**
 * Generate a RawBusinessRecord.
 */
const rawBusinessRecordArb = fc.record({
  businessName: fc.string({ minLength: 1, maxLength: 100 }),
  website: fc.webUrl(),
  city: fc.string({ minLength: 1, maxLength: 50 }),
  vertical: fc.constantFrom('dentist', 'hvac', 'plumber', 'lawyer', 'restaurant'),
  source: fc.constantFrom('google_places', 'yelp', 'directory'),
  sourceExternalId: fc.uuid(),
  state: fc.option(fc.constantFrom('TX', 'CA', 'NY', 'FL'), { nil: undefined }),
  address: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
  phone: fc.option(fc.string({ minLength: 7, maxLength: 15 }), { nil: undefined }),
  rating: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
  reviewCount: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

/**
 * Generate a batch of RawBusinessRecords for a given tenant.
 */
const recordBatchArb = fc.array(rawBusinessRecordArb, { minLength: 1, maxLength: 20 });

/**
 * Generate a daily volume limit.
 */
const dailyVolumeLimitArb = fc.integer({ min: 1, max: 500 });

/**
 * Generate a count of already-discovered prospects today.
 */
const existingCountArb = fc.integer({ min: 0, max: 500 });

/**
 * Generate high-pain QualificationSignals that will produce painScore >= 60.
 */
const highPainSignalsArb: fc.Arbitrary<QualificationSignals> = fc.record({
  pageSpeedScore: fc.integer({ min: 0, max: 30 }),
  mobileResponsive: fc.constant(false),
  hasSsl: fc.constant(false),
  gbpClaimed: fc.constant(false),
  gbpReviewResponseRate: fc.constant(0),
  socialPresent: fc.constant(false),
  competitorScoreGap: fc.integer({ min: 20, max: 50 }),
  accessibilityViolationCount: fc.integer({ min: 10, max: 30 }),
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    tenantId: 'tenant-1',
    businessName: 'Test Business',
    website: 'https://test.com',
    ...overrides,
  };
}

let enrichmentRunIdCounter = 0;

function setupEnrichmentMocks(lead = makeLead()) {
  enrichmentRunIdCounter = 0;
  mockPrisma.prospectLead.findUniqueOrThrow.mockResolvedValue(lead as never);
  mockPrisma.prospectLead.update.mockResolvedValue(lead as never);
  mockPrisma.prospectEnrichmentRun.create.mockImplementation(async () => {
    enrichmentRunIdCounter++;
    return { id: `run-${enrichmentRunIdCounter}` } as never;
  });
  mockPrisma.prospectEnrichmentRun.update.mockResolvedValue({} as never);
}

function setupDiscoveryMocks(opts: {
  dailyVolumeLimit?: number;
  existingCount?: number;
  existingKeys?: Array<{ source: string; sourceExternalId: string }>;
} = {}) {
  mockPrisma.pipelineConfig.findUnique.mockResolvedValue({
    dailyVolumeLimit: opts.dailyVolumeLimit ?? 200,
  } as never);

  mockPrisma.prospectLead.count.mockResolvedValue(opts.existingCount ?? 0);
  mockPrisma.prospectLead.findMany.mockResolvedValue(
    (opts.existingKeys ?? []) as never
  );

  let createCount = 0;
  mockPrisma.prospectLead.create.mockImplementation(async (args: any) => {
    createCount++;
    return { id: `lead-${createCount}` } as never;
  });

  mockPrisma.prospectLead.update.mockResolvedValue({} as never);
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Discovery Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 3: Waterfall enrichment respects provider sequence and fault tolerance
   *
   * For any enrichment run, providers must be queried in order
   * (Apollo → Hunter → Proxycurl → Clearbit), the sequence must stop as soon
   * as a verified email is obtained, and if any provider errors or times out
   * the sequence must skip that provider and continue with the next.
   *
   * **Validates: Requirements 1.5, 1.8**
   */
  describe('Property 3: Waterfall enrichment respects provider sequence and fault tolerance', () => {
    it('providers are always queried in strict PROVIDER_ORDER and stop on first verified email', async () => {
      await fc.assert(
        fc.asyncProperty(
          waterfallScenarioArb,
          async ({ winnerIndex, failures }) => {
            vi.clearAllMocks();
            setupEnrichmentMocks();

            const callOrder: string[] = [];

            // Build providers based on the scenario
            const providers: EnrichmentProviders = {};
            for (let i = 0; i < PROVIDER_ORDER.length; i++) {
              const name = PROVIDER_ORDER[i];
              const isFailing = failures[i];
              const isWinner = i === winnerIndex;

              if (isFailing && !isWinner) {
                // This provider fails
                providers[name] = async () => {
                  callOrder.push(name);
                  throw new Error(`${name} failed`);
                };
              } else if (isWinner) {
                // This provider returns a verified email
                providers[name] = async () => {
                  callOrder.push(name);
                  return {
                    email: `dm@${name.toLowerCase()}.com`,
                    decisionMaker: { name: 'John', title: 'Owner' },
                  };
                };
              } else {
                // This provider returns no email
                providers[name] = async () => {
                  callOrder.push(name);
                  return {};
                };
              }
            }

            const result = await enrichProspect('lead-1', providers, {
              timeoutMs: 5000,
            });

            // 1. Verify call order matches PROVIDER_ORDER (subset)
            const expectedOrder = PROVIDER_ORDER.filter((_, idx) =>
              callOrder.includes(PROVIDER_ORDER[idx])
            );
            expect(callOrder).toEqual(expectedOrder);

            // 2. Verify sequence stops at winner
            if (winnerIndex < PROVIDER_ORDER.length) {
              // Should have stopped at or before the winner
              const lastCalled = callOrder[callOrder.length - 1];
              const lastCalledIdx = PROVIDER_ORDER.indexOf(lastCalled as any);
              expect(lastCalledIdx).toBeLessThanOrEqual(winnerIndex);

              // If the winner wasn't skipped by a failure, it should be the last called
              if (!failures[winnerIndex]) {
                expect(result.email).toBeDefined();
                expect(result.provider).toBe(PROVIDER_ORDER[winnerIndex]);
              }
            }

            // 3. No provider after the winner should have been called
            if (winnerIndex < PROVIDER_ORDER.length && !failures[winnerIndex]) {
              for (let i = winnerIndex + 1; i < PROVIDER_ORDER.length; i++) {
                expect(callOrder).not.toContain(PROVIDER_ORDER[i]);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('failed/timed-out providers are skipped and sequence continues', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.boolean(), // APOLLO fails?
            fc.boolean(), // HUNTER fails?
            fc.boolean(), // PROXYCURL fails?
            fc.boolean(), // CLEARBIT fails?
          ),
          async (failures) => {
            vi.clearAllMocks();
            setupEnrichmentMocks();

            const callOrder: string[] = [];
            const providers: EnrichmentProviders = {};

            for (let i = 0; i < PROVIDER_ORDER.length; i++) {
              const name = PROVIDER_ORDER[i];
              if (failures[i]) {
                providers[name] = async () => {
                  callOrder.push(name);
                  throw new Error(`${name} error`);
                };
              } else {
                providers[name] = async () => {
                  callOrder.push(name);
                  return {}; // No email — continue to next
                };
              }
            }

            const result = await enrichProspect('lead-1', providers, {
              timeoutMs: 5000,
            });

            // All 4 providers should have been attempted regardless of failures
            expect(callOrder).toHaveLength(4);
            expect(callOrder).toEqual([...PROVIDER_ORDER]);

            // No verified email found
            expect(result.provider).toBe('NONE');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('enrichment run records are created for every provider attempted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 3 }), // winner index
          async (winnerIndex) => {
            vi.clearAllMocks();
            setupEnrichmentMocks();

            const providers: EnrichmentProviders = {};
            for (let i = 0; i < PROVIDER_ORDER.length; i++) {
              const name = PROVIDER_ORDER[i];
              if (i === winnerIndex) {
                providers[name] = async () => ({
                  email: `found@${name.toLowerCase()}.com`,
                });
              } else {
                providers[name] = async () => ({});
              }
            }

            await enrichProspect('lead-1', providers, { timeoutMs: 5000 });

            // Enrichment runs should be created for providers up to and including the winner
            const expectedRunCount = winnerIndex + 1;
            expect(mockPrisma.prospectEnrichmentRun.create).toHaveBeenCalledTimes(
              expectedRunCount
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Prospect deduplication within a tenant
   *
   * For any batch of discovered prospects for a given tenant, if a prospect
   * with the same source and sourceExternalId already exists for that tenant,
   * the duplicate must be skipped and the existing record must remain unchanged.
   *
   * **Validates: Requirements 1.6**
   */
  describe('Property 4: Prospect deduplication within a tenant', () => {
    it('duplicates are always filtered out by source + sourceExternalId', async () => {
      await fc.assert(
        fc.asyncProperty(
          recordBatchArb,
          fc.uuid(), // tenantId
          async (records, tenantId) => {
            vi.clearAllMocks();

            // Pick a random subset of records to be "existing" in the DB
            const existingIndices = records
              .map((_, i) => i)
              .filter(() => Math.random() > 0.5);

            const existingKeys = existingIndices.map((i) => ({
              source: records[i].source,
              sourceExternalId: records[i].sourceExternalId,
            }));

            mockPrisma.prospectLead.findMany.mockResolvedValue(
              existingKeys as never
            );

            const result = await deduplicateRecords(records, tenantId);

            // Build the set of existing keys
            const existingKeySet = new Set(
              existingKeys.map((k) => `${k.source}::${k.sourceExternalId}`)
            );

            // Every returned record must NOT be in the existing set
            for (const r of result) {
              const key = `${r.source}::${r.sourceExternalId}`;
              expect(existingKeySet.has(key)).toBe(false);
            }

            // Every record NOT in the existing set must be in the result
            const resultKeySet = new Set(
              result.map((r) => `${r.source}::${r.sourceExternalId}`)
            );
            for (const r of records) {
              const key = `${r.source}::${r.sourceExternalId}`;
              if (!existingKeySet.has(key)) {
                expect(resultKeySet.has(key)).toBe(true);
              }
            }

            // Result length = total - duplicates
            expect(result.length).toBe(records.length - existingIndices.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deduplication queries the correct tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          recordBatchArb,
          fc.uuid(),
          async (records, tenantId) => {
            vi.clearAllMocks();
            mockPrisma.prospectLead.findMany.mockResolvedValue([] as never);

            await deduplicateRecords(records, tenantId);

            // Verify the query was scoped to the correct tenant
            expect(mockPrisma.prospectLead.findMany).toHaveBeenCalledWith(
              expect.objectContaining({
                where: expect.objectContaining({
                  tenantId,
                }),
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty batch returns empty result without DB query', async () => {
      const result = await deduplicateRecords([], 'tenant-1');
      expect(result).toEqual([]);
      expect(mockPrisma.prospectLead.findMany).not.toHaveBeenCalled();
    });
  });

  /**
   * Property 5: Discovery results contain all required fields
   *
   * For any completed discovery job, every persisted prospect record must
   * contain non-null values for: business name, website URL, city, industry,
   * listing source, Pain Score, pain breakdown, and status "discovered".
   *
   * **Validates: Requirements 1.1, 1.7**
   */
  describe('Property 5: Discovery results contain all required fields', () => {
    it('every persisted prospect has all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          rawBusinessRecordArb,
          fc.uuid(), // tenantId
          fc.uuid(), // discoveryJobId
          highPainSignalsArb,
          async (record, tenantId, jobId, signals) => {
            vi.clearAllMocks();

            // Capture the data passed to prisma.create
            let capturedData: Record<string, unknown> | null = null;
            mockPrisma.prospectLead.create.mockImplementation(async (args: any) => {
              capturedData = args.data;
              return { id: 'lead-new' } as never;
            });

            // Compute pain score from signals
            const { calculate } = await import('../painScore');
            const { total, breakdown } = calculate(signals);

            await persistQualifiedProspect(
              record,
              tenantId,
              jobId,
              total,
              breakdown,
              signals
            );

            // Verify all required fields are non-null
            expect(capturedData).not.toBeNull();
            expect(capturedData!.businessName).toBeTruthy();
            expect(capturedData!.website).toBeDefined(); // website from record
            expect(capturedData!.city).toBeTruthy();
            expect(capturedData!.vertical).toBeTruthy();
            expect(capturedData!.source).toBeTruthy();
            expect(capturedData!.painScore).toBeDefined();
            expect(typeof capturedData!.painScore).toBe('number');
            expect(capturedData!.painBreakdown).toBeDefined();
            expect(capturedData!.painBreakdown).not.toBeNull();
            expect(capturedData!.pipelineStatus).toBe('discovered');
            expect(capturedData!.tenantId).toBe(tenantId);
            expect(capturedData!.discoveryJobId).toBe(jobId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pain breakdown contains all 8 dimensions', async () => {
      await fc.assert(
        fc.asyncProperty(
          rawBusinessRecordArb,
          fc.uuid(),
          fc.uuid(),
          highPainSignalsArb,
          async (record, tenantId, jobId, signals) => {
            vi.clearAllMocks();

            let capturedBreakdown: Record<string, number> | null = null;
            mockPrisma.prospectLead.create.mockImplementation(async (args: any) => {
              capturedBreakdown = args.data.painBreakdown;
              return { id: 'lead-new' } as never;
            });

            const { calculate } = await import('../painScore');
            const { total, breakdown } = calculate(signals);

            await persistQualifiedProspect(
              record,
              tenantId,
              jobId,
              total,
              breakdown,
              signals
            );

            expect(capturedBreakdown).not.toBeNull();

            const requiredDimensions: (keyof PainScoreBreakdown)[] = [
              'websiteSpeed',
              'mobileBroken',
              'gbpNeglected',
              'noSsl',
              'zeroReviewResponses',
              'socialMediaDead',
              'competitorsOutperforming',
              'accessibilityViolations',
            ];

            for (const dim of requiredDimensions) {
              expect(capturedBreakdown).toHaveProperty(dim);
              expect(typeof capturedBreakdown![dim]).toBe('number');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('persisted pain score is a rounded integer', async () => {
      await fc.assert(
        fc.asyncProperty(
          rawBusinessRecordArb,
          fc.uuid(),
          fc.uuid(),
          highPainSignalsArb,
          async (record, tenantId, jobId, signals) => {
            vi.clearAllMocks();

            let capturedPainScore: number | null = null;
            mockPrisma.prospectLead.create.mockImplementation(async (args: any) => {
              capturedPainScore = args.data.painScore;
              return { id: 'lead-new' } as never;
            });

            const { calculate } = await import('../painScore');
            const { total, breakdown } = calculate(signals);

            await persistQualifiedProspect(
              record,
              tenantId,
              jobId,
              total,
              breakdown,
              signals
            );

            expect(capturedPainScore).not.toBeNull();
            expect(Number.isInteger(capturedPainScore)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Tenant volume limits are enforced
   *
   * For any discovery run for a tenant, the number of newly persisted prospects
   * must not exceed the tenant's configured daily volume limit.
   *
   * **Validates: Requirements 1.9**
   */
  describe('Property 6: Tenant volume limits are enforced', () => {
    it('newly persisted prospects never exceed remaining daily capacity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }), // number of source records
          dailyVolumeLimitArb,
          existingCountArb,
          async (recordCount, dailyLimit, existingCount) => {
            vi.clearAllMocks();

            const remainingCapacity = Math.max(0, dailyLimit - existingCount);

            // Setup mocks
            mockPrisma.pipelineConfig.findUnique.mockResolvedValue({
              dailyVolumeLimit: dailyLimit,
            } as never);

            // Track how many times count is called to simulate incrementing count
            let currentCount = existingCount;
            mockPrisma.prospectLead.count.mockImplementation(async () => {
              return currentCount as never;
            });

            // No existing duplicates
            mockPrisma.prospectLead.findMany.mockResolvedValue([] as never);

            // Track creates
            let createCount = 0;
            mockPrisma.prospectLead.create.mockImplementation(async () => {
              createCount++;
              currentCount++; // Simulate the count increasing
              return { id: `lead-${createCount}` } as never;
            });

            mockPrisma.prospectLead.update.mockResolvedValue({} as never);

            // Generate records
            const records: RawBusinessRecord[] = Array.from(
              { length: recordCount },
              (_, i) => ({
                businessName: `Biz ${i}`,
                website: `https://biz${i}.com`,
                city: 'Austin',
                vertical: 'dentist',
                source: 'google_places',
                sourceExternalId: `gp-${i}`,
              })
            );

            // High-pain qualification provider so all pass threshold
            const highPainSignals: QualificationSignals = {
              pageSpeedScore: 20,
              mobileResponsive: false,
              hasSsl: false,
              gbpClaimed: false,
              gbpReviewResponseRate: 0,
              socialPresent: false,
              competitorScoreGap: 40,
              accessibilityViolationCount: 15,
            };

            const providers = {
              googlePlaces: (async () => records) as SourceProvider,
              yelp: (async () => []) as SourceProvider,
              directories: (async () => []) as SourceProvider,
              qualification: (async () => highPainSignals) as QualificationProvider,
            };

            const config: DiscoveryConfig = {
              city: 'Austin',
              vertical: 'dentist',
              targetLeads: 50,
              painThreshold: 60,
              sources: { googlePlaces: true, yelp: false, directories: false },
            };

            const result = await discover(config, 'tenant-1', providers);

            // The number of qualified prospects must not exceed remaining capacity
            expect(result.prospectsQualified).toBeLessThanOrEqual(
              remainingCapacity
            );

            // The number of creates must not exceed remaining capacity
            expect(createCount).toBeLessThanOrEqual(remainingCapacity);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns zero prospects when daily limit is already reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          dailyVolumeLimitArb,
          async (dailyLimit) => {
            vi.clearAllMocks();

            // Existing count >= limit
            mockPrisma.pipelineConfig.findUnique.mockResolvedValue({
              dailyVolumeLimit: dailyLimit,
            } as never);
            mockPrisma.prospectLead.count.mockResolvedValue(dailyLimit as never);
            mockPrisma.prospectLead.findMany.mockResolvedValue([] as never);
            mockPrisma.prospectLead.create.mockResolvedValue({ id: 'x' } as never);
            mockPrisma.prospectLead.update.mockResolvedValue({} as never);

            const records: RawBusinessRecord[] = [
              {
                businessName: 'Test',
                website: 'https://test.com',
                city: 'Austin',
                vertical: 'dentist',
                source: 'google_places',
                sourceExternalId: 'gp-1',
              },
            ];

            const providers = {
              googlePlaces: (async () => records) as SourceProvider,
              yelp: (async () => []) as SourceProvider,
              directories: (async () => []) as SourceProvider,
              qualification: (async () => ({
                pageSpeedScore: 20,
                mobileResponsive: false,
                hasSsl: false,
              })) as QualificationProvider,
            };

            const config: DiscoveryConfig = {
              city: 'Austin',
              vertical: 'dentist',
              targetLeads: 50,
              painThreshold: 60,
              sources: { googlePlaces: true, yelp: false, directories: false },
            };

            const result = await discover(config, 'tenant-1', providers);

            expect(result.prospectsQualified).toBe(0);
            expect(result.prospectsFound).toBe(0);
            expect(mockPrisma.prospectLead.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getRemainingDailyCapacity is always non-negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          existingCountArb,
          dailyVolumeLimitArb,
          async (existingCount, dailyLimit) => {
            vi.clearAllMocks();
            mockPrisma.prospectLead.count.mockResolvedValue(existingCount as never);

            const remaining = await getRemainingDailyCapacity(
              'tenant-1',
              dailyLimit
            );

            expect(remaining).toBeGreaterThanOrEqual(0);
            expect(remaining).toBeLessThanOrEqual(dailyLimit);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
