/**
 * app/api/pipeline/prospects/[id]/route.ts
 *
 * Prospect Details API
 *
 * GET: Retrieve full prospect context including audit, proposal, engagement, and state history
 *
 * Features:
 * - Auth & tenant scoping
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { getProspectContext } from '@/lib/pipeline/humanReview';
import { prisma } from '@/lib/prisma';
import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Inner handler for GET prospect
 */
async function handleGetProspect(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { id } = await params;
    const tenantId = (await getTenantId()) || '';

    if (!tenantId) {
      return NextResponse.json(
        new UnauthorizedError('Tenant context required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    return runWithTenantAsync(tenantId, async () => {
      const prospect = await prisma.prospectLead.findUnique({
        where: { id: id },
        select: { id: true },
      });

      if (!prospect) {
        return NextResponse.json(new NotFoundError('Prospect', id).toEnvelope(req.url, traceId), {
          status: 404,
        });
      }

      const context = await getProspectContext(id);

      if (!context) {
        return NextResponse.json(
          new NotFoundError('Prospect context', id).toEnvelope(req.url, traceId),
          { status: 404 }
        );
      }

      const response = NextResponse.json(context);
      response.headers.set('X-Trace-Id', traceId);
      return response;
    });
  } catch (error) {
    logger.error('Error fetching prospect details:', error);
    const internalError = new InternalError('Failed to fetch prospect details', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (30 requests per minute for prospect lookups)
const rateLimitedHandler = (req: NextRequest, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many prospect requests. Please wait before trying again.',
  })(req, () => handleGetProspect(req, params));

export const GET = (req: NextRequest, params: Params) => rateLimitedHandler(req, params);
