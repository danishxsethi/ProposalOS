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
        const limit = parseInt(searchParams.get("limit") || "10");
        const page = parseInt(searchParams.get("page") || "1");
        const skip = (page - 1) * limit;

        const where = {
            tenantId: session.user.tenantId,
            ...(search ? { businessName: { contains: search, mode: 'insensitive' as const } } : {})
        };

        const [audits, count] = await Promise.all([
            prisma.audit.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: {
                    _count: {
                        select: { findings: true }
                    }
                }
            }),
            prisma.audit.count({ where })
        ]);

        return NextResponse.json({
            audits: audits.map(a => ({
                id: a.id,
                businessName: a.businessName,
                businessUrl: a.businessUrl,
                status: a.status,
                score: a.overallScore,
                findingsCount: a._count.findings,
                createdAt: a.createdAt,
            })),
            pagination: {
                total: count,
                page,
                limit,
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error("Audits list error:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}
