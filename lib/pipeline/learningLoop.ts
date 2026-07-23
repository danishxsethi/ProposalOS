import { prisma } from '@/lib/prisma';
import {
  updateBenchmark as flywheelUpdateBenchmark,
  trackFindingOutcome as flywheelTrackFindingOutcome,
  trackPromptOutcome as flywheelTrackPromptOutcome,
} from '@/lib/flywheel/dataFlywheel';

/**
 * Learning Loop Extensions
 * 
 * Extends the existing data flywheel with additional tracking for:
 * - Outreach template performance
 * - Win/loss analysis with reason codes
 * - Pricing recalibration based on conversion rates
 * - Vertical-specific insights
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

// ============================================================================
// Existing Flywheel Functions (Re-exported)
// ============================================================================

/**
 * Update industry benchmark statistics
 * Requirements: 8.3
 */
export async function updateBenchmark(industry: string, metrics: Record<string, number>): Promise<void> {
  return flywheelUpdateBenchmark(industry, metrics);
}

/**
 * Track finding effectiveness (accepted vs rejected)
 * Requirements: 8.1
 */
export async function trackFindingOutcome(findingType: string, accepted: boolean): Promise<void> {
  return flywheelTrackFindingOutcome(findingType, accepted);
}

/**
 * Track prompt performance (QA score and acceptance)
 * Requirements: 8.5
 */
export async function trackPromptOutcome(
  promptId: string,
  outcome: { qaScore?: number; accepted?: boolean }
): Promise<void> {
  return flywheelTrackPromptOutcome(promptId, outcome);
}

// ============================================================================
// New Learning Loop Extensions
// ============================================================================

export interface OutreachOutcome {
  openRate: number;
  clickRate: number;
  replyRate: number;
  conversionRate: number;
  vertical: string;
  city: string;
}

export interface WinLossData {
  outcome: 'won' | 'lost' | 'ghosted';
  tierChosen?: string;
  dealValue?: number;
  lostReason?: string;
  objectionsRaised?: string[];
  competitorMentioned?: string;
}

export interface PricingCalibration {
  vertical: string;
  city: string;
  essentialsConversionRate: number;
  growthConversionRate: number;
  premiumConversionRate: number;
  recommendedPricing: {
    essentials: number;
    growth: number;
    premium: number;
  };
  sampleSize: number;
}

export interface VerticalInsights {
  vertical: string;
  totalProspects: number;
  winRate: number;
  avgDealValue: number;
  topPerformingFindings: Array<{ findingType: string; conversionPower: number }>;
  topLostReasons: Array<{ reason: string; count: number }>;
  bestEmailPatterns: Array<{ templateId: string; conversionRate: number }>;
  avgPainScore: number;
}

/**
 * Track outreach template performance
 * Requirements: 8.2
 * 
 * Updates OutreachTemplatePerformance table with aggregated metrics
 * for a specific template, vertical, and city combination.
 */
export async function trackOutreachOutcome(
  templateId: string,
  outcome: OutreachOutcome
): Promise<void> {
  try {
    const { vertical, city, openRate, clickRate, replyRate, conversionRate } = outcome;

    // Sanitize rates to handle NaN and Infinity
    const sanitizeRate = (rate: number): number => {
      if (!isFinite(rate) || isNaN(rate)) return 0;
      return Math.max(0, Math.min(1, rate));
    };

    const sanitizedOpenRate = sanitizeRate(openRate);
    const sanitizedClickRate = sanitizeRate(clickRate);
    const sanitizedReplyRate = sanitizeRate(replyRate);
    const sanitizedConversionRate = sanitizeRate(conversionRate);

    // Upsert the performance record
    const existing = await prisma.outreachTemplatePerformance.findUnique({
      where: {
        templateId_vertical_city: {
          templateId,
          vertical,
          city: city || '',
        },
      },
    });

    if (existing) {
      // Update with rolling averages
      const totalSent = existing.totalSent + 1;
      const newOpenCount = existing.openCount + (sanitizedOpenRate > 0 ? 1 : 0);
      const newClickCount = existing.clickCount + (sanitizedClickRate > 0 ? 1 : 0);
      const newReplyCount = existing.replyCount + (sanitizedReplyRate > 0 ? 1 : 0);
      const newConversionCount = existing.conversionCount + (sanitizedConversionRate > 0 ? 1 : 0);

      await prisma.outreachTemplatePerformance.update({
        where: { id: existing.id },
        data: {
          totalSent,
          openCount: newOpenCount,
          clickCount: newClickCount,
          replyCount: newReplyCount,
          conversionCount: newConversionCount,
          openRate: totalSent > 0 ? newOpenCount / totalSent : 0,
          clickRate: totalSent > 0 ? newClickCount / totalSent : 0,
          replyRate: totalSent > 0 ? newReplyCount / totalSent : 0,
          conversionRate: totalSent > 0 ? newConversionCount / totalSent : 0,
        },
      });
    } else {
      // Create new record
      await prisma.outreachTemplatePerformance.create({
        data: {
          templateId,
          vertical,
          city: city || '',
          totalSent: 1,
          openCount: sanitizedOpenRate > 0 ? 1 : 0,
          clickCount: sanitizedClickRate > 0 ? 1 : 0,
          replyCount: sanitizedReplyRate > 0 ? 1 : 0,
          conversionCount: sanitizedConversionRate > 0 ? 1 : 0,
          openRate: sanitizedOpenRate,
          clickRate: sanitizedClickRate,
          replyRate: sanitizedReplyRate,
          conversionRate: sanitizedConversionRate,
        },
      });
    }

    console.log(`[LearningLoop] Tracked outreach outcome for template ${templateId} in ${vertical}/${city}`);
  } catch (error) {
    console.error('[LearningLoop] Failed to track outreach outcome:', error);
    throw error;
  }
}

