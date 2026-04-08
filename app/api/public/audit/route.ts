/**
 * POST /api/public/audit
 * Public audit endpoint for lead generation.
 *
 * Features:
 * - Zod validation with auditTriggerSchema
 * - Rate limiting (10 requests/minute for public API)
 * - Standardized error responses
 * - System tenant for public leads
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, ValidationError } from '@/lib/api/errors';
import { auditTriggerSchema } from '@/lib/api/schemas/audit';
import { runAudit } from '@/lib/audit/runner';
import { logError, logger } from '@/lib/logger';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { applyObservabilityHeaders, createObservabilityContextFromRequest, getObservabilityContext, runWithObservabilityContext } from '@/lib/observability/context';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

/**
 * Inner handler for public audit creation
 */
async function handlePublicAudit(req: Request): Promise<NextResponse> {
  return runWithObservabilityContext(createObservabilityContextFromRequest(req, { workflow: 'api.public-audit.create' }), async () => {
    const traceId = generateTraceId();

    try {
    // Parse and validate body using Zod schema
    const body = await req.json();
    const result = auditTriggerSchema.safeParse(body);

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid input', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { url, industry, businessName, businessCity } = result.data;

    // Get or create system tenant for public leads
    const systemTenant = await prisma.tenant.upsert({
      where: { domain: 'proposalengine.com' },
      update: {},
      create: {
        name: 'System / Public Leads',
        domain: 'proposalengine.com',
        planTier: 'agency',
      },
    });

    const audit = await prisma.audit.create({
      data: {
        tenantId: systemTenant.id,
        businessName: businessName || 'Unknown',
        businessUrl: url,
        businessCity: businessCity ?? null,
        businessIndustry: industry ?? null,
        status: 'QUEUED',
      },
    });

    // Trigger orchestrator (fire and forget)
    const currentContext = getObservabilityContext();
    logger.info(
      {
        event: 'audit.public.start',
        auditId: audit.id,
        tenantId: systemTenant.id,
        hasBusinessName: Boolean(businessName),
        hasTargetUrl: Boolean(url),
      },
      'Starting public audit'
    );
    await recordAuditTrailEvent({
      eventType: 'audit.requested',
      tenantId: systemTenant.id,
      auditId: audit.id,
      triggerSource: 'api.public-audit.create',
      targetUrl: url,
      payload: {
        hasBusinessName: Boolean(businessName),
        industry: industry ?? null,
      },
    });

    runWithObservabilityContext(
      { ...currentContext, tenantId: systemTenant.id, auditId: audit.id, workflow: 'audit-runner' },
      () => runWithTenantAsync(systemTenant.id, () => runAudit(audit.id))
    ).catch(async (e) => {
      logError('Bg audit kickoff failed', e, { auditId: audit.id, tenantId: systemTenant.id });
      await prisma.audit
        .update({
          where: { id: audit.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            error: `AUDIT_KICKOFF_FAILED: ${String(e)}`,
          } as any,
        })
        .catch((updateErr) => {
          logError('Failed to persist kickoff failure on public audit record', updateErr, {
            auditId: audit.id,
          });
        });
    });

    const response = NextResponse.json({ id: audit.id });
    applyObservabilityHeaders(response);
    return response;
  } catch (error) {
    logError('Failed to create public audit', error);
    const internalError = new InternalError('Failed to create public audit', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    const response = NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
    applyObservabilityHeaders(response);
    return response;
  }
  });
}

// Apply rate limiting for public API
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.publicApi)(req, () => handlePublicAudit(req));

export const POST = rateLimitedHandler;
