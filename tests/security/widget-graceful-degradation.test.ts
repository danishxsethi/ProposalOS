// @vitest-environment node
/**
 * tests/security/widget-graceful-degradation.test.ts
 *
 * Tests that the widget quick-audit route degrades gracefully when a module in its
 * QUICK_AUDIT profile (website, gbp) fails or times out, rather than returning a 500.
 *
 * Wave 2 (P1-21) rewrote the route to dispatch through the canonical engine's
 * runModuleSubset() instead of calling crawlWebsite()/runGBPModule() directly and
 * computing a fabricated +10/-10/+20 score formula. These tests now assert the real
 * contract: a module that does not COMPLETE is reported as "unavailable" (never a
 * fabricated negative finding), and the score/response shape stay valid regardless
 * of which modules in the subset succeeded.
 *   A. website module fails → 200, website reported unavailable, gbp still counted
 *   B. gbp module fails → 200, gbp reported unavailable, website still counted
 *   C. both fail → 200 with minimum coverage score and valid shape
 *   D. both succeed → 200 with full coverage score
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  runWithTenantAsync: vi.fn(),
  runWithTenantBypass: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  auditUpdate: vi.fn(),
  runModuleSubset: vi.fn(),
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
      update: mocks.auditUpdate,
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

// P1-21: the route now dispatches through the canonical engine's runModuleSubset()
// instead of calling crawlWebsite()/runGBPModule() directly.
vi.mock('@/lib/audit/runner', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit/runner')>('@/lib/audit/runner');
  return {
    ...actual,
    runModuleSubset: mocks.runModuleSubset,
  };
});

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

/**
 * A genuinely complete GBP profile — every field the real
 * generateGBPFindings/computeGbpCompleteness checks look for is present and
 * healthy, so a "succeeded" GBP module produces zero findings. An empty `{}`
 * is NOT equivalent to "succeeded with nothing to report": the real, reused
 * finding-generation logic (shared with the full 27-module audit) correctly
 * treats missing rating/website/photos/hours as real evidence of an
 * incomplete listing and reports them — that is the intended Wave 2 (P1-21)
 * behavior, not a bug. This fixture represents an actually-complete listing.
 */
const COMPLETE_GBP_DATA = {
  rating: 4.8,
  reviewCount: 45,
  website: 'https://example.com',
  photos: Array.from({ length: 12 }, (_, i) => ({ id: i })),
  photoCount: 12,
  openingHours: { periods: [{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }] },
  placeId: 'ChIJ_test_place',
  name: 'Test Biz',
  address: '123 Main St, Springfield, IL 62704',
  phone: '+15551234567',
  description:
    'Test Biz has been serving Springfield for over a decade with award-winning ' +
    'service and a knowledgeable team. We offer a wide range of products and ' +
    'services tailored to the local community, with convenient hours and ' +
    'friendly staff ready to help every customer who walks through our doors.',
  types: ['restaurant', 'cafe', 'bakery', 'bar'],
  primaryType: 'restaurant',
  reviews: [{ text: { text: 'Great!' }, publishTime: new Date().toISOString() }],
  ownerResponseRate: 0.9,
  hasRecentPosts: true,
  hasQaWithAnswers: true,
  hasServicesOrProducts: true,
  nameMatchesWebsite: true,
  phoneMatchesWebsite: true,
  hasAttributes: true,
};

/** Build the Map<string, ModuleResult> runModuleSubset() returns. */
function moduleResults(opts: { website?: 'ok' | 'fail'; gbp?: 'ok' | 'fail' }) {
  const m = new Map<string, { status: string; data: any; error?: string }>();
  m.set(
    'website',
    opts.website === 'fail'
      ? { status: 'FAILED', data: null, error: 'Network timeout' }
      : { status: 'COMPLETE', data: { findings: [] } }
  );
  m.set(
    'gbp',
    opts.gbp === 'fail'
      ? { status: 'FAILED', data: null, error: 'GBP API down' }
      : { status: 'COMPLETE', data: COMPLETE_GBP_DATA }
  );
  return m;
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
    status: 'RUNNING',
  });
  mocks.auditUpdate.mockResolvedValue({});
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

  it('A. website module fails → 200, website reported unavailable (not a fabricated finding)', async () => {
    mocks.runModuleSubset.mockResolvedValue(moduleResults({ website: 'fail', gbp: 'ok' }));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('auditId');
    expect(body.quickAudit).toBe(true);
    expect(body.coverage.modulesUnavailable).toContain('website');
    expect(body.coverage.modulesCompleted).toContain('gbp');
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
  });

  it('B. gbp module fails → 200, gbp reported unavailable, website still counted', async () => {
    mocks.runModuleSubset.mockResolvedValue(moduleResults({ website: 'ok', gbp: 'fail' }));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage.modulesUnavailable).toContain('gbp');
    expect(body.coverage.modulesCompleted).toContain('website');
  });

  it('C. both fail → 200 with minimum coverage score and valid shape (no crash)', async () => {
    mocks.runModuleSubset.mockResolvedValue(moduleResults({ website: 'fail', gbp: 'fail' }));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage.modulesUnavailable).toEqual(expect.arrayContaining(['website', 'gbp']));
    expect(body.coverage.modulesCompleted).toHaveLength(0);
    // No modules completed => zero coverage, never a fabricated negative business finding.
    expect(body.score).toBe(0);
    expect(body.topIssue).toBeNull();
  });

  it('D. both succeed → 200 with full coverage score', async () => {
    mocks.runModuleSubset.mockResolvedValue(moduleResults({ website: 'ok', gbp: 'ok' }));

    const { POST } = await import('@/app/api/widget/quick-audit/route');
    const res = await POST(makePostRequest({ body: validBody, origin: 'https://agency.com' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage.modulesUnavailable).toHaveLength(0);
    expect(body.coverage.modulesCompleted).toEqual(expect.arrayContaining(['website', 'gbp']));
    expect(body.score).toBe(100); // full coverage, no findings deducted
  });

  it('response shape is always valid regardless of module failures', async () => {
    mocks.runModuleSubset.mockResolvedValue(moduleResults({ website: 'fail', gbp: 'fail' }));

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
    expect(body).toHaveProperty('coverage');
    // Explicit reduced-coverage labeling (Step 8 requirement 10).
    expect(body.quickAudit).toBe(true);
    // Score is a number between 0-100
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
  });
});
