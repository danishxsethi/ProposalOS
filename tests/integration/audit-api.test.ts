import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/audit/route';

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
vi.mock('@/lib/costs/costTracker', () => {
  return {
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
  };
});
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
    create: vi.fn(() => ({ id: 'audit-123', status: 'QUEUED' })),
    update: vi.fn(() => Promise.resolve({})),
  };
  const mockPrisma = {
    audit: mockAudit,
    $transaction: vi.fn(async (cb) => {
      return cb({ audit: mockAudit });
    }),
  };
  return { prisma: mockPrisma };
});
vi.mock('@/lib/billing/limits', () => ({
  checkAuditLimit: vi.fn(() => Promise.resolve({ allowed: true })),
  checkAndDecrementQuota: vi.fn(() => Promise.resolve()),
}));

describe('Integration: POST /api/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for missing URL (Zod Validation)', async () => {
    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ industry: 'software' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.message).toBe('Invalid input');
    expect(data.error.details[0].field).toBe('url');
  });

  it('should return 400 for invalid URL (Zod Validation)', async () => {
    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-url' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.message).toBe('Invalid input');
    expect(data.error.details[0].field).toBe('url');
  });

  it('should return 200 for valid request', async () => {
    // Mock success modules?
    // Actually since we mocked everything, it should just pass through
    const req = new Request('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com', industry: 'software' }),
    });

    const res = await POST(req);
    console.log('DEBUG: res type:', typeof res);
    console.log('DEBUG: res value:', res);
    if (!res) throw new Error('POST returned undefined');

    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(`API Error: ${res.status} - ${JSON.stringify(data, null, 2)}`);
    }
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.auditId).toBeDefined();
  });
});
