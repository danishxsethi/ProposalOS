/**
 * PATCH /api/proposal/token/[token]/status
 * Update proposal status (draft → ready → sent → viewed → accepted/rejected)
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Idempotency support
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { proposalStatusSchema } from '@/lib/api/schemas/proposal';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * Inner handler for status update
 */
async function handleStatusUpdate(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { token } = await params;
    const body = await req.json();
    const { status } = body;

    // Validate status using Zod schema
    const result = proposalStatusSchema.safeParse(status);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid status value', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const normalizedStatus = result.data;

    // Find proposal by token
    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Update status and set timestamp if transitioning to 'SENT'
    const updateData: Record<string, unknown> = { status: normalizedStatus };
    if (normalizedStatus === 'SENT' && !proposal.sentAt) {
      updateData.sentAt = new Date();
    }
    if (normalizedStatus === 'VIEWED' && !proposal.viewedAt) {
      updateData.viewedAt = new Date();
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id: proposal.id },
      data: updateData,
    });

    const response = NextResponse.json({
      success: true,
      proposal: {
        id: updatedProposal.id,
        status: updatedProposal.status,
        sentAt: updatedProposal.sentAt,
        viewedAt: updatedProposal.viewedAt,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to update proposal status', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (10 requests per minute for status updates)
const rateLimitedHandler = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many status update requests. Please wait before trying again.',
  })(req, () => handleStatusUpdate(req, params));

// Apply idempotency for status updates (critical mutating operation)
const idempotentHandler = (req: Request, params: Params) =>
  withIdempotency((r) => rateLimitedHandler(r, params) as Promise<Response>, { includeBody: true })(
    req
  );

export const PATCH = (req: Request, params: Params) => idempotentHandler(req, params);
