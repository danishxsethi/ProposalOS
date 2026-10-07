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
import { acceptedCommercialFingerprint } from '@/lib/proposal/publication';
import { runWithTenantAsync } from '@/lib/tenant/context';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const traceId = generateTraceId();

  try {
    const { token } = await params;
    const body = await req.json();

    // Validate request body
    const validation = acceptProposalSchema.safeParse(body);

    if (!validation.success) {
      const errorDetails = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid input', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { contactName, contactEmail, contactPhone, tier, message } = validation.data;
    const tierId = tier.toLowerCase();

    // Find Proposal by Token
    const access = await resolvePublicProposalAccess(token);

    // Get IP from headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const now = new Date();

    const acceptedTier = tierId;
    if (!['essentials', 'growth', 'premium'].includes(acceptedTier)) {
      return NextResponse.json({ error: 'Selected package is not available' }, { status: 400 });
    }
    const pricing = access.proposal.pricing as Record<string, unknown>;
    const amount = pricing[acceptedTier];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Selected package pricing is unavailable' }, { status: 409 });
    }
    const commercialSnapshot = {
      proposalId: access.proposalId,
      proposalVersion: access.proposal.version,
      tier: acceptedTier,
      amountCents: Math.round(amount * 100),
      currency: 'usd',
      pricing,
      selectedTier: acceptedTier === 'essentials' ? access.proposal.tierEssentials : acceptedTier === 'growth' ? access.proposal.tierGrowth : access.proposal.tierPremium,
    };
    const tierContent = acceptedTier === 'essentials' ? access.proposal.tierEssentials : acceptedTier === 'growth' ? access.proposal.tierGrowth : access.proposal.tierPremium;
    const commercialFingerprint = acceptedCommercialFingerprint({
      proposalId: access.proposalId, proposalVersion: access.proposal.version,
      tier: acceptedTier, amountCents: Math.round(amount * 100), currency: 'usd', tierContent,
    });
    const acceptanceRecord = await runWithTenantAsync(access.tenantId, () => prisma.$transaction(async (tx) => {
      const existing = await tx.proposalAcceptance.findUnique({ where: { proposalId: access.proposalId } });
      if (existing) return existing;
      const updated = await tx.proposal.updateMany({
        where: { id: access.proposalId, tenantId: access.tenantId, version: access.proposal.version, status: { in: ['READY', 'SENT', 'VIEWED'] } },
        data: { status: 'ACCEPTED', outcome: 'WON', closedAt: now, tierChosen: acceptedTier, replyReceivedAt: now, outboundEnabled: false },
      });
      if (updated.count !== 1) throw new Error('PROPOSAL_ACCEPTANCE_VERSION_CONFLICT');
      return tx.proposalAcceptance.create({
        data: {
          proposalId: access.proposalId, tenantId: access.tenantId, tier: acceptedTier,
          proposalVersion: access.proposal.version, commercialFingerprint, paymentTermsLockedAt: now,
          commercialSnapshot: JSON.parse(JSON.stringify(commercialSnapshot)),
          contactName, contactEmail, contactPhone, message, ipAddress: ip,
        },
      });
    }));

    // Trigger Post-Acceptance Actions
    await runWithTenantAsync(access.tenantId, () =>
      FollowUpScheduler.onProposalAccepted(access.proposalId)
    );

    const response = NextResponse.json({
      success: true,
      acceptanceId: acceptanceRecord.id,
      commercialFingerprint: acceptanceRecord.commercialFingerprint,
      tierChosen: acceptedTier,
      acceptedAt: acceptanceRecord.acceptedAt.toISOString(),
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
