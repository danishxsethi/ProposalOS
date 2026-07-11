# ProposalOS Remediation — Verification Log

Append-only record of verification gates executed per wave. Every finding marked `verified` in
`REMEDIATION_FINDINGS.json` has its gate evidence here.

---

## Wave 0 — Emergency security containment

Findings: **P0-19, P0-20, P0-21, P0-24** (proven externally-dangerous P0s) + **P1-16** (env-key
tenant-header containment) + **P1-14** (legacy-role normalization, folded into the RBAC fix) +
**P2-52** (SSRF blast-radius, closed by the shared P0-24 fix).

Code changes were authored by a prior uncommitted session; this session **verified** them against
the audit's defined gates (did not overwrite). Files:
`lib/auth/rbac.ts`, `lib/auth/apiKeys.ts`, `lib/middleware/auth.ts`, `lib/modules/security.ts`,
`app/api/team/invite/route.ts`, `app/api/team/invite/[token]/accept/route.ts`,
`app/api/tenants/[tenantId]/delete-data/route.ts`, `app/api/settings/api-keys/route.ts`, and
regression tests `tests/security/wave0-*.test.ts`.

### 1. Targeted regression tests — GREEN (32/32)

```
$ vitest run tests/security/wave0-rbac-api-key.test.ts \
    tests/security/wave0-invite-role.test.ts \
    tests/security/wave0-tenant-delete-authz.test.ts \
    tests/security/wave0-security-ssrf.test.ts \
    tests/security/wave0-env-api-key-tenant.test.ts

 ✓ tests/security/wave0-invite-role.test.ts        (7 tests)
 ✓ tests/security/wave0-tenant-delete-authz.test.ts (9 tests)
 ✓ tests/security/wave0-rbac-api-key.test.ts        (8 tests)
 ✓ tests/security/wave0-env-api-key-tenant.test.ts  (2 tests)
 ✓ tests/security/wave0-security-ssrf.test.ts       (6 tests)
 Test Files  5 passed (5)
      Tests  32 passed (32)
```

Coverage highlights:

- P0-19: tenant `audit:create`/`*` key rejected on `withRole('super_admin')`; allowed on
  `withRole('agency_member')`; `withPermission` does not treat `audit:create` as
  `manage_api_keys`; "does not use the fixed unrelated scope trio"; scope allowlist rejects
  client-invented scopes.
- P0-20: anonymous DELETE/GET → 401; invalid tenant-id format → 400; cross-tenant admin → 403;
  DELETE requires `confirm: "DELETE_TENANT_DATA"`; own-tenant `agency_admin` and any-tenant
  `super_admin` allowed with confirmation; cron Bearer path works; self-asserted `X-Cron-Auth`
  without the bearer secret is ignored.
- P0-21: `super_admin` never assignable via invite; role capped at inviter authority; unknown/
  legacy raw strings rejected; accept path fails closed on a stored `super_admin` role; the
  full API-key → invite → super_admin escalation chain is closed.
- P0-24: initial URL validated before fetch; redirect `Location` revalidated and a metadata hop
  blocked; hop cap enforced; `followRedirects=false` returns headers without following;
  credentialed URLs rejected; source contains no `rejectUnauthorized: false`.
- P1-16: env key binds to `DEFAULT_TENANT_ID` and ignores `x-tenant-id`; rejected when
  `DEFAULT_TENANT_ID` is unset.

### 2. Red-before / green-after proof (P0-19 keystone)

Non-destructive `tsx` delta (temp file, removed after run) comparing the OLD `withRole` API-key
predicate against the new guard:

```
OLD predicate grants super_admin route to audit:create key : true      <- the bypass
NEW guard  grants super_admin route to audit:create key     : false     <- closed
NEW guard  grants agency_member route to audit:create key   : true      <- legit access preserved
PROOF OK
```

### 3. TypeScript — GREEN

```
$ ./node_modules/.bin/tsc --noEmit --pretty false --incremental false
(exit 0, no diagnostics) — whole working tree, including the unrelated logger-typing group.
```

