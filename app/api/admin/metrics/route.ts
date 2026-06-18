/**
 * app/api/admin/metrics/route.ts
 *
 * System-wide Admin Metrics — super_admin only.
 * Reads cross-tenant aggregate data (all audits, proposals, tenants).
 * RLS bypassed intentionally for cross-tenant aggregates; gated by
 * withRole('super_admin'). [#7]
 */

import { NextResponse } from 'next/server';

import { subDays } from 'date-fns';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

async function handleMetrics(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    const data = await runWithTenantBypass('admin-system-metrics', async () => {
      const [totalUsers, usersLast30Days, totalAudits, auditsLast30Days, tenants, totalProposals] =
        await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { createdAt: { gte: subDays(new Date(), 30) } } }),
          prisma.audit.count(),
          prisma.audit.count({ where: { createdAt: { gte: subDays(new Date(), 30) } } }),
          prisma.tenant.findMany({ select: { planTier: true } }),
          prisma.proposal.count(),
        ]);

      const tierPrices: Record<string, number> = { free: 0, starter: 49, pro: 149, agency: 499 };
      const mrr = tenants.reduce((sum, t) => sum + (tierPrices[t.planTier ?? 'free'] || 0), 0);

      const auditsByDate = await prisma.audit.groupBy({
        by: ['createdAt'],
        where: { createdAt: { gte: subDays(new Date(), 30) } },
        _count: { _all: true },
      });

      const dayMap = new Map<string, number>();
      auditsByDate.forEach((item) => {
        const day = item.createdAt?.toISOString().split('T')[0] ?? 'unknown';
        dayMap.set(day, (dayMap.get(day) ?? 0) + item._count._all);
      });

      const chartData = Array.from(dayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        northStar: { mrr, arr: mrr * 12, totalUsers, totalAudits, totalProposals },
        growth: { usersLast30Days, auditsLast30Days, activeTenants: tenants.length },
        charts: { audits: chartData },
      };
    });

    const response = NextResponse.json(data);
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    return NextResponse.json(
      new InternalError('Failed to fetch metrics', {
        originalError: error instanceof Error ? error.message : String(error),
      }).toEnvelope(req.url, traceId),
      { status: 500 }
    );
  }
}

// super_admin required; 20 req/min
const rateLimitedHandler = (req: Request) =>
  withRateLimit({ windowMs: 60 * 1000, max: 20 })(req, () => handleMetrics(req));

export const GET = withRole('super_admin', rateLimitedHandler);
