/**
 * Pipeline Metrics and Observability
 * 
 * Provides real-time pipeline metrics, stage failure logging, circuit breaker
 * functionality, and admin alerting for the autonomous pipeline.
 * 
 * Requirements: 10.1, 10.2, 10.6, 10.7
 */

import { prisma } from '@/lib/prisma';
import { PipelineStage, type PipelineMetrics, type DateRange } from './types';
import { pauseStage } from './orchestrator';

/**
 * Circuit breaker error rate threshold (10%)
 */
const CIRCUIT_BREAKER_THRESHOLD = 0.1;

/**
 * Circuit breaker rolling window duration (1 hour in milliseconds)
 */
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Get pipeline metrics for a tenant over a specified period
 * 
 * Calculates:
 * - Prospects discovered per day
 * - Audits completed per day
 * - Proposals generated per day
 * - Outreach emails sent per day
 * - Open rate, reply rate, conversion rate
 * - Per-stage error rates
 * - Total cost in cents
 * - Human touch rate
 * 
 * @param tenantId - Tenant ID
 * @param period - Date range for metrics calculation
 * @returns Pipeline metrics
 */
export async function getMetrics(
  tenantId: string,
  period: DateRange
): Promise<PipelineMetrics> {
  const { start, end } = period;
  const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  
  // Count prospects by status in the period
  const discoveredCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'discovered',
      createdAt: { gte: start, lte: end },
    },
  });
  
  const auditedCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'audited',
      updatedAt: { gte: start, lte: end },
    },
  });
  
  const proposedCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'QUALIFIED',
      updatedAt: { gte: start, lte: end },
    },
  });
  
  // Count outreach emails sent in the period
  const emailsSent = await prisma.outreachEmail.count({
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
  });
  
  // Calculate open rate, reply rate
  const emailEvents = await prisma.outreachEmailEvent.groupBy({
    by: ['type'],
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
    _count: true,
  });
  
  const openCount = emailEvents.find(e => e.type === 'EMAIL_OPEN')?._count || 0;
  const replyCount = emailEvents.find(e => e.type === 'REPLY_RECEIVED')?._count || 0;
  
  const openRate = emailsSent > 0 ? openCount / emailsSent : 0;
  const replyRate = emailsSent > 0 ? replyCount / emailsSent : 0;
  
  // Count conversions (closed_won)
  const conversions = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'closed_won',
      updatedAt: { gte: start, lte: end },
    },
  });
  
  const conversionRate = emailsSent > 0 ? conversions / emailsSent : 0;
  
  // Calculate stage error rates
  const stageErrorRates = await calculateStageErrorRates(tenantId, start, end);
  
  // Calculate total cost
  const totalCost = await calculateTotalCost(tenantId, start, end);
  
  // Calculate human touch rate (prospects in human review queue)
  const humanTouchCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'hot_lead',
      engagementScore: { gte: 95 }, // Top 5% by default
      updatedAt: { gte: start, lte: end },
    },
  });
  
  const totalProspects = await prisma.prospectLead.count({
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
  });
  
  const humanTouchRate = totalProspects > 0 ? humanTouchCount / totalProspects : 0;
  
  // Calculate per-day averages
  const discoveredPerDay = durationDays > 0 ? discoveredCount / durationDays : discoveredCount;
  const auditsCompletedPerDay = durationDays > 0 ? auditedCount / durationDays : auditedCount;
  const proposalsGeneratedPerDay = durationDays > 0 ? proposedCount / durationDays : proposedCount;
  const emailsSentPerDay = durationDays > 0 ? emailsSent / durationDays : emailsSent;
  
  return {
    tenantId,
    period: { start, end },
    discoveredPerDay,
    auditsCompletedPerDay,
    proposalsGeneratedPerDay,
    emailsSentPerDay,
    openRate,
    replyRate,
    conversionRate,
    stageErrorRates,
    totalCostCents: totalCost,
    humanTouchRate,
  };
}

/**
 * Log a pipeline stage failure
 * 
 * Records the failure to PipelineErrorLog with full context including:
 * - Stage name
 * - Error details
 * - Prospect identifier (if applicable)
 * - Tenant ID
 * 
 * @param stage - Pipeline stage where the failure occurred
 * @param prospectId - ID of the prospect (optional)
 * @param error - Error object
 * @param tenantId - Tenant ID
 */
export async function logStageFailure(
  stage: PipelineStage,
  prospectId: string | null,
  error: Error,
  tenantId: string
): Promise<void> {
  await prisma.pipelineErrorLog.create({
    data: {
      tenantId,
      stage,
      prospectId: prospectId || undefined,
      errorType: error.name || 'Error',
      errorMessage: error.message,
      stackTrace: error.stack,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    },
  });
}

