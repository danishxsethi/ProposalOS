import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
export const stripe = new Stripe(key, {
    apiVersion: '2026-01-28.clover' as const,
    typescript: true,
});

export const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        description: 'For solo consultants',
        priceId: process.env.STRIPE_PRICE_ID_STARTER, // Seed this or add to .env
        price: 99,
        limits: {
            audits: 25,
            seats: 1,
            branding: 'basic',
            batchMode: false,
        },
    },
    {
        id: 'pro',
        name: 'Professional',
        description: 'For growing agencies',
        priceId: process.env.STRIPE_PRICE_ID_PRO,
        price: 299,
        limits: {
            audits: 100,
            seats: 3,
            branding: 'full',
            batchMode: true,
        },
    },
    {
        id: 'agency',
        name: 'Agency Scale',
        description: 'For large teams',
        priceId: process.env.STRIPE_PRICE_ID_AGENCY,
        price: 599,
        limits: {
            audits: 9999, // unlimited
            seats: 10,
            branding: 'whitelabel',
            batchMode: true,
            apiAccess: true,
        },
    },
];

export function getPlanById(tier: string) {
    if (tier === 'free' || tier === 'trial') {
        // Fallback for trial/free
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
    return PLANS.find((p) => p.id === tier) || PLANS[0];
}
