/**
 * app/api/pipeline/chat/route.ts
 *
 * AI Sales Chat API
 *
 * Handles real-time chat messages on proposal pages.
 * POST /api/pipeline/chat - Send a message and get AI response
 *
 * Features:
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { sendSlackNotification } from '@/lib/notifications/slack';
import { sendWebhook } from '@/lib/notifications/webhook';
import { handleMessage, shouldEscalate } from '@/lib/pipeline/aiSalesChat';
import type { ChatContext, ChatMessage } from '@/lib/pipeline/types';
import { prisma } from '@/lib/prisma';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Chat request schema
 */
const chatRequestSchema = z.object({
  proposalId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(['prospect', 'assistant']),
        content: z.string(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * Get client IP from request
 */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Apply rate limiting
 */
async function applyRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const clientIp = getClientIp(request);
  const body = await request.json().catch(() => ({}));
  const sessionId = body.sessionId;

  const ipKey = `ip:${clientIp}:chat`;
  const sessionKey = sessionId ? `session:${sessionId}:chat` : null;

  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxPerIp = 60;
  const maxPerSession = 30;

  // Check IP-based rate limit
  if (!rateLimitStore[ipKey]) {
    rateLimitStore[ipKey] = {
      count: 1,
      resetTime: now + windowMs,
    };
  } else {
    if (rateLimitStore[ipKey].resetTime < now) {
      rateLimitStore[ipKey] = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else if (rateLimitStore[ipKey].count >= maxPerIp) {
      return NextResponse.json(
        {
          error: 'Too many requests from this IP address.',
          retryAfter: Math.ceil((rateLimitStore[ipKey].resetTime - now) / 1000),
        },
        { status: 429 }
      );
    } else {
      rateLimitStore[ipKey].count++;
    }
  }

  // Check session-based rate limit
  if (sessionKey) {
    if (!rateLimitStore[sessionKey]) {
      rateLimitStore[sessionKey] = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      if (rateLimitStore[sessionKey].resetTime < now) {
        rateLimitStore[sessionKey] = {
          count: 1,
          resetTime: now + windowMs,
        };
      } else if (rateLimitStore[sessionKey].count >= maxPerSession) {
        return NextResponse.json(
          {
            error: 'Too many requests for this conversation session.',
            retryAfter: Math.ceil((rateLimitStore[sessionKey].resetTime - now) / 1000),
          },
          { status: 429 }
        );
      } else {
        rateLimitStore[sessionKey].count++;
      }
    }
  }

  return null;
}

interface ChatRequest {
  proposalId: string;
  message: string;
  sessionId: string;
  history?: ChatMessage[];
}

/**
 * Inner handler for chat
 */
async function handleChat(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const body: ChatRequest = await req.json();

    // Validate input
    const result = chatRequestSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new UnauthorizedError('Invalid chat data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { proposalId, message, sessionId, history: rawHistory = [] } = result.data;

    // Transform history timestamps from string to Date
    const history = rawHistory.map((h) => ({
      ...h,
      timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
    })) as ChatMessage[];

    // Fetch proposal with audit findings and tiers
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        audit: {
          include: {
            findings: {
              take: 10,
              orderBy: { impactScore: 'desc' },
            },
          },
        },
      },
    });

    if (!proposal || proposal.webLinkToken !== sessionId) {
      return NextResponse.json(
        new NotFoundError('Proposal', proposalId).toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    // Extract tier information from proposal
    const proposalTiers = {
      essentials: { price: 2500, name: 'Essentials' },
      growth: { price: 5000, name: 'Growth' },
      premium: { price: 10000, name: 'Premium' },
    };

    // Get industry benchmarks
    const industryBenchmarks = {
      avgPageSpeed: 75,
      avgMobileScore: 80,
      avgSeoScore: 70,
    };

    // Build chat context
    const context: ChatContext = {
      proposalId,
      auditFindings: proposal.audit.findings,
      proposalTiers,
      industryBenchmarks,
      objectionPlaybook: [],
      tenantBranding: {
        name: 'Our Team',
        brandName: 'Our Team',
      },
    };

    // Add prospect message to history
    const prospectMessage: ChatMessage = {
      role: 'prospect',
      content: message,
      timestamp: new Date(),
    };

    const fullHistory = [...history, prospectMessage];

    // Generate AI response
    const response = await handleMessage(context, history, message);

    // Store conversation in database
    await storeConversation(proposalId, sessionId, fullHistory, response, proposal.audit.tenantId);

    // Trigger human escalation webhook if confidence is too low
    if (shouldEscalate(response.confidence || 0, { threshold: 0.7 })) {
      await sendWebhook('chat.escalated', {
        proposalId,
        tenantId: proposal.audit.tenantId,
        sessionId,
        reason: 'AI Sales Chat Escalation (Low Confidence)',
      });

      try {
        await sendSlackNotification(
          'AI Sales Chat Escalation (Low Confidence)',
          proposalId,
          proposal.audit.tenantId,
          sessionId
        );
      } catch (slackError) {
        logger.error('Slack notification failed:', slackError);
      }
    }

    const chatResponse = NextResponse.json({
      message: response,
      sessionId,
    });

    chatResponse.headers.set('X-Trace-Id', traceId);
    return chatResponse;
  } catch (error) {
    logger.error('[Chat API] Error:', error);

    const internalError = new InternalError('Failed to process message', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Stores the conversation in the database for learning loop integration
 */
async function storeConversation(
  proposalId: string,
  sessionId: string,
  history: ChatMessage[],
  response: ChatMessage,
  tenantId: string
): Promise<void> {
  try {
    const existingConversation = await prisma.chatConversation.findFirst({
      where: {
        proposalId,
        sessionId,
      },
    });

    const messages = [...history, response];

    if (existingConversation) {
      await prisma.chatConversation.update({
        where: { id: existingConversation.id },
        data: {
          messages: messages as any,
        },
      });
    } else {
      await prisma.chatConversation.create({
        data: {
          tenantId,
          proposalId,
          sessionId,
          messages: messages as any,
          startedAt: new Date(),
        },
      });
    }
  } catch (error) {
    logger.error('[Chat API] Error storing conversation:', error);
  }
}

/**
 * Rate limited handler with additional session-based rate limiting
 */
const rateLimitedHandler = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many chat requests. Please wait before trying again.',
  })(req, async () => {
    // Apply additional session-based rate limiting
    const rateLimited = await applyRateLimit(req);
    if (rateLimited) {
      return rateLimited;
    }
    return handleChat(req);
  });

export const POST = rateLimitedHandler;
