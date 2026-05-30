# Phase 2.4 Design

Captured: 2026-05-01T00:00:00Z
Branch: phase-2-rls-migration
Scope: Step 0 only - bypass policy design gate for Phase 2.4

## Current state

- Phase 2.3 shipped a runtime bypass hook in [lib/tenant/context.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/tenant/context.ts:1): `runWithTenantBypass(...)`.
- The Prisma shim in [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts:1) already recognizes bypass mode and issues:

```ts
await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
```

- The existing RLS migration in [prisma/migrations/20260429093000_enable_rls/migration.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/20260429093000_enable_rls/migration.sql:1) already has a Phase 2.4 TODO stub for bypass policies.
- That migration currently covers **50** tenant-scoped tables, discoverable via its `-- VERIFIED:` comments and the coverage manifest.
- There is no existing `app_admin` role, `BYPASSRLS` role, second Prisma client, or second database secret path in the repo today.
- The repo has a real structured logger in [lib/logger.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/logger.ts:1), so bypass invocations can be audited without inventing a new logging layer.

## Existing bypass callsites

Current Phase 2.3 bypass uses are concentrated in server-side reads:

- admin pages:
  - `app/(admin)/audits/page.tsx`
  - `app/(admin)/tenants/page.tsx`
- magic-link / public token pages:
  - `app/(client)/client/audit/[id]/page.tsx`
  - `app/(client)/client/dashboard/page.tsx`
  - `app/presentation/[token]/page.tsx`
  - `app/case-study/[auditId]/pdf/page.tsx`
  - `app/outreach/scorecard/[token]/page.tsx`
  - `app/preview/[token]/page.tsx`
  - `app/proposal/[token]/page.tsx`
  - `app/proposal/[token]/pdf/page.tsx`
  - `app/(marketing)/page.tsx`
- test coverage:
  - `lib/tenant/__tests__/shim-integration.test.ts`

This matters because Phase 2.4 is not inventing bypass out of nowhere; it is making an already-shipped runtime path actually enforceable at the database layer.

## Option analysis

### BX1 - Runtime flag + permissive policy

Add a second permissive policy to every RLS-covered table:

```sql
CREATE POLICY tenant_bypass ON "<table>"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
```

How it composes:

- PostgreSQL OR-combines multiple permissive policies for the same command.
- Existing `tenant_isolation` remains intact.
- `tenant_bypass` becomes the explicit escape hatch when the runtime sets `app.bypass_rls = 'true'` inside the transaction.

Pros:

- Directly matches the Phase 2.3 runtime hook already in production code.
- No infrastructure change, no second pool, no second secret, no second Prisma client.
- Easy to generate mechanically from the 50 `-- VERIFIED:` entries in the existing RLS migration.
- Works with the PgBouncer + transaction-local `set_config(..., true)` model already validated in Phase 2.2.

Cons:

- Any code path that can set the bypass flag inside a transaction gets cross-tenant access on all covered tables in that transaction.
- Auditability depends on the wrapper contract and logging discipline, not on PostgreSQL alone.
- Raw query callsites are still a limitation; bypass is only as broad as the runtime path that actually sets the flag and executes inside the same transaction.

### BX2 - Separate `BYPASSRLS` role

Create an `app_admin` role with `BYPASSRLS`, keep normal traffic on `app_user`, and route bypass operations through a separate Prisma client / connection string.

Pros:

- Strongest infrastructure boundary.
- Prevents flag-based bypass from being toggled on a normal application connection.
- Cleaner long-term separation between tenant-scoped and privileged operations.

Cons:

- Requires a second connection secret, second Prisma client wiring, second pool behavior review, and likely Cloud Run secret/config work.
- The repo has no existing `app_admin` role or multi-client database pattern today.
- Much larger blast radius operationally for a pre-launch/single-dev setup than the actual bypass cases we need now.
- Still needs audit logging at the application layer to explain _why_ a privileged path was used.

### BX3 - Hybrid: BX1 now, BX2 documented as future migration

Ship BX1 for Phase 2.4 because it matches the runtime we already have, and explicitly document how to graduate to BX2 later:

- create `app_admin BYPASSRLS`
- provision `APP_ADMIN_DATABASE_URL`
- add a second Prisma client
- migrate only vetted cross-tenant callsites to that client
- eventually remove or narrow the flag-based path

Pros:

- Solves the immediate end-to-end bypass gap with the smallest safe change.
- Keeps the repo aligned with its current runtime and infrastructure shape.
- Preserves a future hardening path without blocking the current RLS rollout.

Cons:

- Carries the same immediate trust model as BX1.
- Requires discipline to actually revisit BX2 later if the product grows into it.

## Recommendation

### Recommend: BX3

Why:

