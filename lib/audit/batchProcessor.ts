/**
 * lib/audit/batchProcessor.ts
 *
 * Batch Processor — public interface used by the batch API route.
 *
 * BEFORE (removed):
 *   Ran all audits sequentially in-process, blocking the HTTP request.
 *   Unsafe for Cloud Run timeouts, multi-instance deployments, and partial
 *   failure recovery.
 *
 * AFTER (this file):
 *   Enqueues one AuditJob per audit ID into the durable job queue and
 *   returns immediately.  Each job is processed asynchronously by the
 *   worker endpoint (app/api/worker/audit-job/route.ts).
 *
 * The previous processBatch(batchId, auditIds) signature is preserved so
 * existing callers do not need to change.
 */

import { logger } from '@/lib/logger';
import { enqueueBatchJobs } from '@/lib/queue/auditJobQueue';

/**
 * Enqueue all audits in a batch for asynchronous processing.
 *
 * Each audit becomes an individual AuditJob row in the database.  Jobs are
 * idempotent: re-submitting a batch with the same batchId + auditId
 * combination is a no-op (existing job is returned unchanged).
 *
 * Returns a summary of enqueue results so the caller can surface partial
 * errors in the API response.
 */
export async function processBatch(
  batchId: string,
  tenantId: string,
  auditIds: string[]
): Promise<{
  enqueued: number;
  skipped: number;
  errors: Array<{ auditId: string; error: string }>;
}> {
  logger.info(
    { event: 'batch.enqueue_start', batchId, tenantId, auditCount: auditIds.length },
    'Batch: enqueueing jobs'
  );

  const jobs = auditIds.map((auditId) => ({
    tenantId,
    batchId,
    auditId,
    // Idempotency key is batchId:auditId — stable, deterministic, no duplicates
    idempotencyKey: `batch:${batchId}:audit:${auditId}`,
  }));

  const { enqueued, errors } = await enqueueBatchJobs(batchId, jobs);

  logger.info(
    {
      event: 'batch.enqueue_complete',
      batchId,
      tenantId,
      enqueued: enqueued.length,
      errors: errors.length,
    },
    'Batch: enqueue complete'
  );

  return {
    enqueued: enqueued.length,
    skipped: 0, // Reserved for future use (already-succeeded jobs)
    errors,
  };
}
