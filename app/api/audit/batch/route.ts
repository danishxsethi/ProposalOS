/**
 * POST /api/audit/batch
 * Create and run batch audits for multiple businesses.
 *
 * Features:
 * - Zod validation with batchAuditSchema
 * - Rate limiting (2 requests/minute for batch operations)
 * - Idempotency support via Idempotency-Key header
 * - Standardized error responses
 * - Per-item error isolation
 */

import { NextResponse } from 'next/server';

import { v4 as uuidv4 } from 'uuid';

import { generateTraceId, InternalError, ValidationError } from '@/lib/api/errors';
import { batchAuditSchema } from '@/lib/api/schemas/audit';
import { processBatch } from '@/lib/audit/batchProcessor';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotencyMemory } from '@/lib/middleware/idempotency';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';

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

    // Parse and validate body using Zod schema
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
    const batchId = uuidv4();
    const auditIds: string[] = [];
    const creationErrors: Array<{ item: unknown; error: string }> = [];

    // Create all Audit records immediately (tenant-scoped)
    for (const item of items) {
      try {
        const audit = await prisma.audit.create({
          data: {
            tenantId,
            businessName: item.businessName || 'Unknown',
            businessUrl: item.url,
            placeId: item.placeId ?? null,
            status: 'QUEUED',
            batchId: batchId,
          },
        });
        auditIds.push(audit.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ batchId, item, error: msg }, 'Failed to create audit record in batch');
        creationErrors.push({ item, error: msg });
      }
    }

    if (auditIds.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'BATCH_CREATION_FAILED',
            message: 'No valid audit records could be created',
            details: creationErrors,
            timestamp: new Date().toISOString(),
            traceId,
          },
        },
        { status: 422 }
      );
    }

    logger.info(
      {
        event: 'batch.created',
        batchId,
        batchName,
        count: auditIds.length,
        errorCount: creationErrors.length,
      },
      'Batch audit created'
    );

    // Process batch asynchronously with tenant context
    runWithTenantAsync(tenantId, () => processBatch(batchId, auditIds)).catch((err) => {
      logger.error({ batchId, error: err }, 'Batch processing crashed');
    });

    const response = NextResponse.json({
      success: true,
      batchId,
      batchName,
      auditIds,
      partialErrors: creationErrors.length > 0 ? creationErrors : undefined,
      message: 'Batch started. Poll status at /api/audit/batch/[batchId]',
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Error creating batch');

    const internalError = new InternalError('Failed to create batch', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply middleware stack: withRole -> withAuth -> withRateLimit -> withIdempotency
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.batchOperations)(req, () => handleBatchAuditCreation(req));
const idempotentHandler = (req: Request) => withIdempotencyMemory(rateLimitedHandler)(req);
const authHandler = (req: Request) => withAuth(idempotentHandler)(req, [] as any);
export const POST = (req: Request) => withRole('member', authHandler)(req, [] as any);
