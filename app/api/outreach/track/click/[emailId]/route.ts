import { OutreachEmailStatus, OutreachEventType, OutreachLeadStage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { incrementDomainCounter } from '@/lib/outreach/sprint2/domainRotation';
import { ensureBaseUrl } from '@/lib/outreach/sprint2/scorecard';

interface RouteParams {
    params: Promise<{ emailId: string }>;
}

function safeTarget(urlValue: string | null): string {
    if (!urlValue) return ensureBaseUrl();
    try {
        const parsed = new URL(urlValue);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
        return ensureBaseUrl();
    } catch {
        return ensureBaseUrl();
    }
}

export async function GET(req: Request, { params }: RouteParams) {
    const { emailId } = await params;
    const url = new URL(req.url);
    const target = safeTarget(url.searchParams.get('url'));
    const kind = url.searchParams.get('kind') || 'link';

    try {
        const email = await prisma.outreachEmail.findUnique({
            where: { id: emailId },
            select: {
                id: true,
                tenantId: true,
                leadId: true,
                domainId: true,
                status: true,
                clickedAt: true,
            },
        });

        if (email) {
            const now = new Date();
            const firstClick = email.clickedAt === null;
            const userAgent = req.headers.get('user-agent');

            const updates: any[] = [
                prisma.outreachEmail.update({
                    where: { id: email.id },
                    data: {
                        clickedAt: email.clickedAt ?? now,
                        status: (
                            email.status === OutreachEmailStatus.SENT ||
                            email.status === OutreachEmailStatus.OPENED ||
                            email.status === OutreachEmailStatus.PENDING
                        )
                            ? OutreachEmailStatus.CLICKED
                            : email.status,
                    },
                }),
                prisma.outreachEmailEvent.create({
                    data: {
                        tenantId: email.tenantId,
                        leadId: email.leadId,
                        emailId: email.id,
                        type: OutreachEventType.EMAIL_CLICK,
                        metadata: {
                            target,
                            kind,
                            userAgent,
                            firstClick,
                        },
                    },
                }),
            ];

            if (firstClick) {
                updates.push(
                    prisma.prospectLead.update({
                        where: { id: email.leadId },
                        data: {
                            outreachClickCount: { increment: 1 },
                            outreachStage: OutreachLeadStage.CLICKED,
                            outreachNextActionAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
                        },
                    }),
                );
            }

            await prisma.$transaction(updates);

            if (firstClick && email.domainId) {
                await incrementDomainCounter(email.domainId, email.tenantId, 'clickCount');
            }
        }
    } catch {
        // swallow failures and still redirect
    }

    return Response.redirect(target, 302);
}
