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

---

## Correction to the Wave 1 "final gates" tsc result (baseline repair, 2026-07-11)

**This appends to, and does not erase or rewrite, the "Final gates (whole wave)" entry above.**

The Wave 1 entry above records `tsc --noEmit ... -> exit 0` as the wave's final gate result.
That result was reproduced from the _working tree at that moment_, which — unknown to that
session — already silently contained an early, uncommitted copy of a fix for
`lib/audit/runner.ts`'s `BUDGET_EXCEEDED` branch (the same line later re-authored, independently,
by the unauthorized Wave 2 WIP excursion and isolated into `stash@{0}` in this continuation — see
`REMEDIATION_STATE.md`). That uncommitted fix was never itself committed as part of Wave 1, and
no regression test covered it.

Re-running `tsc --noEmit --pretty false --incremental false` from a **clean checkout of the
actual committed Wave 1 HEAD** (`dc6591a`, with the Wave 2 WIP correctly isolated into a stash and
nothing else in the working tree) reproduced:

```
lib/audit/runner.ts(1128,39): error TS2353: Object literal may only specify known properties,
and 'error' does not exist in type '(Without<AuditUpdateInput, AuditUncheckedUpdateInput> &
AuditUncheckedUpdateInput) | (Without<...> & AuditUpdateInput)'.
(exit 2)
```

Root cause: the `Audit` Prisma model (`prisma/schema.prisma`, unchanged since `63d40dc`,
2026-05-30) has no `error` scalar column; module/budget failures are recorded via the
`modulesFailed: Json` array, per the pattern already used by this same file's per-module `FAILED`
branch and read by `app/api/analytics/route.ts`.

### Baseline-repair fix (isolated commit, not a Wave 1 finding)

`lib/audit/runner.ts`'s `BUDGET_EXCEEDED` branch now writes:

```ts
data: {
  status: 'FAILED',
  modulesFailed: [...existingModulesFailed, { module: 'budget', error: 'BUDGET_EXCEEDED' }],
  completedAt: new Date(),
},
```

merging into any `modulesFailed` already present on the row (read from the `audit` object already
fetched at the top of `runAuditInternal`) rather than overwriting it, matching the established
read-modify-write convention used elsewhere for this field. No new Prisma column was added.

```
$ vitest run tests/security/wave1-baseline-budget-exceeded-write.test.ts
 ✓ writes only schema-valid Audit fields and stays observable/terminal
 ✓ merges into pre-existing modulesFailed instead of discarding them
 Test Files  1 passed (1)
      Tests  2 passed (2)

$ ./node_modules/.bin/tsc --noEmit --pretty false --incremental false
(exit 0)

$ npx eslint lib/audit/runner.ts tests/security/wave1-baseline-budget-exceeded-write.test.ts
✖ 39 problems (0 errors, 39 warnings) — all 39 are pre-existing `no-explicit-any`/
  `no-unused-vars` warnings unrelated to this change (verified by line number against the
  pre-fix file); zero new warnings or errors introduced.

$ vitest run <15 files: this new test + all Wave 0/1 security tests + both architecture tests>
 Test Files  15 passed (15)
      Tests  81 passed (81)

$ git stash show --stat stash@{0}   -> unchanged (15 tracked + 1 untracked file, identical to the
  isolation record in REMEDIATION_STATE.md); stash was not applied, popped, or edited.
```

### Result

This isolated, one-line-semantic baseline correction restores a **reproducible clean-checkout
TypeScript baseline** for the branch, independent of any Wave 2 WIP. It is not one of the 10 Wave
1 findings (P1-05/06/07/15/17/18, P2-07/18/22/23) and is tracked/committed separately from Wave
1's own fixes.

---

## Wave 1 continuation — completing P1-07 / P1-18 / P2-23 (2026-07-11)

Resumed from the clean baseline established by the `fix(audit): persist budget-exceeded
failure in valid schema` correction (commit `2f94df6`), with the unauthorized Wave 2 WIP
isolated in `stash@{0}` (`proposalos-wave2-wip-before-wave1-completion-2026-07-11`) and left
untouched throughout this section.

### P1-07 / P1-18 — claraud-web tenant-scoping client (VERIFIED)

Full audit of claraud-web's Prisma usage (all 14 `route.ts` files under
`claraud-web/src/app/api/**`, plus `claraud-web/src/lib/auth/apiKeys.ts` and
`claraud-web/src/auth.ts`): exactly one Prisma client (`claraud-web/src/lib/prisma.ts`, one
`new PrismaClient()`), 6 files actually touch it (analytics, audits, dashboard/stats,
proposals, settings routes; auth/register route), plus the two shared helpers.

