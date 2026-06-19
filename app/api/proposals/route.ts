/**
 * GET /api/proposals
 * List proposals with pagination.
 *
 * Features:
 * - Cursor-based pagination (more efficient for large datasets)
 * - Standardized error responses
 * - Rate limiting
 */

import { NextResponse } from 'next/server';

import { generateTraceId } from '@/lib/api/errors';
import { withAuth } from '@/lib/middleware/auth';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * Inner handler for listing proposals
 */
async function handleListProposals(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // Support both cursor and offset pagination
    const cursor = searchParams.get('cursor');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100
    const status = searchParams.get('status');

    // Build where clause
    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where.status = status;
    }

    // Cursor-based pagination
    const cursorCondition = cursor
      ? {
          id: cursor,
        }
      : undefined;

    // Fetch proposals with pagination
    const proposals = await prisma.proposal.findMany({
      where,
      cursor: cursorCondition,
      take: limit + 1,
      include: {
        audit: true,
        followUps: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check if there's a next page
    let nextCursor: string | null = null;
    if (proposals.length > limit) {
      const nextItem = proposals.pop();
      nextCursor = nextItem?.id || null;
    }

    // Get total count
    const total = await prisma.proposal.count({ where });
    const totalPages = Math.ceil(total / limit);

    const response = NextResponse.json({
      proposals,
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
    logger.error('[API] Error fetching proposals:', error);
    return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 });
  }
}

// Apply rate limiting for read operations
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.readOperations)(req, () => handleListProposals(req));

export const GET = withAuth(rateLimitedHandler);
