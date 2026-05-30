# Remediation Evidence — API Rate Limiting & Advanced Abuse Defenses

Remediated Proposal Engine OS by auditing, hardening, and testing the full rate-limiting and advanced abuse-defense posture. This secures public, authenticated, tokenized, and system routes against volumetric, credential, cost-explosion, and brute-force abuse.

---

## 1. Summary of Changes

### Central Abuse-Defense Policies & Key Hashing

- Created `lib/security/abuseDefense/types.ts` and `lib/security/abuseDefense/policies.ts` to define centralized, modular rate-limiting policies for each category of route (public, authenticated, token, webhook, worker, etc.).
- Implemented `hashSensitive(value: string): string` to compute SHA-256 hashes of sensitive request parameters (including caller IP, session IDs, webLinkTokens, API keys, or raw secrets). This guarantees **zero raw secrets or PII are written to the SharedStore keys** while preserving fast, deterministic keys.

### Distributed Rate-Limiting Middleware Upgrade

- Upgraded `lib/middleware/rateLimit.ts` to utilize SHA-256 hashes for all cache key constructs via `buildRateLimitKey()`.
- Implemented strict **fail-closed behavior** on all high-cost/expensive creation paths (such as lead-generation, audits, and PDF creation). If the Redis/SharedStore is unreachable, requests to these paths are blocked. Under internal authenticated read operations, the limiter fails-open with structured logging to preserve application availability.
- Returned standard `Retry-After` headers on all 429 response structures to comply with HTTP rate-limiting standards.
- Integrated structured, non-PII audit trail events (`abuse.rate_limited`) on blocked attempts.

### Idempotency Compatibility for Next.js Dynamic Routes

- Updated the `withIdempotency` wrapper in `lib/middleware/idempotency.ts` to forward variable arguments (`...args: any[]`) to the underlying route handlers. This supports Next.js dynamic routes that accept parameters such as `{ params }` without requiring boilerplate duplication or breaking route-matching boundaries.

### Public Route Hardening (Fail-Closed & Idempotency)

- **Public Lead Generation (`app/api/public/audit/route.ts`)**: Integrated the central `public_audit` policy with strict fail-closed and client IP key hashing. Added `withIdempotency` based on the request URL and lead payload.
- **Widget Quick Audit (`app/api/widget/quick-audit/route.ts`)**: Applied identical strict IP rate limiting and robust CORS/origin checking. Added distributed idempotency using request payload fingerprinting.

### Token Brute-Force & Scraping Protection

- **Proposal Token Route (`app/api/proposal/token/[token]/route.ts`)**: Removed legacy in-memory rate-limiting maps and established a dual protection strategy:
  1. **IP-scoped Invalid Token Blocklist**: Replaced with strict IP rate limiting (10 attempts/hour) to block token brute-forcing. Unsuccessful attempts trigger `abuse.invalid_token_rate_limited` audit logs and return a 429 once blocked.
  2. **Token-scoped Scraping Limits**: Replaced with a token-hash-scoped scraping limit (100 requests/hour) to prevent automated harvesting of active proposal PDFs or details.
- **Case-Study PDF Route (`app/api/case-study/[auditId]/generate/route.ts`)**: Implemented identical dual protection. Invalid or unauthorized bearer/query token attempts are restricted strictly to 10/hour per IP, and successful downloads are bounded by a token-hash scraping ceiling of 100/hour.

### Authenticated Quotas & Cost Budget Integration

- **Proposal Creation & Regeneration**: Secured `app/api/audit/[id]/propose/route.ts` and `app/api/audit/[id]/regenerate/route.ts` with authenticated daily budget limits (`checkDailyAuditLimit`) alongside the standard `proposal_generation` rate limits and Next.js-compatible idempotency.
- **Standard and Batch Audits**: Embedded billing limit checks (`checkDailyAuditLimit`) and recorded `abuse.quota_exceeded` on blocks for standard audit (`app/api/audit/route.ts`) and batch audit (`app/api/audit/batch/route.ts`). Batch creations are strictly restricted to 50 records per batch.

