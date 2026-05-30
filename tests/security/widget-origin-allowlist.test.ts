// @vitest-environment node
/**
 * tests/security/widget-origin-allowlist.test.ts
 *
 * Task #13: Widget origin allow-list — security regression tests.
 *
 * Covers (per task spec):
 *   1. allowed origin preflight succeeds with exact origin echoed
 *   2. allowed origin POST succeeds
 *   3. disallowed origin preflight fails safely (no Allow-Origin header)
 *   4. disallowed origin POST fails safely (no Allow-Origin header)
 *   5. malformed origin fails safely
 *   6. arbitrary attacker-supplied tenantId does not bypass allow-list
 *   7. tenant A origin cannot call tenant B widget
 *   8. missing origin behavior is explicit and tested
 *   9. CORS response includes `Vary: Origin`
 *  10. no `Access-Control-Allow-Origin: *` on widget route
 *  11. unit tests for normalizeOrigin and checkOriginAgainstAllowList
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/api/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/errors')>();
  return {
    ...actual,
    generateTraceId: () => 'test-trace-id',
  };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  buildAllowedCorsHeaders,
  buildDeniedCorsHeaders,
  checkOriginAgainstAllowList,
  normalizeOrigin,
} from '@/lib/widget/origin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupPassthroughTenantHelpers() {
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );
  mocks.runWithTenantAsync.mockImplementation(
    async (_tenantId: string, fn: () => Promise<unknown>) => fn()
  );
}

function makePostRequest(opts: { body: Record<string, unknown>; origin?: string | null }): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.origin !== null && opts.origin !== undefined) headers.Origin = opts.origin;
  return new Request('http://localhost/api/widget/quick-audit', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
  });
}

function makeOptionsRequest(opts: {
  origin?: string | null;
  tenantId?: string;
  tenantDomain?: string;
}): Request {
  const url = new URL('http://localhost/api/widget/quick-audit');
  if (opts.tenantId) url.searchParams.set('tenantId', opts.tenantId);
  if (opts.tenantDomain) url.searchParams.set('tenantDomain', opts.tenantDomain);
  const headers: Record<string, string> = {};
  if (opts.origin !== null && opts.origin !== undefined) headers.Origin = opts.origin;
  return new Request(url.toString(), { method: 'OPTIONS', headers });
}

const tenantWithOrigins = (origins: string[]) => ({
  id: 'tenant-a',
  domain: 'agency.com',
  brandingConfig: { allowedWidgetOrigins: origins },
});

// ─── Unit tests for origin module ─────────────────────────────────────────────

describe('normalizeOrigin', () => {
  it('returns scheme://host for plain https URL', () => {
    expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
  });

  it('lower-cases the host', () => {
    expect(normalizeOrigin('https://Example.COM')).toBe('https://example.com');
  });

  it('preserves explicit ports', () => {
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('strips default ports', () => {
    expect(normalizeOrigin('https://example.com:443')).toBe('https://example.com');
    expect(normalizeOrigin('http://example.com:80')).toBe('http://example.com');
  });

  it('rejects null/empty/literal "null"', () => {
    expect(normalizeOrigin(null)).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
    expect(normalizeOrigin('null')).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(normalizeOrigin('file://example.com')).toBeNull();
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeOrigin('data:text/html,foo')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(normalizeOrigin('://no-scheme')).toBeNull();
  });

  it('rejects origins with paths/query/fragments', () => {
    expect(normalizeOrigin('https://example.com/path')).toBeNull();
    expect(normalizeOrigin('https://example.com/?q=1')).toBeNull();
    expect(normalizeOrigin('https://example.com/#frag')).toBeNull();
  });
});

describe('checkOriginAgainstAllowList', () => {
  it('allows exact match', () => {
    const r = checkOriginAgainstAllowList('https://example.com', ['https://example.com']);
    expect(r).toEqual({ allowed: true, origin: 'https://example.com' });
  });

  it('denies different scheme (http vs https)', () => {
    const r = checkOriginAgainstAllowList('http://example.com', ['https://example.com']);
    expect(r.allowed).toBe(false);
  });

  it('denies different subdomain', () => {
    const r = checkOriginAgainstAllowList('https://www.example.com', ['https://example.com']);
    expect(r.allowed).toBe(false);
  });

  it('denies different port', () => {
    const r = checkOriginAgainstAllowList('https://example.com:8443', ['https://example.com']);
    expect(r.allowed).toBe(false);
  });

  it('returns missing for null origin', () => {
    const r = checkOriginAgainstAllowList(null, ['https://example.com']);
    expect(r).toEqual({ allowed: false, reason: 'missing' });
  });

  it('returns malformed for unparseable origin', () => {
    const r = checkOriginAgainstAllowList('javascript:alert(1)', ['https://example.com']);
    expect(r).toEqual({ allowed: false, reason: 'malformed' });
  });

  it('returns not_allow_listed when allow-list is empty', () => {
    const r = checkOriginAgainstAllowList('https://example.com', []);
    expect(r).toEqual({ allowed: false, reason: 'not_allow_listed' });
  });

  it('does not match wildcard literal in allow-list', () => {
    // Defensive: even if a tenant accidentally stores '*', it should not match.
    const r = checkOriginAgainstAllowList('https://attacker.com', ['*']);
    expect(r.allowed).toBe(false);
  });
});

describe('CORS header builders', () => {
  it('allowed builder echoes exact origin (no wildcard) and includes Vary: Origin', () => {
    const h = buildAllowedCorsHeaders('https://example.com');
    expect(h['Access-Control-Allow-Origin']).toBe('https://example.com');
    expect(h['Access-Control-Allow-Origin']).not.toBe('*');
    expect(h.Vary).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toMatch(/POST/);
  });

  it('denied builder sets Vary: Origin but no Allow-Origin', () => {
    const h = buildDeniedCorsHeaders();
    expect(h.Vary).toBe('Origin');
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

// ─── OPTIONS preflight integration ────────────────────────────────────────────

describe('OPTIONS /api/widget/quick-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTenantHelpers();
  });

  it('allowed origin preflight returns 204 with exact origin echoed', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { OPTIONS } = await import('@/app/api/widget/quick-audit/route');
    const res = await OPTIONS(
      makeOptionsRequest({ origin: 'https://agency.com', tenantDomain: 'agency.com' })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://agency.com');
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/);
  });

  it('disallowed origin preflight returns 403 with no Allow-Origin', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { OPTIONS } = await import('@/app/api/widget/quick-audit/route');
    const res = await OPTIONS(
      makeOptionsRequest({ origin: 'https://attacker.com', tenantDomain: 'agency.com' })
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('malformed origin preflight returns 403', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { OPTIONS } = await import('@/app/api/widget/quick-audit/route');
    const res = await OPTIONS(
      makeOptionsRequest({ origin: 'not-a-url', tenantDomain: 'agency.com' })
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('missing origin preflight returns 403', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { OPTIONS } = await import('@/app/api/widget/quick-audit/route');
    const res = await OPTIONS(makeOptionsRequest({ origin: null, tenantDomain: 'agency.com' }));

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflight without tenant identifier returns 403', async () => {
    const { OPTIONS } = await import('@/app/api/widget/quick-audit/route');
    const res = await OPTIONS(makeOptionsRequest({ origin: 'https://agency.com' }));

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // No tenant lookup should be performed without an identifier
    expect(mocks.tenantFindUnique).not.toHaveBeenCalled();
    expect(mocks.tenantFindFirst).not.toHaveBeenCalled();
  });

  it('preflight for unknown tenant returns 403', async () => {
    mocks.tenantFindFirst.mockResolvedValue(null);

    const { OPTIONS } = await import('@/app/api/widget/quick-audit/route');
    const res = await OPTIONS(
      makeOptionsRequest({ origin: 'https://agency.com', tenantDomain: 'nonexistent.com' })
    );

    expect(res.status).toBe(403);
  });
});

// ─── POST integration ─────────────────────────────────────────────────────────

describe('POST /api/widget/quick-audit — origin allow-list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTenantHelpers();
    mocks.crawlWebsite.mockResolvedValue({ pages: [] });
    mocks.runGBPModule.mockResolvedValue({ status: 'success', data: {} });
    mocks.auditCreate.mockResolvedValue({ id: 'new-audit-id', businessName: 'Test Biz' });
  });

  it('allowed origin POST succeeds with exact origin echoed', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: 'https://agency.com',
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://agency.com');
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('disallowed origin POST returns 403 with no Allow-Origin', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: 'https://attacker.com',
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Origin');
    // Audit must NOT be created when origin is denied
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('missing origin POST returns 403', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: null,
      })
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('malformed origin POST returns 403', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: 'javascript:alert(1)',
      })
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('attacker-supplied tenantId does not bypass allow-list when origin is not listed', async () => {
    // Attacker knows tenant-a exists and supplies tenantId, but origin is theirs.
    mocks.tenantFindUnique.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantId: 'tenant-a' },
        origin: 'https://attacker.com',
      })
    );

    expect(res.status).toBe(403);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('tenant A origin cannot call tenant B widget (cross-tenant)', async () => {
    // tenant-b is the resolved tenant; tenant-a's origin is not in tenant-b's allow-list
    mocks.tenantFindFirst.mockResolvedValue({
      id: 'tenant-b',
      domain: 'other-agency.com',
      brandingConfig: { allowedWidgetOrigins: ['https://other-agency.com'] },
    });

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'other-agency.com' },
        origin: 'https://agency.com', // Tenant A origin
      })
    );

    expect(res.status).toBe(403);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('tenant with empty allow-list cannot be called even from a sensible-looking origin', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins([]));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: 'https://agency.com',
      })
    );

    expect(res.status).toBe(403);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('never sets Access-Control-Allow-Origin: * on POST', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: 'https://agency.com',
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('rejects body whose validation fails (zod) without leaking permissive CORS', async () => {
    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(
      makePostRequest({
        body: { websiteUrl: 'not-a-url' }, // missing tenant + bad URL
        origin: 'https://attacker.com',
      })
    );

    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('logs origin denial as structured event with safe metadata only', async () => {
    mocks.tenantFindFirst.mockResolvedValue(tenantWithOrigins(['https://agency.com']));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    await POST(
      makePostRequest({
        body: { websiteUrl: 'https://example.com', tenantDomain: 'agency.com' },
        origin: 'https://attacker.com',
      })
    );

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'widget.origin_denied',
        reason: 'not_allow_listed',
        route: '/api/widget/quick-audit',
        origin: 'https://attacker.com',
        tenantId: 'tenant-a',
      }),
      expect.any(String)
    );
  });
});
