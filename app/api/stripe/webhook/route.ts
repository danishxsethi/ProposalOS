/**
 * POST /api/stripe/webhook
 * Stripe webhook handler for payment events.
 *
 * Features:
 * - Idempotency via processedWebhookEvent tracking (prevents duplicate processing)
 * - Standardized error responses
 * - Failed webhook tracking for retry
 * - Transaction-based updates
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { ProjectStatus, ProposalStatus } from '@prisma/client';
import Stripe from 'stripe';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { prisma } from '@/lib/prisma';
import { getPlanTierFromPriceId, stripe, stripeWebhookSecret } from '@/lib/stripe/stripe';

async function markProcessed(event: Stripe.Event, tx: any) {
  await tx.processedWebhookEvent.create({
    data: { id: event.id, type: event.type },
  });
}

async function markFailedWebhook(event: Stripe.Event, error: Error, tx: any) {
  await tx.failedWebhookEvent.create({
    data: {
      eventId: event.id,
      eventType: event.type,
      payload: event,
      errorMessage: error.message,
      errorStack: error.stack,
      attempts: 1,
      lastAttempt: new Date(),
    },
  });
}

function subscriptionState(status: string): { tenantStatus: string; accessStatus: string } {
  if (status === 'trialing') return { tenantStatus: 'trial', accessStatus: 'trialing' };
  if (status === 'active') return { tenantStatus: 'active', accessStatus: 'active' };
  if (status === 'past_due') return { tenantStatus: 'active', accessStatus: 'past_due' };
  if (status === 'canceled') return { tenantStatus: 'suspended', accessStatus: 'canceled' };
  if (status === 'unpaid') return { tenantStatus: 'suspended', accessStatus: 'unpaid' };
  return { tenantStatus: 'suspended', accessStatus: status };
}

export async function POST(req: Request) {
  const traceId = generateTraceId();
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get('Stripe-Signature');

  if (!signature) {
    return NextResponse.json(
      {
        error: {
          code: 'MISSING_HEADER',
          message: 'Missing Stripe signature',
          timestamp: new Date().toISOString(),
          traceId,
        },
      },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret());
  } catch (error: any) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Webhook Error: ${error.message}`,
          timestamp: new Date().toISOString(),
          traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    // Idempotency: Check if event was already processed
    const existing = await prisma.processedWebhookEvent.findUnique({ where: { id: event.id } });
    if (existing) {
      return NextResponse.json({
        received: true,
        deduplicated: true,
        eventId: event.id,
      });
    }

    let triggerDelivery: { proposalId: string; tenantId: string } | null = null;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        await prisma.$transaction(async (tx) => {
          await markProcessed(event, tx);

          await tx.checkoutAttempt.updateMany({
            where: { stripeSessionId: session.id },
            data: { completedAt: new Date() },
          });

          if (session.metadata?.proposalId) {
            const proposalId = session.metadata.proposalId;
            const tierId = session.metadata.tierId;
            const proposal = await tx.proposal.update({
              where: { id: proposalId },
              data: { status: ProposalStatus.PAID, tierChosen: tierId },
            });

            await tx.project.upsert({
              where: { proposalId },
              create: {
                proposalId,
                tenantId: proposal.tenantId,
                status: ProjectStatus.KICKOFF,
              },
              update: {
                status: ProjectStatus.KICKOFF,
              },
            });

            triggerDelivery = { proposalId, tenantId: proposal.tenantId };
            return;
          }

          const tenantId = session.client_reference_id || session.metadata?.tenantId;
          const subscriptionId =
            typeof session.subscription === 'string' ? session.subscription : null;
          const customerId = typeof session.customer === 'string' ? session.customer : null;
          if (!tenantId || !subscriptionId) return;

          const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
          const priceId = subscription.items.data[0]?.price.id ?? '';
          const itemId = subscription.items.data[0]?.id ?? null;
          const mappedPlanTier = getPlanTierFromPriceId(priceId);
          const { tenantStatus, accessStatus } = subscriptionState(subscription.status);

          await tx.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              tenantId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              status: accessStatus,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              stripePriceId: priceId,
              status: accessStatus,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });

          await tx.tenant.update({
            where: { id: tenantId },
            data: {
              planTier: mappedPlanTier === 'free' ? 'free' : mappedPlanTier,
              status: tenantStatus,
              subscriptionStatus: accessStatus,
              stripeSubscriptionId: subscription.id,
              stripeSubscriptionItemId: itemId,
              stripeCustomerId:
                typeof subscription.customer === 'string' ? subscription.customer : null,
            },
          });
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        await prisma.$transaction(async (tx) => {
          await markProcessed(event, tx);
          const tenant = await tx.tenant.findFirst({
            where: { stripeCustomerId: subscription.customer as string },
            select: { id: true },
          });
          if (!tenant) return;

          const priceId = subscription.items.data[0]?.price.id ?? '';
          const mappedPlanTier = getPlanTierFromPriceId(priceId);
          const { tenantStatus, accessStatus } = subscriptionState(subscription.status);

          await tx.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              tenantId: tenant.id,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              status: accessStatus,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              stripePriceId: priceId,
              status: accessStatus,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });

          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              planTier: mappedPlanTier === 'free' ? 'free' : mappedPlanTier,
              status: tenantStatus,
              subscriptionStatus: accessStatus,
            },
          });
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        await prisma.$transaction(async (tx) => {
          await markProcessed(event, tx);
          const tenant = await tx.tenant.findFirst({
            where: { stripeCustomerId: subscription.customer as string },
            select: { id: true },
          });
          if (!tenant) return;

          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: { status: 'canceled', cancelAtPeriodEnd: true },
          });

          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              subscriptionStatus: 'canceled',
              status: 'suspended',
              stripeSubscriptionId: null,
              stripeSubscriptionItemId: null,
            },
          });
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await prisma.$transaction(async (tx) => {
          await markProcessed(event, tx);
          const customerId = invoice.customer as string;
          const tenant = await tx.tenant.findFirst({ where: { stripeCustomerId: customerId } });
          if (!tenant) return;

          const gracePeriodEndsAt = new Date();
          gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 14);

          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              subscriptionStatus: 'past_due',
              gracePeriodEndsAt,
              gracePeriodNotifiedAt: new Date(),
            },
          });

          await tx.subscription.updateMany({
            where: { tenantId: tenant.id, status: 'active' },
            data: { status: 'past_due' },
          });

          if (invoice.id) {
            await tx.payment.upsert({
              where: { stripeInvoiceId: invoice.id },
              create: {
                tenantId: tenant.id,
                stripeInvoiceId: invoice.id,
                amountCents: invoice.amount_due || 0,
                currency: invoice.currency || 'usd',
                status: 'failed',
              },
              update: {
                amountCents: invoice.amount_due || 0,
                currency: invoice.currency || 'usd',
                status: 'failed',
              },
            });
          }
        });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await prisma.$transaction(async (tx) => {
          await markProcessed(event, tx);
          const customerId = invoice.customer as string;
          const tenant = await tx.tenant.findFirst({ where: { stripeCustomerId: customerId } });
          if (!tenant) return;

          await tx.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: 'active', status: 'active' },
          });

          await tx.subscription.updateMany({
            where: { tenantId: tenant.id, status: 'past_due' },
            data: { status: 'active' },
          });

          if (invoice.id) {
            await tx.payment.upsert({
              where: { stripeInvoiceId: invoice.id },
              create: {
                tenantId: tenant.id,
                stripeInvoiceId: invoice.id,
                amountCents: invoice.amount_paid,
                currency: invoice.currency,
                status: 'paid',
                paidAt: new Date(),
              },
              update: {
                amountCents: invoice.amount_paid,
                currency: invoice.currency,
                status: 'paid',
                paidAt: new Date(),
              },
            });
          }
        });
        break;
      }

      default:
        break;
    }

    if (triggerDelivery) {
      try {
        const deliveryGraph = await import('@/lib/graph/delivery-graph');
        const runFn = (deliveryGraph as any).runDeliveryAgent;
        if (typeof runFn === 'function') {
          const { proposalId, tenantId } = triggerDelivery;
          await runFn(proposalId, tenantId);
        }
      } catch (error) {
        console.error('Failed to trigger delivery graph on checkout', error);
      }
    }

    const response = NextResponse.json({ received: true, eventId: event.id });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Webhook processing error:', error);

    try {
      await prisma.$transaction(async (tx) => {
        await markFailedWebhook(event, error as Error, tx);
      });
    } catch (loggingError) {
      console.error('Failed to log failed webhook:', loggingError);
    }

    const internalError = new InternalError('Webhook processing failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}