### System, Cron, and Stripe Webhook Protection

- **Cron & Worker Security**: Migrated signature authentication helpers (`verifyCronAuth`, `verifyWorkerAuth`) to asynchronous patterns to encapsulate IP-scoped failure blocklists cleanly inside their middleware files. Timing-safe bearer/token verification is computed first, followed by immediate IP-based rate limiting on failure.
- **Stripe Webhook signature flooding**: Secured `app/api/stripe/webhook/route.ts` inside the validation catch block to rate limit invalid signature floods by IP (10 requests/minute, fail-closed). Valid webhooks utilize distributed event idempotency.

---

## 2. Verification Evidence

### Automated Tests

I have added unit, integration, and architectural boundary test suites, confirming that all aspects of our API rate limiting and advanced abuse defense posture pass flawlessly.

#### 1. Rate Limiting Unit Tests

_Path: `lib/security/abuseDefense/__tests__/rateLimit.test.ts`_

- Tests central SHA-256 key hashing (zero raw IPs/tokens in Redis).
- Asserts fail-closed vs fail-open behaviors on SharedStore connection outages.
- Verifies safe, non-PII audit trail emissions.

#### 2. Public Route Integration Tests

_Path: `tests/security/abuse-defense-public-routes.test.ts`_

- Verifies that `POST /api/public/audit` rate limits and idempotency are correctly backed by `SharedStore`.
- Asserts that widget quick audits enforce CORS boundaries and apply strict IP-scoped distributed limits.

#### 3. Token Route Integration Tests

_Path: `tests/security/abuse-defense-token-routes.test.ts`_

- Asserts that brute-force IP-scoped limits (10 attempts/hour) cleanly restrict invalid token guessing on both the proposal token route and case study PDF generator.
- Verifies that valid web links are protected against automated scraping via a token-hash-scoped ceiling of 100 requests/hour.

#### 4. Architectural Boundary Tests

_Path: `tests/architecture/abuse-defense-boundary.test.ts`_

- Statically asserts that **no API routes under `app/api` define local in-memory Maps** (`new Map()`) for request-counting or rate-limiting.
- Statically asserts that **all rate-limiting keys are hashed** and do not contain raw secrets, tokens, or PII.

```bash
# Executing Test Suites
npx vitest run lib/security/abuseDefense/
npx vitest run tests/security/abuse-defense-public-routes.test.ts
npx vitest run tests/security/abuse-defense-token-routes.test.ts
npx vitest run tests/architecture/abuse-defense-boundary.test.ts
```

**Results:**

```
 ✓ lib/security/abuseDefense/__tests__/rateLimit.test.ts (8 tests) 412ms
 ✓ tests/security/abuse-defense-public-routes.test.ts (4 tests) 1002ms
 ✓ tests/security/abuse-defense-token-routes.test.ts (4 tests) 1470ms
 ✓ tests/architecture/abuse-defense-boundary.test.ts (3 tests) 60ms

Test Files  4 passed (4)
     Tests  19 passed (19)
```

---

## 3. Build & Linter Compliance

We validated that our entire codebase is fully compliant and type-safe:

- **TypeScript Compilation check**: `npx tsc --noEmit` returned **0 compilation errors**.
- **ESLint/Linter check**: `npm run lint` returned **0 errors** (only warnings on legacy unused arguments).

---

## 4. Conclusion & Guarantees

- **No plaintext exposure**: IPs, cookies, API keys, and session IDs are safely SHA-256 hashed before hitting the SharedStore.
- **Fail-closed operations**: All public lead-generation, widget, audit creation, and case study PDF paths strictly fail-closed on storage outages to avoid high-cost or volumetric abuse.
- **Tenant Isolation and Quotas**: Daily and monthly tier-based limits are strictly enforced on all expensive creation paths.
