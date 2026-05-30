# 011 — Durable Batch Audit Queue

**Status:** COMPLETE  
**Branch:** phase-2-rls-migration  
**Date:** 2026-05-15

---

## Original Issue

`lib/audit/batchProcessor.ts` had an explicit comment:

```
// Process sequentially as requested
for (const auditId of auditIds) { ... }
```

The HTTP request was blocked until every audit in the batch had run
sequentially. This is unsafe because:

- Cloud Run has a 3600s max request timeout; large batches exceed it.
- A single audit failure re-threw and could abort the whole batch.
- All compute is bound to one instance — useless with autoscaling.
- Idempotency was at the batch level (via `Idempotency-Key` header) but not
  per-item, so a crash mid-batch had no per-item retry capability.
- In-memory rate limits / idempotency keys (fixed in Task #9) could still
  lose state between instances during long-running request.

---

## Architecture Chosen: Database-Backed Durable Job Queue

No additional cloud infrastructure is required.

```
POST /api/audit/batch
  │
  ├─ Validate request (Zod, rate limit, idempotency, auth)
  ├─ Create N Audit rows (status=QUEUED)
  ├─ Create N AuditJob rows (status=QUEUED, idempotencyKey unique)
  └─ Return {batchId, accepted, statusUrl} immediately
       (no audit work done in the request path)

AuditJob table (PostgreSQL — durable, tenant-scoped, RLS-protected)
  ┌───────────────────────────────────────────────────────────────┐
  │ id | tenantId | batchId | auditId | idempotencyKey | status   │
  │ attempts | maxAttempts | errorMessage | startedAt | ...       │
  └───────────────────────────────────────────────────────────────┘

POST /api/worker/audit-job  ← called by Cloud Tasks / cron / dispatch
  │
  ├─ verifyWorkerAuth (WORKER_SECRET, timing-safe)
  ├─ If jobId given: process that job
  ├─ If no jobId: claimNextJob() from QUEUED jobs (cron mode)
  └─ processAuditJob(jobId):
       ├─ Load job record
       ├─ Skip if already SUCCEEDED/DEAD (idempotent re-delivery)
       ├─ Acquire distributed lock (SharedStore / Redis)
       ├─ QUEUED → RUNNING (atomic updateMany, count=0 = already claimed)
       ├─ runWithTenantAsync(tenantId, async () => {
       │    runAudit(auditId)
       │    if audit COMPLETE/PARTIAL: generateProposal(auditId)
       │  })
       ├─ On success: RUNNING → SUCCEEDED, release lock
       └─ On failure: RUNNING → QUEUED (retry) or DEAD (exhausted)
                      Audit record → FAILED
                      release lock

GET /api/audit/batch/[batchId]  ← tenant-scoped status
  └─ Returns audit records + AuditJob queue summary (queued/running/
     succeeded/failed/dead/percentComplete)
```

### Why Postgres queue and not Redis/Bull/Cloud Tasks?

| Option            | Decision                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloud Tasks       | Requires GCP queue resource creation (blocked by constraint). Worker endpoint is Cloud Tasks-compatible if needed later.                                     |
| Redis/BullMQ      | Added Redis in Task #9. BullMQ would be the next step but adds a significant dependency. Postgres queue is sufficient for the current batch sizes (max 100). |
| Postgres (chosen) | Zero new infrastructure. Leverages existing RLS, tenant isolation, Prisma. Durable across restarts. Easy to inspect.                                         |

The worker endpoint is provider-agnostic — it can be called by Cloud Tasks,
Cloud Run jobs, or a cron route.

---

## API Behavior Before / After

### Before

```
POST /api/audit/batch
  → blocks for duration of all audits (30–150s per audit × N items)
  → single-instance, no parallelism
  → crash mid-batch = partial completion with no recovery
  → no per-item retry
  → request timeout kills the whole batch
```

### After

```
POST /api/audit/batch
  → validates, creates Audit rows, creates AuditJob rows
  → returns in < 500ms regardless of batch size
  → response: { batchId, accepted, statusUrl, ... }

POST /api/worker/audit-job
  → processes ONE job per call
  → idempotent (safe to re-deliver)
  → bounded retries (MAX_RETRIES = 3, then DEAD)
  → per-item failure does NOT affect other jobs
  → runs under correct tenant context (runWithTenantAsync)

GET /api/audit/batch/[batchId]
  → returns combined audit + job queue status
  → fully tenant-scoped (cross-tenant returns 404)
```

---

## Files Changed

| File                                                                  | Change                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `prisma/schema.prisma`                                                | Added `AuditJob` model + `Tenant.auditJobs` relation            |
| `prisma/migrations/20260515000000_add_audit_jobs_queue/migration.sql` | New migration with RLS                                          |
| `lib/queue/auditJobQueue.ts`                                          | New — enqueue, claim, lock, outcome, batch status               |
| `lib/queue/auditJobWorker.ts`                                         | New — single-job processor with tenant isolation                |
| `lib/middleware/workerAuth.ts`                                        | New — WORKER_SECRET bearer auth (timing-safe)                   |
| `app/api/worker/audit-job/route.ts`                                   | New — worker HTTP endpoint                                      |
| `lib/audit/batchProcessor.ts`                                         | Rewritten — enqueues jobs, no sequential execution              |
| `app/api/audit/batch/route.ts`                                        | Updated — calls new `processBatch(batchId, tenantId, auditIds)` |
| `app/api/audit/batch/[batchId]/route.ts`                              | Updated — includes AuditJob queue summary                       |
| `.env.example`                                                        | Added `WORKER_SECRET`, `WORKER_DISPATCH_URL`                    |
| `tests/security/batch-queue-worker.test.ts`                           | New — 20 tests                                                  |

---

## Tenant / Idempotency / Retry Model

**Tenant isolation:**

- `AuditJob` rows always carry `tenantId`.
- RLS policies on `audit_jobs` table mirror all other tenant tables.
- Worker runs audit work inside `runWithTenantAsync(tenantId, ...)`.
- Batch status queries always filter by `tenantId`.
- `getBatchStatus` returns `null` for unknown batchId/tenant combinations.

**Idempotency:**

- Each `AuditJob` has a unique `idempotencyKey = batch:{batchId}:audit:{auditId}`.
- `enqueueAuditJob` checks for existing key first — no upsert ambiguity.
- Worker uses a distributed lock (`SharedStore.setIfNotExists`) before claiming.
- `processAuditJob` skips SUCCEEDED/DEAD jobs (safe for duplicate queue delivery).
- Re-submitting the same batch (same `Idempotency-Key` header on the API route)
  returns the cached response without creating duplicate records.

**Retries:**

- `MAX_RETRIES = 3`.
- On failure: RUNNING → QUEUED (re-queued for next worker pick-up).
- After `attempts >= maxAttempts`: RUNNING → DEAD (no more retries).
- Underlying `Audit` record is set to FAILED on any job failure.
- Dead jobs are visible in batch status `jobs.dead` field.

---

## Production Env / Config Requirements

| Variable              | Required                      | Purpose                                                                     |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `WORKER_SECRET`       | Yes (if worker endpoint used) | Bearer token for `POST /api/worker/audit-job`                               |
| `WORKER_DISPATCH_URL` | Optional                      | If set, each enqueued job fires an HTTP trigger to this URL                 |
| `REDIS_URL`           | Recommended                   | Distributed lock for multi-instance safety (falls back to in-memory in dev) |
| `DATABASE_URL`        | Yes (existing)                | AuditJob rows stored here                                                   |

### Required infrastructure steps (not performed — no cloud changes allowed)

To use Cloud Tasks as the dispatcher:

1. Create a Cloud Tasks queue in GCP.
2. Set `WORKER_DISPATCH_URL` to the worker endpoint URL.
3. Set `WORKER_SECRET` to a strong secret.
4. Configure Cloud Tasks to pass `Authorization: Bearer $WORKER_SECRET` header.
5. Optionally add Cloud Run service-to-service auth on top of `WORKER_SECRET`.

To use cron-driven mode (no Cloud Tasks):

1. Set `WORKER_SECRET`.
2. Call `POST /api/worker/audit-job` (no `jobId` body) on a schedule.
   The worker will claim and process one QUEUED job per call.
3. Set cron frequency high enough to drain the queue at expected batch sizes.

---

## Commands Run and Outputs

```bash
$ npx vitest run tests/security/batch-queue-worker.test.ts --reporter=verbose
 Test Files  1 passed (1)
       Tests  20 passed (20)
    Duration  2.46s

$ npx vitest run tests/security/ --reporter=verbose
 Test Files  8 passed (8)
       Tests  90 passed (90)
    Duration  9.59s
```

---

## Acceptance Criteria

| Criterion                                                                              | Status                                                                                       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /api/audit/batch` no longer performs full sequential batch processing in-request | ✅ Returns immediately after enqueueing                                                      |
| Batch items are represented as durable jobs                                            | ✅ `AuditJob` rows in Postgres with RLS                                                      |
| Worker processes jobs with explicit tenant context                                     | ✅ `runWithTenantAsync` wraps all audit work                                                 |
| Per-item failures tracked without killing the batch                                    | ✅ Each job is independent; FAILED/DEAD status per row                                       |
| Duplicate submissions/deliveries are idempotent                                        | ✅ `idempotencyKey` unique constraint + SUCCEEDED/DEAD skip                                  |
| Batch status is tenant-scoped                                                          | ✅ All queries filter by `tenantId`; cross-tenant → 404                                      |
| Production path requires durable queue/shared store config                             | ✅ Postgres (always); Redis for distributed lock                                             |
| Local/test path works without cloud services                                           | ✅ In-memory SharedStore fallback                                                            |
| Tests cover all required scenarios                                                     | ✅ 20 tests: enqueue, worker success/failure/retry/dead, idempotency, tenant isolation, auth |
| Remediation note exists                                                                | ✅ This file                                                                                 |
| No production/staging/cloud resources touched                                          | ✅                                                                                           |
| No secrets changed                                                                     | ✅                                                                                           |

---

## Remaining Risks

- **Cron frequency matters:** In cron-driven mode, the worker processes one job per
  call. High-volume batches require frequent cron invocations or parallelism.
  Recommend setting `WORKER_DISPATCH_URL` for Cloud Tasks push delivery, which
  naturally fans out.
- **Dead-letter handling:** DEAD jobs are visible in the `audit_jobs` table.
  There is no automatic notification or DLQ forwarding. Add a monitoring alert
  on `SELECT COUNT(*) FROM audit_jobs WHERE status = 'DEAD'`.
- **Lock TTL:** The distributed lock is 90 seconds. If the worker crashes mid-job
  and the lock expires, another worker will re-claim the job on the next tick.
  The underlying `Audit.status = FAILED` update is idempotent.
- **Migration replay:** The new `audit_jobs` migration uses standard Prisma DDL and
  is safe for empty-DB replay. The FK to `Tenant` uses the existing `Tenant.id`
  primary key.