### 4. ESLint on changed files — 0 errors

```
$ eslint <8 Wave 0 source files + 5 test files>
✖ 9 problems (0 errors, 9 warnings)
```

All 9 are pre-existing style warnings (`@typescript-eslint/no-explicit-any` on route `any` types,
the pre-existing `handler: Function` signatures in `withRole`/`withPermission`, and a `complexity`
warning on `runSecurityModule` that predates this refactor). No new errors introduced.

### 5. Bounded verification searches (Gate H) — all clean

```
$ grep -rn "rejectUnauthorized: false" app lib          -> NONE
$ grep -rn "rejectUnauthorized" app lib                  -> only lib/modules/security.ts:177 (: true)
$ grep -rn "we allow the request|TODO: Implement proper user auth" app/api/tenants/.../delete-data -> NONE
$ withRole no longer uses the fixed audit:create/audit:*/'*' trio (confirmed; the remaining
  audit:create reference at rbac.ts:149 is inside effectiveRoleFromScopes, mapping scopes to
  agency_member — not a super_admin gate).
```

**Alternate-route check (Gate H):** `app/api/team/invite/[token]/route.ts` also references
`role: invitation.role`, but it is a **read-only GET** that returns invitation metadata for
display — not a `User.role` write. The only role-write path is `.../accept/route.ts`, which is
guarded (`normalizeRole` + `INVITE_ASSIGNABLE_ROLES` + fail-closed). No bypass.

### 6. Result

All Wave 0 acceptance criteria met. Findings set to `verified`: P0-19, P0-20, P0-21, P0-24,
P1-14, P1-16, P2-52. No findings blocked. Production infra/DB/live accounts untouched; all tests
use mocks/local fixtures (no live probes against metadata/internal endpoints).

---

## Wave 1 — Tenant and authentication foundation

Findings in scope: P1-05, P1-06, P1-07, P1-15, P1-17, P1-18, P2-07, P2-18, P2-22, P2-23,
plus the Wave 0 carry-over (self-registration `role:'owner'`).

### Entry-state verification

```
$ git branch --show-current   -> remediation/proposalos-e2e
$ git rev-parse HEAD           -> aa9765cdfccc41723aee403d2226b9563453c537 (matches expected)
$ git status --short | wc -l   -> 55 (Wave 0 unrelated logger-typing group + AUDIT_REPORT.md, as recorded)
```

Entry state matched expectations exactly. Read all Wave 1 finding entries in
`REMEDIATION_FINDINGS.json` before editing (confirmed pre-existing statuses: all `open`
except P1-14/P1-16 already `verified` from Wave 0).

### P1-05 — unscoped root Prisma client (VERIFIED)

Architectural fix, not a patch: `lib/db.ts` no longer exports a Prisma client at all.
It now exports `withSystemDbBypass(reason, fn)`, built on the same canonical scoped
client as `lib/prisma.ts` (no second, differently-scoped client exists). Added
`runScopedToOwnerTenant` to `lib/tenant/context.ts` for the "resolve tenant from a
business-object ID, then run scoped" pattern used by ID-only entry points
(`deliveryEngine.dispatchToAgent`, `verifyDeliverable`, `preWarming.executeAction`,
`checkWindowComplete`, `signalDetector.triggerSignalOutreach`).

All 8 production callers classified and migrated:

- **Tenant-scoped** (real `tenantId` in scope): `tenantConfig.ts`, `signalDetector.ts`,
  `preWarming.ts`, `deliveryEngine.ts` — now use `runWithTenantAsync`/
  `runScopedToOwnerTenant`.
- **Genuinely system/global** (no tenantId on the underlying model, or inherently
  cross-tenant by product design): `crossTenantIntelligence.ts` (`SharedIntelligenceModel`
  has no tenantId column), `partnerPortal.ts` (`AgencyPartner` has no tenantId; partner
  lead-matching is cross-tenant by design), `app/api/cron/partner-matching/route.ts`,
  `app/api/cron/pipeline-delivery/route.ts` (cron maintenance sweeps over all tenants) —
  now use `withSystemDbBypass` with a specific, logged reason string per call site.