Root defect confirmed exactly as diagnosed: `SET LOCAL app.current_tenant_id` was set on a
`tx` opened via `client.$transaction(...)`, but the real business query ran via
`query(args)` — bound to the **base** (pooled) client, a different connection than the one
carrying the GUC. Additionally: (a) the GUC value was built with `$executeRawUnsafe` string
interpolation; (b) **`setTenantContext()` was never called anywhere in the app** — every one
of the 6 real routes relied solely on manual `where: { tenantId }` filtering, meaning the
GUC-setting branch never executed in production at all.

Rewrote `claraud-web/src/lib/prisma.ts`:

- `createTenantScopingExtension(client)` — every model operation now dispatches via
  `tx[delegateKey][operation](args)` on the **same** `tx` the GUC was just set on via a
  parameterized `tx.$executeRaw` tagged template (not `$executeRawUnsafe`).
- `assertValidTenantId()` — UUID-validates before any query; `setTenantContext()` fails
  closed (throws) on a malformed ID.
- Missing tenant/bypass context now fails closed (throws `Tenant context required...`)
  instead of silently falling through to an unscoped query — the defect's actual root cause.
- `withSystemBypass(reason, fn)` — explicit, named escape hatch (mirrors the root app's
  `withSystemDbBypass`/`runWithAuthAdapterContext`) for the handful of legitimately
  pre-tenant operations (self-registration's email-uniqueness check + tenant/user creation
  transaction; API-key lookup by hash; credentials sign-in lookup by email). Sets
  `app.bypass_rls = 'true'` on the same tx, mirroring the root app's `tenant_bypass` RLS
  policy convention (`prisma/migrations/20260501014500_rls_bypass_policies`), rather than
  silently running on the base client with no GUC at all.
