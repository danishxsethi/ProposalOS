/**
 * app/api/analytics/cart-abandonment/route.ts
 *
 * Cart Abandonment Analytics API
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { CartAbandonmentService } from '@/lib/analytics/cartAbandonmentService';
import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';

/**
 * Query params schema for GET requests
 */
const cartAbandonmentQuerySchema = z.object({
  action: z.enum(['abandoned-carts', 'conversion-funnel', 'stats']),
  daysBack: z.coerce.number().positive().max(90).default(7),
  type: z.enum(['proposal', 'saas']).default('proposal'),
});

/**
 * Track event schema for POST requests
 */
const trackEventSchema = z.object({
  sessionId: z.string().min(1),
  proposalId: z.string().uuid(),
  checkoutType: z.enum(['proposal', 'saas']),
  step: z.enum([
    'initiated',
    'pricing_selected',
    'checkout_started',
    'payment_failed',
    'completed',
  ]),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Follow-up trigger schema for PUT requests
 */
const followUpSchema = z.object({
  email: z.string().email(),
  proposalId: z.string().uuid(),
  tierId: z.string().uuid().optional(),
});

/**
 * Inner handler for GET cart abandonment
 */
async function handleGetCartAbandonment(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const daysBack = parseInt(url.searchParams.get('daysBack') || '7', 10);
    const type = (url.searchParams.get('type') as 'proposal' | 'saas') || 'proposal';

    // Validate query params
    const result = cartAbandonmentQuerySchema.safeParse({ action, daysBack, type });
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    switch (action) {
      case 'abandoned-carts':
        const abandonedCarts = await CartAbandonmentService.getAbandonedCarts(daysBack);
        const response1 = NextResponse.json(abandonedCarts);
        response1.headers.set('X-Trace-Id', traceId);
        return response1;

      case 'conversion-funnel':
        const funnelData = await CartAbandonmentService.getConversionFunnel(type, daysBack);
        const response2 = NextResponse.json(funnelData);
        response2.headers.set('X-Trace-Id', traceId);
        return response2;

      case 'stats':
        const stats = await CartAbandonmentService.getAbandonmentStats(daysBack);
        const response3 = NextResponse.json(stats);
        response3.headers.set('X-Trace-Id', traceId);
        return response3;

      default:
        const invalidActionError = new NotFoundError('Invalid action');
        invalidActionError.details = [{ field: 'action', message: 'Invalid action specified' }];
        return NextResponse.json(invalidActionError.toEnvelope(req.url, traceId), { status: 400 });
    }
  } catch (error) {
    logger.error('Error fetching cart abandonment data:', error);
    const internalError = new InternalError('Failed to fetch cart abandonment data', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for POST track event
 */
async function handleTrackEvent(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = trackEventSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid event data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { sessionId, proposalId, checkoutType, step, metadata } = result.data;

    const event = await CartAbandonmentService.trackEvent(
      sessionId,
      proposalId,
      checkoutType,
      step,
      metadata
    );
    const response = NextResponse.json(event, { status: 201 });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error tracking cart abandonment event:', error);
    const internalError = new InternalError('Failed to track cart abandonment event', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for PUT follow-up
 */
async function handleFollowUp(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = followUpSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid follow-up data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { email, proposalId, tierId } = result.data;

    const success = await CartAbandonmentService.triggerFollowUp(email, proposalId, tierId);
    const response = NextResponse.json({ success });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error triggering follow-up:', error);
    const internalError = new InternalError('Failed to trigger follow-up', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for DELETE cleanup
 */
async function handleCleanup(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const cleanedCount = await CartAbandonmentService.cleanupOldEvents();
    const response = NextResponse.json({ message: `Cleaned up ${cleanedCount} old events` });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error cleaning up old events:', error);
    const internalError = new InternalError('Failed to cleanup old events', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many analytics requests. Please wait before trying again.',
  })(req, () => handleGetCartAbandonment(req));

const rateLimitedPost = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many tracking requests. Please wait before trying again.',
  })(req, () => handleTrackEvent(req));

const rateLimitedPut = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many follow-up requests. Please wait before trying again.',
  })(req, () => handleFollowUp(req));

const rateLimitedDelete = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cleanup requests. Please wait before trying again.',
  })(req, () => handleCleanup(req));

export const GET = rateLimitedGet;
export const POST = rateLimitedPost;
export const PUT = rateLimitedPut;
export const DELETE = rateLimitedDelete;
