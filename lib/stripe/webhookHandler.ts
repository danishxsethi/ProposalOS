import { ProjectStatus, ProposalStatus } from '@prisma/client';
import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { getPlanTierFromPriceId, stripe, stripeSecretKey } from '@/lib/stripe/stripe';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

type HardenedSubscription = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
};

type HardenedInvoice = Stripe.Invoice & {
  charge?: string | null;
};

export interface WebhookResult {
  received: boolean;
  deduplicated?: boolean;
  eventId: string;
}

function subscriptionState(status: string): { tenantStatus: string; accessStatus: string } {
  if (status === 'trialing') return { tenantStatus: 'trial', accessStatus: 'trialing' };
  if (status === 'active') return { tenantStatus: 'active', accessStatus: 'active' };
  if (status === 'past_due') return { tenantStatus: 'active', accessStatus: 'past_due' };
  if (status === 'canceled') return { tenantStatus: 'suspended', accessStatus: 'canceled' };
  if (status === 'unpaid') return { tenantStatus: 'suspended', accessStatus: 'unpaid' };
  return { tenantStatus: 'suspended', accessStatus: status };
}

/**
 * Record a failed webhook event to the database.
 * Uses a bypass context to ensure logging succeeds even if tenant resolution was incomplete.
 */
export async function recordFailedWebhook(
  event: Stripe.Event,
  error: Error,
  tenantId: string | null
): Promise<void> {
  const runner = tenantId
    ? (fn: () => Promise<any>) => runWithTenantAsync(tenantId, fn)
    : (fn: () => Promise<any>) => runWithTenantBypass('stripe-webhook-record-failure-bypass', fn);

  await runner(async () => {
    const sanitizedStack = error.stack
      ? error.stack.replace(/sk_test_[a-zA-Z0-9]+/g, 'sk_test_***')
      : null;
    const sanitizedMessage = error.message.replace(/sk_test_[a-zA-Z0-9]+/g, 'sk_test_***');

    await prisma.failedWebhookEvent.upsert({
      where: { eventId: event.id },
      create: {
        eventId: event.id,
        eventType: event.type,
        payload: event as any,
        errorMessage: sanitizedMessage,
        errorStack: sanitizedStack,
        attempts: 1,
        lastAttempt: new Date(),
        tenantId,
      },
      update: {
        errorMessage: sanitizedMessage,
        errorStack: sanitizedStack,
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        tenantId,
      },
    });
  });
}

/**
 * Shared production-grade Stripe webhook event processor.
 * Used by both real-time webhook route and background retry workers.
 *
 * Enforces:
 * 1. Strict multi-tenant isolation via runWithTenantAsync.
 * 2. Deduplication and idempotent processed event logging.
 * 3. Out-of-order event safeguards.
 */
