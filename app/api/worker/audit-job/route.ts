/**
 * app/api/worker/audit-job/route.ts
 *
 * Internal Audit Job Worker Endpoint
 *
 * Processes a single AuditJob record.  Intended to be called by:
 *   - Cloud Tasks push queue (POST with jobId in body)
 *   - Cloud Run Job or external cron (POST without jobId = claim next QUEUED)
 *   - Direct internal dispatch from enqueueing code (WORKER_DISPATCH_URL)
 *
 * Authentication: Bearer WORKER_SECRET (verifyWorkerAuth middleware).
 * This endpoint is NOT in the public API surface — it must not be exposed
 * without auth.
 *
 * POST body (both fields optional):
 *   { jobId?: string }   — process specific job
 *   {}                   — claim and process next QUEUED job
 *
 * Rate limiting: NOT applied here (cron/worker calls are controlled at the
 * scheduler level).  Auth is the only gate.
 */

import { NextResponse } from 'next/server';

import { generateTraceId } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { verifyWorkerAuth } from '@/lib/middleware/workerAuth';
import { claimNextJob } from '@/lib/queue/auditJobQueue';
import { processAuditJob } from '@/lib/queue/auditJobWorker';

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
    // Empty body is valid — means "claim next job"
  }

  let jobId: string | undefined = body?.jobId;

  // ── Resolve job ──────────────────────────────────────────────────────────────
  if (!jobId) {
    // Cron mode: claim next available QUEUED job
    const next = await claimNextJob();
    if (!next) {
      logger.info({ event: 'worker.no_jobs' }, 'Worker: no QUEUED jobs available');
      return NextResponse.json({ success: true, outcome: 'NO_JOBS', traceId }, { status: 200 });
    }
    jobId = next.id;
  }

  // ── Process ──────────────────────────────────────────────────────────────────
  logger.info({ event: 'worker.dispatch', jobId, traceId }, 'Worker: dispatching job');

  const result = await processAuditJob(jobId);

  logger.info({ event: 'worker.dispatch_complete', ...result, traceId }, 'Worker: job complete');

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
