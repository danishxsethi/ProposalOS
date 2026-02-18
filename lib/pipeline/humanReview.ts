/**
 * Human Review Queue
 * 
 * Routes high-value prospects to human operators for review and approval.
 * Provides full context (audit, proposal, engagement, Pain Score) for decision-making.
 * 
 * Requirements: 10.3, 10.4, 10.5, 10.7
 */

import { prisma } from '@/lib/db';
import { transition } from './stateMachine';
import type { ProspectLead, Audit, Proposal } from '@prisma/client';

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
export async function routeToReview(
  prospectId: string,
  reason: string
): Promise<void> {
  // Transition prospect to hot_lead status (which triggers human review)
  await transition(prospectId, 'hot_lead', 'deal_closer');

  // Log the routing action
  await prisma.pipelineErrorLog.create({
    data: {
      tenantId: (await prisma.prospectLead.findUnique({
        where: { id: prospectId },
        select: { tenantId: true },
      }))?.tenantId || '',
      stage: 'human_review',
      prospectId,
      errorType: 'ROUTED_TO_REVIEW',
      errorMessage: reason,
      metadata: {
        routedAt: new Date().toISOString(),
      },
    },
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

  // Build where clause
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

  // Get total count
  const total = await prisma.prospectLead.count({ where });

  // Get paginated results
  const prospects = await prisma.prospectLead.findMany({
    where,
    include: {
      audit: true,
      proposal: true,
      stateTransitions: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: sortBy === 'createdAt' || sortBy === 'updatedAt'
      ? { [sortBy]: sortOrder }
      : sortBy === 'engagementScore'
      ? { engagementScore: sortOrder }
      : { createdAt: sortOrder },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // Transform to ReviewQueueItem format
  const items: ReviewQueueItem[] = prospects.map(prospect => {
    const painBreakdown = (prospect.painScoreBreakdown as Record<string, number>) || {};
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
      stateHistory: prospect.stateTransitions.map(t => ({
        from: t.fromStatus,
        to: t.toStatus,
        timestamp: t.createdAt,
        stage: t.stage,
      })),
    };
  });

  // Apply pain score filters (post-query since it's computed)
  let filteredItems = items;
  if (minPainScore !== undefined) {
    filteredItems = filteredItems.filter(item => item.painScore >= minPainScore);
  }
  if (maxPainScore !== undefined) {
    filteredItems = filteredItems.filter(item => item.painScore <= maxPainScore);
  }

  // Sort by pain score if requested (post-query since it's computed)
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
}

/**
 * Approve a prospect in the review queue
 * Requirement 10.4: Log all approve/reject actions with operator identity
 */
export async function approveProspect(action: ReviewAction): Promise<void> {
  const { prospectId, operatorId, operatorEmail, notes } = action;

  // Get current prospect
  const prospect = await prisma.prospectLead.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    throw new Error(`Prospect ${prospectId} not found`);
  }

  // Transition to closing status
  await transition(prospectId, 'closing', 'human_review');

  // Log the approval action
  await prisma.pipelineErrorLog.create({
    data: {
      tenantId: prospect.tenantId,
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
}

/**
 * Reject a prospect in the review queue
 * Requirement 10.4, 10.5: Log all approve/reject actions with operator identity
 */
export async function rejectProspect(action: ReviewAction): Promise<void> {
  const { prospectId, operatorId, operatorEmail, reason, notes } = action;

  // Get current prospect
  const prospect = await prisma.prospectLead.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    throw new Error(`Prospect ${prospectId} not found`);
  }

  // Transition to closed_lost status
  await transition(prospectId, 'closed_lost', 'human_review');

  // Log the rejection action
  await prisma.pipelineErrorLog.create({
    data: {
      tenantId: prospect.tenantId,
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
}

/**
 * Get full context for a prospect in review
 * Requirement 10.3: Display full context (audit, proposal, engagement, Pain Score)
 */
export async function getProspectContext(prospectId: string): Promise<ReviewQueueItem | null> {
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

  const painBreakdown = (prospect.painScoreBreakdown as Record<string, number>) || {};
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
    stateHistory: prospect.stateTransitions.map(t => ({
      from: t.fromStatus,
      to: t.toStatus,
      timestamp: t.createdAt,
      stage: t.stage,
    })),
  };
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
  // Get prospects currently in review
  const inReview = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      pipelineStatus: 'hot_lead',
    },
  });

  const totalInReview = inReview.length;

  // Calculate average pain score
  const avgPainScore = inReview.length > 0
    ? inReview.reduce((sum, p) => {
        const breakdown = (p.painScoreBreakdown as Record<string, number>) || {};
        const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
        return sum + score;
      }, 0) / inReview.length
    : 0;

  // Calculate average engagement score
  const avgEngagementScore = inReview.length > 0
    ? inReview.reduce((sum, p) => sum + (p.engagementScore || 0), 0) / inReview.length
    : 0;

  // Get approval/rejection logs from last 30 days
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

  const approvals = reviewActions.filter(a => a.errorType === 'APPROVED').length;
  const rejections = reviewActions.filter(a => a.errorType === 'REJECTED').length;
  const total = approvals + rejections;

  const approvalRate = total > 0 ? approvals / total : 0;

  // Calculate average review time (placeholder - would need actual timing data)
  const avgReviewTime = 0; // TODO: Implement actual review time tracking

  return {
    totalInReview,
    avgPainScore,
    avgEngagementScore,
    approvalRate,
    avgReviewTime,
  };
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
  const prospect = await prisma.prospectLead.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    throw new Error(`Prospect ${prospectId} not found`);
  }

  // Transition to new status
  await transition(prospectId, newStatus as any, 'manual_override');

  // Log the override action
  await prisma.pipelineErrorLog.create({
    data: {
      tenantId: prospect.tenantId,
      stage: 'manual_override',
      prospectId,
      errorType: 'STATUS_OVERRIDE',
      errorMessage: `Status overridden by ${operatorEmail}: ${reason}`,
      metadata: {
        operatorId,
        operatorEmail,
        oldStatus: prospect.pipelineStatus,
        newStatus,
        reason,
        overriddenAt: new Date().toISOString(),
      },
    },
  });
}
