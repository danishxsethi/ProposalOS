import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
    params: Promise<{ token: string }>;
}

/**
 * PATCH /api/proposal/[token]/status  
 * Update proposal status (draft → ready → sent → viewed → accepted/rejected)
 */
export async function PATCH(request: Request, { params }: Params) {
    try {
        const { token } = await params;
        const body = await request.json();
        const { status } = body;

        // Normalize status to uppercase
        const normalizedStatus = status?.toUpperCase();

        // Validate status against Prisma enum
        const validStatuses = ['DRAFT', 'READY', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'];
        if (!normalizedStatus || !validStatuses.includes(normalizedStatus)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        // Find proposal by token
        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        // Update status and set timestamp if transitioning to 'SENT'
        const updateData: any = { status: normalizedStatus };
        if (normalizedStatus === 'SENT' && !proposal.sentAt) {
            updateData.sentAt = new Date();
        }

        const updatedProposal = await prisma.proposal.update({
            where: { id: proposal.id },
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
