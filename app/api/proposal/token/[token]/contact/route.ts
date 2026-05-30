/**
 * POST /api/proposal/[token]/contact
 * Lead capture: Name, Email (required), Phone (optional), Preferred tier, Best time, Message (optional).
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { proposalContactSchema } from '@/lib/api/schemas/proposal';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { sendProposalInterest } from '@/lib/notifications/email';
import { prisma } from '@/lib/prisma';

/**
 * Inner handler for contact form submission
 */
async function handleContactForm(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { token } = await params;

    // Parse and validate body
    const body = await req.json();
    const result = proposalContactSchema.safeParse(body);

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

    const { name, email, phone, company: companyName, message } = result.data;

    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: { audit: { select: { businessName: true, tenantId: true } } },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    const tierAlias: Record<string, string> = {
      essentials: 'starter',
      starter: 'starter',
      growth: 'growth',
      premium: 'premium',
    };
    const normalizedTier =
      typeof body.preferredTier === 'string' ? body.preferredTier.toLowerCase() : '';
    const tier = tierAlias[normalizedTier] || null;

    const now = new Date();

    await prisma.$transaction(async (tx: any) => {
      await tx.contactRequest.create({
        data: {
          proposalId: proposal.id,
          tenantId: proposal.audit.tenantId || 'system',
          name: name.trim(),
          email: email.trim(),
          phone: typeof phone === 'string' ? phone.trim() || null : null,
          preferredTier: tier,
          bestTime: typeof body.bestTime === 'string' ? body.bestTime.trim() || null : null,
          message: typeof message === 'string' ? message.trim() || null : null,
        },
      });

      // Outcome tracking signals
      const updateData: Record<string, unknown> = {};
      if (!proposal.replyReceivedAt) updateData.replyReceivedAt = now;
      if (!proposal.outcome) updateData.outcome = 'PENDING';
      if (tier && !proposal.tierChosen) updateData.tierChosen = tier;

      if (Object.keys(updateData).length > 0) {
        await tx.proposal.update({
          where: { id: proposal.id },
          data: updateData,
        });
      }
    });

    const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/proposal/${token}`;
    await sendProposalInterest(proposal.audit.businessName, proposalUrl, {
      name: name.trim(),
      email: email.trim(),
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      preferredTier: tier,
      bestTime: typeof body.bestTime === 'string' ? body.bestTime.trim() || null : null,
      message: typeof message === 'string' ? message.trim() || null : null,
    });

    const response = NextResponse.json({
      success: true,
      tracked: {
        replyReceivedAt: now.toISOString(),
        tierChosen: tier,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to process contact form', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedHandler = (req: Request, params: { params: Promise<{ token: string }> }) =>
  withRateLimit(RateLimitPresets.proposalGeneration)(req, () => handleContactForm(req, params));

export const POST = (req: Request, params: any) => rateLimitedHandler(req, params);