/**
 * Check circuit breaker for a pipeline stage
 * 
 * Monitors error rate over a rolling 1-hour window. If the error rate exceeds
 * 10%, the stage is paused and an admin alert is triggered.
 * 
 * @param stage - Pipeline stage to check
 * @param tenantId - Tenant ID
 * @returns True if circuit breaker tripped (stage should be paused), false otherwise
 */
export async function checkCircuitBreaker(
  stage: PipelineStage,
  tenantId: string
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - CIRCUIT_BREAKER_WINDOW_MS);
  
  // Get error count for this stage in the rolling window
  const errorCount = await prisma.pipelineErrorLog.count({
    where: {
      tenantId,
      stage,
      createdAt: { gte: windowStart, lte: now },
    },
  });
  
  // Get total operation count for this stage in the rolling window
  // (from state transitions)
  const totalCount = await prisma.prospectStateTransition.count({
    where: {
      tenantId,
      stage,
      createdAt: { gte: windowStart, lte: now },
    },
  });
  
  // Calculate error rate
  const errorRate = totalCount > 0 ? errorCount / totalCount : 0;
  
  // Check if error rate exceeds threshold
  if (errorRate > CIRCUIT_BREAKER_THRESHOLD) {
    // Pause the stage
    await pauseStage(stage, tenantId);
    
    // Alert admin
    await alertAdmin(
      tenantId,
      `Circuit breaker tripped for stage ${stage}. Error rate: ${(errorRate * 100).toFixed(2)}% (${errorCount}/${totalCount} operations failed in the last hour). Stage has been paused.`
    );
    
    return true;
  }
  
  return false;
}

/**
 * Send an alert to the platform administrator
 * 
 * Currently logs to console. In production, this would integrate with:
 * - Email notifications
 * - Slack/Discord webhooks
 * - PagerDuty or similar alerting systems
 * - Admin dashboard notifications
 * 
 * @param tenantId - Tenant ID
 * @param message - Alert message
 */
export async function alertAdmin(
  tenantId: string,
  message: string
): Promise<void> {
  // Log to console
  console.error(`[ADMIN ALERT] Tenant ${tenantId}: ${message}`);
  
  // TODO: In production, integrate with:
  // - Email service (SendGrid, AWS SES)
  // - Webhook notifications (Slack, Discord)
  // - PagerDuty or similar alerting
  // - Admin dashboard real-time notifications
  
  // For now, we'll create a record in the database that can be queried by the admin dashboard
  await prisma.pipelineErrorLog.create({
    data: {
      tenantId,
      stage: 'system',
      errorType: 'ADMIN_ALERT',
      errorMessage: message,
      metadata: {
        alertType: 'circuit_breaker',
        timestamp: new Date().toISOString(),
      },
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate error rates for each stage in a given period
 */
async function calculateStageErrorRates(
  tenantId: string,
  start: Date,
  end: Date
): Promise<Record<PipelineStage, number>> {
  const errorRates: Record<PipelineStage, number> = {
    [PipelineStage.DISCOVERY]: 0,
    [PipelineStage.AUDIT]: 0,
    [PipelineStage.DIAGNOSIS]: 0,
    [PipelineStage.PROPOSAL]: 0,
    [PipelineStage.OUTREACH]: 0,
    [PipelineStage.CLOSING]: 0,
    [PipelineStage.DELIVERY]: 0,
  };
  
  // Get error counts by stage
  const errorCounts = await prisma.pipelineErrorLog.groupBy({
    by: ['stage'],
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
    _count: true,
  });
  
  // Get total operation counts by stage (from state transitions)
  const totalCounts = await prisma.prospectStateTransition.groupBy({
    by: ['stage'],
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
    _count: true,
  });
  
  // Calculate error rates
  for (const stage of Object.values(PipelineStage)) {
    const errorCount = errorCounts.find(e => e.stage === stage)?._count || 0;
    const totalCount = totalCounts.find(t => t.stage === stage)?._count || 0;
    
    errorRates[stage] = totalCount > 0 ? errorCount / totalCount : 0;
  }
  
  return errorRates;
}

/**
 * Calculate total cost for a tenant in a given period
 */
async function calculateTotalCost(
  tenantId: string,
  start: Date,
  end: Date
): Promise<number> {
  // Sum estimatedCostCents from ProspectLead
  const prospectCosts = await prisma.prospectLead.aggregate({
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
    _sum: { estimatedCostCents: true },
  });
  
  // Sum audit costs (apiCostCents field)
  const auditCosts = await prisma.audit.aggregate({
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
    },
    _sum: { apiCostCents: true },
  });
  
  const prospectTotal = prospectCosts._sum.estimatedCostCents || 0;
  const auditTotal = auditCosts._sum.apiCostCents || 0;
  
  return prospectTotal + auditTotal;
}
