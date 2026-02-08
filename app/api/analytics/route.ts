
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { startOfDay, subDays, startOfWeek, format } from 'date-fns';

export const GET = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const prisma = createScopedPrisma(tenantId);

        const url = new URL(req.url);
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');

        const startDate = from ? new Date(from) : subDays(new Date(), 30);
        const endDate = to ? new Date(to) : new Date();

        // 1. Overview Stats
        const totalAudits = await prisma.audit.count({
            where: { tenantId, createdAt: { gte: startDate, lte: endDate } }
        });

        const totalProposals = await prisma.proposal.count({
            where: { tenantId, createdAt: { gte: startDate, lte: endDate } }
        });

        // Note: Proposal status is effectively derived.
        // Sent = we don't have a specific 'sent' flag in schema, assuming created = generated.
        // Let's assume all created proposals are 'generated'. 
        // Real 'sent' status would require email integration tracking, but for now use created.

        const proposalsViewed = await prisma.proposal.count({
            where: { tenantId, viewedAt: { not: null }, createdAt: { gte: startDate, lte: endDate } }
        });

        const proposalsAccepted = await prisma.proposal.count({
            where: { tenantId, status: 'ACCEPTED', createdAt: { gte: startDate, lte: endDate } }
        });

        // Revenue (Sum of value of accepted proposals)
        // Proposal model has 'value'.
        const revenueAgg = await prisma.proposal.aggregate({
            where: { tenantId, status: 'ACCEPTED', createdAt: { gte: startDate, lte: endDate } },
            _sum: { value: true }
        });
        const totalRevenue = revenueAgg._sum.value || 0;

        // Cost Analysis
        const costAgg = await prisma.audit.aggregate({
            where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
            _sum: { apiCostCents: true }
        });
        const totalCostCents = costAgg._sum.apiCostCents || 0;
        const avgCostPerAudit = totalAudits > 0 ? (totalCostCents / totalAudits / 100) : 0;


        // 2. Pipeline Funnel
        const funnel = [
            { stage: 'Audits', count: totalAudits },
            { stage: 'Proposals', count: totalProposals },
            { stage: 'Viewed', count: proposalsViewed },
            { stage: 'Accepted', count: proposalsAccepted }
        ];

        // 3. Trends (Audits per week)
        // Group by week is hard in standard Prisma without raw SQL.
        // Can fetch all and aggregate in JS for now (reasonable volume).
        // Or specific raw query. Let's do JS aggregation for flexibility.

        const audits = await prisma.audit.findMany({
            where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
            select: { createdAt: true, qaScore: true }
        });

        const trendsMap = new Map<string, { audits: number, qaScoreSum: number, qaCount: number }>();

        audits.forEach(a => {
            const week = format(startOfWeek(a.createdAt), 'yyyy-MM-dd');
            const curr = trendsMap.get(week) || { audits: 0, qaScoreSum: 0, qaCount: 0 };
            curr.audits++;
            if (a.qaScore) {
                curr.qaScoreSum += a.qaScore;
                curr.qaCount++;
            }
            trendsMap.set(week, curr);
        });

        const trends = Array.from(trendsMap.entries()).map(([date, data]) => ({
            date,
            audits: data.audits,
            avgQaScore: data.qaCount > 0 ? Math.round(data.qaScoreSum / data.qaCount) : 0
        })).sort((a, b) => a.date.localeCompare(b.date));


        // 4. Module Performance logic (Mock or Aggregation)
        // We track modulesCompleted in Audit (String[]).
        // We can count occurrences.
        const allAudits = await prisma.audit.findMany({
            where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
            select: { modulesCompleted: true, modulesFailed: true }
        });

        const moduleStatsMap = new Map<string, { success: number, fail: number }>();

        allAudits.forEach(a => {
            a.modulesCompleted.forEach(m => {
                const s = moduleStatsMap.get(m) || { success: 0, fail: 0 };
                s.success++;
                moduleStatsMap.set(m, s);
            });
            // modulesFailed is Json, expected { module: string, error: string }[]
            if (Array.isArray(a.modulesFailed)) {
                (a.modulesFailed as any[]).forEach((f: any) => {
                    const m = f.module;
                    const s = moduleStatsMap.get(m) || { success: 0, fail: 0 };
                    s.fail++;
                    moduleStatsMap.set(m, s);
                });
            }
        });

        const modulePerformance = Array.from(moduleStatsMap.entries()).map(([name, stats]) => ({
            name,
            total: stats.success + stats.fail,
            successRate: (stats.success / (stats.success + stats.fail)) * 100,
            failureRate: (stats.fail / (stats.success + stats.fail)) * 100
        }));


        // 5. Top Findings (Group by title)
        // This can be heavy. Limit to top 50 findings most common.
        // Group by title.
        const topFindings = await prisma.finding.groupBy({
            by: ['title', 'type'],
            where: { audit: { tenantId, createdAt: { gte: startDate, lte: endDate } } },
            _count: { title: true },
            orderBy: {
                _count: { title: 'desc' }
            },
            take: 10
        });

        return NextResponse.json({
            overview: {
                totalAudits,
                totalProposals,
                viewRate: totalProposals > 0 ? (proposalsViewed / totalProposals) * 100 : 0,
                closeRate: totalProposals > 0 ? (proposalsAccepted / totalProposals) * 100 : 0,
                totalRevenue,
                avgCostPerAudit
            },
            funnel,
            trends,
            modulePerformance,
            topFindings: topFindings.map(f => ({
                title: f.title,
                type: f.type,
                count: f._count.title
            })),
            costAnalysis: {
                totalCostCents,
                totalCostUSD: totalCostCents / 100
            }
        });

    } catch (error) {
        console.error('Analytics Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
