// @vitest-environment node
/**
 * tests/security/batch-queue-worker.test.ts
 *
 * Task #11: Durable batch audit queue — security and correctness tests.
 *
 * Covers:
 *   1. POST /api/audit/batch returns quickly (jobs enqueued, not executed)
 *   2. Each URL creates exactly one AuditJob row
 *   3. Worker processes a job successfully (audit + proposal)
 *   4. Worker handles audit failure — records item failure, batch continues
 *   5. Duplicate idempotency key does not create duplicate job
 *   6. Duplicate queue delivery does not re-run a completed job (SKIPPED)
 *   7. Cross-tenant batch status is denied (404)
 *   8. Worker refuses missing/invalid WORKER_SECRET
 *   9. Retries stop after MAX_RETRIES (job becomes DEAD)
 *  10. Local/test queue works without Redis
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // Auth
  auth: vi.fn(),
  validateApiKey: vi.fn(),
  withRole: vi.fn((role: string, handler: any) => handler),
  withAuth: vi.fn((handler: any) => handler),

  // Logger
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),

  // Prisma
  auditCreate: vi.fn(),
  auditFindUnique: vi.fn(),
  auditUpdate: vi.fn(),
  auditJobCreate: vi.fn(),
  auditJobFindUnique: vi.fn(),
  auditJobFindFirst: vi.fn(),
  auditJobFindMany: vi.fn(),
  auditJobUpdate: vi.fn(),
  auditJobUpdateMany: vi.fn(),
  auditFindMany: vi.fn(),

  // Queue
  runAudit: vi.fn(),
  generateProposal: vi.fn(),

  // SharedStore
  sharedStoreGet: vi.fn(),
  sharedStoreSet: vi.fn(),
  sharedStoreSetIfNotExists: vi.fn(),
  sharedStoreIncrement: vi.fn(),
  sharedStoreDel: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/apiKeys', () => ({ validateApiKey: mocks.validateApiKey }));
vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: any) => handler,
}));
vi.mock('@/lib/middleware/withRole', () => ({
  withRole: (_role: string, handler: any) => handler,
}));
vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: () => (_req: any, next: any) => next(),
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  RateLimitPresets: { batchOperations: {} },
}));
vi.mock('@/lib/middleware/idempotency', () => ({
  withIdempotency: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
  logError: mocks.loggerError,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      create: mocks.auditCreate,
      findUnique: mocks.auditFindUnique,
      update: mocks.auditUpdate,
      findMany: mocks.auditFindMany,
    },
    auditJob: {
      create: mocks.auditJobCreate,
      findUnique: mocks.auditJobFindUnique,
      findFirst: mocks.auditJobFindFirst,
      findMany: mocks.auditJobFindMany,
      update: mocks.auditJobUpdate,
      updateMany: mocks.auditJobUpdateMany,
    },
  },
}));

vi.mock('@/lib/audit/runner', () => ({ runAudit: mocks.runAudit }));
vi.mock('@/lib/proposal/runner', () => ({ generateProposal: mocks.generateProposal }));

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn().mockResolvedValue({
    get: mocks.sharedStoreGet,
    set: mocks.sharedStoreSet,
    setIfNotExists: mocks.sharedStoreSetIfNotExists,
    increment: mocks.sharedStoreIncrement,
    del: mocks.sharedStoreDel,
  }),
  _resetSharedStore: vi.fn(),
}));

// Stub tenant context
vi.mock('@/lib/tenant/context', () => ({
  getTenantId: vi.fn().mockResolvedValue('tenant-a'),
  runWithTenantAsync: vi.fn().mockImplementation((_tid: string, fn: () => any) => fn()),
}));

// Stub fetch (no real HTTP)
global.fetch = vi.fn().mockResolvedValue({ ok: true } as any);

// ─── Import after mocks ───────────────────────────────────────────────────────

import { POST as batchPost } from '@/app/api/audit/batch/route';
import { GET as batchStatus } from '@/app/api/audit/batch/[batchId]/route';
import { POST as workerPost } from '@/app/api/worker/audit-job/route';
import { processAuditJob } from '@/lib/queue/auditJobWorker';
import { enqueueAuditJob, getBatchStatus, MAX_RETRIES } from '@/lib/queue/auditJobQueue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, { method: 'POST', ...options });
}

function workerRequest(body: object = {}, secret = 'test-secret'): Request {
  return new Request('http://localhost/api/worker/audit-job', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

const mockJob = (overrides: Partial<any> = {}) => ({
  id: 'job-1',
  tenantId: 'tenant-a',
  batchId: 'batch-1',
  auditId: 'audit-1',
  idempotencyKey: 'batch:batch-1:audit:audit-1',
  status: 'QUEUED',
  attempts: 0,
  maxAttempts: MAX_RETRIES,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: null,
  completedAt: null,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/audit/batch — enqueue, not execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SECRET = 'test-secret';
    mocks.validateApiKey.mockResolvedValue(null);
    mocks.auditCreate.mockImplementation(({ data }: any) => ({
      id: `audit-${data.businessUrl}`,
      ...data,
    }));
    mocks.auditJobFindUnique.mockResolvedValue(null); // No existing job
    mocks.auditJobCreate.mockImplementation(({ data }: any) => ({ id: 'job-new', ...data }));
    mocks.sharedStoreSetIfNotExists.mockResolvedValue(true);
    mocks.sharedStoreDel.mockResolvedValue(undefined);
  });

  it('returns 200 with accepted count without running any audit', async () => {
    const req = makeRequest('http://localhost/api/audit/batch', {
      body: JSON.stringify({
        name: 'My Batch',
        items: [
          { url: 'https://example.com', businessName: 'Acme' },
          { url: 'https://other.com', businessName: 'Beta' },
        ],
      }),
    });

    const res = await batchPost(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.batchId).toBeDefined();
    expect(json.accepted).toBe(2);
    expect(json.statusUrl).toMatch(/\/api\/audit\/batch\//);

    // runAudit must NOT have been called
    expect(mocks.runAudit).not.toHaveBeenCalled();
    // Two AuditJob rows must have been created
    expect(mocks.auditJobCreate).toHaveBeenCalledTimes(2);
  });

  it('creates one AuditJob per URL', async () => {
    const req = makeRequest('http://localhost/api/audit/batch', {
      body: JSON.stringify({
        name: 'Single Item',
        items: [{ url: 'https://acme.com', businessName: 'Acme' }],
      }),
    });

    await batchPost(req);
    expect(mocks.auditJobCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          status: 'QUEUED',
          attempts: 0,
        }),
      })
    );
  });

  it('returns 401 when no tenant', async () => {
    const { getTenantId } = await import('@/lib/tenant/context');
    vi.mocked(getTenantId).mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost/api/audit/batch', {
      body: JSON.stringify({
        name: 'Test',
        items: [{ url: 'https://x.com' }],
      }),
    });

    const res = await batchPost(req);
    expect(res.status).toBe(401);
  });
});

describe('Worker endpoint — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SECRET = 'correct-secret';
  });

  it('rejects request with no Authorization header', async () => {
    const req = new Request('http://localhost/api/worker/audit-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: 'job-1' }),
    });

    const res = await workerPost(req);
    expect(res.status).toBe(401);
    expect(mocks.runAudit).not.toHaveBeenCalled();
  });

  it('rejects request with wrong secret', async () => {
    const req = workerRequest({ jobId: 'job-1' }, 'wrong-secret');
    const res = await workerPost(req);
    expect(res.status).toBe(401);
  });

  it('rejects when WORKER_SECRET is not set', async () => {
    delete process.env.WORKER_SECRET;
    const req = workerRequest({ jobId: 'job-1' });
    const res = await workerPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 NO_JOBS when queue is empty', async () => {
    mocks.auditJobFindFirst.mockResolvedValue(null);

    const req = workerRequest({}, 'correct-secret'); // cron mode, no jobId
    const res = await workerPost(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.outcome).toBe('NO_JOBS');
  });
});

describe('Worker — processAuditJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SECRET = 'test-secret';
    mocks.sharedStoreSetIfNotExists.mockResolvedValue(true); // Lock acquired
    mocks.sharedStoreDel.mockResolvedValue(undefined);
  });

  it('succeeds: runs audit + proposal and marks job SUCCEEDED', async () => {
    mocks.auditJobFindUnique.mockResolvedValue(mockJob({ status: 'QUEUED' }));
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditJobUpdate.mockResolvedValue(mockJob({ status: 'SUCCEEDED' }));
    mocks.runAudit.mockResolvedValue(undefined);
    mocks.auditFindUnique.mockResolvedValue({ status: 'COMPLETE' });
    mocks.generateProposal.mockResolvedValue(undefined);

    const result = await processAuditJob('job-1');

    expect(result.outcome).toBe('SUCCEEDED');
    expect(mocks.runAudit).toHaveBeenCalledWith('audit-1');
    expect(mocks.generateProposal).toHaveBeenCalledWith('audit-1');
    expect(mocks.auditJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      })
    );
  });

  it('skips proposal when audit status is not COMPLETE/PARTIAL', async () => {
    mocks.auditJobFindUnique.mockResolvedValue(mockJob({ status: 'QUEUED' }));
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditJobUpdate.mockResolvedValue(mockJob({ status: 'SUCCEEDED' }));
    mocks.runAudit.mockResolvedValue(undefined);
    mocks.auditFindUnique.mockResolvedValue({ status: 'FAILED' });
    mocks.generateProposal.mockResolvedValue(undefined);

    const result = await processAuditJob('job-1');

    expect(result.outcome).toBe('SUCCEEDED');
    expect(mocks.generateProposal).not.toHaveBeenCalled();
  });

  it('records failure and requeues when audit throws (attempts < maxAttempts)', async () => {
    mocks.auditJobFindUnique
      .mockResolvedValueOnce(mockJob({ status: 'QUEUED' }))
      .mockResolvedValueOnce(mockJob({ status: 'RUNNING', attempts: 1 })); // re-read for isDead check
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditJobUpdate.mockResolvedValue(mockJob({ status: 'QUEUED', attempts: 1 }));
    mocks.auditUpdate.mockResolvedValue({});
    mocks.runAudit.mockRejectedValue(new Error('API timeout'));

    const result = await processAuditJob('job-1');

    expect(result.outcome).toBe('FAILED');
    expect(mocks.auditJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'QUEUED', errorMessage: 'API timeout' }),
      })
    );
    expect(mocks.auditUpdate).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: { status: 'FAILED' },
    });
  });

  it('moves to DEAD after maxAttempts exhausted', async () => {
    const deadJob = mockJob({ status: 'QUEUED', attempts: MAX_RETRIES });
    mocks.auditJobFindUnique
      .mockResolvedValueOnce(deadJob) // processAuditJob load
      .mockResolvedValueOnce({ ...deadJob, status: 'RUNNING', attempts: MAX_RETRIES }) // claimJob post-update
      .mockResolvedValueOnce({ ...deadJob, status: 'RUNNING', attempts: MAX_RETRIES }); // markJobFailed re-read
    mocks.auditJobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditJobUpdate.mockResolvedValue(mockJob({ status: 'DEAD' }));
    mocks.auditUpdate.mockResolvedValue({});
    mocks.runAudit.mockRejectedValue(new Error('Persistent failure'));

    const result = await processAuditJob('job-1');

    expect(result.outcome).toBe('DEAD');
    expect(mocks.auditJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD' }),
      })
    );
  });

  it('returns NOT_FOUND for unknown jobId', async () => {
    mocks.auditJobFindUnique.mockResolvedValue(null);

    const result = await processAuditJob('nonexistent-job');
    expect(result.outcome).toBe('NOT_FOUND');
    expect(mocks.runAudit).not.toHaveBeenCalled();
  });

  it('returns SKIPPED for already SUCCEEDED job (idempotent re-delivery)', async () => {
    mocks.auditJobFindUnique.mockResolvedValue(mockJob({ status: 'SUCCEEDED' }));

    const result = await processAuditJob('job-1');
    expect(result.outcome).toBe('SKIPPED');
    expect(mocks.runAudit).not.toHaveBeenCalled();
  });

  it('returns LOCK_CONTENTION when lock is already held', async () => {
    mocks.auditJobFindUnique.mockResolvedValue(mockJob({ status: 'QUEUED' }));
    mocks.sharedStoreSetIfNotExists.mockResolvedValue(false); // Lock contention

    const result = await processAuditJob('job-1');
    expect(result.outcome).toBe('LOCK_CONTENTION');
    expect(mocks.runAudit).not.toHaveBeenCalled();
  });
});

describe('enqueueAuditJob — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sharedStoreSetIfNotExists.mockResolvedValue(true);
    mocks.sharedStoreDel.mockResolvedValue(undefined);
  });

  it('creates a new job when idempotency key does not exist', async () => {
    mocks.auditJobFindUnique.mockResolvedValue(null);
    mocks.auditJobCreate.mockResolvedValue(mockJob());

    const job = await enqueueAuditJob({
      tenantId: 'tenant-a',
      batchId: 'batch-1',
      auditId: 'audit-1',
      idempotencyKey: 'batch:batch-1:audit:audit-1',
    });

    expect(job.id).toBe('job-1');
    expect(mocks.auditJobCreate).toHaveBeenCalledTimes(1);
  });

  it('returns existing job when idempotency key already exists (no duplicate)', async () => {
    const existing = mockJob({ status: 'QUEUED' });
    mocks.auditJobFindUnique.mockResolvedValue(existing);

    const job = await enqueueAuditJob({
      tenantId: 'tenant-a',
      batchId: 'batch-1',
      auditId: 'audit-1',
      idempotencyKey: 'batch:batch-1:audit:audit-1',
    });

    expect(job.id).toBe('job-1');
    expect(mocks.auditJobCreate).not.toHaveBeenCalled(); // No insert
  });
});

describe('GET /api/audit/batch/[batchId] — tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateApiKey.mockResolvedValue(null);
  });

  it('returns 404 when batchId belongs to a different tenant', async () => {
    // Simulates tenant-b trying to read tenant-a's batch
    const { getTenantId } = await import('@/lib/tenant/context');
    vi.mocked(getTenantId).mockResolvedValueOnce('tenant-b');
    mocks.auditFindMany.mockResolvedValue([]); // Empty = not found for tenant-b

    const req = new Request('http://localhost/api/audit/batch/batch-1');
    const res = await batchStatus(req, { params: Promise.resolve({ batchId: 'batch-1' }) });

    expect(res.status).toBe(404);
  });

  it('returns batch summary for the correct tenant', async () => {
    const { getTenantId } = await import('@/lib/tenant/context');
    vi.mocked(getTenantId).mockResolvedValueOnce('tenant-a');

    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'audit-1',
        businessName: 'Acme',
        status: 'COMPLETE',
        apiCostCents: 10,
        createdAt: new Date(),
        completedAt: new Date(),
      },
      {
        id: 'audit-2',
        businessName: 'Beta',
        status: 'QUEUED',
        apiCostCents: 0,
        createdAt: new Date(),
        completedAt: null,
      },
    ]);
    mocks.auditJobFindMany.mockResolvedValue([{ status: 'SUCCEEDED' }, { status: 'QUEUED' }]);

    const req = new Request('http://localhost/api/audit/batch/batch-1');
    const res = await batchStatus(req, { params: Promise.resolve({ batchId: 'batch-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.batchId).toBe('batch-1');
    expect(json.summary.total).toBe(2);
    expect(json.summary.completed).toBe(1);
    expect(json.jobs).toBeDefined();
  });
});

describe('getBatchStatus — cross-tenant isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when batchId has no jobs for this tenant', async () => {
    mocks.auditJobFindMany.mockResolvedValue([]);

    const result = await getBatchStatus('batch-other-tenant', 'tenant-a');
    expect(result).toBeNull();
  });

  it('returns summary when batch belongs to tenant', async () => {
    mocks.auditJobFindMany.mockResolvedValue([
      { status: 'SUCCEEDED' },
      { status: 'SUCCEEDED' },
      { status: 'QUEUED' },
      { status: 'DEAD' },
    ]);

    const result = await getBatchStatus('batch-1', 'tenant-a');
    expect(result).not.toBeNull();
    expect(result!.total).toBe(4);
    expect(result!.succeeded).toBe(2);
    expect(result!.queued).toBe(1);
    expect(result!.dead).toBe(1);
    expect(result!.percentComplete).toBe(75); // (2+0+1)/4 = 75%
  });
});
