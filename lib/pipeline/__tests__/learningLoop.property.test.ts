/**
 * Property-Based Tests for Learning Loop
 * 
 * Tests Property 25 from the design document using fast-check.
 * Minimum 100 iterations per property.
 * 
 * Feature: autonomous-proposal-engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { prisma } from '@/lib/prisma';
import {
  trackOutreachOutcome,
  trackWinLoss,
  trackFindingOutcome,
  recalibratePricing,
  getVerticalInsights,
  type OutreachOutcome,
  type WinLossData,
} from '../learningLoop';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a vertical name
 */
const verticalArb = fc.constantFrom(
  'dentist',
  'hvac',
  'plumber',
  'lawyer',
  'restaurant',
  'retail',
  'fitness'
);

/**
 * Generate a city name
 */
const cityArb = fc.constantFrom(
  'New York',
  'Los Angeles',
  'Chicago',
  'Houston',
  'Phoenix',
  'Philadelphia'
);

/**
 * Generate a template ID
 */
const templateIdArb = fc.string({ minLength: 5, maxLength: 20 });

/**
 * Generate an OutreachOutcome
 */
const outreachOutcomeArb = fc.record({
  openRate: fc.double({ min: 0, max: 1 }),
  clickRate: fc.double({ min: 0, max: 1 }),
  replyRate: fc.double({ min: 0, max: 1 }),
  conversionRate: fc.double({ min: 0, max: 1 }),
  vertical: verticalArb,
  city: cityArb,
});

/**
 * Generate a WinLossData object
 */
const winLossDataArb = fc.record({
  outcome: fc.constantFrom<'won' | 'lost' | 'ghosted'>('won', 'lost', 'ghosted'),
  tierChosen: fc.option(fc.constantFrom('Essentials', 'Growth', 'Premium'), { nil: undefined }),
  dealValue: fc.option(fc.double({ min: 100, max: 10000 }), { nil: undefined }),
  lostReason: fc.option(fc.constantFrom('price', 'timing', 'competitor', 'no_response'), { nil: undefined }),
  objectionsRaised: fc.option(
    fc.array(fc.constantFrom('too_expensive', 'need_more_time', 'already_have_solution'), {
      minLength: 0,
      maxLength: 3,
    }),
    { nil: undefined }
  ),
  competitorMentioned: fc.option(fc.constantFrom('Competitor A', 'Competitor B', 'Competitor C'), { nil: undefined }),
});

/**
 * Generate a finding type
 */
const findingTypeArb = fc.constantFrom(
  'slow_page_speed',
  'mobile_issues',
  'missing_ssl',
  'gbp_unclaimed',
  'no_reviews',
  'broken_links',
  'accessibility_violations'
);

// ============================================================================
// Test Helpers
// ============================================================================

let testTenantId: string;
let testLeadIds: string[] = [];

/**
 * Create a test tenant
 */
