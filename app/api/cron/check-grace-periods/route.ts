/**
 * app/api/cron/check-grace-periods/route.ts
 *
 * Grace Period Check Cron Job
 * Checks for expired grace periods and suspends tenants
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Inner handler for grace period check cron
 */
async function handleCheckGracePeriods(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const now = new Date();

    // Find tenants whose grace period has expired
    const expiredGracePeriods = await prisma.tenant.findMany({
      where: {
        gracePeriodEndsAt: {
          lte: now,
        },
        subscriptionStatus: 'past_due',
        gracePeriodNotifiedAt: {
          not: null,
        },
      },
      include: {
        subscriptions: true,
        users: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    let suspendedCount = 0;
    let alreadySuspendedCount = 0;

    for (const tenant of expiredGracePeriods) {
      // Check if already suspended
      if (tenant.status === 'suspended') {
        alreadySuspendedCount++;
        continue;
      }

      // Suspend the tenant
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          status: 'suspended',
          gracePeriodEndsAt: null,
        },
      });

      // Update all active subscriptions to canceled
      await prisma.subscription.updateMany({
        where: {
          tenantId: tenant.id,
          status: {
            in: ['active', 'past_due'],
          },
        },
        data: {
          status: 'canceled',
        },
      });

      suspendedCount++;

      console.log(
        `[GracePeriodCheck] Suspended tenant ${tenant.id} (${tenant.name}) - grace period expired`
      );
    }

    // Find tenants approaching grace period end (3 days warning)
    const approachingExpiry = await prisma.tenant.findMany({
      where: {
        gracePeriodEndsAt: {
          lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          gt: now,
        },
        subscriptionStatus: 'past_due',
      },
      include: {
        users: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    // Note: In a full implementation, you would send reminder emails here
    for (const tenant of approachingExpiry) {
      const gracePeriodEndsAt = (tenant as any).gracePeriodEndsAt as Date;
      if (gracePeriodEndsAt) {
        const daysRemaining = Math.ceil(
          (gracePeriodEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
        console.log(
          `[GracePeriodCheck] Tenant ${tenant.id} (${tenant.name}) has ${daysRemaining} days remaining in grace period`
        );
      }
    }

    const response = NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results: {
        suspended: suspendedCount,
        alreadySuspended: alreadySuspendedCount,
        approachingExpiry: approachingExpiry.length,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('[GracePeriodCheck] Error:', error);
    const internalError = new InternalError('Grace period check cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  return handleCheckGracePeriods(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
export const POST = rateLimitedHandler;
