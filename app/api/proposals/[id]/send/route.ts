/**
 * POST /api/proposals/[id]/send
 * Send a proposal (mark as sent and trigger follow-up scheduler).
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { emailSchema } from '@/lib/api/schemas/audit';
import { FollowUpScheduler } from '@/lib/followup/scheduler';
import { logError, logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { applyObservabilityHeaders, createObservabilityContextFromRequest, runWithObservabilityContext } from '@/lib/observability/context';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { createScopedPrisma, getTenantId } from '@/lib/tenant/context';

const sendSchema = z.object({
  email: emailSchema,
});

/**
 * Inner handler for sending proposals
 */
async function handleSendProposal(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return runWithObservabilityContext(
    createObservabilityContextFromRequest(req, { workflow: 'api.proposals.send' }),
    async () => {
      const traceId = generateTraceId();

      try {
    const { id } = await params;
    const tenantId = await getTenantId();

    if (!tenantId) {
      const unauthorized = NextResponse.json(
        new ValidationError('Unauthorized: No Tenant').toEnvelope(req.url, traceId),
        { status: 401 }
      );
      applyObservabilityHeaders(unauthorized);
      return unauthorized;
    }

    const prisma = createScopedPrisma(tenantId);

    // Parse and validate body
    const body = await req.json();
    const result = sendSchema.safeParse(body);

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const validation = NextResponse.json(
        new ValidationError('Invalid input', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
      applyObservabilityHeaders(validation);
      return validation;
    }

    const { email } = result.data;

    // Check ownership first
    const existingProposal = await prisma.proposal.findFirst({
      where: { id, tenantId },
    });

    if (!existingProposal) {
      const notFound = NextResponse.json(new NotFoundError('Proposal', id).toEnvelope(req.url, traceId), {
        status: 404,
      });
      applyObservabilityHeaders(notFound);
      return notFound;
    }

    // Update Proposal
    const proposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        prospectEmail: email,
      },
      include: { audit: true },
    });

    // Trigger Scheduler
    await FollowUpScheduler.onProposalSent(proposal.id, tenantId, proposal.audit.businessName);
    MetricsRecorder.proposalGenerated(tenantId, 'SENT');
    await recordAuditTrailEvent({
      eventType: 'proposal.sent',
      tenantId,
      auditId: proposal.auditId,
      proposalId: proposal.id,
      proposalDelivered: true,
      payload: {
        channel: 'followup_scheduler',
        recipientCount: 1,
      },
    });

    logger.info(
      {
        event: 'proposal.sent',
        proposalId: proposal.id,
        auditId: proposal.auditId,
        tenantId,
      },
      'Proposal marked as sent'
    );

    const response = NextResponse.json({ success: true });
    applyObservabilityHeaders(response);
    return response;
  } catch (e) {
    logError('Failed to send proposal', e);
    const internalError = new InternalError('Failed to send proposal', {
      originalError: e instanceof Error ? e.message : String(e),
    });

    const response = NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
    applyObservabilityHeaders(response);
    return response;
  }
    }
  );
}

// Apply rate limiting
const rateLimitedHandler = (req: Request, params: { params: Promise<{ id: string }> }) =>
  withRateLimit(RateLimitPresets.proposalGeneration)(req, () => handleSendProposal(req, params));

export const POST = withAuth((req: Request, params: any) => rateLimitedHandler(req, params));
