/**
 * app/api/settings/templates/[id]/route.ts
 *
 * Proposal Template Management
 *
 * Features:
 * - Auth & tenant scoping
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import {
  ForbiddenError,
  generateTraceId,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/errors';
import { withAuth } from '@/lib/middleware/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { createScopedPrisma, getTenantId } from '@/lib/tenant/context';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Template update schema
 */
const templateUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  isDefault: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

/**
 * Inner handler for GET template
 */
async function handleGetTemplate(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { id } = await params;
    const tenantId = await getTenantId();

    if (!tenantId) {
      return NextResponse.json(
        new ForbiddenError('Tenant context required').toEnvelope(req.url, traceId),
        { status: 403 }
      );
    }

    const prismaScoped = createScopedPrisma(tenantId);

    const template = await prismaScoped.proposalTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(new NotFoundError('Template', id).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    const response = NextResponse.json(template);
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to fetch template', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for PATCH template
 */
async function handleUpdateTemplate(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { id } = await params;
    const tenantId = await getTenantId();

    if (!tenantId) {
      return NextResponse.json(
        new ForbiddenError('Tenant context required').toEnvelope(req.url, traceId),
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = templateUpdateSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid request body', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const prismaScoped = createScopedPrisma(tenantId);

    const template = await prismaScoped.proposalTemplate.update({
      where: { id },
      data: result.data,
    });

    if (body.isDefault) {
      await prismaScoped.proposalTemplate.updateMany({
        where: {
          id: { not: template.id },
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const response = NextResponse.json(template);
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to update template', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for DELETE template
 */
async function handleDeleteTemplate(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { id } = await params;
    const tenantId = await getTenantId();

    if (!tenantId) {
      return NextResponse.json(
        new ForbiddenError('Tenant context required').toEnvelope(req.url, traceId),
        { status: 403 }
      );
    }

    const prismaScoped = createScopedPrisma(tenantId);
    await prismaScoped.proposalTemplate.delete({
      where: { id },
    });

    const response = NextResponse.json({ success: true });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to delete template', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many template requests. Please wait before trying again.',
  })(req, () => handleGetTemplate(req, params));

const rateLimitedPatch = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many template update requests. Please wait before trying again.',
  })(req, () => handleUpdateTemplate(req, params));

const rateLimitedDelete = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many template deletion requests. Please wait before trying again.',
  })(req, () => handleDeleteTemplate(req, params));

export const GET = (req: Request, params: Params) => withAuth(rateLimitedGet)(req, params);
export const PATCH = (req: Request, params: Params) => withAuth(rateLimitedPatch)(req, params);
export const DELETE = (req: Request, params: Params) => withAuth(rateLimitedDelete)(req, params);
