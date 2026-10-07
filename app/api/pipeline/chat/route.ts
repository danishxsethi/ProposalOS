import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError } from '@/lib/api/errors';
import { runClosingAgent } from '@/lib/closing/agent';
import { createHumanHandoff } from '@/lib/closing/handoff';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChatRequestSchema = z
  .object({
    proposalId: z.string().uuid(),
    message: z.string().trim().min(1).max(1_000),
    sessionId: z.string().uuid(),
  })
  .strict();

async function handleChat(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    const parsed = ChatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid chat request' }, { status: 400 });
    }
    const proposal = await prisma.proposal.findUnique({
      where: { id: parsed.data.proposalId },
      include: { audit: { select: { businessName: true } } },
    });
    if (!proposal || proposal.webLinkToken !== parsed.data.sessionId) {
      return NextResponse.json(
        new NotFoundError('Proposal', parsed.data.proposalId).toEnvelope(req.url, traceId),
        { status: 404 }
      );
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

    const response = NextResponse.json({
      message: {
        role: 'assistant',
        content: result.reply,
        timestamp: new Date(),
        confidence: Math.max(0, (result.sentiment + 1) / 2),
        intent: result.intent,
        citations: result.supportingFindingIds,
      },
      sessionId: parsed.data.sessionId,
      escalated: result.escalated,
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Pipeline chat failed');
    return NextResponse.json(
      new InternalError('Failed to process message').toEnvelope(req.url, traceId),
      { status: 500 }
    );
  }
}

export const POST = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many chat requests. Please wait before trying again.',
  })(req, () => handleChat(req));
