// @vitest-environment node
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cron/cleanup-stale-jobs/route';

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  auditUpdate: vi.fn(),
  auditJobFindMany: vi.fn(),
  auditJobUpdate: vi.fn(),
  runWithTenantBypass: vi.fn(),
  recordAuditTrailEvent: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  verifyCronAuth: vi.fn(),
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
    error: mocks.loggerError,
  },
}));

vi.mock('@/lib/middleware/cronAuth', () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));

describe('Cron Cleanup Stale Jobs Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior for runWithTenantBypass to invoke the callback
    mocks.runWithTenantBypass.mockImplementation(async (reason, fn) => {
      return fn();
    });
    // Default cron auth success (returns null, which means no auth error)
    mocks.verifyCronAuth.mockResolvedValue(null);
  });

  it('rejects unauthorized requests based on verifyCronAuth', async () => {
    const errorResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mocks.verifyCronAuth.mockResolvedValue(errorResponse);

    const request = new Request('http://localhost/api/cron/cleanup-stale-jobs');
    const response = await GET(request);

    expect(response).toBe(errorResponse);
    expect(mocks.runWithTenantBypass).not.toHaveBeenCalled();
  });

  it('identifies and updates stale audits and jobs older than 120 minutes', async () => {
    const now = new Date();
    const olderThan2Hours = new Date(now.getTime() - 130 * 60 * 1000); // 130 mins ago

    const staleAuditsMock = [
      {
        id: 'stale-audit-120',
        businessName: 'Stale Hospital',
        startedAt: olderThan2Hours,
        tenantId: 'tenant-healthcare',
      },
    ];

    const staleJobsMock = [
      {
        id: 'stale-job-120',
        auditId: 'stale-audit-120',
        status: 'RUNNING',
        createdAt: olderThan2Hours,
        tenantId: 'tenant-healthcare',
      },
    ];

    mocks.auditFindMany.mockResolvedValue(staleAuditsMock);
    mocks.auditJobFindMany.mockResolvedValue(staleJobsMock);

    const request = new Request('http://localhost/api/cron/cleanup-stale-jobs');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.auditsCleanedUp).toBe(1);
    expect(json.jobsCleanedUp).toBe(1);
    expect(json.ttlMinutes).toBe(120);

    // Verify correct queries were run
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

    // Verify updates were executed
    expect(mocks.auditUpdate).toHaveBeenCalledWith({
      where: { id: 'stale-audit-120' },
      data: {
        status: 'FAILED',
        completedAt: expect.any(Date),
        modulesFailed: JSON.stringify(['all_modules_timeout']),
      },
    });

    expect(mocks.auditJobUpdate).toHaveBeenCalledWith({
      where: { id: 'stale-job-120' },
      data: {
        status: 'FAILED',
        errorMessage: 'Job terminated due to maintenance cleanup (TTL exceeded).',
        completedAt: expect.any(Date),
      },
    });

    // Verify audit trail events
    expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'audit.failed',
        tenantId: 'tenant-healthcare',
        auditId: 'stale-audit-120',
      })
    );

    expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'cleanup.completed',
        tenantId: null,
      })
    );
  });
});
