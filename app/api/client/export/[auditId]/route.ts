/**
 * app/api/client/export/[auditId]/route.ts
 *
 * Data Export API for Client Offboarding
 * Generates a complete data export package
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import {
  generateTraceId,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api/errors';
import { generateExportPackage } from '@/lib/client/data-export';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Export query params schema
 */
const exportQuerySchema = z.object({
  token: z.string().optional(),
});

/**
 * Export request body schema
 */
const exportBodySchema = z.object({
  token: z.string().optional(),
  reason: z.string().max(500).optional(),
});

interface Params {
  params: Promise<{ auditId: string }>;
}

/**
 * Verify access via proposal token
 */
async function verifyAccess(token: string | null, auditId: string) {
  if (!token) return true;

  const proposal = await prisma.proposal.findUnique({
    where: { webLinkToken: token },
    select: { auditId: true },
  });

  return proposal?.auditId === auditId;
}

/**
 * Inner handler for GET export
 */
async function handleGetExport(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { auditId } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    // Validate query params
    const queryResult = exportQuerySchema.safeParse({ token });
    if (!queryResult.success) {
      const errorDetails = queryResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid query parameters', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    // Verify access
    const hasAccess = await verifyAccess(token, auditId);
    if (!hasAccess) {
      return NextResponse.json(
        new UnauthorizedError('Access denied').toEnvelope(req.url, traceId),
        { status: 403 }
      );
    }

    // Get audit to verify it exists
    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      select: { tenantId: true, businessName: true },
    });

    if (!audit) {
      return NextResponse.json(new NotFoundError('Audit', auditId).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Generate export package
    const exportResult = await generateExportPackage(audit.tenantId, auditId, {
      includePdfReports: true,
      includeRawData: true,
      includeProposals: true,
      includeCommunications: true,
    });

    logger.info(
      {
        auditId,
        tenantId: audit.tenantId,
        exportId: exportResult.zipUrl,
      },
      'Export package generated'
    );

    const response = NextResponse.json({
      success: true,
      downloadUrl: exportResult.zipUrl,
      contents: exportResult.contents,
      generatedAt: exportResult.generatedAt,
      expiresAt: exportResult.expiresAt,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Export generation failed');
    const internalError = new InternalError('Failed to generate export package', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for POST export
 */
async function handlePostExport(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { auditId } = await params;
    const body = await req.json();

    // Validate request body
    const result = exportBodySchema.safeParse(body);
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

    const { token, reason } = result.data;

    // Verify access
    const hasAccess = await verifyAccess(token || null, auditId);
    if (!hasAccess) {
      return NextResponse.json(
        new UnauthorizedError('Access denied').toEnvelope(req.url, traceId),
        { status: 403 }
      );
    }

    // Get audit
    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      select: { tenantId: true, businessName: true },
    });

    if (!audit) {
      return NextResponse.json(new NotFoundError('Audit', auditId).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Generate offboarding package
    const exportResult = await generateExportPackage(audit.tenantId, auditId, {
      includePdfReports: true,
      includeRawData: true,
      includeProposals: true,
      includeCommunications: true,
    });

    logger.info(
      {
        auditId,
        tenantId: audit.tenantId,
        reason,
        exportId: exportResult.zipUrl,
      },
      'Offboarding export generated'
    );

    const response = NextResponse.json({
      success: true,
      downloadUrl: exportResult.zipUrl,
      message: 'Your data export is ready. The download link will expire in 24 hours.',
      expiresAt: exportResult.expiresAt,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Offboarding export failed');
    const internalError = new InternalError('Failed to generate offboarding export', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (5 requests per minute for export - expensive operation)
const rateLimitedGet = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many export requests. Please wait before trying again.',
  })(req, () => handleGetExport(req, params));

const rateLimitedPost = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many export requests. Please wait before trying again.',
  })(req, () => handlePostExport(req, params));

export const GET = (req: Request, params: Params) => rateLimitedGet(req, params);
export const POST = (req: Request, params: Params) => rateLimitedPost(req, params);
