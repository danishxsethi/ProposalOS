/**
 * FIX-09: Monthly re-audit cron endpoint.
 * Runs a fresh audit for every active client and generates delta + win reports.
 *
 * GET/POST /api/cron/monthly-reaudit
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAudit } from '@/lib/audit/runner';
import { generateDeltaReport } from '@/lib/retention/deltaReport';
import { sendWinReport } from '@/lib/retention/winReport';
import { generateUpsellProposal, sendUpsellEmail } from '@/lib/retention/upsellGenerator';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
    // Auth guard
    const authHeader = req.headers.get('Authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const results: Array<{ leadId: string; status: string; message?: string }> = [];

    // Find all active clients with a linked proposal and an audit
    const clients = await prisma.prospectLead.findMany({
        where: {
            status: 'CLIENT' as any,
            auditId: { not: null },
        },
        select: {
            id: true,
            tenantId: true,
            auditId: true,
            proposalId: true,
            businessName: true,
            city: true,
            website: true,
            decisionMakerEmail: true,
        },
    });

    logger.info({ clientCount: clients.length }, 'Monthly re-audit: starting batch');

    for (const client of clients) {
        try {
            // 1. Create a new audit record
            const newAudit = await prisma.audit.create({
                data: {
                    businessName: client.businessName,
                    businessCity: client.city ?? undefined,
                    businessUrl: client.website ?? undefined,
                    tenantId: client.tenantId,
                    status: 'QUEUED',
                },
            });

            // 2. Run the audit
            await runAudit(newAudit.id);

            // 3. Generate delta report comparing to the previous audit
            const deltaReport = await generateDeltaReport(client.auditId!, newAudit.id);

            // 4. Update the client's auditId to the new one
            await prisma.prospectLead.update({
                where: { id: client.id },
                data: { auditId: newAudit.id },
            });

            // 5. Send win report if there are fixes and we have an email
            if (client.decisionMakerEmail) {
                const dashboardUrl = `${appUrl}/client/audit/${newAudit.id}`;
                await sendWinReport(deltaReport, client.decisionMakerEmail, client.tenantId, dashboardUrl);
            }

            // 6. Generate and send Upsell Proposal for new PAINKILLER issues
            const newPainkillers = deltaReport.findings.filter(
                f => f.trend === 'NEW' && f.type === 'PAINKILLER'
            );

            if (newPainkillers.length > 0 && client.decisionMakerEmail) {
                const upsellProposal = await generateUpsellProposal(
                    client.businessName,
                    newPainkillers,
                    'general' // We can infer industry later if needed, default to general
                );

                if (upsellProposal) {
                    await sendUpsellEmail(
                        upsellProposal,
                        client.decisionMakerEmail,
                        client.tenantId
                    );
                    logger.info({ leadId: client.id, newPainkillers: upsellProposal.newPainkillers }, 'Generated and sent Upsell Proposal');
                }
            }

            results.push({
                leadId: client.id,
                status: 'success',
                message: `Re-audited: ${deltaReport.fixedCount} fixed, ${deltaReport.newCount} new`,
            });
        } catch (err: any) {
            logger.error({ leadId: client.id, err: err?.message }, 'Monthly re-audit failed for client');
            results.push({ leadId: client.id, status: 'failed', message: err?.message });
        }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    logger.info({ total: clients.length, success: successCount }, 'Monthly re-audit batch complete');

    return NextResponse.json({ processed: clients.length, success: successCount, results });
}

// Also accept GET for easy manual triggering from Cloud Scheduler
export const GET = POST;
