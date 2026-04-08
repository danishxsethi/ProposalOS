/**
 * app/api/client/portal/data/route.ts
 *
 * Client Portal Data API
 * Returns health score, audit history, and finding status for client dashboard
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { clientPortalDataQuerySchema } from '@/lib/api/schemas/proposal';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Calculate health score for an audit
 */
function calculateHealthScore(audit: any): {
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  breakdown: Record<string, number>;
} {
  const findingsTotal = audit.findings.length;
  const findingsFixed = audit.FindingStatus.filter((s: any) => s.status === 'fixed').length;
  const resolutionRate = findingsTotal > 0 ? (findingsFixed / findingsTotal) * 100 : 0;
  const auditScore = audit.overallScore || 0;

  // Critical issues (high impact, not fixed)
  const fixedFindingIds = new Set(
    audit.FindingStatus.filter((s: any) => s.status === 'fixed' || s.status === 'wont_fix').map(
      (s: any) => s.findingId
    )
  );
  const criticalIssues = audit.findings.filter(
    (f: any) => f.impactScore >= 8 && !fixedFindingIds.has(f.id)
  ).length;

  // Calculate score
  const trendBonus = 0; // Would compare with previous audit
  const criticalPenalty = Math.min(criticalIssues * 4, 20);

  const score = Math.round(auditScore * 0.5 + resolutionRate * 0.3 + trendBonus - criticalPenalty);

  const finalScore = Math.max(0, Math.min(100, score));

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (resolutionRate >= 50) trend = 'improving';
  else if (resolutionRate <= 20) trend = 'declining';

  return {
    score: finalScore,
    trend,
    breakdown: {
      auditScore,
      resolutionRate: Math.round(resolutionRate),
      criticalPenalty,
    },
  };
}

/**
 * Calculate trend from historical data
 */
function calculateTrend(historicalAudits: any[]): {
  direction: 'up' | 'down' | 'stable';
  change: number;
  percentageChange: number;
} {
  if (historicalAudits.length < 2) {
    return { direction: 'stable', change: 0, percentageChange: 0 };
  }

  const first = historicalAudits[0];
  const last = historicalAudits[historicalAudits.length - 1];

  const change = (last.overallScore || 0) - (first.overallScore || 0);
  const percentageChange = first.overallScore ? (change / first.overallScore) * 100 : 0;

  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (change >= 5) direction = 'up';
  else if (change <= -5) direction = 'down';

  return {
    direction,
    change,
    percentageChange: Math.round(percentageChange * 100) / 100,
  };
}

/**
 * Inner handler for client portal data
 */
async function handlePortalData(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const auditId = searchParams.get('auditId');

    // Validate query params
    const result = clientPortalDataQuerySchema.safeParse({ token, auditId });
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid query parameters', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    if (!token && !auditId) {
      return NextResponse.json(
        new ValidationError('token or auditId required', [
          { field: 'token', message: 'Either token or auditId must be provided' },
        ]).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    // Get proposal by token or use auditId directly
    let proposal;
    if (token) {
      proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
          audit: {
            include: {
              findings: true,
              FindingStatus: true,
              ReviewSnapshot: {
                orderBy: { date: 'desc' },
                take: 10,
              },
            },
          },
          acceptance: true,
        },
      });

      if (!proposal) {
        return NextResponse.json(
          new NotFoundError('Proposal', token).toEnvelope(req.url, traceId),
          { status: 404 }
        );
      }
    }

    const targetAuditId = auditId || proposal?.auditId;

    // Get current audit data
    const audit = await prisma.audit.findUnique({
      where: { id: targetAuditId },
      include: {
        findings: true,
        FindingStatus: true,
        ReviewSnapshot: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });

    if (!audit) {
      return NextResponse.json(
        new NotFoundError('Audit', targetAuditId || 'unknown').toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    // Calculate health score
    const healthScore = calculateHealthScore(audit);

    // Get historical audits for trends
    const historicalAudits = await prisma.audit.findMany({
      where: {
        tenantId: audit.tenantId,
        businessUrl: audit.businessUrl || undefined,
        status: 'COMPLETE',
        overallScore: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        overallScore: true,
        findings: {
          select: { id: true },
        },
      },
    });

    // Calculate trend
    const trend = calculateTrend(historicalAudits);

    // Format findings with status
    const findingsWithStatus = audit.findings.map((finding) => {
      const status = audit.FindingStatus.find((fs) => fs.findingId === finding.id);
      return {
        ...finding,
        status: status?.status || 'not_started',
        notes: status?.notes || null,
      };
    });

    // Count by status
    const statusCounts = {
      fixed: audit.FindingStatus.filter((s) => s.status === 'fixed').length,
      in_progress: audit.FindingStatus.filter((s) => s.status === 'in_progress').length,
      not_started: audit.FindingStatus.filter((s) => s.status === 'not_started' || !s).length,
      wont_fix: audit.FindingStatus.filter((s) => s.status === 'wont_fix').length,
    };

    const response = NextResponse.json({
      audit: {
        id: audit.id,
        businessName: audit.businessName,
        businessUrl: audit.businessUrl,
        overallScore: audit.overallScore,
        createdAt: audit.createdAt,
        status: audit.status,
      },
      healthScore,
      trend,
      findings: findingsWithStatus,
      statusCounts,
      historicalData: historicalAudits.map((a) => ({
        date: a.createdAt,
        score: a.overallScore,
        findingsCount: a.findings.length,
      })),
      reviews: audit.ReviewSnapshot.map((r) => ({
        date: r.date,
        rating: r.rating,
        count: r.count,
        source: r.source,
      })),
      proposal: proposal
        ? {
            id: proposal.id,
            status: proposal.status,
            acceptedAt: proposal.acceptance?.acceptedAt,
            tierChosen: proposal.tierChosen,
          }
        : null,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Client portal data fetch failed');
    const internalError = new InternalError('Failed to fetch portal data', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (30 requests per 10 seconds for portal data)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 10 * 1000,
    max: 30,
    message: 'Too many portal data requests. Please wait before trying again.',
  })(req, () => handlePortalData(req));

export const GET = rateLimitedHandler;
