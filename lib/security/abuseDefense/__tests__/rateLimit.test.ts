/**
 * lib/security/abuseDefense/__tests__/rateLimit.test.ts
 *
 * Unit Tests for API Rate Limiting & Abuse Defense
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { hashSensitive } from '@/lib/security/abuseDefense/policies';
import { checkRateLimit, type RateLimitOptions } from '@/lib/middleware/rateLimit';
import { getSharedStore, _resetSharedStore } from '@/lib/store/shared';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';

// Mock audit trail to observe log emissions
vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: vi.fn(() => Promise.resolve()),
}));

describe('Abuse Defense & Rate Limiting Unit Tests', () => {
  beforeEach(() => {
    _resetSharedStore();
    vi.clearAllMocks();
    process.env.ENABLE_RATE_LIMIT_TEST = 'true';
    process.env.NODE_ENV = 'test';
  });

  describe('SHA-256 Hashing', () => {
    it('should hash a sensitive string to standard SHA-256 hex digest', () => {
      const input = 'super_secret_token_123';
      const expectedHash = '2c8ea66fea05ea1f66f183ce75ccb477101d59225d3dcf226c612e07898e2304';
      expect(hashSensitive(input)).toBe(expectedHash);
    });

    it('should return empty string for empty input', () => {
      expect(hashSensitive('')).toBe('');
    });
  });

  describe('checkRateLimit Key Hashing & Incrementing', () => {
    it('should increment requests in the shared store and block when max exceeded', async () => {
      const req = new Request('https://proposalos.test/api/audit', {
        headers: { 'x-real-ip': '1.2.3.4' },
      });

      const options: RateLimitOptions = {
        windowMs: 60 * 1000,
        max: 2,
        endpoint: 'test_endpoint',
      };

      // Call 1 - should pass
      const res1 = await checkRateLimit(req, options);
      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(1);

      // Call 2 - should pass
      const res2 = await checkRateLimit(req, options);
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(0);

      // Call 3 - should fail (blocked)
      const res3 = await checkRateLimit(req, options);
      expect(res3.success).toBe(false);
      expect(res3.remaining).toBe(0);
      expect(res3.retryAfter).toBeGreaterThan(0);
    });

    it('should hash sensitive elements (API Key, Session ID, and IP) in the shared store key', async () => {
      const store = await getSharedStore();
      const incSpy = vi.spyOn(store, 'increment');

      // Test API Key Hashing
      const apiKeyReq = new Request('https://proposalos.test/api/audit', {
        headers: { 'x-api-key': 'secret-api-key-value' },
      });
      await checkRateLimit(apiKeyReq, {
        windowMs: 60 * 1000,
        max: 5,
        useApiKey: true,
        endpoint: 'test-api',
      });

      const hashedApiKey = hashSensitive('secret-api-key-value');
      expect(incSpy).toHaveBeenLastCalledWith(
        `rl:api:${hashedApiKey}:test-api`,
        expect.any(Number)
      );

      // Test Session ID Hashing
      const sessionReq = new Request('https://proposalos.test/api/audit');
      await checkRateLimit(sessionReq, {
        windowMs: 60 * 1000,
        max: 5,
        sessionId: 'session-id-value',
        endpoint: 'test-session',
      });

      const hashedSession = hashSensitive('session-id-value');
      expect(incSpy).toHaveBeenLastCalledWith(
        `rl:session:${hashedSession}:test-session`,
        expect.any(Number)
      );

      // Test IP Hashing
      const ipReq = new Request('https://proposalos.test/api/audit', {
        headers: { 'x-forwarded-for': '9.8.7.6, 5.4.3.2' },
      });
      await checkRateLimit(ipReq, {
        windowMs: 60 * 1000,
        max: 5,
        endpoint: 'test-ip',
      });

      const hashedIp = hashSensitive('9.8.7.6');
      expect(incSpy).toHaveBeenLastCalledWith(`rl:ip:${hashedIp}:test-ip`, expect.any(Number));
    });
  });

  describe('Outage Resiliency and Fail-Closed Mechanics', () => {
    it('should fail-closed if failClosed is true and shared store throws an error', async () => {
      const store = await getSharedStore();
      vi.spyOn(store, 'increment').mockRejectedValue(new Error('Redis connection lost'));

      const req = new Request('https://proposalos.test/api/audit');
      const res = await checkRateLimit(req, {
        windowMs: 60 * 1000,
        max: 5,
        failClosed: true,
      });

      expect(res.success).toBe(false);
      expect(res.remaining).toBe(0);
    });

    it('should fail-open if failClosed is false/omitted and shared store throws an error', async () => {
      const store = await getSharedStore();
      vi.spyOn(store, 'increment').mockRejectedValue(new Error('Redis connection lost'));

      const req = new Request('https://proposalos.test/api/audit');
      const res = await checkRateLimit(req, {
        windowMs: 60 * 1000,
        max: 5,
        failClosed: false,
      });

      expect(res.success).toBe(true);
      expect(res.remaining).toBe(1);
    });
  });

  describe('Audit Logging on Blocks', () => {
    it('should emit a structured audit log event if auditOnBlock is true and request is blocked', async () => {
      const req = new Request('https://proposalos.test/api/audit', {
        headers: { 'x-real-ip': '8.8.8.8' },
      });

      const options: RateLimitOptions = {
        windowMs: 60 * 1000,
        max: 1,
        endpoint: 'blocked_endpoint',
        routeClass: 'public_audit',
        auditOnBlock: true,
      };

      // Call 1 - passes
      await checkRateLimit(req, options);
      expect(recordAuditTrailEvent).not.toHaveBeenCalled();

      // Call 2 - blocked
      await checkRateLimit(req, options);
      expect(recordAuditTrailEvent).toHaveBeenCalledTimes(1);
      expect(recordAuditTrailEvent).toHaveBeenCalledWith({
        eventType: 'abuse.rate_limited',
        tenantId: null,
        payload: {
          routeClass: 'public_audit',
          ipHash: hashSensitive('8.8.8.8'),
          endpoint: 'blocked_endpoint',
          limit: 1,
          remaining: 0,
          retryAfter: 60,
        },
      });
    });

    it('should NOT emit audit log event if auditOnBlock is false and request is blocked', async () => {
      const req = new Request('https://proposalos.test/api/audit', {
        headers: { 'x-real-ip': '8.8.8.8' },
      });

      const options: RateLimitOptions = {
        windowMs: 60 * 1000,
        max: 1,
        endpoint: 'blocked_endpoint',
        routeClass: 'authenticated_audit',
        auditOnBlock: false,
      };

      await checkRateLimit(req, options);
      await checkRateLimit(req, options);
      expect(recordAuditTrailEvent).not.toHaveBeenCalled();
    });
  });
});
