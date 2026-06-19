/**
 * app/api/pipeline/partners/route.ts
 *
 * Agency Partner Management API
 *
 * Features:
 * - Auth & role-based access (admin for create)
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import {
  generateTraceId,
  InternalError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { onboardPartner, PartnerConfig } from '@/lib/pipeline/partnerPortal';
import { prisma } from '@/lib/prisma';

/**
 * Partner creation schema
 */
const partnerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  contactName: z.string().min(1).max(100),
  verticals: z.array(z.string()).optional(),
  geographies: z.array(z.string()).optional(),
  monthlyVolume: z.number().positive().optional(),
  pricingModel: z.enum(['subscription', 'per_lead']).optional(),
  perLeadPriceCents: z.number().nonnegative().optional(),
  subscriptionPriceCents: z.number().nonnegative().optional(),
});

/**
 * Inner handler for GET partners
 */
async function handleGetPartners(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    // List all partners (partners are global, not tenant-specific)
    const partners = await prisma.agencyPartner.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactName: true,
        verticals: true,
        geographies: true,
        monthlyVolume: true,
        pricingModel: true,
        perLeadPriceCents: true,
        subscriptionPriceCents: true,
        createdAt: true,
      },
    });

    const response = NextResponse.json({ partners });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error listing partners:', error);
    const internalError = new InternalError('Failed to list partners', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for POST partner
 */
async function handleCreatePartner(req: NextRequest): Promise<NextResponse> {
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
    const result = partnerCreateSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid partner data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const partnerId = await onboardPartner({
      name: result.data.name,
      contactEmail: result.data.contactEmail,
      contactName: result.data.contactName ?? undefined,
      verticals: result.data.verticals || [],
      geographies: result.data.geographies || [],
      monthlyVolume: result.data.monthlyVolume || 0,
      pricingModel: result.data.pricingModel || 'per_lead',
      perLeadPriceCents: result.data.perLeadPriceCents ?? undefined,
      subscriptionPriceCents: result.data.subscriptionPriceCents ?? undefined,
    } as PartnerConfig);

    const response = NextResponse.json({ partnerId }, { status: 201 });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error creating partner:', error);
    const internalError = new InternalError('Failed to create partner', {
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
    message: 'Too many partner requests. Please wait before trying again.',
  })(req, () => handleGetPartners(req));

const rateLimitedPost = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many partner creation requests. Please wait before trying again.',
  })(req, () => handleCreatePartner(req));

export const GET = rateLimitedGet;
export const POST = withRole('agency_admin', rateLimitedPost);
