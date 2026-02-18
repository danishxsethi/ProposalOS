/**
 * Unit Tests for Learning Loop Extensions
 * 
 * Tests specific examples and edge cases for:
 * - Outreach outcome tracking
 * - Win/loss recording with reason codes
 * - Pricing recalibration logic
 * 
 * Requirements: 8.2, 8.4, 8.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  trackOutreachOutcome,
  trackWinLoss,
  recalibratePricing,
  getVerticalInsights,
  type OutreachOutcome,
  type WinLossData,
} from '../learningLoop';

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
  // Clean up win/loss records
  if (testTenantId) {
    await prisma.winLossRecord.deleteMany({
      where: { tenantId: testTenantId },
    });
  }

  // Clean up outreach template performance
  await prisma.outreachTemplatePerformance.deleteMany({
    where: { templateId: { startsWith: 'unit-test-' } },
  });

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
// Unit Tests
// ============================================================================

describe('Learning Loop Unit Tests', () => {
  beforeEach(async () => {
    testTenantId = await createTestTenant();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('trackOutreachOutcome', () => {
    it('should create a new performance record for first outcome', async () => {
      const templateId = 'unit-test-template-1';
      const outcome: OutreachOutcome = {
        openRate: 0.5,
        clickRate: 0.3,
        replyRate: 0.1,
        conversionRate: 0.05,
        vertical: 'dentist',
        city: 'New York',
      };

      await trackOutreachOutcome(templateId, outcome);

      const performance = await prisma.outreachTemplatePerformance.findUnique({
        where: {
          templateId_vertical_city: {
            templateId,
            vertical: 'dentist',
            city: 'New York',
          },
        },
      });

      expect(performance).toBeTruthy();
      expect(performance!.totalSent).toBe(1);
      expect(performance!.openRate).toBe(0.5);
      expect(performance!.clickRate).toBe(0.3);
      expect(performance!.replyRate).toBe(0.1);
      expect(performance!.conversionRate).toBe(0.05);
    });

    it('should update existing performance record with rolling averages', async () => {
      const templateId = 'unit-test-template-2';
      const vertical = 'hvac';
      const city = 'Los Angeles';

      // First outcome
      await trackOutreachOutcome(templateId, {
        openRate: 0.6,
        clickRate: 0.4,
        replyRate: 0.2,
        conversionRate: 0.1,
        vertical,
        city,
      });

      // Second outcome
      await trackOutreachOutcome(templateId, {
        openRate: 0.4,
        clickRate: 0.2,
        replyRate: 0.1,
        conversionRate: 0.05,
        vertical,
        city,
      });

      const performance = await prisma.outreachTemplatePerformance.findUnique({
        where: {
          templateId_vertical_city: {
            templateId,
            vertical,
            city,
          },
        },
      });

      expect(performance!.totalSent).toBe(2);
      // Rolling averages should be calculated
      expect(performance!.openRate).toBeGreaterThan(0);
      expect(performance!.openRate).toBeLessThanOrEqual(1);
    });

    it('should handle NaN and Infinity rates gracefully', async () => {
      const templateId = 'unit-test-template-3';
      const outcome: OutreachOutcome = {
        openRate: NaN,
        clickRate: Infinity,
        replyRate: -Infinity,
        conversionRate: 0.05,
        vertical: 'plumber',
        city: 'Chicago',
      };

      await trackOutreachOutcome(templateId, outcome);

      const performance = await prisma.outreachTemplatePerformance.findUnique({
        where: {
          templateId_vertical_city: {
            templateId,
            vertical: 'plumber',
            city: 'Chicago',
          },
        },
      });

      // NaN and Infinity should be sanitized to 0
      expect(performance!.openRate).toBe(0);
      expect(performance!.clickRate).toBe(0);
      expect(performance!.replyRate).toBe(0);
      expect(performance!.conversionRate).toBe(0.05);
    });

    it('should handle empty city string', async () => {
      const templateId = 'unit-test-template-4';
      const outcome: OutreachOutcome = {
        openRate: 0.5,
        clickRate: 0.3,
        replyRate: 0.1,
        conversionRate: 0.05,
        vertical: 'lawyer',
        city: '',
      };

      await trackOutreachOutcome(templateId, outcome);

      const performance = await prisma.outreachTemplatePerformance.findUnique({
        where: {
          templateId_vertical_city: {
            templateId,
            vertical: 'lawyer',
            city: '',
          },
        },
      });

      expect(performance).toBeTruthy();
      expect(performance!.city).toBe('');
    });
  });

  describe('trackWinLoss', () => {
    it('should record a won outcome with all fields', async () => {
      const leadId = await createTestLead(testTenantId, 'dentist', 'New York');
      testLeadIds.push(leadId);
      const proposalId = 'unit-test-proposal-1';

      const winLossData: WinLossData = {
        outcome: 'won',
        tierChosen: 'Growth',
        dealValue: 1500,
        lostReason: undefined,
        objectionsRaised: ['price_concern'],
        competitorMentioned: undefined,
      };

      await trackWinLoss(proposalId, leadId, testTenantId, 'dentist', 'New York', winLossData);

      const record = await prisma.winLossRecord.findFirst({
        where: { proposalId },
      });

      expect(record).toBeTruthy();
      expect(record!.outcome).toBe('won');
      expect(record!.tierChosen).toBe('Growth');
      expect(Number(record!.dealValue)).toBe(1500);
      expect(record!.lostReason).toBeNull();
      expect(record!.objectionsRaised).toEqual(['price_concern']);
    });

    it('should record a lost outcome with reason codes', async () => {
      const leadId = await createTestLead(testTenantId, 'hvac', 'Los Angeles');
      testLeadIds.push(leadId);
      const proposalId = 'unit-test-proposal-2';

      const winLossData: WinLossData = {
        outcome: 'lost',
        tierChosen: 'Premium',
        dealValue: undefined,
        lostReason: 'price',
        objectionsRaised: ['too_expensive', 'need_more_time'],
        competitorMentioned: 'Competitor A',
      };

      await trackWinLoss(proposalId, leadId, testTenantId, 'hvac', 'Los Angeles', winLossData);

      const record = await prisma.winLossRecord.findFirst({
        where: { proposalId },
      });

      expect(record).toBeTruthy();
      expect(record!.outcome).toBe('lost');
      expect(record!.lostReason).toBe('price');
      expect(record!.objectionsRaised).toEqual(['too_expensive', 'need_more_time']);
      expect(record!.competitorMentioned).toBe('Competitor A');
    });

    it('should record a ghosted outcome', async () => {
      const leadId = await createTestLead(testTenantId, 'plumber', 'Chicago');
      testLeadIds.push(leadId);
      const proposalId = 'unit-test-proposal-3';

      const winLossData: WinLossData = {
        outcome: 'ghosted',
        tierChosen: undefined,
        dealValue: undefined,
        lostReason: 'no_response',
        objectionsRaised: undefined,
        competitorMentioned: undefined,
      };

      await trackWinLoss(proposalId, leadId, testTenantId, 'plumber', 'Chicago', winLossData);

      const record = await prisma.winLossRecord.findFirst({
        where: { proposalId },
      });

      expect(record).toBeTruthy();
      expect(record!.outcome).toBe('ghosted');
      expect(record!.tierChosen).toBeNull();
      expect(record!.dealValue).toBeNull();
    });

    it('should handle null city', async () => {
      const leadId = await createTestLead(testTenantId, 'lawyer', 'Boston');
      testLeadIds.push(leadId);
      const proposalId = 'unit-test-proposal-4';

      const winLossData: WinLossData = {
        outcome: 'won',
        tierChosen: 'Essentials',
        dealValue: 500,
      };

      await trackWinLoss(proposalId, leadId, testTenantId, 'lawyer', null, winLossData);

      const record = await prisma.winLossRecord.findFirst({
        where: { proposalId },
      });

      expect(record).toBeTruthy();
      expect(record!.city).toBeNull();
    });
  });

  describe('recalibratePricing', () => {
    it('should return default pricing when no data exists', async () => {
      const calibration = await recalibratePricing('restaurant', 'Phoenix');

      expect(calibration.vertical).toBe('restaurant');
      expect(calibration.city).toBe('Phoenix');
      expect(calibration.sampleSize).toBe(0);
      expect(calibration.essentialsConversionRate).toBe(0);
      expect(calibration.growthConversionRate).toBe(0);
      expect(calibration.premiumConversionRate).toBe(0);
      expect(calibration.recommendedPricing.essentials).toBe(500);
      expect(calibration.recommendedPricing.growth).toBe(1500);
      expect(calibration.recommendedPricing.premium).toBe(3000);
    });

    it('should increase pricing when conversion rate is high (>50%)', async () => {
      const vertical = 'dentist';
      const city = 'New York';

      // Create 10 won records for Essentials tier
      for (let i = 0; i < 10; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-high-conv-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'won',
            tierChosen: 'Essentials',
            dealValue: 500,
          }
        );
      }

      const calibration = await recalibratePricing(vertical, city);

      expect(calibration.essentialsConversionRate).toBe(1.0); // 10/10 = 100%
      expect(calibration.recommendedPricing.essentials).toBe(600); // 500 * 1.2
    });

    it('should decrease pricing when conversion rate is low (<10%)', async () => {
      const vertical = 'hvac';
      const city = 'Los Angeles';

      // Create 1 won and 10 lost records for Growth tier
      const leadId1 = await createTestLead(testTenantId, vertical, city);
      testLeadIds.push(leadId1);
      await trackWinLoss(`unit-test-proposal-low-conv-won`, leadId1, testTenantId, vertical, city, {
        outcome: 'won',
        tierChosen: 'Growth',
        dealValue: 1500,
      });

      for (let i = 0; i < 10; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-low-conv-lost-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'lost',
            tierChosen: 'Growth',
            lostReason: 'price',
          }
        );
      }

      const calibration = await recalibratePricing(vertical, city);

      expect(calibration.growthConversionRate).toBeCloseTo(1 / 11, 2); // ~9%
      expect(calibration.recommendedPricing.growth).toBe(1200); // 1500 * 0.8
    });

    it('should keep base pricing when conversion rate is moderate (10-50%)', async () => {
      const vertical = 'plumber';
      const city = 'Chicago';

      // Create 3 won and 7 lost records for Premium tier (30% conversion)
      for (let i = 0; i < 3; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-mod-conv-won-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'won',
            tierChosen: 'Premium',
            dealValue: 3000,
          }
        );
      }

      for (let i = 0; i < 7; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-mod-conv-lost-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'lost',
            tierChosen: 'Premium',
            lostReason: 'timing',
          }
        );
      }

      const calibration = await recalibratePricing(vertical, city);

      expect(calibration.premiumConversionRate).toBeCloseTo(0.3, 2); // 30%
      expect(calibration.recommendedPricing.premium).toBe(3000); // No change
    });

    it('should calculate conversion rates for multiple tiers', async () => {
      const vertical = 'lawyer';
      const city = 'Houston';

      // Essentials: 2 won, 2 lost (50%)
      for (let i = 0; i < 2; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-multi-ess-won-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'won',
            tierChosen: 'Essentials',
            dealValue: 500,
          }
        );
      }
      for (let i = 0; i < 2; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-multi-ess-lost-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'lost',
            tierChosen: 'Essentials',
            lostReason: 'price',
          }
        );
      }

      // Growth: 1 won, 4 lost (20%)
      const leadId1 = await createTestLead(testTenantId, vertical, city);
      testLeadIds.push(leadId1);
      await trackWinLoss(
        `unit-test-proposal-multi-growth-won`,
        leadId1,
        testTenantId,
        vertical,
        city,
        {
          outcome: 'won',
          tierChosen: 'Growth',
          dealValue: 1500,
        }
      );
      for (let i = 0; i < 4; i++) {
        const leadId = await createTestLead(testTenantId, vertical, city);
        testLeadIds.push(leadId);
        await trackWinLoss(
          `unit-test-proposal-multi-growth-lost-${i}`,
          leadId,
          testTenantId,
          vertical,
          city,
          {
            outcome: 'lost',
            tierChosen: 'Growth',
            lostReason: 'competitor',
          }
        );
      }

      const calibration = await recalibratePricing(vertical, city);

      expect(calibration.essentialsConversionRate).toBe(0.5); // 50%
      expect(calibration.growthConversionRate).toBe(0.2); // 20%
      expect(calibration.sampleSize).toBe(9);
    });
  });

  describe('getVerticalInsights', () => {
    it('should return empty insights for vertical with no data', async () => {
      const insights = await getVerticalInsights('retail');

      expect(insights.vertical).toBe('retail');
      expect(insights.totalProspects).toBe(0);
      expect(insights.winRate).toBe(0);
      expect(insights.avgDealValue).toBe(0);
      // Note: topPerformingFindings and bestEmailPatterns may contain global data
      // from other tests since they are not filtered by vertical
      expect(Array.isArray(insights.topPerformingFindings)).toBe(true);
      expect(insights.topLostReasons).toEqual([]);
      expect(Array.isArray(insights.bestEmailPatterns)).toBe(true);
    });

    it('should calculate win rate correctly', async () => {
      const vertical = 'fitness';

      // Create 3 won and 2 lost records
      for (let i = 0; i < 3; i++) {
        const leadId = await createTestLead(testTenantId, vertical, 'Test City');
        testLeadIds.push(leadId);
        await trackWinLoss(`unit-test-insights-won-${i}`, leadId, testTenantId, vertical, 'Test City', {
          outcome: 'won',
          tierChosen: 'Growth',
          dealValue: 1500,
        });
      }

      for (let i = 0; i < 2; i++) {
        const leadId = await createTestLead(testTenantId, vertical, 'Test City');
        testLeadIds.push(leadId);
        await trackWinLoss(`unit-test-insights-lost-${i}`, leadId, testTenantId, vertical, 'Test City', {
          outcome: 'lost',
          tierChosen: 'Growth',
          lostReason: 'price',
        });
      }

      const insights = await getVerticalInsights(vertical);

      expect(insights.totalProspects).toBe(5);
      expect(insights.winRate).toBe(0.6); // 3/5 = 60%
      expect(insights.avgDealValue).toBe(1500); // Average of won deals
    });

    it('should aggregate top lost reasons', async () => {
      const vertical = 'restaurant';

      // Create lost records with various reasons
      const reasons = ['price', 'price', 'price', 'timing', 'timing', 'competitor'];
      for (let i = 0; i < reasons.length; i++) {
        const leadId = await createTestLead(testTenantId, vertical, 'Test City');
        testLeadIds.push(leadId);
        await trackWinLoss(`unit-test-reasons-${i}`, leadId, testTenantId, vertical, 'Test City', {
          outcome: 'lost',
          tierChosen: 'Essentials',
          lostReason: reasons[i],
        });
      }

      const insights = await getVerticalInsights(vertical);

      expect(insights.topLostReasons.length).toBeGreaterThan(0);
      expect(insights.topLostReasons[0].reason).toBe('price');
      expect(insights.topLostReasons[0].count).toBe(3);
    });

    it('should calculate average deal value from won deals only', async () => {
      const vertical = 'retail';

      // Create won deals with different values
      const dealValues = [500, 1500, 3000];
      for (let i = 0; i < dealValues.length; i++) {
        const leadId = await createTestLead(testTenantId, vertical, 'Test City');
        testLeadIds.push(leadId);
        await trackWinLoss(`unit-test-deal-value-${i}`, leadId, testTenantId, vertical, 'Test City', {
          outcome: 'won',
          tierChosen: 'Growth',
          dealValue: dealValues[i],
        });
      }

      // Create lost deals (should not affect average)
      const leadId = await createTestLead(testTenantId, vertical, 'Test City');
      testLeadIds.push(leadId);
      await trackWinLoss(`unit-test-deal-value-lost`, leadId, testTenantId, vertical, 'Test City', {
        outcome: 'lost',
        tierChosen: 'Premium',
        lostReason: 'price',
      });

      const insights = await getVerticalInsights(vertical);

      const expectedAvg = (500 + 1500 + 3000) / 3;
      expect(insights.avgDealValue).toBeCloseTo(expectedAvg, 2);
    });
  });
});
