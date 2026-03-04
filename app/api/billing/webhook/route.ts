import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
import { prisma } from '@/lib/prisma'; // Use global prisma (webhooks are system-level)
import { ProposalStatus, ProjectStatus } from '@prisma/client';
import Stripe from 'stripe';

export async function POST(req: Request) {
    const body = await req.text();
    const headerList = await headers();
    const signature = headerList.get('Stripe-Signature') as string;

    let event: Stripe.Event;

    try {
        // P0-3 Fix: explicit guard prevents crash when env var is absent
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('CRITICAL: STRIPE_WEBHOOK_SECRET environment variable is not configured');
            return NextResponse.json(
                { error: 'Webhook processing is not configured' },
                { status: 500 }
            );
        }

        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error: any) {
        return NextResponse.json({ error: `Webhook Error: ${error.message}` }, { status: 400 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const subscription = event.data.object as Stripe.Subscription;

    // Handle events
    switch (event.type) {
        case 'checkout.session.completed':
            // 1. Get tenantId from client_reference_id or metadata
            const tenantId = session.client_reference_id || session.metadata?.tenantId;
            const subscriptionId = session.subscription as string;
            const customerId = session.customer as string;

            // Sprint 9: Proposal Checkout vs SaaS Subscription
            if (session.metadata?.proposalId) {
                // This is a client paying for a Proposal
                const { proposalId, tierId } = session.metadata;

                // Update Proposal to PAID
                const proposal = await prisma.proposal.update({
                    where: { id: proposalId },
                    data: { status: ProposalStatus.PAID, tierChosen: tierId }
                });

                // Kick off Delivery Project
                await (prisma as any).project.create({
                    data: {
                        proposalId,
                        tenantId: proposal.tenantId || '',
                        status: ProjectStatus.KICKOFF
                    }
                });

                // Trigger Delivery Graph (async, non-blocking)
                try {
                    const deliveryGraph = await import('@/lib/graph/delivery-graph');
                    const runFn = (deliveryGraph as any).runDeliveryAgent;
                    if (typeof runFn === 'function') {
                        await runFn(proposalId, proposal.tenantId || '');
                    }
                } catch (e) {
                    console.error('Failed to trigger delivery graph on checkout', e);
                }
            } else if (tenantId) {
                // This is an Agency upgrading their SaaS Tenant Subscription
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscriptionId,
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