export async function handleStripeWebhookEvent(
  event: Stripe.Event,
  options?: { recordFailures?: boolean }
): Promise<WebhookResult> {
  const recordFailures = options?.recordFailures !== false;
  let tenantId: string | null = null;
  let triggerDelivery: { proposalId: string; tenantId: string } | null = null;

  // Global Kill Switch: Freeze all mutations
  const { assertBillingNotFrozen } = await import('@/lib/stripe/stripe');
  assertBillingNotFrozen();

  // Livemode in test mode environment safeguard

  if (event.livemode && stripeSecretKey().startsWith('sk_test')) {
    logger.warn(
      { eventId: event.id },
      'Received livemode Stripe webhook event in test/dev environment. Aborting.'
    );
    throw new Error('Livemode event received in test mode environment');
  }

  try {
    // 1. Check idempotency first under RLS bypass (unscoped query)
    const existing = await runWithTenantBypass('stripe-webhook-idempotency-check', () =>
      prisma.processedWebhookEvent.findUnique({ where: { id: event.id } })
    );

    if (existing) {
      await recordAuditTrailEvent({
        eventType: 'stripe.webhook_duplicate_ignored',
        tenantId: null,
        payload: { eventId: event.id, eventType: event.type },
      }).catch(() => {});
      return { received: true, deduplicated: true, eventId: event.id };
    }

    // 2. Resolve tenantId under narrow bypass context based on event type
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.proposalId) {
          const proposal = await runWithTenantBypass('stripe-webhook-proposal-lookup', () =>
            prisma.proposal.findUnique({
              where: { id: session.metadata!.proposalId },
              select: { tenantId: true },
            })
          );
          tenantId = proposal?.tenantId ?? null;
        } else {
          tenantId = session.client_reference_id || session.metadata?.tenantId || null;
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as HardenedSubscription;
        const tenant = await runWithTenantBypass('stripe-webhook-customer-lookup', () =>
          prisma.tenant.findFirst({
            where: { stripeCustomerId: subscription.customer as string },
            select: { id: true },
          })
        );
        tenantId = tenant?.id ?? null;
        break;
      }

      case 'invoice.payment_failed':
      case 'invoice.paid': {
        const invoice = event.data.object as HardenedInvoice;
        const tenant = await runWithTenantBypass('stripe-webhook-customer-lookup', () =>
          prisma.tenant.findFirst({
            where: { stripeCustomerId: invoice.customer as string },
            select: { id: true },
          })
        );
        tenantId = tenant?.id ?? null;
        break;
      }

      default:
        // Unhandled/ignored event types
        break;
    }

    // If this is a known event type but we couldn't resolve the tenant,
    // we fail with a clear, safe configuration error.
    const knownEvents = [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
      'invoice.paid',
    ];

    if (knownEvents.includes(event.type) && !tenantId) {
      throw new Error(`Tenant context could not be resolved for event type ${event.type}`);
    }

    // Emit stripe.webhook_received event
    await recordAuditTrailEvent({
      eventType: 'stripe.webhook_received',
      tenantId,
      payload: { eventId: event.id, eventType: event.type },
    }).catch(() => {});

    // 3. Execute DB writes under the explicit, resolved tenant context
    // If the event is unknown, we process it as a system-level event under bypass
    const contextRunner = tenantId
      ? (fn: () => Promise<void>) => runWithTenantAsync(tenantId!, fn)
      : (fn: () => Promise<void>) => runWithTenantBypass('stripe-webhook-system-event', fn);

    await contextRunner(async () => {
      await prisma.$transaction(async (tx) => {
        // Safely insert processedWebhookEvent within the transaction to enforce "effectively once" semantics
        try {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });
        } catch (err: any) {
          // Handle P2002 Unique Constraint violation safely (concurrent race condition)
          if (err.code === 'P2002') {
            logger.info(
              { eventId: event.id },
              'Deduplicated concurrent Stripe webhook event transaction'
            );
            return;
          }
          throw err;
        }

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;

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

              // Emit stripe.billing_paid for proposal checkout
              await recordAuditTrailEvent({
                eventType: 'stripe.billing_paid',
                tenantId: proposal.tenantId,
                proposalId,
                payload: {
                  eventId: event.id,
                  amount: session.amount_total,
                  currency: session.currency,
                  type: 'proposal_payment',
                },
              }).catch(() => {});
            } else {
              const subscriptionId =
                typeof session.subscription === 'string' ? session.subscription : null;
              if (!tenantId || !subscriptionId) return;

              const subscription = (await withProviderResilience(
                { provider: 'stripe', operation: 'retrieve-subscription', tenantId: tenantId! },
                () => stripe.subscriptions.retrieve(subscriptionId)
              )) as any;

              const priceId = subscription.items?.data?.[0]?.price?.id ?? '';
              const itemId = subscription.items?.data?.[0]?.id ?? null;
              const mappedPlanTier = getPlanTierFromPriceId(priceId);
              const { tenantStatus, accessStatus } = subscriptionState(subscription.status);

              await tx.subscription.upsert({
                where: { stripeSubscriptionId: subscription.id },
                create: {
                  tenantId: tenantId!,
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
                where: { id: tenantId! },
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
            }
            break;
          }

          case 'customer.subscription.updated': {
            const subscription = event.data.object as HardenedSubscription;
            const priceId = subscription.items?.data?.[0]?.price?.id ?? '';
            const mappedPlanTier = getPlanTierFromPriceId(priceId);
            const { tenantStatus, accessStatus } = subscriptionState(subscription.status);

            // Out-of-order safeguard: check if existing subscription is more recent
            const currentSub = await tx.subscription.findUnique({
              where: { stripeSubscriptionId: subscription.id },
              select: { currentPeriodEnd: true },
            });

            const eventPeriodEnd = new Date(subscription.current_period_end * 1000);
            if (currentSub && currentSub.currentPeriodEnd > eventPeriodEnd) {
              logger.warn(
                { eventId: event.id, subscriptionId: subscription.id },
                'Skipped out-of-order customer.subscription.updated event'
              );
              return;
            }

            await tx.subscription.upsert({
              where: { stripeSubscriptionId: subscription.id },
              create: {
                tenantId: tenantId!,
                stripeSubscriptionId: subscription.id,
                stripePriceId: priceId,
                status: accessStatus,
                currentPeriodStart: new Date(subscription.current_period_start * 1000),
                currentPeriodEnd: eventPeriodEnd,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              },
              update: {
                stripePriceId: priceId,
                status: accessStatus,
                currentPeriodStart: new Date(subscription.current_period_start * 1000),
                currentPeriodEnd: eventPeriodEnd,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              },
            });

            await tx.tenant.update({
              where: { id: tenantId! },
              data: {
                planTier: mappedPlanTier === 'free' ? 'free' : mappedPlanTier,
                status: tenantStatus,
                subscriptionStatus: accessStatus,
              },
            });

            // Emit stripe.billing_updated
            await recordAuditTrailEvent({
              eventType: 'stripe.billing_updated',
              tenantId,
              payload: {
                eventId: event.id,
                subscriptionId: subscription.id,
                status: accessStatus,
                planTier: mappedPlanTier,
              },
            }).catch(() => {});
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as HardenedSubscription;

            await tx.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled', cancelAtPeriodEnd: true },
            });

            await tx.tenant.update({
              where: { id: tenantId! },
              data: {
                subscriptionStatus: 'canceled',
                status: 'suspended',
                stripeSubscriptionId: null,
                stripeSubscriptionItemId: null,
              },
            });
            break;
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as HardenedInvoice;
            const gracePeriodEndsAt = new Date();
            gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 14);

            // Replay safeguard: do not update if invoice is already paid in DB
            if (invoice.id) {
              const existingPayment = await tx.payment.findUnique({
                where: { stripeInvoiceId: invoice.id },
                select: { status: true },
              });
              if (existingPayment?.status === 'paid') {
                logger.warn(
                  { eventId: event.id, invoiceId: invoice.id },
                  'Skipped invoice.payment_failed since invoice is already marked paid in DB'
                );
                return;
              }
            }

            await tx.tenant.update({
              where: { id: tenantId! },
              data: {
                subscriptionStatus: 'past_due',
                gracePeriodEndsAt,
                gracePeriodNotifiedAt: new Date(),
              },
            });

            await tx.subscription.updateMany({
              where: { tenantId: tenantId!, status: 'active' },
              data: { status: 'past_due' },
            });

            if (invoice.id) {
              await tx.payment.upsert({
                where: { stripeInvoiceId: invoice.id },
                create: {
                  tenantId: tenantId!,
                  stripeInvoiceId: invoice.id,
                  stripeChargeId: typeof invoice.charge === 'string' ? invoice.charge : null,
                  amountCents: invoice.amount_due || 0,
                  currency: invoice.currency || 'usd',
                  status: 'failed',
                },
                update: {
                  stripeChargeId: typeof invoice.charge === 'string' ? invoice.charge : null,
                  amountCents: invoice.amount_due || 0,
                  currency: invoice.currency || 'usd',
                  status: 'failed',
                },
              });

              // Emit stripe.billing_failed
              await recordAuditTrailEvent({
                eventType: 'stripe.billing_failed',
                tenantId,
                payload: {
                  eventId: event.id,
                  invoiceId: invoice.id,
                  amount: invoice.amount_due,
                  currency: invoice.currency,
                },
              }).catch(() => {});
            }
            break;
          }

          case 'invoice.paid': {
            const invoice = event.data.object as HardenedInvoice;

            await tx.tenant.update({
              where: { id: tenantId! },
              data: { subscriptionStatus: 'active', status: 'active' },
            });

            await tx.subscription.updateMany({
              where: { tenantId: tenantId!, status: 'past_due' },
              data: { status: 'active' },
            });

            if (invoice.id) {
              await tx.payment.upsert({
                where: { stripeInvoiceId: invoice.id },
                create: {
                  tenantId: tenantId!,
                  stripeInvoiceId: invoice.id,
                  stripeChargeId: typeof invoice.charge === 'string' ? invoice.charge : null,
                  amountCents: invoice.amount_paid,
                  currency: invoice.currency,
                  status: 'paid',
                  paidAt: invoice.status_transitions?.paid_at
                    ? new Date(invoice.status_transitions.paid_at * 1000)
                    : new Date(),
                },
                update: {
                  stripeChargeId: typeof invoice.charge === 'string' ? invoice.charge : null,
                  amountCents: invoice.amount_paid,
                  currency: invoice.currency,
                  status: 'paid',
                  paidAt: invoice.status_transitions?.paid_at
                    ? new Date(invoice.status_transitions.paid_at * 1000)
                    : new Date(),
                },
              });

              // Emit stripe.billing_paid
              await recordAuditTrailEvent({
                eventType: 'stripe.billing_paid',
                tenantId,
                payload: {
                  eventId: event.id,
                  invoiceId: invoice.id,
                  amount: invoice.amount_paid,
                  currency: invoice.currency,
                  type: 'subscription_invoice_paid',
                },
              }).catch(() => {});
            }
            break;
          }

          default:
            // Unknown event type, successfully processed (ignored)
            break;
        }
      });
    });

    if (triggerDelivery) {
      try {
        const deliveryGraph = await import('@/lib/graph/delivery-graph');
        const runFn = (deliveryGraph as any).runDeliveryAgent;
        if (typeof runFn === 'function') {
          const { proposalId, tenantId: proposalTenantId } = triggerDelivery;
          await runFn(proposalId, proposalTenantId);
        }
      } catch (error) {
        logger.error({ error }, 'Failed to trigger delivery graph on checkout');
      }
    }

    return { received: true, eventId: event.id };
  } catch (error: any) {
    logger.error(
      { eventId: event.id, tenantId, error: error.message },
      'Error processing Stripe webhook event'
    );

    if (recordFailures) {
      try {
        await recordFailedWebhook(event, error, tenantId);
      } catch (loggingError) {
        logger.error(
          { eventId: event.id, loggingError },
          'Failed to record failed webhook event in database'
        );
      }
    }

    throw error;
  }
}
