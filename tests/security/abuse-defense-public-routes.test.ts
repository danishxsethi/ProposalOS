// @vitest-environment node
process.env.ENABLE_RATE_LIMIT_TEST = 'true';
process.env.NODE_ENV = 'test';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared store mock factory
// ---------------------------------------------------------------------------

function makeTestStore() {
  const data = new Map<string, { value: string; expiresAt: number }>();

  function isExpired(entry: { expiresAt: number }) {
    return Date.now() > entry.expiresAt;
  }

  return {
    _data: data,
    async get(key: string) {
      const e = data.get(key);
      if (!e || isExpired(e)) { data.delete(key); return null; }
      return e.value;
    },
    async set(key: string, value: string, ttlSeconds: number) {
      data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async setIfNotExists(key: string, value: string, ttlSeconds: number) {
      const e = data.get(key);
      if (e && !isExpired(e)) return false;
      data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async increment(key: string, ttlSeconds: number) {
      const e = data.get(key);
      if (!e || isExpired(e)) {
        data.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
        return 1;
      }
      const next = parseInt(e.value, 10) + 1;
      data.set(key, { value: String(next), expiresAt: e.expiresAt });
      return next;
    },
    async del(key: string) { data.delete(key); },
  };
}

let currentStore = makeTestStore();

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn(async () => currentStore),
  createMemoryStore: vi.fn(() => currentStore),
  _resetSharedStore: vi.fn(),
}));

// Mock external dependency libraries to keep tests light & isolated
const mocks = vi.hoisted(() => ({
  runAudit: vi.fn(() => Promise.resolve()),
  crawlWebsite: vi.fn(() => Promise.resolve({ pages: [] })),
  runGBPModule: vi.fn(() => Promise.resolve({ status: 'success', data: {} })),
  tenantFindUnique: vi.fn(),
  tenantFindFirst: vi.fn(),
  tenantUpsert: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/lib/audit/runner', () => ({
  runAudit: mocks.runAudit,
}));

vi.mock('@/lib/modules/websiteCrawler', () => ({
  crawlWebsite: mocks.crawlWebsite,
}));

vi.mock('@/lib/modules/gbp', () => ({
  runGBPModule: mocks.runGBPModule,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: mocks.tenantFindUnique,
      findFirst: mocks.tenantFindFirst,
      upsert: mocks.tenantUpsert,
    },
    audit: {
      create: mocks.auditCreate,
    },
  },
}));

vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: vi.fn(() => Promise.resolve()),
}));

