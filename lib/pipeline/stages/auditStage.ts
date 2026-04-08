/**
 * Audit Pipeline Stage
 *
 * Processes prospects in "discovered" status by queuing full audits via the
 * existing Audit Orchestrator, then transitioning to "audited" or "audit_failed"
 * based on the result. Records audit cost against the tenant.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6
 */

import { prisma } from '@/lib/prisma';
import { transition } from '../stateMachine';
import { logStageFailure } from '../metrics';
// P0-3: Redirect to single source of truth
import { runAudit } from '@/lib/audit/runner';
import { CostTracker } from '@/lib/costs/costTracker';
import { PipelineStage, type StageResult, type ProspectStatus } from '../types';

/**
 * Process a batch of prospects in "discovered" status through the audit stage.
 *
 * For each prospect:
 * 1. Creates an Audit record in the database
 * 2. Runs the AuditOrchestrator
 * 3. On success (COMPLETE/PARTIAL): transitions to "audited", links auditId, stores findings
 * 4. On failure (FAILED): transitions to "audit_failed"
 * 5. Records audit cost against the tenant
 *
 * Individual audit failures do not stop the batch.
 */
export async function processAuditStage(
  tenantId: string,
  batchSize: number
): Promise<StageResult[]> {
  const prospects = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      pipelineStatus: 'discovered',
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const results: StageResult[] = [];

  for (const prospect of prospects) {
    try {
      const result = await processOneAudit(prospect.id);
      results.push(result);
    } catch (error) {
      // Individual failures should not stop the batch
      const err = error instanceof Error ? error : new Error(String(error));
      await logStageFailure(PipelineStage.AUDIT, prospect.id, err, tenantId);
      results.push({
        success: false,
        prospectId: prospect.id,
        fromStatus: 'discovered',
        toStatus: 'discovered',
        costCents: 0,
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Process a single prospect through the audit stage.
 */
export async function processOneAudit(prospectId: string): Promise<StageResult> {
  const prospect = await prisma.prospectLead.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    throw new Error(`Prospect not found: ${prospectId}`);
  }

  if (prospect.pipelineStatus !== 'discovered') {
    throw new Error(
      `Prospect ${prospectId} is in status "${prospect.pipelineStatus}", expected "discovered"`
    );
  }

  const tenantId = prospect.tenantId;

  // 1. Create an Audit record in the database
  const audit = await prisma.audit.create({
    data: {
      businessName: prospect.businessName,
      businessCity: prospect.city,
      businessUrl: prospect.website || undefined,
      businessIndustry: prospect.vertical,
      status: 'QUEUED',
      tenantId,
    },
  });

  // 2. Run the audit via runner (P0-3)
  try {
    await runAudit(audit.id);
  } catch (error) {
    // runner threw (e.g. timeout)
    const err = error instanceof Error ? error : new Error(String(error));
    // Check cost from DB if partially completed before throw
    const updated = await prisma.audit.findUnique({ where: { id: audit.id } });
    const costCents = updated?.apiCostCents ?? 0;

    await handleAuditFailure(audit.id, tenantId, costCents, err.message);
    await transition(prospectId, 'audit_failed', PipelineStage.AUDIT);

    return {
      success: false,
      prospectId,
      fromStatus: 'discovered',
      toStatus: 'audit_failed',
      costCents,
      error: err.message,
      metadata: { auditId: audit.id },
    };
  }

  // Fetch updated audit to get cost and status
  const updatedAudit = await prisma.audit.findUnique({
    where: { id: audit.id }
  });

  const costCents = updatedAudit?.apiCostCents ?? 0;
  const isSuccess =
    updatedAudit?.status === 'COMPLETE' || updatedAudit?.status === 'PARTIAL' || (updatedAudit?.status as any) === 'DEGRADED';

  if (isSuccess) {
    // 3. Success: link to prospect, transition to "audited"
    await prisma.prospectLead.update({
      where: { id: prospectId },
      data: { auditId: audit.id },
    });

    await transition(prospectId, 'audited', PipelineStage.AUDIT);

    // Record cost against tenant
    await recordTenantCost(tenantId, costCents, audit.id);

    return {
      success: true,
      prospectId,
      fromStatus: 'discovered',
      toStatus: 'audited',
      costCents,
      metadata: {
        auditId: audit.id,
        auditStatus: updatedAudit?.status,
        modulesCompleted: updatedAudit?.modulesCompleted,
      },
    };
  } else {
    // 4. Failure: mark audit as failed, transition to "audit_failed"
    await handleAuditFailure(
      audit.id,
      tenantId,
      costCents,
      `Audit completed with status: ${updatedAudit?.status}`
    );
    await transition(prospectId, 'audit_failed', PipelineStage.AUDIT);

    // Still record cost even on failure
    await recordTenantCost(tenantId, costCents, audit.id);

    return {
      success: false,
      prospectId,
      fromStatus: 'discovered',
      toStatus: 'audit_failed',
      costCents,
      error: `Audit completed with status: ${updatedAudit?.status}`,
      metadata: { auditId: audit.id, auditStatus: updatedAudit?.status },
    };
  }
}

/**
 * Update the audit record to FAILED status and log the failure.
 */
async function handleAuditFailure(
  auditId: string,
  tenantId: string,
  costCents: number,
  errorMessage: string
): Promise<void> {
  await prisma.audit.update({
    where: { id: auditId },
    data: {
      status: 'FAILED',
      apiCostCents: costCents,
      completedAt: new Date(),
    },
  });

  await logStageFailure(
    PipelineStage.AUDIT,
    auditId,
    new Error(errorMessage),
    tenantId
  );
}

/**
 * Record audit cost against the tenant by creating a pipeline error log entry
 * with cost metadata. This enables per-tenant cost tracking.
 */
async function recordTenantCost(
  tenantId: string,
  costCents: number,
  auditId: string
): Promise<void> {
  if (costCents <= 0) return;

  await prisma.pipelineErrorLog.create({
    data: {
      tenantId,
      stage: PipelineStage.AUDIT,
      errorType: 'COST_RECORD',
      errorMessage: `Audit cost: ${costCents} cents`,
      metadata: {
        auditId,
        costCents,
        recordedAt: new Date().toISOString(),
      },
    },
  });
}
