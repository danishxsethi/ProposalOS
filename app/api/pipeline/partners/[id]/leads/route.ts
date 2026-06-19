/**
 * app/api/pipeline/partners/[id]/leads/route.ts
 *
 * Partner Leads Management API
 *
 * Features:
 * - Auth & role-based access
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { deliverLead, matchLeadsToPartner, updateLeadStatus } from '@/lib/pipeline/partnerPortal';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Partner lead action schema
 */
const partnerLeadActionSchema = z.object({
  action: z.enum(['match', 'deliver', 'updateStatus']),
  leadId: z.string().uuid().optional(),
  status: z.string().optional(),
});

/**
 * Inner handler for GET partner leads
 */
async function handleGetPartnerLeads(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const { id: partnerId } = await params;

    // Get delivered leads
    const deliveredLeads = await prisma.partnerDeliveredLead.findMany({
      where: { partnerId },
      select: {
        id: true,
        leadId: true,
        status: true,
        deliveredAt: true,
        updatedAt: true,
        packagedData: true,
      },
      orderBy: { deliveredAt: 'desc' },
    });

    const response = NextResponse.json({ leads: deliveredLeads });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error fetching partner leads:', error);
    const internalError = new InternalError('Failed to fetch partner leads', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for POST partner leads
 */
async function handlePartnerLeadAction(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const { id: partnerId } = await params;
    const body = await req.json();

    // Validate request body
    const result = partnerLeadActionSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid action data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { action, leadId, status } = result.data;

    if (action === 'match') {
      // Match and deliver leads to partner
      const matches = await matchLeadsToPartner(partnerId);
      const response = NextResponse.json({ leads: matches });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    } else if (action === 'deliver' && leadId) {
      // Deliver specific lead
      const packagedLead = await deliverLead(partnerId, leadId);
      const response = NextResponse.json({ lead: packagedLead }, { status: 201 });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    } else if (action === 'updateStatus' && leadId && status) {
      // Update lead status
      await updateLeadStatus(partnerId, leadId, status);
      const response = NextResponse.json({ success: true });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    } else {
      const error = new NotFoundError('Invalid action');
      error.details = [{ field: 'action', message: 'Invalid action specified' }];
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }
  } catch (error) {
    logger.error('Error processing partner lead action:', error);
    const internalError = new InternalError('Failed to process partner lead action', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: NextRequest, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many partner lead requests. Please wait before trying again.',
  })(req, () => handleGetPartnerLeads(req, params));

const rateLimitedPost = (req: NextRequest, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many partner lead actions. Please wait before trying again.',
  })(req, () => handlePartnerLeadAction(req, params));

export const GET = (req: NextRequest, params: Params) => rateLimitedGet(req, params);
export const POST = (req: NextRequest, params: Params) => rateLimitedPost(req, params);
