/**
 * lib/queue/auditJobWorker.ts
 *
 * Audit Job Worker — core processing logic for a single AuditJob record.
 *
 * Called by the worker HTTP endpoint (app/api/worker/audit-job/route.ts).
 * This file contains no HTTP plumbing — only the business logic needed to
 * safely execute one audit job with:
 *   - Tenant context isolation (runWithTenantAsync)
 *   - Idempotent execution (re-claiming a SUCCEEDED job is a no-op)
 *   - Bounded retries (via AuditJob.attempts / maxAttempts)
 *   - Per-item failure tracking (does not affect other jobs in the batch)
 *   - Structured logging (no console.*)
 *   - SSRF and URL validation (delegated to runAudit which already validates)
 */

import { logger } from '@/lib/logger';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { generateProposal } from '@/lib/proposal/runner';
import { runWithTenantAsync } from '@/lib/tenant/context';

import {
  claimJob,
  markJobFailed,
  markJobSucceeded,
} from './auditJobQueue';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkerResult =
  | { outcome: 'SUCCEEDED'; jobId: string; auditId: string }
  | { outcome: 'FAILED'; jobId: string; auditId: string; error: string }
  | { outcome: 'DEAD'; jobId: string; auditId: string; error: string }
  | { outcome: 'SKIPPED'; jobId: string; reason: string }
  | { outcome: 'NOT_FOUND'; jobId: string }
  | { outcome: 'LOCK_CONTENTION'; jobId: string };

// ─── Worker ───────────────────────────────────────────────────────────────────

/**
 * Process a single AuditJob by its ID.
 *
 * Safe to call multiple times with the same jobId (idempotent):
 *   - If the job is already SUCCEEDED/DEAD, returns SKIPPED.
 *   - If the distributed lock is already held, returns LOCK_CONTENTION.
 *   - If the job does not exist, returns NOT_FOUND.
 *
 * All audit work runs inside runWithTenantAsync so RLS and tenant context
 * are correctly scoped for every Prisma query inside the audit runner.
 */
export async function processAuditJob(jobId: string): Promise<WorkerResult> {
  // 1. Load the job record (bypass RLS — worker operates cross-tenant under
  //    its own auth, then scopes each operation via runWithTenantAsync)
  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });

  if (!job) {
    logger.warn({ event: 'worker.job_not_found', jobId }, 'Worker: job not found');
    return { outcome: 'NOT_FOUND', jobId };
  }

  // 2. Skip terminal jobs (idempotent re-delivery)
  if (job.status === 'SUCCEEDED' || job.status === 'DEAD') {
    logger.info(
      { event: 'worker.job_already_terminal', jobId, status: job.status },
      'Worker: job already in terminal state — skipping'
    );
    return { outcome: 'SKIPPED', jobId, reason: `Already ${job.status}` };
  }

  // 3. Claim the job (sets RUNNING, acquires distributed lock)
  const claimed = await claimJob(jobId);
  if (!claimed) {
    logger.info({ event: 'worker.lock_contention', jobId }, 'Worker: lock contention — skipping');
    return { outcome: 'LOCK_CONTENTION', jobId };
  }

  const { tenantId, auditId, attempts, maxAttempts } = claimed;

  await recordAuditTrailEvent({
    eventType: 'worker.job_claimed',
    tenantId,
    auditId,
    triggerSource: 'worker',
    payload: {
      jobId,
      attempt: attempts,
      maxAttempts,
    },
  }).catch(() => {});

  logger.info(
    {
      event: 'worker.job_start',
      jobId,
      auditId,
      tenantId,
      attempt: attempts,
      maxAttempts,
    },
    'Worker: processing job'
  );

  // 4. Execute within tenant context
  try {
    await runWithTenantAsync(tenantId, async () => {
      // Import here to avoid top-level circular dependency issues
      const { runAudit } = await import('@/lib/audit/runner');

      // Step 1: Run Audit
      await runAudit(auditId);

      // Step 2: Generate Proposal if audit succeeded
      const audit = await prisma.audit.findUnique({
        where: { id: auditId },
        select: { status: true },
      });

      if (audit?.status === 'COMPLETE' || audit?.status === 'PARTIAL') {
        await generateProposal(auditId);
      } else {
        logger.warn(
          { event: 'worker.skipping_proposal', jobId, auditId, auditStatus: audit?.status },
          'Worker: skipping proposal generation — audit did not complete successfully'
        );
      }
    });

    await markJobSucceeded(jobId);

    logger.info(
      { event: 'worker.job_succeeded', jobId, auditId, tenantId },
      'Worker: job succeeded'
    );

    await recordAuditTrailEvent({
      eventType: 'worker.job_completed',
      tenantId,
      auditId,
      triggerSource: 'worker',
      payload: {
        jobId,
        attempt: attempts,
      },
    }).catch(() => {});

    return { outcome: 'SUCCEEDED', jobId, auditId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        event: 'worker.job_failed',
        jobId,
        auditId,
        tenantId,
        attempt: attempts,
        maxAttempts,
        error: errorMessage,
      },
      'Worker: job failed'
    );

    await markJobFailed(jobId, errorMessage, maxAttempts);

    // Also mark the underlying Audit record as FAILED so the batch status
    // route reflects the correct state without joining audit_jobs
    await prisma.audit
      .update({
        where: { id: auditId },
        data: { status: 'FAILED' },
      })
      .catch((e) =>
        logger.error(
          { event: 'worker.audit_status_update_failed', jobId, auditId, err: e },
          'Worker: failed to update audit status to FAILED'
        )
      );

    await recordAuditTrailEvent({
      eventType: 'worker.job_failed',
      tenantId,
      auditId,
      triggerSource: 'worker',
      payload: {
        jobId,
        attempt: attempts,
        maxAttempts,
        error: errorMessage,
        isDead: attempts >= maxAttempts,
      },
    }).catch(() => {});

    const isDead = attempts >= maxAttempts;
    return {
      outcome: isDead ? 'DEAD' : 'FAILED',
      jobId,
      auditId,
      error: errorMessage,
    };
  }
}
