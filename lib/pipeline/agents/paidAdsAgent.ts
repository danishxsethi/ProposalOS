/**
 * Paid Ads Agent
 *
 * AI-powered agent for managing Google Ads campaigns.
 * Stub implementation — no real Google Ads API calls are made.
 *
 * Key behaviours:
 *  - createCampaign: creates a Google Ads campaign with tier-based budgets
 *  - generateAdVariants: generates multiple ad copy variants for A/B testing
 *  - startABTest: starts an A/B test across ad variants
 *  - optimizeBidding: applies automated bidding strategies
 *  - adjustForPerformance: adjusts targeting/bids/copy when CPA exceeds target
 *  - generatePerformanceReport: generates monthly performance reports
 *  - pauseCampaign: pauses an active campaign
 *  - requestBudgetApproval: flags budget changes that exceed tier allocation
 *
 * Tier budget limits (Requirement 3.2):
 *  - Starter: max $500/month
 *  - Growth:  max $2,000/month
 *  - Pro:     max $10,000/month
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { BaseDeliveryAgent } from './baseDeliveryAgent';
import type {
  DeliveryAgentContext,
  DeliveryAgentResult,
  DeliveryAgentType,
} from './baseDeliveryAgent';
import type { DateRange } from '../../pipeline/types';

// ---------------------------------------------------------------------------
// Tier budget configuration (Requirement 3.2)
// ---------------------------------------------------------------------------

export const TIER_MONTHLY_BUDGET_LIMITS: Record<PaidAdsTier, number> = {
  starter: 500,
  growth: 2000,
  pro: 10000,
};

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type PaidAdsTier = 'starter' | 'growth' | 'pro';

export interface PaidAdsConfig {
  clientId: string;
  businessName: string;
  industry: string;
  serviceArea: { city: string; radius: number };
  tier: PaidAdsTier;
  monthlyBudget: number;
  targetKeywords: string[];
  landingPageUrl: string;
}

export interface DemographicTargeting {
  ageRanges?: string[];
  genders?: string[];
  householdIncome?: string[];
}

export interface AdGroup {
  id: string;
  name: string;
  keywords: string[];
  ads: AdVariant[];
  bidAmount: number;
}

export interface CampaignPerformance {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  cpa: number;
  roas: number;
  ctr: number;
  conversionRate: number;
}

export interface AdCampaign {
  id: string;
  name: string;
  type: 'search' | 'display';
  status: 'draft' | 'active' | 'paused' | 'ended';
  budget: { daily: number; monthly: number };
  targeting: {
    keywords: string[];
    locations: string[];
    demographics?: DemographicTargeting;
  };
  adGroups: AdGroup[];
  performance?: CampaignPerformance;
  tier: PaidAdsTier;
  clientId: string;
  createdAt: Date;
}

export interface AdVariant {
  id: string;
  campaignId: string;
  headline1: string;
  headline2: string;
  headline3?: string;
  description1: string;
  description2?: string;
  finalUrl: string;
  status: 'draft' | 'active' | 'paused' | 'ended';
  performance?: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
  };
}

export interface ABTest {
  id: string;
  campaignId: string;
  variants: AdVariant[];
  startedAt: Date;
  status: 'running' | 'completed' | 'stopped';
  winnerVariantId?: string;
  trafficSplit: number; // fraction per variant (e.g. 0.5 for 50/50)
}

export interface BiddingOptimization {
  campaignId: string;
  strategy: 'target_cpa' | 'target_roas' | 'maximize_conversions' | 'enhanced_cpc';
  previousBid: number;
  newBid: number;
  rationale: string;
  appliedAt: Date;
}

export interface AdjustmentResult {
  campaignId: string;
  targetCPA: number;
  currentCPA: number;
  adjustments: {
    type: 'targeting' | 'bid' | 'ad_copy';
    description: string;
    previousValue: string;
    newValue: string;
  }[];
  appliedAt: Date;
  requiresHumanReview: boolean;
}

export interface PerformanceReport {
  campaignId: string;
  dateRange: DateRange;
  summary: {
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
    revenue: number;
    roi: number;
    cpa: number;
    ctr: number;
    conversionRate: number;
  };
  weeklyBreakdown: {
    week: string;
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
  }[];
  topKeywords: { keyword: string; conversions: number; cpa: number }[];
  recommendations: string[];
  generatedAt: Date;
}

export interface ApprovalRequest {
  id: string;
  campaignId: string;
  currentBudget: number;
  requestedBudget: number;
  tier: PaidAdsTier;
  tierLimit: number;
  requiresApproval: boolean;
  reason: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

// ---------------------------------------------------------------------------
// In-memory stores (stub — replace with DB persistence)
// ---------------------------------------------------------------------------

const campaignStore = new Map<string, AdCampaign>();
const abTestStore = new Map<string, ABTest>();
const approvalRequestStore = new Map<string, ApprovalRequest>();

// ---------------------------------------------------------------------------
// Agent implementation
// ---------------------------------------------------------------------------

export class PaidAdsAgent extends BaseDeliveryAgent {
  getAgentType(): DeliveryAgentType {
    return 'paid_ads';
  }

  /**
   * BaseDeliveryAgent.execute() entry point.
   * Runs the full paid ads setup pipeline for a client.
   */
  async execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult> {
    this.status = 'in_progress';

    const config = context.config as unknown as PaidAdsConfig;

    try {
      // 1. Create the campaign
      const campaign = await this.createCampaign(config);

      // 2. Generate ad variants for A/B testing
      const variants = await this.generateAdVariants(campaign.id, 3);

      // 3. Start A/B test
      const abTest = await this.startABTest(campaign.id, variants);

      // 4. Apply automated bidding
      const biddingOpt = await this.optimizeBidding(campaign.id);

      this.status = 'completed';

      return {
        success: true,
        summary: `Paid ads campaign created for ${config.businessName} (tier: ${config.tier})`,
        data: {
          campaignId: campaign.id,
          abTestId: abTest.id,
          biddingStrategy: biddingOpt.strategy,
          monthlyBudget: campaign.budget.monthly,
        },
        costCents: 200, // stub cost
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: `Paid ads setup failed: ${message}`,
        costCents: 0,
        completedAt: new Date().toISOString(),
        error: message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Public agent methods
  // -------------------------------------------------------------------------

  /**
   * Create a Google Ads campaign with tier-based budget allocation.
   * Enforces tier budget limits (Requirement 3.2).
   * Stub: no real Google Ads API call.
   *
   * Requirements: 3.1, 3.2
   */
  async createCampaign(config: PaidAdsConfig): Promise<AdCampaign> {
    this.log(`Creating campaign for ${config.businessName} (tier: ${config.tier})`);

    const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[config.tier];

    // Clamp monthly budget to tier limit
    const monthlyBudget = Math.min(config.monthlyBudget, tierLimit);
    const dailyBudget = parseFloat((monthlyBudget / 30).toFixed(2));

    const id = `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build initial ad group from target keywords
    const adGroupId = `adgroup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const adGroup: AdGroup = {
      id: adGroupId,
      name: `${config.industry} - ${config.serviceArea.city}`,
      keywords: config.targetKeywords,
      ads: [],
      bidAmount: parseFloat((dailyBudget / Math.max(config.targetKeywords.length, 1)).toFixed(2)),
    };

    const campaign: AdCampaign = {
      id,
      name: `${config.businessName} - ${config.industry} Search`,
      type: 'search',
      status: 'active',
      budget: {
        daily: dailyBudget,
        monthly: monthlyBudget,
      },
      targeting: {
        keywords: config.targetKeywords,
        locations: [`${config.serviceArea.city} +${config.serviceArea.radius}mi`],
      },
      adGroups: [adGroup],
      tier: config.tier,
      clientId: config.clientId,
      createdAt: new Date(),
    };

    campaignStore.set(id, campaign);

    return campaign;
  }

  /**
   * Generate multiple ad copy variants for A/B testing.
   * Stub: returns synthesised variants. Replace with real AI copy generation.
   *
   * Requirement 3.3
   */
  async generateAdVariants(campaignId: string, count: number): Promise<AdVariant[]> {
    this.log(`Generating ${count} ad variants for campaign ${campaignId}`);

    const campaign = campaignStore.get(campaignId);
    const landingUrl = campaign
      ? `https://example.com/client/${campaign.clientId}`
      : 'https://example.com';

    const headlines = [
      ['Top-Rated Local Service', 'Get a Free Quote Today', 'Trusted by 500+ Customers'],
      ['Fast & Reliable Service', 'Call Now for Best Rates', 'Licensed & Insured Pros'],
      ['Award-Winning Experts', 'Same-Day Service Available', 'Satisfaction Guaranteed'],
      ['Affordable Quality Service', 'Book Online in Minutes', 'Local Experts Near You'],
      ['#1 Rated in Your Area', 'Free Estimates Available', 'Serving Your Community'],
    ];

    const descriptions = [
      ['Professional service you can trust. Contact us today for a free consultation.', 'Experienced team ready to help. Call or book online now.'],
      ['Quality work at competitive prices. Get your free quote in minutes.', 'Locally owned and operated. We take pride in every job.'],
      ['Fast response times and expert results. Your satisfaction is our priority.', 'Fully licensed and insured. Serving the local area for 10+ years.'],
    ];

    const variants: AdVariant[] = [];

    for (let i = 0; i < count; i++) {
      const headlineSet = headlines[i % headlines.length];
      const descSet = descriptions[i % descriptions.length];

      const variant: AdVariant = {
        id: `variant-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        campaignId,
        headline1: headlineSet[0],
        headline2: headlineSet[1],
        headline3: headlineSet[2],
        description1: descSet[0],
        description2: descSet[1],
        finalUrl: landingUrl,
        status: 'draft',
      };

      variants.push(variant);
    }

    // Attach variants to the campaign's first ad group if campaign exists
    if (campaign && campaign.adGroups.length > 0) {
      campaign.adGroups[0].ads.push(...variants);
      campaignStore.set(campaignId, campaign);
    }

    return variants;
  }

  /**
   * Start an A/B test across the provided ad variants.
   * Distributes traffic evenly across all variants.
   * Stub: persists to in-memory store.
   *
   * Requirement 3.3
   */
  async startABTest(campaignId: string, variants: AdVariant[]): Promise<ABTest> {
    this.log(`Starting A/B test for campaign ${campaignId} with ${variants.length} variants`);

    if (variants.length < 2) {
      throw new Error('A/B test requires at least 2 variants');
    }

    const id = `abtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const trafficSplit = parseFloat((1 / variants.length).toFixed(4));

    // Activate all variants
    const activeVariants = variants.map((v) => ({ ...v, status: 'active' as const }));

    const abTest: ABTest = {
      id,
      campaignId,
      variants: activeVariants,
      startedAt: new Date(),
      status: 'running',
      trafficSplit,
    };

    abTestStore.set(id, abTest);

    return abTest;
  }

  /**
   * Optimise bidding strategy for a campaign using automated bidding.
   * Stub: returns a synthesised optimisation result.
   *
   * Requirement 3.4
   */
  async optimizeBidding(campaignId: string): Promise<BiddingOptimization> {
    this.log(`Optimising bidding for campaign ${campaignId}`);

    const campaign = campaignStore.get(campaignId);
    const previousBid = campaign?.adGroups[0]?.bidAmount ?? 1.0;

    // Stub: apply a 10% bid increase as a simple optimisation
    const newBid = parseFloat((previousBid * 1.1).toFixed(2));

    const optimization: BiddingOptimization = {
      campaignId,
      strategy: 'target_cpa',
      previousBid,
      newBid,
      rationale: 'Switching to Target CPA bidding to optimise for conversions',
      appliedAt: new Date(),
    };

    // Update campaign ad group bids
    if (campaign) {
      campaign.adGroups = campaign.adGroups.map((ag) => ({
        ...ag,
        bidAmount: newBid,
      }));
      campaignStore.set(campaignId, campaign);
    }

    return optimization;
  }

  /**
   * Adjust campaign targeting, bids, or ad copy when performance drops below target CPA.
   * Stub: returns synthesised adjustments.
   *
   * Requirement 3.5
   */
  async adjustForPerformance(
    campaignId: string,
    targetCPA: number
  ): Promise<AdjustmentResult> {
    this.log(`Adjusting campaign ${campaignId} for target CPA: $${targetCPA}`);

    const campaign = campaignStore.get(campaignId);

    // Stub: simulate current CPA being 20% above target
    const currentCPA = parseFloat((targetCPA * 1.2).toFixed(2));

    const adjustments: AdjustmentResult['adjustments'] = [];

    // Bid reduction when CPA is above target
    if (currentCPA > targetCPA) {
      const currentBid = campaign?.adGroups[0]?.bidAmount ?? 1.0;
      const reducedBid = parseFloat((currentBid * 0.9).toFixed(2));

      adjustments.push({
        type: 'bid',
        description: 'Reduce bids to lower CPA toward target',
        previousValue: `$${currentBid}`,
        newValue: `$${reducedBid}`,
      });

      // Apply bid reduction
      if (campaign) {
        campaign.adGroups = campaign.adGroups.map((ag) => ({
          ...ag,
          bidAmount: reducedBid,
        }));
        campaignStore.set(campaignId, campaign);
      }

      // Tighten targeting to higher-intent keywords
      adjustments.push({
        type: 'targeting',
        description: 'Narrow keyword match types to exact/phrase for higher intent',
        previousValue: 'broad match',
        newValue: 'exact + phrase match',
      });
    }

    return {
      campaignId,
      targetCPA,
      currentCPA,
      adjustments,
      appliedAt: new Date(),
      requiresHumanReview: false,
    };
  }

  /**
   * Generate a monthly performance report for a campaign.
   * Stub: returns synthesised metrics.
   *
   * Requirement 3.6
   */
  async generatePerformanceReport(
    campaignId: string,
    dateRange: DateRange
  ): Promise<PerformanceReport> {
    this.log(
      `Generating performance report for campaign ${campaignId} ` +
        `(${dateRange.start.toISOString()} – ${dateRange.end.toISOString()})`
    );

    // Stub: synthesise realistic-looking metrics
    const impressions = 45000;
    const clicks = 1350;
    const conversions = 67;
    const spend = 850;
    const revenue = 4200;

    const report: PerformanceReport = {
      campaignId,
      dateRange,
      summary: {
        impressions,
        clicks,
        conversions,
        spend,
        revenue,
        roi: parseFloat(((revenue - spend) / spend * 100).toFixed(1)),
        cpa: parseFloat((spend / Math.max(conversions, 1)).toFixed(2)),
        ctr: parseFloat((clicks / impressions * 100).toFixed(2)),
        conversionRate: parseFloat((conversions / Math.max(clicks, 1) * 100).toFixed(2)),
      },
      weeklyBreakdown: this._generateWeeklyBreakdown(dateRange, impressions, clicks, conversions, spend),
      topKeywords: [
        { keyword: 'local service near me', conversions: 18, cpa: 11.50 },
        { keyword: 'best local service', conversions: 14, cpa: 13.20 },
        { keyword: 'affordable service', conversions: 12, cpa: 14.80 },
        { keyword: 'emergency service', conversions: 10, cpa: 16.00 },
        { keyword: 'professional service', conversions: 8, cpa: 17.50 },
      ],
      recommendations: [
        'Increase budget allocation to top-performing keywords',
        'Add negative keywords to reduce irrelevant clicks',
        'Test new ad copy variants focusing on urgency',
        'Expand to display network for brand awareness',
      ],
      generatedAt: new Date(),
    };

    return report;
  }

  /**
   * Pause an active campaign.
   * Stub: updates in-memory store.
   *
   * Requirement 3.7
   */
  async pauseCampaign(campaignId: string): Promise<void> {
    this.log(`Pausing campaign ${campaignId}`);

    const campaign = campaignStore.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    if (campaign.status === 'ended') {
      throw new Error(`Cannot pause an ended campaign: ${campaignId}`);
    }

    campaignStore.set(campaignId, { ...campaign, status: 'paused' });
  }

  /**
   * Request budget approval when a new budget exceeds the tier allocation.
   *
   * Business rules (Requirement 3.8):
   *  - If newBudget > tier limit → requiresApproval = true, status = 'pending'
   *  - If newBudget ≤ tier limit → requiresApproval = false, status = 'approved'
   *
   * Returns an ApprovalRequest with the appropriate flags.
   */
  async requestBudgetApproval(
    campaignId: string,
    newBudget: number
  ): Promise<ApprovalRequest> {
    this.log(`Checking budget approval for campaign ${campaignId}: $${newBudget}/month`);

    const campaign = campaignStore.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[campaign.tier];
    const exceedsTierLimit = newBudget > tierLimit;

    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const approvalRequest: ApprovalRequest = {
      id,
      campaignId,
      currentBudget: campaign.budget.monthly,
      requestedBudget: newBudget,
      tier: campaign.tier,
      tierLimit,
      requiresApproval: exceedsTierLimit,
      reason: exceedsTierLimit
        ? `Requested budget $${newBudget}/month exceeds ${campaign.tier} tier limit of $${tierLimit}/month`
        : `Budget change within ${campaign.tier} tier allocation ($${tierLimit}/month)`,
      requestedAt: new Date(),
      status: exceedsTierLimit ? 'pending' : 'approved',
    };

    approvalRequestStore.set(id, approvalRequest);

    if (exceedsTierLimit) {
      this.log(
        `Budget approval required: $${newBudget} exceeds ${campaign.tier} tier limit of $${tierLimit}`
      );
      // Stub: in production, notify client/admin for approval
    } else {
      // Apply the budget change immediately
      const dailyBudget = parseFloat((newBudget / 30).toFixed(2));
      campaignStore.set(campaignId, {
        ...campaign,
        budget: { daily: dailyBudget, monthly: newBudget },
      });
    }

    return approvalRequest;
  }

  // -------------------------------------------------------------------------
  // Helpers for testing / inspection
  // -------------------------------------------------------------------------

  /** Retrieve a campaign from the in-memory store (useful for tests). */
  getCampaign(campaignId: string): AdCampaign | undefined {
    return campaignStore.get(campaignId);
  }

  /** Retrieve an A/B test from the in-memory store (useful for tests). */
  getABTest(testId: string): ABTest | undefined {
    return abTestStore.get(testId);
  }

  /** Retrieve an approval request from the in-memory store (useful for tests). */
  getApprovalRequest(requestId: string): ApprovalRequest | undefined {
    return approvalRequestStore.get(requestId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _generateWeeklyBreakdown(
    dateRange: DateRange,
    totalImpressions: number,
    totalClicks: number,
    totalConversions: number,
    totalSpend: number
  ): PerformanceReport['weeklyBreakdown'] {
    const weeks: PerformanceReport['weeklyBreakdown'] = [];
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalMs = dateRange.end.getTime() - dateRange.start.getTime();
    const weekCount = Math.max(Math.ceil(totalMs / msPerWeek), 1);

    for (let i = 0; i < weekCount; i++) {
      const weekStart = new Date(dateRange.start.getTime() + i * msPerWeek);
      const fraction = 1 / weekCount;

      weeks.push({
        week: weekStart.toISOString().slice(0, 10),
        impressions: Math.round(totalImpressions * fraction),
        clicks: Math.round(totalClicks * fraction),
        conversions: Math.round(totalConversions * fraction),
        spend: parseFloat((totalSpend * fraction).toFixed(2)),
      });
    }

    return weeks;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const paidAdsAgent = new PaidAdsAgent();
