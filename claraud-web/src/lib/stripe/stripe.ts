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

let stripeClientInstance: Stripe | null = null;

function getStripeClient() {
  if (isBuildTime) {
    return new Stripe('sk_test_build_placeholder', {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });
  }

  if (!stripeClientInstance) {
    stripeClientInstance = new Stripe(stripeSecretKey(), {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });
  }

  return stripeClientInstance;
}

export const stripeClient = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeClient(), prop, receiver);
  },
});
