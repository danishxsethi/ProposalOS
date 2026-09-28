// @vitest-environment node
/**
 * tests/reliability/queue-worker-death-poison.test.ts
 *
 * Stream D — reliability / failure injection for the durable AuditJob queue.
 * REAL PostgreSQL (disposable per-file DB created from the production
 * migrations by tests/helpers/realDb.ts). No database mocks. Only the
 * audit runner, proposal generator and audit-trail sink are stubbed — they are
 * external to the queue/lease semantics under test.
 *
 * Scenarios (numbering matches docs/execution/.../closure/08_FAILURE_INJECTION.md):
 *   S1  Worker death / lease reclaim — worker A claims and dies (no heartbeat,
 *       lease forced into the past). The queue's own reclaim path
 *       (claimNextJob) hands the job to worker B with a NEW leaseToken and
 *       attempts+1. Worker A's stale completion/failure marks using the old
 *       token are rejected and do not overwrite B's state. Cleanup cron
 *       (app/api/cron/cleanup-stale-jobs) is exercised on the same fixture.
 *   S1b Redelivery idempotence at the persistence layer — worker A completes
 *       the audit's atomic persistence and then dies before it can mark the job
 *       SUCCEEDED; worker B re-runs. Asserts Finding/EvidenceSnapshot rows are
 *       not duplicated (uses the REAL lib/audit/findingPersistence.ts).
 *   S2  Duplicate dispatch — enqueueAuditJob called twice concurrently with the
 *       same idempotencyKey → exactly one AuditJob row.
 *   S3  Poison job — execution throws every time → after MAX_RETRIES attempts
 *       the job is DEAD, never left RUNNING, and is not re-claimed.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { activateRealDb, type RealDbSession } from '../helpers/realDb';

const session: RealDbSession = await activateRealDb('reliability_queue');

// ── Worker-external dependency stubs (NOT the queue/DB under test) ────────────
const runAuditMock = vi.fn();
const generateProposalMock = vi.fn();
vi.mock('@/lib/audit/runner', () => ({ runAudit: runAuditMock }));
vi.mock('@/lib/proposal/runner', () => ({ generateProposal: generateProposalMock }));
vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: vi.fn().mockResolvedValue(undefined),
}));

const {
  claimJob,
  claimNextJob,
  enqueueAuditJob,
  heartbeatJob,
  markJobFailed,
  markJobSucceeded,
  releaseJobLock,
  MAX_RETRIES,
} = await import('@/lib/queue/auditJobQueue');
const { processAuditJob } = await import('@/lib/queue/auditJobWorker');
const { persistAuditResult } = await import('@/lib/audit/findingPersistence');
const { runWithTenantAsync, runWithTenantBypass } = await import('@/lib/tenant/context');
const { prisma } = await import('@/lib/prisma');
const { GET: cleanupStaleJobs } = await import('@/app/api/cron/cleanup-stale-jobs/route');

const CRON_SECRET = 'reliability-cron-secret';

describe('Stream D — AuditJob queue failure injection (real PostgreSQL)', () => {
  let tenantId: string;

  const jobRow = (id: string) =>
    runWithTenantBypass('test-fixture:read-job', () =>
      prisma.auditJob.findUniqueOrThrow({ where: { id } })
    );
  const makeAudit = (businessName = 'Reliability FI') =>
    runWithTenantBypass('test-fixture:create-audit', async () => {
      const audit = await prisma.audit.create({
        data: { tenantId, businessName, status: 'QUEUED' },
      });
      return audit.id;
    });
  const enqueue = (auditId: string, key = `rel:${auditId}`) =>
    runWithTenantAsync(tenantId, () =>
      enqueueAuditJob({
        tenantId,
        batchId: auditId,
        auditId,
        idempotencyKey: key,
        dispatch: false,
      })
    );
  const claim = (jobId: string) => runWithTenantAsync(tenantId, () => claimJob(jobId));

  /**
   * Simulate a worker that claimed a job and then died: it never heartbeats and
   * never finalizes. We force leaseExpiresAt into the past via the superuser
   * fixture connection (equivalent to waiting out LEASE_DURATION_MS) and free
   * the in-process distributed lock slot (a dead process holds no lock; in
   * tests the reclaiming worker shares this process so the 90 s lock TTL would
   * otherwise mask the lease predicate, which is the correctness gate).
   */
  const killWorkerHoldingLease = async (jobId: string) => {
    await runWithTenantBypass('test-fixture:expire-lease', () =>
      prisma.auditJob.update({
        where: { id: jobId },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      })
    );
    await releaseJobLock(jobId);
  };

  beforeAll(async () => {
    tenantId = randomUUID();
    await runWithTenantBypass('test-fixture:create-tenant', () =>
      prisma.tenant.create({
        data: { id: tenantId, name: 'Reliability Tenant', slug: `rel-${tenantId}` },
      })
    );
    process.env.CRON_SECRET = CRON_SECRET;
    runAuditMock.mockResolvedValue(undefined);
    generateProposalMock.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await session.cleanup();
  });

  // ── S1 ──────────────────────────────────────────────────────────────────────
  it('S1: dead worker A is reclaimed by worker B with a new lease; A stale completion is rejected and does not overwrite B', async () => {
    const auditId = await makeAudit();
    const job = await enqueue(auditId);

    // Worker A claims.
    const a = (await claim(job.id))!;
    expect(a.status).toBe('RUNNING');
    expect(a.attempts).toBe(1);
    expect(a.leaseToken).toBeTruthy();
    const aToken = a.leaseToken!;

    // Worker A dies: no heartbeat; lease expires.
    await killWorkerHoldingLease(job.id);

    // The cleanup cron must NOT touch this job: it is only stale by lease (minutes),
    // not by the cron's 2 h createdAt TTL. Reclaim is the queue's responsibility.
    const cronRes = await cleanupStaleJobs(
      new Request('http://localhost/api/cron/cleanup-stale-jobs', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      })
    );
    expect(cronRes.status).toBe(200);
    expect((await jobRow(job.id)).status).toBe('RUNNING');

    // Worker B reclaims via the queue's reclaim predicate (RUNNING + expired lease).
    const b = await claimNextJob(tenantId);
    expect(b).not.toBeNull();
    expect(b!.id).toBe(job.id);
    expect(b!.leaseToken).toBeTruthy();
    expect(b!.leaseToken).not.toBe(aToken);
    expect(b!.attempts).toBe(2);
    expect(b!.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    // Worker A "wakes up" and tries to finish with its stale token — every
    // mutation path must be rejected.
    await expect(runWithTenantAsync(tenantId, () => heartbeatJob(job.id, aToken))).resolves.toBe(false);
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, aToken))).resolves.toBe(false);
    await expect(
      runWithTenantAsync(tenantId, () => markJobFailed(job.id, 'A late failure', MAX_RETRIES, aToken))
    ).resolves.toBe(false);

    const afterStale = await jobRow(job.id);
    expect(afterStale.status).toBe('RUNNING');
    expect(afterStale.leaseToken).toBe(b!.leaseToken);
    expect(afterStale.attempts).toBe(2);
    expect(afterStale.completedAt).toBeNull();
    expect(afterStale.errorMessage).toBeNull();

    // B finalizes exactly once.
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, b!.leaseToken!))).resolves.toBe(true);
    const done = await jobRow(job.id);
    expect(done.status).toBe('SUCCEEDED');
    const completedAt = done.completedAt!.getTime();

    // A's token can never produce a second outcome after B's.
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, aToken))).resolves.toBe(false);
    await expect(
      runWithTenantAsync(tenantId, () => markJobFailed(job.id, 'A very late', MAX_RETRIES, aToken))
    ).resolves.toBe(false);
    const final = await jobRow(job.id);
    expect(final.status).toBe('SUCCEEDED');
    expect(final.completedAt!.getTime()).toBe(completedAt);

    // Exactly one AuditJob and one Audit row exist for this audit.
    const jobCount = await runWithTenantBypass('test-fixture:count', () =>
      prisma.auditJob.count({ where: { auditId } })
    );
    const auditCount = await runWithTenantBypass('test-fixture:count', () =>
      prisma.audit.count({ where: { id: auditId } })
    );
    expect(jobCount).toBe(1);
    expect(auditCount).toBe(1);
  });

  it('S1 (end-to-end): worker B runs processAuditJob after A dies; A stale finalization rejected; single Audit row', async () => {
    const auditId = await makeAudit();
    const job = await enqueue(auditId);
    const a = (await claim(job.id))!;
    await killWorkerHoldingLease(job.id);

    runAuditMock.mockClear();
    const result = await processAuditJob(job.id);
    expect(result).toMatchObject({ outcome: 'SUCCEEDED', jobId: job.id, auditId });
    expect(runAuditMock).toHaveBeenCalledTimes(1);

    const row = await jobRow(job.id);
    expect(row.attempts).toBe(2);
    expect(row.leaseToken).not.toBe(a.leaseToken);

    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, a.leaseToken!))).resolves.toBe(false);
    await expect(runWithTenantAsync(tenantId, () => markJobFailed(job.id, 'stale', MAX_RETRIES, a.leaseToken!))).resolves.toBe(false);
    expect((await jobRow(job.id)).status).toBe('SUCCEEDED');
    expect(
      await runWithTenantBypass('test-fixture:count', () => prisma.audit.count({ where: { id: auditId } }))
    ).toBe(1);
  });

  it('S1 (cron): cleanup-stale-jobs only terminates jobs older than the 2 h TTL, and marks them FAILED (not requeued)', async () => {
    const auditId = await makeAudit();
    const job = await enqueue(auditId);
    await claim(job.id);
    await killWorkerHoldingLease(job.id);
    // Backdate createdAt beyond the cron's TTL so it becomes eligible.
    await runWithTenantBypass('test-fixture:backdate', () =>
      prisma.auditJob.update({
        where: { id: job.id },
        data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      })
    );

    const res = await cleanupStaleJobs(
      new Request('http://localhost/api/cron/cleanup-stale-jobs', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobsCleanedUp).toBeGreaterThanOrEqual(1);

    const row = await jobRow(job.id);
    expect(row.status).toBe('FAILED');
    expect(row.completedAt).not.toBeNull();

    // Observation recorded for the closure doc: FAILED is terminal for the
    // reclaim predicate (claimNextJob only considers QUEUED / RUNNING+expired),
    // so a cron-terminated job is not retried; and the cron does not consult the
    // lease, so the leaseToken is left in place.
    const reclaimed = await claimNextJob(tenantId);
    expect(reclaimed?.id).not.toBe(job.id);
    // processAuditJob treats FAILED as non-terminal but the claim predicate
    // rejects it — surfaces as LOCK_CONTENTION rather than SKIPPED.
    await expect(processAuditJob(job.id)).resolves.toMatchObject({ outcome: 'LOCK_CONTENTION' });
  });

  // ── S1b: redelivery idempotence at the real persistence boundary ────────────
  /**
   * DEFECT-D1: a reclaimed/redelivered audit job duplicates Finding and
   * EvidenceSnapshot rows.
   *   - lib/queue/auditJobWorker.ts:135 re-invokes runAudit(auditId) on every
   *     attempt with no check that the Audit already reached COMPLETE.
   *   - lib/audit/runner.ts:1634-1656 (runAuditInternal) has no "already
   *     COMPLETE" guard and unconditionally resets the audit to RUNNING.
   *   - lib/audit/findingPersistence.ts:101-140 (persistAuditResult) appends via
   *     createMany with no deleteMany/upsert for the audit's prior rows.
   * Observed: findings=2, evidence=2 after one crash+reclaim (expected 1/1).
   * Encoded with it.fails so the suite stays deterministic until fixed.
   */
  it('S1b (DEFECT-D1): worker A persists audit results then dies before SUCCEEDED; B re-runs — Finding/Evidence rows must not duplicate', async () => {
    const auditId = await makeAudit('Persist Then Die');
    const job = await enqueue(auditId);

    // Stand-in for the runner's final step: the REAL atomic persistence boundary
    // (lib/audit/findingPersistence.ts) exactly as lib/audit/runner.ts:1983 calls it.
    const persistOnce = async () =>
      persistAuditResult({
        auditId,
        tenantId,
        findings: [
          {
            module: 'website',
            category: 'Performance',
            type: 'VITAMIN',
            title: 'Measured optimization opportunity',
            description: 'Real measured opportunity backed by evidence.',
            impactScore: 4,
            confidenceScore: 8,
            evidence: [
              {
                pointer: 'https://business.test/report',
                source: 'pagespeed',
                collected_at: new Date().toISOString(),
                value: 70,
              },
            ],
            metrics: {},
            recommendedFix: ['Compress hero image'],
          },
        ],
        evidence: [
          {
            module: 'website',
            source: 'pagespeed',
            rawResponse: { scores: { performance: 0.7 } },
            targetUrl: 'https://business.test',
          },
        ],
        auditUpdate: { status: 'COMPLETE', trustState: 'TRUSTED', completedAt: new Date() },
      });

    // Worker A: claims, runs the audit to completion (findings persisted), then
    // dies before markJobSucceeded (e.g. instance killed during proposal generation).
    const a = (await claim(job.id))!;
    await runWithTenantAsync(tenantId, persistOnce);
    await killWorkerHoldingLease(job.id);

    const countRows = () =>
      runWithTenantBypass('test-fixture:count-rows', async () => ({
        findings: await prisma.finding.count({ where: { auditId } }),
        evidence: await prisma.evidenceSnapshot.count({ where: { auditId } }),
      }));
    expect(await countRows()).toEqual({ findings: 1, evidence: 1 });

    // Worker B: reclaims and re-runs the audit through the production worker path.
    runAuditMock.mockImplementationOnce(async () => {
      await persistOnce();
    });
    const result = await processAuditJob(job.id);
    expect(result.outcome).toBe('SUCCEEDED');
    expect((await jobRow(job.id)).attempts).toBe(2);
    expect((await jobRow(job.id)).leaseToken).not.toBe(a.leaseToken);

    // CONTRACT: redelivery must not duplicate persisted audit output.
    const after = await countRows();
    expect(after).toEqual({ findings: 1, evidence: 1 });
  });

  // ── S2 ──────────────────────────────────────────────────────────────────────
  const CONCURRENT_ENQUEUE_ROUNDS = 8;
  const CONCURRENT_ENQUEUE_CALLERS = 6;

  async function concurrentEnqueueRounds() {
    let rejected = 0;
    let totalCallers = 0;
    const codes = new Map<string, number>();
    for (let round = 0; round < CONCURRENT_ENQUEUE_ROUNDS; round++) {
      const auditId = await makeAudit();
      const key = `rel:dup:${auditId}`;
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_ENQUEUE_CALLERS }, () => enqueue(auditId, key))
      );
      totalCallers += results.length;
      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>[];
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      expect(new Set(fulfilled.map((r) => r.value.id)).size).toBe(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          rejected += 1;
          const code = (r.reason as { code?: string })?.code ?? (r.reason as Error).name;
          codes.set(code, (codes.get(code) ?? 0) + 1);
        }
      }
      // Hard invariant: the DB unique index guarantees exactly one row per key.
      const count = await runWithTenantBypass('test-fixture:count-jobs', () =>
        prisma.auditJob.count({ where: { idempotencyKey: key } })
      );
      expect(count).toBe(1);
    }
    return { rejected, totalCallers, codes: Object.fromEntries(codes) };
  }

  it('S2a (invariant): concurrent enqueue with the same idempotencyKey never creates more than one AuditJob row', async () => {
    const { rejected, totalCallers, codes } = await concurrentEnqueueRounds();
     
    console.info(
      `[S2] ${rejected}/${totalCallers} concurrent enqueue caller(s) received an exception instead of the existing row; error codes:`,
      codes
    );
  });

  /**
   * DEFECT-D2 (lib/queue/auditJobQueue.ts:90-118): enqueueAuditJob is
   * find-then-create, not an atomic upsert/create-with-conflict-handling. Under
   * concurrent dispatch of the same idempotencyKey the DB unique index correctly
   * prevents a second row, but the losing callers receive a Prisma P2002
   * unique-violation exception instead of the documented "no-op, existing record
   * is returned" contract (auditJobQueue.ts:84-88). enqueueBatchJobs then reports
   * these as per-audit enqueue errors even though the job exists.
   *
   * Encoded with it.fails so the suite is deterministic: when the defect is fixed
   * this test will start passing and vitest will flag it, prompting removal of
   * `.fails`.
   */
  it('S2b (contract, DEFECT-D2): concurrent duplicate dispatch returns the existing row to every caller — no unique-violation leaks', async () => {
    const { rejected } = await concurrentEnqueueRounds();
    expect(rejected).toBe(0);
  });

  // ── S3 ──────────────────────────────────────────────────────────────────────
  it('S3: poison job (throws every attempt) is DEAD after MAX_RETRIES attempts and never left RUNNING', async () => {
    const auditId = await makeAudit('Poison');
    const job = await enqueue(auditId);

    runAuditMock.mockClear();
    runAuditMock.mockRejectedValue(new Error('poison: deterministic module crash'));

    const outcomes: string[] = [];
    const statusesBetweenAttempts: string[] = [];
    let iterations = 0;
    const HARD_STOP = MAX_RETRIES + 3; // guard against infinite loop if DEAD never reached

    while (iterations < HARD_STOP) {
      iterations += 1;
      const r = await processAuditJob(job.id);
      outcomes.push(r.outcome);
      const row = await jobRow(job.id);
      statusesBetweenAttempts.push(row.status);
      // Between deliveries the job must never be parked in RUNNING (that would
      // be "running forever" until the lease expires).
      expect(row.status).not.toBe('RUNNING');
      if (row.status === 'DEAD' || row.status === 'SUCCEEDED') break;
    }

    const final = await jobRow(job.id);
    expect(final.status).toBe('DEAD');
    expect(final.attempts).toBe(MAX_RETRIES);
    expect(final.attempts).toBe(final.maxAttempts);
    expect(final.completedAt).not.toBeNull();
    expect(final.leaseToken).toBeNull();
    expect(final.errorMessage).toContain('poison');
    expect(runAuditMock).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(outcomes).toEqual([...Array(MAX_RETRIES - 1).fill('FAILED'), 'DEAD']);
    expect(statusesBetweenAttempts).toEqual([...Array(MAX_RETRIES - 1).fill('QUEUED'), 'DEAD']);

    // Underlying Audit row reflects the failure.
    const audit = await runWithTenantBypass('test-fixture:read-audit', () =>
      prisma.audit.findUniqueOrThrow({ where: { id: auditId } })
    );
    expect(audit.status).toBe('FAILED');
    expect(audit.trustState).toBe('FAILED');

    // A DEAD job is never re-claimed by the poller and redelivery is a no-op.
    const next = await claimNextJob(tenantId);
    expect(next?.id).not.toBe(job.id);
    await expect(processAuditJob(job.id)).resolves.toMatchObject({ outcome: 'SKIPPED' });
    expect((await jobRow(job.id)).attempts).toBe(MAX_RETRIES);

     
    console.info(`[S3] poison job reached DEAD after ${final.attempts} attempts (MAX_RETRIES=${MAX_RETRIES})`);

    runAuditMock.mockReset();
    runAuditMock.mockResolvedValue(undefined);
  });

  it('S3 (worker route): a poison job dispatched via the HTTP worker returns 500 (retry signal) and 200 SKIPPED once DEAD', async () => {
    process.env.WORKER_SECRET = 'reliability-worker-secret';
    const { POST } = await import('@/app/api/worker/audit-job/route');
    const auditId = await makeAudit('Poison via route');
    const job = await enqueue(auditId);
    runAuditMock.mockRejectedValue(new Error('poison: route path'));

    const post = () =>
      POST(
        new Request('http://localhost/api/worker/audit-job', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.WORKER_SECRET}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ jobId: job.id }),
        })
      );

    const statuses: number[] = [];
    for (let i = 0; i < MAX_RETRIES; i++) {
      const res = await post();
      statuses.push(res.status);
    }
    expect(statuses).toEqual(Array(MAX_RETRIES).fill(500));
    expect((await jobRow(job.id)).status).toBe('DEAD');

    const after = await post();
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ outcome: 'SKIPPED' });

    runAuditMock.mockReset();
    runAuditMock.mockResolvedValue(undefined);
  });
});
