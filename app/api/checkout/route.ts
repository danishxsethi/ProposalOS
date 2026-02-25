import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Lazy load stripe at runtime to avoid build-time env var evaluation
const getStripe = () => {
    const stripe = require('stripe');
    return stripe(process.env.STRIPE_SECRET_KEY);
};

export async function POST(req: Request) {
    try {
        const { proposalId, tierId, webLinkToken } = await req.json();

        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId },
            include: { audit: true }
        });

        if (!proposal || proposal.webLinkToken !== webLinkToken) {
            return NextResponse.json({ error: 'Invalid proposal' }, { status: 404 });
        }

        const tier = tierId === 'essentials' ? proposal.tierEssentials : 
                     tierId === 'growth' ? proposal.tierGrowth : 
                     proposal.tierPremium;
        
        const pricing = proposal.pricing as any;
        const amount = pricing[tierId];

        const session = await getStripe().checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${(tier as any).name || 'Service'} Plan - ${proposal.audit.businessName}`,
                            description: (tier as any).description,
                        },
                        unit_amount: amount * 100,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/proposal/${webLinkToken}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/proposal/${webLinkToken}`,
            metadata: {
                proposalId,
                tierId,
                tenantId: proposal.tenantId,
            },
        });

        return NextResponse.json({ sessionId: session.id });
    } catch (error: any) {
        console.error('Stripe session error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
