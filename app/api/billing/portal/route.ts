import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { stripe } from '@/lib/billing/stripe';

export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prisma = createScopedPrisma(tenantId);
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant || !tenant.stripeCustomerId) {
            return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: tenant.stripeCustomerId,
            return_url: `${process.env.NEXTAUTH_URL}/settings/billing`,
        });

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Portal Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
