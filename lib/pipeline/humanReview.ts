/**
 * Human Review Queue
 *
 * Routes high-value prospects to human operators for review and approval.
 * Provides full context (audit, proposal, engagement, Pain Score) for decision-making.
 *
 * Requirements: 10.3, 10.4, 10.5, 10.7
 */

import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

import { transition } from './stateMachine';

import type { Audit, Proposal, ProspectLead } from '@prisma/client';

export interface ReviewQueueItem {
  prospect: ProspectLead & {
    audit?: Audit | null;
    proposal?: Proposal | null;
  };
  painScore: number;
  painBreakdown: Record<string, number>;
  engagementScore: number;
  stateHistory: Array<{
    from: string;
    to: string;
    timestamp: Date;
    stage: string;
  }>;
}

export interface ReviewQueueFilters {
  status?: string[];
  vertical?: string[];
  minPainScore?: number;
  maxPainScore?: number;
  minEngagementScore?: number;
  sortBy?: 'painScore' | 'engagementScore' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ReviewAction {
  prospectId: string;
  action: 'approve' | 'reject';
  operatorId: string;
  operatorEmail: string;
  reason?: string;
  notes?: string;
}

/**
 * Route a prospect to the human review queue
 * Requirement 10.3: Display full context for review
 */
export async function routeToReview(prospectId: string, reason: string): Promise<void> {
  const dbModule = await import('@/lib/db');
  const tenantId =
    (
      await dbModule.prisma.prospectLead.findUnique({
        where: { id: prospectId },
        select: { tenantId: true },
      })
    )?.tenantId || '';

  await runWithTenantAsync(tenantId, async () => {
    await transition(prospectId, 'hot_lead', 'deal_closer');

    await prisma.pipelineErrorLog.create({
      data: {
        tenantId,
        stage: 'human_review',
        prospectId,
        errorType: 'ROUTED_TO_REVIEW',
        errorMessage: reason,
        metadata: {
          routedAt: new Date().toISOString(),
        },
      },
    });
  });
}

/**
 * Get the review queue with filtering and sorting
 * Requirement 10.3, 10.5: Support filtering and sorting
 */
export async function getReviewQueue(
  tenantId: string,
  filters: ReviewQueueFilters = {}
): Promise<{
  items: ReviewQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  return runWithTenantAsync(tenantId, async () => {
    const {
      status = ['hot_lead'],
      vertical,
      minPainScore,
      maxPainScore,
      minEngagementScore,
      sortBy = 'engagementScore',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
    } = filters;

    // Preserve the explicit tenantId filter even though the ALS context scopes the client.
    const where: any = {
      tenantId,
      pipelineStatus: { in: status },
    };

    if (vertical && vertical.length > 0) {
      where.vertical = { in: vertical };
    }

    if (minEngagementScore !== undefined) {
      where.engagementScore = { gte: minEngagementScore };
    }

    const prospects = await prisma.prospectLead.findMany({
      where,
      include: {
        audit: true,
        proposal: true,
        stateTransitions: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy:
        sortBy === 'createdAt' || sortBy === 'updatedAt'
          ? { [sortBy]: sortOrder }
          : sortBy === 'engagementScore'
            ? { engagementScore: sortOrder }
            : { createdAt: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const items: ReviewQueueItem[] = prospects.map((prospect) => {
      const painBreakdown = (prospect.painBreakdown as Record<string, number>) || {};
      const painScore = Object.values(painBreakdown).reduce((sum, val) => sum + val, 0);

      return {
        prospect: {
          ...prospect,
          audit: prospect.audit || null,
          proposal: prospect.proposal || null,
        },
        painScore,
        painBreakdown,
        engagementScore: prospect.engagementScore || 0,
        stateHistory: prospect.stateTransitions.map((t) => ({
          from: t.fromStatus,
          to: t.toStatus,
          timestamp: t.createdAt,
          stage: t.stage,
        })),
      };
    });

    let filteredItems = items;
    if (minPainScore !== undefined) {
      filteredItems = filteredItems.filter((item) => item.painScore >= minPainScore);
    }
    if (maxPainScore !== undefined) {
      filteredItems = filteredItems.filter((item) => item.painScore <= maxPainScore);
    }

    if (sortBy === 'painScore') {
      filteredItems.sort((a, b) => {
        const diff = a.painScore - b.painScore;
        return sortOrder === 'asc' ? diff : -diff;
      });
    }

    return {
      items: filteredItems,
      total: filteredItems.length,
      page,
      pageSize,
      totalPages: Math.ceil(filteredItems.length / pageSize),
    };
  });
}

/**
 * Approve a prospect in the review queue
 * Requirement 10.4: Log all approve/reject actions with operator identity
 */
export async function approveProspect(action: ReviewAction): Promise<void> {
  const { prospectId, operatorId, operatorEmail, notes } = action;

  // Get prospect from global prisma to find tenantId
  const dbModule = await import('@/lib/db');
  const prospectRaw = await dbModule.prisma.prospectLead.findUnique({
    where: { id: prospectId },
    select: { tenantId: true },
  });

  if (!prospectRaw) {
    throw new Error(`Prospect ${prospectId} not found`);
  }

  await runWithTenantAsync(prospectRaw.tenantId, async () => {
    await transition(prospectId, 'closing', 'human_review');

    await prisma.pipelineErrorLog.create({
      data: {
        tenantId: prospectRaw.tenantId,
        stage: 'human_review',
        prospectId,
        errorType: 'APPROVED',
        errorMessage: `Approved by ${operatorEmail}`,
        metadata: {
          operatorId,
          operatorEmail,
          notes: notes || '',
          approvedAt: new Date().toISOString(),
        },
      },
    });
  });
}

/**
 * Reject a prospect in the review queue
 * Requirement 10.4, 10.5: Log all approve/reject actions with operator identity
 */
export async function rejectProspect(action: ReviewAction): Promise<void> {
  const { prospectId, operatorId, operatorEmail, reason, notes } = action;

  // Get prospect from global prisma to find tenantId
  const dbModule = await import('@/lib/db');
  const prospectRaw = await dbModule.prisma.prospectLead.findUnique({
    where: { id: prospectId },
    select: { tenantId: true },
  });

  if (!prospectRaw) {
    throw new Error(`Prospect ${prospectId} not found`);
  }

  await runWithTenantAsync(prospectRaw.tenantId, async () => {
    await transition(prospectId, 'closed_lost', 'human_review');

    await prisma.pipelineErrorLog.create({
      data: {
        tenantId: prospectRaw.tenantId,
        stage: 'human_review',
        prospectId,
        errorType: 'REJECTED',
        errorMessage: `Rejected by ${operatorEmail}: ${reason || 'No reason provided'}`,
        metadata: {
          operatorId,
          operatorEmail,
          reason: reason || '',
          notes: notes || '',
          rejectedAt: new Date().toISOString(),
        },
      },
    });
  });
}

/**
 * Get full context for a prospect in review
 * Requirement 10.3: Display full context (audit, proposal, engagement, Pain Score)
 */
export async function getProspectContext(prospectId: string): Promise<ReviewQueueItem | null> {
  const dbModule = await import('@/lib/db');
  const pRaw = await dbModule.prisma.prospectLead.findUnique({
    where: { id: prospectId },
    select: { tenantId: true },
  });
  if (!pRaw) return null;

  return runWithTenantAsync(pRaw.tenantId, async () => {
    const prospect = await prisma.prospectLead.findUnique({
      where: { id: prospectId },
      include: {
        audit: {
          include: {
            findings: true,
          },
        },
        proposal: true,
        stateTransitions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!prospect) {
      return null;
    }

    const painBreakdown = (prospect.painBreakdown as Record<string, number>) || {};
    const painScore = Object.values(painBreakdown).reduce((sum, val) => sum + val, 0);

    return {
      prospect: {
        ...prospect,
        audit: prospect.audit || null,
        proposal: prospect.proposal || null,
      },
      painScore,
      painBreakdown,
      engagementScore: prospect.engagementScore || 0,
      stateHistory: prospect.stateTransitions.map((t) => ({
        from: t.fromStatus,
        to: t.toStatus,
        timestamp: t.createdAt,
        stage: t.stage,
      })),
    };
  });
}

/**
 * Get review queue statistics
 * Requirement 10.1: Expose real-time pipeline metrics
 */
export async function getReviewQueueStats(tenantId: string): Promise<{
  totalInReview: number;
  avgPainScore: number;
  avgEngagementScore: number;
  approvalRate: number;
  avgReviewTime: number;
}> {
  return runWithTenantAsync(tenantId, async () => {
    const inReview = await prisma.prospectLead.findMany({
      where: {
        tenantId,
        pipelineStatus: 'hot_lead',
      },
    });

    const totalInReview = inReview.length;

    const avgPainScore =
      inReview.length > 0
        ? inReview.reduce((sum, p) => {
            const breakdown = (p.painBreakdown as Record<string, number>) || {};
            const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
            return sum + score;
          }, 0) / inReview.length
        : 0;

    const avgEngagementScore =
      inReview.length > 0
        ? inReview.reduce((sum, p) => sum + (p.engagementScore || 0), 0) / inReview.length
        : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const reviewActions = await prisma.pipelineErrorLog.findMany({
      where: {
        tenantId,
        stage: 'human_review',
        errorType: { in: ['APPROVED', 'REJECTED'] },
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const approvals = reviewActions.filter((a) => a.errorType === 'APPROVED').length;
    const rejections = reviewActions.filter((a) => a.errorType === 'REJECTED').length;
    const total = approvals + rejections;

    const approvalRate = total > 0 ? approvals / total : 0;

    const avgReviewTime = 0; // TODO: Implement actual review time tracking

    return {
      totalInReview,
      avgPainScore,
      avgEngagementScore,
      approvalRate,
      avgReviewTime,
    };
  });
}

/**
 * Manually override a prospect's status
 * Requirement 10.7: Allow manual status overrides
 */
export async function overrideProspectStatus(
  prospectId: string,
  newStatus: string,
  operatorId: string,
  operatorEmail: string,
  reason: string
): Promise<void> {
  const dbModule = await import('@/lib/db');
  const prospectRaw = await dbModule.prisma.prospectLead.findUnique({
    where: { id: prospectId },
    select: { tenantId: true, pipelineStatus: true },
  });

  if (!prospectRaw) {
    throw new Error(`Prospect ${prospectId} not found`);
  }

  await runWithTenantAsync(prospectRaw.tenantId, async () => {
    await transition(prospectId, newStatus as any, 'manual_override');

    await prisma.pipelineErrorLog.create({
      data: {
        tenantId: prospectRaw.tenantId,
        stage: 'manual_override',
        prospectId,
        errorType: 'STATUS_OVERRIDE',
        errorMessage: `Status overridden by ${operatorEmail}: ${reason}`,
        metadata: {
          operatorId,
          operatorEmail,
          oldStatus: prospectRaw.pipelineStatus,
          newStatus,
          reason,
          overriddenAt: new Date().toISOString(),
        },
      },
    });
  });
}