/**
 * Track win/loss outcomes with reason codes
 * Requirements: 8.6
 * 
 * Records detailed win/loss data including reason codes, objections,
 * and competitor mentions for future playbook refinement.
 */
export async function trackWinLoss(
  proposalId: string,
  leadId: string,
  tenantId: string,
  vertical: string,
  city: string | null,
  data: WinLossData
): Promise<void> {
  try {
    await prisma.winLossRecord.create({
      data: {
        tenantId,
        proposalId,
        leadId,
        vertical,
        city,
        outcome: data.outcome,
        tierChosen: data.tierChosen,
        dealValue: data.dealValue,
        lostReason: data.lostReason,
        objectionsRaised: data.objectionsRaised || [],
        competitorMentioned: data.competitorMentioned,
      },
    });

    console.log(`[LearningLoop] Tracked ${data.outcome} outcome for proposal ${proposalId}`);
  } catch (error) {
    console.error('[LearningLoop] Failed to track win/loss:', error);
    throw error;
  }
}

/**
 * Recalibrate pricing based on historical conversion rates
 * Requirements: 8.4
 * 
 * Analyzes win/loss data for a specific vertical and city to compute
 * conversion rates by tier and recommend optimal pricing.
 */
export async function recalibratePricing(
  vertical: string,
  city: string,
  tenantId?: string
): Promise<PricingCalibration> {
  try {
    // Fetch all win/loss records for this vertical/city (optionally filtered by tenant)
    const where: any = {
      vertical,
      city: city || null,
    };
    
    if (tenantId) {
      where.tenantId = tenantId;
    }
    
    const records = await prisma.winLossRecord.findMany({ where });

    if (records.length === 0) {
      // No data yet, return defaults
      return {
        vertical,
        city,
        essentialsConversionRate: 0,
        growthConversionRate: 0,
        premiumConversionRate: 0,
        recommendedPricing: {
          essentials: 500,
          growth: 1500,
          premium: 3000,
        },
        sampleSize: 0,
      };
    }

    // Calculate conversion rates by tier
    const tierCounts = {
      essentials: { total: 0, won: 0 },
      growth: { total: 0, won: 0 },
      premium: { total: 0, won: 0 },
    };

    for (const record of records) {
      if (record.tierChosen) {
        const tier = record.tierChosen.toLowerCase() as 'essentials' | 'growth' | 'premium';
        if (tierCounts[tier]) {
          tierCounts[tier].total++;
          if (record.outcome === 'won') {
            tierCounts[tier].won++;
          }
        }
      }
    }

    const essentialsConversionRate =
      tierCounts.essentials.total > 0
        ? tierCounts.essentials.won / tierCounts.essentials.total
        : 0;
    const growthConversionRate =
      tierCounts.growth.total > 0 ? tierCounts.growth.won / tierCounts.growth.total : 0;
    const premiumConversionRate =
      tierCounts.premium.total > 0 ? tierCounts.premium.won / tierCounts.premium.total : 0;

    // Simple pricing recommendation logic:
    // - If conversion rate is very high (>50%), we can increase price
    // - If conversion rate is very low (<10%), we should decrease price
    // - Otherwise, keep current pricing
    const basePricing = { essentials: 500, growth: 1500, premium: 3000 };
    const rawRecommendedPricing = {
      essentials: adjustPrice(basePricing.essentials, essentialsConversionRate),
      growth: adjustPrice(basePricing.growth, growthConversionRate),
      premium: adjustPrice(basePricing.premium, premiumConversionRate),
    };

    // Ensure tier ordering is maintained
    const recommendedPricing = ensureTierOrdering(rawRecommendedPricing);

    return {
      vertical,
      city,
      essentialsConversionRate,
      growthConversionRate,
      premiumConversionRate,
      recommendedPricing,
      sampleSize: records.length,
    };
  } catch (error) {
    console.error('[LearningLoop] Failed to recalibrate pricing:', error);
    throw error;
  }
}

