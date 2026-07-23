import { OutreachEmailStatus, OutreachEventType, OutreachLeadStage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { incrementDomainCounter } from '@/lib/outreach/sprint2/domainRotation';

const PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a4UAAAAASUVORK5CYII=';
const PIXEL_BUFFER = Buffer.from(PIXEL_BASE64, 'base64');

interface RouteParams {
    params: Promise<{ emailId: string }>;
}

function pixelResponse(): Response {
    return new Response(PIXEL_BUFFER, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store, max-age=0',
        },
    });
}

export async function GET(req: Request, { params }: RouteParams) {
    const { emailId } = await params;
    const normalizedEmailId = emailId.replace(/\.png$/i, '');

    try {
        const email = await prisma.outreachEmail.findUnique({
            where: { id: normalizedEmailId },
            select: {
                id: true,
                tenantId: true,
                leadId: true,
                domainId: true,
                status: true,
                openedAt: true,
            },
        });

        if (!email) return pixelResponse();

        const userAgent = req.headers.get('user-agent');
        const now = new Date();
        const firstOpen = email.openedAt === null;

        const updates: any[] = [
            prisma.outreachEmail.update({
                where: { id: email.id },
                data: {
                    openedAt: email.openedAt ?? now,
                    status: (email.status === OutreachEmailStatus.SENT || email.status === OutreachEmailStatus.PENDING)
                        ? OutreachEmailStatus.OPENED
                        : email.status,
                },
            }),
            prisma.outreachEmailEvent.create({
                data: {
                    tenantId: email.tenantId,
                    leadId: email.leadId,
                    emailId: email.id,
                    type: OutreachEventType.EMAIL_OPEN,
                    metadata: { userAgent, firstOpen },
                },
            }),
        ];

        if (firstOpen) {
            updates.push(
                prisma.prospectLead.update({
                    where: { id: email.leadId },
                    data: {
                        outreachOpenCount: { increment: 1 },
                        outreachStage: OutreachLeadStage.OPENED,
                        outreachNextActionAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                    },
                }),
            );
        }

        await prisma.$transaction(updates);

        if (firstOpen && email.domainId) {
            await incrementDomainCounter(email.domainId, email.tenantId, 'openCount');
        }
    } catch {
        // Swallow errors to avoid exposing tracking failures.
    }

    return pixelResponse();
}
