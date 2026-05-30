import { ProposalStatus } from '@prisma/client';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export interface CartAbandonmentEvent {
  id: string;
  sessionId: string;
  proposalId: string;
  checkoutType: 'proposal' | 'saas';
  step: 'initiated' | 'pricing_selected' | 'checkout_started' | 'payment_failed' | 'completed';
  timestamp: Date;
  metadata: {
    tierId?: string;
    price?: number;
    currency?: string;
    error?: string;
    userAgent?: string;
    referrer?: string;
    ipHash?: string;
  } | null;
}

export class CartAbandonmentService {
  /**
   * Track a cart abandonment event
   */
  static async trackEvent(
    sessionId: string,
    proposalId: string,
    checkoutType: 'proposal' | 'saas',
    step: 'initiated' | 'pricing_selected' | 'checkout_started' | 'payment_failed' | 'completed',
    metadata: any = {},
    tenantId?: string
  ): Promise<CartAbandonmentEvent> {
    const event = await prisma.cartAbandonmentEvent.create({
      data: {
        sessionId,
        proposalId,
        checkoutType,
        step,
        timestamp: new Date(),
        metadata,
        tenantId: tenantId || '', // Require tenantId for tenant isolation
      },
    });

    return {
      id: event.id,
      sessionId: event.sessionId,
      proposalId: event.proposalId,
      checkoutType: event.checkoutType as 'proposal' | 'saas',
      step: event.step as
        | 'initiated'
        | 'pricing_selected'
        | 'checkout_started'
        | 'payment_failed'
        | 'completed',
      timestamp: event.timestamp,
      metadata: event.metadata as CartAbandonmentEvent['metadata'],
    };
  }

  /**
   * Get abandoned carts (users who started checkout but didn't complete)
   */
  static async getAbandonedCarts(daysBack: number = 7): Promise<CartAbandonmentEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const abandonedSessionGroups = await prisma.cartAbandonmentEvent.groupBy({
      by: ['sessionId'],
      where: {
        step: { in: ['initiated', 'pricing_selected', 'checkout_started'] },
        timestamp: { gte: cutoffDate },
      },
      _count: {
        sessionId: true,
      },
      having: {
        sessionId: {
          _count: {
            gt: 0,
          },
        },
      },
    });

    const sessionIds = abandonedSessionGroups.map((group) => group.sessionId);

