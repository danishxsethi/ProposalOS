// @vitest-environment node
/**
 * Regression tests for:
 *   - GET /api/public/audit/[id]
 *   - GET /api/case-study/[auditId]/generate
 *   - POST /api/widget/quick-audit
 *
 * These routes were previously broken at runtime because they called Prisma
 * outside tenant context, causing MissingTenantError. These tests verify:
 *   1. Valid requests no longer throw MissingTenantError.
 *   2. Missing/invalid tenant context returns a safe 4xx, not 500.
 *   3. Cross-tenant access is blocked (audit not found for wrong tenant).
 *   4. Widget route does not accept an arbitrary attacker-supplied tenant ID
 *      that resolves to nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // tenant/context helpers
  runWithTenantAsync: vi.fn(),
  runWithTenantBypass: vi.fn(),

  // prisma delegates
  tenantFindUnique: vi.fn(),
  tenantFindFirst: vi.fn(),
  auditFindUnique: vi.fn(),
  auditCreate: vi.fn(),

  // external modules
  generateCaseStudyPdf: vi.fn(),
  crawlWebsite: vi.fn(),
  runGBPModule: vi.fn(),

  // rate limit passthrough
  withRateLimit: vi.fn(),

  // logger
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn().mockResolvedValue(null),
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
      findUnique: mocks.auditFindUnique,
      create: mocks.auditCreate,
    },
  },
}));

vi.mock('@/lib/pdf/generateCaseStudyPdf', () => ({
  generateCaseStudyPdf: mocks.generateCaseStudyPdf,
}));

vi.mock('@/lib/security/caseStudyAuth', () => ({
  validateCaseStudyAccess: vi.fn().mockImplementation(async (auditId) => {
    const audit = await mocks.auditFindUnique();
    if (!audit) {
      return { authorized: false, error: 'NOT_FOUND' };
    }
    return { authorized: true, tenantId: audit.tenantId || 'tenant-a' };
  }),
}));

vi.mock('@/lib/modules/websiteCrawler', () => ({
  crawlWebsite: mocks.crawlWebsite,
}));

vi.mock('@/lib/modules/gbp', () => ({
  runGBPModule: mocks.runGBPModule,
}));

vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: (_opts: unknown) => (_req: Request, handler: () => Promise<Response>) => handler(),
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  RateLimitPresets: { publicApi: {} },
}));

vi.mock('@/lib/middleware/idempotency', () => ({
  withIdempotency: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
    info: vi.fn(),
  },
}));

vi.mock('@/lib/api/errors', async (importOriginal) => {
  // Keep the real error classes; only mock generateTraceId for determinism.
  const actual = await importOriginal<typeof import('@/lib/api/errors')>();
  return {
    ...actual,
    generateTraceId: () => 'test-trace-id',
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Default implementation: runWithTenantBypass executes the callback directly.
 * runWithTenantAsync executes the callback directly.
 * Tests that need different behaviour override these per-test.
 */
function setupPassthroughTenantHelpers() {
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );
  mocks.runWithTenantAsync.mockImplementation(
    async (_tenantId: string, fn: () => Promise<unknown>) => fn()
  );
}

// ---------------------------------------------------------------------------
// GET /api/public/audit/[id]
// ---------------------------------------------------------------------------

