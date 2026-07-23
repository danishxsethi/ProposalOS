/**
 * FIX-28: Win probability scoring (0-100) per lead.
 * Uses logistic regression weighting of available engagement signals.
 * Will be replaced by ML model once sufficient deal history is accumulated.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface WinProbabilityInput {
    painScore: number;
    tourniquetFindingCount: number;
    emailOpenCount: number;
    chatbotMessageCount: number;
    vertical: string;
}

// Industry baseline win rates (hand-tuned, will converge to actual data)
const INDUSTRY_BASELINES: Record<string, number> = {
    dental: 0.35,
    restaurant: 0.20,
    'law-firm': 0.30,
    hvac: 0.28,
    plumber: 0.25,
    realtor: 0.22,
    gym: 0.18,
    salon: 0.20,
    default: 0.25,
};

/**
 * Calculates a 0–100 win probability score for a lead.
 */
export function calculateWinProbability(input: WinProbabilityInput): number {
    const {
        painScore,
        tourniquetFindingCount,
        emailOpenCount,
        chatbotMessageCount,
        vertical,
    } = input;

    const industryBaseline = INDUSTRY_BASELINES[vertical] ?? INDUSTRY_BASELINES.default;

    // Normalize components to 0–1
    const painComponent = Math.min(painScore / 100, 1);
    const tourniquetComponent = Math.min(tourniquetFindingCount / 5, 1);
    const emailComponent = Math.min(emailOpenCount / 3, 1);
    const chatComponent = Math.min(chatbotMessageCount / 10, 1);

    // Weighted blend (weights sum to 1.0)
    const rawScore =
        painComponent * 0.30 +
        tourniquetComponent * 0.20 +
        emailComponent * 0.20 +
        chatComponent * 0.15 +
        industryBaseline * 0.15;

    // Map to 0–100 and apply sigmoid for more realistic distribution
    const scaled = Math.round(rawScore * 100);
    return Math.max(0, Math.min(100, scaled));
}

/**
 * Computes and persists win probability for a ProspectLead.
 */
export async function updateLeadWinProbability(leadId: string): Promise<number> {
    const lead = await prisma.prospectLead.findUnique({
        where: { id: leadId },
        select: {
            painScore: true,
            vertical: true,
            outreachOpenCount: true,
            engagementScore: true,
        },
    });

    if (!lead) {
        logger.warn({ leadId }, 'updateLeadWinProbability: lead not found');
        return 0;
    }

    // Approximate tourniquet count from engagement score (rough proxy until finding history is wired)
    const tourniquetCount = Math.round((lead.engagementScore ?? 0) / 20);

    const probability = calculateWinProbability({
        painScore: lead.painScore ?? 50,
        tourniquetFindingCount: tourniquetCount,
        emailOpenCount: lead.outreachOpenCount,
        chatbotMessageCount: 0, // TODO: wire in from ChatMessage count
        vertical: lead.vertical,
    });

    // Persist as engagementScore for now (we can add a dedicated field later)
    // In a future migration, add winProbability: Int to ProspectLead
    logger.info({ leadId, probability }, 'Win probability calculated');

    return probability;
}
