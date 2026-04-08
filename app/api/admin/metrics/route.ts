/**
 * app/api/admin/metrics/route.ts
 *
 * Admin Metrics Dashboard API
 * Provides system-wide metrics and analytics
 *
 * Features:
 * - Auth & admin scoping
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { subDays } from 'date-fns';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Inner handler for metrics
 */
async function handleMetrics(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    // 1. User Stats
    const totalUsers = await prisma.user.count();
    const usersLast30Days = await prisma.user.count({
      where: { createdAt: { gte: subDays(new Date(), 30) } },
    });

    // 2. Audit Stats (Pipeline)
    const totalAudits = await prisma.audit.count();
    const auditsLast30Days = await prisma.audit.count({
      where: { createdAt: { gte: subDays(new Date(), 30) } },
    });

    // 3. Revenue (Mocked based on Tier counts)
    const tenants = await prisma.tenant.findMany({
      select: { planTier: true },
    });

    let mrr = 0;
    const tierPrices: Record<string, number> = {
      free: 0,
      starter: 49,
      pro: 149,
      agency: 499,
    };

    tenants.forEach((t) => {
      const tierKey = (t.planTier ?? 'free') as string;
      mrr += tierPrices[tierKey] || 0;
    });

    // 4. Time Series Data (Last 30 Days)
    const auditsByDate = await prisma.audit.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: { gte: subDays(new Date(), 30) },
      },
      _count: {
        _all: true,
      },
    });

    // Transform for chart (group by day in JS)
    const dayMap = new Map<string, number>();
    auditsByDate.forEach((item) => {
      const day = item.createdAt ? item.createdAt.toISOString().split('T')[0] : 'unknown';
      const currentCount: number = dayMap.get(day as string) || 0; dayMap.set(day as string, currentCount + item._count._all);
    });

    const chartData = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 5. Proposals
    const totalProposals = await prisma.proposal.count();

    const response = NextResponse.json({
      northStar: {
        mrr,
        arr: mrr * 12,
        totalUsers,
        totalAudits,
        totalProposals,
      },
      growth: {
        usersLast30Days,
        auditsLast30Days,
        activeTenants: tenants.length,
      },
      charts: {
        audits: chartData,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Metrics Error', error);
    const internalError = new InternalError('Failed to fetch metrics', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (20 requests per minute for metrics)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many metrics requests. Please wait before trying again.',
  })(req, () => handleMetrics(req));

export const GET = rateLimitedHandler;
