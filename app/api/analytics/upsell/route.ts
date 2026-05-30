/**
 * app/api/analytics/upsell/route.ts
 *
 * Upsell Analytics API
 * Tracks and reports on upsell conversion metrics
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Query params schema for GET requests
 */
const upsellQuerySchema = z.object({
  days: z.coerce.number().positive().max(365).default(30),
});

/**
 * Create upsell schema for POST requests
 */
const createUpsellSchema = z.object({
  proposalId: z.string().uuid(),
  triggerType: z.string().min(1),
  triggerReason: z.string().optional().default(''),
  dealValue: z.number().positive().optional(),
});

/**
 * Update upsell schema for PATCH requests
 */
const updateUpsellSchema = z.object({
  upsellId: z.string().uuid(),
  status: z.enum(['created', 'sent', 'viewed', 'accepted', 'rejected']),
  dealValue: z.number().positive().optional(),
});

/**
 * Group upsells by week for trend analysis
 */
function getWeeklyTrend(
  upsells: any[],
  days: number
): Array<{
  week: string;
  created: number;
  accepted: number;
}> {
  const weeks = Math.ceil(days / 7);
  const trend: Array<{ week: string; created: number; accepted: number }> = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);

    const weekUpsells = upsells.filter((u) => u.createdAt >= weekStart && u.createdAt < weekEnd);

    trend.push({
      week: weekStart.toISOString().split('T')[0] ?? '',
      created: weekUpsells.length,
      accepted: weekUpsells.filter((u) => u.status === 'accepted').length,
    });
  }

  return trend;
}

/**
 * Inner handler for GET upsell analytics
 */
async function handleGetUpsell(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = (session.user as any).tenantId as string;
    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days') || '30';

    // Validate query params
    const result = upsellQuerySchema.safeParse({ days: daysParam });
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const days = result.data.days;
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get upsell opportunities
    const upsells = await prisma.upsellOpportunity.findMany({
      where: {
        tenantId,
        createdAt: { gte: dateFrom },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate metrics
    const metrics = {
      total: upsells.length,
      byStatus: {
        created: upsells.filter((u) => u.status === 'created').length,
        sent: upsells.filter((u) => u.status === 'sent').length,
        viewed: upsells.filter((u) => u.status === 'viewed').length,
        accepted: upsells.filter((u) => u.status === 'accepted').length,
        rejected: upsells.filter((u) => u.status === 'rejected').length,
      },
      byTriggerType: {} as Record<string, number>,
      conversionRate: 0,
      averageDealValue: 0,
      totalRevenue: 0,
    };

    // Group by trigger type
    upsells.forEach((u) => {
      metrics.byTriggerType[u.triggerType] = (metrics.byTriggerType[u.triggerType] || 0) + 1;
    });

    // Calculate conversion rate
    if (metrics.total > 0) {
      metrics.conversionRate =
        Math.round((metrics.byStatus.accepted / metrics.total) * 100 * 100) / 100;
    }

    // Calculate revenue
    const acceptedUpsells = upsells.filter((u) => u.status === 'accepted' && u.dealValue);
    metrics.totalRevenue = acceptedUpsells.reduce((sum, u) => sum + Number(u.dealValue || 0), 0);
    metrics.averageDealValue =
      acceptedUpsells.length > 0 ? metrics.totalRevenue / acceptedUpsells.length : 0;

    // Get trend data
    const trendData = getWeeklyTrend(upsells, days);

    // Get top trigger types
    const topTriggers = Object.entries(metrics.byTriggerType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    const response = NextResponse.json({
      success: true,
      period: { days, from: dateFrom.toISOString() },
      metrics,
      trend: trendData,
      topTriggers,
      recentUpsells: upsells.slice(0, 10).map((u) => ({
        id: u.id,
        proposalId: u.proposalId,
        triggerType: u.triggerType,
        triggerReason: u.triggerReason,
        status: u.status,
        dealValue: u.dealValue,
        createdAt: u.createdAt,
        acceptedAt: u.acceptedAt,
      })),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Upsell analytics fetch failed');
    const internalError = new InternalError('Failed to fetch upsell analytics', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for POST create upsell
 */
async function handleCreateUpsell(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = (session.user as any).tenantId as string;
    const body = await req.json();

    // Validate request body
    const result = createUpsellSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid upsell data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { proposalId, triggerType, triggerReason, dealValue } = result.data;

    const upsell = await prisma.upsellOpportunity.create({
      data: {
        tenantId,
        proposalId,
        triggerType,
        triggerReason,
        status: 'created',
        dealValue: dealValue ? String(dealValue) : null,
      },
    });

    logger.info({ upsellId: upsell.id, proposalId }, 'Upsell opportunity created');

    const response = NextResponse.json({
      success: true,
      upsell: {
        id: upsell.id,
        proposalId: upsell.proposalId,
        triggerType: upsell.triggerType,
        status: upsell.status,
        createdAt: upsell.createdAt,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to create upsell opportunity');
    const internalError = new InternalError('Failed to create upsell opportunity', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for PATCH update upsell
 */
async function handleUpdateUpsell(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = (session.user as any).tenantId as string;
    const body = await req.json();

    // Validate request body
    const result = updateUpsellSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid update data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { upsellId, status, dealValue } = result.data;

    // Verify ownership
    const existing = await prisma.upsellOpportunity.findUnique({
      where: { id: upsellId },
      select: { tenantId: true },
    });

    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json(new NotFoundError('Upsell', upsellId).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    const updated = await prisma.upsellOpportunity.update({
      where: { id: upsellId },
      data: {
        status,
        dealValue: dealValue ? String(dealValue) : undefined,
        acceptedAt: status === 'accepted' ? new Date() : undefined,
      },
    });

    logger.info({ upsellId, status }, 'Upsell status updated');

    const response = NextResponse.json({
      success: true,
      upsell: {
        id: updated.id,
        status: updated.status,
        dealValue: updated.dealValue,
        acceptedAt: updated.acceptedAt,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to update upsell status');
    const internalError = new InternalError('Failed to update upsell status', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many upsell analytics requests. Please wait before trying again.',
  })(req, () => handleGetUpsell(req));

const rateLimitedPost = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many upsell creation requests. Please wait before trying again.',
  })(req, () => handleCreateUpsell(req));

const rateLimitedPatch = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many upsell update requests. Please wait before trying again.',
  })(req, () => handleUpdateUpsell(req));

export const GET = rateLimitedGet;
export const POST = rateLimitedPost;
export const PATCH = rateLimitedPatch;
