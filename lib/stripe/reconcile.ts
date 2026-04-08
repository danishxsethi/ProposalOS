import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe/stripe';

export async function reconcileSubscriptions() {
  const tenants = await prisma.tenant.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { id: true, stripeCustomerId: true },
  });

  for (const tenant of tenants) {
    const customerId = tenant.stripeCustomerId;
    if (!customerId) continue;

    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
    for (const sub of subs.data) {
      const primaryItem = sub.items.data[0];
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: sub.id },
        create: {
          tenantId: tenant.id,
          stripeSubscriptionId: sub.id,
          stripePriceId: primaryItem?.price.id ?? '',
          status: sub.status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
        update: {
          stripePriceId: primaryItem?.price.id ?? '',
          status: sub.status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
    }

    const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 });
    for (const inv of invoices.data) {
      if (!inv.id) continue;
      await prisma.payment.upsert({
        where: { stripeInvoiceId: inv.id },
        create: {
          tenantId: tenant.id,
          stripeInvoiceId: inv.id,
          stripeChargeId: typeof inv.charge === 'string' ? inv.charge : null,
          amountCents: inv.amount_paid,
          currency: inv.currency,
          status: inv.status === 'paid' ? 'paid' : 'failed',
          paidAt: inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000)
            : null,
        },
        update: {
          stripeChargeId: typeof inv.charge === 'string' ? inv.charge : null,
          amountCents: inv.amount_paid,
          currency: inv.currency,
          status: inv.status === 'paid' ? 'paid' : 'failed',
          paidAt: inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000)
            : null,
        },
      });
    }
  }

  const abandoned = await prisma.checkoutAttempt.findMany({
    where: {
      completedAt: null,
      createdAt: {
        lt: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (abandoned.length > 0) {
    console.warn(
      `[BillingReconcile] Found ${abandoned.length} abandoned checkout attempts older than 1 hour`
    );
  }

  return {
    tenants: tenants.length,
    abandonedAttempts: abandoned.length,
  };
}
