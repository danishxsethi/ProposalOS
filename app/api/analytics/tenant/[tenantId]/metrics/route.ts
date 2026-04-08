/**
 * app/api/analytics/tenant/[tenantId]/metrics/route.ts
 *
 * Tenant-Specific Analytics Endpoint
 *
 * Returns per-tenant metrics for the agency dashboard:
 * - Total audits run
 * - Active campaigns
 * - Proposals delivered
 * - Deals closed
 * - Revenue generated
 * - Average proposal quality score
 *
 * Auth: Requires valid API key with tenant:read scope or admin role
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { validateApiKey, API_KEY_SCOPES } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface TenantMetrics {
  tenantId: string;
  tenantName: string;
  planTier: string;
  status: string;

  // Audit Metrics
  totalAudits: number;
  auditsThisMonth: number;
  auditsLastMonth: number;
  auditGrowthRate: number;
  averageAuditScore: number | null;

  // Proposal Metrics
  totalProposals: number;
  proposalsThisMonth: number;
  proposalsSent: number;
  proposalsViewed: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  proposalAcceptanceRate: number;
  averageProposalQualityScore: number | null;

  // Deal Metrics
  dealsClosed: number;
  dealsThisMonth: number;
  totalRevenue: number;
  revenueThisMonth: number;
  averageDealValue: number | null;

  // Outreach Metrics
  totalLeads: number;
  qualifiedLeads: number;
  outreachEmailsSent: number;
  outreachOpenRate: number;
  outreachReplyRate: number;

  // Engagement Metrics
  proposalViewRate: number;
  averageTimeToAccept: number | null; // days
  activeCampaigns: number;

  // Timestamp
  generatedAt: Date;
}

/**
 * Get tenant metrics for agency dashboard
 */
