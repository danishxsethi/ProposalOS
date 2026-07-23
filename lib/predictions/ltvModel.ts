import { Finding, ProspectLead } from '@prisma/client';
import { logger } from '@/lib/logger';

export type LTVCategory = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LTVPrediction {
    category: LTVCategory;
    score: number; // 0-100
    reason: string;
}

/**
 * Heuristic-based LTV Prediction Model.
 * In a real-world scenario, this would leverage historical closed-won data,
 * feature importance, and ICP drift metrics.
 */
export function predictLTV(lead: ProspectLead, findings: Finding[]): LTVPrediction {
    let score = 50; // Base score
    const reasons: string[] = [];

    // 1. Industry / Vertical value (Heuristic)
    const highValueIndustries = ['saas', 'healthcare', 'finance', 'legal', 'enterprise', 'technology'];
    const currentVertical = (lead.vertical || '').toLowerCase();
    if (highValueIndustries.some(v => currentVertical.includes(v))) {
        score += 20;
        reasons.push(`High LTV Vertical (${lead.vertical}) matches typical high-paying cohorts.`);
    }

    // 2. Pain Threshold (Desperation = Willingness to pay)
    if (findings.length > 0) {
        const criticalFindings = findings.filter(f => f.impactScore >= 8).length;
        if (criticalFindings >= 3) {
            score += 15;
            reasons.push(`High number of critical pain points (${criticalFindings}) indicates urgent need.`);
        } else if (criticalFindings === 0) {
            score -= 10;
            reasons.push('No critical pain points found; lower willingness to invest in premium tier.');
        }
    }

    // 3. Employee / Company Size heuristics (mocked from missing data or lead score)
    // If they have high existing traffic/reviews, they likely have budget.
    if ((lead.reviewCount || 0) > 200) {
        score += 15;
        reasons.push('High review count indicates established business with budget.');
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    let category: LTVCategory = 'MEDIUM';
    if (score >= 75) category = 'HIGH';
    else if (score < 40) category = 'LOW';

    const prediction = {
        category,
        score,
        reason: reasons.join(' ') || 'Base profile, average expected LTV.',
    };

    logger.info({ leadId: lead.id, category, score }, '[Predictive Intelligence] LTV Prediction generated');

    return prediction;
}
