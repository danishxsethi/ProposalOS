/**
 * lib/retention/upsellTrigger.ts
 *
 * Task 3: Auto-generate an upsell proposal when a competitor shows significant
 * improvement signals in a scheduled re-audit.
 *
 * Called from: app/api/cron/scheduled-audits/route.ts after each audit completes.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface CompetitorSignal {
    /** Unique competitor identifier (URL or name) */
    name: string;
    reviewCount?: number;
    rating?: number;
    websiteHash?: string;
}

interface AuditCompetitorSnapshot {
    competitors?: CompetitorSignal[];
}

/**
 * Compare current audit's competitor evidence with the previous audit's.
 * Returns true if any competitor gained ≥20 reviews OR changed website.
 */
export async function detectCompetitorImprovement(
    previousAuditId: string,
    currentAuditId: string
): Promise<{ triggered: boolean; reason: string }> {
    try {
        const [prevSnap, currSnap] = await Promise.all([
            prisma.evidenceSnapshot.findFirst({
                where: { auditId: previousAuditId, module: 'competitor' },
            }),
            prisma.evidenceSnapshot.findFirst({
                where: { auditId: currentAuditId, module: 'competitor' },
            }),
        ]);

        if (!prevSnap || !currSnap) {
            return { triggered: false, reason: 'No competitor snapshots available' };
        }

        const prev = (prevSnap.rawResponse as AuditCompetitorSnapshot)?.competitors ?? [];
        const curr = (currSnap.rawResponse as AuditCompetitorSnapshot)?.competitors ?? [];

        for (const currComp of curr) {
            const prevComp = prev.find(p => p.name === currComp.name);
            if (!prevComp) continue;

            // Signal 1: Competitor gained ≥20 reviews
            const reviewDelta = (currComp.reviewCount ?? 0) - (prevComp.reviewCount ?? 0);
            if (reviewDelta >= 20) {
                return {
                    triggered: true,
                    reason: `Competitor "${currComp.name}" gained ${reviewDelta} new reviews`,
                };
            }

            // Signal 2: Competitor changed website (hash differs)
            if (
                currComp.websiteHash &&
                prevComp.websiteHash &&
                currComp.websiteHash !== prevComp.websiteHash
            ) {
                return {
                    triggered: true,
                    reason: `Competitor "${currComp.name}" launched a new website`,
                };
            }
        }

        return { triggered: false, reason: 'No significant competitor changes detected' };
    } catch (error) {
        logger.error({ err: error }, '[UpsellTrigger] detectCompetitorImprovement failed');
        return { triggered: false, reason: 'Error during comparison' };
    }
}

/**
 * Create an upsell Proposal linked to the current audit, routed through
 * the standard proposal generation with type: 'upsell'.
 */
export async function triggerUpsellProposal(
    tenantId: string,
    auditId: string,
    reason: string
): Promise<{ proposalId: string } | null> {
    try {
        const audit = await prisma.audit.findUnique({ where: { id: auditId } });
        if (!audit) return null;

        // Create a fresh proposal record tagged as upsell
        const proposal = await prisma.proposal.create({
            data: {
                auditId,
                tenantId,
                status: 'DRAFT',
                executiveSummary: `Upsell opportunity flagged by automated re-audit: ${reason}`,
                // Signal the proposal pipeline to use 'upsell' mode via metadata in nextSteps
                nextSteps: [`[upsell:true] ${reason}`],
            },
        });

        logger.info(
            { proposalId: proposal.id, auditId, tenantId, reason },
            '[UpsellTrigger] Upsell proposal created'
        );

        return { proposalId: proposal.id };
    } catch (error) {
        logger.error({ err: error, auditId, tenantId }, '[UpsellTrigger] Failed to create upsell proposal');
        return null;
    }
}