Gate H (sibling-caller check): confirmed via `grep -rln "from '@/lib/db'"` that all
remaining importers use `withSystemDbBypass`, not a raw client import.

```
$ vitest run tests/security/wave1-tenant-scoping.test.ts (7/7)
$ vitest run tests/architecture/no-unscoped-db-import.test.ts (3/3)
$ vitest run lib/pipeline/__tests__/{preWarming,signalDetector,delivery,delivery.property}.test.ts
  app/api/cron/pipeline-delivery/__tests__/route.test.ts (75/75)
  -> all pass
$ vitest run lib/pipeline/__tests__/{tenantConfig,humanReview,crossTenantIntelligence,
  crossTenantIntelligence.property,partnerPortal,partnerPortal.property,
  signalDetector.property,tenantIsolation.property}.test.ts + app/api/cron/
  partner-matching/__tests__/route.test.ts
  -> import fixed (no more "Cannot read properties of undefined"); these are REAL
     integration tests requiring a live Postgres instance, which is unavailable in this
     environment ("Can't reach database server at localhost:5444"). This is the SAME
     class of environment limitation these tests would have had before Wave 1 touched
     lib/db.ts — confirmed by re-running before/after the import fix: before, they
     failed with a NEW TypeError (undefined.deleteMany); after, they fail with the
     pre-existing DB-unreachable error. Full pass/fail verification of these 9 files is
     BLOCKED on a live Postgres instance with RLS migrations applied — not attempted in
     this sandbox per the "never touch production infra" and time-bounded rules.
$ tsc --noEmit --pretty false --incremental false -> exit 0 (after resolving latent
  type debt uncovered by removing the any-typed client — see P2-56)
$ grep -rn "from '@/lib/db'" app lib -> only withSystemDbBypass importers remain
```

### Critical fix discovered during P2-07 reverification (owner-role escalation)

While reverifying P2-07 and fixing the Wave 0 carry-over (self-registration writing
`role:'owner'`), inspection of `LEGACY_ROLE_VALUES` in `lib/auth/rbac.ts` found:

```
owner: 'super_admin',   // <-- WRONG, pre-existing, shipped in Wave 0's normalizeRole fix
```

