/**
 * lib/client/health-score.ts
 *
 * Health Score Calculation for Client Dashboard
 *
 * Calculates a 0-100 health score based on:
 * - Overall audit score
 * - Finding resolution rate
 * - Trend comparison (improvement/decline)
 * - Critical issue count
 */

import { FindingStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export interface HealthScoreResult {
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  scoreChange: number;
  findingsFixed: number;
  findingsTotal: number;
  criticalIssues: number;
  breakdown: {
    auditScore: number;
    resolutionRate: number;
    trendBonus: number;
    criticalPenalty: number;
  };
}

/**
 * Calculate health score for a given audit
 * Note: Requires ClientDashboard model to be migrated first
 */
export async function calculateHealthScore(auditId: string): Promise<HealthScoreResult> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      findings: {
        where: { excluded: false },
      },
      FindingStatus: true,
    },
  });

  if (!audit) {
    throw new Error('Audit not found');
  }

  // Get finding status data
  const findingStatuses = audit.FindingStatus || [];

  // Calculate resolution rate
  const findingsTotal = audit.findings.length;
  const findingsFixed = findingStatuses.filter((f: FindingStatus) => f.status === 'fixed').length;
  const resolutionRate = findingsTotal > 0 ? (findingsFixed / findingsTotal) * 100 : 0;

  // Get audit score (normalized to 0-100)
  const auditScore = audit.overallScore ?? 0;

  // Find critical issues (high impact, not fixed)
  const fixedFindingIds = new Set(
    findingStatuses
      .filter((f: FindingStatus) => f.status === 'fixed' || f.status === 'wont_fix')
      .map((f: FindingStatus) => f.findingId)
  );

  const criticalIssues = audit.findings.filter(
    (f) => f.impactScore >= 8 && !fixedFindingIds.has(f.id)
  ).length;

  // Calculate trend (compare with previous audit if available)
  const previousAudit = await prisma.audit.findFirst({
    where: {
      tenantId: audit.tenantId,
      businessUrl: audit.businessUrl ?? undefined,
      createdAt: { lt: audit.createdAt },
      overallScore: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  let trendBonus = 0;

  if (previousAudit && previousAudit.overallScore !== null) {
    const scoreChange = auditScore - previousAudit.overallScore;
    if (scoreChange >= 10) {
      trend = 'improving';
      trendBonus = 5;
    } else if (scoreChange <= -10) {
      trend = 'declining';
    }
  }

  // Critical issue penalty (max -20 points)
  const criticalPenalty = Math.min(criticalIssues * 4, 20);

  // Final score calculation
  const score = Math.round(
    auditScore * 0.5 + // 50% weight on audit score
      resolutionRate * 0.3 + // 30% weight on resolution rate
      trendBonus - // Bonus for improvement
      criticalPenalty // Penalty for critical issues
  );

  return {
    score: Math.max(0, Math.min(100, score)), // Clamp to 0-100
    trend,
    scoreChange: previousAudit ? auditScore - (previousAudit.overallScore ?? 0) : 0,
    findingsFixed,
    findingsTotal,
    criticalIssues,
    breakdown: {
      auditScore,
      resolutionRate: Math.round(resolutionRate),
      trendBonus,
      criticalPenalty,
    },
  };
}

/**
 * Update or create ClientDashboard record with latest health score
 * Note: Requires ClientDashboard model to be migrated first
 */
export async function updateClientDashboard(auditId: string): Promise<void> {
  const healthScore = await calculateHealthScore(auditId);
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
  });

  if (!audit) return;

  // Get previous score for comparison
  const previousAudit = await prisma.audit.findFirst({
    where: {
      tenantId: audit.tenantId,
      businessUrl: audit.businessUrl ?? undefined,
      createdAt: { lt: audit.createdAt },
      overallScore: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  try {
    await prisma.clientDashboard.upsert({
      where: { auditId },
      create: {
        tenantId: audit.tenantId,
        auditId,
        healthScore: healthScore.score,
        lastScanDate: audit.createdAt,
        previousScore: previousAudit?.overallScore ?? null,
        scoreChange: healthScore.scoreChange,
        findingsFixed: healthScore.findingsFixed,
        findingsTotal: healthScore.findingsTotal,
      },
      update: {
        healthScore: healthScore.score,
        lastScanDate: audit.createdAt,
        previousScore: previousAudit?.overallScore ?? null,
        scoreChange: healthScore.scoreChange,
        findingsFixed: healthScore.findingsFixed,
        findingsTotal: healthScore.findingsTotal,
      },
    });
  } catch (error) {
    // Table may not exist yet if migration hasn't run
    console.warn('ClientDashboard upsert failed - run migration first:', error);
  }
}

/**
 * Get health score history for a client
 */
export async function getHealthScoreHistory(
  tenantId: string,
  businessUrl: string,
  limit: number = 10
) {
  const audits = await prisma.audit.findMany({
    where: {
      tenantId,
      businessUrl: businessUrl || undefined,
      overallScore: { not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      FindingStatus: true,
      findings: {
        where: { excluded: false },
      },
    },
  });

  return audits.map((audit) => ({
    date: audit.createdAt,
    score: audit.overallScore ?? 0,
    findingsTotal: audit.findings?.length || 0,
    findingsFixed:
      audit.FindingStatus?.filter((f: FindingStatus) => f.status === 'fixed').length || 0,
  }));
}
