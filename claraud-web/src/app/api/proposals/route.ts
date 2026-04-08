import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || "";
        const status = searchParams.get("status") || "ALL"; // DRAFT, SENT, VIEWED, ACCEPTED, DECLINED, LOST, OR PIPELINE STAGES

        const where: any = {
            tenantId: session.user.tenantId,
        };

        if (search) {
            where.audit = { businessName: { contains: search, mode: 'insensitive' } };
        }

        if (status !== "ALL") {
            // Pipeline uses different status names sometimes, so we map them if needed
            // For now just exact match if it's a valid ProposalStatus
            where.status = status;
        }

        const proposals = await prisma.proposal.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                audit: { select: { businessName: true } },
                _count: { select: { views: true } }
            }
        });

        return NextResponse.json({
            proposals: proposals.map(p => ({
                id: p.id,
                businessName: p.audit.businessName,
                status: p.status,
                tierChosen: p.tierChosen,
                dealValue: p.dealValue ? Number(p.dealValue) : 0,
                views: p._count.views,
                lastViewedAt: p.viewedAt,
                createdAt: p.createdAt,
                webLinkToken: p.webLinkToken
            }))
        });
    } catch (error) {
        console.error("Proposals list error:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { id, status } = body;

        const proposal = await prisma.proposal.update({
            where: { id, tenantId: session.user.tenantId },
            data: { status }
        });

        return NextResponse.json({ success: true, proposal });
    } catch (error) {
        console.error("Proposal update error:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}
