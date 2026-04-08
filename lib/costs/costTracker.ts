/**
 * Cost tracking for external APIs and LLMs
 * 
 * Features:
 * - Per-audit cost tracking
 * - Per-tenant spend aggregation
 * - Tier-based budget caps
 * - Soft alerts and hard caps
 */
import { logger } from '@/lib/logger';

import { CostCapExceededError, TenantBudgetExceededError } from './errors';

export const COSTS = {
  PAGESPEED_COST_CENTS: 0,
  PLACES_TEXT_SEARCH_CENTS: 3, // $0.032 -> 3 cents
  PLACES_DETAILS_CENTS: 2, // $0.017 -> 2 cents
  SERP_API_CENTS: 1, // $0.01 -> 1 cent
  GEMINI_FLASH_PER_1K_INPUT_CENTS: 0.01,
  GEMINI_FLASH_PER_1K_OUTPUT_CENTS: 0.03,
  GEMINI_PRO_PER_1K_INPUT_CENTS: 0.07,
  GEMINI_PRO_PER_1K_OUTPUT_CENTS: 0.21,
  GEMINI_31_PRO_PER_1K_INPUT_CENTS: 0.125, // $1.25 / 1M = 0.125 cents / 1K
  GEMINI_31_PRO_PER_1K_OUTPUT_CENTS: 0.5, // $5.00 / 1M = 0.50 cents / 1K
};

// User only specified input costs. I will stick to their request for input primarily
// but logic should support output if needed.
// "GEMINI_FLASH_PER_1K_INPUT_CENTS = 0.01 (essentially free)"
// "GEMINI_PRO_PER_1K_INPUT_CENTS = 0.07"

export type ApiType =
  | 'PAGESPEED'
  | 'PLACES_TEXT_SEARCH'
  | 'PLACES_DETAILS'
  | 'SERP_API'
  | 'SERP'
  | 'PLACES_DETAILS_DEEP'
  | 'GEMINI_FLASH'
  | 'GEMINI_PRO'
  | 'GEMINI'
  | 'GEMINI_STRATEGY'
  | 'GEMINI_KEYWORD_GEN'
  | 'GEMINI_PHOTO_ANALYSIS'
  | 'SERP_API_SEARCH'
  | 'CRAWLER_COMPETITOR'
  | 'GBP_COMPETITOR'
  | 'GEMINI_ACTION_PLAN'
  | 'GEMINI_REVIEW_RESPONSE'
  | 'GEMINI_31_PRO';
export type LlmModel = 'GEMINI_FLASH' | 'GEMINI_PRO' | 'GEMINI_31_PRO';

/**
 * Pricing tier budget configurations
 * Monthly budgets per tenant tier
 */
export const TIER_BUDGETS = {
  FREE: {
    monthlyBudgetCents: 500, // $5.00/month
    perAuditCapCents: 50, // $0.50/audit
    maxAuditsPerDay: 10,
  },
  STARTER: {
    monthlyBudgetCents: 2000, // $20.00/month
    perAuditCapCents: 100, // $1.00/audit
    maxAuditsPerDay: 50,
  },
  GROWTH: {
    monthlyBudgetCents: 10000, // $100.00/month
    perAuditCapCents: 150, // $1.50/audit
    maxAuditsPerDay: 200,
  },
  PREMIUM: {
    monthlyBudgetCents: 50000, // $500.00/month
    perAuditCapCents: 200, // $2.00/audit
    maxAuditsPerDay: 1000,
  },
  AGENCY: {
    monthlyBudgetCents: 200000, // $2,000.00/month
    perAuditCapCents: 100, // $1.00/audit (volume discount)
    maxAuditsPerDay: 5000,
  },
  WHITE_LABEL: {
    monthlyBudgetCents: 500000, // $5,000.00/month
    perAuditCapCents: 75, // $0.75/audit (highest volume)
    maxAuditsPerDay: 20000,
  },
};

export type TenantTier = keyof typeof TIER_BUDGETS;

/**
 * Tenant spend tracking record
 */
export interface TenantSpendRecord {
  tenantId: string;
  tier: TenantTier;
  currentMonthSpendCents: number;
  currentMonthAuditCount: number;
  todayAuditCount: number;
  lastResetDate: string; // ISO date string
  alertsTriggered: string[];
}

/**
 * Global spend tracker for per-tenant aggregation
 * Singleton pattern for in-memory tracking (should be backed by Redis in production)
 */
class GlobalSpendTracker {
  private static instance: GlobalSpendTracker;
  private tenantSpends: Map<string, TenantSpendRecord> = new Map();
  
