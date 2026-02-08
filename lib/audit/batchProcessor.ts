
import { runAudit } from '@/lib/audit/runner';
import { generateProposal } from '@/lib/proposal/runner';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { sendBatchComplete } from '@/lib/notifications/email';
import { sendWebhook } from '@/lib/notifications/webhook';

export async function processBatch(batchId: string, auditIds: string[]) {
    logger.info({ batchId, auditCount: auditIds.length }, 'Starting batch processing');

    // Process sequentially as requested
    for (const auditId of auditIds) {
        try {
            logger.info({ batchId, auditId }, 'Processing audit in batch');

            // 1. Run Audit
            await runAudit(auditId);

            // 2. Generate Proposal (only if audit succeeded)
            const audit = await prisma.audit.findUnique({
                where: { id: auditId },
                select: { status: true }
            });

            if (audit?.status === 'COMPLETE' || audit?.status === 'PARTIAL') {
                await generateProposal(auditId);
            } else {
                logger.warn({ batchId, auditId, status: audit?.status }, 'Skipping proposal generation due to audit failure');
            }

        } catch (error) {
            // Log and continue to next audit in batch
            logger.error({ batchId, auditId, error }, 'Error processing audit in batch');

            // Ensure status is failed
            await prisma.audit.update({
                where: { id: auditId },
                data: { status: 'FAILED' }
            }).catch(() => { });
        }
    }

    logger.info({ batchId }, 'Batch processing complete');

    // Calculate stats for notification
    const total = auditIds.length;
    let completed = 0;
    let failed = 0;

    const finalAudits = await prisma.audit.findMany({
        where: { id: { in: auditIds } },
        select: { status: true }
    });

    finalAudits.forEach(a => {
        if (a.status === 'COMPLETE' || a.status === 'PARTIAL') completed++;
        else failed++;
    });

    sendBatchComplete({
        batchId,
        total,
        completed,
        failed
    }).catch(console.error);

    sendWebhook('batch.complete', {
        batchId,
        total,
        completed,
        failed
    });
}
