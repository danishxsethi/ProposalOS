import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';

export const GET = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        // Get current month boundaries
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Run all stats queries in parallel (tenant-scoped)
        const [
            totalAuditsThisMonth,
            proposalsSent,
            proposalsViewed,
            auditsWithCost
        ] = await Promise.all([
            // Total audits this month
            prisma.audit.count({
                where: {
                    tenantId,
                    createdAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                }
            }),

            // Proposals sent (status = SENT)
            prisma.proposal.count({
                where: {
                    tenantId,
                    sentAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                }
            }),

            // Proposals viewed
            prisma.proposal.count({
                where: {
                    tenantId,
                    viewedAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                }
            }),

            // Get all audits with cost for average calculation
            prisma.audit.findMany({
                where: {
                    tenantId,
                    createdAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    },
                    apiCostCents: {
                        gt: 0
                    }
                },
                select: {
                    apiCostCents: true
                }
            })
        ]);

        // Calculate average cost
        const avgCostCents = auditsWithCost.length > 0
            ? Math.round(auditsWithCost.reduce((sum, a) => sum + a.apiCostCents, 0) / auditsWithCost.length)
            : 0;

        // Calculate conversion rate
        const conversionRate = proposalsSent > 0
            ? Math.round((proposalsViewed / proposalsSent) * 100)
            : 0;

        return NextResponse.json({
            auditsThisMonth: totalAuditsThisMonth,
            proposalsSent,
            proposalsViewed,
            conversionRate,
            avgCostCents
        });
    } catch (error) {
        console.error('[API] Error fetching stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
});
