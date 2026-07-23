/**
 * Prospect State Machine
 * 
 * Enforces valid state transitions and records transition history for the
 * autonomous pipeline. Validates against VALID_TRANSITIONS, persists to
 * ProspectStateTransition table, and updates ProspectLead.status.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import { prisma } from '@/lib/prisma';
import type { ProspectStatus, StateTransition, PipelineStage } from './types';

/**
 * Valid state transitions map
 * Each key is a current status, and the value is an array of valid next statuses
 */
export const VALID_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  discovered: ['audited', 'unqualified', 'audit_failed'],
  audited: ['QUALIFIED', 'low_value'],
  QUALIFIED: ['outreach_sent'],
  outreach_sent: ['hot_lead', 'closed_lost'],
  hot_lead: ['closing', 'closed_lost'],
  closing: ['closed_won', 'closed_lost'],
  closed_won: ['delivering'],
  delivering: ['delivered'],
  delivered: [],
  unqualified: [],
  audit_failed: [],
  low_value: [],
  closed_lost: [],
};

/**
 * Check if a transition from one status to another is valid
 * 
 * @param from - Current prospect status
 * @param to - Target prospect status
 * @returns true if the transition is valid, false otherwise
 */
export function canTransition(from: ProspectStatus, to: ProspectStatus): boolean {
  const validNextStates = VALID_TRANSITIONS[from] || [];
  return validNextStates.includes(to);
}

/**
 * Transition a prospect to a new status
 * 
 * Validates the transition against VALID_TRANSITIONS, persists to
 * ProspectStateTransition table, and updates ProspectLead.status.
 * Invalid transitions throw an error and log to PipelineErrorLog.
 * 
 * @param prospectId - ID of the prospect to transition
 * @param to - Target status
 * @param stage - Pipeline stage triggering the transition
 * @returns StateTransition record
 * @throws Error if transition is invalid or prospect not found
 */
export async function transition(
  prospectId: string,
  to: ProspectStatus,
  stage: PipelineStage
): Promise<StateTransition> {
  // Fetch the current prospect
  const prospect = await prisma.prospectLead.findUnique({
    where: { id: prospectId },
    select: { id: true, pipelineStatus: true, tenantId: true },
  });

  if (!prospect) {
    const error = new Error(`Prospect not found: ${prospectId}`);
    await logInvalidTransition(prospectId, 'unknown', to, stage, error.message);
    throw error;
  }

  const from = prospect.pipelineStatus as ProspectStatus;
  const tenantId = prospect.tenantId;

  // Validate transition
  if (!canTransition(from, to)) {
    const errorMessage = `Invalid transition from ${from} to ${to}`;
    const error = new Error(errorMessage);

    // Log to PipelineErrorLog
    await logInvalidTransition(prospectId, from, to, stage, errorMessage, tenantId);

    throw error;
  }

  const timestamp = new Date();

  // Perform the transition in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update ProspectLead pipelineStatus
    await tx.prospectLead.update({
      where: { id: prospectId },
      data: { pipelineStatus: to },
    });

    // Create transition record
    const transitionRecord = await tx.prospectStateTransition.create({
      data: {
        leadId: prospectId,
        tenantId,
        fromStatus: from,
        toStatus: to,
        stage,
        metadata: {},
        createdAt: timestamp,
      },
    });

    return transitionRecord;
  });

  // Return StateTransition object
  return {
    from,
    to,
    timestamp,
    stage,
    tenantId,
    metadata: result.metadata as Record<string, unknown>,
  };
}

/**
 * Get the state transition history for a prospect
 * 
 * @param prospectId - ID of the prospect
 * @returns Array of StateTransition records in chronological order
 */
export async function getHistory(prospectId: string): Promise<StateTransition[]> {
  const records = await prisma.prospectStateTransition.findMany({
    where: { leadId: prospectId },
    orderBy: { createdAt: 'asc' },
  });

  return records.map((record) => ({
    from: record.fromStatus as ProspectStatus,
    to: record.toStatus as ProspectStatus,
    timestamp: record.createdAt,
    stage: record.stage as PipelineStage,
    tenantId: record.tenantId,
    metadata: record.metadata as Record<string, unknown>,
  }));
}

/**
 * Serialize state transition history to JSON
 * 
 * @param transitions - Array of StateTransition records
 * @returns JSON string representation
 */
export function serializeHistory(transitions: StateTransition[]): string {
  return JSON.stringify(
    transitions.map((t) => ({
      from: t.from,
      to: t.to,
      timestamp: isNaN(t.timestamp.getTime())
        ? new Date(0).toISOString()
        : t.timestamp.toISOString(),
      stage: t.stage,
      tenantId: t.tenantId,
      metadata: t.metadata,
    }))
  );
}

/**
 * Deserialize state transition history from JSON
 * 
 * @param json - JSON string representation
 * @returns Array of StateTransition records
 */
export function deserializeHistory(json: string): StateTransition[] {
  const parsed = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid JSON: expected array');
  }

  return parsed.map((item) => ({
    from: item.from as ProspectStatus,
    to: item.to as ProspectStatus,
    timestamp: new Date(item.timestamp),
    stage: item.stage as PipelineStage,
    tenantId: item.tenantId,
    metadata: item.metadata || {},
  }));
}

/**
 * Log an invalid transition attempt to PipelineErrorLog
 * 
 * @param prospectId - ID of the prospect
 * @param from - Current status
 * @param to - Attempted target status
 * @param stage - Pipeline stage that attempted the transition
 * @param errorMessage - Error message
 * @param tenantId - Tenant ID (optional, defaults to 'unknown')
 */
async function logInvalidTransition(
  prospectId: string,
  from: string,
  to: string,
  stage: PipelineStage,
  errorMessage: string,
  tenantId: string = 'unknown'
): Promise<void> {
  try {
    await prisma.pipelineErrorLog.create({
      data: {
        tenantId,
        stage,
        prospectId,
        errorType: 'INVALID_TRANSITION',
        errorMessage,
        metadata: { from, to },
      },
    });
  } catch (logError) {
    // If logging fails, log to console but don't throw
    console.error('Failed to log invalid transition:', logError);
  }
}
