# 014 — Auth-Table RLS Strategy

**Status:** COMPLETE  
**Branch:** phase-2-rls-migration  
**Date:** 2026-05-15

---

## Original Issue

`PHASE-2.6-K-LOCAL-RLS-VERIFICATION.md` documented:

> `Account` / `Session` — still intentionally blocked … defer to auth-adapter context plan

The audit listed "Auth-table RLS deferred" as a high-risk item. Without a
strategy, two failure modes were possible:

1. NextAuth's `PrismaAdapter` would call `prisma.user.findUnique({ email })`
   during login _before_ tenant context is established → `MissingTenantError`
   → login broken.
2. If we wrapped the entire adapter in `runWithTenantBypass` to fix #1, that
   broad bypass would be reachable by any business code that imports the
   helper, defeating tenant isolation.

---

## Strategy Chosen

**Pattern A (global identity tables) + Pattern C (narrow guarded bypass).**

### Auth tables classified

| Table               | Classification                                  | tenantId | RLS                                             |
| ------------------- | ----------------------------------------------- | -------- | ----------------------------------------------- |
| `User`              | Tenant-scoped identity                          | required | `tenant_isolation` + `tenant_bypass` (existing) |
| `Account`           | **Global identity** (OAuth/Credentials linking) | none     | `tenant_bypass` only (new)                      |
| `Session`           | **Global identity** (unused under JWT strategy) | none     | `tenant_bypass` only (new)                      |
| `VerificationToken` | **Global identity** (email magic-link)          | none     | `tenant_bypass` only (new)                      |

### Why no `tenantId` on Account / Session / VerificationToken?

- `Account` represents an OAuth identity linked to a `User`. Multi-tenant
  user models in the future will want a single OAuth identity to map to
  multiple tenant memberships — adding `tenantId` here would break that.
- `Session` is unused (JWT strategy in `auth.config.ts`) but kept for
  Auth.js type compatibility.
- `VerificationToken` is per-email-identifier, pre-tenant. No way to know
  the tenant before the user clicks the link.

### Why bypass-only RLS (no tenant_isolation)?

These tables have no `tenantId` to filter on, and adding one would break
auth. The `tenant_bypass` policy means the **only** way to read or write
these tables is to explicitly set `app.bypass_rls = 'true'` — and the only
code path that does that for these tables is
`runWithAuthAdapterContext`, which has a hard-coded allow-list of
just these four model names.

This gives the same security guarantee as adding `tenantId`: no business
code can read auth-identity rows. Plus, it works with the existing
`MissingTenantError` infrastructure.

---

## Bypass / Helper Rules

`lib/auth/adapterContext.ts`:

```ts
runWithAuthAdapterContext({ operation, models }, fn);
```

- **Allow-list (frozen, hard-coded):** `User`, `Account`, `Session`, `VerificationToken`
- Any other model → `AuthAdapterModelNotAllowedError` thrown synchronously
  before `fn` runs and before bypass is established.
- Empty `models` list → also throws.
- Mixed valid + invalid list (e.g. `['User', 'Audit']`) → throws (deny by presence).
- Every invocation logs `auth_adapter.bypass` with `operation` + `models`.
- Every refusal logs `auth_adapter.disallowed_model` at error level.

`lib/auth/wrappedPrismaAdapter.ts`:

- Wraps `@auth/prisma-adapter` so each known method routes through
  `runWithAuthAdapterContext` with the per-method model registry.
- Unknown adapter methods (e.g. future Auth.js additions) are forwarded
  raw — they will fail with `MissingTenantError` until explicitly added
  to the registry. This is the safe default.

The Credentials provider's `prisma.user.findUnique({ email })` call in
`lib/auth.ts` is wrapped with `runWithAuthAdapterContext` directly:

```ts
const user = await runWithAuthAdapterContext(
  { operation: 'credentials.findUserByEmail', models: ['User'] },
  () => prisma.user.findUnique({ where: { email } })
);
```

---

## What This Strategy Prevents

| Attack scenario                                                                              | Outcome                                                                                                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Business code calls `prisma.account.findMany()` without tenant context                       | Throws `MissingTenantError` → `Account` not in `tenant_isolation` policy, so RLS would also return 0 rows                        |
| Business code calls `prisma.account.findMany()` under `runWithTenantBypass('any-reason', …)` | Allowed, but `runWithTenantBypass` is broad and audited; this isn't new attack surface                                           |
| Business code attempts `runWithAuthAdapterContext({ models: ['Audit'], … })`                 | Throws `AuthAdapterModelNotAllowedError` synchronously, never reaches DB                                                         |
| Cross-tenant user enumeration via auth route                                                 | Auth route reads only specific user by email; no list/scan exposed                                                               |
| OAuth callback links Account to wrong user                                                   | `linkAccount` runs under bypass but only writes a single Account row keyed by provider+providerAccountId; no tenant data exposed |

---

