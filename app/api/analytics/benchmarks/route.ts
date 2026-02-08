import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

/**
 * GET /api/analytics/benchmarks
 * Get industry benchmarks for comparison
 */
export const GET = withAuth(async (req: Request) => {
    try {
        const { searchParams } = new URL(req.url);
        const industry = searchParams.get('industry');

        if (!industry) {
            return NextResponse.json(
                { error: 'Industry parameter required' },
                { status: 400 }
            );
        }

        // Get all completed audits for the industry
        const audits = await prisma.audit.findMany({
            where: {
                businessIndustry: industry,
                status: 'COMPLETE',
                overallScore: { not: null },
            },
            include: {
                findings: {
                    where: { excluded: false },
                },
                proposals: {
                    where: { outcome: 'WON' },
                    select: { dealValue: true },
                },
            },
        });

        if (audits.length === 0) {
            return NextResponse.json({
                industry,
                sampleSize: 0,
                message: 'No benchmark data available for this industry',
            });
        }

        // Calculate benchmarks
        const scores = audits.map(a => a.overallScore!).filter(s => s > 0);
        const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

        const findingCounts = audits.map(a => a.findings.length);
        const avgFindings = findingCounts.reduce((sum, c) => sum + c, 0) / findingCounts.length;

        // Average deal values
        const dealValues = audits
            .flatMap(a => a.proposals)
            .map(p => Number(p.dealValue))
            .filter(v => v > 0);

        const avgDealValue = dealValues.length > 0
            ? dealValues.reduce((sum, v) => sum + v, 0) / dealValues.length
            : 0;

        // Finding type distribution
        const findingTypes = audits
            .flatMap(a => a.findings)
            .reduce((acc: any, f) => {
                const category = f.category || 'Other';
                acc[category] = (acc[category] || 0) + 1;
                return acc;
            }, {});

        // Cost distribution
        const costs = audits.map(a => a.apiCostCents);
        const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;

        return NextResponse.json({
            industry,
            sampleSize: audits.length,
            benchmarks: {
                avgScore: Math.round(avgScore * 10) / 10,
                avgFindings: Math.round(avgFindings * 10) / 10,
                avgDealValue: Math.round(avgDealValue * 100) / 100,
                avgCostCents: Math.round(avgCost),
                findingTypeDistribution: findingTypes,
            },
            percentiles: {
                score: {
                    p25: calculatePercentile(scores, 25),
                    p50: calculatePercentile(scores, 50),
                    p75: calculatePercentile(scores, 75),
                },
                findings: {
                    p25: calculatePercentile(findingCounts, 25),
                    p50: calculatePercentile(findingCounts, 50),
                    p75: calculatePercentile(findingCounts, 75),
                },
            },
        });
    } catch (error) {
        console.error('[API] Error fetching benchmarks:', error);
        return NextResponse.json(
            { error: 'Failed to fetch benchmarks' },
            { status: 500 }
        );
    }
});

function calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}
