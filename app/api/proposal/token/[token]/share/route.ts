/**
 * POST /api/proposal/token/[token]/share
 * Track proposal share events across platforms
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { proposalShareSchema } from '@/lib/api/schemas/proposal';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ token: string }>;
}

/**
 * Inner handler for tracking share events
 */
async function handleShare(req: Request, context: RouteContext): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { token } = await context.params;
    const body = await req.json();

    // Validate request body
    const result = proposalShareSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid share data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { platform } = result.data;

    // Find proposal
    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Track share event by incrementing counter
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        shareCount: {
          increment: 1,
        },
      },
    });

    // Optionally: Log to a separate events table for detailed analytics
    // await prisma.proposalEvent.create({
    //     data: {
    //         proposalId: proposal.id,
    //         eventType: 'SHARED',
    //         platform,
    //         timestamp: new Date()
    //     }
    // });

    const response = NextResponse.json({
      success: true,
      message: 'Share tracked successfully',
      platform,
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to process share event', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (30 requests per minute for share tracking)
const rateLimitedHandler = (req: Request, context: RouteContext) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many share requests. Please slow down.',
  })(req, () => handleShare(req, context));

export const POST = (req: Request, context: RouteContext) => rateLimitedHandler(req, context);
