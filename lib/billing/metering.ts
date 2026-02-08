import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    : null;

export type BillableEvent = 'audit.created' | 'batch.item';

const EVENT_COSTS: Record<BillableEvent, number> = {
    'audit.created': 1,
    'batch.item': 1
};

export async function trackUsage(tenantId: string, event: BillableEvent, quantity: number = 1) {
    try {
        const credits = (EVENT_COSTS[event] || 1) * quantity;

        // 1. Record in DB
        const record = await prisma.usageRecord.create({
            data: {
                tenantId,
                event,
                credits,
                timestamp: new Date()
            }
        });

        // 2. Report to Stripe (Fire and forget, or queue)
        // We need the tenant's stripeSubscriptionItemId for the "Usage" price
        // For MVP, we'll assume we fetch it or it's stored on Tenant
        // Since we didn't add that field yet, we'll skip the actual Stripe API call
        // but this is where it would go.

        /*
        if (stripe && tenant.stripeSubscriptionItemId) {
            await stripe.subscriptionItems.createUsageRecord(
                tenant.stripeSubscriptionItemId,
                {
                    quantity: credits,
                    timestamp: Math.floor(Date.now() / 1000),
                    action: 'increment',
                }
            );
        }
        */

        console.log(`[Metering] Recorded ${credits} credits for ${tenantId} (${event})`);
        return record;

    } catch (error) {
        console.error('[Metering] Failed to track usage', error);
        // Don't block the user flow if metering fails, but log heavily
    }
}

export async function getUsageStats(tenantId: string) {
    const startOfBillingPeriod = new Date();
    startOfBillingPeriod.setDate(1); // Simplification: assume 1st of month

    const usage = await prisma.usageRecord.aggregate({
        where: {
            tenantId,
            timestamp: { gte: startOfBillingPeriod }
        },
        _sum: {
            credits: true
        }
    });

    return usage._sum.credits || 0;
}

export async function checkLimit(tenantId: string, planTier: string): Promise<{ allowed: boolean, usage: number, limit: number }> {
    const usage = await getUsageStats(tenantId);

    let limit = 10; // Default Free
    if (planTier === 'starter') limit = 25;
    if (planTier === 'pro') limit = 100;
    if (planTier === 'agency') limit = 999999; // Unlimited

    // If we allow overage, we always return allowed=true, but we might flag it
    // The prompt says "Hybrid pricing... PLUS overage charges". So we don't block.
    // Except maybe Free tier? 

    if (planTier === 'free' && usage >= limit) {
        return { allowed: false, usage, limit };
    }

    return { allowed: true, usage, limit };
}
