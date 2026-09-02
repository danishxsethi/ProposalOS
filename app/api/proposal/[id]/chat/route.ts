import { NextResponse } from 'next/server';

import { z } from 'zod';

import { runClosingAgent } from '@/lib/closing/agent';
import { createHumanHandoff } from '@/lib/closing/handoff';
import { logError, logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const RequestSchema = z
  .object({
    message: z.string().trim().min(1).max(1_000),
    sessionId: z.string().uuid(),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: proposalId } = await params;
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid chat request' }, { status: 400 });

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { audit: { select: { businessName: true } } },
    });
    if (!proposal || proposal.webLinkToken !== parsed.data.sessionId) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const result = await runClosingAgent(
      proposal.id,
      parsed.data.sessionId,
      proposal.audit.businessName,
      '',
      parsed.data.message
    );
    if (result.escalated) {
      await createHumanHandoff({
        tenantId: proposal.tenantId,
        proposalId: proposal.id,
        sessionId: parsed.data.sessionId,
        reason: result.proposedAction,
        confidence: Math.max(0, (result.sentiment + 1) / 2),
        findingIds: result.supportingFindingIds,
        lastSafeMessage: result.reply,
      });
    }

    logger.info(
      { event: 'closing_chat.message_processed', proposalId, escalated: result.escalated },
      'Closing chat response generated'
    );
    return NextResponse.json({
      reply: result.reply,
      escalated: result.escalated,
      sentiment: result.sentiment,
      citations: result.supportingFindingIds,
      proposedAction: result.proposedAction,
    });
  } catch (error) {
    logError('Error processing prospect chat', error, {});
    return NextResponse.json({ error: 'Unable to process chat safely' }, { status: 503 });
  }
}
