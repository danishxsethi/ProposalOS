/**
 * FIX-30: ICP drift detection.
 * Computes win-rate per industry over time and flags emerging or declining verticals.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export type DriftType = 'EMERGING_OPPORTUNITY' | 'DRIFTING' | 'STABLE';

export interface IcpDriftResult {
    vertical: string;
    currentWinRate: number;
    threeMonthAvgWinRate: number;
    delta: number;
    trend: DriftType;
}

/**
 * Returns the win rate (proposals accepted / proposals sent) for a given vertical
 * in the specified month window.
 */
async function getWinRateForPeriod(
    tenantId: string,
    vertical: string,
    startDate: Date,
    endDate: Date
): Promise<number> {
    // Count leads that became clients in the period
    const converted = await prisma.prospectLead.count({
        where: {
            tenantId,
            vertical,
            status: 'CLIENT' as any,
            updatedAt: { gte: startDate, lte: endDate },
        },
    });

    // Count leads that were actively in outreach during the period
    const total = await prisma.prospectLead.count({
        where: {
            tenantId,
            vertical,
            createdAt: { gte: startDate, lte: endDate },
        },
    });

    return total === 0 ? 0 : converted / total;
}

/**
 * Detects ICP drift for a tenant by comparing current vs 3-month rolling win rates.
 */
export async function detectIcpDrift(tenantId: string): Promise<IcpDriftResult[]> {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Get all verticals for this tenant
    const verticals = await prisma.prospectLead.groupBy({
        by: ['vertical'],
        where: { tenantId },
        having: { vertical: { _count: { gte: 5 } } }, // Only analyze with enough data
    });

    const results: IcpDriftResult[] = [];

    for (const { vertical } of verticals) {
        const currentWinRate = await getWinRateForPeriod(tenantId, vertical, oneMonthAgo, now);
        const historicalWinRate = await getWinRateForPeriod(tenantId, vertical, threeMonthsAgo, oneMonthAgo);
        const delta = currentWinRate - historicalWinRate;

        let trend: DriftType;
        if (delta > 0.20) {
            trend = 'EMERGING_OPPORTUNITY';
        } else if (delta < -0.20) {
            trend = 'DRIFTING';
        } else {
            trend = 'STABLE';
        }

        results.push({
            vertical,
            currentWinRate: Math.round(currentWinRate * 100) / 100,
            threeMonthAvgWinRate: Math.round(historicalWinRate * 100) / 100,
            delta: Math.round(delta * 100) / 100,
            trend,
        });
    }

    logger.info({ tenantId, verticalCount: results.length }, 'ICP drift analysis complete');
    return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
