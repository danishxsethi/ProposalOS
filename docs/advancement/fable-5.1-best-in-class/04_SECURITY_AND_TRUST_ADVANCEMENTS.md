# 04 — Security and Trust Advancements — Fable 5.1 Best-in-Class

## Current state (recap, re-checked)

- Auth: `lib/auth.ts` NextAuth Google+Credentials `PASSWORD_POLICY` bcrypt, `lib/auth.config.ts:100` trustHost + `__Host-` strict+secure `maxAge 3600`, `wrappedPrismaAdapter.ts` envelope AES-GCM for `Account.token`, `adapterContext.ts` frozen allowlist 4.
- Keys: `pe_live_` SHA256 + scopes + daily limit in `lib/auth/apiKeys.ts:407`, `apiKeySatisfiesRole` never `super_admin` via tenant key, env `API_KEY` timingSafeEqual + `DEFAULT_TENANT_ID`, `x-internal-ops-key` server-to-server.
- Crons 23 all `verifyCronAuth` Bearer `CRON_SECRET` timingSafeEqual + 5/m `cronAuth.ts` fail-closed; `middleware.ts:123` Only CSP nonce/OWASP/CORS/traceparent, **no API auth** — per-route `withAuth/withRole/withPermission`.
- Webhooks: `stripe/webhook` `constructEvent` + 10/m on sig fail, `outreach/webhook` `verifyResendWebhook` Svix 300s, `billing/webhook` re-export no sig string, `worker/audit-job` none.
- Tokens: `Proposal.webLinkToken` uuid unique, `publicAccess.ts` 90d code TTL + `publicAccessRevokedAt` + `publicationFingerprint` provenance chain, per-token 100/h + invalid 10/h.
- Tenant: `lib/prisma.ts:195` single `$extends` + `lib/tenant/context.ts:182` ALS + same-tx `set_config('app.current_tenant_id')`, 95 models ~62 `tenantId` FORCED RLS (`\d "Audit"` proof), adapter allowlist, `self-evolving-prompts/db.ts` `withRawExecutor(requireTenant:true)`, last `sniperWorker:575` Unsafe `$executeRawUnsafe($1)`.
- PII: `lib/security/piiScrubber.ts` 20 `INJECTION_PATTERNS` + redaction + 10k cap, `lib/llm/output-validator.ts` PROBLEMATIC_PATTERNS (offensive/legal/PII/promptLeak/encoding) canned deflection.

## Advancements (see 03 ledger for acceptance evidence; here is narrative)

### 1. Machine-enforced route authorization (ADV-AUTH-01 — T0)

**Why:** Humans will forget `withRole` on the next `app/api/foo/route.ts`. Today ~79 grep-no-guard routes are "typed as public by omission". That is how admin metrics leak.
**Design:** `scripts/build-target-list.ts:75` already enumerates targets; add `scripts/route-census.ts` that walks `app/api/**/route.ts`, parses exported handlers, classifies each into `protected` (withAuth/withRole/withPermission/verifyCronAuth), `sig_verified` (Stripe/Resend constructEvent), `public_token`, `public_intentional` (health/csrf/openapi/widget with CORS allowlist), or `internal` (worker with WORKER_SECRET). It emits `docs/audits/.../artifacts/route-matrix.json` + `evidence/route-census.csv` already seen, and CI fails if any file in `app/api` is `UNVERIFIED_EXPOSED`. The boundary tests `tests/architecture/auth-session-boundary.test.ts:183` become *generators* of this census instead of hard-coded allowlists.
**Security impact:** public exposure becomes build-break, not review hope.
**Files:** `middleware.ts`, `lib/middleware/*`, `app/api/**/route.ts`, new `scripts/route-census.ts`, `.github/workflows/test.yml`.

### 2. Close orphan privs (ADV-AUTH-02 — T0)

- Gate `app/api/admin/model-metrics/route.ts` behind `withRole('super_admin')` (currently NONE).
- Delete `app/api/billing/webhook/route.ts:1` re-export; keep only `/api/stripe/webhook` and document single dashboard URL. Duplicate URL doubles auditTrail if misconfigured — dedup hides but pollutes.
- Guard `app/api/worker/audit-job/route.ts` with `WORKER_SECRET` timingSafeEqual (header `x-worker-secret`), rate-limit 5/m on fail, audit `worker.auth_failed`.
**Proof:** boundary tests green + manual `curl -H 'Authorization: Bearer bad' 401`.

### 3. Fix last Unsafe + Harden safeFetch (ADV-SEC-01/02 — T0)

- Replace `sniperWorker:575 $executeRawUnsafe($1)` with `Prisma.sql` tagged template so `requireTenant` contract is total.
- Either move `lib/maps/googleMapsProvider.ts` raw `fetch` to `lib/security/safeFetch.ts` or enumerate its `fetch` in `tests/architecture/ssrf-fetch-boundary.test.ts:574` allowlist with DNS-rebinding guard + `ipaddr.js` blocklist (10/8, 172.16/12, 169.254/16, ::1) and redirect `follow:0` + allowlist hosts. Prefer `safeFetch`.

### 4. Harden data-access pattern

- Keep `self-evolving-prompts/db.ts` `withRawExecutor(requireTenant:true)` default; audit any caller that passes `requireTenant:false` via census.
- Add `FOR UPDATE` advisory lock pattern to entitlement checks (ADV-DATA-01) — same `tenantId` hashtext lock prevents TOCTOU without deadlocking on `Tenant` row.

### 5. Make tenant isolation provable, not asserted (T0→T1)

Ship `tests/security/hostile-tenant.test.ts` that creates two tenants (A,B) via `withSystemDbBypass`, seeds audits/findings/proposals/ApiKey/UsageRecord under A, then asserts B via `runWithTenantAsync(B)` cannot read/update/delete any of them (including `prisma.$queryRaw` path). Run it through pgbouncer `proposal_rls_smoke` transaction pool to prove GUC survives pooling. The audit trail `prisma/AuditTrailEvent` must log `tenantId` on each mutation, and `admin/metrics` must respect RLS or explicit bypass reason.

### 6. Token lifecycle clarity (T1)

Keep `webLinkToken` uuid + 90d + `publicAccessRevokedAt` + fingerprint, but add `Proposal.publicLinkExpiresAt` column (nullable, defaults now+90d) so revocation is row-local not code-local, and UI shows "expires in 73 days — regenerate". Add `rotatePublicLink()` that revokes old and mints new token atomically — needed for leak rotation.

### 7. Secret & key lifecycle (T2)

- Rotate `CRON_SECRET`/`WORKER_SECRET`/`RESEND_WEBHOOK_SECRET` via `scripts/validate-env.ts` expiry check + quarterly job.
- `ApiKey` already has `rotateApiKey` — add `expiresAt` UI + 7-day pre-expiry warning email.

**Why this design is best-in-class:** Stripe/Linear-level trust is not "we have RLS" — it is "RLS + census gate + hostile-pair artifact + leaseToken ownership + signature-verified webhooks + no Unsafe == no new prod route can ship public by mistake". That is security as system, not checklist.
