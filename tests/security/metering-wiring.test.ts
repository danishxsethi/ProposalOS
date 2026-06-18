// @vitest-environment node
/**
 * tests/security/metering-wiring.test.ts
 *
 * Integration test verifying trackUsage is called when an audit is created.
 * This tests the WIRING — not trackUsage internals (covered in metering.test.ts).
 *
 * Proves: an audit creation triggers a billable usage record.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  trackUsage: vi.fn(),
  getTenantId: vi.fn(),
  auditCreate: vi.fn(),
  withRateLimit: vi.fn(),
  withAuth: vi.fn(),
  withIdempotency: vi.fn(),
  runAudit: vi.fn(),
  recordAuditTrailEvent: vi.fn(),
  getObservabilityContext: vi.fn(),
  runWithObservabilityContext: vi.fn(),
  createObservabilityContextFromRequest: vi.fn(),
  applyObservabilityHeaders: vi.fn(),
}));

vi.mock('@/lib/billing/metering', () => ({
  trackUsage: mocks.trackUsage,
}));

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mocks.getTenantId,
  runWithTenantAsync: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()),
  runWithTenantBypass: vi.fn((_r: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      create: mocks.auditCreate,
      update: vi.fn().mockResolvedValue({}),
    },
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'system-tenant' }) },
  },
}));

vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: () => (_req: Request, handler: () => Promise<Response>) => handler(),
  RateLimitPresets: { publicApi: {} },
}));

vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/middleware/idempotency', () => ({
  withIdempotency: (handler: any) => handler,
}));

vi.mock('@/lib/audit/runner', () => ({
  runAudit: mocks.runAudit,
}));

vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: mocks.recordAuditTrailEvent,
}));

vi.mock('@/lib/observability/context', () => ({
  getObservabilityContext: mocks.getObservabilityContext,
  runWithObservabilityContext: (_ctx: unknown, fn: () => unknown) => {
    // Return a promise so .catch() works on fire-and-forget audit runner
    try {
      const r = fn();
      return r instanceof Promise ? r : Promise.resolve(r);
    } catch (e) {
      return Promise.reject(e);
    }
  },
  createObservabilityContextFromRequest: mocks.createObservabilityContextFromRequest,
  applyObservabilityHeaders: mocks.applyObservabilityHeaders,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logError: vi.fn(),
}));

vi.mock('@/lib/security/abuseDefense/policies', () => ({
  getAbusePolicy: vi.fn().mockReturnValue({ shouldBlock: () => false }),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trackUsage.mockResolvedValue({ id: 'usage-1', credits: 1 });
  mocks.recordAuditTrailEvent.mockResolvedValue(undefined);
  mocks.getObservabilityContext.mockReturnValue({});
  mocks.createObservabilityContextFromRequest.mockReturnValue({});
  mocks.applyObservabilityHeaders.mockReturnValue(undefined);
});

afterEach(() => {
  vi.resetModules();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Metering wiring — audit creation triggers trackUsage', () => {
  it('POST /api/v1/audit calls trackUsage with audit.created', async () => {
    const tenantId = 'tenant-metered';
    mocks.getTenantId.mockResolvedValue(tenantId);
    mocks.auditCreate.mockResolvedValue({
      id: 'audit-new',
      tenantId,
      businessName: 'Test Biz',
      businessUrl: 'https://example.com',
      status: 'QUEUED',
      createdAt: new Date(),
    });

    const { POST } = await import('@/app/api/v1/audit/route');
    const req = new Request('http://localhost/api/v1/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Test Biz',
        businessUrl: 'https://example.com',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    // trackUsage was called with the tenant and event type
    expect(mocks.trackUsage).toHaveBeenCalledWith(tenantId, 'audit.created');
  });

  it('trackUsage failure does NOT fail the audit creation', async () => {
    const tenantId = 'tenant-billing-down';
    mocks.getTenantId.mockResolvedValue(tenantId);
    mocks.auditCreate.mockResolvedValue({
      id: 'audit-resilient',
      tenantId,
      businessName: 'Resilient Biz',
      businessUrl: 'https://example.com',
      status: 'QUEUED',
      createdAt: new Date(),
    });

    // trackUsage throws — should not propagate
    mocks.trackUsage.mockRejectedValue(new Error('Billing service down'));

    const { POST } = await import('@/app/api/v1/audit/route');
    const req = new Request('http://localhost/api/v1/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Resilient Biz',
        businessUrl: 'https://example.com',
      }),
    });

    // Audit still succeeds
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
