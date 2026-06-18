// @vitest-environment node
/**
 * tests/security/widget-graceful-degradation.test.ts
 *
 * Tests that the widget quick-audit route degrades gracefully when
 * crawlWebsite or runGBPModule fail, rather than returning a 500.
 *
 * The .catch() fallbacks on Promise.all ensure:
 *   A. crawlWebsite failure → score reduced but response is 200 with valid shape
 *   B. runGBPModule failure → score reduced but response is 200 with valid shape
 *   C. Both fail → still 200 with minimum score and valid shape
 *   D. Neither fails → full score applied
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  runWithTenantAsync: vi.fn(),
  runWithTenantBypass: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  crawlWebsite: vi.fn(),
  runGBPModule: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: mocks.runWithTenantAsync,
  runWithTenantBypass: mocks.runWithTenantBypass,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: mocks.tenantFindUnique,
      findFirst: mocks.tenantFindFirst,
    },
    audit: {
      create: mocks.auditCreate,
    },
  },
}));

vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: () => (_req: Request, handler: () => Promise<Response>) => handler(),
  RateLimitPresets: { publicApi: {} },
}));

vi.mock('@/lib/middleware/idempotency', () => ({
  withIdempotency: (handler: any) => handler,
}));

vi.mock('@/lib/modules/websiteCrawler', () => ({ crawlWebsite: mocks.crawlWebsite }));
vi.mock('@/lib/modules/gbp', () => ({ runGBPModule: mocks.runGBPModule }));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_TENANT = {
  id: 'tenant-abc',
  domain: 'agency.com',
  name: 'Agency Co',
  brandingConfig: { allowedWidgetOrigins: ['https://agency.com'] },
  status: 'active',
  planTier: 'pro',
};

function makePostRequest(opts: { body: Record<string, unknown>; origin?: string }): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.origin) headers['Origin'] = opts.origin;
  return new Request('http://localhost/api/widget/quick-audit', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
  });
}

function setupPassthroughTenantHelpers() {
  mocks.runWithTenantAsync.mockImplementation(
    async (_tenantId: string, fn: () => Promise<unknown>) => fn()
  );
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupPassthroughTenantHelpers();
  mocks.tenantFindFirst.mockResolvedValue(MOCK_TENANT);
  mocks.tenantFindUnique.mockResolvedValue(MOCK_TENANT);
  mocks.auditCreate.mockResolvedValue({
    id: 'audit-123',
    businessName: 'Test Biz',
    businessUrl: 'https://example.com',
    status: 'QUEUED',
  });
});

afterEach(() => {
  vi.resetModules();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/widget/quick-audit — graceful degradation', () => {
  const validBody = {
    url: 'https://example.com',
    email: 'lead@example.com',
    tenantDomain: 'agency.com',
  };

  it('A. crawlWebsite throws → 200 with reduced score (no +10 for crawl)', async () => {
    mocks.crawlWebsite.mockRejectedValue(new Error('Network timeout'));
    mocks.runGBPModule.mockResolvedValue({ status: 'success', data: {} });

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('auditId');
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('grade');
    // crawlRes is null → no +10; gbp success → +20; base 50+20=70
    expect(body.score).toBe(70);
  });

  it('B. runGBPModule throws → 200 with reduced score (gbp failed → -10)', async () => {
    mocks.crawlWebsite.mockResolvedValue({ pages: ['page1'] });
    mocks.runGBPModule.mockRejectedValue(new Error('GBP API down'));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('auditId');
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('grade');
    // crawlRes truthy → +10; gbp catch → {status:'failed'} → -10; base 50+10-10=50
    expect(body.score).toBe(50);
  });

  it('C. both fail → 200 with minimum degraded score', async () => {
    mocks.crawlWebsite.mockRejectedValue(new Error('Network error'));
    mocks.runGBPModule.mockRejectedValue(new Error('Service unavailable'));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('auditId');
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('grade');
    // crawlRes null → no bonus; gbp {status:'failed'} → -10; base 50-10=40
    expect(body.score).toBe(40);
    expect(body.grade).toBe('D');
  });

  it('D. both succeed → 200 with full score applied', async () => {
    mocks.crawlWebsite.mockResolvedValue({ pages: ['page1'] });
    mocks.runGBPModule.mockResolvedValue({ status: 'success', data: {} });

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('auditId');
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('grade');
    // crawlRes truthy → +10; gbp success (not 'failed') → +20; base 50+10+20=80, capped at 90
    expect(body.score).toBe(80);
    expect(body.grade).toBe('C');
  });

  it('response shape is always valid regardless of module failures', async () => {
    mocks.crawlWebsite.mockRejectedValue(new Error('fail'));
    mocks.runGBPModule.mockRejectedValue(new Error('fail'));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Required response fields always present
    expect(body).toHaveProperty('auditId');
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('grade');
    expect(body).toHaveProperty('topIssue');
    expect(body).toHaveProperty('redirectUrl');
    // Score is a number between 0-100
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
  });
});
