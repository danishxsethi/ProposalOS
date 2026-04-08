import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, ValidationError } from '@/lib/api/errors';
import { runAudit } from '@/lib/audit/runner';
import { logError, logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { applyObservabilityHeaders, createObservabilityContextFromRequest, getObservabilityContext, runWithObservabilityContext } from '@/lib/observability/context';
import { createScopedPrisma, getTenantId, runWithTenantAsync } from '@/lib/tenant/context';
// P0-3: Use runner (Single source of truth)

/**
 * API v1 - Create Audit (with rate limiting)
 *
 * Rate limit headers returned:
 * - X-RateLimit-Limit: Max requests per day
 * - X-RateLimit-Remaining: Requests remaining
 * - X-RateLimit-Used: Requests used today
 * - X-RateLimit-Reset: When the limit resets (ISO timestamp)
 *
 * Rate limit exceeded response (429):
 * - Retry-After: Seconds until reset
 */
async function handlePOST(req: Request) {
  return runWithObservabilityContext(createObservabilityContextFromRequest(req, { workflow: 'api.v1.audit.create' }), async () => {
    const traceId = generateTraceId();

    try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      const unauthorized = NextResponse.json(
        new ValidationError('Unauthorized: No Tenant').toEnvelope(req.url, traceId),
        { status: 401 }
      );
      applyObservabilityHeaders(unauthorized);
      return unauthorized;
    }

    const prisma = createScopedPrisma(tenantId);

    const body = await req.json();
    const { businessName, businessUrl, city, industry } = body;

    if (!businessName || !businessUrl) {
      const validation = NextResponse.json(
        new ValidationError('Missing required fields', [
          { field: 'businessName', message: 'businessName is required' },
          { field: 'businessUrl', message: 'businessUrl is required' },
        ]).toEnvelope(req.url, traceId),
        { status: 400 }
      );
      applyObservabilityHeaders(validation);
      return validation;
    }

    // Create audit record
    const audit = await prisma.audit.create({
      data: {
        tenantId,
        businessName,
        businessUrl,
        businessCity: city,
        businessIndustry: industry || 'Generic',
        status: 'QUEUED',
        apiCostCents: 0,
      },
    });

    // Trigger audit runner asynchronously (P0-3 redirect)
    logger.info(
      {
        event: 'audit.v1.start',
        auditId: audit.id,
        tenantId,
        hasBusinessName: Boolean(businessName),
        hasTargetUrl: Boolean(businessUrl),
      },
      'Starting v1 audit'
    );
    await recordAuditTrailEvent({
      eventType: 'audit.requested',
      tenantId,
      auditId: audit.id,
      triggerSource: 'api.v1.audit.create',
      targetUrl: businessUrl,
      payload: {
        hasBusinessName: Boolean(businessName),
        industry: industry || 'Generic',
      },
    });

    const currentContext = getObservabilityContext();
    runWithObservabilityContext({ ...currentContext, tenantId, auditId: audit.id, workflow: 'audit-runner' }, () =>
      runWithTenantAsync(tenantId, () => runAudit(audit.id))
    ).catch(async (error) => {
      logError('Audit runner failed', error, { auditId: audit.id, tenantId });
      await prisma.audit
        .update({
          where: { id: audit.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            error: `AUDIT_KICKOFF_FAILED: ${String(error)}`,
          } as any,
        })
        .catch((updateError) => {
          logError('Failed to persist kickoff failure status', updateError, { auditId: audit.id });
        });
    });

    const response = NextResponse.json(
      {
        id: audit.id,
        status: audit.status,
        createdAt: audit.createdAt,
        message: 'Audit created and processing started',
      },
      { status: 201 }
    );
    applyObservabilityHeaders(response);
    return response;
  } catch (error) {
    logError('API v1 audit error', error);
    const internalError = new InternalError('Failed to create audit', {
      originalError: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
    applyObservabilityHeaders(response);
    return response;
  }
  });
}

// Export with rate limit and auth middleware
export const POST = withAuth((req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many audit requests. Please wait before trying again.',
  })(req, () => handlePOST(req))
);
