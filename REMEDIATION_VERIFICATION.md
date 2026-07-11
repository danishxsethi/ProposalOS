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
