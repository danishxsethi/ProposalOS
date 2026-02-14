import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

interface Params {
    params: { id: string };
}

/**
 * POST /api/proposal/[id]/outcome
 * Update proposal outcome (won/lost/pending)
 */
export const POST = withAuth(async (req: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const body = await req.json();
        const { outcome, dealValue, lostReason, notes } = body;

        if (!outcome || !['WON', 'LOST', 'PENDING'].includes(outcome)) {
            return NextResponse.json(
                { error: 'Valid outcome required (WON, LOST, or PENDING)' },
                { status: 400 }
            );
        }

        const updateData: any = {
            outcome,
            notes,
        };

        if (outcome === 'WON' || outcome === 'LOST') {
            updateData.closedAt = new Date();
        }

        if (outcome === 'WON' && dealValue) {
            updateData.dealValue = dealValue;
        }

        if (outcome === 'LOST' && lostReason) {
            updateData.lostReason = lostReason;
        }

        const proposal = await prisma.proposal.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ proposal });
    } catch (error) {
        console.error('[API] Error updating proposal outcome:', error);
        return NextResponse.json(
            { error: 'Failed to update proposal outcome' },
            { status: 500 }
        );
    }
});
