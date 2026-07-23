/**
 * FIX-31: Feature importance mapping.
 * Correlates specific finding types with deal closure rates.
 * Outputs a ranked list of "findings that predict wins."
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface FindingImportanceResult {
    findingTitle: string;
    winRate: number;
    wonDealsCount: number;
    lostDealsCount: number;
    correlationCoefficient: number;
}

/**
 * Computes Pearson correlation between finding presence and deal closure.
 */
function pearsonCorrelation(presence: number[], outcomes: number[]): number {
    const n = presence.length;
    if (n === 0) return 0;

    const meanP = presence.reduce((a, b) => a + b, 0) / n;
    const meanO = outcomes.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomP = 0;
    let denomO = 0;

    for (let i = 0; i < n; i++) {
        const dp = presence[i] - meanP;
        const dO = outcomes[i] - meanO;
        numerator += dp * dO;
        denomP += dp * dp;
        denomO += dO * dO;
    }

    const denominator = Math.sqrt(denomP * denomO);
    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Builds a feature importance map for a tenant.
 * Requires at least some won + lost proposals to be meaningful.
 */
export async function buildFeatureImportanceMap(
    tenantId: string
): Promise<FindingImportanceResult[]> {
    // Get all proposals with known outcomes for this tenant
    const proposals = await prisma.proposal.findMany({
        where: {
            tenantId,
            outcome: { in: ['WON', 'LOST'] as any[] },
        },
        select: {
            id: true,
            outcome: true,
            audit: {
                select: {
                    findings: {
                        select: { title: true, category: true },
                        where: { excluded: false },
                    },
                },
            },
        },
    });

    if (proposals.length < 5) {
        logger.info({ tenantId, count: proposals.length }, 'Feature importance: insufficient data (< 5 proposals)');
        return [];
    }

    // Build finding → outcome map
    const findingStats: Map<string, { won: number; lost: number }> = new Map();

    for (const proposal of proposals) {
        const isWon = (proposal.outcome as string) === 'WON';
        const findings = proposal.audit?.findings ?? [];

        for (const finding of findings) {
            const key = finding.title;
            if (!findingStats.has(key)) {
                findingStats.set(key, { won: 0, lost: 0 });
            }
            const stats = findingStats.get(key)!;
            if (isWon) stats.won++;
            else stats.lost++;
        }
    }

    // Calculate correlation for each finding
    const results: FindingImportanceResult[] = [];

    for (const [title, stats] of findingStats) {
        const total = stats.won + stats.lost;
        if (total < 3) continue; // Skip findings with too little data

        const winRate = stats.won / total;

        // Simple correlation: findings appearing in more wins = positive correlation
        const baselineWinRate = proposals.filter(p => (p.outcome as string) === 'WON').length / proposals.length;
        const correlationCoefficient = winRate - baselineWinRate;

        results.push({
            findingTitle: title,
            winRate: Math.round(winRate * 100) / 100,
            wonDealsCount: stats.won,
            lostDealsCount: stats.lost,
            correlationCoefficient: Math.round(correlationCoefficient * 100) / 100,
        });
    }

    // Sort by absolute correlation (findings most predictive of wins/losses first)
    results.sort((a, b) => Math.abs(b.correlationCoefficient) - Math.abs(a.correlationCoefficient));

    logger.info({ tenantId, findingCount: results.length }, 'Feature importance map built');
    return results.slice(0, 20); // Return top 20
}
