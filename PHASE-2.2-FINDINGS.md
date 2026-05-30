# Phase 2.2 Findings

Captured: 2026-04-30T23:32:14Z
Branch: phase-2-rls-migration
Scope: immigration-prod inventory plus local Postgres/PgBouncer RLS smoke testing

## Section A - Immigration-prod inventory

### Connection path

- Accessed `immigration-prod` through Cloud SQL Proxy with gcloud auth on local port `9477`.
- Connected read-only to database `immigration_platform` as role `postgres`.

### Public schema inventory

- Total tables in `public`: `10`
- Tables present:
  - `Audit`
  - `Consent`
  - `Document`
  - `FeatureFlag`
  - `PolicyVersion`
  - `Profile`
  - `RCICDecision`
  - `RCICFeedback`
  - `User`
  - `_prisma_migrations`
- Non-system schemas present beyond `public`: none

### ProposalOS-shape check

- Name-based scan found exactly one regex match: `Audit`
- Follow-up schema inspection showed `public."Audit"` is **not** the ProposalOS `Audit` model:
  - Present columns: `id`, `userId`, `riskFlags`, `heuristicScore`, `explanations`, `actionItems`, `caseSummary`, `rulesEngineVersion`, `policyVersion`, `sourcesConsulted`, `createdAt`
  - Missing ProposalOS-defining columns such as `businessName`, `tenantId`, `status`, `startedAt`, `completedAt`
- Row count for `public."Audit"`: `0`

### Roles and RLS state

- `postgres` role exists and is **not** superuser in `immigration_platform`
- `app_user` role does not exist
- No tables in `public` have row-level security enabled
- No policies exist in `pg_policies` for `public`

### Assessment

Decision branch: **A**

`DATABASE_URL` / `DIRECT_URL` currently point ProposalOS at `immigration_platform`, but that database does not contain a ProposalOS schema. This is stale or incorrect DSN configuration, not evidence of shared live ProposalOS data.

## Section B - Local Postgres setup

### Local targets used

- Local Postgres: Docker container `proposal_engine_db` on `localhost:5435`
- Clean smoke-test database: `proposal_rls_smoke`
- Local PgBouncer: container `pgbouncer-local` on `localhost:6432`
- Pool mode: `transaction`

### Setup notes

- `docker-compose.yml` successfully brought up local Postgres.
- The repo's `docker-compose.pgbouncer.yml` is not presently runnable as-is for this test:
  - it points upstream at `host.docker.internal:5432` while the repo Postgres service is exposed on `5435`
  - its `bitnami/pgbouncer:latest` image tag no longer resolves
- For smoke testing only, a local `pgbouncer/pgbouncer:latest` container was started on the same Docker network and pointed at `proposal_engine_db:5432` with `transaction` pooling.

### Schema and migration application

- `pnpm exec prisma db push --skip-generate` succeeded against `proposal_rls_smoke` using the PgBouncer URL with `?pgbouncer=true`
- The merged RLS migration `prisma/migrations/20260429093000_enable_rls/migration.sql` was applied directly to `localhost:5435`
- Verification after apply:
  - `50` tables in `public` have `rowsecurity = true`
  - `50` policies exist in `pg_policies`
  - `FORCE ROW LEVEL SECURITY` is present on the covered tables

### Safety note added

- Added [README.md](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/20260429093000_enable_rls/README.md:1) with:
  - `DO NOT apply this migration to immigration_platform — it grants on all public-schema tables and would alter the Passwise DB.`

## Section C - SET LOCAL semantics

### Role context

- Local `postgres` is a superuser (`rolsuper = true`)
- Local `app_user` is a non-superuser login role (`rolsuper = false`, `rolcanlogin = true`)

Because local `postgres` is a superuser, it bypasses RLS even with `FORCE ROW LEVEL SECURITY`. That makes the `app_user` rows the meaningful enforcement signal.

### Smoke results

