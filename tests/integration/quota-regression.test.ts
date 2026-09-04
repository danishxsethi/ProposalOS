import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/audit/route';
import { checkAndDecrementQuota, QuotaExceededError } from '@/lib/billing/limits';
import { isInternalOpsRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';

// Mock dependencies
vi.mock('@/lib/modules/website', () => ({ runWebsiteModule: vi.fn() }));
vi.mock('@/lib/modules/citations', () => ({ runCitationsModule: vi.fn() }));
vi.mock('@/lib/modules/competitor', () => ({ runCompetitorModule: vi.fn() }));
vi.mock('@/lib/modules/seoDeep', () => ({ runSeoDeepModule: vi.fn() }));
vi.mock('@/lib/modules/reputation', () => ({ runReputationModule: vi.fn() }));
vi.mock('@/lib/modules/social', () => ({ runSocialModule: vi.fn() }));
vi.mock('@/lib/modules/findingGenerator', () => ({
  generateWebsiteFindings: vi.fn(() => []),
  generateGBPFindings: vi.fn(() => []),
  generateCompetitorFindings: vi.fn(() => []),
  generateReputationFindings: vi.fn(() => []),
  generateSocialFindings: vi.fn(() => []),
}));
vi.mock('@/lib/utils/urlExtractor', () => ({
  extractBusinessFromUrl: vi.fn(() => ({ name: 'Test Business', url: 'https://test.com' })),
}));
vi.mock('@/lib/proposal/pricing', () => ({ detectIndustryFromCategory: vi.fn(() => 'General') }));
vi.mock('@/lib/costs/costTracker', () => ({
  CostTracker: class {
    getTotalCents() {
      return 50;
    }
    getReport() {
      return {};
    }
    complete() {}
    addApiCall() {}
    addLlmCall() {}
  },
  checkDailyAuditLimit: vi.fn(() => ({
    allowed: true,
    limit: 100,
    todayCount: 5,
    remaining: 95,
  })),
  incrementAuditCount: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  logError: vi.fn(),
}));
vi.mock('@/lib/metrics', () => ({
  Metrics: { proposalGenerated: vi.fn(), auditFailed: vi.fn(), increment: vi.fn() },
}));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn(() => ({})) }));
vi.mock('langsmith', () => ({
  RunTree: vi.fn().mockImplementation(() => ({
    createChild: vi.fn(() => ({ end: vi.fn() })),
    end: vi.fn(),
    save: vi.fn(),
  })),
}));

// Mock Auth & Tenant
vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: any) => handler,
  isInternalOpsRequest: vi.fn(() => false),
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: {
      id: 'user-123',
      email: 'member@test.com',
      role: 'agency_member',
    },
  })),
  getServerSession: vi.fn(async () => ({
    user: {
      id: 'user-123',
      email: 'member@test.com',
      role: 'agency_member',
    },
  })),
}));
vi.mock('@/lib/tenant/context', () => ({
  getTenantId: vi.fn(() => 'tenant-123'),
  runWithTenantAsync: vi.fn(async (_tenantId: string, fn: () => unknown) => await fn()),
}));
vi.mock('@/lib/prisma', () => {
  const mockAudit = {
    create: vi.fn(() => Promise.resolve({ id: 'audit-123', status: 'QUEUED' })),
    update: vi.fn(() => Promise.resolve({})),
    count: vi.fn(() => Promise.resolve(0)),
  };
  const mockTenant = {
    findUnique: vi.fn(() =>
      Promise.resolve({ id: 'tenant-123', planTier: 'free', status: 'active' })
    ),
  };
  const mockSubscription = {
    findFirst: vi.fn(() => Promise.resolve(null)),
  };
  const mockPrisma = {
    audit: mockAudit,
    tenant: mockTenant,
    subscription: mockSubscription,
    $transaction: vi.fn(async (cb) => {
      return cb(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});
vi.mock('@/lib/billing/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/limits')>();
  return {
    ...actual,
    checkAuditLimit: vi.fn(() => Promise.resolve({ allowed: true })),
    checkAndDecrementQuota: vi.fn(actual.checkAndDecrementQuota),
  };
});
vi.mock('@/lib/audit/dispatch', () => ({
  dispatchAuditExecution: vi.fn(() => Promise.resolve({ id: 'job-123', status: 'QUEUED' })),
}));

describe('Quota Path Regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('regression (a): quota check completes without failing under slow DB simulation', async () => {
    // Simulate slow DB response without exceeding reasonable timeouts
    vi.mocked(prisma.tenant.findUnique).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: 'tenant-123', planTier: 'free', status: 'active' } as any;
    });

    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com', industry: 'software' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(checkAndDecrementQuota).toHaveBeenCalled();
  });

  it('regression (b): valid ops key short-circuits and never touches quota queries/transaction', async () => {
    vi.mocked(isInternalOpsRequest).mockReturnValueOnce(true);

    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      headers: {
        'x-internal-ops-key': 'valid-ops-key',
      },
      body: JSON.stringify({ url: 'https://example.com', industry: 'software' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // checkAndDecrementQuota was completely skipped by the ops bypass check in POST /api/audit
    expect(checkAndDecrementQuota).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('regression (c): a forced Prisma error in the quota path returns 500 with real message, not 429', async () => {
    vi.mocked(checkAndDecrementQuota).mockRejectedValueOnce(
      new Error('Can\'t reach database server at cloud-sql:5432')
    );

    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com', industry: 'software' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.error.message).toContain('Can\'t reach database server');
    expect(data.error.code).not.toBe('QUOTA_EXCEEDED');
  });

  it('genuine quota exhaustion returns 429 QUOTA_EXCEEDED', async () => {
    vi.mocked(checkAndDecrementQuota).mockRejectedValueOnce(
      new QuotaExceededError('Quota exceeded: Requesting 1 audits, but only 0 remaining of your 3 audit monthly limit.')
    );

    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com', industry: 'software' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error.code).toBe('QUOTA_EXCEEDED');
    expect(data.error.message).toContain('Quota exceeded');
  });
});