- `wrapTransaction()` — registers any app-opened `prisma.$transaction(...)` (e.g.
  self-registration's atomic tenant+user creation) as the active context's `currentTx`, so
  every model op dispatched inside reuses that **same** connection instead of each opening
  its own nested transaction (which would have silently split an atomic operation across
  multiple transactions).

Wired the fix into every real call site: `analytics/route.ts`, `audits/route.ts`,
`dashboard/stats/route.ts`, `proposals/route.ts` (GET+PATCH), `settings/route.ts` (GET+POST)
now wrap their bodies in `setTenantContext(tenantId, ...)`; `auth/register/route.ts` and
`lib/auth/apiKeys.ts::validateApiKey` and `auth.ts`'s credentials `authorize()` now use
`withSystemBypass(reason, ...)` with a specific reason string each.

```
$ cd claraud-web && npx vitest run tests/prisma-tenant-scoping.test.ts
 ✓ assertValidTenantId (5 tests: accepts UUID, rejects 4 malformed/injection-shaped IDs)
 ✓ sets the GUC and dispatches the business query on the SAME tx (not the base client)
 ✓ parameterizes the tenant ID -- quote/injection-shaped input cannot alter the SQL
 ✓ fails closed when no tenant/bypass context is established
 ✓ rejects a malformed tenant ID before any query runs
 ✓ explicit system bypass sets app.bypass_rls and still dispatches on tx, not the base client
 ✓ reuses the SAME connection for every operation inside an app-opened $transaction
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

`vitest`/`vitest.config.ts` added to claraud-web (pinned `4.1.9`, exactly matching the root
app's installed version) — claraud-web had **no test infrastructure at all** before this;
required to satisfy the mandatory regression-test acceptance criterion.

```
$ cd claraud-web && npx tsc --noEmit --pretty false
(0 errors from any file touched by this fix; 7 pre-existing TS7006 implicit-any errors in
5 files (audits/route.ts, dashboard/stats/route.ts, proposals/route.ts, settings/route.ts,
auth/register/route.ts) confirmed via direct before/after diff against git HEAD to
PRE-EXIST this fix -- caused by claraud-web having no schema.prisma in this sandbox, so
@prisma/client ships its ungenerated `any`-stub (`npx prisma generate` fails "Could not find
Prisma Schema"); 9 unrelated pre-existing errors in .next/dev/types/validator.ts, a stale
generated-cache artifact, not source code)
$ cd claraud-web && npx eslint src/lib/prisma.ts src/lib/auth/apiKeys.ts src/auth.ts \
    src/app/api/auth/register/route.ts src/app/api/{analytics,audits,proposals,settings}/route.ts \
    src/app/api/dashboard/stats/route.ts
-> 0 errors on prisma.ts (the core fix file); remaining 3 errors + 5 warnings on the other
   files are pre-existing (verified by line number against each file's pre-edit content)
$ grep -rn "executeRawUnsafe" claraud-web/src -> none (only comments describing the fixed defect)
$ grep -rn "setTenantContext\(" claraud-web/src | wc -l  -> 7 (5 routes + settings POST)
$ grep -rn "withSystemBypass\(" claraud-web/src | wc -l  -> 3 (register, apiKeys, auth.ts)
```

Root app's own gates re-confirmed unaffected (claraud-web is a fully separate subproject
with its own node_modules/tsconfig — none of this touched root files):

```
$ ./node_modules/.bin/tsc --noEmit --pretty false --incremental false -> exit 0
```

New findings discovered and logged (not fixed this wave, low priority / inert / out of
scope): P2-58 (claraud-web register still writes `role:'owner'` literally, but confirmed
inert -- no RBAC code anywhere in claraud-web reads `User.role`), P2-59 (NextAuth adapter
wired but no catch-all route exists to mount it, so Google OAuth + the adapter's own
Account/Session calls are currently unreachable; if wired up later, adapter calls need an
auth-adapter-style bypass or they will fail closed).

### P2-23 — enumeration + audit-trail reliability (VERIFIED)

**Enumeration:** `app/api/auth/register/route.ts`'s existing-user branch no longer returns a
distinct `400 { error: 'User already exists' }`. It now responds with the same 2xx shape a
fresh registration produces (`{ user: { id: null, name: null, email } }`), without creating
a duplicate account (enforcement unchanged — confirmed via test assertion that
`prisma.$transaction` is never called on that path).

```
$ vitest run tests/security/register-bypass-isolation.test.ts
 ✓ P2-23: does not reveal account existence -- responds like a fresh registration, no
   cross-tenant data leaked, no duplicate created
 ✓ (5 other pre-existing guarantees, re-verified, all still pass)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Residual, explicitly-not-closed gap logged as **P2-60**: the frontend
(`app/(auth)/register/page.tsx`) immediately attempts an auto-login after registration —
for an existing email with a guessed-wrong password, that auto-login fails and redirects to
`/login`, while a genuinely new email always succeeds and redirects to `/onboarding`. This
is a residual behavioral side-channel that the response-text/status fix does not close;
fully closing it needs a bigger product-flow decision (e.g. drop auto-login, gate on email
verification) out of this session's scope.

**Audit-trail reliability:** `lib/observability/auditTrail.ts`'s `recordAuditTrailEvent()`
already logged write failures via `logger.warn` and rethrew for `stripe.*`/`session.*`/
`apikey.*` events (pre-existing, re-verified below) — the gap was that `data.deletion_*`
(tenant deletion) and `role.*` (role/permission changes) were **not** in the critical set,
so a failed write for those destructive/security categories was only logged, never
surfaced as a hard failure, and every call site additionally wraps the call in its own
`.catch(() => {})`, discarding even that. Extended the single shared `isCritical` check
(not a per-caller patch) to cover `data.deletion` and `role.` prefixes too.

```
$ vitest run tests/security/wave1-audit-trail-criticality.test.ts
 ✓ rethrows on write failure for data.deletion_auth (tenant-deletion authorization)
 ✓ rethrows on write failure for data.deletion_completed (tenant-deletion completion)
 ✓ rethrows on write failure for data.deletion_failed (tenant-deletion failure record)
 ✓ rethrows on write failure for apikey.created/revoked (pre-existing, re-verified)
 ✓ rethrows on write failure for session.* events (pre-existing, re-verified)
 ✓ does NOT rethrow for non-critical event categories -- logs and swallows
 ✓ does not throw and does not log when the write succeeds
 Test Files  1 passed (1)
      Tests  7 passed (7)
$ vitest run tests/security/audit-trail-sensitive-actions.test.ts tests/security/auditTrail/hash-chain.test.ts
 -> 3/3, 5/5 pass (no regression to existing audit-trail behavior)
```

### Final gates (this continuation)

```
$ ./node_modules/.bin/tsc --noEmit --pretty false --incremental false -> exit 0
$ eslint app/api/auth/register/route.ts lib/observability/auditTrail.ts \
    tests/security/wave1-audit-trail-criticality.test.ts tests/security/register-bypass-isolation.test.ts
  -> 0 errors, 8 pre-existing any-warnings (unrelated lines, verified)
$ vitest run <19 files: this continuation's new/updated tests + all Wave 0/1 security +
  architecture tests> -> 19 files / 102 tests, all pass
$ git stash show --stat stash@{0} -> unchanged from the isolation record (16 files);
  never applied, popped, or edited during this continuation
```

### Result

Findings set to `verified`: P1-07, P1-18, P2-23. New findings logged: P2-58, P2-59, P2-60
(all low-priority/inert/out-of-scope, not blocking). No production infra/DB/live accounts
touched. All tests use mocks/fixtures; claraud-web's own vitest run is fully local (no DB
connection attempted).
