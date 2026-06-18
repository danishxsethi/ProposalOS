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
import { trackUsage } from '@/lib/billing/metering';
import { logError, logger } from '@/lib/logger';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import {
  applyObservabilityHeaders,
  createObservabilityContextFromRequest,
  getObservabilityContext,
  runWithObservabilityContext,
} from '@/lib/observability/context';
import { prisma } from '@/lib/prisma';
import { getAbusePolicy } from '@/lib/security/abuseDefense/policies';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

/**
 * Inner handler for public audit creation
 */
async function handlePublicAudit(req: Request): Promise<NextResponse> {
  return runWithObservabilityContext(
    createObservabilityContextFromRequest(req, { workflow: 'api.public-audit.create' }),
    async () => {
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

        // Get or create system tenant for public leads.
        // Use bypass for the upsert because the Tenant table is not row-scoped by tenant.
        const systemTenant = await runWithTenantBypass(
          'public-audit-create-system-tenant-upsert',
          () =>
            prisma.tenant.upsert({
              where: { domain: 'proposalengine.com' },
              update: {},
              create: {
                name: 'System / Public Leads',
                domain: 'proposalengine.com',
                planTier: 'agency',
              },
            })
        );

        // Create the audit record under the system tenant context.
        const audit = await runWithTenantAsync(systemTenant.id, () =>
          prisma.audit.create({
            data: {
              tenantId: systemTenant.id,
              businessName: businessName || 'Unknown',
              businessUrl: url,
              businessCity: businessCity ?? null,
              businessIndustry: industry ?? null,
              status: 'QUEUED',
            },
          })
        );

        // Trigger orchestrator (fire and forget)
        const currentContext = getObservabilityContext();

        // Record billable usage (fire-and-forget — never blocks the audit)
        trackUsage(systemTenant.id, 'audit.created').catch(() => {});

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
          {
            ...currentContext,
            tenantId: systemTenant.id,
            auditId: audit.id,
            workflow: 'audit-runner',
          },
          () => runWithTenantAsync(systemTenant.id, () => runAudit(audit.id))
        ).catch(async (e) => {
          logError('Bg audit kickoff failed', e, { auditId: audit.id, tenantId: systemTenant.id });
          await runWithTenantAsync(systemTenant.id, () =>
            prisma.audit.update({
              where: { id: audit.id },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
                error: `AUDIT_KICKOFF_FAILED: ${String(e)}`,
              } as any,
            })
          ).catch((updateErr) => {
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

        const response = NextResponse.json(internalError.toEnvelope(req.url, traceId), {
          status: 500,
        });
        applyObservabilityHeaders(response);
        return response;
      }
    }
  );
}

const abusePolicy = getAbusePolicy('public_audit');

const idempotentHandler = withIdempotency(handlePublicAudit, {
  includeBody: true,
  useFingerprintFallback: true,
  tenantId: async () => {
    const tenant = await runWithTenantBypass('public-audit-idempotency-tenant', () =>
      prisma.tenant.findUnique({
        where: { domain: 'proposalengine.com' },
        select: { id: true },
      })
    );
    return tenant?.id ?? 'system-tenant';
  },
});

// Apply rate limiting for public API
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    ...abusePolicy,
    endpoint: 'public_audit',
    routeClass: 'public_audit',
  })(req, () => idempotentHandler(req));

export const POST = rateLimitedHandler;