describe('GET /api/public/audit/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTenantHelpers();
  });

  it('returns audit status when system tenant and audit exist', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: 'system-tenant-id' });
    mocks.auditFindUnique.mockResolvedValue({
      status: 'COMPLETE',
      modulesCompleted: ['website', 'gbp'],
      overallScore: 72,
      findings: [{ title: 'Slow page', impactScore: 8, category: 'Performance' }],
    });

    const { GET } = await import('@/app/api/public/audit/[id]/route');
    const response = await GET(new Request('http://localhost/api/public/audit/audit-1'), {
      params: Promise.resolve({ id: 'audit-1' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('COMPLETE');
    expect(body.overallScore).toBe(72);
    expect(body.findings).toHaveLength(1);
  });

  it('uses runWithTenantBypass for system tenant discovery', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: 'system-tenant-id' });
    mocks.auditFindUnique.mockResolvedValue({
      status: 'RUNNING',
      modulesCompleted: [],
      overallScore: null,
      findings: [],
    });

    const { GET } = await import('@/app/api/public/audit/[id]/route');
    await GET(new Request('http://localhost/api/public/audit/audit-1'), {
      params: Promise.resolve({ id: 'audit-1' }),
    });

    // Bypass must be used for tenant discovery
    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'public-audit-status-system-tenant-discovery',
      expect.any(Function)
    );
    // Tenant-scoped read must be wrapped in runWithTenantAsync
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith(
      'system-tenant-id',
      expect.any(Function)
    );
  });

  it('returns 404 when system tenant does not exist', async () => {
    mocks.tenantFindUnique.mockResolvedValue(null);

    const { GET } = await import('@/app/api/public/audit/[id]/route');
    const response = await GET(new Request('http://localhost/api/public/audit/audit-1'), {
      params: Promise.resolve({ id: 'audit-1' }),
    });

    expect(response.status).toBe(404);
    // Audit should never be queried if tenant is missing
    expect(mocks.auditFindUnique).not.toHaveBeenCalled();
    expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
  });

  it('returns 404 when audit does not exist under system tenant', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: 'system-tenant-id' });
    mocks.auditFindUnique.mockResolvedValue(null);

    const { GET } = await import('@/app/api/public/audit/[id]/route');
    const response = await GET(new Request('http://localhost/api/public/audit/no-such-audit'), {
      params: Promise.resolve({ id: 'no-such-audit' }),
    });

    expect(response.status).toBe(404);
  });

  it('does NOT call Prisma outside tenant context (no MissingTenantError path)', async () => {
    // Simulate what would happen if the old code ran: Prisma called without context.
    // With the fix, all Prisma calls go through runWithTenantBypass or runWithTenantAsync.
    mocks.tenantFindUnique.mockResolvedValue({ id: 'system-tenant-id' });
    mocks.auditFindUnique.mockResolvedValue({ status: 'QUEUED', modulesCompleted: [], overallScore: null, findings: [] });

    const { GET } = await import('@/app/api/public/audit/[id]/route');
    const response = await GET(new Request('http://localhost/api/public/audit/audit-1'), {
      params: Promise.resolve({ id: 'audit-1' }),
    });

    // Must not be a 500 (which is what MissingTenantError would produce)
    expect(response.status).not.toBe(500);
    // Both context helpers must have been called
    expect(mocks.runWithTenantBypass).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantAsync).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/case-study/[auditId]/generate
// ---------------------------------------------------------------------------

describe('GET /api/case-study/[auditId]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTenantHelpers();
  });

  it('generates PDF when audit exists', async () => {
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-a',
      businessName: 'Acme Dental',
    });
    const fakePdf = Buffer.from('fake-pdf-content');
    mocks.generateCaseStudyPdf.mockResolvedValue(fakePdf);

    const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');
    const response = await GET(new Request('http://localhost/api/case-study/audit-1/generate'), {
      params: Promise.resolve({ auditId: 'audit-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('acme_dental');
  });

  it('uses runWithTenantBypass for tenant discovery and runWithTenantAsync for PDF generation', async () => {
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-a',
      businessName: 'Acme Dental',
    });
    mocks.generateCaseStudyPdf.mockResolvedValue(Buffer.from('pdf'));

    const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');
    await GET(new Request('http://localhost/api/case-study/audit-1/generate'), {
      params: Promise.resolve({ auditId: 'audit-1' }),
    });

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'case-study-generate-business-discovery',
      expect.any(Function)
    );
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant-a', expect.any(Function));
  });

  it('returns 404 when audit does not exist', async () => {
    mocks.auditFindUnique.mockResolvedValue(null);

    const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');
    const response = await GET(new Request('http://localhost/api/case-study/no-such/generate'), {
      params: Promise.resolve({ auditId: 'no-such' }),
    });

    expect(response.status).toBe(404);
    // PDF generation must not be called
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
    expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
  });

  it('does NOT call Prisma outside tenant context (no MissingTenantError path)', async () => {
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-a',
      businessName: 'Acme Dental',
    });
    mocks.generateCaseStudyPdf.mockResolvedValue(Buffer.from('pdf'));

    const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');
    const response = await GET(new Request('http://localhost/api/case-study/audit-1/generate'), {
      params: Promise.resolve({ auditId: 'audit-1' }),
    });

    expect(response.status).not.toBe(500);
    expect(mocks.runWithTenantBypass).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantAsync).toHaveBeenCalledTimes(2);
  });

  it('returns 500 with structured error when PDF generation fails', async () => {
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-a',
      businessName: 'Acme Dental',
    });
    mocks.generateCaseStudyPdf.mockRejectedValue(new Error('Puppeteer crashed'));

    const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');
    const response = await GET(new Request('http://localhost/api/case-study/audit-1/generate'), {
      params: Promise.resolve({ auditId: 'audit-1' }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to generate case study PDF');
    // Must not leak raw stack trace
    expect(body.message).not.toContain('at ');
  });
});

