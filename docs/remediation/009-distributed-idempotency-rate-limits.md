# Remediation 009 — Distributed Idempotency & Rate Limiting

**Date:** 2026-05-15  
**Status:** COMPLETE  
**Blocker resolved:** P0/P1 — per-process in-memory idempotency and rate limiting unsafe for multi-instance Cloud Run  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## Original Issue

Both `lib/middleware/idempotency.ts` and `lib/middleware/rateLimit.ts` stored state in
per-process `Map`/object instances:

```typescript
// idempotency.ts (before)
const memoryCache = new Map<string, { result: unknown; timestamp: number }>();

// rateLimit.ts (before)
const memoryStore: RateLimitStore = {};
```

When Cloud Run scales to multiple instances each instance had its own counters and
idempotency records. Consequences:

- Rate limits could be bypassed by spreading requests across instances.
- Idempotency keys were not shared, so duplicate requests could be processed multiple
  times — leading to duplicate audits, duplicate charges, and inconsistent state.
- `withIdempotencyMemory` explicitly named the unsafe path; callers in
  `app/api/audit/route.ts` and `app/api/audit/batch/route.ts` used it directly.

---

## Chosen Shared-Store Design

### Interface (`lib/store/shared.ts`)

A minimal KV interface with five operations:

```typescript
interface SharedStore {
  get(key); // null when missing/expired
  set(key, value, ttlSeconds); // overwrite with TTL
  setIfNotExists(key, value, ttl); // atomic NX; returns true when set
  increment(key, ttlSeconds); // atomic INCR + EXPIRE; returns new count
  del(key); // no-op if absent
}
```

### Adapters

| Adapter           | When used                                  | Backend                           |
| ----------------- | ------------------------------------------ | --------------------------------- |
| Redis adapter     | `REDIS_URL` is set                         | ioredis, lazy singleton           |
| In-memory adapter | dev/test, or `SHARED_STORE_REQUIRED=false` | `Map<string, {value, expiresAt}>` |

### Production guard

If `NODE_ENV=production` and no Redis is available, `getSharedStore()` **throws** with a
clear message, preventing a broken deployment from silently running without distributed
state. The escape hatch `SHARED_STORE_REQUIRED=false` produces a loud warning instead
and falls back to in-memory (for emergency single-instance use only).

### Idempotency key scheme

```
idempotency:<tenantId>:<rawKey>[:<bodyHash>]   ← cached response
idempotency-lock:<tenantId>:<rawKey>           ← in-progress lock (TTL=60s)
```

Tenant-scoped keys prevent cross-tenant cache poisoning.

### Rate-limit key scheme

```
rl:api:<apiKey>[:<endpoint>]      ← API-key authenticated
rl:session:<id>[:<endpoint>]      ← explicit session
rl:tenant:<id>[:<endpoint>]       ← explicit tenant
rl:ip:<ip>[:<endpoint>]           ← public/widget routes (fallback)
```

---

## Files Changed

