/**
 * Pipeline Orchestrator
 * 
 * Central controller managing prospect state transitions, batch processing,
 * concurrency limiting, tenant spending limit checks, and stage execution.
 * 
 * Requirements: 2.5, 9.5, 11.3, 11.4
 */

import { prisma } from '@/lib/prisma';
import { transition } from './stateMachine';
import {
  PipelineStage,
  type ProspectStatus,
  type StageResult,
  type PipelineConfig,
  type PipelineMetrics,
} from './types';

/**
 * Process a batch of prospects for a given pipeline stage
 * 
 * Enforces:
 * - Concurrency limits via Promise pool pattern
 * - Tenant spending limits before each batch
 * - Paused stage checks
 * - FIFO queue ordering
 * 
 * @param stage - Pipeline stage to process
 * @param tenantId - Tenant ID
 * @param batchSize - Number of prospects to process
 * @returns Array of StageResult records
 */
export async function processStage(
  stage: PipelineStage,
  tenantId: string,
  batchSize: number
): Promise<StageResult[]> {
  // Fetch tenant pipeline config
  const config = await getPipelineConfig(tenantId);
  
  // Check if stage is paused
  const pausedStages = (config.pausedStages as string[]) || [];
  if (pausedStages.includes(stage)) {
    console.log(`Stage ${stage} is paused for tenant ${tenantId}`);
    return [];
  }
  
  // Check tenant spending limit
  const canProceed = await checkSpendingLimit(tenantId, config.spendingLimitCents);
  if (!canProceed) {
    console.log(`Spending limit reached for tenant ${tenantId}, pausing pipeline`);
    await pauseAllStages(tenantId);
    return [];
  }
  
  // Fetch prospects for this stage (FIFO ordering by createdAt)
  const prospects = await getProspectsForStage(stage, tenantId, batchSize);
  
  if (prospects.length === 0) {
    return [];
  }
  
  // Process with concurrency limit using Promise pool pattern
  const results = await processWithConcurrencyLimit(
    prospects,
    config.concurrencyLimit,
    async (prospect) => {
      return await processProspect(prospect, stage, tenantId);
    }
  );
  
  return results;
}

/**
 * Transition a prospect to a new status
 * 
 * Delegates to the state machine for validation and persistence.
 * 
 * @param prospectId - ID of the prospect
 * @param toStatus - Target status
 */
export async function transitionProspect(
  prospectId: string,
  toStatus: ProspectStatus
): Promise<void> {
  // Determine the stage based on the target status
  const stage = getStageForStatus(toStatus);
  
  // Delegate to state machine
  await transition(prospectId, toStatus, stage);
}

/**
 * Get pipeline metrics for a tenant
 * 
 * @param tenantId - Tenant ID
 * @returns Pipeline metrics
 */
export async function getMetrics(tenantId: string): Promise<PipelineMetrics> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Count prospects by status in the last 24 hours
  const discoveredCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'discovered',
      createdAt: { gte: oneDayAgo },
    },
  });
  
  const auditedCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'audited',
      updatedAt: { gte: oneDayAgo },
    },
  });
  
  const proposedCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'proposed',
      updatedAt: { gte: oneDayAgo },
    },
  });
  
  // Count outreach emails sent in the last 24 hours
  const emailsSent = await prisma.outreachEmail.count({
    where: {
      tenantId,
      createdAt: { gte: oneDayAgo },
    },
  });
  
  // Calculate open rate, reply rate, conversion rate
  const emailEvents = await prisma.outreachEmailEvent.groupBy({
    by: ['type'],
    where: {
      tenantId,
      createdAt: { gte: oneDayAgo },
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
      updatedAt: { gte: oneDayAgo },
    },
  });
  
  const conversionRate = emailsSent > 0 ? conversions / emailsSent : 0;
  
  // Calculate stage error rates
  const stageErrorRates = await calculateStageErrorRates(tenantId, oneDayAgo, now);
  
  // Calculate total cost
  const totalCost = await calculateTotalCost(tenantId, oneDayAgo, now);
  
  // Calculate human touch rate (prospects in human review queue)
  const humanTouchCount = await prisma.prospectLead.count({
    where: {
      tenantId,
      pipelineStatus: 'hot_lead',
      engagementScore: { gte: 95 }, // Top 5% by default
    },
  });
  
  const totalProspects = await prisma.prospectLead.count({
    where: { tenantId },
  });
  
  const humanTouchRate = totalProspects > 0 ? humanTouchCount / totalProspects : 0;
  
  return {
    tenantId,
    period: { start: oneDayAgo, end: now },
    discoveredPerDay: discoveredCount,
    auditsCompletedPerDay: auditedCount,
    proposalsGeneratedPerDay: proposedCount,
    emailsSentPerDay: emailsSent,
    openRate,
    replyRate,
    conversionRate,
    stageErrorRates,
    totalCostCents: totalCost,
    humanTouchRate,
  };
}

/**
 * Pause a pipeline stage for a tenant
 * 
 * @param stage - Pipeline stage to pause
 * @param tenantId - Tenant ID
 */
export async function pauseStage(
  stage: PipelineStage,
  tenantId: string
): Promise<void> {
  const config = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });
  
  if (!config) {
    throw new Error(`Pipeline config not found for tenant ${tenantId}`);
  }
  
  const pausedStages = (config.pausedStages as string[]) || [];
  
  if (!pausedStages.includes(stage)) {
    pausedStages.push(stage);
    
    await prisma.pipelineConfig.update({
      where: { tenantId },
      data: { pausedStages },
    });
  }
}

