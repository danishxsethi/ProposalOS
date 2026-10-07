# 08 — Failure Injection (Stream D: reliability)

**Scope:** Proposal Engine OS — durable audit-job queue, Stripe webhook dedup, LLM
provider resilience, shared-store (Redis) outage, outbound kill switch and email
provider failure.
**Method:** New vitest suites under `tests/reliability/`. Anything that touches
Prisma runs against a **real, migrated PostgreSQL** (disposable per-file DB via
`tests/helpers/realDb.ts`, server `127.0.0.1:5435`). Only external providers
(Google GenAI SDK, Stripe client, Resend/SMTP `send`, Redis adapter) and
worker-external side paths (audit runner, proposal generator, audit-trail sink)
are stubbed. **No production source in `lib/` or `app/` was modified.**
**Evidence:** `closure/evidence/reliability/vitest-reliability.txt` (verbose run,
5 files / 49 tests: 47 passed, 2 expected-fail = encoded defects) and
`closure/evidence/reliability/S1b-redelivery-duplicate-findings-RAW-FAILURE.txt`
(the raw red run captured before the two defects were encoded with `it.fails`).
Stability: 4 consecutive full runs of `tests/reliability` — identical results.

Run: `npm test -- tests/reliability --reporter=verbose`

## Scenario matrix