  private constructor() {}
  
  static getInstance(): GlobalSpendTracker {
    if (!GlobalSpendTracker.instance) {
      GlobalSpendTracker.instance = new GlobalSpendTracker();
    }
    return GlobalSpendTracker.instance;
  }

  /**
   * Get or create tenant spend record
   */
  getOrCreateRecord(tenantId: string, tier: TenantTier = 'STARTER'): TenantSpendRecord {
    const existing = this.tenantSpends.get(tenantId);
    if (!existing) {
      const newRecord: TenantSpendRecord = {
        tenantId,
        tier,
        currentMonthSpendCents: 0,
        currentMonthAuditCount: 0,
        todayAuditCount: 0,
        lastResetDate: new Date().toISOString(),
        alertsTriggered: [],
      };
      this.tenantSpends.set(tenantId, newRecord);
      return newRecord;
    }
    
    // Check if we need to reset monthly/daily counters
    this.checkAndResetCounters(existing);
    return existing;
  }

  /**
   * Add spend to tenant record
   */
  addSpend(tenantId: string, amountCents: number, tier?: TenantTier): TenantSpendRecord {
    const record = this.getOrCreateRecord(tenantId, tier);
    record.currentMonthSpendCents += amountCents;
    
    // Check budget limits
    const budget = TIER_BUDGETS[record.tier];
    if (record.currentMonthSpendCents >= budget.monthlyBudgetCents) {
      record.alertsTriggered.push('MONTHLY_BUDGET_EXCEEDED');
      logger.warn(
        { tenantId, spend: record.currentMonthSpendCents, budget: budget.monthlyBudgetCents },
        'Tenant monthly budget exceeded'
      );
    }
    
    return record;
  }

  /**
   * Increment audit count for tenant
   */
  incrementAuditCount(tenantId: string): TenantSpendRecord {
    const record = this.getOrCreateRecord(tenantId);
    record.currentMonthAuditCount++;
    record.todayAuditCount++;
    
    const budget = TIER_BUDGETS[record.tier];
    if (record.todayAuditCount > budget.maxAuditsPerDay) {
      record.alertsTriggered.push('DAILY_AUDIT_LIMIT_EXCEEDED');
      logger.warn(
        { tenantId, todayCount: record.todayAuditCount, limit: budget.maxAuditsPerDay },
        'Tenant daily audit limit exceeded'
      );
    }
    
    return record;
  }

  /**
   * Get tenant spend record
   */
  getRecord(tenantId: string): TenantSpendRecord | null {
    const record = this.tenantSpends.get(tenantId);
    if (record) {
      this.checkAndResetCounters(record);
    }
    return record || null;
  }

  /**
   * Get all tenant spend records
   */
  getAllRecords(): Map<string, TenantSpendRecord> {
    return new Map(this.tenantSpends);
  }

  /**
   * Get global spend summary
   */
  getGlobalSummary(): {
    totalTenants: number;
    totalMonthlySpendCents: number;
    totalAuditsToday: number;
    totalAuditsThisMonth: number;
  } {
    let totalMonthlySpendCents = 0;
    let totalAuditsToday = 0;
    let totalAuditsThisMonth = 0;

    for (const record of this.tenantSpends.values()) {
      totalMonthlySpendCents += record.currentMonthSpendCents;
      totalAuditsToday += record.todayAuditCount;
      totalAuditsThisMonth += record.currentMonthAuditCount;
    }

    return {
      totalTenants: this.tenantSpends.size,
      totalMonthlySpendCents,
      totalAuditsToday,
      totalAuditsThisMonth,
    };
  }

  /**
   * Check and reset counters if needed (monthly/daily)
   */
  private checkAndResetCounters(record: TenantSpendRecord): void {
    const now = new Date();
    const lastReset = new Date(record.lastResetDate);

    // Reset monthly counters if new month
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      record.currentMonthSpendCents = 0;
      record.currentMonthAuditCount = 0;
      record.alertsTriggered = []; // Clear alerts on new month
      record.lastResetDate = now.toISOString();
      logger.info({ tenantId: record.tenantId }, 'Reset monthly counters for tenant');
    }

    // Reset daily counters if new day
    const today = now.toDateString();
    const lastDay = lastReset.toDateString();
    if (today !== lastDay) {
      record.todayAuditCount = 0;
      logger.debug({ tenantId: record.tenantId }, 'Reset daily counters for tenant');
    }
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.tenantSpends.clear();
  }
}

// Export singleton
export const globalSpendTracker = GlobalSpendTracker.getInstance();

