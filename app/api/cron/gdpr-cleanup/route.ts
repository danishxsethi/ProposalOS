import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Retention Period (e.g. 90 days for dead leads)
const GDPR_RETENTION_DAYS = 90;

export async function GET(request: Request) {
    if (
        process.env.NODE_ENV === 'production' &&
        request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - GDPR_RETENTION_DAYS);

        // Find leads that are either DROPPED or DISQUALIFIED and older than 90 days that haven't been anonymized yet
        const staleLeads = await prisma.prospectLead.findMany({
            where: {
                status: {
                    in: ['DISQUALIFIED']
                },
                updatedAt: { lte: thresholdDate },
                anonymizedAt: null,
            },
            select: { id: true }
        });

        const staleDroppedLeads = await prisma.prospectLead.findMany({
            where: {
                outreachStage: 'DROPPED',
                outreachDroppedAt: { lte: thresholdDate },
                anonymizedAt: null,
            },
            select: { id: true }
        });

        const leadIdsToAnonymize = [
            ...staleLeads.map(l => l.id),
            ...staleDroppedLeads.map(l => l.id)
        ];

        if (leadIdsToAnonymize.length > 0) {
            // P1: Anonymize the PII to comply with GDPR / Data Retention policies
            await prisma.prospectLead.updateMany({
                where: {
                    id: { in: leadIdsToAnonymize }
                },
                data: {
                    decisionMakerName: 'Anonymized',
                    decisionMakerEmail: 'anonymized@gdpr.local',
                    decisionMakerLinkedin: null,
                    phone: null,
                    anonymizedAt: new Date()
                }
            });

            // Also anonymize any outreach emails sent to them
            await prisma.outreachEmail.updateMany({
                where: {
                    leadId: { in: leadIdsToAnonymize }
                },
                data: {
                    body: '[REDACTED FOR GDPR COMPLIANCE]',
                    subject: '[REDACTED FOR GDPR COMPLIANCE]'
                }
            });
            
            logger.info({
                event: 'cron.gdpr_cleanup',
                anonymizedCount: leadIdsToAnonymize.length
            }, `Anonymized ${leadIdsToAnonymize.length} stale leads for GDPR compliance`);
        }

        return NextResponse.json({
            success: true,
            anonymizedCount: leadIdsToAnonymize.length
        });
    } catch (error) {
        logger.error({ error }, 'Failed to run GDPR cleanup cron');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
