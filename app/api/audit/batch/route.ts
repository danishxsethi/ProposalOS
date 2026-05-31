/**
 * POST /api/audit/batch
 * Create and enqueue batch audits for multiple businesses.
 *
 * BEFORE: Ran all audits sequentially in the request path (blocking, unsafe).
 * AFTER:  Creates Audit records, enqueues AuditJob rows, returns immediately.
 *         Jobs are processed asynchronously by the worker endpoint.
 *
 * Features:
 * - Zod validation with batchAuditSchema (max 100 items)
 * - Rate limiting (2 requests/minute for batch operations)
 * - Idempotency support via Idempotency-Key header
 * - Standardized error responses
 * - Per-item error isolation (partial success is OK)
 * - No request-bound sequential processing
 */

import { NextResponse } from 'next/server';

import { v4 as uuidv4 } from 'uuid';

import { generateTraceId, InternalError, ValidationError } from '@/lib/api/errors';
import { batchAuditSchema } from '@/lib/api/schemas/audit';
import { processBatch } from '@/lib/audit/batchProcessor';
import { checkAndDecrementQuota } from '@/lib/billing/limits';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * Inner handler for batch audit creation
 */
async function handleBatchAuditCreation(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        new ValidationError('Unauthorized: No Tenant').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    // Parse and validate body
    const body = await req.json();
    const result = batchAuditSchema.safeParse(body);

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid batch input', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { name: batchName, items } = result.data;

    // Restrict max batch size strictly to 50
    if (items.length > 50) {
      return NextResponse.json(
        new ValidationError('Batch size exceeds maximum limit of 50 audits').toEnvelope(
          req.url,
          traceId
        ),
        { status: 400 }
      );
    }

    // Check Daily Quota / Cost Budget
    const { checkDailyAuditLimit, incrementAuditCount } = await import('@/lib/costs/costTracker');
    const dailyLimit = checkDailyAuditLimit(tenantId);
    if (!dailyLimit.allowed || items.length > dailyLimit.remaining) {
      const recordAuditTrailEvent = (await import('@/lib/observability/auditTrail'))
        .recordAuditTrailEvent;
      await recordAuditTrailEvent({
        eventType: 'abuse.quota_exceeded',
        tenantId,
        payload: {
          routeClass: 'batch_audit',
          limit: dailyLimit.limit,
          todayCount: dailyLimit.todayCount,
          remaining: dailyLimit.remaining,
          requestedCount: items.length,
        },
      }).catch(() => {});

      return NextResponse.json(
        {
          error: {
            code: 'QUOTA_EXCEEDED',
            message: `Daily Audit Limit Exceeded. You have ${dailyLimit.remaining} remaining audits today, but requested ${items.length}.`,
            details: { reason: 'DAILY_CAP_REACHED', upgrade: true },
            timestamp: new Date().toISOString(),
            traceId,
          },
        },
        { status: 429 }
      );
    }

    const batchId = uuidv4();
    const auditIds: string[] = [];
    const creationErrors: Array<{ item: unknown; error: string }> = [];

    // Transactionally check quota with SELECT FOR UPDATE row lock and create all batch audits
    try {
      await prisma.$transaction(async (tx) => {
        // Run quota check for the entire batch size!
        await checkAndDecrementQuota(tenantId, tx, items.length);

        for (const item of items) {
          const audit = await tx.audit.create({
            data: {
              tenantId,
              businessName: item.businessName || 'Unknown',
              businessUrl: item.url,
              placeId: item.placeId ?? null,
              status: 'QUEUED',
              batchId,
            },
          });
          auditIds.push(audit.id);
          incrementAuditCount(tenantId);
        }
      });
    } catch (quotaError: any) {
      return NextResponse.json(
        {
          error: {
            code: 'QUOTA_EXCEEDED',
            message: quotaError instanceof Error ? quotaError.message : String(quotaError),
            details: { reason: 'QUOTA_EXHAUSTED', upgrade: true },
            timestamp: new Date().toISOString(),
            traceId,
          },
        },
        { status: 429 }
      );
    }

    // Enqueue all audit jobs — returns immediately, no in-process execution
    const enqueueResult = await processBatch(batchId, tenantId, auditIds);

    logger.info(
      {
        event: 'batch.accepted',
        batchId,
        batchName,
        auditCount: auditIds.length,
        enqueued: enqueueResult.enqueued,
        enqueueFailed: enqueueResult.errors.length,
        auditCreationErrors: creationErrors.length,
      },
      'Batch accepted — jobs enqueued'
    );

    const response = NextResponse.json({
      success: true,
      batchId,
      batchName,
      accepted: enqueueResult.enqueued,
      rejected: creationErrors.length + enqueueResult.errors.length,
      auditIds,
      partialErrors:
        creationErrors.length > 0 || enqueueResult.errors.length > 0
          ? [
              ...creationErrors,
              ...enqueueResult.errors.map((e) => ({
                item: { auditId: e.auditId },
                error: e.error,
              })),
            ]
          : undefined,
      message: `${enqueueResult.enqueued} jobs queued. Poll status at /api/audit/batch/${batchId}`,
      statusUrl: `/api/audit/batch/${batchId}`,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Batch: unhandled error');
    const internalError = new InternalError('Failed to create batch', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply middleware stack: withRole -> withAuth -> withRateLimit -> withIdempotency
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.batchOperations)(req, () => handleBatchAuditCreation(req));
const idempotentHandler = (req: Request) => withIdempotency(rateLimitedHandler)(req);
const authHandler = (req: Request) => withAuth(idempotentHandler)(req, [] as any);
export const POST = (req: Request) => withRole('agency_member', authHandler)(req, [] as any);
