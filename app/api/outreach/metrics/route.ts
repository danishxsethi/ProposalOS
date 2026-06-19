/**
 * app/api/outreach/metrics/route.ts
 *
 * Outreach Metrics API
 * Get comprehensive outreach metrics and analytics
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

interface CityVerticalMetric {
  city: string;
  vertical: string;
  discovered: number;
  qualified: number;
  enriched: number;
}

function daysToStartDate(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Query params schema for GET requests
 */
const outreachMetricsQuerySchema = z.object({
  days: z.coerce.number().min(1).max(30).default(1),
});

/**
 * Inner handler for GET outreach metrics
 */
async function handleGetOutreachMetrics(req: NextRequest): Promise<NextResponse> {
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
    const result = outreachMetricsQuerySchema.safeParse({
      days: searchParams.get('days'),
    });

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new UnauthorizedError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const days = result.data.days;
    const startDate = daysToStartDate(days);

    const [discovered, qualified, enriched, enrichmentCostAgg, recentLeads] = await Promise.all([
      prisma.prospectLead.count({
        where: { tenantId, createdAt: { gte: startDate } },
      }),
      prisma.prospectLead.count({
        where: { tenantId, qualifiedAt: { gte: startDate } },
      }),
      prisma.prospectLead.count({
        where: {
          tenantId,
          status: 'ENRICHED',
          updatedAt: { gte: startDate },
        },
      }),
      prisma.prospectEnrichmentRun.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startDate },
        },
        _sum: { costCents: true },
      }),
      prisma.prospectLead.findMany({
        where: {
          tenantId,
          createdAt: { gte: startDate },
        },
        select: {
          city: true,
          vertical: true,
          status: true,
          painScore: true,
          painThreshold: true,
        },
        take: 5000,
      }),
    ]);

    const costCents = enrichmentCostAgg._sum.costCents ?? 0;
    const costPerQualifiedLeadCents =
      qualified > 0 ? Number((costCents / qualified).toFixed(2)) : null;

    const cityVerticalMap = new Map<string, CityVerticalMetric>();
    for (const lead of recentLeads) {
      const key = `${lead.city}|${lead.vertical}`;
      const curr = cityVerticalMap.get(key) ?? {
        city: lead.city,
        vertical: lead.vertical,
        discovered: 0,
        qualified: 0,
        enriched: 0,
      };
      curr.discovered += 1;
      if ((lead.painScore ?? 0) >= lead.painThreshold) curr.qualified += 1;
      if (lead.status === 'ENRICHED') curr.enriched += 1;
      cityVerticalMap.set(key, curr);
    }

    const cityVerticalBreakdown = [...cityVerticalMap.values()]
      .sort((a, b) => b.qualified - a.qualified)
      .slice(0, 50);

    const [proposalTotal, replies, meetings, accepted, tierChosenRows] = await Promise.all([
      prisma.proposal.count({
        where: {
          audit: { tenantId },
          createdAt: { gte: startDate },
        },
      }),
      prisma.proposal.count({
        where: {
          audit: { tenantId },
          replyReceivedAt: { gte: startDate },
        },
      }),
      prisma.proposal.count({
        where: {
          audit: { tenantId },
          meetingBookedAt: { gte: startDate },
        },
      }),
      prisma.proposal.count({
        where: {
          audit: { tenantId },
          createdAt: { gte: startDate },
          OR: [{ status: 'ACCEPTED' }, { outcome: 'WON' }],
        },
      }),
      prisma.proposal.findMany({
        where: {
          audit: { tenantId },
          createdAt: { gte: startDate },
          tierChosen: { not: null },
        },
        select: { tierChosen: true },
        take: 5000,
      }),
    ]);

    const tierChosenBreakdown = tierChosenRows.reduce<Record<string, number>>((acc, row) => {
      const tier = row.tierChosen ?? 'unknown';
      acc[tier] = (acc[tier] ?? 0) + 1;
      return acc;
    }, {});

    const replyRate = proposalTotal > 0 ? replies / proposalTotal : 0;
    const meetingRate = proposalTotal > 0 ? meetings / proposalTotal : 0;
    const acceptanceRate = proposalTotal > 0 ? accepted / proposalTotal : 0;
    const outcomeScore = Math.round(
      (replyRate * 0.35 + meetingRate * 0.35 + acceptanceRate * 0.3) * 100
    );

    const today = utcDayStart();
    const [
      sentEmails,
      openedEmails,
      clickedEmails,
      replyEvents,
      qualityAgg,
      stageRows,
      domainRows,
      hotLeadCount,
    ] = await Promise.all([
      prisma.outreachEmail.count({
        where: {
          tenantId,
          sentAt: { gte: startDate },
        },
      }),
      prisma.outreachEmail.count({
        where: {
          tenantId,
          openedAt: { gte: startDate },
        },
      }),
      prisma.outreachEmail.count({
        where: {
          tenantId,
          clickedAt: { gte: startDate },
        },
      }),
      prisma.outreachEmailEvent.count({
        where: {
          tenantId,
          type: 'REPLY_RECEIVED',
          occurredAt: { gte: startDate },
        },
      }),
      prisma.outreachEmail.aggregate({
        where: {
          tenantId,
          sentAt: { gte: startDate },
        },
        _avg: { qualityScore: true },
      }),
      prisma.prospectLead.groupBy({
        by: ['outreachStage'],
        where: { tenantId },
        _count: { _all: true },
      }),
      prisma.outreachDomainDailyStat.findMany({
        where: {
          tenantId,
          day: { gte: today },
        },
        include: {
          domain: {
            select: {
              fromEmail: true,
              dailyLimit: true,
            },
          },
        },
        orderBy: [{ sentCount: 'desc' }],
        take: 10,
      }),
      prisma.prospectLead.count({
        where: {
          tenantId,
          outreachStage: 'HOT',
        },
      }),
    ]);

    const emailOpenRate = sentEmails > 0 ? openedEmails / sentEmails : 0;
    const emailClickRate = sentEmails > 0 ? clickedEmails / sentEmails : 0;
    const emailReplyRate = sentEmails > 0 ? replyEvents / sentEmails : 0;
    const avgQualityScore = qualityAgg._avg.qualityScore
      ? Number(qualityAgg._avg.qualityScore.toFixed(1))
      : null;

    const outreachStageBreakdown = stageRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.outreachStage] = row._count._all;
      return acc;
    }, {});

    const domainRotation = domainRows.map((row) => ({
      fromEmail: row.domain.fromEmail,
      sentToday: row.sentCount,
      openToday: row.openCount,
      clickToday: row.clickCount,
      replyToday: row.replyCount,
      dailyLimit: row.domain.dailyLimit,
    }));

    const response = NextResponse.json({
      window: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      throughput: {
        discovered,
        qualified,
        enriched,
        discoveredPerDay: Number((discovered / days).toFixed(1)),
        qualifiedPerDay: Number((qualified / days).toFixed(1)),
        enrichedPerDay: Number((enriched / days).toFixed(1)),
        goalQualifiedPerDay: 200,
      },
      cost: {
        totalCostCents: costCents,
        costPerQualifiedLeadCents,
        goalCostPerQualifiedLeadCents: 20,
      },
      cityVerticalBreakdown,
      outcomeMetrics: {
        proposalTotal,
        replies,
        meetingsBooked: meetings,
        accepted,
        replyRate: Number((replyRate * 100).toFixed(1)),
        meetingRate: Number((meetingRate * 100).toFixed(1)),
        acceptanceRate: Number((acceptanceRate * 100).toFixed(1)),
        tierChosenBreakdown,
        clientPerfectOutcomeScore: outcomeScore,
      },
      emailOutreach: {
        sentEmails,
        openedEmails,
        clickedEmails,
        replies: replyEvents,
        openRate: Number((emailOpenRate * 100).toFixed(1)),
        clickRate: Number((emailClickRate * 100).toFixed(1)),
        replyRate: Number((emailReplyRate * 100).toFixed(1)),
        avgQualityScore,
        targetOpenRate: 40,
        targetReplyRate: 15,
        targetDailyEmails: 200,
        hotLeads: hotLeadCount,
        stageBreakdown: outreachStageBreakdown,
        domainRotation,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error fetching outreach metrics:', error);
    const internalError = new InternalError('Failed to fetch outreach metrics', {
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
    message: 'Too many metrics requests. Please wait before trying again.',
  })(req, () => handleGetOutreachMetrics(req));

export const GET = rateLimitedHandler;