## Files Changed

| File                                                            | Change                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/auth/adapterContext.ts`                                    | **New** — narrow allow-list + `runWithAuthAdapterContext`                     |
| `lib/auth/wrappedPrismaAdapter.ts`                              | **New** — per-method wrapped Auth.js adapter                                  |
| `lib/auth.ts`                                                   | Use `buildWrappedPrismaAdapter`; wrap Credentials lookup                      |
| `prisma/schema.prisma`                                          | (unchanged for this task — auth models already correct)                       |
| `prisma/migrations/20260515180000_auth_table_rls/migration.sql` | **New** — RLS bypass-only policy on `Account`, `Session`, `VerificationToken` |
| `tests/security/auth-adapter-context.test.ts`                   | **New** — 22 tests                                                            |

---

## Migration Replay

`bash scripts/check-migration-replay.sh` — full migration chain (16 migrations)
replays cleanly from an empty Postgres database, including the three new
ones from Tasks #11, #13, #14.

```
🚀 Running prisma migrate deploy against empty database...
…
└─ 20260515180000_auth_table_rls/
  └─ migration.sql

All migrations have been successfully applied.
✅ Migration replay succeeded — all migrations applied cleanly from empty DB.
```

---

## Tests Added

`tests/security/auth-adapter-context.test.ts` — 22 tests:

**`runWithAuthAdapterContext` (16 tests):**

- Allows User, Account, Session, VerificationToken (4)
- Allows multi-model call (`['Session', 'User']`)
- **Refuses Audit, Proposal, Finding** (business models)
- Refuses unknown / typo'd model
- Refuses mixed valid+invalid model list (deny by presence)
- Refuses empty model list
- Logs structured bypass entry
- Logs structured refusal at error level
- Propagates operation name into bypass reason for audit trail
- `AuthAdapterModelNotAllowedError` carries attempted model
- `AUTH_ADAPTER_ALLOWED_MODELS` is the canonical frozen list

**`isAuthAdapterModel` type guard (3 tests):**

- True for allow-listed
- False for business models
- False for casing variations

**`buildWrappedPrismaAdapter` (3 tests):**

- Routes every known method through `runWithAuthAdapterContext`
- Unknown methods forwarded raw — no widened bypass
- Non-function fields passed through unchanged

---

## Commands Run and Outputs

```
$ npx vitest run tests/security/auth-adapter-context.test.ts
 Test Files  1 passed (1)
       Tests  22 passed (22)

$ npx vitest run tests/security/
 Test Files  11 passed (11)
       Tests  165 passed (165)

$ bash scripts/check-migration-replay.sh
✅ Migration replay succeeded — all migrations applied cleanly from empty DB.

$ getDiagnostics lib/auth.ts lib/auth/adapterContext.ts lib/auth/wrappedPrismaAdapter.ts
(no diagnostics)
```

---

## Acceptance Criteria

| Criterion                                                         | Status                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Auth-related table strategy is explicit and documented            | ✅ This file + inline comments                                                   |
| Legitimate auth adapter/session/account flows work                | ✅ All 14 known adapter methods route through helper                             |
| Tenant-scoped business data remains protected                     | ✅ User/Audit/Proposal still under `tenant_isolation` + `MissingTenantError`     |
| Any bypass/helper is narrow, guarded, and tested                  | ✅ Hard-coded 4-entry allow-list, frozen, refused tests for every business model |
| Cross-tenant access tests pass                                    | ✅ Existing 70 tenant-isolation tests still green                                |
| Misuse tests prove auth-table access cannot query business models | ✅ 5 explicit refusal tests (Audit, Proposal, Finding, typo, mixed)              |
| Migration replay remains valid                                    | ✅ All 16 migrations apply cleanly from empty DB                                 |
| Remediation note exists                                           | ✅ This file                                                                     |
| No production/staging/cloud resources touched                     | ✅                                                                               |
| No secrets changed                                                | ✅                                                                               |

---

## Remaining Risks

- **Future Auth.js adapter methods** will fall through unwrapped and throw
  `MissingTenantError` on first call. This is the safe default — operators
  see a clear failure rather than a silent bypass widening. When a new
  method is added, the registry in `wrappedPrismaAdapter.ts` must be
  updated, ideally via a security review.
- **`runWithTenantBypass` itself remains a broader primitive** that other
  code can use. This task does not change that — it just makes the
  auth-adapter usage narrow. Other bypass callsites (system tenant
  discovery, etc.) are still subject to their own remediation reviews.
- **Local runtime smoke not run:** the migration replay confirms SQL is
  valid, and unit tests confirm the helper logic. A full local
  Postgres + RLS smoke (Phase Z Smoke B) was already shown blocked in
  Task #8 by Phase 2.6-K issues unrelated to auth tables. The new
  bypass-only policies on `Account`/`Session`/`VerificationToken` should
  be re-verified in that smoke once 22P02 is resolved.