async function getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      planTier: true,
      status: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // Audit Metrics
  const [auditsThisMonth, auditsLastMonth, auditScores] = await Promise.all([
    prisma.audit.count({
      where: {
        tenantId,
        createdAt: { gte: thisMonthStart },
      },
    }),
    prisma.audit.count({
      where: {
        tenantId,
        createdAt: { gte: lastMonthStart, lt: thisMonthStart },
      },
    }),
    prisma.audit.aggregate({
      where: { tenantId },
      _avg: { overallScore: true },
    }),
  ]);

  const totalAudits = await prisma.audit.count({ where: { tenantId } });
  const auditGrowthRate =
    auditsLastMonth > 0 ? ((auditsThisMonth - auditsLastMonth) / auditsLastMonth) * 100 : 0;

  // Proposal Metrics
  const [
    proposalsThisMonth,
    proposalsSent,
    proposalsViewed,
    proposalsAccepted,
    proposalsRejected,
    proposalQualityScores,
  ] = await Promise.all([
    prisma.proposal.count({
      where: {
        tenantId,
        createdAt: { gte: thisMonthStart },
      },
    }),
    prisma.proposal.count({
      where: { tenantId, status: 'SENT' },
    }),
    prisma.proposal.count({
      where: { tenantId, viewedAt: { not: null } },
    }),
    prisma.proposal.count({
      where: { tenantId, status: 'ACCEPTED' },
    }),
    prisma.proposal.count({
      where: { tenantId, status: 'REJECTED' },
    }),
    prisma.proposal.aggregate({
      where: { tenantId, qaScore: { not: null } },
      _avg: { qaScore: true },
    }),
  ]);

  const totalProposals = await prisma.proposal.count({ where: { tenantId } });
  const proposalAcceptanceRate =
    totalProposals > 0 ? (proposalsAccepted / totalProposals) * 100 : 0;

  // Deal Metrics (from accepted proposals with dealValue)
  const [dealsThisMonth, dealsWithRevenue] = await Promise.all([
    prisma.proposal.aggregate({
      where: {
        tenantId,
        status: 'ACCEPTED',
        createdAt: { gte: thisMonthStart },
      },
      _count: { id: true },
      _sum: { dealValue: true },
    }),
    prisma.proposal.aggregate({
      where: {
        tenantId,
        status: 'ACCEPTED',
        dealValue: { not: null },
      },
      _count: { id: true },
      _sum: { dealValue: true },
      _avg: { dealValue: true },
    }),
  ]);

  const dealsClosed = dealsWithRevenue._count.id;
  const totalRevenue = Number(dealsWithRevenue._sum.dealValue) || 0;
  
  const dealsThisMonthResult = await prisma.proposal.aggregate({
    where: {
      tenantId,
      status: 'ACCEPTED',
      createdAt: { gte: thisMonthStart },
      dealValue: { not: null },
    },
    _sum: { dealValue: true },
  });
  const revenueThisMonth = Number(dealsThisMonthResult._sum.dealValue) || 0;
  const averageDealValue = dealsClosed > 0 ? totalRevenue / dealsClosed : null;

  // Outreach Metrics
  const [totalLeads, qualifiedLeads, outreachEmailsSent, outreachStats] = await Promise.all([
    prisma.prospectLead.count({ where: { tenantId } }),
    prisma.prospectLead.count({
      where: { tenantId, status: 'QUALIFIED' },
    }),
    prisma.outreachEmail.count({
      where: { tenantId, status: 'SENT' },
    }),
    prisma.outreachEmail.aggregate({
      where: { tenantId },
      _count: { id: true },
    }),
  ]);

  // Calculate open/reply rates from events
  const [openEvents, replyEvents] = await Promise.all([
    prisma.outreachEmailEvent.count({
      where: { tenantId, type: 'EMAIL_OPEN' },
    }),
    prisma.outreachEmailEvent.count({
      where: { tenantId, type: 'REPLY_RECEIVED' },
    }),
  ]);

  const outreachOpenRate = outreachEmailsSent > 0 ? (openEvents / outreachEmailsSent) * 100 : 0;
  const outreachReplyRate = outreachEmailsSent > 0 ? (replyEvents / outreachEmailsSent) * 100 : 0;

  // Engagement Metrics
  const proposalViewRate = totalProposals > 0 ? (proposalsViewed / totalProposals) * 100 : 0;

  // Average time to accept (in days) - using sentAt as proxy for acceptance time
  const acceptedProposals = await prisma.proposal.findMany({
    where: { tenantId, status: 'ACCEPTED' },
    select: { createdAt: true, sentAt: true },
  });

  const timeToAcceptDays = acceptedProposals
    .map((p) => {
      if (!p.sentAt) return null;
      const diff = new Date(p.sentAt).getTime() - new Date(p.createdAt).getTime();
      return diff / (1000 * 60 * 60 * 24);
    })
    .filter((d): d is number => d !== null);

  const averageTimeToAccept =
    timeToAcceptDays.length > 0
      ? timeToAcceptDays.reduce((a, b) => a + b, 0) / timeToAcceptDays.length
      : null;

  // Active campaigns (outreach campaigns with pending emails)
  const activeCampaigns = await prisma.outreachEmail.count({
    where: { tenantId, status: { in: ['PENDING', 'SENT'] } },
  });

  return {
    tenantId,
    tenantName: tenant.name,
    planTier: tenant.planTier,
    status: tenant.status,

    // Audit Metrics
    totalAudits,
    auditsThisMonth,
    auditsLastMonth,
    auditGrowthRate: Math.round(auditGrowthRate * 100) / 100,
    averageAuditScore: auditScores._avg.overallScore
      ? Math.round(auditScores._avg.overallScore * 100) / 100
      : null,

    // Proposal Metrics
    totalProposals,
    proposalsThisMonth,
    proposalsSent,
    proposalsViewed,
    proposalsAccepted,
    proposalsRejected,
    proposalAcceptanceRate: Math.round(proposalAcceptanceRate * 100) / 100,
    averageProposalQualityScore: proposalQualityScores._avg.qaScore
      ? Math.round(proposalQualityScores._avg.qaScore * 100) / 100
      : null,

    // Deal Metrics
    dealsClosed,
    dealsThisMonth,
    totalRevenue,
    revenueThisMonth,
    averageDealValue: averageDealValue ? Math.round(averageDealValue * 100) / 100 : null,

    // Outreach Metrics
    totalLeads,
    qualifiedLeads,
    outreachEmailsSent,
    outreachOpenRate: Math.round(outreachOpenRate * 100) / 100,
    outreachReplyRate: Math.round(outreachReplyRate * 100) / 100,

    // Engagement Metrics
    proposalViewRate: Math.round(proposalViewRate * 100) / 100,
    averageTimeToAccept: averageTimeToAccept ? Math.round(averageTimeToAccept * 100) / 100 : null,
    activeCampaigns,

    generatedAt: now,
  };
}

/**
 * GET /api/analytics/tenant/[tenantId]/metrics
 *
 * Returns tenant-specific analytics for agency dashboard
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = params;

  try {
    // Validate auth header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const apiKey = authHeader.substring(7);
    const validationResult = await validateApiKey(apiKey, API_KEY_SCOPES.TENANT_READ);

    if (!validationResult) {
      throw new UnauthorizedError('Invalid API key');
    }

    if ('error' in validationResult) {
      throw new UnauthorizedError(validationResult.error);
    }

    // Verify requester has access to this tenant's data
    if (validationResult.tenantId !== tenantId) {
      // Check if admin
      const hasAdminScope =
        validationResult.scopes.includes(API_KEY_SCOPES.ALL) ||
        validationResult.scopes.includes('admin:*');
      if (!hasAdminScope) {
        throw new UnauthorizedError('Access denied to tenant metrics');
      }
    }

    const metrics = await getTenantMetrics(tenantId);

    logger.info(
      {
        event: 'analytics.tenant_metrics',
        tenantId,
        requestedBy: validationResult.keyId,
      },
      'Tenant metrics retrieved'
    );

    return NextResponse.json(metrics);
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to get tenant metrics');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Tenant not found', code: 'NOT_FOUND' },
        { status: 404, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to get tenant metrics', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}