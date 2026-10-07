import Stripe from 'stripe';

import { PlanCatalogService } from './PlanCatalogService';

const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value === '' || value.includes('placeholder') || value.includes('xxxxx')) {
    throw new Error(
      `[FATAL] ${name} is missing or placeholder. Billing is non-functional. Set a real value in environment variables.`
    );
  }
  return value;
}

export const stripeSecretKey = () => {
  validateStripeEnvironment();
  return requireEnv('STRIPE_SECRET_KEY');
};

export const stripeWebhookSecret = () => {
  validateStripeEnvironment();
  return requireEnv('STRIPE_WEBHOOK_SECRET');
};

let stripeInstance: Stripe | null = null;

export function isBillingMutationFrozen(): boolean {
  return process.env.KILL_SWITCH_FORCE_MANUAL_MODE === 'true';
}

export function assertBillingNotFrozen() {
  if (isBillingMutationFrozen()) {
    throw new Error(
      `[BILLING FROZEN] All billing mutations are frozen due to active KILL_SWITCH_FORCE_MANUAL_MODE.`
    );
  }
}

function validateStripeEnvironment() {
  if (isBuildTime) return;

  const liveMode = process.env.BILLING_LIVE_MODE === 'true';
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  const hasLiveSecret = secretKey.startsWith('sk_live_');
  const hasLivePublishable = publishableKey.startsWith('pk_live_');

  // Hard assertion for Live Mode
  if (liveMode) {
    if (!hasLiveSecret || !hasLivePublishable) {
      throw new Error(
        `[FATAL STARTUP CHECK] BILLING_LIVE_MODE is active but live keys are missing or invalid (secret starts with '${secretKey.substring(0, 8)}', publishable starts with '${publishableKey.substring(0, 8)}'). Boot blocked to protect payment integrity.`
      );
    }
    if (!webhookSecret || webhookSecret.includes('placeholder')) {
      throw new Error(
        `[FATAL STARTUP CHECK] BILLING_LIVE_MODE is active but STRIPE_WEBHOOK_SECRET is missing or invalid.`
      );
    }
  } else {
    // If liveMode is false, verify no live keys are loaded in non-production
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && (hasLiveSecret || hasLivePublishable)) {
      throw new Error(
        `[FATAL SECURITY CHECK] Live Stripe keys detected in a non-production environment (${process.env.NODE_ENV || 'development'}) when BILLING_LIVE_MODE is OFF. Boot blocked to prevent accidental live charges.`
      );
    }
  }
}

// Call validate immediately on import if not at build time
if (!isBuildTime) {
  validateStripeEnvironment();
}

function getStripeInstance() {
  if (isBuildTime) {
    return new Stripe('sk_test_build_placeholder', {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }

  validateStripeEnvironment();

  if (!stripeInstance) {
    stripeInstance = new Stripe(stripeSecretKey(), {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return stripeInstance;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeInstance(), prop, receiver);
  },
});

export type SaaSPlanId = 'starter' | 'pro' | 'agency';
export type ProposalPlanId = 'essentials' | 'growth' | 'premium';

export const SAAS_PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    description: 'For solo consultants',
    priceId: process.env.STRIPE_PRICE_ID_STARTER ?? 'price_starter_test_id',
    price: 99,
    limits: {
      audits: 25,
      seats: 1,
      branding: 'basic',
      batchMode: false,
    },
  },
  {
    id: 'pro' as const,
    name: 'Professional',
    description: 'For growing agencies',
    priceId: process.env.STRIPE_PRICE_ID_PRO ?? 'price_growth_test_id',
    price: 299,
    limits: {
      audits: 100,
      seats: 3,
      branding: 'full',
      batchMode: true,
    },
  },
  {
    id: 'agency' as const,
    name: 'Agency Scale',
    description: 'For large teams',
    priceId: process.env.STRIPE_PRICE_ID_AGENCY ?? 'price_scale_test_id',
    price: 599,
    limits: {
      audits: 1000,
      seats: 10,
      branding: 'whitelabel',
      batchMode: true,
      apiAccess: true,
    },
  },
];

export const PROPOSAL_PRICE_IDS: Record<ProposalPlanId, string> = {
  essentials: process.env.STRIPE_PRICE_ID_PROPOSAL_ESSENTIALS ?? '',
  growth: process.env.STRIPE_PRICE_ID_PROPOSAL_GROWTH ?? '',
  premium: process.env.STRIPE_PRICE_ID_PROPOSAL_PREMIUM ?? '',
};

export function getSaasPlanById(planId: string) {
  const catalogPlan = PlanCatalogService.getPlanById(planId);
  if (!catalogPlan) return undefined;

  return {
    id:
      catalogPlan.id === 'growth' ? 'pro' : catalogPlan.id === 'scale' ? 'agency' : catalogPlan.id,
    name: catalogPlan.name,
    description:
      catalogPlan.id === 'starter'
        ? 'For solo consultants'
        : catalogPlan.id === 'growth'
          ? 'For growing agencies'
          : 'For large teams',
    priceId:
      process.env.BILLING_LIVE_MODE === 'true'
        ? catalogPlan.stripePriceIdLive
        : catalogPlan.stripePriceIdTest,
    price: catalogPlan.priceMonthly,
    limits: catalogPlan.limits,
  };
}

export function getPlanById(tier: string) {
  if (tier === 'free' || tier === 'trial') {
    return {
      id: tier,
      name: tier === 'trial' ? 'Pro Trial' : 'Free Tier',
      limits: {
        audits: tier === 'trial' ? 100 : 3,
        seats: 1,
        branding: tier === 'trial' ? ('full' as const) : ('none' as const),
        batchMode: tier === 'trial',
      },
    };
  }

  return getSaasPlanById(tier) ?? SAAS_PLANS[0];
}

export function getPlanTierFromPriceId(priceId: string | null | undefined): string {
  if (!priceId) return 'free';
  const plan = PlanCatalogService.getPlanByPriceId(priceId);
  return plan ? plan.id : 'free';
}

export function getProposalPriceId(planId: ProposalPlanId): string {
  const priceId = PROPOSAL_PRICE_IDS[planId];
  if (!priceId) {
    throw new Error(`[FATAL] Missing Stripe proposal price ID for ${planId}.`);
  }
  return priceId;
}