    // Now get the actual events for these sessions that weren't completed
    const abandonedEvents = await prisma.cartAbandonmentEvent.findMany({
      where: {
        sessionId: { in: sessionIds },
        timestamp: { gte: cutoffDate },
        NOT: {
          step: 'completed',
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    return abandonedEvents.map((event) => ({
      id: event.id,
      sessionId: event.sessionId,
      proposalId: event.proposalId,
      checkoutType: event.checkoutType as 'proposal' | 'saas',
      step: event.step as
        | 'initiated'
        | 'pricing_selected'
        | 'checkout_started'
        | 'payment_failed'
        | 'completed',
      timestamp: event.timestamp,
      metadata: event.metadata as CartAbandonmentEvent['metadata'],
    }));
  }

  /**
   * Get conversion funnel for checkout process
   */
  static async getConversionFunnel(
    checkoutType: 'proposal' | 'saas',
    daysBack: number = 30
  ): Promise<{
    initiated: number;
    pricingSelected: number;
    checkoutStarted: number;
    paymentFailed: number;
    completed: number;
    conversionRate: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const [initiated, pricingSelected, checkoutStarted, paymentFailed, completed] =
      await Promise.all([
        prisma.cartAbandonmentEvent.count({
          where: {
            checkoutType,
            step: 'initiated',
            timestamp: { gte: cutoffDate },
          },
        }),
        prisma.cartAbandonmentEvent.count({
          where: {
            checkoutType,
            step: 'pricing_selected',
            timestamp: { gte: cutoffDate },
          },
        }),
        prisma.cartAbandonmentEvent.count({
          where: {
            checkoutType,
            step: 'checkout_started',
            timestamp: { gte: cutoffDate },
          },
        }),
        prisma.cartAbandonmentEvent.count({
          where: {
            checkoutType,
            step: 'payment_failed',
            timestamp: { gte: cutoffDate },
          },
        }),
        prisma.cartAbandonmentEvent.count({
          where: {
            checkoutType,
            step: 'completed',
            timestamp: { gte: cutoffDate },
          },
        }),
      ]);

    const conversionRate = initiated > 0 ? (completed / initiated) * 100 : 0;

    return {
      initiated,
      pricingSelected,
      checkoutStarted,
      paymentFailed,
      completed,
      conversionRate,
    };
  }

  /**
   * Get abandoned cart statistics
   */
  static async getAbandonmentStats(daysBack: number = 7): Promise<{
    totalAbandoned: number;
    averageTimeToAbandon: number; // in minutes
    commonDropOffPoints: { step: string; count: number }[];
    recoveryAttempts: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get all events in the time period
    const allEvents = await prisma.cartAbandonmentEvent.findMany({
      where: {
        timestamp: { gte: cutoffDate },
        step: { in: ['initiated', 'pricing_selected', 'checkout_started'] },
      },
      select: {
        sessionId: true,
        step: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Group by session to identify abandoned sessions
    const sessionMap = new Map<string, typeof allEvents>();
    allEvents.forEach((event) => {
      if (!sessionMap.has(event.sessionId)) {
        sessionMap.set(event.sessionId, []);
      }
      sessionMap.get(event.sessionId)?.push(event);
    });

    // Identify sessions that didn't complete
    const completedSessionIds = new Set(
      (
        await prisma.cartAbandonmentEvent.findMany({
          where: {
            timestamp: { gte: cutoffDate },
            step: 'completed',
          },
          select: { sessionId: true },
        })
      ).map((e) => e.sessionId)
    );

    const abandonedSessions = Array.from(sessionMap.entries())
      .filter(([sessionId]) => !completedSessionIds.has(sessionId))
      .map(([_, events]) => events);

    const totalAbandoned = abandonedSessions.length;

    // Calculate average time to abandon
    let totalMinutes = 0;
    abandonedSessions.forEach((sessionEvents) => {
      if (sessionEvents.length > 0) {
        const firstEvent = sessionEvents[0]?.timestamp;
        const lastEvent = sessionEvents[sessionEvents.length - 1]?.timestamp;
        if (!firstEvent || !lastEvent) return;
        const minutesDiff = (lastEvent.getTime() - firstEvent.getTime()) / (1000 * 60);
        totalMinutes += minutesDiff;
      }
    });

    const averageTimeToAbandon = totalAbandoned > 0 ? totalMinutes / totalAbandoned : 0;

    // Get common drop-off points
    const dropOffCounts = await prisma.cartAbandonmentEvent.groupBy({
      by: ['step'],
      where: {
        timestamp: { gte: cutoffDate },
        sessionId: {
          in: abandonedSessions.map((s) => s[0]?.sessionId).filter(Boolean) as string[],
        },
      },
      _count: {
        step: true,
      },
      orderBy: { _count: { step: 'desc' } },
    });

    const commonDropOffPoints = dropOffCounts.map((count) => ({
      step: count.step,
      count: count._count?.step ?? 0,
    }));

    // Count recovery attempts (sessions that had multiple events after abandoning)
    const recoveryGroups = await prisma.cartAbandonmentEvent.groupBy({
      by: ['sessionId'],
      where: { timestamp: { gte: cutoffDate } },
      having: {
        sessionId: {
          _count: { gt: 1 },
        },
      },
    });

    const recoverySessionIds = recoveryGroups.map((g) => g.sessionId);

    const recoveryAttempts = await prisma.cartAbandonmentEvent.count({
      where: {
        step: 'checkout_started',
        timestamp: { gte: cutoffDate },
        sessionId: {
          in: recoverySessionIds,
        },
      },
    });

    return {
      totalAbandoned,
      averageTimeToAbandon,
      commonDropOffPoints,
      recoveryAttempts,
    };
  }

  /**
   * Trigger follow-up for abandoned carts
   */
  static async triggerFollowUp(
    email: string,
    proposalId: string,
    tierId?: string
  ): Promise<boolean> {
    try {
      // In a real implementation, this would send an email or trigger a notification
      // For now, we'll just log the follow-up
      logger.info({ proposalId, tierId }, 'Triggering follow-up for abandoned cart');

      // You could integrate with your email service here
      // await sendAbandonedCartEmail(email, proposalId, tierId);

      return true;
    } catch (error) {
      logger.error({ error }, 'Error triggering follow-up');
      return false;
    }
  }

  /**
   * Clean up old cart abandonment events (older than 90 days)
   */
  static async cleanupOldEvents(): Promise<number> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await prisma.cartAbandonmentEvent.deleteMany({
      where: {
        timestamp: { lt: ninetyDaysAgo },
      },
    });

    return result.count;
  }
}
