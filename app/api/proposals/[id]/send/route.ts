
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { FollowUpScheduler } from '@/lib/followup/scheduler';

export const POST = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const prisma = createScopedPrisma(tenantId);

        const { email } = await req.json();

        // Check ownership first
        const existingProposal = await prisma.proposal.findFirst({
            where: { id: id, tenantId }
        });

        if (!existingProposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        // Update Proposal
        const proposal = await prisma.proposal.update({
            where: { id: id },
            data: {
                status: 'SENT',
                sentAt: new Date(),
                prospectEmail: email
            },
            include: { audit: true }
        });

        // Trigger Scheduler
        await FollowUpScheduler.onProposalSent(proposal.id, tenantId, proposal.audit.businessName);

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Error' }, { status: 500 });
    }
});
