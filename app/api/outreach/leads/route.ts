/**
 * app/api/outreach/leads/route.ts
 *
 * Outreach Leads API
 * Get list of outreach leads with filtering and pagination
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { Prisma, ProspectLeadStatus } from '@prisma/client';
import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { normalizeVertical } from '@/lib/outreach/sprint2/config';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * Query params schema for GET requests
 */
const leadsQuerySchema = z.object({
  city: z.string().max(100).optional().nullable(),
  vertical: z.string().max(100).optional().nullable(),
  status: z.string().max(200).optional().nullable(),
  minPainScore: z.coerce.number().min(0).max(100).optional().nullable(),
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
});

function parseStatusList(statusParam: string | null): ProspectLeadStatus[] | undefined {
  if (!statusParam) return undefined;
  const raw = statusParam
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (raw.length === 0) return undefined;

  const allowed = new Set(Object.values(ProspectLeadStatus));
  const statuses = raw.filter((item): item is ProspectLeadStatus =>
    allowed.has(item as ProspectLeadStatus)
  );
  return statuses.length > 0 ? statuses : undefined;
}

/**
 * Inner handler for GET leads
 */
async function handleGetLeads(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        new UnauthorizedError('No tenant found').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Validate query params
    const result = leadsQuerySchema.safeParse({
      city: searchParams.get('city'),
      vertical: searchParams.get('vertical'),
      status: searchParams.get('status'),
      minPainScore: searchParams.get('minPainScore'),
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    });

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const typedData = result.data as typeof result.data & { vertical: string | undefined };
    const { city, vertical, status: statusParam, minPainScore, page, limit } = typedData;
    const skip = (page - 1) * limit;

    const where: Prisma.ProspectLeadWhereInput = { tenantId };
    if (city) where.city = city;
    if (vertical != null && typeof vertical === 'string') {
      where.vertical = normalizeVertical(vertical);
    }

    const statuses = parseStatusList(statusParam ?? null);
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }

    if (typeof minPainScore === 'number' && Number.isFinite(minPainScore)) {
      where.painScore = { gte: Math.max(0, Math.min(100, minPainScore)) };
    }

    const [items, total] = await Promise.all([
      prisma.prospectLead.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ painScore: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          businessName: true,
          city: true,
          state: true,
          vertical: true,
          category: true,
          website: true,
          phone: true,
          status: true,
          painScore: true,
          painThreshold: true,
          topFindings: true,
          auditSummarySnippet: true,
          decisionMakerName: true,
          decisionMakerTitle: true,
          decisionMakerEmail: true,
          decisionMakerLinkedin: true,
          decisionMakerEmailStatus: true,
          estimatedCostCents: true,
          outreachStage: true,
          outreachAttempts: true,
          outreachOpenCount: true,
          outreachClickCount: true,
          outreachReplyCount: true,
          outreachLastContactedAt: true,
          outreachNextActionAt: true,
          outreachDropReason: true,
          scorecardToken: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.prospectLead.count({ where }),
    ]);

    const statusValues = Object.values(ProspectLeadStatus);
    const statusCountsEntries = await Promise.all(
      statusValues.map(async (status) => {
        const count = await prisma.prospectLead.count({
          where: { tenantId, status },
        });
        return [status, count] as const;
      })
    );

    const statusCounts = statusCountsEntries.reduce<Record<string, number>>(
      (acc, [status, count]) => {
        acc[status] = count;
        return acc;
      },
      {}
    );

    const response = NextResponse.json({
      leads: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      statusCounts,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error fetching outreach leads:', error);
    const internalError = new InternalError('Failed to fetch outreach leads', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedHandler = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many leads requests. Please wait before trying again.',
  })(req, () => handleGetLeads(req));

export const GET = rateLimitedHandler;
