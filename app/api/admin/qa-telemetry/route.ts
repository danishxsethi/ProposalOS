/**
 * app/api/admin/qa-telemetry/route.ts
 *
 * Task 3: Adversarial QA Telemetry admin endpoint.
 *
 * GET /api/admin/qa-telemetry
 *   - Query params: graphName, limit (default 50), minScore (float)
 *   - Returns recent QA run records for monitoring dashboards.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    // Admin-only: require CRON_SECRET or ADMIN_API_KEY header
    const authHeader = req.headers.get('authorization');
    const isValid =
        (process.env.ADMIN_API_KEY && authHeader === `Bearer ${process.env.ADMIN_API_KEY}`) ||
        (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);

    if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const graphName = searchParams.get('graphName') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const minScore = parseFloat(searchParams.get('minScore') ?? '0');
    const tenantId = searchParams.get('tenantId') ?? undefined;

    try {
        const records = await (prisma as any).qATelemetry.findMany({
            where: {
                ...(graphName ? { graphName } : {}),
                ...(tenantId ? { tenantId } : {}),
                qaScore: { gte: minScore },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                runId: true,
                graphName: true,
                inputHash: true,
                qaScore: true,
                hallucinationCount: true,
                unsupportedCount: true,
                consistencyCount: true,
                hallucinations: true,
                unsupportedClaims: true,
                retryTriggered: true,
                retryCount: true,
                tenantId: true,
                auditId: true,
                proposalId: true,
                createdAt: true,
            },
        });

        // Summary stats
        const totalRuns = records.length;
        const retriedRuns = records.filter((r: any) => r.retryTriggered).length;
        const avgScore = totalRuns > 0
            ? records.reduce((sum: number, r: any) => sum + r.qaScore, 0) / totalRuns
            : 0;
        const criticalRuns = records.filter((r: any) => r.qaScore > 0.3).length;

        return NextResponse.json({
            summary: {
                totalRuns,
                retriedRuns,
                criticalRuns,
                avgScore: Math.round(avgScore * 1000) / 1000,
            },
            records,
        });
    } catch (error) {
        console.error('[qa-telemetry] Query failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
