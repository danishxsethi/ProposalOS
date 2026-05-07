# Phase 2.6-K Local app_user + RLS Verification

- Branch: `phase-2-rls-migration`
- Inventory HEAD before docs: `03e9f84`
- Scope: local Postgres, local PgBouncer, local smoke DB, checked-in migration/RLS SQL verification only
- Production DB changes made: **none**

## Summary

Local Postgres and a bounded local PgBouncer workaround were restored successfully, and representative Phase 2.6 tables now verify correctly under pooled `app_user` transactions with `SET LOCAL`. Phase 2.6 still cannot close from this batch alone because the local migration history is not replayable from an empty database, no-context pooled reads still fail with `22P02`, and the carried-forward app bootstrap lookups in `humanReview`, the override route, and team invite still fail under `app_user + RLS`.

## Local Startup and Diagnosis

1. Docker was initially unavailable because the Docker Desktop daemon was not running.
2. Docker Desktop was restarted locally.
3. Local Postgres was restored with the repo's existing command path:
   - `docker compose up -d postgres`
4. The checked-in PgBouncer compose path is still drifted locally:
   - `docker-compose.pgbouncer.yml` references `bitnami/pgbouncer:latest`, which no longer resolves
   - the file's upstream host/port wiring also does not match the current repo network layout for this verification run
5. For bounded verification only, a disposable `pgbouncer/pgbouncer:latest` container was started on the existing Docker network and published on `localhost:6432`.
6. PgBouncer was verified in `transaction` pool mode.

## Connectivity

| Probe                                                              | Result                    |
| ------------------------------------------------------------------ | ------------------------- |
| `psql -h localhost -p 5435 -U postgres -d postgres -c 'SELECT 1;'` | pass                      |
| `psql -h localhost -p 6432 -U app_user -d postgres -c 'SELECT 1;'` | pass                      |
| `SHOW CONFIG` via PgBouncer                                        | `pool_mode = transaction` |

## Migration Verification

### Empty-DB replay result

`DATABASE_URL=postgresql://postgres:password@localhost:5435/proposal_rls_smoke pnpm exec prisma migrate status` reports all 13 checked-in migrations as unapplied on a fresh smoke database, and `prisma migrate deploy` fails from empty local state at:

- `20260228_make_tenant_required`
- failure shape: `relation "Finding" does not exist`

Conclusion: the checked-in migration history is not currently replayable from an empty local database.

### Bounded local verification path used

To continue Phase 2.6-K without editing production code or migration files, the smoke database was prepared locally with:

1. `pnpm exec prisma db push --skip-generate`
2. Checked-in RLS SQL applied locally:
   - full `prisma/migrations/20260429093000_enable_rls/migration.sql`
   - full `prisma/migrations/20260501014500_rls_bypass_policies/migration.sql`
   - full `prisma/migrations/20260504164459_rls_cover_remaining_tenant_tables/migration.sql`
   - Step 5 policy sections only from:
     - `20260504184154_add_tenant_id_to_audit_scoped_models/migration.sql`
     - `20260504224500_add_tenant_id_to_proposal_scoped_models/migration.sql`
     - `20260504235500_add_tenant_id_to_ab_variants/migration.sql`

The Step 5-only approach for the 2.6-D / 2.6-E / 2.6-G migrations was intentional because `db push` had already materialized the schema columns; replaying the earlier `ADD COLUMN` steps would fail locally and would not improve the RLS verification signal.

## app_user Role Verification

Catalog query result:

| Role       | `rolsuper` | `rolcanlogin` |
| ---------- | ---------- | ------------- |
| `app_user` | `false`    | `true`        |
| `postgres` | `true`     | `true`        |

Representative table grants verified for `app_user` on:

- `Audit`
- `Proposal`
- `checkout_attempts`
- `AuditTrailEvent`
- `FindingStatus`
- `ReviewSnapshot`
- `ConversationState`
- `EmailSequence`
- `ABExperiment`
- `ABVariant`
- `PromptPerformanceLog`

