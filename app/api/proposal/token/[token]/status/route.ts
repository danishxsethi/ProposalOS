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
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { assertProposalPublishable } from '@/lib/proposal/publication';
import { getTenantId } from '@/lib/tenant/context';

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * Inner handler for status update
 */
async function handleStatusUpdate(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { token } = await params;
    const body = await req.json();
    const statusSchema = (await import('zod')).z.enum(['READY', 'SENT', 'VIEWED']);
    const result = statusSchema.safeParse(body?.status);
    if (!result.success) {
      return NextResponse.json(
        new ValidationError('Only READY, SENT, or VIEWED may be set by an agency operator').toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }
    const normalizedStatus = result.data;

    const proposal = await prisma.proposal.findFirst({
      where: { webLinkToken: token, tenantId },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }
    if (normalizedStatus === 'VIEWED') assertProposalPublishable(proposal);

    // This route is for authenticated agency operators only. Public recipients use
    // dedicated acceptance/contact endpoints and cannot set internal lifecycle state.
    const updateData: Record<string, unknown> = { status: normalizedStatus };
    if (normalizedStatus === 'SENT' && !proposal.sentAt) {
      updateData.sentAt = new Date();
    }
    if (normalizedStatus === 'VIEWED' && !proposal.viewedAt) {
      updateData.viewedAt = new Date();
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id: proposal.id, tenantId },
      data: updateData,
    });

    await recordAuditTrailEvent({
      eventType: 'proposal.status_changed',
      tenantId: proposal.tenantId,
      proposalId: proposal.id,
      auditId: proposal.auditId,
      triggerSource: 'public_token',
      payload: {
        previousStatus: proposal.status,
        newStatus: updatedProposal.status,
      },
    }).catch(() => {});

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

export const PATCH = withAuth((req: Request, ...args: Params[]) =>
  idempotentHandler(req, args[0]!)
);
