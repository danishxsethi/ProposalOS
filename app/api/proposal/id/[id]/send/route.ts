import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { sendProposalEmail } from '@/lib/outreach/emailSender';
import { getTenantId } from '@/lib/tenant/context';

export const POST = withAuth(async (
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) => {
    try {
        const { id: proposalId } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const body = await req.json();

        const { recipientEmail, subject, message, scheduledAt } = body;

        if (!recipientEmail || !subject || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate Proposal Ownership
        const proposal = await prisma.proposal.findFirst({
            where: {
                id: proposalId,
                audit: { tenantId }
            }
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        if (scheduledAt) {
            // Schedule it
            // Logic for scheduling using scheduler lib (omitted for now as per minimal viable)
            // Or create a ProposalFollowUp with 'pending' status?
            // User requested "Create lib/outreach/sequences.ts" later.
            // For now, let's just support IMMEDIATE send.
            return NextResponse.json({ error: 'Scheduling not yet supported in this endpoint' }, { status: 501 });
        }

        // Send Immediately
        await sendProposalEmail({
            proposalId,
            recipientEmail,
            subject,
            messageHtml: message,
            tenantId: tenantId || undefined
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Send Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
});
