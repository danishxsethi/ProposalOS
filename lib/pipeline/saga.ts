/**
 * Saga Pattern Implementation
 *
 * Provides compensation transactions for multi-stage pipeline operations.
 * Ensures data consistency by rolling back changes when a stage fails.
 *
 * Requirements: Saga pattern for multi-stage rollback, data consistency
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { PipelineStage, ProspectStatus } from './types';

/**
 * Compensation action type
 */
export type CompensationAction =
  | { type: 'DELETE_PROPOSAL'; proposalId: string }
  | { type: 'DELETE_AUDIT'; auditId: string }
  | {
      type: 'REVERT_STATUS';
      prospectId: string;
      fromStatus: ProspectStatus;
      toStatus: ProspectStatus;
    }
  | { type: 'DELETE_FINDINGS'; auditId: string }
  | { type: 'DELETE_EVIDENCE'; auditId: string };

/**
 * Saga step record
 */
export interface SagaStep {
  action: string;
  compensation: CompensationAction;
  completed: boolean;
  result?: unknown;
}

/**
 * Saga execution context
 */
export interface SagaContext {
  id: string;
  tenantId: string;
  prospectId?: string;
  auditId?: string;
  proposalId?: string;
  steps: SagaStep[];
  completed: boolean;
  failed: boolean;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Create a new saga context
 */
export function createSagaContext(
  tenantId: string,
  options: {
    prospectId?: string;
    auditId?: string;
    proposalId?: string;
  } = {}
): SagaContext {
  return {
    id: `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    tenantId,
    ...options,
    steps: [],
    completed: false,
    failed: false,
    createdAt: new Date(),
  };
}

/**
 * Execute a saga step with compensation
 */
export async function executeStep(
  saga: SagaContext,
  action: () => Promise<unknown>,
  compensation: CompensationAction
): Promise<unknown> {
  const step: SagaStep = {
    action: compensation.type,
    compensation,
    completed: false,
  };

  saga.steps.push(step);

  try {
    const result = await action();
    step.completed = true;
    step.result = result;
    return result;
  } catch (error) {
    saga.failed = true;
    saga.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}

/**
 * Execute all compensation actions in reverse order (rollback)
 */
export async function rollback(saga: SagaContext): Promise<{
  success: boolean;
  rolledBack: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let rolledBack = 0;
  let failed = 0;

  logger.info(
    {
      event: 'saga.rollback.start',
      sagaId: saga.id,
      tenantId: saga.tenantId,
      stepCount: saga.steps.length,
    },
    `Starting saga rollback for ${saga.id}`
  );

  // Execute compensations in reverse order
  const completedSteps = saga.steps.filter((s) => s.completed);
  for (const step of completedSteps.reverse()) {
    try {
      await executeCompensation(step.compensation, saga.tenantId);
      rolledBack++;
      logger.info(
        {
          event: 'saga.rollback.step',
          sagaId: saga.id,
          action: step.action,
        },
        `Rolled back: ${step.action}`
      );
    } catch (error) {
      failed++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${step.action}: ${errorMsg}`);
      logger.error(
        {
          event: 'saga.rollback.failed',
          sagaId: saga.id,
          action: step.action,
          error: errorMsg,
        },
        `Failed to rollback: ${step.action}`
      );
    }
  }

  saga.completed = true;

  return {
    success: failed === 0,
    rolledBack,
    failed,
    errors,
  };
}

/**
 * Execute a single compensation action
 */
