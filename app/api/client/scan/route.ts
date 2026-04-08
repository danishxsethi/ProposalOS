/**
 * app/api/client/scan/route.ts
 *
 * Client On-Demand Scan API
 * Allows clients to trigger new audits with rate limiting
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
  RateLimitError,
  ValidationError,
} from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

// Rate limit: 1 scan per week per client
const SCAN_RATE_LIMIT_DAYS = 7;

/**
 * Scan request body schema
 */
const scanBodySchema = z.object({
  token: z.string().optional(),
  auditId: z.string().uuid().optional(),
  url: z.string().url().optional(),
  businessName: z.string().optional(),
  email: z.string().email().optional(),
});

/**
 * Scan status query schema
 */
const scanStatusQuerySchema = z.object({
  auditId: z.string().uuid(),
});

/**
 * Inner handler for POST scan
 */
async function handlePostScan(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const body = await req.json();

    // Validate request body
    const result = scanBodySchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid scan request', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { token, auditId, url, businessName, email } = result.data;

    if (!token && !auditId) {
      return NextResponse.json(
        new ValidationError('token or auditId required', [
          { field: 'token', message: 'Either token or auditId must be provided' },
        ]).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    // Get proposal or existing audit for verification
    let targetAuditId = auditId;
    let tenantId: string;
    let businessUrl: string | null;

    if (token) {
      const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
          audit: {
            select: { id: true, tenantId: true, businessUrl: true },
          },
        },
      });

      if (!proposal) {
        return NextResponse.json(
          new NotFoundError('Proposal', token).toEnvelope(req.url, traceId),
          { status: 404 }
        );
      }

      targetAuditId = proposal.auditId;
      tenantId = proposal.audit.tenantId;
      businessUrl = proposal.audit.businessUrl;
    } else if (auditId) {
      const audit = await prisma.audit.findUnique({
        where: { id: auditId ?? undefined },
        select: { tenantId: true, businessUrl: true },
      });

      if (!audit) {
        return NextResponse.json(new NotFoundError('Audit', auditId || 'unknown').toEnvelope(req.url, traceId), {
          status: 404,
        });
      }

      tenantId = audit.tenantId;
      businessUrl = audit.businessUrl;
    } else {
      return NextResponse.json(
        new ValidationError('Unable to determine audit context', []).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    // Check rate limit - count scans in the last 7 days
    const weekAgo = new Date(Date.now() - SCAN_RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000);

    const recentScans = await prisma.audit.count({
      where: {
        tenantId,
        businessUrl: businessUrl ?? undefined,
        createdAt: { gte: weekAgo },
      },
    });

    if (recentScans >= 1) {
      const lastScan = await prisma.audit.findFirst({
        where: {
          tenantId,
          businessUrl: businessUrl ?? undefined,
          createdAt: { gte: weekAgo },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const daysUntilNext = lastScan
        ? Math.ceil(
            (lastScan.createdAt.getTime() +
              SCAN_RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000 -
              Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      const retryAfter = lastScan
        ? Math.ceil(
            (lastScan.createdAt.getTime() +
              SCAN_RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000 -
              Date.now()) /
              1000
          )
        : undefined;

      return NextResponse.json(
        new RateLimitError(
          `You can run a new scan in ${daysUntilNext} day(s)`,
          retryAfter,
          1,
          0,
          lastScan
            ? new Date(lastScan.createdAt.getTime() + SCAN_RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000)
            : undefined
        ).toEnvelope(req.url, traceId),
        { status: 429 }
      );
    }

    // Get the original audit for business details
    const originalAudit = await prisma.audit.findUnique({
      where: { id: targetAuditId },
      select: {
        businessName: true,
        businessCity: true,
        businessUrl: true,
        businessIndustry: true,
        placeId: true,
      },
    });

    if (!originalAudit) {
      return NextResponse.json(
        new NotFoundError('Original audit', targetAuditId).toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    // Create new audit record
    const newAudit = await prisma.audit.create({
      data: {
        tenantId,
        businessName: originalAudit.businessName,
        businessCity: originalAudit.businessCity,
        businessUrl: originalAudit.businessUrl ?? undefined,
        businessIndustry: originalAudit.businessIndustry,
        placeId: originalAudit.placeId ?? undefined,
        status: 'QUEUED',
      },
    });

    logger.info(
      {
        newAuditId: newAudit.id,
        originalAuditId: targetAuditId,
        tenantId,
      },
      'Client on-demand scan initiated'
    );

    const response = NextResponse.json({
      success: true,
      auditId: newAudit.id,
      status: newAudit.status,
      message: 'Scan initiated. You will be notified when complete.',
      estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Client on-demand scan failed');
    const internalError = new InternalError('Failed to initiate scan', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for GET scan status
 */
async function handleGetScanStatus(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { searchParams } = new URL(req.url);
    const auditId = searchParams.get('auditId');

    // Validate query params
    const result = scanStatusQuerySchema.safeParse({ auditId });
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid auditId', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const audit = await prisma.audit.findUnique({
      where: { id: auditId ?? undefined },
    });

    if (!audit) {
      return NextResponse.json(new NotFoundError('Audit', auditId || 'unknown').toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    // Get findings count separately
    const findingsCount = await prisma.finding.count({
      where: { auditId: auditId ?? undefined },
    });

    const response = NextResponse.json({
      auditId: audit.id,
      status: audit.status,
      progress: getProgressForStatus(audit.status),
      overallScore: audit.overallScore,
      findingsCount,
      createdAt: audit.createdAt,
      completedAt: audit.completedAt,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Scan status check failed');
    const internalError = new InternalError('Failed to get scan status', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Get progress percentage based on audit status
 */
function getProgressForStatus(status: string): number {
  const progressMap: Record<string, number> = {
    QUEUED: 10,
    RUNNING: 50,
    PARTIAL: 80,
    DEGRADED: 80,
    COMPLETE: 100,
    FAILED: 0,
  };
  return progressMap[status] || 0;
}

// Apply rate limiting (2 requests per minute for scan - expensive operation)
const rateLimitedPost = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 2,
    message: 'Too many scan requests. Please wait before trying again.',
  })(req, () => handlePostScan(req));

// Apply rate limiting (30 requests per minute for status checks)
const rateLimitedGet = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many status requests. Please wait before trying again.',
  })(req, () => handleGetScanStatus(req));

export const POST = rateLimitedPost;
export const GET = rateLimitedGet;
