import { NextResponse } from 'next/server';
import { OutreachEmailStatus, OutreachEventType, OutreachLeadStage } from '@prisma/client';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { prisma } from '@/lib/prisma';
import { incrementDomainCounter } from '@/lib/outreach/sprint2/domainRotation';

export const POST = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

    const leadId = typeof payload.leadId === 'string' ? payload.leadId : null;
    const emailId = typeof payload.emailId === 'string' ? payload.emailId : null;
    const source = typeof payload.source === 'string' ? payload.source : 'manual';

    if (!leadId) {
        return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const lead = await prisma.prospectLead.findFirst({
        where: { id: leadId, tenantId },
        select: { id: true, tenantId: true },
    });

    if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const email = emailId
        ? await prisma.outreachEmail.findFirst({
            where: { id: emailId, leadId, tenantId },
            select: { id: true, domainId: true },
        })
        : null;

    await prisma.$transaction([
        prisma.prospectLead.update({
            where: { id: leadId },
            data: {
                outreachReplyCount: { increment: 1 },
                outreachStage: OutreachLeadStage.REPLIED,
                outreachNextActionAt: null,
            },
        }),
        prisma.outreachEmailEvent.create({
            data: {
                tenantId,
                leadId,
                emailId: email?.id ?? null,
                type: OutreachEventType.REPLY_RECEIVED,
                metadata: { source },
            },
        }),
        ...(email
            ? [prisma.outreachEmail.update({
                where: { id: email.id },
                data: {
                    repliedAt: new Date(),
                    status: OutreachEmailStatus.REPLIED,
                },
            })]
            : []),
    ]);

    if (email?.domainId) {
        await incrementDomainCounter(email.domainId, tenantId, 'replyCount');
    }

    return NextResponse.json({ success: true });
});

