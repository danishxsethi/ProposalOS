import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { assertBillingNotFrozen, getSaasPlanById, stripe } from '@/lib/stripe/stripe';
import { getTenantId } from '@/lib/tenant/context';

export const POST = withAuth(async (req: Request) => {
  try {
    assertBillingNotFrozen();

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId } = await req.json();
    const plan = getSaasPlanById(planId);
    if (!plan?.priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer: tenant.stripeCustomerId ?? undefined,
      customer_email: tenant.users[0]?.email ?? undefined,
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        planId: plan.id,
        checkoutType: 'saas',
      },
      allow_promotion_codes: true,
      payment_method_collection: 'if_required',
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          tenantId,
          planId: plan.id,
        },
      },
      success_url: `${process.env.NEXTAUTH_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?checkout=cancel`,
    });

    await prisma.checkoutAttempt.create({
      data: {
        stripeSessionId: session.id,
        tenantId,
        type: 'saas',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe SaaS Checkout Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
