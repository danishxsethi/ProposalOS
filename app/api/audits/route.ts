import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { getCostStatus } from '@/lib/config/costBudget';


export const GET = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const status = searchParams.get('status');
        const search = searchParams.get('search');

        const skip = (page - 1) * limit;

        // Build where clause (tenant-scoped)
        const where: Record<string, unknown> = { tenantId };
        if (status) {
            where.status = status;
        }
        if (search) {
            where.businessName = {
                contains: search,
                mode: 'insensitive'
            };
        }

        // Fetch audits with pagination
        const [audits, total] = await Promise.all([
            prisma.audit.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    findings: {
                        where: { excluded: false },
                        select: { id: true }
                    },
                    proposals: {
                        select: {
                            id: true,
                            status: true,
                            webLinkToken: true,
                            sentAt: true,
                            viewedAt: true,
                            qaScore: true,
                            clientScore: true,
                            clientScoreResults: true,
                        }
                    }
                }
            }),
            prisma.audit.count({ where })
        ]);

        // Transform data for frontend
        const auditsList = audits.map(audit => ({
            id: audit.id,
            businessName: audit.businessName,
            businessCity: audit.businessCity,
            businessIndustry: audit.businessIndustry,
            status: audit.status,
            findingsCount: audit.findings.length,
            cost: audit.apiCostCents,
            costStatus: getCostStatus(audit.apiCostCents),
            proposal: audit.proposals[0] || null,
            qaScore: audit.proposals[0]?.qaScore ?? null,
            clientScore: audit.proposals[0]?.clientScore ?? null,
            requiresHumanReview:
                (
                    (audit.proposals[0]?.clientScoreResults as { requiresHumanReview?: unknown } | undefined)
                        ?.requiresHumanReview
                ) === true,
            createdAt: audit.createdAt.toISOString(),
            completedAt: audit.completedAt,
        }));

        return NextResponse.json({
            audits: auditsList,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[API] Error fetching audits:', error);
        return NextResponse.json(
            { error: 'Failed to fetch audits' },
            { status: 500 }
        );
    }
});