| # | Scenario | Injected | Observed | Pass/Fail | Test file |
|---|----------|----------|----------|-----------|-----------|
| S1 | Worker death / lease reclaim | Worker A claims (attempts=1, leaseToken `a`); no heartbeat; `leaseExpiresAt` forced into the past via bypass; lock slot freed (dead process) | `claimNextJob` hands the job to worker B with a **new** leaseToken, `attempts=2`, fresh `leaseExpiresAt`. A's `heartbeatJob` / `markJobSucceeded` / `markJobFailed` with token `a` all return `false` and leave B's row untouched (status RUNNING, B's token, `completedAt` null). B finalizes exactly once; A's late calls after that still rejected; `completedAt` unchanged. Exactly 1 `AuditJob` and 1 `Audit` row. Same result end-to-end through `processAuditJob` (B runs `runAudit` once). | **PASS** | `tests/reliability/queue-worker-death-poison.test.ts` |
| S1 (cron) | `cleanup-stale-jobs` vs. lease reclaim | Same dead-worker fixture; cron GET with bearer `CRON_SECRET`; then `createdAt` backdated 3 h | Cron does **not** touch a job that is only stale by lease (< 2 h old) — reclaim stays with the queue. Once `createdAt` > 2 h TTL the cron marks it `FAILED`+`completedAt`, leaseToken **not** cleared; `claimNextJob` never returns it again; `processAuditJob` on it yields `LOCK_CONTENTION`, not `SKIPPED`. | **PASS** (behaviour recorded → D4/O-1) | same |
| S1b | Redelivery idempotence at the real persistence boundary | Worker A claims, runs the REAL `persistAuditResult` (1 Finding + 1 EvidenceSnapshot, audit → COMPLETE/TRUSTED), then dies before `markJobSucceeded`. Worker B reclaims via `processAuditJob`; the runner stand-in calls `persistAuditResult` again exactly as `lib/audit/runner.ts:1983` does | Job SUCCEEDED, attempts=2, new token — **but `Finding`=2, `EvidenceSnapshot`=2** for the same audit (expected 1/1). | **FAIL → DEFECT-D1** (encoded `it.fails`) | same |
| S2 | Duplicate dispatch | `enqueueAuditJob` × 6 concurrent callers (`Promise.allSettled`) with the same `idempotencyKey`, 8 rounds | Invariant holds: **exactly one `AuditJob` row per key** every round (DB unique index). Contract broken: **35–36 of 48 callers received Prisma `P2002`** (unique violation) instead of the documented "no-op, return existing record". | **S2a PASS / S2b FAIL → DEFECT-D2** (encoded `it.fails`) | same |
| S3 | Poison job | `runAudit` rejects on every attempt; job redelivered via `processAuditJob` in a bounded loop; also via `POST /api/worker/audit-job` with bearer `WORKER_SECRET` | Outcomes `FAILED, FAILED, DEAD`; row statuses between deliveries `QUEUED, QUEUED, DEAD` — **never parked RUNNING**. Final: `status=DEAD`, `attempts=3=maxAttempts`, `completedAt` set, lease cleared, `errorMessage` contains cause; `Audit.status=FAILED/trustState=FAILED`. `runAudit` called exactly 3×. DEAD job never re-claimed by poller; further delivery → `SKIPPED`, attempts unchanged. HTTP route: `500,500,500` (Cloud Tasks retry signal) then `200 SKIPPED`. **Attempts to DEAD: 3.** | **PASS** | same |
| S4 | Duplicate Stripe webhook | Two/five distinct event objects with identical `event.id` (`invoice.paid` for a real tenant with `stripeCustomerId`); `handleStripeWebhookEvent` called sequentially and concurrently; kill switch env set | Sequential: 1st → `{received:true}`, Payment row created, tenant `subscriptionStatus→active`; 2nd → **`{received:true, deduplicated:true}`**, still **1 `ProcessedWebhookEvent` row**, 1 Payment, and a sentinel tenant mutation is **not** overwritten (side effect not replayed); 3rd also deduplicated. Concurrent ×5: no rejections, 1 ProcessedWebhookEvent, 1 Payment. Kill switch: throws `[BILLING FROZEN]` before any row. | **PASS** (O-4 recorded) | `tests/reliability/stripe-webhook-duplicate.test.ts` |
| S5a | LLM 429 | Fake SDK throws `{status:429, retry-after:0}` every call; `LLM_MAX_RETRIES=2`, ms-scale backoff | Exactly **3 attempts** (= MAX_RETRIES+1), error surfaces (`status:429`), elapsed 8 ms. 429 clearing on the last permitted attempt → success, still 3 attempts. | **PASS** | `tests/reliability/llm-provider-resilience.test.ts` |
| S5b | LLM 5xx / 4xx | Fake SDK throws 503 every call; separately 400 | 503 → exactly 3 attempts then throws. 400 → **1 attempt**, not retried. | **PASS** | same |
| S5c | LLM timeout | Fake SDK never resolves unless the `AbortSignal` fires; `LLM_DEFAULT_TIMEOUT_MS=60`; per-request `metadata.timeoutMs=20` | Aborted at 60/60/60 ms on each of 3 attempts; total 185 ms (bound `3×60+500`). Per-request override honoured (aborted ≈20 ms, 1 attempt with retries=0). | **PASS** (O-5c recorded) | same |
| S5d | Circuit breaker | Threshold 2, retries 0, SDK throws 500 | Breaker `open` after 2 failures; next call throws `Circuit breaker is open` with **0 provider attempts**. | **PASS** | same |
| S5e | Malformed JSON | Fake SDK returns `{"text": "unterminated` and 4 off-schema variants (missing `finding_ids`, empty citations, unknown Finding id, extra key) in `json` modality | Provider layer returns the text **verbatim** (1 attempt, no schema check — by design, quality-score heuristic only). Consumer `ProposalLLMOrchestrator.generateExecutiveSummary` rejects all 5 with `success:false`, `content:''`, `error` set — **no silent pass**. | **PASS** (O-5 recorded) | same |
| S5f | Registry fallback classification | Fake providers per slot: 429 / 5xx-all / 400 / 401 / repeated 503 | 429 → falls to next provider, each provider tried once (`retry-after` honoured, capped). 5xx everywhere → exactly 1 attempt per provider, `success:false`, `TRANSIENT`, `retryable:true`. 400 → chain stops after 1 (PERMANENT, no fallback). 401 → skips to next. After 3 consecutive failures a provider is `healthy:false` and excluded from later chains. | **PASS** | same |
| S6 | Redis down | (a) `getSharedStore()` rejects; (b) store resolves but every command rejects | `checkAndAddSpend` never throws; allows exactly `LOCAL_FALLBACK_FRACTION(0.1)×cap` (STARTER: 200 ¢ = 4×50 ¢) then blocks with `reason: "Redis unavailable; local fallback cap (200 cents) exceeded"`; stays blocked (no oscillation); per-tenant. `checkAndIncrementDailyAudit` → `{allowed:true, todayCount:-1}`. Read paths → 0. `reserveAuditBudget` (runner entry) → 2 reservations then blocked. `settleAuditSpend` swallows. Recovery: healthy store call clears the local counter and Redis value is authoritative. | **PASS** | `tests/reliability/redis-down-spend-fallback.test.ts` |
| S7 | Kill switch / sandbox | Real tenant + ENRICHED lead (painScore 85) + due `PENDING` outreach email + sending domain; `getSendProvider().send` = spy. (a) `OUTREACH_LIVE_SENDING` unset & no flag row; (b) `='false'`; (c) DB FeatureFlag `true` but `OUTBOUND_DELIVERY_ENABLED` unset; (d) `deliverProposalEmail` under disabled/sandbox/forced-live-with-gates-off; (e) `KILL_SWITCH_FORCE_MANUAL_MODE=true` | (a,b) **spy called 0×**; `providerMessageId` = `mock_<uuid>`; `EMAIL_SENT` event `metadata.isMock=true`; outcome `mock-sent`. (c) `assertLiveProviderReady` refuses → **spy 0×**, email `FAILED` with the gate message, no event, lead `outreachAttempts=0`. (d) `disabled` → `{state:'FAILED', reason:'Outbound delivery is disabled'}` before any DB read; `sandbox` → `SIMULATED`; `mode:'live'` with gates off → throws before provider; `OUTBOUND_MODE=live` alone or with only `OUTBOUND_DELIVERY_ENABLED` still resolves `disabled`; proposal stays `READY`, 0 `ProposalOutreach` rows, **spy 0×**. (e) `halted:true`, 0 leads processed, email still `PENDING`. **Never `SENT` with a real id while live flags are off.** | **PASS** (O-7 recorded; D3 latent) | `tests/reliability/outbound-kill-switch-provider-failure.test.ts` |
| S8 | Email provider failure | Both env gates `true`; spy `send` rejects (`Resend 500…` / `SMTP 421…`) | Sniper: spy 1×; email `FAILED`, `sentAt` null, `providerMessageId` null, `errorMessage` = provider error; **no `EMAIL_SENT` event**; lead not advanced; next tick does not resend (0×). `deliverProposalEmail`: throws provider error; 1 `ProposalOutreach` row with `errorMessage` `UNKNOWN_PROVIDER_OUTCOME: SMTP 421…`, `sentAt` null; **proposal stays `READY` (not SENT)**; retry → `QUEUED` (reconciliation) with **0 provider calls**. Control: provider succeeds → exactly one send, proposal `SENT`, second call idempotent (`SENT`, same messageId, spy still 1×). | **PASS** | same |

Totals: **8 requested scenarios written and executed** (expanded into 49 test
cases across 5 files). Scenario-level result: S1 PASS (with sub-case S1b FAIL),
S2 PASS-invariant / FAIL-contract, S3–S8 PASS.

## Production defects found (not fixed — reported)

### DEFECT-D1 — Reclaimed / redelivered audit job duplicates `Finding` and `EvidenceSnapshot` rows  
**Severity:** High (data integrity: duplicated customer-facing findings and evidence for the same audit; downstream proposal grounding/fingerprinting reads these tables).  
**Where:**
- `lib/queue/auditJobWorker.ts:135` — every attempt calls `runAudit(auditId)` unconditionally; no check that the `Audit` is already `COMPLETE`/`TRUSTED` from a prior attempt.
- `lib/audit/runner.ts:1634-1656` (`runAuditInternal`) — loads the audit and immediately resets it to `RUNNING`; no "already terminal" guard.
- `lib/audit/findingPersistence.ts:101-140` (`persistAuditResult`) — `evidenceSnapshot.createMany` / `finding.createMany` append; there is no `deleteMany({auditId})` or upsert for the audit's prior rows inside the transaction.

**Expected:** after worker A persists results and dies before `markJobSucceeded`, worker B's re-run leaves 1 Finding / 1 EvidenceSnapshot (redelivery is idempotent).  
**Actual:** 2 Findings / 2 EvidenceSnapshots (`S1b-redelivery-duplicate-findings-RAW-FAILURE.txt` line 148).  
**Reproduction:** `tests/reliability/queue-worker-death-poison.test.ts` → `S1b (DEFECT-D1)`. Steps: enqueue → `claimJob` (A) → `runWithTenantAsync(tenantId, persistAuditResult{1 finding, 1 evidence, status COMPLETE})` → expire lease via bypass + `releaseJobLock` → `processAuditJob(jobId)` with the runner calling `persistAuditResult` again → count rows by `auditId`.  
**Realistic trigger:** Cloud Run instance killed during `generateProposal` (runs after `runAudit` inside the same lease, `auditJobWorker.ts:144`) or any hang > `LEASE_DURATION_MS` (6 min) after persistence.  
**Status in suite:** encoded as `it.fails` so `npm test` stays deterministic; it will flip to a reported failure when fixed (remove `.fails`).

### DEFECT-D2 — `enqueueAuditJob` leaks `P2002` unique-violation to concurrent duplicate callers  
**Severity:** Medium (no duplicate rows — the DB index holds — but the idempotency contract is violated and callers see exceptions).  
**Where:** `lib/queue/auditJobQueue.ts:89-118` — `findUnique` then `create` (non-atomic). Contract at `auditJobQueue.ts:84-88`: *"if a job with the same idempotencyKey already exists … this is a no-op and the existing record is returned."*  
**Expected:** every concurrent caller resolves with the same `AuditJob` record.  
**Actual:** 35–36 of 48 concurrent callers (6 callers × 8 rounds) rejected with Prisma `P2002` (`vitest-reliability.txt`, `[S2]` line). `enqueueBatchJobs` (`auditJobQueue.ts:155-167`) would record these as per-audit enqueue **errors** although the job exists.  
**Reproduction:** `tests/reliability/queue-worker-death-poison.test.ts` → `S2b (contract, DEFECT-D2)`; `Promise.allSettled(Array.from({length:6}, () => enqueueAuditJob({...same idempotencyKey})))`.  
**Status in suite:** `it.fails`.

### DEFECT-D3 — `deliverProposalEmail` depends on ambient tenant context for the blocklist lookup (latent, fails closed)  
**Severity:** Low / latent.  
**Where:** `lib/outreach/outboundDelivery.ts:65` — `prisma.emailBlocklist.findUnique(...)` is executed **outside** `runWithTenantAsync(input.tenantId, …)`, unlike the neighbouring queries at lines 56, 69, 80, 85, 93, 103, 109 which are explicitly scoped.  
**Expected:** a function that receives `tenantId` explicitly and self-scopes its other queries should not throw when called without an ambient tenant context.  
**Actual:** `MissingTenantError: Tenant context required for EmailBlocklist.findUnique: missing tenant context`; no provider call, no rows (fails closed).  
**Why production is currently unaffected:** the only `approved:true` caller (`app/api/proposal/id/[id]/send/route.ts:111`) runs inside the authenticated request's tenant context (`getTenantId()` at line 20); the public route (`app/api/proposal/token/[token]/email/route.ts:21-31`) passes `approved:false` and returns `AWAITING_APPROVAL` at `outboundDelivery.ts:49` before line 65 is reached. Any future background/reconciliation caller (e.g. resolving `UNKNOWN_PROVIDER_OUTCOME` rows) without ambient context will fail.  
**Reproduction:** `tests/reliability/outbound-kill-switch-provider-failure.test.ts` → `S7f (DEFECT-D3)`.

### DEFECT-D4 — `cleanup-stale-jobs` terminates by `createdAt` age only, ignoring lease liveness; result is a non-retryable `FAILED`  
**Severity:** Medium (lost work under backlog).  
**Where:** `app/api/cron/cleanup-stale-jobs/route.ts:46-62` selects `status IN (QUEUED, RUNNING) AND createdAt < now-2h` — no `leaseExpiresAt`/`lastHeartbeatAt` predicate; `:93-104` sets `status='FAILED'` without clearing `leaseToken/leaseOwner/leaseExpiresAt`.  
**Consequences (verified in S1 cron test):**
1. A job that sat `QUEUED` for > 2 h (queue backlog) is marked `FAILED` and is **never** picked up again: `claimNextJob` (`lib/queue/auditJobQueue.ts:184-194`) only reclaims `QUEUED` or `RUNNING`+expired-lease.
2. A `RUNNING` job with a **live, heartbeating lease** whose `createdAt` is > 2 h old is also marked `FAILED` under the worker's feet (its later `markJobSucceeded` still matches the token and flips it to `SUCCEEDED`, so the outcome is a transient inconsistent state rather than data loss).
3. `processAuditJob` (`lib/queue/auditJobWorker.ts:73`) only treats `SUCCEEDED`/`DEAD` as terminal, so a redelivery for a cron-`FAILED` job surfaces as `LOCK_CONTENTION` (HTTP 409) instead of `SKIPPED`.
**Reproduction:** `tests/reliability/queue-worker-death-poison.test.ts` → `S1 (cron)`.

## Observations (no contract violation, recorded for operators)

- **O-1** The queue's lease reclaim and the cron's TTL cleanup are two independent mechanisms with different clocks (6 min lease vs 2 h createdAt). Only the former is lease-aware. See D4.
- **O-4** Concurrent duplicate webhook deliveries that lose at the `createMany({skipDuplicates})` reservation (`lib/stripe/webhookHandler.ts:216-217`) return `{received:true}` **without** `deduplicated:true` (only the `findUnique` pre-check at `:120-131` sets the flag). The route returns 200 either way, so Stripe stops retrying; observability of "how many duplicates were absorbed" is incomplete. In the recorded run 4/5 concurrent losers were flagged and 1 was not (timing-dependent).
- **O-5** The LLM cache (`lib/llm/provider.ts:584-607`) stores the raw model output **before** any consumer schema validation. A malformed JSON payload is cached; an identical retry (same prompt/model/params) is served the poisoned entry without reaching the provider (verified: 2 orchestrator calls → 1 SDK call, both rejected). Safe (still rejected) but retries cannot self-heal until TTL.
- **O-5c** The request timeout in `lib/llm/provider.ts:383-386, 462-464` relies entirely on the SDK honouring `AbortSignal`; there is no outer `Promise.race`. `@google/generative-ai@^0.24.1` does accept `signal` in `RequestOptions`, and the test's fake honours it, so the bound holds — but a provider/SDK that ignores the signal would hang the attempt indefinitely.
- **O-7** In sandbox mode the sniper persists the mock send as `status=SENT` with `providerMessageId='mock_<uuid>'` and `EMAIL_SENT` event `isMock:true` (`lib/outreach/sprint2/sniperWorker.ts:631, 658-691`), although an `OutreachEmailStatus.SIMULATED` enum value exists. Because the tenant cap check counts `status=SENT` (`sniperWorker.ts:583-597`), sandbox activity consumes the daily/global send caps and inflates "sent" metrics. Conservative (fewer real sends later), but misleading.
- **O-8** `FeatureFlagService` env-override precedence (`lib/config/FeatureFlagService.ts:17-21`) means a DB FeatureFlag `OUTREACH_LIVE_SENDING=true` is **not** sufficient to send: `assertLiveProviderReady` (`lib/outreach/providers.ts:38-43, 124-130`) additionally requires both env vars. Verified in S7c — flag drift fails closed with the email marked `FAILED` (so the sequence step is consumed, not retried).

## Test files (all new; nothing under `lib/` or `app/` changed)

| File | Tests | DB |
|------|-------|----|
| `tests/reliability/queue-worker-death-poison.test.ts` | 8 (6 pass, 2 expected-fail = D1, D2) | real Postgres |
| `tests/reliability/stripe-webhook-duplicate.test.ts` | 3 | real Postgres |
| `tests/reliability/llm-provider-resilience.test.ts` | 15 | none (fake SDK / fake providers) |
| `tests/reliability/redis-down-spend-fallback.test.ts` | 14 | none (store mocked to fail) |
| `tests/reliability/outbound-kill-switch-provider-failure.test.ts` | 9 | real Postgres |

Combined with the pre-existing sibling suites (`tests/worker`, `tests/fault-injection`,
`tests/security/stripe-webhook-signature-idempotency.test.ts`,
`tests/security/audit-job-lease-heartbeat.test.ts`, `tests/security/outbound-delivery.test.ts`)
the run is `10 files, 83 passed | 2 expected fail` — no interference.
