/**
 * app/api/admin/human-review/route.ts
 *
 * Human Review Flag Management
 * Allows admins to review and approve/reject flagged content
 *
 * Features:
 * - Auth & tenant scoping
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import {
  generateTraceId,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Human review flag update schema
 */
const humanReviewUpdateSchema = z.object({
  flagId: z.string().uuid({ message: 'Valid flag ID is required' }),
  status: z.enum(['approved', 'rejected'], { message: 'Status must be approved or rejected' }),
  reason: z.string().max(500).optional(),
});

/**
 * Inner handler for GET flags
 */
async function handleGetFlags(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    // Get user's tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        new NotFoundError('Tenant', 'not found').toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    const flags = await prisma.humanReviewFlag.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    const response = NextResponse.json({ flags, count: flags.length });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Failed to get human review flags:', error);
    const internalError = new InternalError('Failed to fetch review flags', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for PATCH flag
 */
async function handleUpdateFlag(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = humanReviewUpdateSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid request data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { flagId, status, reason } = result.data;

    const flag = await prisma.humanReviewFlag.update({
      where: { id: flagId },
      data: {
        status,
        reviewedBy: session.user.email,
        reviewedAt: new Date(),
        ...(reason && { notes: reason }),
      },
    });

    const response = NextResponse.json({ flag });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Failed to update human review flag:', error);
    const internalError = new InternalError('Failed to update review flag', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many review requests. Please wait before trying again.',
  })(req, () => handleGetFlags(req));

const rateLimitedPatch = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many update requests. Please wait before trying again.',
  })(req, () => handleUpdateFlag(req));

export const GET = rateLimitedGet;
export const PATCH = rateLimitedPatch;