Each representative table exposed `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to `app_user`.

## FORCE RLS Verification

After applying the checked-in RLS SQL locally, the representative tables below all verified with:

- `relrowsecurity = true`
- `relforcerowsecurity = true`
- `tenant_isolation`
- `tenant_bypass`

Representative tables checked:

- `User`
- `ProspectLead`
- `Audit`
- `Proposal`
- `checkout_attempts`
- `AuditTrailEvent`
- `FindingStatus`
- `ReviewSnapshot`
- `ConversationState`
- `EmailSequence`
- `ABExperiment`
- `ABVariant`
- `PromptPerformanceLog`

## SET LOCAL and PgBouncer Transaction Scope

Verified on pooled `app_user` through `localhost:6432`:

1. First transaction:
   - `SET LOCAL app.current_tenant_id = <tenant A>`
   - tenant A `Audit` read returned `1`
2. Next transaction on pooled `app_user` without setting tenant context:
   - read failed with `22P02 invalid input syntax for type uuid: ""`

This shows the tenant setting is not sticky across transactions under PgBouncer transaction pooling, but the no-context failure mode is still noisy instead of yielding a clean empty result.

## scripts/rls-smoke-test.ts Result

`pnpm exec tsx scripts/rls-smoke-test.ts` is still not a clean binary gate for the current runtime, but its useful signals after the local RLS application were:

- pass:
  - `app_user` + PgBouncer transaction + `SET LOCAL`
  - `app_user` + direct transaction + `SET LOCAL`
  - `postgres` no-context read as expected superuser bypass
- fail / still relevant:
  - pooled `app_user` no-context reads still hit `22P02`
  - pooled `app_user` raw query outside transaction still hits `22P02`
  - simulated current shim pattern still fails because the ORM query escapes the transaction-local setting

## Representative RLS Isolation Matrix

Fresh tenant A / tenant B rows were seeded locally for the matrix below. All checks were executed against pooled `app_user` on `localhost:6432`.

| Table                  | Own-tenant read | Own-tenant write | Cross-tenant read denied | Mismatched write denied | Explicit bypass read | Post-bypass no-context |
| ---------------------- | --------------- | ---------------- | ------------------------ | ----------------------- | -------------------- | ---------------------- |
| `Audit`                | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `Proposal`             | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `checkout_attempts`    | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `AuditTrailEvent`      | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `FindingStatus`        | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `ReviewSnapshot`       | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `ConversationState`    | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `EmailSequence`        | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `ABExperiment`         | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `ABVariant`            | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |
| `PromptPerformanceLog` | pass            | pass             | pass                     | pass                    | pass                 | `22P02`                |

Interpretation:

- tenant isolation is working on the representative baseline and newly covered Phase 2.6 tables
- explicit bypass works when intentionally enabled inside the transaction
- bypass is not sticky across transactions
- the no-context path still fails noisily and remains a closure blocker

## Phase 2.5 / 2.6 Followup Verification

| Item                                                                | Result                                                                                                                                                                                                   | Classification                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `lib/pipeline/humanReview.ts` tenant-discovery lookup               | `Tenant context required for ProspectLead.findUnique: missing tenant context`                                                                                                                            | must-fix before Phase 2.6 closure              |
| `app/api/pipeline/prospects/[id]/override/route.ts` fallback lookup | `Tenant context required for ProspectLead.findUnique: missing tenant context`                                                                                                                            | must-fix before Phase 2.6 closure              |
| `app/api/team/invite/route.ts` global-user uniqueness lookup        | `Tenant context required for User.findUnique: missing tenant context`                                                                                                                                    | must-fix before Phase 2.6 closure              |
| `checkoutAttempt.create` with tenant context                        | success                                                                                                                                                                                                  | verified                                       |
| `checkoutAttempt.create` mismatched tenant write                    | denied with `42501` RLS violation                                                                                                                                                                        | verified                                       |
| Raw helper-backed self-evolving reads/writes                        | direct table RLS verified on `ABExperiment`, `ABVariant`, and `PromptPerformanceLog`; previous runtime helper probe still showed `23502`/empty-read behavior on helper calls and needs targeted followup | must-fix or re-verify before Phase 2.6 closure |
| `Account` / `Session`                                               | still intentionally blocked                                                                                                                                                                              | defer to auth-adapter context plan             |

## Failures and Blockers

Phase 2.6 cannot close yet. The remaining blockers from this batch are:

1. Local migration history is not replayable from an empty database via `prisma migrate deploy`.
2. Pooled `app_user` no-context reads still fail with `22P02 invalid input syntax for type uuid: ""`.
3. `humanReview` prospect bootstrap lookup still lacks tenant context under `app_user + RLS`.
4. Override-route fallback lookup still lacks tenant context under `app_user + RLS`.
5. Team/invite global-user uniqueness lookup still lacks tenant context under `app_user + RLS`.
6. Helper-backed self-evolving runtime verification still needs a clean pass after the local RLS setup.
7. `Account` / `Session` remain intentionally blocked pending the auth-adapter context plan and local auth/RLS smoke.

## Phase 2.6 Closure Status

- Local infrastructure blocker is resolved for development verification.
- Production raw SQL hardening remains complete.
- Local app_user/RLS verification has now run and produced actionable evidence.
- Phase 2.6 remains blocked on the followup runtime items above plus the intentionally deferred auth-table work.

## Phase 2.6-L Followup Status

Phase 2.6-L implemented the three non-auth-table app-context followups identified here:

- `lib/pipeline/humanReview.ts`
- `app/api/pipeline/prospects/[id]/override/route.ts`
- `app/api/team/invite/route.ts`

The code change uses narrow read-only tenant-discovery bypass helpers with specific reasons and keeps the downstream writes inside `runWithTenantAsync(...)`.

### 2.6-L Verification Results

- **Static Verification**:
  - `pnpm build`: ✅ Pass
  - `eslint`: ✅ Pass (3 minor warnings on `any` usage)
  - `prettier`: ✅ Pass
  - `tsc`: ✅ Pass (count at 1160, exactly on target)
  - `createScopedPrisma`: ✅ 0 occurrences found in production code.
- **Runtime Verification**:
  - Local Docker/Postgres stack remained unstable (PgBouncer restarting due to configuration errors); further runtime verification is deferred until the local stack is stabilized.
  - Code analysis confirms that all five requested `humanReview` discovery paths, the override route fallback, and the team invite uniqueness check are now properly wrapped in `runWithTenantBypass` with specific reasons.
