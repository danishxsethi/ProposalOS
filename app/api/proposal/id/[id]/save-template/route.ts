import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import type { Prisma } from '@prisma/client';

interface Params {
    params: { id: string };
}

/**
 * POST /api/proposal/[id]/save-template
 * Save current proposal as a reusable template
 */
export const POST = withAuth(async (req: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const body = await req.json();
        const { name, description, industry } = body;

        // Get proposal
        const proposal = await prisma.proposal.findUnique({
            where: { id },
            include: { audit: true },
        });

        if (!proposal) {
            return NextResponse.json(
                { error: 'Proposal not found' },
                { status: 404 }
            );
        }

        // Create template from proposal (cast Json fields for Prisma compatibility)
        const tierSettingsVal =
            (proposal.tierEssentials != null || proposal.tierGrowth != null || proposal.tierPremium != null)
                ? { essentials: proposal.tierEssentials ?? {}, growth: proposal.tierGrowth ?? {}, premium: proposal.tierPremium ?? {} }
                : undefined;

        const template = await prisma.proposalTemplate.create({
            data: {
                name,
                description,
                industry: industry || proposal.audit.businessIndustry,
                assumptions: proposal.assumptions,
                disclaimers: proposal.disclaimers,
                nextSteps: proposal.nextSteps,
                pricing: (proposal.pricing ?? {}) as Prisma.InputJsonValue,
                tierSettings: tierSettingsVal as Prisma.InputJsonValue | undefined,
            },
        });

        return NextResponse.json({ template }, { status: 201 });
    } catch (error) {
        console.error('[API] Error saving template:', error);
        return NextResponse.json(
            { error: 'Failed to save template' },
            { status: 500 }
        );
    }
});
