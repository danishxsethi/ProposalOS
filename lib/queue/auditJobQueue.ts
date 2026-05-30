/**
 * lib/queue/auditJobQueue.ts
 *
 * Durable Audit Job Queue
 *
 * Abstracts the enqueueing and dequeueing of individual audit jobs.  The
 * backing store is the Postgres `AuditJob` table (durable, tenant-scoped,
 * idempotent) — no additional cloud queue infrastructure required.
 *
 * Production dispatch adapter:
 *   If WORKER_DISPATCH_URL is set, each enqueued job POSTs a lightweight
 *   trigger to the worker endpoint (Cloud Tasks / Cloud Run / cron-compatible).
 *   If not set, the worker must be triggered externally (cron) and will pick
 *   up QUEUED jobs on each tick.
 *
 * This file is infrastructure only — no business logic.
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getSharedStore } from '@/lib/store/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_RETRIES = 3;
export const JOB_LOCK_TTL_SECONDS = 90; // Worker holds lock for max 90 s per job

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DEAD'; // Exhausted retries

export interface AuditJobRecord {
  id: string;
  tenantId: string;
  batchId: string;
  auditId: string;
  idempotencyKey: string;
  status: AuditJobStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface EnqueueJobInput {
  tenantId: string;
  batchId: string;
  auditId: string;
  /** Caller-controlled idempotency key — same key = same job, no duplicate. */
  idempotencyKey: string;
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

/**
 * Enqueue a single audit job.  Idempotent: if a job with the same
 * idempotencyKey already exists (regardless of status) this is a no-op and
 * the existing record is returned.
 */
export async function enqueueAuditJob(input: EnqueueJobInput): Promise<AuditJobRecord> {
  const existing = await prisma.auditJob.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    logger.info(
      {
        event: 'audit_job.enqueue_skipped',
        jobId: existing.id,
        idempotencyKey: input.idempotencyKey,
        status: existing.status,
      },
      'AuditJob: duplicate idempotency key — skipping enqueue'
    );
    return existing as AuditJobRecord;
  }

  const job = await prisma.auditJob.create({
    data: {
      tenantId: input.tenantId,
      batchId: input.batchId,
      auditId: input.auditId,
      idempotencyKey: input.idempotencyKey,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: MAX_RETRIES,
    },
  });

  logger.info(
    {
      event: 'audit_job.enqueued',
      jobId: job.id,
      batchId: input.batchId,
      auditId: input.auditId,
      tenantId: input.tenantId,
    },
    'AuditJob: enqueued'
  );

  // Best-effort dispatch trigger to worker endpoint (if configured)
  dispatchJobTrigger(job.id).catch((err) =>
    logger.warn(
      { event: 'audit_job.dispatch_failed', jobId: job.id, err },
      'AuditJob: dispatch trigger failed'
    )
  );

  return job as AuditJobRecord;
}

/**
 * Enqueue multiple jobs for a batch.  Returns arrays of succeeded/failed
 * enqueue operations so the caller can surface partial errors.
 */
export async function enqueueBatchJobs(
  batchId: string,
  jobs: EnqueueJobInput[]
): Promise<{ enqueued: AuditJobRecord[]; errors: Array<{ auditId: string; error: string }> }> {
  const enqueued: AuditJobRecord[] = [];
  const errors: Array<{ auditId: string; error: string }> = [];

  for (const job of jobs) {
    try {
      const record = await enqueueAuditJob(job);
      enqueued.push(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { event: 'audit_job.enqueue_error', batchId, auditId: job.auditId, error: msg },
        'AuditJob: enqueue failed'
      );
      errors.push({ auditId: job.auditId, error: msg });
    }
  }

  return { enqueued, errors };
}

// ─── Claim / Lock ─────────────────────────────────────────────────────────────

/**
 * Attempt to claim the next QUEUED job for processing.  Returns null if no
 * job is available or if the claim is lost to a race.
 *
 * Uses a distributed lock (SharedStore) so that two worker instances never
 * process the same job concurrently.
 */
export async function claimNextJob(tenantId?: string): Promise<AuditJobRecord | null> {
  const where = {
    status: 'QUEUED' as const,
    attempts: { lt: MAX_RETRIES },
    ...(tenantId ? { tenantId } : {}),
  };

  const candidate = await prisma.auditJob.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  return claimJob(candidate.id);
}

/**
 * Claim a specific job by ID.  Returns null if the job cannot be claimed
 * (already running/succeeded/failed, or lock already held).
 */