| File                                                          | Change                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/store/shared.ts`                                         | **New** — SharedStore interface, Redis adapter, in-memory adapter, factory                                                                       |
| `lib/middleware/rateLimit.ts`                                 | Rewritten — removed per-process `memoryStore` and inline Redis; uses `getSharedStore().increment()`                                              |
| `lib/middleware/idempotency.ts`                               | Rewritten — removed per-process `memoryCache`; uses `getSharedStore()` with distributed locking; `withIdempotencyMemory` kept as deprecated shim |
| `app/api/audit/route.ts`                                      | `withIdempotencyMemory` → `withIdempotency`                                                                                                      |
| `app/api/audit/batch/route.ts`                                | `withIdempotencyMemory` → `withIdempotency`                                                                                                      |
| `lib/config/validateEnv.ts`                                   | Added `SHARED_STORE_REQUIRED` to `OPTIONAL_ENV_VARS`                                                                                             |
| `.env.example`                                                | Expanded `REDIS_URL` comment; added `SHARED_STORE_REQUIRED` escape hatch                                                                         |
| `tests/security/shared-store-idempotency-ratelimit.test.ts`   | **New** — 25 tests                                                                                                                               |
| `docs/remediation/009-distributed-idempotency-rate-limits.md` | This file                                                                                                                                        |

---

## Production Env Requirements

| Variable                | Required?                                   | Purpose                                                                             |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `REDIS_URL`             | **Required in production** (multi-instance) | Redis connection string for shared store                                            |
| `SHARED_STORE_REQUIRED` | Optional (default: `true` behavior)         | Set to `"false"` to allow in-memory fallback in production (unsafe, emergency only) |

**Startup behaviour without Redis in production:**

```
[SharedStore] FATAL: NODE_ENV=production but no Redis is configured.
Set REDIS_URL to a Redis/Upstash instance, or set SHARED_STORE_REQUIRED=false
to allow in-memory fallback (unsafe in multi-instance deployments).
```

---

## Tests Added

File: `tests/security/shared-store-idempotency-ratelimit.test.ts` — 25 tests

### SharedStore in-memory adapter (8 tests)

- `get` returns null for missing key
- `set`/`get` round-trip
- `del` removes a key
- `setIfNotExists` returns true when absent
- `setIfNotExists` returns false when present
- `increment` starts at 1 for new key
- `increment` accumulates correctly
- Expired key treated as absent

### Idempotency (9 tests)

- First request executes handler and stores result
- Duplicate request returns cached result without re-executing handler
- Returns 409 when request is already in progress (lock held)
- Handler runs without idempotency when no Idempotency-Key header
- Handler runs without idempotency when no tenant context
- Does NOT cache 5xx responses (safe retry)
- Concurrent duplicate keys → second gets 409 (lock prevents re-entry)
- `extractIdempotencyKey` reads all supported header names

### Rate limiting (8 tests)

- Allows requests within limit
- Denies request when limit exceeded
- Different IPs have isolated counters
- TenantId-keyed limits isolated from IP-keyed limits
- `withRateLimit` returns 429 JSON with Retry-After
- `withRateLimit` adds `X-RateLimit-*` headers to successful responses
- Counter resets after TTL window (simulate expiry)
- Endpoint suffix isolates counters per endpoint

---

## Commands Run and Outputs

```bash
npx vitest run tests/security/shared-store-idempotency-ratelimit.test.ts
# → Test Files  1 passed (1)
# → Tests  25 passed (25)

npx vitest run tests/security/
# → Test Files  7 passed (7)
# → Tests  70 passed (70)
```

---

## Remaining Risks

1. **`withIdempotencyMemory` is deprecated but still callable.** Any future caller that imports it by name will get the distributed implementation (safe), but the name is misleading. Remove it in a follow-up cleanup.

2. **Redis connection failure in production fails open for rate limiting.** `checkRateLimit` catches store errors and returns `success: true` to prevent a Redis outage from taking down the API. This means rate limits are temporarily bypassed if Redis is unavailable. Acceptable trade-off for availability; monitor Redis health.

3. **Idempotency does NOT fail open.** A store error during idempotency check throws and returns 500. This is intentional — silently processing a duplicate could be worse (e.g., double billing) than a transient 500.

4. **`ioredis` is already in `package.json` as a dependency.** No new package was added.

5. **In-memory adapter does not survive process restarts.** This is expected and documented. For production safety, Redis must be set.

6. **Lock TTL is 60 seconds.** If a handler takes longer than 60 s, the lock expires and a duplicate could slip through. The 60 s default is intentionally generous for the current audit/proposal pipeline latencies. If handlers regularly exceed 60 s, extend `IN_PROGRESS_TTL_SECONDS` in `lib/middleware/idempotency.ts`.

---

## Acceptance Criteria Status

| Criterion                                                          | Status                            |
| ------------------------------------------------------------------ | --------------------------------- |
| Idempotency no longer relies on per-process memory in production   | ✅                                |
| Rate limiting no longer relies on per-process memory in production | ✅                                |
| Production config requires or clearly validates a shared store     | ✅ (throws on startup if missing) |
| Local/test has deterministic fake/in-memory support                | ✅                                |
| Duplicate idempotency-key behavior correct and tested              | ✅ (25 tests)                     |
| Rate-limit behavior correct and tested                             | ✅                                |
| No secrets changed or exposed                                      | ✅                                |
| No production/staging/cloud resources touched                      | ✅                                |
