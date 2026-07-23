/**
 * FIX-29: Churn risk identifier.
 * Scores existing clients as LOW / MEDIUM / HIGH churn risk.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendAlert } from '@/lib/alerts/webhook';

export type ChurnRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ChurnRiskResult {
    leadId: string;
    risk: ChurnRisk;
    signals: string[];
    recommendedAction: string;
}

/**
 * Evaluates churn signals for a CLIENT lead and returns a risk assessment.
 */
export async function calculateChurnRisk(leadId: string): Promise<ChurnRiskResult> {
    const lead = await prisma.prospectLead.findUnique({
        where: { id: leadId },
        select: {
            id: true,
            tenantId: true,
            businessName: true,
            lastEngagementAt: true,
            outreachReplyCount: true,
            status: true,
        },
    });

    if (!lead) throw new Error(`ChurnRisk: lead ${leadId} not found`);

    const signals: string[] = [];
    let riskScore = 0;

    const now = new Date();
    const daysSinceEngagement = lead.lastEngagementAt
        ? Math.floor((now.getTime() - lead.lastEngagementAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

    // Signal: No engagement in 60+ days
    if (daysSinceEngagement >= 60) {
        signals.push(`No engagement in ${daysSinceEngagement} days`);
        riskScore += 3;
    } else if (daysSinceEngagement >= 30) {
        signals.push(`Low engagement — last seen ${daysSinceEngagement} days ago`);
        riskScore += 1;
    }

    // Signal: No replies to outreach
    if (lead.outreachReplyCount === 0) {
        signals.push('Never replied to outreach emails');
        riskScore += 1;
    }

    let risk: ChurnRisk;
    let recommendedAction: string;

    if (riskScore >= 4) {
        risk = 'HIGH';
        recommendedAction = 'Schedule an urgent re-engagement call and offer a service review';
    } else if (riskScore >= 2) {
        risk = 'MEDIUM';
        recommendedAction = 'Send a personalized check-in email with win report highlights';
    } else {
        risk = 'LOW';
        recommendedAction = 'Continue normal monthly reporting cadence';
    }

    if (risk === 'HIGH') {
        await sendAlert({
            title: '⚠️ High Churn Risk Client',
            message: `${lead.businessName} is showing high churn signals.\nSignals: ${signals.join(', ')}`,
            severity: 'warning',
            pipeline: 'Client Retention & Upsell',
            tenantId: lead.tenantId,
            fields: { 'Lead ID': leadId, 'Risk': risk, 'Days Since Engagement': daysSinceEngagement },
        });
    }

    logger.info({ leadId, risk, riskScore, signals }, 'Churn risk calculated');

    return { leadId, risk, signals, recommendedAction };
}

/**
 * Runs churn risk assessment for all active CLIENT leads in a tenant.
 */
export async function runChurnRiskBatch(tenantId: string): Promise<ChurnRiskResult[]> {
    const clients = await prisma.prospectLead.findMany({
        where: { tenantId, status: 'CLIENT' as any },
        select: { id: true },
    });

    const results: ChurnRiskResult[] = [];
    for (const client of clients) {
        try {
            const result = await calculateChurnRisk(client.id);
            results.push(result);
        } catch (err) {
            logger.error({ leadId: client.id, err }, 'Churn risk calculation failed');
        }
    }
    return results;
}
