import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';

export type LifecycleWorkflow =
  | 'NPS'
  | 'NPS_REFERRAL'
  | 'NPS_DETRACTOR_REVIEW'
  | 'RE_ENGAGEMENT'
  | 'WIN_BACK'
  | 'COMPETITOR_MONITOR';

export interface LifecycleOccurrenceInput {
  tenantId: string;
  workflow: LifecycleWorkflow;
  entityId: string;
  occurrenceKey: string;
  idempotencyKey: string;
  recipientHash?: string;
}

export interface LifecycleCancellationInput extends LifecycleOccurrenceInput {
  actor: string;
  reason: string;
}

const TERMINAL = ['SENT', 'SUCCEEDED', 'CANCELLED', 'SUPPRESSED', 'DEAD', 'MANUAL_REVIEW'];

function occurrenceWhere(input: LifecycleOccurrenceInput) {
  return {
    tenantId_workflow_entityId_occurrenceKey: {
      tenantId: input.tenantId,
      workflow: input.workflow,
      entityId: input.entityId,
      occurrenceKey: input.occurrenceKey,
    },
  };
}

export async function ensureLifecycleOccurrence(input: LifecycleOccurrenceInput): Promise<void> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return;
  await table.upsert({
    where: occurrenceWhere(input),
    create: { ...input, status: 'QUEUED' },
    update: {},
  });
}

export async function lifecycleDispatchAllowed(input: LifecycleOccurrenceInput): Promise<boolean> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return true;
  const occurrence = await table.findUnique({
    where: occurrenceWhere(input),
    select: { status: true, cancelledAt: true },
  });
  return !!occurrence && !occurrence.cancelledAt && !['CANCELLED', 'SUPPRESSED', 'DEAD'].includes(occurrence.status);
}

export async function claimLifecycleOccurrence(input: LifecycleOccurrenceInput): Promise<boolean> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return true;
  const result = await table.updateMany({
    where: {
      tenantId: input.tenantId,
      workflow: input.workflow,
      entityId: input.entityId,
      occurrenceKey: input.occurrenceKey,
      cancelledAt: null,
      status: { in: ['QUEUED', 'RETRY_SCHEDULED', 'PENDING'] },
    },
    data: { status: 'RUNNING', attemptCount: { increment: 1 } },
  });
  return result.count === 1;
}

export async function completeLifecycleOccurrence(input: LifecycleOccurrenceInput): Promise<boolean> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return true;
  const result = await table.updateMany({
    where: {
      tenantId: input.tenantId,
      workflow: input.workflow,
      entityId: input.entityId,
      occurrenceKey: input.occurrenceKey,
      cancelledAt: null,
      status: 'RUNNING',
    },
    data: { status: 'SENT', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
  });
  return result.count === 1;
}

export async function markLifecycleReconciliation(
  input: LifecycleOccurrenceInput,
  errorCode: string
): Promise<void> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return;
  await table.updateMany({
    where: {
      tenantId: input.tenantId,
      workflow: input.workflow,
      entityId: input.entityId,
      occurrenceKey: input.occurrenceKey,
      cancelledAt: null,
      status: 'RUNNING',
    },
    data: { status: 'RECONCILING', lastErrorCode: errorCode, leaseOwner: null, leaseExpiresAt: null },
  });
}

export async function cancelLifecycleOccurrence(input: LifecycleCancellationInput): Promise<boolean> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return false;
  const result = await table.updateMany({
    where: {
      tenantId: input.tenantId,
      workflow: input.workflow,
      entityId: input.entityId,
      occurrenceKey: input.occurrenceKey,
      status: { notIn: TERMINAL },
    },
    data: {
      status: 'CANCELLED',
      cancellationActor: input.actor,
      cancellationReason: input.reason,
      cancelledAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  return result.count === 1;
}

export async function scheduleLifecycleRetry(
  input: LifecycleOccurrenceInput,
  errorCode: string
): Promise<'RETRY_SCHEDULED' | 'DEAD' | 'CANCELLED'> {
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return 'RETRY_SCHEDULED';
  const occurrence = await table.findUnique({
    where: occurrenceWhere(input),
    select: { attemptCount: true, maxAttempts: true, cancelledAt: true },
  });
  if (!occurrence?.cancelledAt && occurrence) {
    const exhausted = occurrence.attemptCount >= occurrence.maxAttempts;
    await table.updateMany({
      where: {
        tenantId: input.tenantId,
        workflow: input.workflow,
        entityId: input.entityId,
        occurrenceKey: input.occurrenceKey,
        cancelledAt: null,
      },
      data: exhausted
        ? { status: 'DEAD', lastErrorCode: errorCode }
        : {
            status: 'RETRY_SCHEDULED',
            lastErrorCode: errorCode,
            nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** Math.max(0, occurrence.attemptCount)),
          },
    });
    return exhausted ? 'DEAD' : 'RETRY_SCHEDULED';
  }
  return 'CANCELLED';
}

export async function replayLifecycleOccurrence(
  input: LifecycleOccurrenceInput,
  actorId: string,
  authorized: boolean
): Promise<boolean> {
  if (!authorized) return false;
  const table = (prisma as any).lifecycleOccurrence;
  if (!table) return false;
  const result = await table.updateMany({
    where: {
      tenantId: input.tenantId,
      workflow: input.workflow,
      entityId: input.entityId,
      occurrenceKey: input.occurrenceKey,
      status: { in: ['DEAD', 'RECONCILING', 'MANUAL_REVIEW'] },
    },
    data: {
      status: 'QUEUED',
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
    },
  });
  if (result.count !== 1) return false;

  await recordAuditTrailEvent({
    eventType: 'worker.job_claimed',
    tenantId: input.tenantId,
    actorId,
    payload: { workflow: input.workflow, entityId: input.entityId, occurrenceKey: input.occurrenceKey },
  });
  return true;
}