/**
 * Resume a pipeline stage for a tenant
 * 
 * @param stage - Pipeline stage to resume
 * @param tenantId - Tenant ID
 */
export async function resumeStage(
  stage: PipelineStage,
  tenantId: string
): Promise<void> {
  const config = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });
  
  if (!config) {
    throw new Error(`Pipeline config not found for tenant ${tenantId}`);
  }
  
  const pausedStages = (config.pausedStages as string[]) || [];
  const filteredStages = pausedStages.filter(s => s !== stage);
  
  await prisma.pipelineConfig.update({
    where: { tenantId },
    data: { pausedStages: filteredStages },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get pipeline config for a tenant, creating default if not exists
 */
async function getPipelineConfig(tenantId: string): Promise<PipelineConfig & { pausedStages: string[] }> {
  let config = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });
  
  if (!config) {
    // Create default config
    config = await prisma.pipelineConfig.create({
      data: { tenantId },
    });
  }
  
  return {
    tenantId,
    concurrencyLimit: config.concurrencyLimit,
    batchSize: config.batchSize,
    painScoreThreshold: config.painScoreThreshold,
    dailyVolumeLimit: config.dailyVolumeLimit,
    spendingLimitCents: config.spendingLimitCents,
    hotLeadPercentile: config.hotLeadPercentile,
    pausedStages: (config.pausedStages as string[]) || [],
  };
}

/**
 * Check if tenant has exceeded spending limit for current billing cycle
 */
async function checkSpendingLimit(
  tenantId: string,
  limitCents: number
): Promise<boolean> {
  // Get current billing cycle start (first day of current month)
  const now = new Date();
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Sum up all costs for this tenant in current cycle
  const totalCost = await calculateTotalCost(tenantId, cycleStart, now);
  
  return totalCost < limitCents;
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

/**
 * Pause all stages for a tenant (when spending limit reached)
 */
async function pauseAllStages(tenantId: string): Promise<void> {
  const allStages = Object.values(PipelineStage);
  
  await prisma.pipelineConfig.update({
    where: { tenantId },
    data: { pausedStages: allStages },
  });
}

/**
 * Get prospects for a given stage in FIFO order
 */
async function getProspectsForStage(
  stage: PipelineStage,
  tenantId: string,
  batchSize: number
): Promise<any[]> {
  const statusForStage = getStatusForStage(stage);
  
  return await prisma.prospectLead.findMany({
    where: {
      tenantId,
      pipelineStatus: statusForStage,
    },
    orderBy: { createdAt: 'asc' }, // FIFO ordering
    take: batchSize,
  });
}

/**
 * Get the prospect status that corresponds to a pipeline stage
 */
function getStatusForStage(stage: PipelineStage): ProspectStatus {
  const statusMap: Record<PipelineStage, ProspectStatus> = {
    [PipelineStage.DISCOVERY]: 'discovered',
    [PipelineStage.AUDIT]: 'discovered',
    [PipelineStage.DIAGNOSIS]: 'audited',
    [PipelineStage.PROPOSAL]: 'audited',
    [PipelineStage.OUTREACH]: 'proposed',
    [PipelineStage.CLOSING]: 'outreach_sent',
    [PipelineStage.DELIVERY]: 'closed_won',
  };
  
  return statusMap[stage];
}

/**
 * Get the pipeline stage for a given status
 */
function getStageForStatus(status: ProspectStatus): PipelineStage {
  const stageMap: Record<ProspectStatus, PipelineStage> = {
    discovered: PipelineStage.DISCOVERY,
    audited: PipelineStage.DIAGNOSIS,
    proposed: PipelineStage.OUTREACH,
    outreach_sent: PipelineStage.CLOSING,
    hot_lead: PipelineStage.CLOSING,
    closing: PipelineStage.CLOSING,
    closed_won: PipelineStage.DELIVERY,
    delivering: PipelineStage.DELIVERY,
    delivered: PipelineStage.DELIVERY,
    unqualified: PipelineStage.DISCOVERY,
    audit_failed: PipelineStage.AUDIT,
    low_value: PipelineStage.DIAGNOSIS,
    closed_lost: PipelineStage.CLOSING,
  };
  
  return stageMap[status];
}

/**
 * Process a single prospect for a given stage
 * 
 * This is a placeholder that will be implemented by stage-specific handlers
 */
async function processProspect(
  prospect: any,
  stage: PipelineStage,
  tenantId: string
): Promise<StageResult> {
  // This is a placeholder implementation
  // In a real implementation, this would delegate to stage-specific handlers
  // For now, we'll just return a success result
  
  const fromStatus = prospect.pipelineStatus as ProspectStatus;
  
  return {
    success: true,
    prospectId: prospect.id,
    fromStatus,
    toStatus: fromStatus, // No change for now
    costCents: 0,
  };
}

/**
 * Process items with concurrency limit using Promise pool pattern
 * 
 * Ensures that no more than `limit` promises are executing concurrently.
 * 
 * @param items - Array of items to process
 * @param limit - Maximum number of concurrent operations
 * @param processor - Async function to process each item
 * @returns Array of results
 */
async function processWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Set<Promise<void>> = new Set();
  
  for (const item of items) {
    // Create a promise for this item
    const promise = processor(item)
      .then(result => {
        results.push(result);
      })
      .catch(error => {
        // Log error but don't fail the entire batch
        console.error('Error processing item:', error);
      })
      .finally(() => {
        // Remove from executing set when done
        executing.delete(promise);
      });
    
    executing.add(promise);
    
    // If we've reached the limit, wait for one to complete
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  
  // Wait for all remaining promises to complete
  await Promise.all(Array.from(executing));
  
  return results;
}

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