| Test                                    | Connecting role | Path                                | Tenant context                 | Expected                            | Actual                                         | Pass                                    |
| --------------------------------------- | --------------- | ----------------------------------- | ------------------------------ | ----------------------------------- | ---------------------------------------------- | --------------------------------------- |
| Tenant 1 read with `SET LOCAL`          | `postgres`      | PgBouncer transaction               | `tenant1`                      | Tenant 1 only                       | Tenant 1 + Tenant 2                            | No                                      |
| Tenant 1 read with `SET LOCAL`          | `app_user`      | PgBouncer transaction               | `tenant1`                      | Tenant 1 only                       | Tenant 1 only                                  | Yes                                     |
| No tenant context                       | `postgres`      | PgBouncer direct query              | none                           | All rows                            | All rows                                       | Yes                                     |
| No tenant context                       | `app_user`      | PgBouncer direct query              | none                           | No rows                             | `22P02 invalid input syntax for type uuid: ""` | No                                      |
| Cross-transaction `SET LOCAL` bleed     | `postgres`      | PgBouncer mixed                     | `tenant1` then none            | First query scoped, second unscoped | Both queries saw all rows                      | No meaningful signal (superuser bypass) |
| `$queryRaw` outside transaction         | `app_user`      | PgBouncer raw query                 | attempted `tenant1` outside tx | No tenant context should apply      | `22P02 invalid input syntax for type uuid: ""` | No                                      |
| Tenant 1 read with `SET LOCAL`          | `app_user`      | Direct transaction                  | `tenant1`                      | Tenant 1 only                       | Tenant 1 only                                  | Yes                                     |
| Current shim pattern (query outside tx) | `app_user`      | PgBouncer simulated `lib/prisma.ts` | `tenant1`                      | Tenant 1 only                       | `22P02 invalid input syntax for type uuid: ""` | No                                      |

### Supplemental observations

- A fresh `PrismaClient` as `app_user` with **no** tenant context returns `[]` on both direct and pooled URLs.
- The `22P02` failure appears after executing `SET LOCAL ...` **outside** an explicit transaction, or when simulating the current `lib/prisma.ts` pattern that sets the variable inside a transaction and then runs the Prisma query outside `tx`.
- Direct `psql` as `app_user` confirmed the underlying DB behavior is sound when the query is truly executed inside the same transaction:
  - `BEGIN`
  - `SET LOCAL app.current_tenant_id = '<tenant-uuid>'`
  - `SELECT "businessName" FROM "Audit"`
  - Result: only the tenant-matching row
- Direct import checks against [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts:33) returned empty results on both direct and pooled URLs even with `runWithTenantAsync(...)`, which matches the simulated failure: the extension calls `query(args)` instead of querying through `tx`.

## Section D - Critical findings

1. **ProposalOS is pointed at the wrong production database today.** `immigration_platform` does not contain a ProposalOS schema, so any live ProposalOS service still using that secret is misconfigured before RLS even enters the picture.
2. **RLS can work through transaction-pooled PgBouncer for a non-superuser app role.** The decisive row is `app_user` + PgBouncer + transaction + `SET LOCAL`, which returned only the tenant-matching row.
3. **The current app runtime would still not be protected in production.** Phase 2.1.5 already verified ProposalOS connects as `postgres`, and local validation confirms `postgres` bypasses RLS entirely.
4. **The current Prisma shim is broken independently of pooling.** In [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts:33), `SET LOCAL` runs on `tx`, but the actual Prisma query is executed via `query(args)` rather than `tx.<model>...`, so the tenant-scoped query is not guaranteed to run on the same transaction/connection.
5. **Missing-tenant behavior is noisy after a bad `SET LOCAL` call.** Once `SET LOCAL` is executed outside a transaction, subsequent Prisma reads can fail with `22P02 invalid input syntax for type uuid: ""` instead of cleanly denying access. The policy expression needs a safer null-handling path.
6. **Local PgBouncer repo config has drift.** The checked-in compose config uses a dead `bitnami/pgbouncer:latest` tag and the wrong upstream port for this repo's Postgres service, so it cannot currently be treated as a reliable deployment artifact.

## Section E - Production blockers

- Fix the ProposalOS `DATABASE_URL` / `DIRECT_URL` secret so it points at a ProposalOS-owned database, not `immigration_platform`
- Rotate the application off `postgres` onto a non-superuser role such as `app_user`
- Fix [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts:33) so the actual Prisma query executes inside the same transaction/connection as `SET LOCAL`
- Harden the policy expression to handle missing tenant context safely without `22P02` errors
- Reconcile the checked-in PgBouncer configuration before treating local/prod pooler behavior as managed infrastructure
- Only after the above: test against the real ProposalOS deployment target, not the mispointed Passwise DB

## Section F - Recommended Phase 2.3 scope

- Fix the Prisma RLS shim transaction semantics in `lib/prisma.ts`
- Introduce a safe tenant-setting helper or policy expression, for example using `NULLIF(current_setting(..., true), '')`
- Rotate Cloud Run / runtime DB credentials from `postgres` to `app_user` (or equivalent non-superuser role)
- Add regression tests that prove:
  - tenant-scoped reads work through the actual app Prisma client
  - missing tenant context denies cleanly
  - raw-query / bad-`SET LOCAL` paths do not leave the session in an invalid state
- Continue the schema gap work from Phase 2.1 for models still missing `tenantId`
- Design the explicit system/admin bypass policy in the deferred Phase 2.4 track rather than relying on owner/superuser behavior
