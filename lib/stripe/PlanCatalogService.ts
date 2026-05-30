export interface PlanLimits {
  audits: number;
  seats: number;
  branding: 'basic' | 'full' | 'whitelabel';
  batchMode: boolean;
  apiAccess: boolean;
}

export interface PlanDefinition {
  id: string;
  name: string;
  priceMonthly: number;
  limits: PlanLimits;
  stripePriceIdTest: string;
  stripePriceIdLive: string;
  stripeProductIdTest: string;
  stripeProductIdLive: string;
}

export const PLAN_CATALOG: Record<string, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 99,
    limits: {
      audits: 25,
      seats: 1,
      branding: 'basic',
      batchMode: false,
      apiAccess: false,
    },
    stripePriceIdTest: process.env.STRIPE_PRICE_ID_STARTER || 'price_starter_test_id',
    stripePriceIdLive: process.env.STRIPE_PRICE_ID_STARTER_LIVE || 'price_starter_live_id',
    stripeProductIdTest: process.env.STRIPE_PRODUCT_ID_STARTER || 'prod_starter_test_id',
    stripeProductIdLive: process.env.STRIPE_PRODUCT_ID_STARTER_LIVE || 'prod_starter_live_id',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 299,
    limits: {
      audits: 100,
      seats: 3,
      branding: 'full',
      batchMode: true,
      apiAccess: false,
    },
    stripePriceIdTest: process.env.STRIPE_PRICE_ID_PRO || 'price_growth_test_id',
    stripePriceIdLive: process.env.STRIPE_PRICE_ID_PRO_LIVE || 'price_growth_live_id',
    stripeProductIdTest: process.env.STRIPE_PRODUCT_ID_PRO || 'prod_growth_test_id',
    stripeProductIdLive: process.env.STRIPE_PRODUCT_ID_PRO_LIVE || 'prod_growth_live_id',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    priceMonthly: 599,
    limits: {
      audits: 1000,
      seats: 10,
      branding: 'whitelabel',
      batchMode: true,
      apiAccess: true,
    },
    stripePriceIdTest: process.env.STRIPE_PRICE_ID_AGENCY || 'price_scale_test_id',
    stripePriceIdLive: process.env.STRIPE_PRICE_ID_AGENCY_LIVE || 'price_scale_live_id',
    stripeProductIdTest: process.env.STRIPE_PRODUCT_ID_AGENCY || 'prod_scale_test_id',
    stripeProductIdLive: process.env.STRIPE_PRODUCT_ID_AGENCY_LIVE || 'prod_scale_live_id',
  },
};

// Aliases to maintain backward compatibility with existing data structures
const ALIAS_MAP: Record<string, string> = {
  pro: 'growth',
  agency: 'scale',
};

export class PlanCatalogService {
  static getPlanById(planId: string): PlanDefinition | null {
    const normalizedId = (planId || '').toLowerCase();
    const resolvedId = ALIAS_MAP[normalizedId] || normalizedId;
    return PLAN_CATALOG[resolvedId] || null;
  }

  static getPlanByPriceId(priceId: string): PlanDefinition | null {
    if (!priceId) return null;
    return (
      Object.values(PLAN_CATALOG).find(
        (plan) => plan.stripePriceIdTest === priceId || plan.stripePriceIdLive === priceId
      ) || null
    );
  }

  static getPlanTierFromPriceId(priceId: string | null | undefined): string {
    if (!priceId) return 'free';
    const plan = this.getPlanByPriceId(priceId);
    return plan ? plan.id : 'free';
  }

  static getFeaturesForTier(tier: string) {
    const plan = this.getPlanById(tier);
    if (plan) return plan.limits;

    // Default Fallback
    return {
      audits: 3,
      seats: 1,
      branding: 'basic' as const,
      batchMode: false,
      apiAccess: false,
    };
  }
}
