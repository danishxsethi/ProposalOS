import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { stripe } from '@/lib/stripe/stripe';
import { createScopedPrisma, getTenantId } from '@/lib/tenant/context';

export const POST = withAuth(async () => {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scopedPrisma = createScopedPrisma(tenantId);
    const tenant = await scopedPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.stripeCustomerId) {
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
