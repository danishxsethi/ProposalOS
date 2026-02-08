import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { sendProposalReady } from '@/lib/notifications/email';
import { logger } from '@/lib/logger';

interface Params {
    params: { id: string };
}

/**
 * POST /api/proposal/[id]/resend
 * Resend proposal email to client
 */
export const POST = withAuth(async (request: Request, { params }: Params) => {
    try {
        const { id } = await params;

        // Get proposal with audit details
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

        // Only allow resending if proposal has been sent at least once
        if (!proposal.sentAt) {
            return NextResponse.json(
                { error: 'Proposal has not been sent yet' },
                { status: 400 }
            );
        }

        // Resend email
        const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/proposal/${proposal.webLinkToken}`;

        await sendProposalReady(
            proposal.audit.id,
            proposal.audit.businessName,
            proposalUrl
        );

        // Update sentAt timestamp
        await prisma.proposal.update({
            where: { id },
            data: { sentAt: new Date() },
        });

        logger.info(
            {
                event: 'proposal.resent',
                proposalId: proposal.id,
                businessName: proposal.audit.businessName,
            },
            'Proposal email resent'
        );

        return NextResponse.json({
            success: true,
            message: 'Proposal email resent successfully',
            sentAt: new Date().toISOString(),
        });

    } catch (error) {
        logger.error(
            {
                event: 'proposal.resend_failed',
                error: error instanceof Error ? error.message : String(error),
            },
            'Failed to resend proposal'
        );

        return NextResponse.json(
            {
                error: 'Failed to resend proposal',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
});
