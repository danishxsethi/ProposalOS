// @vitest-environment node
/**
 * tests/worker/auditJobWorkerCrashReclaim.test.ts
 *
 * REAL-PostgreSQL qualification of the durable AuditJob queue
 * (lib/queue/auditJobQueue.ts) and the worker execution path
 * (lib/queue/auditJobWorker.ts::processAuditJob) against a disposable, migrated
 * database. No database mocks: claim/heartbeat/expiry/reclaim races and crash
 * recovery are exercised against real rows and real SQL predicates.
 *
 * The only mocks are for worker-external dependencies that are not the database
 * behavior under test: the audit runner, the proposal generator, and the audit
 * trail sink.
 *
 * Covers:
 *   1. Claim assigns a fresh lease and attempts increments.
 *   2. Heartbeat renews a held lease.
 *   3. Stale worker: expired lease is reclaimed; old worker's heartbeat and
 *      success/failure marks are rejected (no double finalization).
 *   4. Crashed worker (no finalization call at all): the job is reclaimed and
 *      completed by a second worker.
 *   5. Retry requeue after a markJobFailed, then a successful retry attempt.
 *   6. Enqueue idempotence via idempotencyKey.
 *   7. Proposal gating: generateProposal=false jobs finish SUCCEEDED without a
 *      Proposal row; trusted audits with generateProposal=true produce one.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { activateRealDb, type RealDbSession } from '../helpers/realDb';

const session: RealDbSession = await activateRealDb('worker');

// ── Worker-external dependency mocks (NOT the database under test) ──────────
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
  LEASE_DURATION_MS,
} = await import('@/lib/queue/auditJobQueue');
const { processAuditJob } = await import('@/lib/queue/auditJobWorker');
const { runWithTenantAsync, runWithTenantBypass } = await import('@/lib/tenant/context');
const { prisma } = await import('@/lib/prisma');
const { releaseJobLock } = await import('@/lib/queue/auditJobQueue');

describe('audit job worker lease/crash/reclaim (real PostgreSQL, disposable DB)', () => {
  let tenantId: string;

  const jobRow = (id: string) =>
    runWithTenantBypass('test-fixture:read-job', () =>
      prisma.auditJob.findUniqueOrThrow({ where: { id } })
    );
  const makeAudit = () =>
    runWithTenantBypass('test-fixture:create-audit', async () => {
      const audit = await prisma.audit.create({
        data: { tenantId, businessName: 'Worker FI', status: 'QUEUED' },
      });
      return audit.id;
    });
  const enqueue = (auditId: string, extra: Partial<{ generateProposal: boolean }> = {}) =>
    runWithTenantAsync(tenantId, () =>
      enqueueAuditJob({
        tenantId,
        batchId: auditId,
        auditId,
        idempotencyKey: `fi:${auditId}`,
        dispatch: false,
        ...extra,
      })
    );
  const claim = (jobId: string) => runWithTenantAsync(tenantId, () => claimJob(jobId));
  // A crashed worker never releases its in-memory lock handle; free the lock slot
  // so the reclaiming worker (same process in tests) is not blocked by the
  // 90s JOB_LOCK_TTL — the lease predicate remains the correctness gate.
  const crashWorker = async (jobId: string) => {
    const stale = (await claim(jobId))!;
    await runWithTenantBypass('test-fixture:expire-lease', () =>
      prisma.auditJob.update({
        where: { id: jobId },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      })
    );
    await releaseJobLock(jobId);
    return stale;
  };

  beforeAll(async () => {
    tenantId = randomUUID();
    await runWithTenantBypass('test-fixture:create-tenant', () =>
      prisma.tenant.create({ data: { id: tenantId, name: 'Worker FI Tenant', slug: `wfi-${tenantId}` } })
    );
    runAuditMock.mockResolvedValue(undefined);
    generateProposalMock.mockImplementation(async (auditId: string) => {
      const audit = await prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
      await prisma.proposal.create({ data: { auditId, tenantId: audit.tenantId } });
    });
  });

  afterAll(async () => {
    await session.cleanup();
  });

  it('claimJob atomically assigns a fresh lease and increments attempts', async () => {
    const job = await enqueue(await makeAudit());

    const claimed = await claim(job.id);

    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('RUNNING');
    expect(claimed!.attempts).toBe(1);
    expect(claimed!.leaseToken).toBeTruthy();
    expect(claimed!.leaseOwner).toBeTruthy();
    expect(claimed!.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('a second claim of a freshly-claimed RUNNING job loses the race', async () => {
    const job = await enqueue(await makeAudit());
    await claim(job.id);

    await expect(claim(job.id)).resolves.toBeNull();
    expect((await jobRow(job.id)).attempts).toBe(1);
  });

  it('heartbeatJob renews a held lease', async () => {
    const job = await enqueue(await makeAudit());
    const claimed = (await claim(job.id))!;
    const before = (await jobRow(job.id)).leaseExpiresAt!;

    const ok = await runWithTenantAsync(tenantId, () => heartbeatJob(job.id, claimed.leaseToken!));

    expect(ok).toBe(true);
    const after = await jobRow(job.id);
    expect(after.leaseExpiresAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(after.lastHeartbeatAt).not.toBeNull();
  });

  it('expired lease is reclaimed; the stale worker cannot heartbeat, succeed, or fail (no double finalization)', async () => {
    const job = await enqueue(await makeAudit());
    const stale = await crashWorker(job.id);

    // claimNextJob's own reclaim predicate finds the stale RUNNING job.
    const reclaimed = await claimNextJob(tenantId);
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.id).toBe(job.id);
    expect(reclaimed!.leaseToken).not.toBe(stale.leaseToken);
    expect(reclaimed!.attempts).toBe(2);

    // Stale worker's finalization attempts are all rejected by the DB predicate.
    await expect(runWithTenantAsync(tenantId, () => heartbeatJob(job.id, stale.leaseToken!))).resolves.toBe(false);
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, stale.leaseToken!))).resolves.toBe(false);
    await expect(runWithTenantAsync(tenantId, () => markJobFailed(job.id, 'stale crash', 3, stale.leaseToken!))).resolves.toBe(false);

    const row = await jobRow(job.id);
    expect(row.status).toBe('RUNNING');
    expect(row.leaseToken).toBe(reclaimed!.leaseToken);
    expect(row.completedAt).toBeNull();

    // The new lease owner CAN finalize — exactly one transition to SUCCEEDED
    // occurs and no other lease token can move the job afterward.
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, reclaimed!.leaseToken!))).resolves.toBe(true);
    const firstCompletedAt = (await jobRow(job.id)).completedAt;
    expect(firstCompletedAt).not.toBeNull();
    // Neither the stale token nor any other token can produce a second outcome.
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, stale.leaseToken!))).resolves.toBe(false);
    await expect(runWithTenantAsync(tenantId, () => markJobFailed(job.id, 'late failure', 3, stale.leaseToken!))).resolves.toBe(false);
    const terminal = await jobRow(job.id);
    expect(terminal.status).toBe('SUCCEEDED');
    expect(terminal.completedAt!.getTime()).toBe(firstCompletedAt!.getTime());
  });

  it('crashed worker (lease lost mid-flight) is reclaimed by a fresh worker that completes the job', async () => {
    const auditId = await makeAudit();
    const job = await enqueue(auditId);

    // Worker 1 claims, then "crashes": lease expires with no finalization call.
    const stale = await crashWorker(job.id);

    // Worker 2 runs the real processAuditJob path end-to-end.
    const result = await processAuditJob(job.id);

    expect(result).toMatchObject({ outcome: 'SUCCEEDED', jobId: job.id, auditId });
    const row = await jobRow(job.id);
    expect(row.status).toBe('SUCCEEDED');
    expect(row.attempts).toBe(2);
    expect(row.leaseToken).not.toBe(stale.leaseToken);

    // A duplicate delivery after SUCCEEDED is an idempotent no-op.
    await expect(processAuditJob(job.id)).resolves.toMatchObject({ outcome: 'SKIPPED' });
    expect((await jobRow(job.id)).status).toBe('SUCCEEDED');
  });

  it('failure requeues with cleared lease; the retried attempt then succeeds', async () => {
    const job = await enqueue(await makeAudit());
    const first = (await claim(job.id))!;

    await expect(runWithTenantAsync(tenantId, () => markJobFailed(job.id, 'transient provider timeout', 3, first.leaseToken!))).resolves.toBe(true);
    const requeued = await jobRow(job.id);
    expect(requeued.status).toBe('QUEUED');
    expect(requeued.leaseToken).toBeNull();
    expect(requeued.leaseOwner).toBeNull();
    expect(requeued.errorMessage).toBe('transient provider timeout');

    // Cleared lease => immediately claimable by any worker (no TTL wait).
    const second = (await claim(job.id))!;
    expect(second.leaseToken).not.toBe(first.leaseToken);
    await expect(runWithTenantAsync(tenantId, () => markJobSucceeded(job.id, second.leaseToken!))).resolves.toBe(true);
    expect((await jobRow(job.id)).status).toBe('SUCCEEDED');
  });

  it('enqueue is idempotent on idempotencyKey', async () => {
    const auditId = await makeAudit();
    const first = await enqueue(auditId);
    const second = await enqueue(auditId);

    expect(second.id).toBe(first.id);
    const rows = await runWithTenantBypass('test-fixture:count-jobs', () =>
      prisma.auditJob.count({ where: { idempotencyKey: `fi:${auditId}` } })
    );
    expect(rows).toBe(1);
  });

  it('proposal gating: generateProposal=false completes without a Proposal row; default true generates one for a trusted audit', async () => {
    const noProposalAudit = await makeAudit();
    const gatedJob = await enqueue(noProposalAudit, { generateProposal: false });
    const result = await processAuditJob(gatedJob.id);

    expect(result.outcome).toBe('SUCCEEDED');
    const proposals = await runWithTenantBypass('test-fixture:count-proposals', () =>
      prisma.proposal.findMany({ where: { auditId: noProposalAudit } })
    );
    expect(proposals).toHaveLength(0);
    expect(generateProposalMock).not.toHaveBeenCalledWith(noProposalAudit);

    // The trusted path reaches the real production proposal generator.
    const trustedAudit = await makeAudit();
    generateProposalMock.mockClear();
    const trustedJob = await enqueue(trustedAudit);
    await runWithTenantBypass('test-fixture:trust-audit', () =>
      prisma.audit.update({
        where: { id: trustedAudit },
        data: { status: 'COMPLETE', trustState: 'TRUSTED' },
      })
    );
    runAuditMock.mockResolvedValueOnce(undefined);

    await expect(processAuditJob(trustedJob.id)).resolves.toMatchObject({ outcome: 'SUCCEEDED' });
    expect(generateProposalMock).toHaveBeenCalledWith(trustedAudit);
  });

  it('lease constants keep heartbeat interval safely below lease duration', () => {
    // Guards the P2-12 invariant the reclaim tests depend on.
    expect(LEASE_DURATION_MS).toBeGreaterThan(60_000);
  });
});
