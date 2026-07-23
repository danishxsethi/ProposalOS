/**
 * FIX-25: Elo rating system for prompt versions.
 * Replaces the basic t-test comparison with a proper Elo-based ranking.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Standard Elo parameters
const ELO_K_FACTOR = 32;
const INITIAL_ELO = 1500;

/**
 * Calculates expected score for player A given ratings for A and B.
 */
function expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Computes new Elo ratings after a match.
 * actualScoreA: 1 = A won, 0.5 = draw, 0 = A lost
 */
function calculateNewRatings(
    ratingA: number,
    ratingB: number,
    actualScoreA: number
): { newRatingA: number; newRatingB: number } {
    const expected = expectedScore(ratingA, ratingB);
    const newRatingA = Math.round(ratingA + ELO_K_FACTOR * (actualScoreA - expected));
    const newRatingB = Math.round(ratingB + ELO_K_FACTOR * ((1 - actualScoreA) - (1 - expected)));
    return { newRatingA, newRatingB };
}

/**
 * Updates Elo ratings for two prompt variants after a comparison.
 * winnerVariantId receives a win (1.0), loserVariantId receives a loss (0.0).
 * Pass draw=true for inconclusive comparisons.
 */
export async function updateEloRatings(
    winnerVariantId: string,
    loserVariantId: string,
    draw = false
): Promise<void> {
    // Fetch current ratings from DB (stored in the promptVariant metadata or a separate field)
    const [winner, loser] = await Promise.all([
        (prisma as any).promptVariant.findUnique({ where: { id: winnerVariantId }, select: { id: true, eloRating: true } }),
        (prisma as any).promptVariant.findUnique({ where: { id: loserVariantId }, select: { id: true, eloRating: true } }),
    ]);

    if (!winner || !loser) {
        logger.warn({ winnerVariantId, loserVariantId }, 'Elo update: variant(s) not found');
        return;
    }

    const ratingA = winner.eloRating ?? INITIAL_ELO;
    const ratingB = loser.eloRating ?? INITIAL_ELO;
    const actualScore = draw ? 0.5 : 1.0;

    const { newRatingA, newRatingB } = calculateNewRatings(ratingA, ratingB, actualScore);

    await Promise.all([
        (prisma as any).promptVariant.update({
            where: { id: winnerVariantId },
            data: { eloRating: newRatingA },
        }),
        (prisma as any).promptVariant.update({
            where: { id: loserVariantId },
            data: { eloRating: newRatingB },
        }),
    ]);

    logger.info(
        { winnerVariantId, loserVariantId, ratingA, ratingB, newRatingA, newRatingB, draw },
        'Elo ratings updated'
    );
}

/**
 * Gets the current Elo rating for a variant (or the initial rating if not yet rated).
 */
export async function getEloRating(variantId: string): Promise<number> {
    const variant = await (prisma as any).promptVariant.findUnique({
        where: { id: variantId },
        select: { eloRating: true },
    });
    return variant?.eloRating ?? INITIAL_ELO;
}

/**
 * Returns variants sorted by Elo rating descending.
 */
export async function getRankedVariants(experimentId: string): Promise<Array<{ id: string; eloRating: number }>> {
    const variants = await (prisma as any).promptVariant.findMany({
        where: { experimentId },
        select: { id: true, eloRating: true },
        orderBy: { eloRating: 'desc' },
    });
    return variants;
}
