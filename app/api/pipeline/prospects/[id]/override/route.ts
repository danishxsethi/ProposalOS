/**
 * app/api/pipeline/prospects/[id]/override/route.ts
 *
 * Prospect Status Override API
 *
 * POST: Manually override a prospect's pipeline status
 *
 * Features:
 * - Auth & role-based access (admin only)
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { overrideProspectStatus } from '@/lib/pipeline/humanReview';
import { createScopedPrisma, getTenantId } from '@/lib/tenant/context';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Status override schema
 */
const statusOverrideSchema = z.object({
  newStatus: z.string().min(1).max(50),
  reason: z.string().min(1).max(500),
});

/**
 * Inner handler for status override
 */
async function handleStatusOverride(req: NextRequest, params: Params): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { id } = await params.params;

  try {
    const session = await auth();
    const tenantId = (await getTenantId()) || '';

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const prisma = createScopedPrisma(tenantId);

    // Verify prospect belongs to tenant (automatic with createScopedPrisma)
    const prospect = await prisma.prospectLead.findUnique({
      where: { id: id },
      select: { id: true },
    });

    if (!prospect) {
      return NextResponse.json(new NotFoundError('Prospect', id).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    const body = await req.json();

    // Validate request body
    const result = statusOverrideSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.map(String).join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new NotFoundError('Invalid override data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { newStatus, reason } = result.data;

    await overrideProspectStatus(id, newStatus, session.user.id, session.user.email, reason);

    const response = NextResponse.json({
      success: true,
      message: 'Status overridden successfully',
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Error overriding prospect status:', error);

    const internalError = new InternalError('Failed to override prospect status', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (10 requests per minute for status overrides)
const rateLimitedHandler = (req: NextRequest, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many override requests. Please wait before trying again.',
  })(req, () => handleStatusOverride(req, params));

export const POST = withRole('admin', (req: NextRequest, params: Params) =>
  rateLimitedHandler(req, params)
);
