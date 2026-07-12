import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

export interface HandoffRequest {
  tenantId: string;
  proposalId: string;
  sessionId: string;
  reason: string;
  confidence?: number;
  findingIds?: string[];
  lastSafeMessage?: string;
}

export interface HandoffResult {
  created: boolean;
  status: 'active';
}

/**
 * ConversationState is the durable active-handoff marker. PipelineErrorLog is the durable,
 * retryable notification/outbox record until a dedicated notification worker is provisioned.
 */
export async function createHumanHandoff(input: HandoffRequest): Promise<HandoffResult> {
  return runWithTenantAsync(input.tenantId, async () => {
    const proposal = await prisma.proposal.findFirst({
      where: { id: input.proposalId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!proposal) throw new Error('Proposal does not belong to the requested tenant');

    const existing = await prisma.conversationState.findUnique({
      where: { proposalId: input.proposalId },
      select: { escalated: true },
    });
    await prisma.conversationState.upsert({
      where: { proposalId: input.proposalId },
      create: {
        tenantId: input.tenantId,
        proposalId: input.proposalId,
        sessionId: input.sessionId,
        history: [],
        objectionsRaised: [],
        escalated: true,
      },
      update: { escalated: true },
    });

    // Stop all unsent proposal follow-ups before any notification is attempted.
    await prisma.proposalFollowUp.updateMany({
      where: { tenantId: input.tenantId, proposalId: input.proposalId, status: 'pending' },
      data: { status: 'cancelled' },
    });

    if (!existing?.escalated) {
      await prisma.pipelineErrorLog.create({
        data: {
          tenantId: input.tenantId,
          stage: 'human_handoff',
          errorType: 'HANDOFF_NOTIFICATION_PENDING',
          errorMessage: input.reason,
          metadata: {
            proposalId: input.proposalId,
            sessionId: input.sessionId,
            confidence: input.confidence ?? null,
            findingIds: input.findingIds ?? [],
            lastSafeMessage: input.lastSafeMessage ?? null,
          },
        },
      });
    }
    return { created: !existing?.escalated, status: 'active' };
  });
}

export async function resumeHumanHandoff(input: {
  tenantId: string;
  proposalId: string;
  actorId: string;
  actorRole: string;
}): Promise<void> {
  if (!['agency_admin', 'super_admin'].includes(input.actorRole)) {
    throw new Error('Only an authorized tenant administrator may resume automation');
  }
  await runWithTenantAsync(input.tenantId, async () => {
    const state = await prisma.conversationState.findFirst({
      where: { proposalId: input.proposalId, tenantId: input.tenantId },
      select: { id: true, escalated: true },
    });
    if (!state?.escalated) throw new Error('No active handoff exists for this proposal');
    await prisma.conversationState.update({
      where: { id: state.id },
      data: { escalated: false },
    });
    await prisma.pipelineErrorLog.create({
      data: {
        tenantId: input.tenantId,
        stage: 'human_handoff',
        errorType: 'HANDOFF_RESUMED',
        errorMessage: 'Automation resumed by an authorized administrator',
        metadata: {
          proposalId: input.proposalId,
          actorId: input.actorId,
          actorRole: input.actorRole,
        },
      },
    });
  });
}
