/**
 * POST /api/proposal/token/[token]/accept
 * Accept a proposal with tier selection.
 *
 * Features:
 * - Zod validation with acceptProposalSchema
 * - Idempotency support (prevent duplicate acceptances)
 * - Standardized error responses
 * - Transaction-based acceptance with follow-up cancellation
 */

import { NextResponse } from 'next/server';

import {
  ConflictError,
  generateTraceId,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/errors';
import { acceptProposalSchema } from '@/lib/api/schemas/proposal';
import { FollowUpScheduler } from '@/lib/followup/scheduler';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const traceId = generateTraceId();

  try {
    const { token } = await params;
    const body = await req.json();

    // Validate request body
    const result = acceptProposalSchema.safeParse(body);

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid input', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { contactName, contactEmail, contactPhone, tier, message } = result.data;

    // Find Proposal by Token
    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: { audit: true },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Check if already accepted (idempotency)
    if (proposal.status === 'ACCEPTED') {
      return NextResponse.json(
        new ConflictError('Proposal already accepted').toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    // Get IP from headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Create Acceptance Record
      await tx.proposalAcceptance.create({
        data: {
          proposalId: proposal.id,
          tenantId: proposal.tenantId,
          tier: tier,
          contactName,
          contactEmail,
          contactPhone,
          message,
          ipAddress: ip,
        },
      });

      // Update Proposal Status
      await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          status: 'ACCEPTED',
          outcome: 'WON',
          closedAt: now,
          tierChosen: tier,
          replyReceivedAt: proposal.replyReceivedAt ?? now,
          meetingBookedAt: proposal.meetingBookedAt ?? now,
        },
      });
    });

    // Trigger Post-Acceptance Actions
    await FollowUpScheduler.onProposalAccepted(proposal.id);

    const response = NextResponse.json({
      success: true,
      tierChosen: tier,
      acceptedAt: now.toISOString(),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to accept proposal', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}
