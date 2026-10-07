import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { PublicProposalAccessError, resolvePublicProposalAccess } from '@/lib/proposal/publicAccess';
import { getProposalPriceId, stripe } from '@/lib/stripe/stripe';
import { runWithTenantAsync } from '@/lib/tenant/context';

const Input = z.object({
  proposalId: z.string().min(1).max(128),
  tierId: z.enum(['essentials', 'growth', 'premium']),
  webLinkToken: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const traceId = generateTraceId();
  try {
    const parsed = Input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout request', traceId }, { status: 400 });
    const { proposalId, tierId, webLinkToken } = parsed.data;
    const access = await resolvePublicProposalAccess(webLinkToken);
    if (access.proposalId !== proposalId) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

    const acceptance = await runWithTenantAsync(access.tenantId, () => prisma.proposalAcceptance.findUnique({ where: { proposalId } }));
    if (!acceptance || acceptance.tier !== tierId || acceptance.proposalVersion !== access.proposal.version) {
      return NextResponse.json({ error: 'Proposal must be accepted with the selected package before checkout' }, { status: 409 });
    }
    const commercialFingerprint = acceptance.commercialFingerprint;
    const acceptedTerms = acceptance.commercialSnapshot as Record<string, unknown>;
    const expectedCents = Number(acceptedTerms.amountCents);
    const currency = typeof acceptedTerms.currency === 'string' ? acceptedTerms.currency : 'usd';
    if (!commercialFingerprint || !Number.isSafeInteger(expectedCents) || expectedCents <= 0) {
      return NextResponse.json({ error: 'Accepted commercial terms are incomplete' }, { status: 409 });
    }
    const priceId = getProposalPriceId(tierId);
    const stripePrice = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    if (stripePrice.unit_amount !== expectedCents || stripePrice.currency !== currency) {
      return NextResponse.json({ error: 'Accepted terms do not match the configured Stripe price' }, { status: 409 });
    }

    const idempotencyKey = `proposal-checkout:${commercialFingerprint}`;
    const existingAttempt = await runWithTenantAsync(access.tenantId, () => prisma.checkoutAttempt.findFirst({ where: { proposalId, acceptanceId: acceptance.id, type: 'proposal', completedAt: null } }));
    if (existingAttempt?.stripeSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(existingAttempt.stripeSessionId);
      if (existingSession.status === 'open' && existingSession.url) return NextResponse.json({ url: existingSession.url, checkoutSessionId: existingSession.id });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL;
    if (!baseUrl) return NextResponse.json({ error: 'Checkout return URL is not configured' }, { status: 503 });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/onboarding?type=proposal&proposalId=${proposalId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/proposal/${webLinkToken}?canceled=true`,
      metadata: { proposalId, acceptanceId: acceptance.id, tierId, tenantId: access.tenantId, commercialFingerprint, checkoutType: 'proposal' },
      customer_email: acceptance.contactEmail,
    }, { idempotencyKey });

    await runWithTenantAsync(access.tenantId, () => prisma.$transaction(async (tx) => {
      await tx.checkoutAttempt.upsert({
        where: { idempotencyKey },
        create: { stripeSessionId: session.id, tenantId: access.tenantId, proposalId, acceptanceId: acceptance.id, idempotencyKey, type: 'proposal', status: 'PENDING' },
        update: { stripeSessionId: session.id, status: 'PENDING' },
      });
      await tx.proposal.updateMany({ where: { id: proposalId, tenantId: access.tenantId, status: 'ACCEPTED' }, data: { stripePriceId: priceId, stripeAmountCents: expectedCents } });
    }));
    return NextResponse.json({ url: session.url, checkoutSessionId: session.id }, { headers: { 'X-Trace-Id': traceId } });
  } catch (error) {
    if (error instanceof PublicProposalAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error({ err: error, traceId }, 'Proposal checkout failed');
    return NextResponse.json(new InternalError('Checkout creation failed').toEnvelope(request.url, traceId), { status: 500 });
  }
}