1. The current runtime is already built around a transaction-local bypass flag, and Phase 2.3 proved that model works with local Postgres + PgBouncer.
2. The repo does **not** have the supporting infrastructure for BX2 today: no second DB role, no second DSN, no second Prisma client, no documented pool split.
3. The bypass surface right now is modest and legible: mostly admin rendering and magic-link/public-token reads, not a sprawling internal platform.
4. Phase 2.4 can add audit logging immediately so every bypass invocation leaves a structured trail.
5. BX3 gives us the pragmatic now-path without pretending BX1 is the forever design.

## Proposed SQL diff for BX3

Phase 2.4 implementation should add a **new** migration directory, not modify the existing baseline RLS migration:

- `prisma/migrations/<timestamp>_rls_bypass_policies/migration.sql`
- `prisma/migrations/<timestamp>_rls_bypass_policies/revert.sql`

For each table covered by the 50 `-- VERIFIED:` comments in the Phase 2.1.5 RLS migration:

```sql
DROP POLICY IF EXISTS tenant_bypass ON "<table>";
CREATE POLICY tenant_bypass ON "<table>"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
```

Generation source of truth:

- Parse `prisma/migrations/20260429093000_enable_rls/migration.sql`
- Extract the 50 `-- VERIFIED: Model -> table` lines
- Generate one `tenant_bypass` policy per resolved table name

Why this shape:

- It stays aligned with the current `tenant_isolation` coverage, no more and no less.
- It avoids a hand-maintained 50-table list, which would drift immediately.

## Audit logging strategy

Phase 2.4 should change `runWithTenantBypass(...)` from:

```ts
runWithTenantBypass(fn);
```

to:

```ts
runWithTenantBypass(reason, fn);
```

Required behavior:

- `reason` is mandatory and non-empty.
- On every invocation, emit a structured log through `logger.warn(...)` or `logger.info(...)`.
- Suggested payload:

```ts
{
  event: 'rls_bypass',
  reason,
  caller,
  timestamp: new Date().toISOString(),
}
```

Recommended `caller` source:

- first useful external stack frame from `new Error().stack`
- keep it best-effort and sanitized; this is for traceability, not security hardening by itself

Why app-layer logging is still required:

- PostgreSQL policies can allow the bypass, but they do not explain intent.
- We want to know whether a bypass came from an admin render, magic-link read, cron, or future support tooling.

## Concurrency and bleed risk

Expected answer: **safe when used correctly**

Reasoning:

- The runtime uses `set_config('app.bypass_rls', 'true', true)`.
- The third argument `true` makes the setting transaction-local.
- Under the Phase 2.3 shim, the bypass flag and the actual Prisma operation execute inside the same transaction.
- Once the transaction ends, the bypass setting should disappear.
- That means one request's bypass should not bleed into another request on a reused pooled connection.

What Phase 2.4 should prove with tests:

- bypass read succeeds as `app_user`
- bypass write succeeds as `app_user`
- a non-bypass request running after or alongside a bypass request still throws `MissingTenantError` or obeys normal tenant isolation

## Failure mode / blast radius

### If the bypass policy is correctly written

- Blast radius is bounded to the current transaction where `app.bypass_rls = 'true'` was intentionally set.
- Scope is all 50 currently covered tables, because each gets a permissive `tenant_bypass` policy.

### If the bypass policy is incorrectly written

Worst case example:

```sql
USING (true)
WITH CHECK (true)
```

Blast radius:

- every covered table becomes cross-tenant readable and writable for `app_user`
- all tenant isolation on those tables is effectively gone
- because the policy is database-side, the damage would affect every caller, not only the runtime bypass wrapper

This is why Phase 2.4 should:

- generate from the existing manifest, not freehand
- inspect the policy file before activating the skipped integration test
- keep the predicate narrowly tied to `current_setting('app.bypass_rls', true) = 'true'`

## BX2 future migration path

If ProposalOS matures into a higher-assurance multi-tenant deployment, BX2 should look like this:

1. Create `app_admin` with `BYPASSRLS`.
2. Provision a separate `APP_ADMIN_DATABASE_URL` secret.
3. Create a second Prisma client that is never used by default.
4. Migrate only vetted privileged flows to that client.
5. Keep audit logging anyway.
6. Optionally remove the flag-based bypass policies once all privileged paths are migrated.

That is a sensible Phase 2.x or Phase 3 hardening path, but it is not the right first move for the repo as it exists today.

## Implementation notes for Step 1+

- Generate the bypass-policy migration from the 50 `-- VERIFIED:` comments.
- Do **not** modify `20260429093000_enable_rls/migration.sql`.
- Add a matching `revert.sql`.
- Update all current `runWithTenantBypass(...)` callsites to pass meaningful reasons.
- Unskip the existing bypass integration test only after the operator reviews the policy file.

## Approval gate

Recommended choice for Phase 2.4 implementation: **BX3**

Implementation shape if approved:

- SQL policy mechanism: BX1
- strategic framing: BX3
- logging: required
- migration source of truth: Phase 2.1.5 `-- VERIFIED:` manifest

