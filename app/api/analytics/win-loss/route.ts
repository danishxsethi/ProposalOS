import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

/**
 * GET /api/analytics/win-loss
 * Get win/loss analytics
 */
export const GET = withAuth(async (req: Request) => {
    try {
        const { searchParams } = new URL(req.url);
        const industry = searchParams.get('industry');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Build where clause
        const where: any = {
            outcome: { not: null },
        };

        if (industry) {
            where.audit = { businessIndustry: industry };
        }

        if (startDate || endDate) {
            where.closedAt = {};
            if (startDate) where.closedAt.gte = new Date(startDate);
            if (endDate) where.closedAt.lte = new Date(endDate);
        }

        // Get proposals
        const proposals = await prisma.proposal.findMany({
            where,
            include: {
                audit: {
                    select: {
                        businessName: true,
                        businessIndustry: true,
                    },
                },
            },
        });

        // Calculate analytics
        const total = proposals.length;
        const won = proposals.filter(p => p.outcome === 'WON').length;
        const lost = proposals.filter(p => p.outcome === 'LOST').length;
        const pending = proposals.filter(p => p.outcome === 'PENDING').length;

        const winRate = total > 0 ? (won / (won + lost)) * 100 : 0;

        const totalDealValue = proposals
            .filter(p => p.outcome === 'WON' && p.dealValue)
            .reduce((sum, p) => sum + Number(p.dealValue), 0);

        const avgDealValue = won > 0 ? totalDealValue / won : 0;

        // Lost reasons breakdown
        const lostReasons = proposals
            .filter(p => p.outcome === 'LOST' && p.lostReason)
            .reduce((acc: any, p) => {
                const reason = p.lostReason!;
                acc[reason] = (acc[reason] || 0) + 1;
                return acc;
            }, {});

        // Industry breakdown
        const byIndustry = proposals.reduce((acc: any, p) => {
            const ind = p.audit.businessIndustry || 'Unknown';
            if (!acc[ind]) {
                acc[ind] = { total: 0, won: 0, lost: 0, pending: 0 };
            }
            acc[ind].total++;
            if (p.outcome === 'WON') acc[ind].won++;
            if (p.outcome === 'LOST') acc[ind].lost++;
            if (p.outcome === 'PENDING') acc[ind].pending++;
            return acc;
        }, {});

        return NextResponse.json({
            summary: {
                total,
                won,
                lost,
                pending,
                winRate: Math.round(winRate * 10) / 10,
                totalDealValue,
                avgDealValue: Math.round(avgDealValue * 100) / 100,
            },
            lostReasons,
            byIndustry,
            proposals: proposals.map(p => ({
                id: p.id,
                businessName: p.audit.businessName,
                industry: p.audit.businessIndustry,
                outcome: p.outcome,
                dealValue: p.dealValue ? Number(p.dealValue) : null,
                lostReason: p.lostReason,
                closedAt: p.closedAt,
            })),
        });
    } catch (error) {
        console.error('[API] Error fetching win/loss analytics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
});
