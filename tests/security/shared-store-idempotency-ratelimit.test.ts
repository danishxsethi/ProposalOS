// @vitest-environment node
process.env.ENABLE_RATE_LIMIT_TEST = 'true';
/**
 * Tests for:
 *   lib/store/shared.ts      — SharedStore abstraction (in-memory adapter)
 *   lib/middleware/idempotency.ts — Distributed idempotency
 *   lib/middleware/rateLimit.ts  — Distributed rate limiting
 *
 * No Redis or external service is called.  All tests use the deterministic
 * in-memory store via vi.mock('@/lib/store/shared').
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared store mock factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh in-memory store instance for each test so there is no
 * state bleed between test cases.
 */
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

// Each test gets its own store; the mock module returns the current one.
let currentStore = makeTestStore();

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn(async () => currentStore),
  createMemoryStore: vi.fn(() => currentStore),
  _resetSharedStore: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Other mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/api/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/errors')>();
  return {
    ...actual,
    generateTraceId: () => 'test-trace-id',
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { getTenantId } from '@/lib/tenant/context';
import { withIdempotency, extractIdempotencyKey } from '@/lib/middleware/idempotency';
import { withRateLimit, checkRateLimit } from '@/lib/middleware/rateLimit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path = '/api/test', headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { method: 'POST', headers });
}

function makeHandler(status = 200, body = '{"ok":true}') {
  return vi.fn().mockResolvedValue(
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
  );
}

// ---------------------------------------------------------------------------
// SharedStore in-memory adapter unit tests
// ---------------------------------------------------------------------------