async function executeCompensation(action: CompensationAction, tenantId: string): Promise<void> {
  switch (action.type) {
    case 'DELETE_PROPOSAL': {
      await prisma.proposal.deleteMany({
        where: { id: action.proposalId, tenantId },
      });
      break;
    }

    case 'DELETE_AUDIT': {
      // First delete related findings
      await prisma.finding.deleteMany({
        where: { auditId: action.auditId },
      });
      // Then delete the audit
      await prisma.audit.deleteMany({
        where: { id: action.auditId, tenantId },
      });
      break;
    }

    case 'REVERT_STATUS': {
      await prisma.prospectLead.update({
        where: { id: action.prospectId },
        data: { pipelineStatus: action.fromStatus },
      });
      break;
    }

    case 'DELETE_FINDINGS': {
      await prisma.finding.deleteMany({
        where: { auditId: action.auditId },
      });
      break;
    }

    case 'DELETE_EVIDENCE': {
      await prisma.evidenceSnapshot.deleteMany({
        where: { auditId: action.auditId },
      });
      break;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown compensation action: ${_exhaustive}`);
    }
  }
}

/**
 * Saga for the diagnosis-proposal pipeline stage
 *
 * This saga ensures that if proposal generation fails after diagnosis,
 * the diagnosis results are also rolled back.
 */
export async function diagnosisProposalSaga(
  tenantId: string,
  prospectId: string,
  auditId: string,
  executeDiagnosis: () => Promise<{ clusters: unknown[] }>,
  executeProposal: (clusters: unknown[]) => Promise<{ proposalId: string }>
): Promise<{
  success: boolean;
  proposalId?: string;
  saga: SagaContext;
  rollbackResult?: { success: boolean; rolledBack: number; failed: number; errors: string[] };
}> {
  const saga = createSagaContext(tenantId, { prospectId, auditId });
  let clusters: unknown[] = [];
  let originalStatus: ProspectStatus | undefined;

  try {
    // Get original status for rollback
    const prospect = await prisma.prospectLead.findUnique({
      where: { id: prospectId },
      select: { pipelineStatus: true },
    });
    originalStatus = prospect?.pipelineStatus as ProspectStatus | undefined;

    // Step 1: Mark prospect as processing
    await executeStep(
      saga,
      async () => {
        await prisma.prospectLead.update({
          where: { id: prospectId },
          data: { pipelineStatus: 'audited' },
        });
      },
      {
        type: 'REVERT_STATUS',
        prospectId,
        fromStatus: originalStatus || 'discovered',
        toStatus: 'audited',
      }
    );

    // Step 2: Execute diagnosis
    const diagnosisResult = (await executeStep(
      saga,
      async () => {
        return await executeDiagnosis();
      },
      { type: 'DELETE_FINDINGS', auditId }
    )) as any;
    clusters = diagnosisResult.clusters;

    // Step 3: Execute proposal generation
    const proposalResult = await executeStep(
      saga,
      async () => {
        return await executeProposal(clusters);
      },
      { type: 'DELETE_PROPOSAL', proposalId: '' } // Will be updated
    );

    // Update the compensation with actual proposal ID
    const proposalId = (proposalResult as { proposalId: string }).proposalId;
    const deleteProposalStep = saga.steps.find((s) => s.compensation.type === 'DELETE_PROPOSAL');
    if (deleteProposalStep) {
      deleteProposalStep.compensation = {
        type: 'DELETE_PROPOSAL',
        proposalId,
      };
    }

    saga.completed = true;
    saga.completedAt = new Date();

    return {
      success: true,
      proposalId,
      saga,
    };
  } catch (error) {
    logger.error(
      {
        event: 'saga.diagnosis_proposal.failed',
        sagaId: saga.id,
        tenantId,
        prospectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      `Diagnosis-proposal saga failed`
    );

    const rollbackResult = await rollback(saga);

    return {
      success: false,
      saga,
      rollbackResult,
    };
  }
}

/**
 * Saga for the full pipeline (discovery → audit → diagnosis → proposal)
 */
export async function fullPipelineSaga(
  tenantId: string,
  prospectId: string,
  stages: {
    discover?: () => Promise<{ auditId: string }>;
    audit?: (auditId: string) => Promise<void>;
    diagnose: () => Promise<{ clusters: unknown[] }>;
    propose: (clusters: unknown[]) => Promise<{ proposalId: string }>;
  }
): Promise<{
  success: boolean;
  proposalId?: string;
  saga: SagaContext;
  rollbackResult?: { success: boolean; rolledBack: number; failed: number; errors: string[] };
}> {
  const saga = createSagaContext(tenantId, { prospectId });
  let auditId: string | undefined;
  let clusters: unknown[] = [];

  try {
    // Step 1: Discovery (optional)
    if (stages.discover) {
      const discoveryResult = await executeStep(
        saga,
        async () => {
          return await stages.discover!();
        },
        { type: 'DELETE_AUDIT', auditId: '' }
      );
      auditId = (discoveryResult as { auditId: string }).auditId;
      saga.auditId = auditId;

      // Update the compensation with actual audit ID
      const deleteAuditStep = saga.steps.find((s) => s.compensation.type === 'DELETE_AUDIT');
      if (deleteAuditStep) {
        deleteAuditStep.compensation = {
          type: 'DELETE_AUDIT',
          auditId,
        };
      }
    }

    // Step 2: Audit (optional)
    if (stages.audit && auditId) {
      await executeStep(
        saga,
        async () => {
          await stages.audit!(auditId!);
        },
        { type: 'DELETE_EVIDENCE', auditId: auditId! }
      );
    }

    // Step 3: Diagnosis
    const diagnosisResult = (await executeStep(
      saga,
      async () => {
        return await stages.diagnose();
      },
      { type: 'DELETE_FINDINGS', auditId: auditId! }
    )) as any;
    clusters = diagnosisResult.clusters;

    // Step 4: Proposal
    const proposalResult = await executeStep(
      saga,
      async () => {
        return await stages.propose(clusters);
      },
      { type: 'DELETE_PROPOSAL', proposalId: '' }
    );

    const proposalId = (proposalResult as { proposalId: string }).proposalId;
    saga.proposalId = proposalId;

    // Update the compensation with actual proposal ID
    const deleteProposalStep = saga.steps.find((s) => s.compensation.type === 'DELETE_PROPOSAL');
    if (deleteProposalStep) {
      deleteProposalStep.compensation = {
        type: 'DELETE_PROPOSAL',
        proposalId,
      };
    }

    saga.completed = true;
    saga.completedAt = new Date();

    return {
      success: true,
      proposalId,
      saga,
    };
  } catch (error) {
    logger.error(
      {
        event: 'saga.full_pipeline.failed',
        sagaId: saga.id,
        tenantId,
        prospectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      `Full pipeline saga failed`
    );

    const rollbackResult = await rollback(saga);

    return {
      success: false,
      saga,
      rollbackResult,
    };
  }
}

/**
 * Get saga history for a prospect
 */
export async function getSagaHistory(prospectId: string): Promise<SagaContext[]> {
  // Note: In a real implementation, sagas would be persisted to a database
  // For now, this is a placeholder
  return [];
}
