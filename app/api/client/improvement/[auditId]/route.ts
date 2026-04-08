/**
 * app/api/client/improvement/[auditId]/route.ts
 *
 * Improvement Report API
 * Shows before/after comparison for client audits
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import {
  generateTraceId,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ auditId: string }>;
}

/**
 * Improvement report query schema
 */
const improvementQuerySchema = z.object({
  token: z.string().optional(),
  previousId: z.string().uuid().optional(),
});

/**
 * Group findings by category and calculate average scores
 */
function groupByCategory(findings: any[]): Record<string, { avgScore: number; count: number }> {
  const grouped: Record<string, { total: number; count: number }> = {};

  for (const finding of findings) {
    const category = finding.category || 'uncategorized';
    if (!grouped[category]) {
      grouped[category] = { total: 0, count: 0 };
    }
    grouped[category].total += finding.impactScore || 0;
    grouped[category].count++;
  }

  const result: Record<string, { avgScore: number; count: number }> = {};
  for (const [category, data] of Object.entries(grouped)) {
    result[category] = {
      avgScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
      count: data.count,
    };
  }

  return result;
}

/**
 * Generate summary text for the improvement report
 */
function generateSummary(comparison: any, audit: any): string {
  const parts: string[] = [];

  if (comparison.scoreChange > 0) {
    parts.push(`Overall score improved by ${comparison.scoreChange} points`);
  } else if (comparison.scoreChange < 0) {
    parts.push(`Overall score decreased by ${Math.abs(comparison.scoreChange)} points`);
  } else {
    parts.push('Overall score remains stable');
  }

  if (comparison.findingsResolved > 0) {
    parts.push(
      `${comparison.findingsResolved} issue${comparison.findingsResolved > 1 ? 's' : ''} resolved`
    );
  }

  if (comparison.newFindings > 0) {
    parts.push(
      `${comparison.newFindings} new issue${comparison.newFindings > 1 ? 's' : ''} identified`
    );
  }

  return parts.join('. ') + '.';
}

/**
 * Inner handler for improvement report
 */
async function handleImprovementReport(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { auditId } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const previousId = searchParams.get('previousId');

    // Validate query params
    const result = improvementQuerySchema.safeParse({ token, previousId });
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

    // Verify access via proposal token
    if (token) {
      const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        select: { auditId: true },
      });

      if (!proposal || proposal.auditId !== auditId) {
        return NextResponse.json(
          new UnauthorizedError('Access denied').toEnvelope(req.url, traceId),
          { status: 403 }
        );
      }
    }

    // Get current audit
    const currentAudit = await prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        findings: true,
        FindingStatus: true,
      },
    });

    if (!currentAudit) {
      return NextResponse.json(new NotFoundError('Audit', auditId).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Get previous audit (specified or most recent before current)
    let previousAudit;
    if (previousId) {
      previousAudit = await prisma.audit.findUnique({
        where: { id: previousId },
        include: { findings: true },
      });
    } else {
      // Find most recent audit before current
      previousAudit = await prisma.audit.findFirst({
        where: {
          tenantId: currentAudit.tenantId,
          businessUrl: currentAudit.businessUrl ?? undefined,
          createdAt: { lt: currentAudit.createdAt },
          overallScore: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        include: { findings: true },
      });
    }

    // Calculate comparison
    const comparison = {
      scoreChange: previousAudit
        ? (currentAudit.overallScore || 0) - (previousAudit.overallScore || 0)
        : 0,
      previousScore: previousAudit?.overallScore || null,
      currentScore: currentAudit.overallScore || 0,
      findingsResolved: 0,
      newFindings: 0,
      improvements: [] as Array<{ category: string; change: string }>,
      categoryBreakdown: [] as Array<{
        category: string;
        before: number;
        after: number;
        change: number;
      }>,
    };

    if (previousAudit) {
      // Find resolved findings (in previous but fixed in current)
      const previousFindingIds = new Set(previousAudit.findings.map((f) => f.id));
      const currentFindingIds = new Set(currentAudit.findings.map((f) => f.id));
      const fixedFindingIds = new Set(
        currentAudit.FindingStatus.filter((s) => s.status === 'fixed').map((s) => s.findingId)
      );

      // Resolved: was in previous, now fixed
      comparison.findingsResolved = previousAudit.findings.filter((f) =>
        fixedFindingIds.has(f.id)
      ).length;

      // New findings: in current but not in previous
      comparison.newFindings = currentAudit.findings.filter(
        (f) => !previousFindingIds.has(f.id)
      ).length;

      // Category breakdown
      const previousByCategory = groupByCategory(previousAudit.findings);
      const currentByCategory = groupByCategory(currentAudit.findings);

      const allCategories = new Set([
        ...Object.keys(previousByCategory),
        ...Object.keys(currentByCategory),
      ]);

      for (const category of allCategories) {
        const before = previousByCategory[category]?.avgScore || 0;
        const after = currentByCategory[category]?.avgScore || 0;
        const change = after - before;

        comparison.categoryBreakdown.push({
          category,
          before,
          after,
          change,
        });

        if (change > 0) {
          comparison.improvements.push({
            category,
            change: `+${change} points`,
          });
        } else if (change < 0) {
          comparison.improvements.push({
            category,
            change: `${change} points`,
          });
        }
      }
    }

    // Format findings with resolution status
    const findingsWithStatus = currentAudit.findings.map((finding) => {
      const status = currentAudit.FindingStatus.find((fs) => fs.findingId === finding.id);
      const wasInPrevious = previousAudit?.findings.some((f) => f.id === finding.id);

      return {
        ...finding,
        status: status?.status || 'not_started',
        resolved: status?.status === 'fixed',
        wasInPrevious,
        isNew: !wasInPrevious,
      };
    });

    const response = NextResponse.json({
      currentAudit: {
        id: currentAudit.id,
        businessName: currentAudit.businessName,
        overallScore: currentAudit.overallScore,
        createdAt: currentAudit.createdAt,
        findingsCount: currentAudit.findings.length,
      },
      previousAudit: previousAudit
        ? {
            id: previousAudit.id,
            overallScore: previousAudit.overallScore,
            createdAt: previousAudit.createdAt,
            findingsCount: previousAudit.findings.length,
          }
        : null,
      comparison,
      findings: findingsWithStatus,
      summary: generateSummary(comparison, currentAudit),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Improvement report fetch failed');
    const internalError = new InternalError('Failed to fetch improvement report', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (10 requests per minute for improvement reports)
const rateLimitedHandler = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many improvement report requests. Please wait before trying again.',
  })(req, () => handleImprovementReport(req, params));

export const GET = (req: Request, params: Params) => rateLimitedHandler(req, params);