async function createTestTenant(): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Test Tenant ${Math.random()}`,
    },
  });
  return tenant.id;
}

/**
 * Create a test prospect lead
 */
async function createTestLead(tenantId: string, vertical: string, city: string): Promise<string> {
  const lead = await prisma.prospectLead.create({
    data: {
      tenantId,
      businessName: `Test Business ${Math.random()}`,
      website: `https://test-${Math.random()}.com`,
      city,
      vertical,
      source: 'test',
      sourceExternalId: `test-${Math.random()}`,
      painScore: 75,
      painBreakdown: {},
      pipelineStatus: 'discovered',
    },
  });
  return lead.id;
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
  // Clean up win/loss records (by tenantId since we're using fake proposal IDs)
  if (testTenantId) {
    await prisma.winLossRecord.deleteMany({
      where: { tenantId: testTenantId },
    });
  }

  // Clean up outreach template performance
  await prisma.outreachTemplatePerformance.deleteMany({
    where: { templateId: { startsWith: 'test-' } },
  });

  // Clean up finding effectiveness
  await prisma.findingEffectiveness.deleteMany({
    where: { findingType: { startsWith: 'test_' } },
  });

  // Clean up audits (by tenantId since they don't have leadId)
  if (testTenantId) {
    await prisma.audit.deleteMany({
      where: { tenantId: testTenantId },
    });
  }

  // Clean up leads
  if (testLeadIds.length > 0) {
    await prisma.prospectLead.deleteMany({
      where: { id: { in: testLeadIds } },
    });
  }

  // Clean up tenant
  if (testTenantId) {
    try {
      await prisma.tenant.delete({
        where: { id: testTenantId },
      });
    } catch (error) {
      console.warn(`Failed to delete tenant ${testTenantId}:`, error);
    }
  }

  // Reset arrays
  testLeadIds = [];
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Learning Loop Property Tests', () => {
  beforeEach(async () => {
    testTenantId = await createTestTenant();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Property 25: Learning loop updates metrics on pipeline outcomes
   * 
   * For any proposal outcome (won/lost), the corresponding finding effectiveness
   * scores must be incremented, and for any completed outreach sequence, the
   * template performance metrics (open rate, click rate, reply rate, conversion
   * rate) must be recalculated from the accumulated data.
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.5, 8.6**
   */
  describe('Property 25: Learning loop updates metrics on pipeline outcomes', () => {
    it('trackOutreachOutcome updates template performance metrics', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateIdArb,
          outreachOutcomeArb,
          async (templateId, outcome) => {
            // Track the outreach outcome
            await trackOutreachOutcome(templateId, outcome);

            // Fetch the performance record
            const performance = await prisma.outreachTemplatePerformance.findUnique({
              where: {
                templateId_vertical_city: {
                  templateId,
                  vertical: outcome.vertical,
                  city: outcome.city,
                },
              },
            });

            // Verify the record was created
            expect(performance).toBeTruthy();
            expect(performance!.templateId).toBe(templateId);
            expect(performance!.vertical).toBe(outcome.vertical);
            expect(performance!.city).toBe(outcome.city);

            // Verify metrics are within valid ranges [0, 1]
            expect(performance!.openRate).toBeGreaterThanOrEqual(0);
            expect(performance!.openRate).toBeLessThanOrEqual(1);
            expect(performance!.clickRate).toBeGreaterThanOrEqual(0);
            expect(performance!.clickRate).toBeLessThanOrEqual(1);
            expect(performance!.replyRate).toBeGreaterThanOrEqual(0);
            expect(performance!.replyRate).toBeLessThanOrEqual(1);
            expect(performance!.conversionRate).toBeGreaterThanOrEqual(0);
            expect(performance!.conversionRate).toBeLessThanOrEqual(1);

            // Verify counts are non-negative
            expect(performance!.totalSent).toBeGreaterThanOrEqual(1);
            expect(performance!.openCount).toBeGreaterThanOrEqual(0);
            expect(performance!.clickCount).toBeGreaterThanOrEqual(0);
            expect(performance!.replyCount).toBeGreaterThanOrEqual(0);
            expect(performance!.conversionCount).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('trackOutreachOutcome accumulates metrics correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          templateIdArb,
          verticalArb,
          cityArb,
          fc.array(
            fc.record({
              openRate: fc.double({ min: 0, max: 1 }),
              clickRate: fc.double({ min: 0, max: 1 }),
              replyRate: fc.double({ min: 0, max: 1 }),
              conversionRate: fc.double({ min: 0, max: 1 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (templateId, vertical, city, outcomes) => {
            // Use unique identifiers to avoid test pollution across iterations
            const uniqueTemplateId = `${templateId}-${Math.random().toString(36).substring(7)}`;
            const uniqueVertical = `${vertical}-${Math.random().toString(36).substring(7)}`;
            const uniqueCity = `${city}-${Math.random().toString(36).substring(7)}`;
            
            // Track multiple outcomes for the same template/vertical/city
            for (const outcome of outcomes) {
              await trackOutreachOutcome(uniqueTemplateId, {
                ...outcome,
                vertical: uniqueVertical,
                city: uniqueCity,
              });
            }

            // Fetch the final performance record
            const performance = await prisma.outreachTemplatePerformance.findUnique({
              where: {
                templateId_vertical_city: {
                  templateId: uniqueTemplateId,
                  vertical: uniqueVertical,
                  city: uniqueCity,
                },
              },
            });

            // Verify the total sent count matches the number of outcomes
            expect(performance!.totalSent).toBe(outcomes.length);

            // Verify metrics are still within valid ranges
            expect(performance!.openRate).toBeGreaterThanOrEqual(0);
            expect(performance!.openRate).toBeLessThanOrEqual(1);
            expect(performance!.clickRate).toBeGreaterThanOrEqual(0);
            expect(performance!.clickRate).toBeLessThanOrEqual(1);
            expect(performance!.replyRate).toBeGreaterThanOrEqual(0);
            expect(performance!.replyRate).toBeLessThanOrEqual(1);
            expect(performance!.conversionRate).toBeGreaterThanOrEqual(0);
            expect(performance!.conversionRate).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('trackWinLoss creates win/loss records with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          verticalArb,
          cityArb,
          winLossDataArb,
          async (vertical, city, winLossData) => {
            // Create test lead
            const leadId = await createTestLead(testTenantId, vertical, city);
            testLeadIds.push(leadId);
            
            // Generate a fake proposal ID (we don't need to create the actual proposal)
            const proposalId = `test-proposal-${Math.random()}`;

            // Track the win/loss
            await trackWinLoss(proposalId, leadId, testTenantId, vertical, city, winLossData);

            // Fetch the win/loss record
            const record = await prisma.winLossRecord.findFirst({
              where: {
                proposalId,
                leadId,
              },
            });

            // Verify the record was created with all required fields
            expect(record).toBeTruthy();
            expect(record!.tenantId).toBe(testTenantId);
            expect(record!.proposalId).toBe(proposalId);
            expect(record!.leadId).toBe(leadId);
            expect(record!.vertical).toBe(vertical);
            expect(record!.city).toBe(city);
            expect(record!.outcome).toBe(winLossData.outcome);

            // Verify optional fields match input
            if (winLossData.tierChosen !== undefined) {
              expect(record!.tierChosen).toBe(winLossData.tierChosen);
            }
            if (winLossData.dealValue !== undefined) {
              expect(Number(record!.dealValue)).toBeCloseTo(winLossData.dealValue, 2);
            }
            if (winLossData.lostReason !== undefined) {
              expect(record!.lostReason).toBe(winLossData.lostReason);
            }
            if (winLossData.competitorMentioned !== undefined) {
              expect(record!.competitorMentioned).toBe(winLossData.competitorMentioned);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('trackFindingOutcome updates finding effectiveness scores', async () => {
      await fc.assert(
        fc.asyncProperty(
          findingTypeArb,
          fc.boolean(),
          async (findingType, accepted) => {
            // Track the finding outcome
            await trackFindingOutcome(findingType, accepted);

            // Fetch the effectiveness record
            const effectiveness = await prisma.findingEffectiveness.findUnique({
              where: { findingType },
            });

            // Verify the record was created/updated
            expect(effectiveness).toBeTruthy();
            expect(effectiveness!.findingType).toBe(findingType);
            expect(effectiveness!.totalOccurrences).toBeGreaterThanOrEqual(1);
            expect(effectiveness!.acceptedCount).toBeGreaterThanOrEqual(0);

            // Verify conversion power is within valid range [0, 1]
            expect(effectiveness!.conversionPower).toBeGreaterThanOrEqual(0);
            expect(effectiveness!.conversionPower).toBeLessThanOrEqual(1);

            // Verify conversion power calculation is correct
            const expectedConversionPower =
              effectiveness!.totalOccurrences > 0
                ? effectiveness!.acceptedCount / effectiveness!.totalOccurrences
                : 0;
            expect(effectiveness!.conversionPower).toBeCloseTo(expectedConversionPower, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('recalibratePricing returns valid conversion rates and pricing', async () => {
      await fc.assert(
        fc.asyncProperty(
          verticalArb,
          cityArb,
          fc.array(
            fc.record({
              outcome: fc.constantFrom<'won' | 'lost' | 'ghosted'>('won', 'lost', 'ghosted'),
              tierChosen: fc.constantFrom('Essentials', 'Growth', 'Premium'),
              dealValue: fc.double({ min: 100, max: 10000 }),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (vertical, city, winLossRecords) => {
            // Use unique vertical/city to avoid test pollution across iterations
            const uniqueVertical = `${vertical}-${Math.random().toString(36).substring(7)}`;
            const uniqueCity = `${city}-${Math.random().toString(36).substring(7)}`;
            
            // Create test data
            for (const record of winLossRecords) {
              const leadId = await createTestLead(testTenantId, uniqueVertical, uniqueCity);
              testLeadIds.push(leadId);
              const proposalId = `test-proposal-${Math.random()}`;

              await trackWinLoss(proposalId, leadId, testTenantId, uniqueVertical, uniqueCity, record);
            }

            // Recalibrate pricing
            const calibration = await recalibratePricing(uniqueVertical, uniqueCity, testTenantId);

            // Verify the calibration has all required fields
            expect(calibration.vertical).toBe(uniqueVertical);
            expect(calibration.city).toBe(uniqueCity);
            expect(calibration.sampleSize).toBe(winLossRecords.length);

            // Verify conversion rates are within valid range [0, 1]
            expect(calibration.essentialsConversionRate).toBeGreaterThanOrEqual(0);
            expect(calibration.essentialsConversionRate).toBeLessThanOrEqual(1);
            expect(calibration.growthConversionRate).toBeGreaterThanOrEqual(0);
            expect(calibration.growthConversionRate).toBeLessThanOrEqual(1);
            expect(calibration.premiumConversionRate).toBeGreaterThanOrEqual(0);
            expect(calibration.premiumConversionRate).toBeLessThanOrEqual(1);

            // Verify recommended pricing is positive
            expect(calibration.recommendedPricing.essentials).toBeGreaterThan(0);
            expect(calibration.recommendedPricing.growth).toBeGreaterThan(0);
            expect(calibration.recommendedPricing.premium).toBeGreaterThan(0);

            // Verify pricing tiers are ordered (essentials < growth < premium)
            expect(calibration.recommendedPricing.essentials).toBeLessThan(
              calibration.recommendedPricing.growth
            );
            expect(calibration.recommendedPricing.growth).toBeLessThan(
              calibration.recommendedPricing.premium
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getVerticalInsights returns valid insights structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              outcome: fc.constantFrom<'won' | 'lost' | 'ghosted'>('won', 'lost', 'ghosted'),
              tierChosen: fc.constantFrom('Essentials', 'Growth', 'Premium'),
              dealValue: fc.double({ min: 100, max: 10000 }),
              lostReason: fc.option(fc.constantFrom('price', 'timing', 'competitor'), { nil: undefined }),
            }),
            { minLength: 3, maxLength: 15 }
          ),
          async (winLossRecords) => {
            // Use a unique vertical name for this test run to avoid interference
            const vertical = `test-vertical-${Math.random().toString(36).substring(7)}`;
            
            // Create test data
            for (const record of winLossRecords) {
              const leadId = await createTestLead(testTenantId, vertical, 'Test City');
              testLeadIds.push(leadId);
              const proposalId = `test-proposal-${Math.random()}`;

              await trackWinLoss(proposalId, leadId, testTenantId, vertical, 'Test City', record);
            }

            // Get vertical insights
            const insights = await getVerticalInsights(vertical);

            // Verify the insights structure
            expect(insights.vertical).toBe(vertical);
            expect(insights.totalProspects).toBe(winLossRecords.length);

            // Verify win rate is within valid range [0, 1]
            expect(insights.winRate).toBeGreaterThanOrEqual(0);
            expect(insights.winRate).toBeLessThanOrEqual(1);

            // Verify average deal value is non-negative
            expect(insights.avgDealValue).toBeGreaterThanOrEqual(0);

            // Verify arrays are present (may be empty)
            expect(Array.isArray(insights.topPerformingFindings)).toBe(true);
            expect(Array.isArray(insights.topLostReasons)).toBe(true);
            expect(Array.isArray(insights.bestEmailPatterns)).toBe(true);

            // Verify avgPainScore is within valid range [0, 100]
            expect(insights.avgPainScore).toBeGreaterThanOrEqual(0);
            expect(insights.avgPainScore).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