Confirmed via `grep -rn "role:\s*['\"]owner['\"]"` that every write site (
`app/api/auth/register/route.ts`, `app/api/tenants/route.ts`,
`lib/tenant/TenantProvisioningService.ts`, `prisma/seed.ts`) uses `'owner'` exclusively
to mean "owner of their own newly-created tenant" — never platform admin, and no code
path anywhere writes `'super_admin'` directly. This confirms the mapping itself was
wrong, not the call sites. Fixed to `owner: 'agency_admin'`. This closes a live
privilege-escalation path for every self-registered tenant in the current committed
state (Wave 0's `a040450`), so it is recorded here rather than silently folded in.

```
$ vitest run tests/security/wave1-owner-role-escalation.test.ts (4/4)
$ vitest run tests/security/wave0-rbac-api-key.test.ts tests/security/wave0-invite-role.test.ts
  -> 15/15 (one Wave 0 test's expectation updated — it had encoded the OLD, buggy
     assumption that 'owner' normalizes to super_admin; corrected to reflect that
     'owner' now correctly normalizes to agency_admin, an invite-assignable role)
```

### P1-15 — login rate limiting (VERIFIED)

`app/api/auth/[...nextauth]/route.ts` now checks two independent limits (per-IP,
per-account via a namespaced `sessionId` key) through the existing shared Redis-backed
limiter, before delegating to NextAuth, scoped to the `/callback/credentials` path only
so OAuth callbacks are never touched.

```
$ vitest run tests/security/wave1-login-rate-limit.test.ts (6/6)
```

### P1-17 — predictions route (VERIFIED)

`GET`/`POST /api/predictions` now require auth (`withAuth`/`withRole('agency_member')`);
tenant comes exclusively from `getTenantId()` (ALS context established by the auth
middleware) — a client-supplied `tenantId` in query or body is parsed but never used;
queries/writes run inside `runWithTenantAsync`; response no longer `include`s the
`tenant` relation (was a cross-tenant data-shape risk); missing tenant context returns
401, not a Prisma-derived 500; POST input runtime-validated.

```
$ vitest run tests/security/wave1-predictions-authz.test.ts (7/7)
```

### P2-18 — self-evolving raw executor (VERIFIED)

`requireTenant` now defaults to `true` in `lib/self-evolving-prompts/db.ts`. Audited
every call site (`predictions.ts`, `prompt-performance.ts`, `prompt-versions.ts`,
`scenarios.ts`) — all already pass `requireTenant` explicitly (`true` or `false`), so
this is a pure fail-closed-by-default hardening with zero behavior change today; it
only protects a _future_ caller that omits the option.

```
$ vitest run tests/security/wave1-self-evolving-executor.test.ts (4/4)
```

### P2-22 — trusted-proxy client IP (VERIFIED)

New `lib/security/getClientIp.ts` implements an N-trusted-hops `X-Forwarded-For`
algorithm (default 1 hop, matching Cloud Run's edge behavior of appending the real
client IP as the last entry) instead of trusting the first, client-controlled entry.
Wired into both IP-extraction sites in `lib/middleware/rateLimit.ts`. 5 other duplicate
sites elsewhere in the codebase were NOT migrated this wave (logged as new finding
P2-57 for a future pass).

```
$ vitest run tests/security/wave1-client-ip-trust.test.ts (8/8)
$ vitest run tests/security/shared-store-idempotency-ratelimit.test.ts (25/25, no regression)
```

### P1-06 — DB role fail-fast (FIXED, not fully verified — operator fact BLOCKED)

Added `lib/config/dbRoleGuard.ts::assertSafeDbRole()` — queries `pg_roles` for the
connected role's `rolsuper`/`rolbypassrls`, throws in production if either is true,
warns non-fatally elsewhere. Not yet wired into a startup/readiness probe (repository
work only). The live production role itself cannot be confirmed from the repository —
recorded BLOCKED in `REMEDIATION_STATE.md` with the exact read-only SQL check needed.

```
$ vitest run tests/security/wave1-db-role-guard.test.ts (5/5)
```

### P1-07 / P1-18 — claraud-web tenant-scoping client (NOT ATTEMPTED)

Out of session scope. claraud-web is a separate subproject with its own test setup,
dependencies, and deployment — not explored or exercised this session. Recorded `open`
rather than guessing at a fix. Requires its own investigation pass.

### P2-23 — enumeration / audit-trail reliability (NOT ATTEMPTED)

Deprioritized under the time budget after the higher-severity items above. The
enumeration-response change in particular carries frontend-coupling risk (changing
`app/api/auth/register/route.ts`'s "User already exists" response shape/status could
break an unexplored frontend error-handling path) that was not safe to make blind this
session. Recorded `open`.

### Final gates (whole wave)

```
$ tsc --noEmit --pretty false --incremental false -> exit 0
$ eslint (via lint-staged on commit) -> 0 errors (pre-existing style warnings only)
$ vitest run (19 files, 183 tests total across all Wave 1 + re-run Wave 0 security tests)
  -> 183/183 pass
```

### Result

Findings set to `verified`: P1-05, P1-14 (+ critical owner-role fix), P1-15, P1-17,
P2-07, P2-18, P2-22. Set to `fixed` (code changed, external fact still needed):
P1-06. Left `open` (not attempted): P1-07, P1-18, P2-23. New findings logged: P2-56,
P2-57. No production infra/DB/live accounts touched. All tests use mocks/fixtures or
are honestly reported as environment-blocked (no live DB in this sandbox).
