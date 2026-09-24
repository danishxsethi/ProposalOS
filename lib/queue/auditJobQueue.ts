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

import { randomUUID } from 'crypto';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getSharedStore } from '@/lib/store/shared';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_RETRIES = 3;
export const JOB_LOCK_TTL_SECONDS = 90; // Worker holds lock for max 90 s per job

/**
 * P2-12: lease/heartbeat protection. A claim binds a job to exactly one worker
 * instance for one attempt via a fresh leaseToken. LEASE_DURATION_MS must exceed the
 * longest a healthy worker can run without heartbeating (bounded by runner.ts's
 * GLOBAL_AUDIT_TIMEOUT_MS, default 60s, documented worst case ~5 min) with headroom
 * for proposal generation after the audit completes. HEARTBEAT_INTERVAL_MS is kept
 * well under LEASE_DURATION_MS so a healthy worker renews the lease several times
 * before it could expire.
 */
export const LEASE_DURATION_MS = 6 * 60 * 1000; // 6 minutes
export const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute (6x safety margin)

/** Identity of this worker process/instance — stamped as AuditJob.leaseOwner. */
export const WORKER_ID = process.env.WORKER_INSTANCE_ID || `worker-${randomUUID()}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DEAD'; // Exhausted retries

export interface AuditJobRecord {
  id: string;
  tenantId: string;
  batchId: string;
  auditId: string;
  generateProposal: boolean;
  idempotencyKey: string;
  status: AuditJobStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  leaseOwner?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: Date | null;
  lastHeartbeatAt?: Date | null;
}

export interface EnqueueJobInput {
  tenantId: string;
  batchId: string;
  auditId: string;
  /** Caller-controlled idempotency key — same key = same job, no duplicate. */
  idempotencyKey: string;
  /** Worker caller may execute directly after enqueue and suppress duplicate push. */
  dispatch?: boolean;
  generateProposal?: boolean;
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
      generateProposal: input.generateProposal ?? true,
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
  if (input.dispatch !== false) {
    dispatchJobTrigger(job.id).catch((err) =>
      logger.warn(
        { event: 'audit_job.dispatch_failed', jobId: job.id, err },
        'AuditJob: dispatch trigger failed'
      )
    );
  }

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
  const run = async () => {
    const now = new Date();
    const where = {
      attempts: { lt: MAX_RETRIES },
      ...(tenantId ? { tenantId } : {}),
      OR: [
        { status: 'QUEUED' as const },
        // P2-12: a RUNNING job whose lease expired is reclaimable — its previous
        // worker is presumed dead/hung. Ordered after QUEUED by createdAt below so
        // fresh work is preferred over reclaim, but reclaim is still found.
        { status: 'RUNNING' as const, leaseExpiresAt: { lt: now } },
      ],
    };

    const candidate = await prisma.auditJob.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
    });

    if (!candidate) return null;

    return claimJob(candidate.id);
  };

  return tenantId
    ? runWithTenantAsync(tenantId, run)
    : runWithTenantBypass('worker-global-audit-job-poll', run);
}

/**
 * Claim a specific job by ID.  Returns null if the job cannot be claimed
 * (already running under a live lease/succeeded/failed, or the distributed lock
 * is already held).
 *
 * P2-12: claiming atomically assigns a fresh leaseToken/leaseOwner/leaseExpiresAt.
 * The WHERE clause only matches QUEUED jobs or RUNNING jobs whose lease has expired,
 * so concurrent claimJob calls for the same job serialize at the database row level —
 * only one can ever win, whether the job was QUEUED or a stale RUNNING reclaim.
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

  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  try {
    const updated = await prisma.auditJob.updateMany({
      where: {
        id: jobId,
        OR: [{ status: 'QUEUED' }, { status: 'RUNNING', leaseExpiresAt: { lt: now } }],
      },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        startedAt: now,
        leaseOwner: WORKER_ID,
        leaseToken,
        leaseExpiresAt,
        lastHeartbeatAt: now,
      },
    });

    if (updated.count === 0) {
      // Already claimed by another worker between findFirst and update, or the
      // job is in a terminal state.
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
 * Renew the lease on a job the caller currently holds. Fails (returns false)
 * if the caller's leaseToken no longer matches (lease expired and reclaimed by
 * another worker) — the caller must stop processing immediately in that case.
 */
export async function heartbeatJob(jobId: string, leaseToken: string): Promise<boolean> {
  const now = new Date();
  const updated = await prisma.auditJob.updateMany({
    where: { id: jobId, leaseToken },
    data: {
      lastHeartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
    },
  });
  if (updated.count === 0) {
    logger.warn(
      { event: 'audit_job.heartbeat_stale_lease', jobId },
      'AuditJob: heartbeat rejected — lease no longer owned (expired/reclaimed)'
    );
    return false;
  }
  return true;
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

/**
 * Mark a job succeeded. Requires the caller's leaseToken to still match —
 * a worker whose lease was reclaimed (stale/expired) cannot overwrite a newer
 * attempt's outcome. Returns false (no-op, logged) if the lease no longer matches.
 */
export async function markJobSucceeded(jobId: string, leaseToken: string): Promise<boolean> {
  const updated = await prisma.auditJob.updateMany({
    where: { id: jobId, leaseToken },
    data: { status: 'SUCCEEDED', completedAt: new Date() },
  });
  await releaseJobLock(jobId);

  if (updated.count === 0) {
    logger.warn(
      { event: 'audit_job.stale_lease_complete_rejected', jobId },
      'AuditJob: stale/reclaimed worker attempted to mark job SUCCEEDED — rejected'
    );
    return false;
  }
  return true;
}

/**
 * Mark a job failed (requeue or DEAD if retries exhausted). Requires the caller's
 * leaseToken to still match, for the same reason as markJobSucceeded.
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  maxAttempts: number,
  leaseToken: string
): Promise<boolean> {
  // Re-read current attempts to decide terminal state
  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });
  const isDead = (job?.attempts ?? 0) >= maxAttempts;

  const updated = await prisma.auditJob.updateMany({
    where: { id: jobId, leaseToken },
    data: {
      status: isDead ? 'DEAD' : 'QUEUED', // Re-queue unless exhausted
      errorMessage,
      completedAt: isDead ? new Date() : null,
      startedAt: null,
      // Clear the lease on requeue so any worker (including a fresh reclaim) can
      // pick this job up immediately rather than waiting out the old lease TTL.
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });

  await releaseJobLock(jobId);

  if (updated.count === 0) {
    logger.warn(
      { event: 'audit_job.stale_lease_failure_rejected', jobId },
      'AuditJob: stale/reclaimed worker attempted to mark job failed — rejected'
    );
    return false;
  }

  logger.warn(
    {
      event: isDead ? 'audit_job.dead' : 'audit_job.requeued',
      jobId,
      attempts: job?.attempts,
      maxAttempts,
    },
    isDead ? 'AuditJob: exhausted retries — moved to DEAD' : 'AuditJob: failed — requeued for retry'
  );
  return true;
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
