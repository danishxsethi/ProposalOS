// @vitest-environment node
/**
 * tests/security/audit-job-lease-heartbeat.test.ts
 *
 * P2-12: AuditJob lease/heartbeat protection.
 *
 * Covers:
 *   1. Claim assigns a fresh leaseToken/leaseOwner/leaseExpiresAt atomically.
 *   2. heartbeatJob renews the lease when the caller still holds it.
 *   3. heartbeatJob rejects (returns false) once the lease no longer matches.
 *   4. markJobSucceeded rejects a stale/reclaimed lease instead of overwriting state.
 *   5. markJobFailed rejects a stale/reclaimed lease instead of overwriting state.
 *   6. claimNextJob's query reclaims RUNNING jobs whose lease has expired.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditJobFindFirst: vi.fn(),
  auditJobFindUnique: vi.fn(),
  auditJobUpdateMany: vi.fn(),
  sharedStoreSetIfNotExists: vi.fn(),
  sharedStoreDel: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditJob: {
      findFirst: mocks.auditJobFindFirst,
      findUnique: mocks.auditJobFindUnique,
      updateMany: mocks.auditJobUpdateMany,
    },
  },
}));

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn().mockResolvedValue({
    setIfNotExists: mocks.sharedStoreSetIfNotExists,
    del: mocks.sharedStoreDel,
  }),
}));

import {
  claimJob,
  claimNextJob,
  heartbeatJob,
  markJobFailed,
  markJobSucceeded,
} from '@/lib/queue/auditJobQueue';

describe('AuditJob lease/heartbeat (P2-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sharedStoreSetIfNotExists.mockResolvedValue(true);
    mocks.sharedStoreDel.mockResolvedValue(undefined);
  });

  it('claimJob atomically assigns a fresh lease and returns the job with a leaseToken', async () => {
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditJobFindUnique.mockResolvedValue({
      id: 'job-1',
      status: 'RUNNING',
      leaseOwner: 'worker-x',
      leaseToken: 'token-abc',
    });

    const job = await claimJob('job-1');

    expect(job).not.toBeNull();
    expect(job!.leaseToken).toBe('token-abc');
    // The claim update must set a fresh leaseToken/leaseOwner/leaseExpiresAt and
    // only match a QUEUED job or a RUNNING job whose lease has already expired.
    const call = mocks.auditJobUpdateMany.mock.calls[0][0];
    expect(call.where.id).toBe('job-1');
    expect(call.where.OR).toEqual([
      { status: 'QUEUED' },
      { status: 'RUNNING', leaseExpiresAt: { lt: expect.any(Date) } },
    ]);
    expect(call.data.leaseToken).toBeTruthy();
    expect(call.data.leaseOwner).toBeTruthy();
    expect(call.data.leaseExpiresAt).toBeInstanceOf(Date);
  });

  it('claimJob returns null when the DB-level atomic update matches nothing (lost the race)', async () => {
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 0 });

    const job = await claimJob('job-1');

    expect(job).toBeNull();
    expect(mocks.sharedStoreDel).toHaveBeenCalled(); // lock released on failed claim
  });

  it("claimNextJob's candidate query includes stale-lease RUNNING reclaim, not just QUEUED", async () => {
    mocks.auditJobFindFirst.mockResolvedValue(null);

    await claimNextJob('tenant-a');

    const call = mocks.auditJobFindFirst.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { status: 'QUEUED' },
      { status: 'RUNNING', leaseExpiresAt: { lt: expect.any(Date) } },
    ]);
  });

  it('heartbeatJob renews the lease when the token still matches', async () => {
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });

    const ok = await heartbeatJob('job-1', 'token-abc');

    expect(ok).toBe(true);
    expect(mocks.auditJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', leaseToken: 'token-abc' },
        data: expect.objectContaining({
          leaseExpiresAt: expect.any(Date),
          lastHeartbeatAt: expect.any(Date),
        }),
      })
    );
  });

  it('heartbeatJob returns false once the lease has been reclaimed by another worker', async () => {
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 0 });

    const ok = await heartbeatJob('job-1', 'stale-token');

    expect(ok).toBe(false);
  });

  it('markJobSucceeded rejects (no-op) a stale/reclaimed lease instead of overwriting state', async () => {
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 0 });

    const ok = await markJobSucceeded('job-1', 'stale-token');

    expect(ok).toBe(false);
    expect(mocks.auditJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1', leaseToken: 'stale-token' } })
    );
  });

  it('markJobSucceeded succeeds when the lease token still matches', async () => {
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });

    const ok = await markJobSucceeded('job-1', 'current-token');

    expect(ok).toBe(true);
  });

  it('markJobFailed rejects (no-op) a stale/reclaimed lease instead of requeuing/DEAD-ing under the new owner', async () => {
    mocks.auditJobFindUnique.mockResolvedValue({ attempts: 1 });
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 0 });

    const ok = await markJobFailed('job-1', 'boom', 3, 'stale-token');

    expect(ok).toBe(false);
  });

  it('markJobFailed clears the lease on requeue so a fresh claim is immediately possible', async () => {
    mocks.auditJobFindUnique.mockResolvedValue({ attempts: 1 });
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });

    await markJobFailed('job-1', 'boom', 3, 'current-token');

    expect(mocks.auditJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', leaseToken: 'current-token' },
        data: expect.objectContaining({
          status: 'QUEUED',
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      })
    );
  });

  it('markJobFailed moves to DEAD once attempts >= maxAttempts', async () => {
    mocks.auditJobFindUnique.mockResolvedValue({ attempts: 3 });
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });

    await markJobFailed('job-1', 'boom', 3, 'current-token');

    expect(mocks.auditJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DEAD' }) })
    );
  });
});
