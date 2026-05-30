// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  auditUpdate: vi.fn(),
  auditJobFindMany: vi.fn(),
  auditJobUpdate: vi.fn(),
  runWithTenantBypass: vi.fn(),
  recordAuditTrailEvent: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findMany: mocks.auditFindMany,
      update: mocks.auditUpdate,
    },
    auditJob: {
      findMany: mocks.auditJobFindMany,
      update: mocks.auditJobUpdate,
    },
  },
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: mocks.runWithTenantBypass,
}));

vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: mocks.recordAuditTrailEvent,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}));

describe('Stale Audit and Job Cleanup Maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate runWithTenantBypass executing the inner callback immediately
    mocks.runWithTenantBypass.mockImplementation(async (reason, fn) => {
      return fn();
    });
  });

  it('correctly identifies stale audits and jobs and processes updates when apply is true', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'cleanup-stale-audits.ts', '--apply'];

    const now = new Date();
    const olderThan30Mins = new Date(now.getTime() - 35 * 60 * 1000);

    const staleAuditsMock = [
      {
        id: 'stale-audit-1',
        businessName: 'Stale Business 1',
        startedAt: olderThan30Mins,
        tenantId: 'tenant-1',
      },
    ];

    const staleJobsMock = [
      {
        id: 'stale-job-1',
        auditId: 'stale-audit-1',
        status: 'QUEUED',
        createdAt: olderThan30Mins,
        tenantId: 'tenant-1',
      },
    ];

    mocks.auditFindMany.mockResolvedValue(staleAuditsMock);
    mocks.auditJobFindMany.mockResolvedValue(staleJobsMock);

    // Reset module cache to re-evaluate CLI args
    vi.resetModules();
    await import('../../scripts/maintenance/cleanup-stale-audits');

    // Verify it searched for stale audits
    expect(mocks.auditFindMany).toHaveBeenCalledWith({
      where: {
        status: 'RUNNING',
        startedAt: {
          lt: expect.any(Date),
        },
      },
      select: {
        id: true,
        businessName: true,
        startedAt: true,
        tenantId: true,
      },
    });

    // Verify it searched for stale audit jobs
    expect(mocks.auditJobFindMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['QUEUED', 'RUNNING'],
        },
        createdAt: {
          lt: expect.any(Date),
        },
      },
      select: {
        id: true,
        auditId: true,
        status: true,
        createdAt: true,
        tenantId: true,
      },
    });

    // Verify database updates were performed
    expect(mocks.auditUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.auditUpdate).toHaveBeenCalledWith({
      where: { id: 'stale-audit-1' },
      data: {
        status: 'FAILED',
        completedAt: expect.any(Date),
        modulesFailed: JSON.stringify(['all_modules_timeout']),
      },
    });

    expect(mocks.auditJobUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.auditJobUpdate).toHaveBeenCalledWith({
      where: { id: 'stale-job-1' },
      data: {
        status: 'FAILED',
        errorMessage: 'Job terminated due to maintenance cleanup (TTL exceeded).',
        completedAt: expect.any(Date),
      },
    });

    // Verify audit trail event registration
    expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'audit.failed',
        tenantId: 'tenant-1',
        auditId: 'stale-audit-1',
      })
    );

    expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'cleanup.completed',
        tenantId: null,
      })
    );

    process.argv = originalArgv;
  });

  it('runs in dry-run mode by default and does not apply database writes', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'cleanup-stale-audits.ts'];

    const now = new Date();
    const olderThan30Mins = new Date(now.getTime() - 35 * 60 * 1000);

    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'stale-audit-1',
        businessName: 'Stale Business 1',
        startedAt: olderThan30Mins,
        tenantId: 'tenant-1',
      },
    ]);
    mocks.auditJobFindMany.mockResolvedValue([
      {
        id: 'stale-job-1',
        auditId: 'stale-audit-1',
        status: 'QUEUED',
        createdAt: olderThan30Mins,
        tenantId: 'tenant-1',
      },
    ]);

    vi.resetModules();
    await import('../../scripts/maintenance/cleanup-stale-audits');

    // In dry-run, we should still query the DB to show what would be updated...
    expect(mocks.auditFindMany).toHaveBeenCalled();
    expect(mocks.auditJobFindMany).toHaveBeenCalled();

    // ...but we must NOT write back any updates or register events!
    expect(mocks.auditUpdate).not.toHaveBeenCalled();
    expect(mocks.auditJobUpdate).not.toHaveBeenCalled();
    expect(mocks.recordAuditTrailEvent).not.toHaveBeenCalled();

    process.argv = originalArgv;
  });
});