export class CostTracker {
  private totalCents: number = 0;
  private usage: Record<string, number> = {};
  /** Hard cap in cents (default 200 = $2.00). Throw CostCapExceededError when exceeded. */
  private capCents: number;
  /** Soft alert threshold (default 80% of cap). Log warning when exceeded. */
  private alertThresholdCents: number;
  private auditId?: string;
  private tenantId?: string;
  private tenantTier?: TenantTier;
  private alertTriggered: boolean = false;
  private trackedGeminiSpend: Record<string, number> = {}; // Per-model spend tracking

  constructor(options?: { 
    capCents?: number; 
    auditId?: string; 
    tenantId?: string;
    tenantTier?: TenantTier;
    alertThresholdPercent?: number 
  }) {
    // Use tier-based cap if tenant tier provided
    const tierCap = options?.tenantTier ? TIER_BUDGETS[options.tenantTier].perAuditCapCents : undefined;
    this.capCents = tierCap ?? options?.capCents ?? 200; // Default $2.00
    this.auditId = options?.auditId;
    this.tenantId = options?.tenantId;
    this.tenantTier = options?.tenantTier ?? 'STARTER';
    
    // Default alert threshold at 80% of cap
    const alertPercent = options?.alertThresholdPercent ?? 80;
    this.alertThresholdCents = (this.capCents * alertPercent) / 100;
  }

  /**
   * Add cost for standard API calls
   */
  addApiCall(api: ApiType, count: number = 1) {
    let costPerCall = 0;
    switch (api) {
      case 'PAGESPEED':
        costPerCall = COSTS.PAGESPEED_COST_CENTS;
        break;
      case 'PLACES_TEXT_SEARCH':
        costPerCall = COSTS.PLACES_TEXT_SEARCH_CENTS;
        break;
      case 'PLACES_DETAILS':
        costPerCall = COSTS.PLACES_DETAILS_CENTS;
        break;
      case 'SERP_API':
      case 'SERP':
        costPerCall = COSTS.SERP_API_CENTS;
        break;
    }

    const cost = costPerCall * count;
    this.totalCents += cost;
    this.usage[api] = (this.usage[api] || 0) + count;

    // Track against tenant budget
    if (this.tenantId) {
      globalSpendTracker.addSpend(this.tenantId, cost, this.tenantTier);
    }

    // P2-2: Hard-cap check
    if (this.totalCents > this.capCents) {
      logger.error(
        {
          totalCents: this.totalCents,
          capCents: this.capCents,
          auditId: this.auditId,
          tenantId: this.tenantId,
          usage: this.usage,
        },
        'HARD CAP EXCEEDED (API call) — halting audit execution'
      );
      throw new CostCapExceededError(this.totalCents, this.capCents, this.auditId);
    }
  }

  /**
   * Add cost for LLM usage with per-model tracking
   */
  addLlmCall(
    model: LlmModel,
    inputTokens: number,
    outputTokens: number = 0,
    thoughtsTokenCount: number = 0
  ) {
    let inputCostPer1k = 0;
    let outputCostPer1k = 0;

    switch (model) {
      case 'GEMINI_FLASH':
        inputCostPer1k = COSTS.GEMINI_FLASH_PER_1K_INPUT_CENTS;
        outputCostPer1k = COSTS.GEMINI_FLASH_PER_1K_OUTPUT_CENTS;
        break;
      case 'GEMINI_PRO':
        inputCostPer1k = COSTS.GEMINI_PRO_PER_1K_INPUT_CENTS;
        outputCostPer1k = COSTS.GEMINI_PRO_PER_1K_OUTPUT_CENTS;
        break;
      case 'GEMINI_31_PRO':
        inputCostPer1k = COSTS.GEMINI_31_PRO_PER_1K_INPUT_CENTS;
        outputCostPer1k = COSTS.GEMINI_31_PRO_PER_1K_OUTPUT_CENTS;
        break;
    }

    const inputCost = (inputTokens / 1000) * inputCostPer1k;
    const outputCost = (outputTokens / 1000) * outputCostPer1k;
    const cost = inputCost + outputCost;

    this.totalCents += cost;

    // P1: Track Gemini spend per model for tenant reporting
    const modelKey = `LLM_${model}`;
    this.trackedGeminiSpend[modelKey] = (this.trackedGeminiSpend[modelKey] || 0) + cost;

    this.usage[modelKey] = (this.usage[modelKey] || 0) + 1;
    this.usage[`${modelKey}_INPUT_TOKENS`] = (this.usage[`${modelKey}_INPUT_TOKENS`] || 0) + inputTokens;
    this.usage[`${modelKey}_OUTPUT_TOKENS`] = (this.usage[`${modelKey}_OUTPUT_TOKENS`] || 0) + outputTokens;
    if (thoughtsTokenCount > 0) {
      this.usage[`${modelKey}_THOUGHTS_TOKENS`] =
        (this.usage[`${modelKey}_THOUGHTS_TOKENS`] || 0) + thoughtsTokenCount;
    }

    // Track against tenant budget
    if (this.tenantId) {
      globalSpendTracker.addSpend(this.tenantId, cost, this.tenantTier);
    }

    // Check soft alert threshold (only trigger once)
    if (!this.alertTriggered && this.totalCents >= this.alertThresholdCents) {
      this.alertTriggered = true;
      logger.warn(
        {
          totalCents: this.totalCents,
          alertThresholdCents: this.alertThresholdCents,
          capCents: this.capCents,
          auditId: this.auditId,
          tenantId: this.tenantId,
          usage: this.usage,
        },
        'SOFT COST ALERT: Approaching budget cap (80% threshold)'
      );
    }

    if (this.totalCents > this.capCents) {
      logger.error(
        {
          totalCents: this.totalCents,
          capCents: this.capCents,
          auditId: this.auditId,
          tenantId: this.tenantId,
          usage: this.usage,
        },
        'HARD CAP EXCEEDED (LLM call) — halting audit execution'
      );
      throw new CostCapExceededError(this.totalCents, this.capCents, this.auditId);
    }
  }

