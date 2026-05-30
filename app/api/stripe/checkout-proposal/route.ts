import { NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { prisma } from '@/lib/prisma';
import { getProposalPriceId, stripe } from '@/lib/stripe/stripe';
import type { ProposalPlanId } from '@/lib/stripe/stripe';

const ALLOWED_TIERS = [
  'essentials',
  'growth',
  'premium',
] as const satisfies readonly ProposalPlanId[];

// In-memory idempotency cache (24 hour TTL)
const IDEMPOTENCY_CACHE = new Map<
  string,
  { response: unknown; statusCode: number; timestamp: number }
>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const CheckoutProposalSchema = z.object({
  proposalId: z.string().min(1),
  tierId: z.enum(ALLOWED_TIERS),
  webLinkToken: z.string().min(1),
});

/**
 * POST /api/stripe/checkout-proposal
 * Create a Stripe checkout session for proposal payment.
 *
 * Idempotency: Supported via X-Idempotency-Key header.
 * Duplicate requests within 24 hours return cached response.
 */
export async function POST(req: Request) {
  const traceId = generateTraceId();
  const idempotencyKey = req.headers.get('X-Idempotency-Key');

  // Check idempotency for payment requests
  if (idempotencyKey) {
    const cached = IDEMPOTENCY_CACHE.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
      return NextResponse.json(cached.response as Response, {
        status: cached.statusCode,
        headers: { 'X-Idempotency-Cache': 'true' },
      });
    }
  }

  try {
    const parsed = CheckoutProposalSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Missing or invalid proposalId/tierId/webLinkToken' },
        { status: 400 }
      );
    }
    const { proposalId, tierId, webLinkToken } = parsed.data;

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, webLinkToken },
    });
    if (!proposal) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const priceId = getProposalPriceId(tierId);
    const stripePrice = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const expectedAmount = Number((proposal.pricing as Record<string, unknown>)?.[tierId]);
    const stripeAmount = stripePrice.unit_amount ?? 0;

    if (!expectedAmount || !stripeAmount) {
      return NextResponse.json({ error: 'Proposal pricing is incomplete' }, { status: 400 });
    }

    const expectedAmountCents = Math.round(expectedAmount * 100);
    const delta = Math.abs(expectedAmountCents - stripeAmount) / stripeAmount;
    if (delta > 0.01) {
      console.error('[StripeProposalCheckout] Proposal pricing mismatch', {
        proposalId,
        tierId,
        expectedAmountCents,
        stripeAmount,
        priceId,
      });
      return NextResponse.json(
        { error: 'Pricing mismatch detected. Please contact support.' },
        { status: 409 }
      );
    }

    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        stripePriceId: priceId,
        stripeAmountCents: stripeAmount,
      },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXTAUTH_URL;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/onboarding?type=proposal&proposalId=${proposalId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/proposal/${proposal.webLinkToken}?canceled=true`,
      metadata: {
        proposalId,
        tierId,
        tenantId: proposal.tenantId,
        checkoutType: 'proposal',
      },
      customer_email: proposal.prospectEmail || undefined,
    });

    await prisma.checkoutAttempt.create({
      data: {
        stripeSessionId: session.id,
        tenantId: proposal.tenantId,
        proposalId,
        type: 'proposal',
      },
    });

    const response = { url: session.url };

    // Store idempotency key if provided
    if (idempotencyKey) {
      IDEMPOTENCY_CACHE.set(idempotencyKey, {
        response,
        statusCode: 200,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json(response, {
      status: 200,
      headers: { 'X-Idempotency-Key': idempotencyKey || '' },
    });
  } catch (error: any) {
    console.error('Stripe Proposal Checkout Error:', error);
    const internalError = new InternalError('Checkout creation failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}
