import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

export const GET = withAuth(async (_req: Request) => {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 403 });
    }

    // Get current month boundaries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Run all stats queries in parallel (tenant-scoped automatically)
    const [totalAuditsThisMonth, proposalsSent, proposalsViewed, auditsWithCost] =
      await Promise.all([
        // Total audits this month — no tenantId needed in where, scoped client adds it
        prisma.audit.count({
          where: {
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        }),

        // Proposals sent (with sentAt in current month)
        prisma.proposal.count({
          where: {
            sentAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        }),

        // Proposals viewed (with viewedAt in current month)
        prisma.proposal.count({
          where: {
            viewedAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        }),

        // Audits with non-zero cost for average calculation
        prisma.audit.findMany({
          where: {
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
            apiCostCents: {
              gt: 0,
            },
          },
          select: {
            apiCostCents: true,
          },
        }),
      ]);

    // Calculate average cost
    const avgCostCents =
      auditsWithCost.length > 0
        ? Math.round(
            auditsWithCost.reduce((sum, a) => sum + a.apiCostCents, 0) / auditsWithCost.length
          )
        : 0;

    // Calculate conversion rate
    const conversionRate =
      proposalsSent > 0 ? Math.round((proposalsViewed / proposalsSent) * 100) : 0;

    return NextResponse.json({
      auditsThisMonth: totalAuditsThisMonth,
      proposalsSent,
      proposalsViewed,
      conversionRate,
      avgCostCents,
    });
  } catch (error) {
    logger.error('[API] Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
});
