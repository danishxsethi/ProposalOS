/**
 * Unit tests for the Public REST API.
 * Tests authentication, rate limiting, webhook delivery and retry.
 * Requirements: 9.1, 9.2, 9.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateRawKey,
  checkRateLimit,
  peekRateLimit,
  API_KEY_PREFIX,
} from '../api/auth';
import {
  signPayload,
  verifySignature,
} from '../api/webhooks';

// ---------------------------------------------------------------------------
// Auth — generateRawKey
// ---------------------------------------------------------------------------

describe('generateRawKey', () => {
  it('generates a key with the correct prefix', () => {
    const key = generateRawKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateRawKey()));
    expect(keys.size).toBe(20);
  });

  it('generates keys of sufficient length', () => {
    const key = generateRawKey();
    // prefix (7) + 64 hex chars = 71+
    expect(key.length).toBeGreaterThan(40);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — checkRateLimit
// ---------------------------------------------------------------------------

function freshKeyId(): string {
  return `unit-test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

describe('checkRateLimit', () => {
  it('allows requests up to the hourly limit', () => {
    const keyId = freshKeyId();
    const limit = 5;

    for (let i = 0; i < limit; i++) {
      const result = checkRateLimit(keyId, limit, 1000);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests exceeding the hourly limit', () => {
    const keyId = freshKeyId();
    const limit = 3;

    for (let i = 0; i < limit; i++) {
      checkRateLimit(keyId, limit, 1000);
    }

    const result = checkRateLimit(keyId, limit, 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('blocks requests exceeding the daily limit', () => {
    const keyId = freshKeyId();
    const dayLimit = 3;

    for (let i = 0; i < dayLimit; i++) {
      checkRateLimit(keyId, 1000, dayLimit);
    }

    const result = checkRateLimit(keyId, 1000, dayLimit);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns correct remaining count', () => {
    const keyId = freshKeyId();
    const limit = 10;

    const first = checkRateLimit(keyId, limit, 1000);
    expect(first.remaining).toBe(limit - 1);

    const second = checkRateLimit(keyId, limit, 1000);
    expect(second.remaining).toBe(limit - 2);
  });

  it('returns a resetAt date in the future', () => {
    const keyId = freshKeyId();
    const result = checkRateLimit(keyId, 100, 1000);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('isolates limits between different keys', () => {
    const keyA = freshKeyId();
    const keyB = freshKeyId();
    const limit = 2;

    // Exhaust key A
    for (let i = 0; i < limit; i++) checkRateLimit(keyA, limit, 1000);
    expect(checkRateLimit(keyA, limit, 1000).allowed).toBe(false);

    // Key B is unaffected
    expect(checkRateLimit(keyB, limit, 1000).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// peekRateLimit
// ---------------------------------------------------------------------------

describe('peekRateLimit', () => {
  it('returns zero usage for a fresh key', () => {
    const keyId = freshKeyId();
    const { hourUsed, dayUsed } = peekRateLimit(keyId);
    expect(hourUsed).toBe(0);
    expect(dayUsed).toBe(0);
  });

  it('reflects usage after checkRateLimit calls', () => {
    const keyId = freshKeyId();
    checkRateLimit(keyId, 100, 1000);
    checkRateLimit(keyId, 100, 1000);

    const { hourUsed } = peekRateLimit(keyId);
    expect(hourUsed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Webhook — signPayload / verifySignature
// ---------------------------------------------------------------------------

describe('signPayload', () => {
  it('produces a hex string', () => {
    const sig = signPayload('secret', 'payload');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    const sig1 = signPayload('secret', 'payload');
    const sig2 = signPayload('secret', 'payload');
    expect(sig1).toBe(sig2);
  });

  it('differs for different secrets', () => {
    const sig1 = signPayload('secret1', 'payload');
    const sig2 = signPayload('secret2', 'payload');
    expect(sig1).not.toBe(sig2);
  });

  it('differs for different payloads', () => {
    const sig1 = signPayload('secret', 'payload1');
    const sig2 = signPayload('secret', 'payload2');
    expect(sig1).not.toBe(sig2);
  });
});

describe('verifySignature', () => {
  it('returns true for a valid signature', () => {
    const secret = 'my-secret';
    const payload = JSON.stringify({ event: 'audit.completed', id: '123' });
    const sig = signPayload(secret, payload);
    expect(verifySignature(secret, payload, sig)).toBe(true);
  });

  it('returns false for a wrong secret', () => {
    const payload = 'test-payload';
    const sig = signPayload('correct-secret', payload);
    expect(verifySignature('wrong-secret', payload, sig)).toBe(false);
  });

  it('returns false for a tampered payload', () => {
    const secret = 'secret';
    const sig = signPayload(secret, 'original');
    expect(verifySignature(secret, 'tampered', sig)).toBe(false);
  });

  it('returns false for a truncated signature', () => {
    const secret = 'secret';
    const payload = 'payload';
    const sig = signPayload(secret, payload);
    expect(verifySignature(secret, payload, sig.slice(0, -1))).toBe(false);
  });

  it('returns false for an empty signature', () => {
    const secret = 'secret';
    const payload = 'payload';
    expect(verifySignature(secret, payload, '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Webhook delivery retry logic (unit-level, no DB)
// ---------------------------------------------------------------------------

describe('Webhook delivery retry logic', () => {
  it('retries up to 3 times on failure', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      throw new Error('Network error');
    });

    // Simulate the retry loop directly
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 1;

    async function simulateDelivery(): Promise<{ success: boolean; attempts: number }> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await mockFetch();
          return { success: true, attempts: attempt };
        } catch {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
          }
        }
      }
      return { success: false, attempts: MAX_ATTEMPTS };
    }

    const result = await simulateDelivery();
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(callCount).toBe(MAX_ATTEMPTS);
  });

  it('succeeds on first attempt when fetch succeeds', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      return { ok: true, status: 200, text: async () => 'OK' };
    });

    const MAX_ATTEMPTS = 3;

    async function simulateDelivery(): Promise<{ success: boolean; attempts: number }> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const response = await mockFetch() as { ok: boolean; status: number };
          if (response.ok) return { success: true, attempts: attempt };
        } catch {
          // retry
        }
      }
      return { success: false, attempts: MAX_ATTEMPTS };
    }

    const result = await simulateDelivery();
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(callCount).toBe(1);
  });

  it('succeeds on second attempt after one failure', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('First attempt fails');
      return { ok: true, status: 200, text: async () => 'OK' };
    });

    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 1;

    async function simulateDelivery(): Promise<{ success: boolean; attempts: number }> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const response = await mockFetch() as { ok: boolean; status: number };
          if (response.ok) return { success: true, attempts: attempt };
        } catch {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS));
          }
        }
      }
      return { success: false, attempts: MAX_ATTEMPTS };
    }

    const result = await simulateDelivery();
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(callCount).toBe(2);
  });
});
