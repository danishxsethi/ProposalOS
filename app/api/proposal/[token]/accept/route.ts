import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FollowUpScheduler } from '@/lib/followup/scheduler';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const { tier, name, email, phone, message } = await req.json();

        // 1. Find Proposal by Token
        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
            include: { audit: true }
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        // 2. Create Acceptance Record
        // Check if already accepted? 
        if (proposal.status === 'ACCEPTED') {
            return NextResponse.json({ error: 'Proposal already accepted' }, { status: 400 });
        }

        // Get IP from headers if possible (for audit)
        const ip = req.headers.get('x-forwarded-for') || 'unknown';

        await prisma.$transaction(async (tx) => {
            // Create Acceptance
            await tx.proposalAcceptance.create({
                data: {
                    proposalId: proposal.id,
                    tier,
                    contactName: name,
                    contactEmail: email,
                    contactPhone: phone,
                    message,
                    ipAddress: ip
                }
            });

            // Update Proposal Status
            // Also set outcome = WON
            await tx.proposal.update({
                where: { id: proposal.id },
                data: {
                    status: 'ACCEPTED',
                    outcome: 'WON',
                    closedAt: new Date(),
                    // We could store acceptedTier in JSON or add a field, but we have the relation now.
                }
            });
        });

        // 3. Trigger Post-Acceptance Actions

        // Cancel Follow-ups
        await FollowUpScheduler.onProposalAccepted(proposal.id);

        // Notifications (Mock for now, or use Resend if keys available)
        // Notify Operator
        // Notify Client

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Accept Proposal Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