No SQL or runtime changes should be applied until the operator replies with approval to proceed.

## Closure

### Pattern chosen

Chosen pattern: **BX3**

- We shipped the BX1-style transaction-local bypass policy now because it matches the runtime hook already introduced in Phase 2.3.
- We kept BX2 as the future hardening path for when the repo is ready for a separate privileged role, second DSN, and split connection management.

### Migration path

- Generator script: [scripts/generate-bypass-migration.ts](/Users/danishsethi/VSCODE/ProposalOS/scripts/generate-bypass-migration.ts:1)
- Migration: [prisma/migrations/20260501014500_rls_bypass_policies/migration.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/20260501014500_rls_bypass_policies/migration.sql:1)
- Revert: [prisma/migrations/20260501014500_rls_bypass_policies/revert.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/20260501014500_rls_bypass_policies/revert.sql:1)

The generator parses the `-- VERIFIED:` comments in the Phase 2.1.5 baseline RLS migration and emits one `tenant_bypass` policy per covered table, so future additions stay reproducible instead of becoming a hand-maintained table list.

### Integration test results

Local runtime proof was re-run against the docker-compose Postgres + **PgBouncer pooled endpoint** (`localhost:6432`) using `app_user`.

| Test                                                           | Result |
| -------------------------------------------------------------- | ------ |
| Tenant A read sees only tenant A rows                          | pass   |
| Tenant B read sees only tenant B rows                          | pass   |
| Missing tenant throws `MissingTenantError`                     | pass   |
| Empty tenant throws `MissingTenantError`                       | pass   |
| Non-UUID tenant throws `MissingTenantError`                    | pass   |
| Concurrent tenant requests do not bleed                        | pass   |
| Existing transaction is reused (no nested sub-transaction)     | pass   |
| Bypass read sees cross-tenant rows                             | pass   |
| Bypass write succeeds as `app_user`                            | pass   |
| Bypass setting does not bleed across pooled requests           | pass   |
| Bypass reason is required                                      | pass   |
| Bypass invocation emits structured audit log                   | pass   |
| `WITH CHECK` still blocks cross-tenant mutation without bypass | pass   |

Summary: **13/13 passing, 0 skipped** in [lib/tenant/**tests**/shim-integration.test.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/tenant/__tests__/shim-integration.test.ts:1).

### Audit log format example

```ts
{
  event: 'rls_bypass',
  reason: 'admin-page-render:global-audit-browser',
  caller: 'at AuditBrowserPage (.../app/(admin)/audits/page.tsx:8:...)',
  timestamp: '2026-05-01T16:51:13.342Z',
}
```

### Server-component read re-validation

Validated **13 bypass callsites across 11 app files**.

- Admin/global reads remain legitimate bypass uses:
  - `app/(admin)/audits/page.tsx`
  - `app/(admin)/tenants/page.tsx`
- Public or magic-link bootstrap reads remain legitimate because they need one pre-tenant lookup before switching back to `runWithTenantAsync(...)`:
  - `app/(client)/client/audit/[id]/page.tsx`
  - `app/(client)/client/dashboard/page.tsx`
  - `app/presentation/[token]/page.tsx`
  - `app/case-study/[auditId]/pdf/page.tsx`
  - `app/outreach/scorecard/[token]/page.tsx`
  - `app/preview/[token]/page.tsx`
  - `app/proposal/[token]/page.tsx`
  - `app/proposal/[token]/pdf/page.tsx`
- Cross-tenant aggregate use remains legitimate:
  - `app/(marketing)/page.tsx`

Result: **0 callsites flagged for immediate refactor** in this phase.

### tsc and vitest delta

- `pnpm exec tsc --noEmit --pretty false | rg -c 'error TS'` now reports **1211**, back to the Phase 2.3 closure level after tightening types in the new migration generator script.
- `pnpm build` remains green.
- `pnpm exec vitest run tests/security/` remains green: **14/14 tests passing**.
- The full Vitest suite still has broad pre-existing noise outside the Phase 2.4 touch surface. While scanning the run, the only Phase 2.4-adjacent signal was a _caught_ `MissingTenantError` inside `logQATelemetry(...)`; the corresponding diagnosis test still failed for timeout/assertion reasons, not for an uncaught crash. No new failing `tsc` entries remain in the files changed for this phase.

### Phase 2.5 readiness checklist

- [x] Runtime bypass hook requires an explicit reason
- [x] Bypass invocations emit structured audit logs
- [x] Database policies exist for all 50 currently covered RLS tables
- [x] Pooled-connection bleed test passes through PgBouncer
- [x] Security regression suite remains green
- [ ] Cross-tenant non-server-component callsites still need migration review in Phase 2.5
- [ ] Future hardening path to BX2 (`app_admin` / `BYPASSRLS` role) remains documented, not implemented
