/**
 * FIX-03: CRM status transition — moves a ProspectLead from any status to CLIENT
 * when their proposal is accepted and payment is received.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Transitions the ProspectLead linked to a proposal to CLIENT status.
 * Should be called after checkout.session.completed webhook fires.
 */
export async function transitionToClient(proposalId: string): Promise<void> {
    // Fetch the proposal to get its audit, then find the linked lead
    const proposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: { auditId: true, tenantId: true, tierChosen: true },
    });

    if (!proposal) {
        logger.warn({ proposalId }, 'transitionToClient: proposal not found');
        return;
    }

    // Find the ProspectLead that references this audit or proposal
    const lead = await prisma.prospectLead.findFirst({
        where: {
            tenantId: proposal.tenantId ?? undefined,
            OR: [
                { auditId: proposal.auditId },
                { proposalId },
            ],
        },
    });

    if (!lead) {
        logger.warn({ proposalId, auditId: proposal.auditId }, 'transitionToClient: no linked ProspectLead found');
        return;
    }

    if (lead.status === 'CLIENT') {
        logger.info({ leadId: lead.id }, 'transitionToClient: already CLIENT, skipping');
        return;
    }

    const previousStatus = lead.status;

    await prisma.prospectLead.update({
        where: { id: lead.id },
        data: {
            status: 'CLIENT' as any,
            pipelineStatus: 'client',
            lastEngagementAt: new Date(),
        },
    });

    // Record the state transition for audit trail
    await prisma.prospectStateTransition.create({
        data: {
            tenantId: lead.tenantId,
            leadId: lead.id,
            fromStatus: previousStatus,
            toStatus: 'CLIENT',
            stage: 'checkout',
            metadata: { proposalId, tierChosen: proposal.tierChosen },
        },
    });

    logger.info(
        { leadId: lead.id, previousStatus, proposalId },
        'CRM: Lead successfully transitioned to CLIENT'
    );
}
