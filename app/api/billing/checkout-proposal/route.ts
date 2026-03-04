import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/billing/stripe';
import Stripe from 'stripe';

export async function POST(req: Request) {
    try {
        const { proposalId, tierId } = await req.json();

        if (!proposalId || !tierId) {
            return NextResponse.json({ error: 'Missing proposalId or tierId' }, { status: 400 });
        }

        // Fetch the proposal to get pricing and tenant
        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId }
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        // Parse pricing JSON
        const pricingConfig = proposal.pricing as Record<string, any>;
        const tierPriceAmount = pricingConfig[tierId];

        if (!tierPriceAmount) {
            return NextResponse.json({ error: "Invalid tier or pricing not found for this tier." }, { status: 400 });
        }

        // Determine Mode based on tier
        // Starter -> one-time setup
        // Growth/Premium -> monthly subscription
        const mode: Stripe.Checkout.SessionCreateParams.Mode = tierId === 'essentials' ? 'payment' : 'subscription';

        // Build the Stripe Line Item securely
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
            {
                price_data: {
                    currency: 'usd',
                    unit_amount: Math.round(tierPriceAmount * 100), // Stripe expects cents
                    product_data: {
                        name: `Proposal Engine - ${tierId.toUpperCase()} Tier`,
                        description: `Onboarding and services for ${proposal.tenantId ? 'Customer' : 'Customer'}`
                    },
                    ...(mode === 'subscription' && {
                        recurring: { interval: 'month' }
                    })
                },
                quantity: 1,
            },
        ];

        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${req.headers.get('host')}`;

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: mode,
            success_url: `${baseUrl}/proposal/${proposal.webLinkToken}?success=true`,
            cancel_url: `${baseUrl}/proposal/${proposal.webLinkToken}?canceled=true`,
            metadata: {
                proposalId,
                tierId,
                tenantId: proposal.tenantId || ''
            },
            customer_email: proposal.prospectEmail || undefined
        });

        return NextResponse.json({ url: session.url }, { status: 200 });
    } catch (error: any) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
