import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
    params: Promise<{ id: string }>;
}

/**
 * PATCH /api/proposal/[id]/status
 * Update proposal status (draft → ready → sent → viewed → accepted/rejected)
 */
export async function PATCH(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        // Validate status
        const validStatuses = ['draft', 'ready', 'sent', 'viewed', 'accepted', 'rejected'];
        if (!status || !validStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        // Find proposal
        const proposal = await prisma.proposal.findUnique({
            where: { id },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        // Update status and set timestamp if transitioning to 'sent'
        const updateData: any = { status };
        if (status === 'sent' && !proposal.sentAt) {
            updateData.sentAt = new Date();
        }

        const updatedProposal = await prisma.proposal.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            proposal: {
                id: updatedProposal.id,
                status: updatedProposal.status,
                sentAt: updatedProposal.sentAt,
            },
        });
    } catch (error) {
        console.error('[Proposal Status Update] Error:', error);
        return NextResponse.json(
            { error: 'Failed to update proposal status' },
            { status: 500 }
        );
    }
}