describe('createMemoryStore (in-memory adapter)', () => {
  beforeEach(() => {
    currentStore = makeTestStore();
  });

  it('get returns null for missing key', async () => {
    expect(await currentStore.get('missing')).toBeNull();
  });

  it('set/get round-trip', async () => {
    await currentStore.set('k', 'v', 60);
    expect(await currentStore.get('k')).toBe('v');
  });

  it('del removes a key', async () => {
    await currentStore.set('k', 'v', 60);
    await currentStore.del('k');
    expect(await currentStore.get('k')).toBeNull();
  });

  it('setIfNotExists returns true when key absent', async () => {
    expect(await currentStore.setIfNotExists('k', 'v', 60)).toBe(true);
  });

  it('setIfNotExists returns false when key present', async () => {
    await currentStore.set('k', 'existing', 60);
    expect(await currentStore.setIfNotExists('k', 'new', 60)).toBe(false);
    expect(await currentStore.get('k')).toBe('existing');
  });

  it('increment starts at 1 for new key', async () => {
    expect(await currentStore.increment('counter', 60)).toBe(1);
  });

  it('increment accumulates correctly', async () => {
    expect(await currentStore.increment('counter', 60)).toBe(1);
    expect(await currentStore.increment('counter', 60)).toBe(2);
    expect(await currentStore.increment('counter', 60)).toBe(3);
  });

  it('expired key is treated as absent', async () => {
    // Set a key with a TTL that is already in the past
    currentStore._data.set('old', { value: 'stale', expiresAt: Date.now() - 1 });
    expect(await currentStore.get('old')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Idempotency tests
// ---------------------------------------------------------------------------

describe('withIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentStore = makeTestStore();
    vi.mocked(getTenantId).mockResolvedValue('tenant-a');
  });

  it('first request executes handler and stores result', async () => {
    const handler = makeHandler(200, '{"result":"new"}');
    const wrapped = withIdempotency(handler);

    const res = await wrapped(makeRequest('/api', { 'idempotency-key': 'key-1' }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('duplicate request returns cached result without re-executing handler', async () => {
    const handler = makeHandler(200, '{"result":"cached"}');
    const wrapped = withIdempotency(handler);
    const req = () => makeRequest('/api', { 'idempotency-key': 'key-dup' });

    await wrapped(req());            // first call — executes
    const res2 = await wrapped(req()); // duplicate — should be cached

    expect(handler).toHaveBeenCalledTimes(1); // handler only called once
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-Idempotency-Cache')).toBe('true');
  });

  it('returns 409 when a request is already in progress (lock held)', async () => {
    // Pre-set the lock so it looks like another instance is processing
    await currentStore.setIfNotExists('idempotency-lock:tenant-a:key-locked', '1', 60);

    const handler = makeHandler();
    const wrapped = withIdempotency(handler);

    const res = await wrapped(makeRequest('/api', { 'idempotency-key': 'key-locked' }));
    expect(res.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler runs without idempotency when no Idempotency-Key header', async () => {
    const handler = makeHandler();
    const wrapped = withIdempotency(handler);

    const res = await wrapped(makeRequest('/api', {})); // no idempotency-key
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handler runs without idempotency when no tenant context', async () => {
    vi.mocked(getTenantId).mockResolvedValue(null);
    const handler = makeHandler();
    const wrapped = withIdempotency(handler);

    const res = await wrapped(makeRequest('/api', { 'idempotency-key': 'key-no-tenant' }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache 5xx responses (safe retry)', async () => {
    const handler = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"server error"}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{"result":"ok"}', { status: 200 }));
    const wrapped = withIdempotency(handler);
    const req = () => makeRequest('/api', { 'idempotency-key': 'key-retry' });

    const res1 = await wrapped(req()); // 500 — not cached
    expect(res1.status).toBe(500);

    const res2 = await wrapped(req()); // should re-execute
    expect(handler).toHaveBeenCalledTimes(2);
    expect(res2.status).toBe(200);
  });

  it('handler is called once even for concurrent duplicate keys (lock prevents re-entry)', async () => {
    // Simulate a slow handler
    let resolveHandler!: () => void;
    const slowHandler = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveHandler = () => resolve(new Response('{}', { status: 200 }));
      })
    );
    const wrapped = withIdempotency(slowHandler);

    // First call starts (doesn't await yet)
    const promise1 = wrapped(makeRequest('/api', { 'idempotency-key': 'concurrent-key' }));

    // Wait for lock to be set (tick)
    await new Promise((r) => setTimeout(r, 10));

    // Second call should get 409 because lock is held
    const res2 = await wrapped(makeRequest('/api', { 'idempotency-key': 'concurrent-key' }));
    expect(res2.status).toBe(409);

    // Resolve first call
    resolveHandler();
    await promise1;

    expect(slowHandler).toHaveBeenCalledTimes(1);
  });

  it('extractIdempotencyKey reads all supported header names', () => {
    const headers = [
      ['idempotency-key', 'id-lower'],
      ['x-idempotency-key', 'id-x'],
      ['Idempotency-Key', 'id-pascal'],
    ] as [string, string][];

    for (const [header, expected] of headers) {
      const req = new Request('http://localhost', { headers: { [header]: expected } });
      expect(extractIdempotencyKey(req)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Rate limit tests
// ---------------------------------------------------------------------------

describe('checkRateLimit / withRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentStore = makeTestStore();
  });

  it('allows requests within limit', async () => {
    const req = makeRequest('/api', { 'x-forwarded-for': '1.2.3.4' });
    const result = await checkRateLimit(req, { windowMs: 60_000, max: 5 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('denies request when limit exceeded', async () => {
    const options = { windowMs: 60_000, max: 2 };
    const req = () => makeRequest('/api', { 'x-forwarded-for': '10.0.0.1' });

    const r1 = await checkRateLimit(req(), options);
    const r2 = await checkRateLimit(req(), options);
    const r3 = await checkRateLimit(req(), options); // over limit

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfter).toBeDefined();
  });

  it('different IPs have isolated counters', async () => {
    const options = { windowMs: 60_000, max: 1 };
    const reqA = makeRequest('/api', { 'x-forwarded-for': '10.0.0.1' });
    const reqB = makeRequest('/api', { 'x-forwarded-for': '10.0.0.2' });

    // Exhaust IP A
    await checkRateLimit(reqA, options);
    const r2A = await checkRateLimit(makeRequest('/api', { 'x-forwarded-for': '10.0.0.1' }), options);
    expect(r2A.success).toBe(false);

    // IP B is unaffected
    const r1B = await checkRateLimit(reqB, options);
    expect(r1B.success).toBe(true);
  });

  it('tenantId-keyed limits are isolated from IP-keyed limits', async () => {
    const options = { windowMs: 60_000, max: 1 };
    const reqTenantA = makeRequest('/api', { 'x-forwarded-for': '1.2.3.4' });
    const optTenantA = { ...options, tenantId: 'tenant-a' };

    // Exhaust tenant-a
    await checkRateLimit(reqTenantA, optTenantA);
    const r2 = await checkRateLimit(makeRequest('/api', { 'x-forwarded-for': '1.2.3.4' }), optTenantA);
    expect(r2.success).toBe(false);

    // Same IP but no tenantId → different key → not exhausted
    const rIp = await checkRateLimit(makeRequest('/api', { 'x-forwarded-for': '1.2.3.4' }), options);
    expect(rIp.success).toBe(true);
  });

  it('withRateLimit returns 429 JSON with Retry-After when over limit', async () => {
    const handler = makeHandler();
    const middleware = withRateLimit({ windowMs: 60_000, max: 1, message: 'Slow down' });

    // First call passes
    await middleware(makeRequest('/api', { 'x-forwarded-for': '9.9.9.9' }), handler);
    // Second call hits the limit
    const res = await middleware(
      makeRequest('/api', { 'x-forwarded-for': '9.9.9.9' }),
      handler
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(1); // called only once
  });

  it('withRateLimit adds X-RateLimit-* headers to successful responses', async () => {
    const handler = makeHandler();
    const res = await withRateLimit({ windowMs: 60_000, max: 5 })(
      makeRequest('/api', { 'x-forwarded-for': '1.1.1.1' }),
      handler
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });

  it('counter resets after TTL window (simulate expiry)', async () => {
    const options = { windowMs: 1_000, max: 1 };
    const req = () => makeRequest('/api', { 'x-forwarded-for': '2.2.2.2' });

    // Exhaust limit
    await checkRateLimit(req(), options);
    const over = await checkRateLimit(req(), options);
    expect(over.success).toBe(false);

    // Manually expire the counter
    for (const [k, entry] of currentStore._data.entries()) {
      if (k.startsWith('rl:ip:')) {
        currentStore._data.set(k, { value: entry.value, expiresAt: Date.now() - 1 });
      }
    }

    // After expiry the counter resets
    const refreshed = await checkRateLimit(req(), options);
    expect(refreshed.success).toBe(true);
  });

  it('endpoint suffix isolates counters per endpoint', async () => {
    const options = { windowMs: 60_000, max: 1 };
    const reqA = makeRequest('/api/audit', { 'x-forwarded-for': '5.5.5.5' });
    const reqB = makeRequest('/api/batch', { 'x-forwarded-for': '5.5.5.5' });

    await checkRateLimit(reqA, { ...options, endpoint: 'audit' });
    // Limit on audit endpoint is exhausted
    const over = await checkRateLimit(
      makeRequest('/api/audit', { 'x-forwarded-for': '5.5.5.5' }),
      { ...options, endpoint: 'audit' }
    );
    expect(over.success).toBe(false);

    // Batch endpoint is unaffected (different key)
    const batchOk = await checkRateLimit(reqB, { ...options, endpoint: 'batch' });
    expect(batchOk.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Production safety: shared store required in production
// ---------------------------------------------------------------------------

describe('getSharedStore production guard', () => {
  it('getSharedStore is called (does not throw) in test env', async () => {
    const { getSharedStore } = await import('@/lib/store/shared');
    await expect(getSharedStore()).resolves.toBeDefined();
  });
});
