import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { sendProposalEmail } from '@/lib/outreach/emailSender';
import { logger } from '@/lib/logger';

const RESEND_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

interface Params {
    params: { id: string };
}

/**
 * POST /api/proposal/[id]/resend
 * Resend proposal email to the prospect (client).
 * Requires tenant auth. Rate limited: cannot resend within 5 minutes of last send.
 */
export const POST = withAuth(async (request: Request, { params }: Params) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Get proposal with audit and tenant check
        const proposal = await prisma.proposal.findFirst({
            where: {
                id,
                audit: { tenantId },
            },
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

        // Require prospect email
        const prospectEmail = proposal.prospectEmail;
        if (!prospectEmail) {
            return NextResponse.json(
                { error: 'No recipient email on record for this proposal' },
                { status: 400 }
            );
        }

        // 5-minute cooldown
        const now = Date.now();
        const lastSent = proposal.sentAt.getTime();
        if (now - lastSent < RESEND_COOLDOWN_MS) {
            const retryAfterSec = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
            return NextResponse.json(
                {
                    error: 'Please wait before resending',
                    message: `Resend is rate limited. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
                },
                { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
            );
        }

        const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/proposal/${proposal.webLinkToken}`;

        // Use last outreach subject/body if available, else default
        const lastOutreach = await prisma.proposalOutreach.findFirst({
            where: { proposalId: id },
            orderBy: { sentAt: 'desc' },
        });

        const subject = lastOutreach?.emailSubject ?? `Your proposal for ${proposal.audit.businessName}`;
        const messageHtml =
            lastOutreach?.emailBody ??
            `<p>Here's your proposal link again:</p><p><a href="${proposalUrl}">View Proposal</a></p>`;

        await sendProposalEmail({
            proposalId: id,
            recipientEmail: prospectEmail,
            subject,
            messageHtml,
            tenantId,
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
