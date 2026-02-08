
import { prisma } from '@/lib/prisma';
import { addDays } from 'date-fns';

type FollowUpType = 'email' | 'reminder';

export class FollowUpScheduler {

    // Called when proposal is SENT
    static async onProposalSent(proposalId: string, tenantId: string, businessName: string) {
        // Schedule Sequence

        // 1. Follow-up 1: 3 days later
        await this.scheduleFollowUp({
            proposalId, tenantId, step: 1, daysDelay: 3,
            subject: `Quick check-in regarding ${businessName}'s report`,
            body: `Hi,\n\nI just wanted to check if you had a chance to review the digital performance audit I sent over for ${businessName}.\n\nLet me know if you have any questions!\n\nBest,\n[Your Name]`
        });

        // 2. Follow-up 2: 7 days later
        await this.scheduleFollowUp({
            proposalId, tenantId, step: 2, daysDelay: 7,
            subject: `Your digital assessment for ${businessName}`,
            body: `Hi there,\n\nJust a friendly reminder about the digital assessment for ${businessName}. There are some quick wins in there that could really help with your local visibility.\n\nLink: [Proposal Link]\n\nCheers,\n[Your Name]`
        });

        // 3. Follow-up 3: 14 days later
        await this.scheduleFollowUp({
            proposalId, tenantId, step: 3, daysDelay: 14,
            subject: `Last call: Assessment for ${businessName}`,
            body: `Hi,\n\nI'll stop bugging you after this! Just wanted to make sure you saw the report for ${businessName} before I archive it.\n\nHope it was helpful!\n\nBest,\n[Your Name]`
        });
    }

    // Called when proposal is VIEWED
    static async onProposalViewed(proposalId: string) {
        // 1. Cancel unviewed follow-ups (Steps 1, 2, 3 usually assume not viewed)
        // Actually, logic says "Schedule follow-up 3: ... if not viewed or accepted".
        // Use case: Only cancel if we want to stop pestering "did you see it?". 
        // If they viewed it, we might switch to a different track.
        // User request: "Cancel unviewed follow-ups" -> Cancel existing pending.
        await prisma.proposalFollowUp.updateMany({
            where: { proposalId, status: 'pending' },
            data: { status: 'cancelled' }
        });

        // 2. Schedule "They looked!" reminder for Operator (Immediate)
        // For now, we'll store it as 'reminder' type, maybe handled differently by cron or immediate notification system (if we had one).
        // Let's stick to email for simplicity or assume Cron picks it up quickly.
        // Actually, user said "Schedule: 'They looked! Follow up now' reminder to operator (immediate)".
        // Cron runs every 15 mins, so 'immediate' is relative. 
        // We'll insert a record scheduled for NOW.

        // We need tenantId. Fetch proposal first.
        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId }, include: { audit: true } });
        if (!proposal || !proposal.tenantId) return;

        await prisma.proposalFollowUp.create({
            data: {
                proposalId,
                tenantId: proposal.tenantId,
                type: 'reminder',
                step: 0, // System notification
                status: 'pending',
                scheduledAt: new Date(), // Now
                emailSubject: `🔔 ${proposal.audit.businessName} viewed your proposal!`,
                emailBody: `Good news! The prospect has opened the proposal. Now is a great time to give them a call or send a personal follow-up.`
            }
        });

        // 3. Schedule "Post-view" follow-up: 3 days after viewed (if not accepted)
        await this.scheduleFollowUp({
            proposalId,
            tenantId: proposal.tenantId,
            step: 4,
            daysDelay: 3,
            subject: `Any questions about the report for ${proposal.audit.businessName}?`,
            body: `Hi,\n\nI saw you had a chance to check out the report. Did anything stand out to you?\n\nI'd be happy to walk through the findings on a quick call.\n\nBest,\n[Your Name]`,
            baseDate: new Date()
        });
    }

    // Called when proposal is ACCEPTED
    static async onProposalAccepted(proposalId: string) {
        // Cancel ALL pending
        await prisma.proposalFollowUp.updateMany({
            where: { proposalId, status: 'pending' },
            data: { status: 'cancelled' }
        });
    }

    private static async scheduleFollowUp({
        proposalId, tenantId, step, daysDelay, subject, body, baseDate
    }: {
        proposalId: string, tenantId: string, step: number, daysDelay: number, subject: string, body: string, baseDate?: Date
    }) {
        const scheduledAt = addDays(baseDate || new Date(), daysDelay);

        await prisma.proposalFollowUp.create({
            data: {
                proposalId,
                tenantId,
                type: 'email',
                step,
                status: 'pending',
                emailSubject: subject,
                emailBody: body,
                scheduledAt
            }
        });
    }
}