/**
 * Helper function to adjust pricing based on conversion rate
 */
function adjustPrice(basePrice: number, conversionRate: number): number {
  if (conversionRate > 0.5) {
    // High conversion rate - increase price by 20%
    return Math.round(basePrice * 1.2);
  } else if (conversionRate < 0.1 && conversionRate > 0) {
    // Low conversion rate - decrease price by 20%
    return Math.round(basePrice * 0.8);
  }
  // Otherwise, keep base price
  return basePrice;
}

/**
 * Ensure pricing tiers maintain their order (essentials < growth < premium)
 */
function ensureTierOrdering(pricing: { essentials: number; growth: number; premium: number }): {
  essentials: number;
  growth: number;
  premium: number;
} {
  const { essentials, growth, premium } = pricing;

  // If ordering is already correct, return as-is
  if (essentials < growth && growth < premium) {
    return pricing;
  }

  // Otherwise, enforce minimum gaps between tiers
  // Start from the base prices and adjust based on conversion rates
  const basePricing = { essentials: 500, growth: 1500, premium: 3000 };
  
  // If essentials is too high, cap it at growth - 100
  let adjustedEssentials = essentials;
  let adjustedGrowth = growth;
  let adjustedPremium = premium;

  // Ensure growth is at least essentials + 100
  if (adjustedGrowth <= adjustedEssentials) {
    adjustedGrowth = Math.max(basePricing.growth, adjustedEssentials + 100);
  }

  // Ensure premium is at least growth + 100
  if (adjustedPremium <= adjustedGrowth) {
    adjustedPremium = Math.max(basePricing.premium, adjustedGrowth + 100);
  }

  // Now ensure essentials is less than growth
  if (adjustedEssentials >= adjustedGrowth) {
    adjustedEssentials = adjustedGrowth - 100;
  }

  return {
    essentials: Math.max(100, adjustedEssentials), // Minimum $100
    growth: adjustedGrowth,
    premium: adjustedPremium,
  };
}

/**
 * Get vertical-specific insights
 * Requirements: 8.4
 * 
 * Aggregates learning data for a specific vertical to provide
 * actionable insights for improving pipeline performance.
 */
export async function getVerticalInsights(vertical: string): Promise<VerticalInsights> {
  try {
    // Fetch win/loss records
    const winLossRecords = await prisma.winLossRecord.findMany({
      where: { vertical },
    });

    // Fetch finding effectiveness
    const findingStats = await prisma.findingEffectiveness.findMany({
      orderBy: { conversionPower: 'desc' },
      take: 5,
    });

    // Fetch outreach template performance
    const templateStats = await prisma.outreachTemplatePerformance.findMany({
      where: { vertical },
      orderBy: { conversionRate: 'desc' },
      take: 5,
    });

    // Calculate metrics
    const totalProspects = winLossRecords.length;
    const wonCount = winLossRecords.filter((r) => r.outcome === 'won').length;
    const winRate = totalProspects > 0 ? wonCount / totalProspects : 0;

    const totalDealValue = winLossRecords
      .filter((r) => r.outcome === 'won' && r.dealValue)
      .reduce((sum, r) => sum + Number(r.dealValue || 0), 0);
    const avgDealValue = wonCount > 0 ? totalDealValue / wonCount : 0;

    // Top lost reasons
    const lostReasonCounts = new Map<string, number>();
    winLossRecords
      .filter((r) => r.outcome === 'lost' && r.lostReason)
      .forEach((r) => {
        const reason = r.lostReason!;
        lostReasonCounts.set(reason, (lostReasonCounts.get(reason) || 0) + 1);
      });

    const topLostReasons = Array.from(lostReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Fetch average pain score from prospects (if available)
    // For now, we'll set a placeholder since we don't have direct access to prospect pain scores
    const avgPainScore = 0;

    return {
      vertical,
      totalProspects,
      winRate,
      avgDealValue,
      topPerformingFindings: findingStats.map((f) => ({
        findingType: f.findingType,
        conversionPower: f.conversionPower,
      })),
      topLostReasons,
      bestEmailPatterns: templateStats.map((t) => ({
        templateId: t.templateId,
        conversionRate: t.conversionRate,
      })),
      avgPainScore,
    };
  } catch (error) {
    console.error('[LearningLoop] Failed to get vertical insights:', error);
    throw error;
  }
}
