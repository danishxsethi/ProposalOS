import Stripe from 'stripe';

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

export const stripeSecretKey = () => requireEnv('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = () => requireEnv('STRIPE_WEBHOOK_SECRET');

let stripeInstance: Stripe | null = null;

function getStripeInstance() {
  if (isBuildTime) {
    return new Stripe('sk_test_build_placeholder', {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }

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
    priceId: process.env.STRIPE_PRICE_ID_STARTER ?? '',
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
    priceId: process.env.STRIPE_PRICE_ID_PRO ?? '',
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
    priceId: process.env.STRIPE_PRICE_ID_AGENCY ?? '',
    price: 599,
    limits: {
      audits: 9999,
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
  return SAAS_PLANS.find((plan) => plan.id === planId);
}

export function getPlanById(tier: string) {
  if (tier === 'free' || tier === 'trial') {
    return {
      id: tier,
      name: tier === 'trial' ? 'Pro Trial' : 'Free Tier',
      limits: {
        audits: tier === 'trial' ? 100 : 3,
        seats: 1,
        branding: tier === 'trial' ? 'full' : 'none',
        batchMode: tier === 'trial',
      },
    };
  }

  return getSaasPlanById(tier) ?? SAAS_PLANS[0];
}

export function getPlanTierFromPriceId(priceId: string | null | undefined): SaaSPlanId | 'free' {
  if (!priceId) return 'free';
  const plan = SAAS_PLANS.find((candidate) => candidate.priceId === priceId);
  return plan?.id ?? 'free';
}

export function getProposalPriceId(planId: ProposalPlanId): string {
  const priceId = PROPOSAL_PRICE_IDS[planId];
  if (!priceId) {
    throw new Error(`[FATAL] Missing Stripe proposal price ID for ${planId}.`);
  }
  return priceId;
}
