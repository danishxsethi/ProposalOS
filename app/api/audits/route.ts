/**
 * GET /api/audits
 * List audits with pagination.
 *
 * Features:
 * - Cursor-based pagination (more efficient for large datasets)
 * - Standardized error responses
 * - Rate limiting ready
 */

import { NextResponse } from 'next/server';

import { generateTraceId } from '@/lib/api/errors';
import { getCostStatus } from '@/lib/config/costBudget';
import { withAuth } from '@/lib/middleware/auth';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * Inner handler for listing audits
 */
async function handleListAudits(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    // Support both cursor and offset pagination
    const cursor = searchParams.get('cursor');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.businessName = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Cursor-based pagination (more efficient for large datasets)
    const cursorCondition = cursor
      ? {
          id: cursor,
        }
      : undefined;

    // Fetch audits with pagination
    const audits = await prisma.audit.findMany({
      where,
      cursor: cursorCondition,
      take: limit + 1, // Fetch one extra to check if there's a next page
      orderBy: { createdAt: 'desc' },
      include: {
        findings: {
          where: { excluded: false },
          select: { id: true },
        },
        proposals: {
          select: {
            id: true,
            status: true,
            webLinkToken: true,
            sentAt: true,
            viewedAt: true,
            qaScore: true,
            clientScore: true,
            clientScoreResults: true,
          },
        },
      },
    });

    // Check if there's a next page
    let nextCursor: string | null = null;
    if (audits.length > limit) {
      const nextItem = audits.pop();
      nextCursor = nextItem?.id || null;
    }

    // Get total count for offset pagination compatibility
    const total = await prisma.audit.count({ where });

    // Transform data for frontend
    const auditsList = audits.map((audit) => ({
      id: audit.id,
      businessName: audit.businessName,
      businessCity: audit.businessCity,
      businessIndustry: audit.businessIndustry,
      status: audit.status,
      findingsCount: audit.findings.length,
      cost: audit.apiCostCents,
      costStatus: getCostStatus(audit.apiCostCents),
      proposal: audit.proposals[0] || null,
      qaScore: audit.proposals[0]?.qaScore ?? null,
      clientScore: audit.proposals[0]?.clientScore ?? null,
      requiresHumanReview:
        (audit.proposals[0]?.clientScoreResults as { requiresHumanReview?: unknown } | undefined)
          ?.requiresHumanReview === true,
      createdAt: audit.createdAt.toISOString(),
      completedAt: audit.completedAt,
    }));

    const totalPages = Math.ceil(total / limit);

    const response = NextResponse.json({
      audits: auditsList,
      pagination: {
        cursor: nextCursor,
        page,
        limit,
        total,
        totalPages,
        hasMore: !!nextCursor,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('[API] Error fetching audits:', error);
    return NextResponse.json({ error: 'Failed to fetch audits' }, { status: 500 });
  }
}

// Apply rate limiting for read operations
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.readOperations)(req, () => handleListAudits(req));

export const GET = withAuth(rateLimitedHandler);