export async function claimJob(jobId: string): Promise<AuditJobRecord | null> {
  const store = await getSharedStore();
  const lockKey = `audit-job-lock:${jobId}`;

  const locked = await store.setIfNotExists(lockKey, '1', JOB_LOCK_TTL_SECONDS);
  if (!locked) {
    logger.debug(
      { event: 'audit_job.lock_contention', jobId },
      'AuditJob: lock held by another worker'
    );
    return null;
  }

  // Atomically move QUEUED → RUNNING, increment attempts
  try {
    const updated = await prisma.auditJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      // Already claimed by another worker between findFirst and update
      await store.del(lockKey);
      return null;
    }

    const job = await prisma.auditJob.findUnique({ where: { id: jobId } });
    return job as AuditJobRecord;
  } catch (err) {
    await store.del(lockKey);
    throw err;
  }
}

/**
 * Release the distributed lock held on a job (called after job completes or
 * fails, so the lock slot is freed even before TTL expiry).
 */
export async function releaseJobLock(jobId: string): Promise<void> {
  const store = await getSharedStore();
  await store.del(`audit-job-lock:${jobId}`);
}

// ─── Mark Outcome ─────────────────────────────────────────────────────────────

export async function markJobSucceeded(jobId: string): Promise<void> {
  await prisma.auditJob.update({
    where: { id: jobId },
    data: { status: 'SUCCEEDED', completedAt: new Date() },
  });
  await releaseJobLock(jobId);
}

export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  maxAttempts: number
): Promise<void> {
  // Re-read current attempts to decide terminal state
  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });
  const isDead = (job?.attempts ?? 0) >= maxAttempts;

  await prisma.auditJob.update({
    where: { id: jobId },
    data: {
      status: isDead ? 'DEAD' : 'QUEUED', // Re-queue unless exhausted
      errorMessage,
      completedAt: isDead ? new Date() : null,
      startedAt: null,
    },
  });

  await releaseJobLock(jobId);

  logger.warn(
    {
      event: isDead ? 'audit_job.dead' : 'audit_job.requeued',
      jobId,
      attempts: job?.attempts,
      maxAttempts,
    },
    isDead ? 'AuditJob: exhausted retries — moved to DEAD' : 'AuditJob: failed — requeued for retry'
  );
}

// ─── Batch Status ─────────────────────────────────────────────────────────────

export interface BatchJobSummary {
  batchId: string;
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
  percentComplete: number;
}

/**
 * Return tenant-scoped batch job summary.  Returns null when the batchId
 * does not belong to the tenantId — callers should treat this as 404.
 */
export async function getBatchStatus(
  batchId: string,
  tenantId: string
): Promise<BatchJobSummary | null> {
  const jobs = await prisma.auditJob.findMany({
    where: { batchId, tenantId },
    select: { status: true },
  });

  if (jobs.length === 0) return null;

  const counts = { QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, DEAD: 0 };
  for (const j of jobs) {
    counts[j.status as keyof typeof counts] = (counts[j.status as keyof typeof counts] || 0) + 1;
  }

  const terminal = counts.SUCCEEDED + counts.FAILED + counts.DEAD;
  const percentComplete = jobs.length > 0 ? Math.round((terminal / jobs.length) * 100) : 0;

  return {
    batchId,
    total: jobs.length,
    queued: counts.QUEUED,
    running: counts.RUNNING,
    succeeded: counts.SUCCEEDED,
    failed: counts.FAILED,
    dead: counts.DEAD,
    percentComplete,
  };
}

// ─── Dispatch trigger ─────────────────────────────────────────────────────────

/**
 * Best-effort HTTP trigger to the worker endpoint.  Used when
 * WORKER_DISPATCH_URL is configured (e.g. Cloud Tasks push target or
 * internal self-call).  Logs and swallows errors — the worker cron will
 * pick up the job if dispatch fails.
 */
async function dispatchJobTrigger(jobId: string): Promise<void> {
  const workerUrl = process.env.WORKER_DISPATCH_URL;
  if (!workerUrl) return; // No dispatch configured — cron-driven mode

  const secret = process.env.WORKER_SECRET;
  if (!secret) {
    logger.warn(
      { event: 'audit_job.dispatch_no_secret', jobId },
      'AuditJob: WORKER_DISPATCH_URL set but WORKER_SECRET missing — skipping dispatch'
    );
    return;
  }

  await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ jobId }),
  });
}