  /**
   * Get total accumulated cost in cents (rounded to nearest integer)
   */
  getTotalCents(): number {
    return Math.ceil(this.totalCents);
  }

  /**
   * Get detailed usage report with Gemini spend breakdown
   */
  getReport() {
    return {
      totalCents: this.getTotalCents(),
      usage: this.usage,
      geminiSpendByModel: { ...this.trackedGeminiSpend },
      tenantId: this.tenantId,
      tenantTier: this.tenantTier,
    };
  }

  /**
   * Get tenant spend summary
   */
  getTenantSpendSummary(): {
    tenantId: string | undefined;
    tier: TenantTier | undefined;
    monthlySpendCents: number;
    monthlyBudgetCents: number;
    budgetRemainingCents: number;
    budgetUsedPercent: number;
    auditsToday: number;
    auditsThisMonth: number;
    maxAuditsPerDay: number;
  } | null {
    if (!this.tenantId) return null;
    
    const record = globalSpendTracker.getRecord(this.tenantId);
    if (!record) return null;
    
    const budget = TIER_BUDGETS[record.tier];
    const budgetUsedPercent = (record.currentMonthSpendCents / budget.monthlyBudgetCents) * 100;
    
    return {
      tenantId: this.tenantId,
      tier: record.tier,
      monthlySpendCents: record.currentMonthSpendCents,
      monthlyBudgetCents: budget.monthlyBudgetCents,
      budgetRemainingCents: budget.monthlyBudgetCents - record.currentMonthSpendCents,
      budgetUsedPercent: Math.round(budgetUsedPercent * 100) / 100,
      auditsToday: record.todayAuditCount,
      auditsThisMonth: record.currentMonthAuditCount,
      maxAuditsPerDay: budget.maxAuditsPerDay,
    };
  }
}

/**
 * Get tier budget configuration
 */
export function getTierBudget(tier: TenantTier): typeof TIER_BUDGETS[TenantTier] {
  return TIER_BUDGETS[tier];
}

/**
 * Check if tenant has exceeded daily audit limit
 */
export function checkDailyAuditLimit(tenantId: string): {
  allowed: boolean;
  todayCount: number;
  limit: number;
  remaining: number;
} {
  const record = globalSpendTracker.getRecord(tenantId);
  if (!record) {
    return { allowed: true, todayCount: 0, limit: TIER_BUDGETS.STARTER.maxAuditsPerDay, remaining: TIER_BUDGETS.STARTER.maxAuditsPerDay };
  }
  
  const budget = TIER_BUDGETS[record.tier];
  const remaining = Math.max(0, budget.maxAuditsPerDay - record.todayAuditCount);
  
  return {
    allowed: record.todayAuditCount < budget.maxAuditsPerDay,
    todayCount: record.todayAuditCount,
    limit: budget.maxAuditsPerDay,
    remaining,
  };
}

/**
 * Get global spend summary for admin dashboard
 */
export function getGlobalSpendSummary() {
  return globalSpendTracker.getGlobalSummary();
}