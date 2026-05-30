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
      if (!e || isExpired(e)) {
        data.delete(key);
        return null;
      }
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
    async del(key: string) {
      data.delete(key);
    },
  };
}

let currentStore = makeTestStore();

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn(async () => currentStore),
  createMemoryStore: vi.fn(() => currentStore),
  _resetSharedStore: vi.fn(),
}));

// Mock all external dependency libraries to keep tests light & isolated
const mocks = vi.hoisted(() => ({
  proposalFindUnique: vi.fn(),
  auditFindUnique: vi.fn(),
  validateCaseStudyAccess: vi.fn(),
  generateCaseStudyPdf: vi.fn(() => Promise.resolve(Buffer.from('fake pdf content'))),
  recordAuditTrailEvent: vi.fn(() => Promise.resolve()),
  getServerSession: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    proposal: {
      findUnique: mocks.proposalFindUnique,
    },
    audit: {
      findUnique: mocks.auditFindUnique,
    },
  },
}));

vi.mock('@/lib/security/caseStudyAuth', () => ({
  validateCaseStudyAccess: mocks.validateCaseStudyAccess,
}));

vi.mock('@/lib/pdf/generateCaseStudyPdf', () => ({
  generateCaseStudyPdf: mocks.generateCaseStudyPdf,
}));

vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: mocks.recordAuditTrailEvent,
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
}));

// Helper functions for making fake HTTP requests
function makeTokenRouteRequest(url: string, ip: string, tokenHeader?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-real-ip': ip,
  };
  if (tokenHeader) {
    headers['Authorization'] = `Bearer ${tokenHeader}`;
  }
  return new Request(url, {
    method: 'GET',
    headers,
  });
}

