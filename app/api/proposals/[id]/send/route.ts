
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { FollowUpScheduler } from '@/lib/followup/scheduler';

export const POST = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const prisma = createScopedPrisma(tenantId);

        const { email } = await req.json();

        // Update Proposal
        const proposal = await prisma.proposal.update({
            where: { id: params.id },
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
