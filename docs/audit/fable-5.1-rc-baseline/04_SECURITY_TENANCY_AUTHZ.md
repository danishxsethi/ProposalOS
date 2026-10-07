# 04 — Security, Tenancy, Authz — Fable 5.1

## Methods inventoried

- Google OAuth + Credentials (bcrypt, PASSWORD_POLICY) + DB-backed JWT session (1h, Session revocation, lastSeenAt)
- pe_live_ API keys SHA256 + scopes + daily rateLimit + expiry
- env API_KEY timing-safe SHA256+timingSafeEqual (single tenant, needs DEFAULT_TENANT_ID, never super_admin)
- x-internal-ops-key server-to-server
- CRON_SECRET Bearer timingSafeEqual(sha256) + 5/m ratelimit per route (23 crons fail-closed if unset)
- Stripe webhook constructEvent + 10/m on sig fail; Resend Svix HMAC SHA256 300s window
- Proposal webLinkToken uuid v4, 90d code TTL + publicAccessRevokedAt, 10/h invalid IP + 100/h token hash

## Tenant isolation

- ~62 models have tenantId required; RLS policies `tenant_isolation` + `tenant_bypass` on all tenant-owned tables.
- Prisma $extends enforces `MissingTenantError` unless `bypassRls` with reason + caller stack.
- Auth adapter allowlist 4 models (User/Account/Session/VerificationToken) via `runWithAuthAdapterContext`.
- Raw SQL: tagged-template `$queryRaw` + `self-evolving-prompts/db.ts` withRawExecutor + requireTenant true. One `.$executeRawUnsafe` with $1 param in sniperWorker (low exploitability, fix to Prisma.sql).
- Public proposal resolve uses `runWithTenantBypass('public-proposal-token-resolution')` narrow scope + provenance/fingerprint chain + metric filtering.

## Route census (147)

- Protected by withRole/withPermission/withAuth: admin/*, audit POSTs, pipeline/*, tenants/*, analytics/tenant/*, etc.
- Public by design: health/csrf/openapi/auth, public/audit, widget/quick-audit (CORS allowlist), proposal/token/*, outreach/track/*, email/unsubscribe
- Cron 23 all verifyCronAuth
- Flagged: admin/model-metrics NONE (no guard), billing/webhook no constructEvent string, ~79 files grep shows no guard — many are intentionally public but need per-route manual audit before RC (audit/[id]/*, proposals GETs, finding, delivery/artifacts, prompt/experiments)
- Middleware does NOT enforce API auth; omission = public. Needs lint rule before RC.

## Evidence

- `psql \d "Audit"` RLS policies tenant_isolation + tenant_bypass FORCED
- `lib/middleware/cronAuth.ts:verifyCronAuth` + 23 files verify
- `lib/prisma.ts:applyRlsContext` set_config on same tx
- `lib/auth/rbac.ts:apiKeySatisfiesRole` tenant never super_admin

## Hostile pair test

NOT RUN on this audit. Required before G2: create two tenants, attempt cross-read on audits/findings/proposals/apiKeys/usage/billing/branding/jobs/files — must be denied.

