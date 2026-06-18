/**
 * app/api/admin/human-review/route.ts
 *
 * Human Review Flag Management — agency_admin or higher required. [#7]
 * Tenant-scoped: reads/updates humanReviewFlag rows for the caller's tenant only.
 */
import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { withAuth } from '@/lib/middleware/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

const humanReviewUpdateSchema = z.object({
  flagId: z.string().uuid({ message: 'Valid flag ID is required' }),
  status: z.enum(['approved', 'rejected'], { message: 'Status must be approved or rejected' }),
  reason: z.string().max(500).optional(),
});

async function handleGetFlags(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        new NotFoundError('Tenant', 'not found').toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    // tenantId scoping in where + RLS enforces no cross-tenant access
    const flags = await prisma.humanReviewFlag.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    const response = NextResponse.json({ flags, count: flags.length });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    return NextResponse.json(
      new InternalError('Failed to fetch review flags', {
        originalError: error instanceof Error ? error.message : String(error),
      }).toEnvelope(req.url, traceId),
      { status: 500 }
    );
  }
}

async function handleUpdateFlag(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        new NotFoundError('Tenant', 'not found').toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    const body = await req.json();
    const result = humanReviewUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        new ValidationError(
          'Invalid request data',
          result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
        ).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { flagId, status, reason } = result.data;

    // Verify ownership before update (defense-in-depth on top of RLS)
    const existing = await prisma.humanReviewFlag.findFirst({
      where: { id: flagId, tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        new NotFoundError('HumanReviewFlag', flagId).toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    const flag = await prisma.humanReviewFlag.update({
      where: { id: flagId },
      data: {
        status,
        reviewedAt: new Date(),
        ...(reason && { notes: reason }),
      },
    });

    const response = NextResponse.json({ flag });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    return NextResponse.json(
      new InternalError('Failed to update review flag', {
        originalError: error instanceof Error ? error.message : String(error),
      }).toEnvelope(req.url, traceId),
      { status: 500 }
    );
  }
}

// withAuth sets tenant context; withRole enforces agency_admin+
const rateLimitedGet = (req: NextRequest) =>
  withRateLimit({ windowMs: 60 * 1000, max: 30 })(req, () => handleGetFlags(req));

const rateLimitedPatch = (req: NextRequest) =>
  withRateLimit({ windowMs: 60 * 1000, max: 10 })(req, () => handleUpdateFlag(req));

export const GET = withAuth(withRole('agency_admin', rateLimitedGet));
export const PATCH = withAuth(withRole('agency_admin', rateLimitedPatch));
