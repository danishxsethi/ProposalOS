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
  ValidationError,
} from '@/lib/api/errors';
import { acceptProposalSchema } from '@/lib/api/schemas/proposal';
import { FollowUpScheduler } from '@/lib/followup/scheduler';
import { prisma } from '@/lib/prisma';
import {
  PublicProposalAccessError,
  resolvePublicProposalAccess,
} from '@/lib/proposal/publicAccess';
import { runWithTenantAsync } from '@/lib/tenant/context';

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
    const access = await resolvePublicProposalAccess(token);

    // Check if already accepted (idempotency)
    if (access.status === 'ACCEPTED') {
      return NextResponse.json(
        new ConflictError('Proposal already accepted').toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    // Get IP from headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const now = new Date();

    await runWithTenantAsync(access.tenantId, () =>
      prisma.$transaction(async (tx) => {
        // Create Acceptance Record
        await tx.proposalAcceptance.create({
          data: {
            proposalId: access.proposalId,
            tenantId: access.tenantId,
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
          where: { id: access.proposalId },
          data: {
            status: 'ACCEPTED',
            outcome: 'WON',
            closedAt: now,
            tierChosen: tier,
            replyReceivedAt: now,
            meetingBookedAt: now,
          },
        });
      })
    );

    // Trigger Post-Acceptance Actions
    await runWithTenantAsync(access.tenantId, () =>
      FollowUpScheduler.onProposalAccepted(access.proposalId)
    );

    const response = NextResponse.json({
      success: true,
      tierChosen: tier,
      acceptedAt: now.toISOString(),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    if (error instanceof PublicProposalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const internalError = new InternalError('Failed to accept proposal', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}
