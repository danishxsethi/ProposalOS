/**
 * FIX-10: Delta reporting.
 * Compares findings between two audit runs to surface improvements and regressions.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export type FindingTrend = 'FIXED' | 'NEW' | 'WORSENED' | 'UNCHANGED';

export interface DeltaFinding {
    title: string;
    module: string;
    category: string;
    type?: string;
    description?: string;
    trend: FindingTrend;
    previousImpactScore?: number;
    currentImpactScore?: number;
    impactDelta?: number;
}

export interface DeltaReport {
    previousAuditId: string;
    currentAuditId: string;
    generatedAt: Date;
    // Summary metrics
    totalPrevious: number;
    totalCurrent: number;
    fixedCount: number;
    newCount: number;
    worsenedCount: number;
    unchangedCount: number;
    // Health score (lower is better on impact; we invert: 100 = no issues)
    previousHealthScore: number;
    currentHealthScore: number;
    healthImprovement: number;
    // Details
    findings: DeltaFinding[];
}

type FindingKey = string;

function findingKey(f: { title: string; module: string }): FindingKey {
    return `${f.module}::${f.title.toLowerCase().trim()}`;
}

function avgImpact(findings: { impactScore: number }[]): number {
    if (findings.length === 0) return 0;
    return findings.reduce((sum, f) => sum + f.impactScore, 0) / findings.length;
}

/**
 * Compares two audit runs and produces a structured delta report.
 */
export async function generateDeltaReport(
    previousAuditId: string,
    currentAuditId: string
): Promise<DeltaReport> {
    const [previousFindings, currentFindings] = await Promise.all([
        prisma.finding.findMany({
            where: { auditId: previousAuditId, excluded: false },
            select: { title: true, module: true, category: true, type: true, description: true, impactScore: true },
        }),
        prisma.finding.findMany({
            where: { auditId: currentAuditId, excluded: false },
            select: { title: true, module: true, category: true, type: true, description: true, impactScore: true },
        }),
    ]);

    const prevMap = new Map(previousFindings.map(f => [findingKey(f), f]));
    const currMap = new Map(currentFindings.map(f => [findingKey(f), f]));

    const deltaFindings: DeltaFinding[] = [];

    // FIXED: in prev but not in current
    for (const [key, prev] of prevMap) {
        if (!currMap.has(key)) {
            deltaFindings.push({
                title: prev.title,
                module: prev.module,
                category: prev.category,
                type: prev.type,
                description: prev.description ?? undefined,
                trend: 'FIXED',
                previousImpactScore: prev.impactScore,
            });
        }
    }

    // NEW or WORSENED: in current
    for (const [key, curr] of currMap) {
        const prev = prevMap.get(key);
        if (!prev) {
            deltaFindings.push({
                title: curr.title,
                module: curr.module,
                category: curr.category,
                type: curr.type,
                description: curr.description ?? undefined,
                trend: 'NEW',
                currentImpactScore: curr.impactScore,
            });
        } else {
            const delta = curr.impactScore - prev.impactScore;
            const trend: FindingTrend = delta > 1 ? 'WORSENED' : 'UNCHANGED';
            deltaFindings.push({
                title: curr.title,
                module: curr.module,
                category: curr.category,
                type: curr.type,
                description: curr.description ?? undefined,
                trend,
                previousImpactScore: prev.impactScore,
                currentImpactScore: curr.impactScore,
                impactDelta: delta,
            });
        }
    }

    const fixedCount = deltaFindings.filter(f => f.trend === 'FIXED').length;
    const newCount = deltaFindings.filter(f => f.trend === 'NEW').length;
    const worsenedCount = deltaFindings.filter(f => f.trend === 'WORSENED').length;
    const unchangedCount = deltaFindings.filter(f => f.trend === 'UNCHANGED').length;

    // Health score: starts at 100, minus 5 per high-impact (>=7) issue, minus 2 per medium
    const calcHealth = (findings: { impactScore: number }[]) => {
        let score = 100;
        for (const f of findings) {
            if (f.impactScore >= 7) score -= 5;
            else if (f.impactScore >= 4) score -= 2;
            else score -= 1;
        }
        return Math.max(0, Math.min(100, score));
    };

    const previousHealthScore = calcHealth(previousFindings);
    const currentHealthScore = calcHealth(currentFindings);

    const report: DeltaReport = {
        previousAuditId,
        currentAuditId,
        generatedAt: new Date(),
        totalPrevious: previousFindings.length,
        totalCurrent: currentFindings.length,
        fixedCount,
        newCount,
        worsenedCount,
        unchangedCount,
        previousHealthScore,
        currentHealthScore,
        healthImprovement: currentHealthScore - previousHealthScore,
        findings: deltaFindings,
    };

    logger.info(
        { previousAuditId, currentAuditId, fixedCount, newCount, worsenedCount, healthImprovement: report.healthImprovement },
        'Delta report generated'
    );

    return report;
}
