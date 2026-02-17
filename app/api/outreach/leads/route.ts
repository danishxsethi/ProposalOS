import { NextResponse } from 'next/server';
import { Prisma, ProspectLeadStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { normalizeVertical } from '@/lib/outreach/sprint2/config';

function parseStatusList(statusParam: string | null): ProspectLeadStatus[] | undefined {
    if (!statusParam) return undefined;
    const raw = statusParam.split(',').map((item) => item.trim()).filter(Boolean);
    if (raw.length === 0) return undefined;

    const allowed = new Set(Object.values(ProspectLeadStatus));
    const statuses = raw.filter((item): item is ProspectLeadStatus => allowed.has(item as ProspectLeadStatus));
    return statuses.length > 0 ? statuses : undefined;
}

export const GET = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const city = searchParams.get('city');
    const verticalParam = searchParams.get('vertical');
    const statusParam = searchParams.get('status');
    const minPainScore = searchParams.get('minPainScore');

    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));
    const skip = (page - 1) * limit;

    const where: Prisma.ProspectLeadWhereInput = { tenantId };
    if (city) where.city = city;
    if (verticalParam) where.vertical = normalizeVertical(verticalParam);

    const statuses = parseStatusList(statusParam);
    if (statuses && statuses.length > 0) {
        where.status = { in: statuses };
    }

    const minPain = minPainScore ? Number(minPainScore) : null;
    if (typeof minPain === 'number' && Number.isFinite(minPain)) {
        where.painScore = { gte: Math.max(0, Math.min(100, minPain)) };
    }

    const [items, total] = await Promise.all([
        prisma.prospectLead.findMany({
            where,
            skip,
            take: limit,
            orderBy: [{ painScore: 'desc' }, { updatedAt: 'desc' }],
            select: {
                id: true,
                businessName: true,
                city: true,
                state: true,
                vertical: true,
                category: true,
                website: true,
                phone: true,
                status: true,
                painScore: true,
                painThreshold: true,
                topFindings: true,
                auditSummarySnippet: true,
                decisionMakerName: true,
                decisionMakerTitle: true,
                decisionMakerEmail: true,
                decisionMakerLinkedin: true,
                decisionMakerEmailStatus: true,
                estimatedCostCents: true,
                outreachStage: true,
                outreachAttempts: true,
                outreachOpenCount: true,
                outreachClickCount: true,
                outreachReplyCount: true,
                outreachLastContactedAt: true,
                outreachNextActionAt: true,
                outreachDropReason: true,
                scorecardToken: true,
                createdAt: true,
                updatedAt: true,
            },
        }),
        prisma.prospectLead.count({ where }),
    ]);

    const statusValues = Object.values(ProspectLeadStatus);
    const statusCountsEntries = await Promise.all(
        statusValues.map(async (status) => {
            const count = await prisma.prospectLead.count({
                where: { tenantId, status },
            });
            return [status, count] as const;
        }),
    );

    const statusCounts = statusCountsEntries.reduce<Record<string, number>>((acc, [status, count]) => {
        acc[status] = count;
        return acc;
    }, {});

    return NextResponse.json({
        leads: items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        statusCounts,
    });
});