// Helper functions for making fake HTTP requests
function makePublicAuditRequest(body: any, ip: string, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-real-ip': ip,
  };
  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }
  return new Request('http://localhost/api/public/audit', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makeWidgetAuditRequest(body: any, ip: string, origin: string, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-real-ip': ip,
    'origin': origin,
  };
  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }
  return new Request('http://localhost/api/widget/quick-audit', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Public Routes Abuse Defense Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentStore = makeTestStore();
  });

  describe('POST /api/public/audit (Public Audit Creation)', () => {
    it('should allow valid requests and enforce rate limits by caller IP', async () => {
      // Mock tenant and audit tables
      mocks.tenantUpsert.mockResolvedValue({ id: 'system-tenant-id' });
      mocks.auditCreate.mockResolvedValue({ id: 'audit-123' });

      const { POST } = await import('@/app/api/public/audit/route');

      const body = {
        url: 'https://apple.com',
        businessName: 'Apple Inc',
        industry: 'retail',
        businessCity: 'Cupertino',
      };

      // Call 1-5 from IP 1.1.1.1 (Limit is 5 per min)
      for (let i = 0; i < 5; i++) {
        const req = makePublicAuditRequest(body, '1.1.1.1');
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 6th call from same IP 1.1.1.1 should be rate limited (429)
      const reqOverLimit = makePublicAuditRequest(body, '1.1.1.1');
      const resOverLimit = await POST(reqOverLimit);
      expect(resOverLimit.status).toBe(429);
      expect(resOverLimit.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(resOverLimit.headers.get('Retry-After')).toBeDefined();

      // Separate IP 2.2.2.2 should still succeed
      const reqNewIp = makePublicAuditRequest(body, '2.2.2.2');
      const resNewIp = await POST(reqNewIp);
      expect(resNewIp.status).toBe(200);
    });

    it('should enforce idempotency using Idempotency-Key backed by SharedStore', async () => {
      mocks.tenantUpsert.mockResolvedValue({ id: 'system-tenant-id' });
      mocks.auditCreate.mockResolvedValue({ id: 'audit-999' });

      const { POST } = await import('@/app/api/public/audit/route');

      const body = {
        url: 'https://idempotent-test.com',
        businessName: 'Idempotency Test Co',
      };

      const key = 'test-idempotency-key-123';

      // First request (executes normally)
      const req1 = makePublicAuditRequest(body, '3.3.3.3', key);
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);
      expect(mocks.auditCreate).toHaveBeenCalledTimes(1);

      // Duplicate request (should return cached response)
      const req2 = makePublicAuditRequest(body, '3.3.3.3', key);
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('X-Idempotency-Cache')).toBe('true');
      expect(mocks.auditCreate).toHaveBeenCalledTimes(1); // handler is not re-executed
    });
  });

  describe('POST /api/widget/quick-audit (Widget Quick Audit)', () => {
    it('should enforce strict widget_audit rate limit by IP', async () => {
      // Mock tenant discovery and allowed CORS origin checks
      mocks.tenantFindUnique.mockResolvedValue({
        id: 'widget-tenant-id',
        brandingConfig: { allowedWidgetOrigins: ['https://widget-owner.com'] },
      });
      mocks.auditCreate.mockResolvedValue({ id: 'widget-audit-777' });

      const { POST } = await import('@/app/api/widget/quick-audit/route');

      const body = {
        websiteUrl: 'https://example-widget-user.com',
        tenantId: 'widget-tenant-id',
        businessName: 'Widget User',
      };

      // Widget audit limit is 10 per min
      for (let i = 0; i < 10; i++) {
        const req = makeWidgetAuditRequest(body, '4.4.4.4', 'https://widget-owner.com');
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 11th request should be rate-limited (429)
      const reqOverLimit = makeWidgetAuditRequest(body, '4.4.4.4', 'https://widget-owner.com');
      const resOverLimit = await POST(reqOverLimit);
      expect(resOverLimit.status).toBe(429);

      // Separate IP 5.5.5.5 should still succeed
      const reqNewIp = makeWidgetAuditRequest(body, '5.5.5.5', 'https://widget-owner.com');
      const resNewIp = await POST(reqNewIp);
      expect(resNewIp.status).toBe(200);
    });

    it('should enforce idempotency for widgets using Idempotency-Key header', async () => {
      mocks.tenantFindUnique.mockResolvedValue({
        id: 'widget-tenant-id',
        brandingConfig: { allowedWidgetOrigins: ['https://widget-owner.com'] },
      });
      mocks.auditCreate.mockResolvedValue({ id: 'widget-audit-999' });

      const { POST } = await import('@/app/api/widget/quick-audit/route');

      const body = {
        websiteUrl: 'https://another-widget-user.com',
        tenantId: 'widget-tenant-id',
      };

      const key = 'widget-idempotency-key';

      // First request (executes handler)
      const req1 = makeWidgetAuditRequest(body, '6.6.6.6', 'https://widget-owner.com', key);
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);
      expect(mocks.auditCreate).toHaveBeenCalledTimes(1);

      // Duplicate request (retrieved from shared store cache)
      const req2 = makeWidgetAuditRequest(body, '6.6.6.6', 'https://widget-owner.com', key);
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('X-Idempotency-Cache')).toBe('true');
      expect(mocks.auditCreate).toHaveBeenCalledTimes(1); // not called again
    });
  });
});
