import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
import { prisma } from '@/lib/prisma'; // Use global prisma (webhooks are system-level)
import Stripe from 'stripe';

export async function POST(req: Request) {
    const body = await req.text();
    const signature = headers().get('Stripe-Signature') as string;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (error: any) {
        return NextResponse.json({ error: `Webhook Error: ${error.message}` }, { status: 400 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const subscription = event.data.object as Stripe.Subscription;

    // Handle events
    switch (event.type) {
        case 'checkout.session.completed':
            // 1. Get tenantId from client_reference_id or metadata
            const tenantId = session.client_reference_id;
            const subscriptionId = session.subscription as string;
            const customerId = session.customer as string;

            if (tenantId) {
                // Update Tenant
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscriptionId,
                        // We rely on 'customer.subscription.updated' to set planTier usually,
                        // but good to set active status here.
                        status: 'active',
                    },
                });
            }
            break;

        case 'customer.subscription.updated':
            // map priceId to Plan Tier
            const priceId = subscription.items.data[0].price.id;
            const status = subscription.status;

            // Simplistic Plan Mapping (Reverse lookup or switch)
            let planTier = 'free';
            if (priceId === process.env.STRIPE_PRICE_ID_STARTER) planTier = 'starter';
            if (priceId === process.env.STRIPE_PRICE_ID_PRO) planTier = 'pro';
            if (priceId === process.env.STRIPE_PRICE_ID_AGENCY) planTier = 'agency';

            // Find Tenant by stripeCustomerId
            await prisma.tenant.updateMany({
                where: { stripeCustomerId: subscription.customer as string },
                data: {
                    planTier: status === 'active' ? planTier : 'free',
                    status: status === 'active' ? 'active' : 'suspended',
                }
            });
            break;

        case 'customer.subscription.deleted':
            await prisma.tenant.updateMany({
                where: { stripeCustomerId: subscription.customer as string },
                data: {
                    planTier: 'free',
                    status: 'suspended',
                    stripeSubscriptionId: null,
                }
            });
            break;
    }

    return NextResponse.json({ received: true });
}
