import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { stripe, PLANS } from '@/lib/billing/stripe';

export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { planId, interval = 'month' } = await req.json(); // planId: 'starter', 'pro', 'agency'

        const plan = PLANS.find((p) => p.id === planId);
        if (!plan || !plan.priceId) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        const prisma = createScopedPrisma(tenantId);
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { users: true } // get email of owner for receipt
        });

        if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

        // Find owner email (simplified: first user or auth user)
        // Ideally we pass current user email

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: plan.priceId,
                    quantity: 1,
                },
            ],
            customer_email: tenant.users[0]?.email, // Pre-fill email
            client_reference_id: tenantId,
            metadata: {
                tenantId,
                planId,
            },
            success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
            cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?checkout=cancel`,
            allow_promotion_codes: true,
            subscription_data: {
                metadata: {
                    tenantId
                }
            }
        });

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
