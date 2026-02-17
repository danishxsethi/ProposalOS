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
        const where: any = {};

        if (industry) {
            where.audit = { businessIndustry: industry };
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // Get proposal lifecycle data
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
        const pending = total - won - lost;
        const accepted = proposals.filter(p => p.outcome === 'WON' || p.status === 'ACCEPTED').length;
        const replyCount = proposals.filter(p => p.replyReceivedAt !== null).length;
        const meetingBookedCount = proposals.filter(p => p.meetingBookedAt !== null).length;
        const tierChosenCount = proposals.filter(p => !!p.tierChosen).length;

        const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
        const replyRate = total > 0 ? (replyCount / total) * 100 : 0;
        const meetingsBookedRate = total > 0 ? (meetingBookedCount / total) * 100 : 0;
        const proposalAcceptedRate = total > 0 ? (accepted / total) * 100 : 0;
        const tierChosenRate = total > 0 ? (tierChosenCount / total) * 100 : 0;
        const realClientPerfectScore =
            replyRate * 0.25 +
            meetingsBookedRate * 0.25 +
            proposalAcceptedRate * 0.35 +
            tierChosenRate * 0.15;

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

        // Tier-chosen breakdown
        const tierChosenBreakdown = proposals.reduce((acc: Record<string, number>, p) => {
            const key = p.tierChosen || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const toWeekStart = (date: Date): string => {
            const d = new Date(date);
            const day = (d.getUTCDay() + 6) % 7; // Monday-based week
            d.setUTCDate(d.getUTCDate() - day);
            d.setUTCHours(0, 0, 0, 0);
            return d.toISOString().slice(0, 10);
        };

        const weekly = Array.from(
            proposals.reduce((acc, p) => {
                const week = toWeekStart(p.createdAt);
                if (!acc.has(week)) {
                    acc.set(week, {
                        total: 0,
                        replies: 0,
                        meetingsBooked: 0,
                        accepted: 0,
                        tierChosen: 0,
                    });
                }
                const row = acc.get(week)!;
                row.total += 1;
                if (p.replyReceivedAt) row.replies += 1;
                if (p.meetingBookedAt) row.meetingsBooked += 1;
                if (p.outcome === 'WON' || p.status === 'ACCEPTED') row.accepted += 1;
                if (p.tierChosen) row.tierChosen += 1;
                return acc;
            }, new Map<string, { total: number; replies: number; meetingsBooked: number; accepted: number; tierChosen: number }>())
        )
            .map(([weekStart, row]) => {
                const replyRateWeek = row.total > 0 ? (row.replies / row.total) * 100 : 0;
                const meetingRateWeek = row.total > 0 ? (row.meetingsBooked / row.total) * 100 : 0;
                const acceptedRateWeek = row.total > 0 ? (row.accepted / row.total) * 100 : 0;
                const tierRateWeek = row.total > 0 ? (row.tierChosen / row.total) * 100 : 0;
                const realClientPerfectScoreWeek =
                    replyRateWeek * 0.25 +
                    meetingRateWeek * 0.25 +
                    acceptedRateWeek * 0.35 +
                    tierRateWeek * 0.15;
                return {
                    weekStart,
                    ...row,
                    replyRate: Math.round(replyRateWeek * 10) / 10,
                    meetingsBookedRate: Math.round(meetingRateWeek * 10) / 10,
                    proposalAcceptedRate: Math.round(acceptedRateWeek * 10) / 10,
                    tierChosenRate: Math.round(tierRateWeek * 10) / 10,
                    realClientPerfectScore: Math.round(realClientPerfectScoreWeek * 10) / 10,
                };
            })
            .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

        // Industry breakdown
        const byIndustry = proposals.reduce((acc: any, p) => {
            const ind = p.audit.businessIndustry || 'Unknown';
            if (!acc[ind]) {
                acc[ind] = {
                    total: 0,
                    won: 0,
                    lost: 0,
                    pending: 0,
                    replies: 0,
                    meetingsBooked: 0,
                    accepted: 0,
                };
            }
            acc[ind].total++;
            if (p.outcome === 'WON') acc[ind].won++;
            if (p.outcome === 'LOST') acc[ind].lost++;
            if (!p.outcome || p.outcome === 'PENDING') acc[ind].pending++;
            if (p.replyReceivedAt) acc[ind].replies++;
            if (p.meetingBookedAt) acc[ind].meetingsBooked++;
            if (p.outcome === 'WON' || p.status === 'ACCEPTED') acc[ind].accepted++;
            return acc;
        }, {});

        return NextResponse.json({
            summary: {
                total,
                won,
                lost,
                pending,
                accepted,
                winRate: Math.round(winRate * 10) / 10,
                totalDealValue,
                avgDealValue: Math.round(avgDealValue * 100) / 100,
                replyRate: Math.round(replyRate * 10) / 10,
                meetingsBookedRate: Math.round(meetingsBookedRate * 10) / 10,
                proposalAcceptedRate: Math.round(proposalAcceptedRate * 10) / 10,
                tierChosenRate: Math.round(tierChosenRate * 10) / 10,
                realClientPerfectScore: Math.round(realClientPerfectScore * 10) / 10,
            },
            outcomes: {
                replyCount,
                meetingBookedCount,
                accepted,
                tierChosenCount,
                tierChosenBreakdown,
            },
            weekly,
            lostReasons,
            byIndustry,
            proposals: proposals.map(p => ({
                id: p.id,
                businessName: p.audit.businessName,
                industry: p.audit.businessIndustry,
                outcome: p.outcome,
                dealValue: p.dealValue ? Number(p.dealValue) : null,
                lostReason: p.lostReason,
                replyReceivedAt: p.replyReceivedAt,
                meetingBookedAt: p.meetingBookedAt,
                tierChosen: p.tierChosen,
                clientScore: p.clientScore,
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