describe('Token Routes Abuse Defense Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentStore = makeTestStore();
  });

  describe('GET /api/proposal/token/[token] (Proposal Token Route)', () => {
    it('should allow valid token usage up to scraping limit and block subsequent requests', async () => {
      const validToken = 'valid-token-xyz';
      const fakeProposal = {
        id: 'prop-123',
        tenantId: 'tenant-abc',
        webLinkToken: validToken,
        createdAt: new Date(),
        status: 'SENT',
        pricing: {},
        tierEssentials: {},
        tierGrowth: {},
        tierPremium: {},
        audit: {
          businessName: 'Acme',
          businessCity: 'City',
          businessIndustry: 'Industry',
          findings: [],
        },
      };

      mocks.proposalFindUnique.mockResolvedValue(fakeProposal);

      const { GET } = await import('@/app/api/proposal/token/[token]/route');

      // The valid token scraping limit is 100 requests per hour.
      // Call 100 times - should all succeed
      for (let i = 0; i < 100; i++) {
        const req = makeTokenRouteRequest(`http://localhost/api/proposal/token/${validToken}`, '1.1.1.1');
        const res = await GET(req, { params: Promise.resolve({ token: validToken }) });
        expect(res.status).toBe(200);
      }

      // 101st request should be rate-limited (429)
      const reqOverLimit = makeTokenRouteRequest(`http://localhost/api/proposal/token/${validToken}`, '1.1.1.1');
      const resOverLimit = await GET(reqOverLimit, { params: Promise.resolve({ token: validToken }) });
      expect(resOverLimit.status).toBe(429);
      expect(resOverLimit.headers.get('Retry-After')).toBeDefined();

      // Request for a DIFFERENT token (which exists) should still succeed (since rate limiting is token-scoped)
      const otherToken = 'other-token-123';
      const otherProposal = { ...fakeProposal, id: 'prop-456', webLinkToken: otherToken };
      mocks.proposalFindUnique.mockImplementation(async (args: any) => {
        if (args.where.webLinkToken === otherToken) return otherProposal;
        return fakeProposal;
      });

      const reqOtherToken = makeTokenRouteRequest(`http://localhost/api/proposal/token/${otherToken}`, '1.1.1.1');
      const resOtherToken = await GET(reqOtherToken, { params: Promise.resolve({ token: otherToken }) });
      expect(resOtherToken.status).toBe(200);
    });

    it('should strictly limit invalid token attempts by IP and emit an audit event', async () => {
      // Mock proposal not found
      mocks.proposalFindUnique.mockResolvedValue(null);

      const { GET } = await import('@/app/api/proposal/token/[token]/route');

      const invalidToken = 'non-existent-token';

      // Limit is 10 per hour.
      // Call 10 times - should all return 404 (proposal not found)
      for (let i = 0; i < 10; i++) {
        const req = makeTokenRouteRequest(`http://localhost/api/proposal/token/${invalidToken}`, '2.2.2.2');
        const res = await GET(req, { params: Promise.resolve({ token: invalidToken }) });
        expect(res.status).toBe(404);
      }

      // 11th request from the same IP should return 429
      const reqOverLimit = makeTokenRouteRequest(`http://localhost/api/proposal/token/${invalidToken}`, '2.2.2.2');
      const resOverLimit = await GET(reqOverLimit, { params: Promise.resolve({ token: invalidToken }) });
      expect(resOverLimit.status).toBe(429);

      // Verify that audit event was recorded for invalid token rate limiting
      expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'abuse.invalid_token_rate_limited',
        })
      );

      // A DIFFERENT IP making an invalid token attempt should still get 404 (not blocked yet)
      const reqNewIp = makeTokenRouteRequest(`http://localhost/api/proposal/token/${invalidToken}`, '3.3.3.3');
      const resNewIp = await GET(reqNewIp, { params: Promise.resolve({ token: invalidToken }) });
      expect(resNewIp.status).toBe(404);
    });
  });

  describe('GET /api/case-study/[auditId]/generate (Case Study PDF Gen)', () => {
    it('should allow valid case study downloads up to scraping limit and block subsequent', async () => {
      const auditId = 'audit-123';
      const validToken = 'valid-token-abc';

      mocks.validateCaseStudyAccess.mockResolvedValue({
        authorized: true,
        tenantId: 'tenant-123',
      });
      mocks.auditFindUnique.mockResolvedValue({
        id: auditId,
        tenantId: 'tenant-123',
        businessName: 'Best Corp Inc',
      });

      const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');

      // Valid scraping limit is 100 requests per hour.
      // Call 100 times - should return 200 (and the fake PDF)
      for (let i = 0; i < 100; i++) {
        const req = makeTokenRouteRequest(`http://localhost/api/case-study/${auditId}/generate?token=${validToken}`, '4.4.4.4');
        const res = await GET(req, { params: Promise.resolve({ auditId }) });
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe('fake pdf content');
      }

      // 101st request should return 429
      const reqOverLimit = makeTokenRouteRequest(`http://localhost/api/case-study/${auditId}/generate?token=${validToken}`, '4.4.4.4');
      const resOverLimit = await GET(reqOverLimit, { params: Promise.resolve({ auditId }) });
      expect(resOverLimit.status).toBe(429);
    });

    it('should strictly limit invalid token attempts on case-study to 10 per hour by IP', async () => {
      const auditId = 'audit-123';
      const invalidToken = 'invalid-token-xyz';

      // Case study auth fails with INVALID_TOKEN
      mocks.validateCaseStudyAccess.mockResolvedValue({
        authorized: false,
        error: 'INVALID_TOKEN',
      });

      const { GET } = await import('@/app/api/case-study/[auditId]/generate/route');

      // Call 10 times - should return 403 (Forbidden)
      for (let i = 0; i < 10; i++) {
        const req = makeTokenRouteRequest(`http://localhost/api/case-study/${auditId}/generate?token=${invalidToken}`, '5.5.5.5');
        const res = await GET(req, { params: Promise.resolve({ auditId }) });
        expect(res.status).toBe(403);
      }

      // 11th attempt should return 429
      const reqOverLimit = makeTokenRouteRequest(`http://localhost/api/case-study/${auditId}/generate?token=${invalidToken}`, '5.5.5.5');
      const resOverLimit = await GET(reqOverLimit, { params: Promise.resolve({ auditId }) });
      expect(resOverLimit.status).toBe(429);

      // Verify audit trail recorded
      expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'abuse.invalid_token_rate_limited',
        })
      );
    });
  });
});
