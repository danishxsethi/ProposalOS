import Stripe from 'stripe';

import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe/stripe';
import { startGracePeriod } from '@/lib/tenant/gracePeriodService';

interface FailedWebhookEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload: any;
  errorMessage: string;
  errorStack: string;
  attempts: number;
  lastAttempt: Date | null;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class WebhookRetryService {
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly RETRY_DELAY_MS = 1000; // 1 second between retries

  /**
   * Retry failed webhooks with exponential backoff
   */
  static async retryFailedWebhooks(): Promise<{ processed: number; errors: number }> {
    const failedEvents = await prisma.$queryRaw<Array<any>>`
      SELECT * FROM failed_webhook_events 
      WHERE resolved = false AND attempts < ${this.MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT 100
    `;

    let processed = 0;
    let errors = 0;

    for (const event of failedEvents) {
      try {
        await this.retrySingleWebhook(event as FailedWebhookEvent);
        processed++;

        // Add delay to prevent overwhelming Stripe API
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY_MS));
      } catch (error) {
        errors++;
        console.error(`Failed to retry webhook ${event.eventId}:`, error);
      }
    }

    return { processed, errors };
  }

  /**
   * Retry a single failed webhook event
   */
  private static async retrySingleWebhook(event: FailedWebhookEvent): Promise<void> {
    try {
      // Reconstruct the event from the stored payload
      const reconstructedEvent: Stripe.Event = {
        id: event.eventId,
        object: 'event',
        type: event.eventType,
        created: Math.floor(new Date().getTime() / 1000),
        livemode: false, // Will be determined by Stripe key
        pending_webhooks: 0,
        request: null,
        data: {
          object: event.payload.data?.object || {},
          previous_attributes: event.payload.data?.previous_attributes || null,
        },
        ...event.payload,
      };

      // Process the event using the main webhook logic
      await this.processWebhookEvent(reconstructedEvent);

      // Mark as resolved if successful
      await prisma.$executeRaw`
        UPDATE failed_webhook_events 
        SET resolved = true, resolved_at = NOW(), attempts = ${event.attempts + 1}, last_attempt = NOW()
        WHERE id = ${event.id}
      `;
    } catch (error) {
      // Increment attempt count and update last attempt time
      await prisma.$executeRaw`
        UPDATE failed_webhook_events 
        SET attempts = ${event.attempts + 1}, last_attempt = NOW(), 
            error_message = ${error instanceof Error ? error.message : 'Unknown error'},
            error_stack = ${error instanceof Error ? error.stack : null}
        WHERE id = ${event.id}
      `;

      throw error;
    }
  }

  /**
   * Process a webhook event using the same logic as the main webhook handler
   */
  private static async processWebhookEvent(event: Stripe.Event): Promise<void> {
    // Import the main webhook processing logic
    const { prisma } = await import('@/lib/prisma');
    const { ProposalStatus, ProjectStatus } = await import('@prisma/client');
    const { getPlanTierFromPriceId } = await import('@/lib/stripe/stripe');

    // Check if already processed
    const existing = await prisma.processedWebhookEvent.findUnique({
      where: { id: event.id },
    });
    if (existing) {
      return;
    }

    let triggerDelivery: { proposalId: string; tenantId: string } | null = null;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        await prisma.$transaction(async (tx: any) => {
          // Mark as processed
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });

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

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          // Update subscription records
          const priceId = subscription.items?.data[0]?.price?.id ?? '';
          const itemId = subscription.items?.data[0]?.id ?? null;
          const mappedPlanTier = getPlanTierFromPriceId(priceId);

          await tx.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              tenantId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              stripePriceId: priceId,
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });

          await tx.tenant.update({
            where: { id: tenantId },
            data: {
              stripeCustomerId: customerId,
              status: subscription.status === 'trialing' ? 'trial' : 'active',
              planTier: mappedPlanTier === 'free' ? 'free' : mappedPlanTier,
              subscriptionStatus: subscription.status,
              stripeSubscriptionId: subscription.id,
              stripeSubscriptionItemId: itemId,
            },
          });
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.$transaction(async (tx: any) => {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });

          const tenant = await tx.tenant.findFirst({
            where: { stripeCustomerId: subscription.customer as string },
            select: { id: true },
          });
          if (!tenant) return;

          const priceId = subscription.items.data[0]?.price.id ?? '';
          const itemId = subscription.items.data[0]?.id ?? null;
          const mappedPlanTier = getPlanTierFromPriceId(priceId);

          await tx.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              tenantId: tenant.id,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              stripePriceId: priceId,
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });

          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              planTier: mappedPlanTier === 'free' ? 'free' : mappedPlanTier,
              subscriptionStatus: subscription.status,
              stripeSubscriptionId: subscription.id,
              stripeSubscriptionItemId: itemId,
              stripeCustomerId:
                typeof subscription.customer === 'string' ? subscription.customer : null,
            },
          });
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.$transaction(async (tx: any) => {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });

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
        await prisma.$transaction(async (tx: any) => {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });

          const customerId = invoice.customer as string;
          const tenant = await tx.tenant.findFirst({ where: { stripeCustomerId: customerId } });
          if (!tenant) return;

          await tx.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: 'past_due' },
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
                stripeChargeId: null,
                amountCents: invoice.amount_due || 0,
                currency: invoice.currency || 'usd',
                status: 'failed',
              },
              update: {
                stripeChargeId: null,
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
        await prisma.$transaction(async (tx: any) => {
          await tx.processedWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });

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
                stripeChargeId: null,
                amountCents: invoice.amount_paid,
                currency: invoice.currency,
                status: 'paid',
                paidAt: new Date(),
              },
              update: {
                stripeChargeId: null,
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
        // For unknown event types, just mark as processed
        await prisma.processedWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });
        break;
    }

    if (triggerDelivery) {
      try {
        const deliveryGraph = await import('@/lib/graph/delivery-graph');
        const runFn = (deliveryGraph as any).runDeliveryAgent;
        if (typeof runFn === 'function') {
          await runFn(triggerDelivery.proposalId, triggerDelivery.tenantId);
        }
      } catch (error) {
        console.error('Failed to trigger delivery graph on checkout', error);
      }
    }
  }

  /**
   * Get statistics about failed webhooks
   */
  static async getStatistics(): Promise<{
    totalFailed: number;
    resolved: number;
    unresolved: number;
    maxAttemptsReached: number;
  }> {
    const [total, resolved, unresolved, maxAttempts] = await Promise.all([
      prisma.failedWebhookEvent.count(),
      prisma.failedWebhookEvent.count({ where: { resolved: true } }),
      prisma.failedWebhookEvent.count({ where: { resolved: false } }),
      prisma.failedWebhookEvent.count({
        where: {
          resolved: false,
          attempts: { gte: this.MAX_ATTEMPTS },
        },
      }),
    ]);

    return {
      totalFailed: total,
      resolved,
      unresolved,
      maxAttemptsReached: maxAttempts,
    };
  }

  /**
   * Clean up old resolved webhook events (older than 30 days)
   */
  static async cleanupResolvedEvents(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.failedWebhookEvent.deleteMany({
      where: {
        resolved: true,
        resolvedAt: { lte: thirtyDaysAgo },
      },
    });

    return result.count;
  }
}
