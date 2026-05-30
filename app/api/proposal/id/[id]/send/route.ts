/**
 * POST /api/proposal/id/[id]/send
 * Send a proposal via email.
 *
 * Features:
 * - Zod validation with sendProposalSchema
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { sendProposalSchema } from '@/lib/api/schemas/proposal';
import { logError, logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { applyObservabilityHeaders, createObservabilityContextFromRequest, runWithObservabilityContext } from '@/lib/observability/context';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { sendProposalEmail } from '@/lib/outreach/emailSender';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * Inner handler for sending proposals
 */
async function handleSendProposal(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return runWithObservabilityContext(
    createObservabilityContextFromRequest(req, { workflow: 'api.proposal-id.send' }),
    async () => {
      const traceId = generateTraceId();

      try {
    const { id: proposalId } = await params;
    const tenantId = await getTenantId();

    if (!tenantId) {
      const unauthorized = NextResponse.json(
        new ValidationError('Unauthorized: No Tenant').toEnvelope(req.url, traceId),
        { status: 401 }
      );
      applyObservabilityHeaders(unauthorized);
      return unauthorized;
    }

    // Parse and validate body
    const body = await req.json();
    const result = sendProposalSchema.safeParse(body);

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

    const { recipientEmails, subject, message, scheduleAt } = result.data;

    // Validate Proposal Ownership
    const proposal = await prisma.proposal.findFirst({
      where: {
        id: proposalId,
        audit: { tenantId },
      },
    });

    if (!proposal) {
      const notFound = NextResponse.json(
        new NotFoundError('Proposal', proposalId).toEnvelope(req.url, traceId),
        { status: 404 }
      );
      applyObservabilityHeaders(notFound);
      return notFound;
    }

    if (scheduleAt) {
      // Schedule not yet supported
      const notImplemented = NextResponse.json(
        {
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Scheduling not yet supported in this endpoint',
            timestamp: new Date().toISOString(),
            traceId,
          },
        },
        { status: 501 }
      );
      applyObservabilityHeaders(notImplemented);
      return notImplemented;
    }

    // Send Immediately to all recipients
    for (const recipientEmail of recipientEmails) {
      await sendProposalEmail({
        proposalId,
        recipientEmail,
        subject: subject || '',
        messageHtml: message || '',
        tenantId,
      });
    }

    MetricsRecorder.proposalGenerated(tenantId, 'SENT');
    await recordAuditTrailEvent({
      eventType: 'proposal.delivered',
      tenantId,
      auditId: proposal.auditId,
      proposalId,
      proposalDelivered: true,
      payload: {
        channel: 'email',
        recipientCount: recipientEmails.length,
      },
    });

    logger.info(
      {
        event: 'proposal.delivered',
        proposalId,
        auditId: proposal.auditId,
        tenantId,
        recipientCount: recipientEmails.length,
      },
      'Proposal delivered by email'
    );

    const response = NextResponse.json({ success: true });
    applyObservabilityHeaders(response);
    return response;
  } catch (error) {
    logError('Failed to deliver proposal', error);
    const internalError = new InternalError('Failed to send proposal', {
      originalError: error instanceof Error ? error.message : String(error),
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
