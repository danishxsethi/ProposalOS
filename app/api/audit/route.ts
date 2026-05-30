/**
 * POST /api/audit
 * Create and run a single audit. Uses lib/audit/runner.ts as the canonical execution path.
 * P1-9: Requires minimum 'member' role — viewers cannot create audits.
 *
 * Features:
 * - Zod validation with comprehensive auditTriggerSchema
 * - Rate limiting (5 requests/minute for audit trigger)
 * - Idempotency support via Idempotency-Key header
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, ValidationError } from '@/lib/api/errors';
import { auditTriggerSchema } from '@/lib/api/schemas/audit';
import { runAudit } from '@/lib/audit/runner';
import { checkAuditLimit } from '@/lib/billing/limits';
import { logError, logger } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import {
  applyObservabilityHeaders,
  createObservabilityContextFromRequest,
  getObservabilityContext,
  runWithObservabilityContext,
} from '@/lib/observability/context';
import { prisma } from '@/lib/prisma';
import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';
import { extractBusinessFromUrl } from '@/lib/utils/urlExtractor';

/**
 * Inner handler for audit creation with all middleware applied
 */
async function handleAuditCreation(req: Request): Promise<NextResponse> {
  return runWithObservabilityContext(
    createObservabilityContextFromRequest(req, { workflow: 'api.audit.create' }),
    async () => {
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

        const { url, industry, businessName, businessCity, placeId } = result.data;

        // Check Usage Limits
        const limits = await checkAuditLimit();
        if (!limits.allowed) {
          return NextResponse.json(
            {
              error: {
                code: 'QUOTA_EXCEEDED',
                message: 'Plan Limit Exceeded',
                details: { reason: limits.reason, upgrade: true },
                timestamp: new Date().toISOString(),
                traceId,
              },
            },
            { status: 429 }
          );
        }

        // Check Daily Quota
        const { checkDailyAuditLimit, incrementAuditCount } =
          await import('@/lib/costs/costTracker');
        const dailyLimit = checkDailyAuditLimit(tenantId);
        if (!dailyLimit.allowed) {
          await recordAuditTrailEvent({
            eventType: 'abuse.quota_exceeded',
            tenantId,
            payload: {
              routeClass: 'authenticated_audit',
              limit: dailyLimit.limit,
              todayCount: dailyLimit.todayCount,
              remaining: dailyLimit.remaining,
            },
          }).catch(() => {});

          return NextResponse.json(
            {
              error: {
                code: 'QUOTA_EXCEEDED',
                message: 'Daily Audit Limit Exceeded',
                details: { reason: 'DAILY_CAP_REACHED', upgrade: true },
                timestamp: new Date().toISOString(),
                traceId,
              },
            },
            { status: 429 }
          );
        }

        let name = businessName;
        const city = businessCity;
        let targetUrl = url;

        // If URL provided without name, extract business info from URL
        if (targetUrl && !name) {
          const extracted = await extractBusinessFromUrl(targetUrl);
          name = extracted.name;
          targetUrl = extracted.url;
        }

        // Create Audit record (runner will execute modules)
        const audit = await prisma.audit.create({
          data: {
            tenantId,
            businessName: name || 'Pending...',
            businessCity: city ?? null,
            businessUrl: targetUrl ?? null,
            placeId: placeId ?? null,
            businessIndustry: industry || 'Generic',
            status: 'QUEUED',
            apiCostCents: 0,
          },
        });

        incrementAuditCount(tenantId);

        Metrics.increment('audits_total');

        logger.info(
          {
            event: 'audit.start',
            auditId: audit.id,
            tenantId,
            hasBusinessName: Boolean(name),
            hasTargetUrl: Boolean(targetUrl),
          },
          'Starting audit'
        );
        await recordAuditTrailEvent({
          eventType: 'audit.requested',
          tenantId,
          auditId: audit.id,
          triggerSource: 'api.audit.create',
          targetUrl: targetUrl,
          payload: {
            hasBusinessName: Boolean(name),
            industry: industry || 'Generic',
          },
        });

        // Run audit via canonical runner (single source of truth)
        // Ensure runner has tenant context for child graphs
        // Fire and forget so we don't block the request timeout
        const currentContext = getObservabilityContext();
        runWithObservabilityContext(
          { ...currentContext, tenantId, auditId: audit.id, workflow: 'audit-runner' },
          () => runWithTenantAsync(tenantId, () => runAudit(audit.id))
        ).catch((err) => {
          logError('Error running audit asynchronously', err, { auditId: audit.id });
          prisma.audit
            .update({
              where: { id: audit.id },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
              },
            })
            .catch((updateErr) => {
              logError('Failed to persist async kickoff failure on audit record', updateErr, {
                auditId: audit.id,
              });
            });
        });

        const response = NextResponse.json({
          success: true,
          id: audit.id,
          auditId: audit.id,
          status: audit.status,
        });

        applyObservabilityHeaders(response);
        return response;
      } catch (error) {
        logError('Error creating audit', error);
        Metrics.increment('audits_failed');

        const internalError = new InternalError('Failed to create audit', {
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

// Apply middleware stack: withRole -> withAuth -> withRateLimit -> withIdempotency
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.auditTrigger)(req, () => handleAuditCreation(req));
const idempotentHandler = (req: Request) => withIdempotency(rateLimitedHandler)(req);
const authHandler = (req: Request) => withAuth(idempotentHandler)(req, [] as any);
export const POST = (req: Request) => withRole('agency_member', authHandler)(req, [] as any);
