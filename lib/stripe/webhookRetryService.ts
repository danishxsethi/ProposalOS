import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

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

  private static async withGlobalRetryBypass<T>(
    reason:
      | 'stripe-webhook-retry:global-failed-webhook-scan'
      | 'stripe-webhook-retry:replay-failed-event'
      | 'stripe-webhook-retry:global-stats'
      | 'stripe-webhook-retry:cleanup-resolved-events',
    fn: () => Promise<T>
  ): Promise<T> {
    return runWithTenantBypass(reason, fn);
  }

  /**
   * Retry failed webhooks with exponential backoff
   */
  static async retryFailedWebhooks(): Promise<{ processed: number; errors: number }> {
    const failedEvents = await this.withGlobalRetryBypass(
      'stripe-webhook-retry:global-failed-webhook-scan',
      () =>
        prisma.failedWebhookEvent.findMany({
          where: {
            resolved: false,
            attempts: { lt: this.MAX_ATTEMPTS },
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        })
    );

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
        logger.error({ eventId: event.eventId, error }, 'Failed to retry webhook');
      }
    }

    return { processed, errors };
  }

  /**
   * Retry a single failed webhook event
   */
  private static async retrySingleWebhook(event: FailedWebhookEvent): Promise<void> {
    await this.withGlobalRetryBypass('stripe-webhook-retry:replay-failed-event', async () => {
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

        const resolvedAt = new Date();

        // Mark as resolved if successful
        await prisma.failedWebhookEvent.update({
          where: { id: event.id },
          data: {
            resolved: true,
            resolvedAt,
            attempts: event.attempts + 1,
            lastAttempt: resolvedAt,
          },
        });
      } catch (error) {
        const lastAttempt = new Date();

        // Increment attempt count and update last attempt time
        await prisma.failedWebhookEvent.update({
          where: { id: event.id },
          data: {
            attempts: event.attempts + 1,
            lastAttempt,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? (error.stack ?? null) : null,
          },
        });

        throw error;
      }
    });
  }

  /**
   * Process a webhook event using the same logic as the main webhook handler
   */
  private static async processWebhookEvent(event: Stripe.Event): Promise<void> {
    const { handleStripeWebhookEvent } = await import('@/lib/stripe/webhookHandler');
    await handleStripeWebhookEvent(event, { recordFailures: false });
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
    const [total, resolved, unresolved, maxAttempts] = await this.withGlobalRetryBypass(
      'stripe-webhook-retry:global-stats',
      () =>
        Promise.all([
          prisma.failedWebhookEvent.count(),
          prisma.failedWebhookEvent.count({ where: { resolved: true } }),
          prisma.failedWebhookEvent.count({ where: { resolved: false } }),
          prisma.failedWebhookEvent.count({
            where: {
              resolved: false,
              attempts: { gte: this.MAX_ATTEMPTS },
            },
          }),
        ])
    );

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

    const result = await this.withGlobalRetryBypass(
      'stripe-webhook-retry:cleanup-resolved-events',
      () =>
        prisma.failedWebhookEvent.deleteMany({
          where: {
            resolved: true,
            resolvedAt: { lte: thirtyDaysAgo },
          },
        })
    );

    return result.count;
  }
}
