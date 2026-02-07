import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
    params: Promise<{ token: string }>;
}

/**
 * GET /api/proposal/[token]
 * Get proposal data by web link token (public endpoint)
 */
export async function GET(request: Request, { params }: Params) {
    try {
        const { token } = await params;

        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
            include: {
                audit: {
                    include: {
                        findings: {
                            where: { excluded: false },
                            orderBy: { impactScore: 'desc' },
                        },
                    },
                },
            },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        return NextResponse.json({
            id: proposal.id,
            businessName: proposal.audit.businessName,
            businessCity: proposal.audit.businessCity,
            businessIndustry: proposal.audit.businessIndustry,
            executiveSummary: proposal.executiveSummary,
            findings: proposal.audit.findings,
            pricing: proposal.pricing,
            tiers: {
                essentials: proposal.tierEssentials,
                growth: proposal.tierGrowth,
                premium: proposal.tierPremium,
            },
            nextSteps: proposal.nextSteps,
            assumptions: proposal.assumptions,
            disclaimers: proposal.disclaimers,
            viewedAt: proposal.viewedAt,
            createdAt: proposal.createdAt,
        });
    } catch (error) {
        console.error('[API] Error fetching proposal:', error);
        return NextResponse.json(
            { error: 'Failed to fetch proposal' },
            { status: 500 }
        );
    }
}

import { withAuth } from '@/lib/middleware/auth';

/**
 * PATCH /api/proposal/[token]
 * Update proposal status (e.g., mark as sent)
 */
export const PATCH = withAuth(async (request: Request, { params }: Params) => {
    try {
        const { token } = await params;
        const body = await request.json();
        const { status } = body;

        // Validate status
        const validStatuses = ['DRAFT', 'READY', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'];
        if (status && !validStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {};
        if (status) {
            updateData.status = status;
            if (status === 'SENT') {
                updateData.sentAt = new Date();
            }
        }

        const proposal = await prisma.proposal.update({
            where: { webLinkToken: token },
            data: updateData,
        });

        return NextResponse.json({
            id: proposal.id,
            status: proposal.status,
            sentAt: proposal.sentAt,
            viewedAt: proposal.viewedAt,
        });
    } catch (error) {
        console.error('[API] Error updating proposal:', error);
        return NextResponse.json(
            { error: 'Failed to update proposal' },
            { status: 500 }
        );
    }
});
