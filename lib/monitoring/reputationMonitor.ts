
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { runGbpDeepModule } from '../modules/gbpDeep';

/**
 * Reputation Monitor
 * Polls Google Business Profile for new reviews and updates snapshots.
 */
export async function monitorReputation() {
    logger.info('[ReputationMonitor] Starting monitoring job');

    // Find audits with monitoring enabled (or all recent ones)
    // For MVP, we'll check audits updated in last 30 days
    const audits = await prisma.audit.findMany({
        where: {
            status: 'COMPLETED',
            updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        take: 50 // Batch
    });

    for (const audit of audits) {
        try {
            logger.info({ auditId: audit.id, business: audit.businessName }, '[ReputationMonitor] Checking audit');

            // Re-run GBP Deep module (lightweight mode ideally, but we'll use full for now)
            // We need to ensure we don't charge tenant again if not intended.
            // For now, internal system check.

            // Note: In real system, we'd store Place ID separate from "input".
            // Extract Place ID from previous findings if possible, or re-search.
            // Using basic input.

            // Limitation: We need the website URL and original inputs.
            if (!audit.businessCity || !audit.businessUrl) continue;

            const result = await runGbpDeepModule({
                businessName: audit.businessName,
                city: audit.businessCity,
                websiteUrl: audit.businessUrl
            });

            // Extract rating and count
            // finding with type 'REPUTATION' or similar? 
            // The module returns findings. We need to parse them or module should return raw data.
            // unique module result structure? 
            // Let's assume finding with id 'gbp-reputation-score' or similar contains metrics.

            const reputationFinding = result.findings.find(f => f.module === 'gbp' || f.module === 'reputation');

            if (reputationFinding && reputationFinding.metrics) {
                const metrics = reputationFinding.metrics as any;
                if (metrics.rating && metrics.reviewCount) {
                    await prisma.reviewSnapshot.create({
                        data: {
                            auditId: audit.id,
                            rating: metrics.rating,
                            count: metrics.reviewCount,
                            source: 'google',
                            date: new Date()
                        }
                    });
                    logger.info({ auditId: audit.id }, '[ReputationMonitor] Snapshot saved');
                }
            }

        } catch (error) {
            logger.error({ auditId: audit.id, error }, '[ReputationMonitor] Failed to monitor audit');
        }
    }
}
