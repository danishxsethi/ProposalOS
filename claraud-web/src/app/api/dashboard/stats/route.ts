import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const tenantId = session.user.tenantId;

        const [totalAudits, activeProposals, pipelineValueResult, acceptedProposals, totalProposals] = await Promise.all([
            prisma.audit.count({ where: { tenantId } }),
            prisma.proposal.count({ where: { tenantId, status: { in: ['DRAFT', 'SENT', 'VIEWED'] } } }),
            prisma.proposal.aggregate({
                where: { tenantId, status: { not: 'REJECTED' } },
                _sum: { dealValue: true }
            }),
            prisma.proposal.count({ where: { tenantId, status: 'ACCEPTED' } }),
            prisma.proposal.count({ where: { tenantId } }),
        ]);

        const pipelineValue = pipelineValueResult._sum.dealValue ? Number(pipelineValueResult._sum.dealValue) : 0;
        const conversionRate = totalProposals > 0 ? (acceptedProposals / totalProposals) * 100 : 0;

        // Recent activity
        const recentAuditsData = await prisma.audit.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, businessName: true, status: true, createdAt: true, overallScore: true }
        });

        return NextResponse.json({
            stats: {
                totalAudits,
                activeProposals,
                pipelineValue,
                conversionRate: Math.round(conversionRate)
            },
            recentActivity: recentAuditsData.map(a => ({
                id: a.id,
                title: `Audit ${a.status.toLowerCase()} for ${a.businessName}`,
                date: a.createdAt,
                type: 'audit',
                score: a.overallScore,
                status: a.status
            }))
        });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}
