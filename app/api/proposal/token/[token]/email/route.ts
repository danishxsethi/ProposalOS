/**
 * POST /api/proposal/token/[token]/email
 * Send proposal via email
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { proposalEmailSchema } from '@/lib/api/schemas/proposal';
import { sendProposalEmail } from '@/lib/email/sender';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * Inner handler for sending proposal via email
 */
async function handleEmail(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { token } = await params;
    const body = await req.json();

    // Validate request body
    const result = proposalEmailSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid email data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { email } = result.data;

    // Verify proposal exists
    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: { audit: true },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const proposalUrl = `${baseUrl}/proposal/${token}`;
    const pdfUrl = `${baseUrl}/api/proposal/token/${token}/pdf`;

    // Send email
    const sendResult = await sendProposalEmail({
      to: email,
      businessName: proposal.audit.businessName,
      proposalUrl,
      pdfUrl,
    });

    if (!sendResult.success) {
      return NextResponse.json(
        new InternalError('Failed to send email', { reason: sendResult.error }).toEnvelope(
          req.url,
          traceId
        ),
        { status: 500 }
      );
    }

    // Update proposal status to 'SENT'
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const response = NextResponse.json({
      success: true,
      sentAt: new Date().toISOString(),
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to process email request', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (3 requests per minute for email sending)
const rateLimitedHandler = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many email requests. Please wait before trying again.',
  })(req, () => handleEmail(req, params));

export const POST = (req: Request, params: Params) => rateLimitedHandler(req, params);
