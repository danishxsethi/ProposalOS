import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { handlePaymentSuccess } from '@/lib/pipeline/dealCloser';
import { alerts } from '@/lib/alerts/webhook';
import Stripe from 'stripe';

export async function POST(req: Request) {
    const body = await req.text();
    const headerList = await headers();
    const signature = headerList.get('Stripe-Signature') as string;

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

    switch (event.type) {
        case 'checkout.session.completed': {
            const proposalId = session.metadata?.proposalId;
            const tier = session.metadata?.tier;
            const clientName = session.metadata?.clientName;
            const clientEmail =
                session.customer_details?.email ?? session.customer_email ?? undefined;
            const tenantId = session.metadata?.tenantId ?? session.client_reference_id;
            const customerId = session.customer as string;
            const subscriptionId = session.subscription as string;

            // === PATH A: Proposal payment (end-client purchasing a tier) ===
            if (proposalId) {
                logger.info({ proposalId, tier, tenantId }, 'Webhook: Proposal payment received — starting onboarding');

                try {
                    // Unified flow in dealCloser.ts handles CRM transition, onboarding email,
                    // physical tenant provisioning, and SLA clock tracking
                    await handlePaymentSuccess(session.client_reference_id as string, session.id);
                } catch (err: any) {
                    logger.error({ proposalId, err: err?.message }, 'Onboarding flow failed after payment');
                    await alerts.auditFailed(proposalId, tenantId ?? 'unknown', err?.message ?? 'onboarding error');
                }

                break; // DO NOT fall through to SaaS billing path
            }

            // === PATH B: Agency SaaS subscription (tenant signing up for a plan) ===
            if (tenantId && !proposalId) {
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscriptionId,
                        status: 'active',
                    },
                });
                logger.info({ tenantId }, 'Webhook: Tenant SaaS subscription activated');
            }

            break;
        }

        case 'customer.subscription.updated': {
            const priceId = subscription.items.data[0].price.id;
            const status = subscription.status;

            let planTier = 'free';
            if (priceId === process.env.STRIPE_PRICE_ID_STARTER) planTier = 'starter';
            if (priceId === process.env.STRIPE_PRICE_ID_PRO) planTier = 'pro';
            if (priceId === process.env.STRIPE_PRICE_ID_AGENCY) planTier = 'agency';

            await prisma.tenant.updateMany({
                where: { stripeCustomerId: subscription.customer as string },
                data: {
                    planTier: status === 'active' ? planTier : 'free',
                    status: status === 'active' ? 'active' : 'suspended',
                },
            });
            break;
        }

        case 'customer.subscription.deleted': {
            await prisma.tenant.updateMany({
                where: { stripeCustomerId: subscription.customer as string },
                data: {
                    planTier: 'free',
                    status: 'suspended',
                    stripeSubscriptionId: null,
                },
            });
            break;
        }
    }

    return NextResponse.json({ received: true });
}
