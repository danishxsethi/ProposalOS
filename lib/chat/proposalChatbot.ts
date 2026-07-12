import { runClosingAgent } from '@/lib/closing/agent';
import { createHumanHandoff } from '@/lib/closing/handoff';
import { prisma } from '@/lib/prisma';

export interface ChatRequest {
  proposalToken: string;
  message: string;
  conversationId?: string;
}

/**
 * Token-scoped proposal chat. The token resolves proposal identity server-side; callers cannot
 * choose a tenant, audit, history, price, or tool context.
 */
export async function handleProposalChat(req: ChatRequest) {
  const proposal = await prisma.proposal.findUnique({
    where: { webLinkToken: req.proposalToken },
    include: { audit: { select: { businessName: true } } },
  });
  if (!proposal) throw new Error('Proposal not found');

  const sessionId = req.conversationId || req.proposalToken;
  const result = await runClosingAgent(
    proposal.id,
    req.proposalToken,
    proposal.audit.businessName,
    '',
    req.message
  );
  if (result.escalated) {
    await createHumanHandoff({
      tenantId: proposal.tenantId,
      proposalId: proposal.id,
      sessionId,
      reason: result.proposedAction,
      confidence: Math.max(0, (result.sentiment + 1) / 2),
      findingIds: result.supportingFindingIds,
      lastSafeMessage: result.reply,
    });
  }
  return {
    conversationId: sessionId,
    message: result.reply,
    escalated: result.escalated,
    citations: result.supportingFindingIds,
  };
}