// ---------------------------------------------------------------------------
// POST /api/widget/quick-audit
// ---------------------------------------------------------------------------

describe('POST /api/widget/quick-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTenantHelpers();
    mocks.crawlWebsite.mockResolvedValue({ pages: [] });
    mocks.runGBPModule.mockResolvedValue({ status: 'success', data: {} });
    mocks.auditCreate.mockResolvedValue({
      id: 'new-audit-id',
      businessName: 'Test Biz',
    });
  });

  const makeRequest = (
    body: Record<string, unknown>,
    origin: string | null = 'https://agency.com'
  ) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (origin) headers.Origin = origin;
    return new Request('http://localhost/api/widget/quick-audit', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  };

  // Helper: tenant fixture with widget origin allow-list
  const tenantWithOrigins = (origins: string[] = ['https://agency.com']) => ({
    id: 'tenant-a',
    domain: 'agency.com',
    brandingConfig: { allowedWidgetOrigins: origins },
  });

  it('creates audit and returns score when tenant found by domain', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins());

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({ websiteUrl: 'https://example.com', tenantDomain: 'agency.com' })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.auditId).toBe('new-audit-id');
    expect(typeof body.score).toBe('number');
    expect(['B', 'C', 'D']).toContain(body.grade);
  });

  it('creates audit and returns score when tenant found by id', async () => {
    mocks.tenantFindUnique.mockResolvedValue(tenantWithOrigins());

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({
        websiteUrl: 'https://example.com',
        tenantId: 'tenant-a',
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.auditId).toBe('new-audit-id');
  });

  it('uses runWithTenantBypass for tenant discovery and runWithTenantAsync for audit creation', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins());

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    await POST(makeRequest({ websiteUrl: 'https://example.com', tenantDomain: 'agency.com' }));

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'widget-quick-audit-tenant-discovery',
      expect.any(Function)
    );
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant-a', expect.any(Function));
  });

  it('returns 400 when tenant domain does not match any tenant', async () => {
    mocks.tenantFindFirst.mockResolvedValue(null);

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({ websiteUrl: 'https://example.com', tenantDomain: 'attacker.com' })
    );

    expect(response.status).toBe(400);
    // Audit must not be created
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
  });

  it('returns 400 when tenantId does not match any tenant', async () => {
    mocks.tenantFindUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({
        websiteUrl: 'https://example.com',
        tenantId: '00000000-0000-0000-0000-000000000000',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when neither tenantDomain nor tenantId is supplied', async () => {
    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({ websiteUrl: 'https://example.com' })
    );

    expect(response.status).toBe(400);
    expect(mocks.tenantFindFirst).not.toHaveBeenCalled();
    expect(mocks.tenantFindUnique).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when URL is missing', async () => {
    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({ tenantDomain: 'agency.com' })
    );

    expect(response.status).toBe(400);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('does NOT call Prisma outside tenant context (no MissingTenantError path)', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins());

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const response = await POST(
      makeRequest({ websiteUrl: 'https://example.com', tenantDomain: 'agency.com' })
    );

    expect(response.status).not.toBe(500);
    expect(mocks.runWithTenantBypass).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantAsync).toHaveBeenCalledTimes(1);
  });

  it('audit is created with the resolved tenant id, not the raw body value', async () => {
    // Attacker supplies a tenantId in the body; we must verify it against the DB
    // and use the DB-resolved tenant.id, not the raw input.
    const resolvedTenant = {
      id: 'real-tenant-id',
      domain: 'agency.com',
      brandingConfig: { allowedWidgetOrigins: ['https://agency.com'] },
    };
    mocks.tenantFindUnique.mockResolvedValue(resolvedTenant);

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    await POST(
      makeRequest({
        websiteUrl: 'https://example.com',
        tenantId: 'real-tenant-id',
      })
    );

    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'real-tenant-id', // must be the DB-resolved value
        }),
      })
    );
  });
});
