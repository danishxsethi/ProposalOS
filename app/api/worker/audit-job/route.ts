/**
 * app/api/worker/audit-job/route.ts
 *
 * Internal Audit Job Worker Endpoint
 *
 * Processes AuditJob record(s). Intended to be called by:
 *   - Cloud Tasks push queue (POST with jobId in body) — processes exactly that job.
 *   - Cloud Scheduler / cron poller (POST with {} body) — claims and processes up to
 *     WORKER_POLL_BATCH_SIZE QUEUED jobs per invocation (P1-24: this is the durable
 *     fallback so the queue does not depend solely on WORKER_DISPATCH_URL push
 *     dispatch — see cron.yaml's `audit-job-sweep` entry).
 *   - Direct internal dispatch from enqueueing code (WORKER_DISPATCH_URL).
 *
 * Authentication: Bearer WORKER_SECRET (verifyWorkerAuth middleware).
 * This endpoint is NOT in the public API surface — it must not be exposed
 * without auth.
 *
 * POST body (both fields optional):
 *   { jobId?: string }   — process specific job
 *   {}                   — claim and process up to WORKER_POLL_BATCH_SIZE next QUEUED jobs
 *
 * Rate limiting: NOT applied here (cron/worker calls are controlled at the
 * scheduler level).  Auth is the only gate.
 */

import { NextResponse } from 'next/server';

import { generateTraceId } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { verifyWorkerAuth } from '@/lib/middleware/workerAuth';
import { claimNextJob } from '@/lib/queue/auditJobQueue';
import { processAuditJob, type WorkerResult } from '@/lib/queue/auditJobWorker';

/**
 * Bounded per-invocation batch size for poll mode. Each `runAudit` already has its
 * own internal timeout (GLOBAL_AUDIT_TIMEOUT_MS), so a bounded sequential loop here
 * stays well inside typical Cloud Run request timeouts.
 */
const DEFAULT_POLL_BATCH_SIZE = 5;

function getPollBatchSize(): number {
  const raw = process.env.WORKER_POLL_BATCH_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_POLL_BATCH_SIZE;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_BATCH_SIZE;
}

export async function POST(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authError = await verifyWorkerAuth(req);
  if (authError) {
    return authError;
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { jobId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is valid — means "claim next job(s)"
  }

  const jobId: string | undefined = body?.jobId;

  // ── Specific-job dispatch mode (Cloud Tasks push target) ───────────────────
  if (jobId) {
    logger.info({ event: 'worker.dispatch', jobId, traceId }, 'Worker: dispatching job');
    const result = await processAuditJob(jobId);
    logger.info({ event: 'worker.dispatch_complete', ...result, traceId }, 'Worker: job complete');
    return buildResponse(result, traceId);
  }

  // ── Poll mode (cron sweep) — claim and process a bounded batch ──────────────
  const batchSize = getPollBatchSize();
  const results: WorkerResult[] = [];

  for (let i = 0; i < batchSize; i++) {
    const next = await claimNextJob();
    if (!next) break;

    logger.info(
      { event: 'worker.poll_dispatch', jobId: next.id, traceId },
      'Worker: dispatching claimed job'
    );
    const result = await processAuditJob(next.id);
    results.push(result);
  }

  if (results.length === 0) {
    logger.info({ event: 'worker.no_jobs', traceId }, 'Worker: no QUEUED jobs available');
    return NextResponse.json({ success: true, outcome: 'NO_JOBS', traceId }, { status: 200 });
  }

  logger.info(
    { event: 'worker.poll_complete', processed: results.length, traceId },
    'Worker: poll batch complete'
  );

  const anyTerminalFailure = results.some((r) => r.outcome === 'FAILED' || r.outcome === 'DEAD');
  const response = NextResponse.json(
    { success: true, processed: results.length, results, traceId },
    { status: anyTerminalFailure ? 207 : 200 } // 207: partial success, some jobs failed
  );
  response.headers.set('X-Trace-Id', traceId);
  return response;
}

function buildResponse(result: WorkerResult, traceId: string): NextResponse {
  const statusCode =
    result.outcome === 'SUCCEEDED' || result.outcome === 'SKIPPED'
      ? 200
      : result.outcome === 'NOT_FOUND'
        ? 404
        : result.outcome === 'LOCK_CONTENTION'
          ? 409
          : 500; // FAILED / DEAD — 500 so Cloud Tasks retries the dispatch

  const response = NextResponse.json({ success: true, ...result, traceId }, { status: statusCode });
  response.headers.set('X-Trace-Id', traceId);
  return response;
}
