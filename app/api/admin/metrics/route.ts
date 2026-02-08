import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { subDays } from 'date-fns';

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // 1. User Stats
        const totalUsers = await prisma.user.count();
        const usersLast30Days = await prisma.user.count({
            where: { createdAt: { gte: subDays(new Date(), 30) } }
        });

        // 2. Audit Stats (Pipeline)
        const totalAudits = await prisma.audit.count();
        const auditsLast30Days = await prisma.audit.count({
            where: { createdAt: { gte: subDays(new Date(), 30) } }
        });

        // 3. Revenue (Mocked based on Tier counts)
        const tenants = await prisma.tenant.findMany({
            select: { planTier: true }
        });

        let mrr = 0;
        const tierPrices: Record<string, number> = {
            'free': 0,
            'starter': 49,
            'pro': 149,
            'agency': 499
        };

        tenants.forEach(t => {
            mrr += tierPrices[t.planTier.toLowerCase()] || 0;
        });

        // 4. Time Series Data (Last 30 Days)
        // Using Prisma groupBy instead of raw query for safety/ease if DB supports it (Postgres does)
        const auditsByDate = await prisma.audit.groupBy({
            by: ['createdAt'],
            where: {
                createdAt: { gte: subDays(new Date(), 30) }
            },
            _count: {
                _all: true
            }
        });

        // Transform for chart (group by day in JS)
        const dayMap = new Map<string, number>();
        auditsByDate.forEach(item => {
            const day = item.createdAt.toISOString().split('T')[0];
            dayMap.set(day, (dayMap.get(day) || 0) + item._count._all);
        });

        const chartData = Array.from(dayMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // 5. Proposals
        const totalProposals = await prisma.proposal.count();

        return NextResponse.json({
            northStar: {
                mrr,
                arr: mrr * 12,
                totalUsers,
                totalAudits,
                totalProposals
            },
            growth: {
                usersLast30Days,
                auditsLast30Days,
                activeTenants: tenants.length
            },
            charts: {
                audits: chartData
            }
        });

    } catch (error) {
        console.error('Metrics Error', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
