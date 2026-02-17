import { NextResponse } from 'next/server';
import { OutreachEventType, OutreachLeadStage, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

interface RouteParams {
    params: Promise<{ token: string }>;
}

function toNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
}

export async function POST(req: Request, { params }: RouteParams) {
    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

    const event = typeof payload.event === 'string' ? payload.event : '';
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
    const seconds = toNumber(payload.seconds);
    const label = typeof payload.label === 'string' ? payload.label : null;

    const lead = await prisma.prospectLead.findUnique({
        where: { scorecardToken: token },
        select: {
            id: true,
            tenantId: true,
            scorecardFirstViewedAt: true,
            scorecardTotalViewSeconds: true,
            outreachStage: true,
        },
    });

    if (!lead) {
        return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    const now = new Date();
    const leadUpdate: Record<string, unknown> = {
        scorecardLastViewedAt: now,
    };
    if (!lead.scorecardFirstViewedAt) {
        leadUpdate.scorecardFirstViewedAt = now;
    }
    if (typeof seconds === 'number' && seconds >= 0) {
        leadUpdate.scorecardTotalViewSeconds = Math.max(lead.scorecardTotalViewSeconds, Math.round(seconds));
    }

    const eventsToCreate: Array<{
        type: OutreachEventType;
        metadata: Record<string, unknown>;
    }> = [];

    if (event === 'view') {
        eventsToCreate.push({
            type: OutreachEventType.SCORECARD_VIEW,
            metadata: { sessionId },
        });
    } else if (event === 'cta') {
        eventsToCreate.push({
            type: OutreachEventType.SCORECARD_CLICK,
            metadata: { sessionId, label },
        });
    } else if (event === 'dwell') {
        eventsToCreate.push({
            type: OutreachEventType.SCORECARD_DWELL_2M,
            metadata: { sessionId, seconds },
        });
        if (lead.outreachStage !== OutreachLeadStage.REPLIED && lead.outreachStage !== OutreachLeadStage.DROPPED) {
            leadUpdate.outreachStage = OutreachLeadStage.HOT;
            leadUpdate.outreachNextActionAt = now;
        }
    }

    await prisma.prospectLead.update({
        where: { id: lead.id },
        data: leadUpdate,
    });

    for (const item of eventsToCreate) {
        await prisma.outreachEmailEvent.create({
            data: {
                tenantId: lead.tenantId,
                leadId: lead.id,
                type: item.type,
                metadata: item.metadata as Prisma.InputJsonValue,
            },
        });
    }

    return NextResponse.json({ success: true });
}
