/**
 * FIX-01: Stripe Payment Links for end-clients.
 * Creates a Stripe checkout session for a specific proposal tier.
 *
 * POST /api/proposal/[id]/checkout
 * Body: { tier: 'essentials' | 'growth' | 'premium', clientEmail?: string, clientName?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface CheckoutBody {
    tier: 'essentials' | 'growth' | 'premium';
    clientEmail?: string;
    clientName?: string;
}

const TIER_LABELS: Record<string, string> = {
    essentials: 'Essentials Package',
    growth: 'Growth Package',
    premium: 'Premium Package',
};

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    const proposalId = params.id;

    let body: CheckoutBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { tier, clientEmail, clientName } = body;

    if (!tier || !['essentials', 'growth', 'premium'].includes(tier)) {
        return NextResponse.json(
            { error: 'tier must be one of: essentials, growth, premium' },
            { status: 400 }
        );
    }

    // Load the proposal
    const proposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: {
            id: true,
            tenantId: true,
            status: true,
            pricing: true,
            tierEssentials: true,
            tierGrowth: true,
            tierPremium: true,
            auditId: true,
        },
    });

    if (!proposal) {
        return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.status === 'ACCEPTED') {
        return NextResponse.json({ error: 'This proposal has already been accepted' }, { status: 409 });
    }

    // Extract price from proposal pricing JSON
    const pricing = proposal.pricing as any;
    let priceAmountCents: number | undefined;

    if (tier === 'essentials' && pricing?.essentials?.total) {
        priceAmountCents = Math.round(parseFloat(pricing.essentials.total) * 100);
    } else if (tier === 'growth' && pricing?.growth?.total) {
        priceAmountCents = Math.round(parseFloat(pricing.growth.total) * 100);
    } else if (tier === 'premium' && pricing?.premium?.total) {
        priceAmountCents = Math.round(parseFloat(pricing.premium.total) * 100);
    }

    if (!priceAmountCents || priceAmountCents <= 0) {
        return NextResponse.json(
            { error: `No pricing found for tier: ${tier}` },
            { status: 422 }
        );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: priceAmountCents,
                        product_data: {
                            name: TIER_LABELS[tier],
                            description: `ProposalOS — ${TIER_LABELS[tier]} for audit ${proposal.auditId}`,
                        },
                    },
                },
            ],
            customer_email: clientEmail,
            metadata: {
                proposalId,
                tier,
                tenantId: proposal.tenantId ?? '',
                clientName: clientName ?? '',
            },
            success_url: `${appUrl}/proposal/${proposalId}/thank-you?tier=${tier}`,
            cancel_url: `${appUrl}/proposal/${proposalId}`,
        });

        // Persist the tier selection immediately so the webhook knows what was chosen
        await prisma.proposal.update({
            where: { id: proposalId },
            data: {
                tierChosen: tier,
                prospectEmail: clientEmail ?? undefined,
            },
        });

        logger.info({ proposalId, tier, priceAmountCents, sessionId: session.id }, 'Checkout session created');

        return NextResponse.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
        logger.error({ proposalId, tier, err: err?.message }, 'Failed to create Stripe checkout session');
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }
}
