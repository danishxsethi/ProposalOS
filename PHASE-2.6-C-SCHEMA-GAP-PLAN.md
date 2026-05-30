# Phase 2.6-C Indirect Tenant-Scope Schema Gap Plan

- Branch at planning start: `phase-2-rls-migration`
- HEAD at planning start: `4bd511a`
- Scope: design and exact migration plan only
- Production DB changes made: **none**
- Schema migration generated in this phase: **none**

## Candidate Set Reconciled

The indirect tenant-scoped candidate set reconciles to exactly 9 tables:

1. `Account`
2. `Session`
3. `FindingStatus`
4. `ClientMessage`
5. `ReviewSnapshot`
6. `ConversationState`
7. `ObjectionLog`
8. `EmailSequence`
9. `ABVariant`

## Phase 2.6-D Status Update

Implemented in Phase 2.6-D:

- `FindingStatus`
- `ClientMessage`
- `ReviewSnapshot`

## Phase 2.6-E Status Update

Implemented in Phase 2.6-E:

- `ConversationState`
- `ObjectionLog`
- `EmailSequence`

Still pending after Phase 2.6-E:

- direct `tenantId` + backfill:
  - `ABVariant`
- parent-join RLS:
  - `Account`
  - `Session`

No production DB changes were made in this phase; migration files were added in-repo only.

## Phase 2.6-F Auth-Table Preflight Update

Preflight result for the remaining auth tables:

- `Account`: `UNSAFE_UNTIL_AUTH_ADAPTER_CONTEXT_PLAN`
- `Session`: `UNSAFE_UNTIL_AUTH_ADAPTER_CONTEXT_PLAN`

Why the parent-join policy was not implemented in 2.6-F:

- `Account` and `Session` are owned by `PrismaAdapter(prisma)` in `lib/auth.ts`.
- The adapter performs `Account` operations before tenant context exists:
  - `getUserByAccount(...)` reads `Account` and joins `User`
  - `linkAccount(...)` writes `Account`
- Current auth bootstrapping does not wrap adapter operations in `runWithTenantAsync(...)` or a narrow auth-specific bypass wrapper.
- Credentials auth also performs a pre-tenant `prisma.user.findUnique({ where: { email } })` inside `authorize(...)`, which confirms the auth stack still has pre-tenant database reads.
- Although current config uses `session.strategy = 'jwt'`, the adapter still exposes `Session` methods (`getSessionAndUser`, `createSession`, `updateSession`, `deleteSession`), and there is no verified guarantee in this batch that all auth/session code paths remain free of pre-tenant `Session` access.
- Local Postgres + PgBouncer verification is still unavailable (`localhost:5435` refused connection), so there is no safe way in this batch to validate login/session behavior under actual RLS enforcement.

Recommended next step before adding `Account` / `Session` RLS:

1. Introduce an auth-adapter context plan that explicitly classifies which adapter methods are:
   - tenant-scoped after session/bootstrap, or
   - intentionally pre-tenant and require a narrow audited bypass wrapper
2. Add local auth smoke coverage for:
   - credentials sign-in
   - Google OAuth account lookup/link flow
   - session retrieval / refresh behavior
3. Re-run those flows against the local Postgres + PgBouncer stack under real RLS before enabling `Account` / `Session` policies.

Resulting open items after 2.6-F:

- direct `tenantId` + raw-SQL-paired batch:
  - `ABVariant`
- auth-table parent-policy batch pending adapter/context plan:
  - `Account`
  - `Session`

No production DB changes were made in 2.6-F.

## Phase 2.6-G ABVariant Implementation Update

Implemented in Phase 2.6-G:

- `ABVariant`

What was added in 2.6-G:

- direct `tenantId` column on `ABVariant`
- deterministic backfill from parent `ABExperiment.tenantId`
- `tenant_isolation` and `tenant_bypass` policies on `ABVariant`
- raw SQL reader/writer updates in `lib/self-evolving-prompts/data-access/ab-experiments.ts`
- required Prisma create-path update in `app/api/prompt/experiments/route.ts`

Remaining schema-gap candidates after 2.6-G:

- auth-table parent-policy batch pending adapter/context plan:
  - `Account`
  - `Session`

Carry-forward after 2.6-G:

- `Account` / `Session` remain blocked pending auth-adapter context planning plus local auth/RLS smoke
- broader raw SQL hardening from the 2.6-A inventory remains open
- local Postgres / PgBouncer verification under real `app_user + RLS` remains required before Phase 2.6 closure

No production DB changes were made in 2.6-G.

## Classification Table

| Model               | Table               | Parent                             | Parent tenant-bearing status                                                             | Relation shape                                        | Classification                       | Why                                                                                                                 |
| ------------------- | ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `Account`           | `Account`           | `User`                             | `User.tenantId` already first-class + RLS-covered                                        | required `userId` -> `User.id`                        | `PROTECT_VIA_PARENT_RELATION_POLICY` | Owned by NextAuth adapter; join-policy avoids adapter/schema churn                                                  |
| `Session`           | `Session`           | `User`                             | `User.tenantId` already first-class + RLS-covered                                        | required `userId` -> `User.id`                        | `PROTECT_VIA_PARENT_RELATION_POLICY` | Same adapter concern as `Account`; deterministic parent join exists                                                 |
| `FindingStatus`     | `FindingStatus`     | `Audit` (+ `Finding`)              | `Audit.tenantId` and `Finding.tenantId` already first-class + RLS-covered                | required `auditId`, required `findingId`              | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Delete-data route already assumes direct `tenantId`; audit-scoped reads dominate                                    |
| `ClientMessage`     | `ClientMessage`     | `Audit`                            | `Audit.tenantId` already first-class + RLS-covered                                       | required `auditId`                                    | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Delete-data route already assumes direct `tenantId`; portal/export reads are audit-scoped                           |
| `ReviewSnapshot`    | `ReviewSnapshot`    | `Audit`                            | `Audit.tenantId` already first-class + RLS-covered                                       | required `auditId`                                    | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Delete-data route already assumes direct `tenantId`; monitoring creates are deterministic                           |
| `ConversationState` | `ConversationState` | `Proposal`                         | `Proposal.tenantId` already first-class + RLS-covered                                    | required `proposalId` (unique)                        | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Proposal-scoped persistence with a single deterministic parent                                                      |
| `ObjectionLog`      | `ObjectionLog`      | `Proposal`                         | `Proposal.tenantId` already first-class + RLS-covered                                    | required `proposalId`                                 | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Proposal-scoped log rows and deterministic create path                                                              |
| `EmailSequence`     | `EmailSequence`     | `Proposal`                         | `Proposal.tenantId` already first-class + RLS-covered                                    | required `proposalId` (unique)                        | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Proposal-scoped sequence row; create/upsert path can populate directly                                              |
| `ABVariant`         | `ABVariant`         | `ABExperiment` (+ `PromptVersion`) | `ABExperiment.tenantId` now first-class + RLS-covered; `PromptVersion.tenantId` nullable | required `experimentId`, required `promptVersionHash` | `ADD_DIRECT_TENANT_ID_WITH_BACKFILL` | Experiment ownership is deterministic; direct column is the cleanest way to align raw-SQL experiment flows with RLS |

## Recommended 2.6-D Implementation Order

### Step 1: Preflight data validation queries

Run before any schema migration:

1. `FindingStatus` parent consistency:
   - verify every row joins to an `Audit`
   - verify joined `Audit.tenantId` matches joined `Finding.tenantId`
2. `ClientMessage` parent consistency:
   - verify every row joins to an `Audit`
3. `ReviewSnapshot` parent consistency:
   - verify every row joins to an `Audit`
4. `ConversationState` / `ObjectionLog` / `EmailSequence` parent consistency:
   - verify every row joins to a `Proposal`
5. `ABVariant` parent consistency:
   - verify every row joins to an `ABExperiment`
   - verify if joined `PromptVersion.tenantId` is non-null, it matches `ABExperiment.tenantId`

If any of those checks fail, stop and repair data before adding `NOT NULL` or RLS.

### Step 2: Direct-tenant schema migration for audit-scoped tables

Tables:

- `FindingStatus`
- `ClientMessage`
- `ReviewSnapshot`

Reason to do these first:

- all three backfill from `Audit`
- delete-data route already assumes a direct `tenantId`
- portal/export/reporting reads already naturally organize around audit ownership

Status:

- Completed in Phase 2.6-D

### Step 3: Direct-tenant schema migration for proposal-scoped tables

Tables:

- `ConversationState`
- `ObjectionLog`
- `EmailSequence`

Reason to do these second:

- all three backfill from `Proposal`
- app-side create/update paths are localized and easy to patch in the same batch

### Step 4: Parent-join RLS for auth adapter tables

Tables:

- `Account`
- `Session`

Reason to do these separately:

- no schema churn needed
- RLS can be expressed safely through `User`
- avoids breaking `PrismaAdapter(prisma)` writes by adding a new required column

### Step 5: Direct-tenant schema migration for `ABVariant`

Reason to isolate:

- raw-SQL experiment code must be updated in the same implementation unit
- tenant should come from `ABExperiment`, but prompt-version consistency needs explicit validation

### Step 6: Add `tenant_isolation` + `tenant_bypass`

- direct-column tables: use the standard direct `tenantId` policies
- `Account` / `Session`: use parent-join `EXISTS (...)` policies

### Step 7: Post-migration app-user verification

- local Postgres / PgBouncer only
- verify the new direct-column tables and auth tables under `app_user`
- verify preserved Phase 2.5 followups still behave correctly

## Direct `tenantId` Column Plan

### 1. `FindingStatus`

- New column: `tenantId TEXT`
- Backfill source: `Audit.tenantId` via `FindingStatus.auditId = Audit.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**, if preflight reveals no orphan rows
- Index required: `CREATE INDEX ... ON "FindingStatus"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- App/code impact:
  - likely no current Prisma write path to patch
  - delete-data raw SQL later becomes semantically valid once raw SQL is hardened
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `Audit`
  3. validate no nulls
  4. optionally validate `Audit.tenantId == Finding.tenantId` for all rows
  5. set `NOT NULL`
  6. add FK + index
  7. add `tenant_isolation` + `tenant_bypass`
- Revert:
  - drop policies
  - drop FK/index
  - drop column

### 2. `ClientMessage`

- New column: `tenantId TEXT`
- Backfill source: `Audit.tenantId` via `ClientMessage.auditId = Audit.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**
- Index required: `CREATE INDEX ... ON "ClientMessage"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- App/code impact:
  - no current production Prisma write path found in `app/` or `lib/`
  - portal/export reads continue to use the audit relation unchanged
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `Audit`
  3. validate no nulls
  4. set `NOT NULL`
  5. add FK + index
  6. add `tenant_isolation` + `tenant_bypass`
- Revert: same pattern as `FindingStatus`

### 3. `ReviewSnapshot`

- New column: `tenantId TEXT`
- Backfill source: `Audit.tenantId` via `ReviewSnapshot.auditId = Audit.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**
- Index required: `CREATE INDEX ... ON "ReviewSnapshot"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- App/code impact:
  - `lib/monitoring/reputationMonitor.ts` creates `ReviewSnapshot` rows and must populate `tenantId` from the loaded audit
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `Audit`
  3. validate no nulls
  4. set `NOT NULL`
  5. add FK + index
  6. patch `reputationMonitor.ts` create path
  7. add `tenant_isolation` + `tenant_bypass`
- Revert: same pattern as `FindingStatus`

### 4. `ConversationState`

- New column: `tenantId TEXT`
- Backfill source: `Proposal.tenantId` via `ConversationState.proposalId = Proposal.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**
- Index required: `CREATE INDEX ... ON "ConversationState"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- App/code impact:
  - `lib/closing/memory.ts:getOrCreateSession()` create path must include `tenantId`
  - updates can continue to key by `proposalId`
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `Proposal`
  3. validate no nulls
  4. set `NOT NULL`
  5. add FK + index
  6. patch `ConversationMemory.getOrCreateSession(...)`
  7. add `tenant_isolation` + `tenant_bypass`
- Revert: same general pattern

### 5. `ObjectionLog`

- New column: `tenantId TEXT`
- Backfill source: `Proposal.tenantId` via `ObjectionLog.proposalId = Proposal.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**
- Index required: `CREATE INDEX ... ON "ObjectionLog"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- App/code impact:
  - `lib/closing/memory.ts:logObjection()` create path must include `tenantId`
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `Proposal`
  3. validate no nulls
  4. set `NOT NULL`
  5. add FK + index
  6. patch `logObjection(...)`
  7. add `tenant_isolation` + `tenant_bypass`
- Revert: same general pattern

### 6. `EmailSequence`

- New column: `tenantId TEXT`
- Backfill source: `Proposal.tenantId` via `EmailSequence.proposalId = Proposal.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**
- Index required: `CREATE INDEX ... ON "EmailSequence"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- App/code impact:
  - `lib/email/generator.ts` upsert create path must include `tenantId`
  - `findUnique/update` by `proposalId` in email analytics / schedulers can remain unchanged
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `Proposal`
  3. validate no nulls
  4. set `NOT NULL`
  5. add FK + index
  6. patch `generateEmailSequenceNode(...)` create/upsert path
  7. add `tenant_isolation` + `tenant_bypass`
- Revert: same general pattern

### 7. `ABVariant`

- New column: `tenantId TEXT`
- Backfill source: `ABExperiment.tenantId` via `ABVariant.experimentId = ABExperiment.id`
- Deterministic backfill: **yes**
- Can be `NOT NULL` immediately after backfill: **yes**, if every row joins to an experiment
- Index required: `CREATE INDEX ... ON "ABVariant"("tenantId")`
- FK recommended: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`
- Additional preflight validation:
  - if joined `PromptVersion.tenantId` is non-null, it must equal `ABExperiment.tenantId`
- App/code impact:
  - `lib/self-evolving-prompts/data-access/ab-experiments.ts` direct raw `INSERT INTO ab_variants ...` must start writing `tenant_id`
  - `lib/self-evolving-prompts/types.ts` row interfaces likely need `tenant_id`
  - downstream raw query wrappers may need column selection updates
- Migration order:
  1. add nullable `tenantId`
  2. backfill from `ABExperiment`
  3. validate no nulls
  4. validate prompt-version cross-tenant consistency
  5. set `NOT NULL`
  6. add FK + index
  7. patch raw SQL create/read paths in the same implementation batch
  8. add `tenant_isolation` + `tenant_bypass`
- Revert:
  - drop policies
  - drop FK/index
  - drop column
  - only after code is rolled back in the same deployment unit

## Parent-Relation Policy Plan

### 1. `Account`

- Parent table: `User`
- Join predicate: `"User"."id" = "Account"."userId"`
- Recommended `tenant_isolation` `USING` shape:

```sql
EXISTS (
  SELECT 1
  FROM "User"
  WHERE "User"."id" = "Account"."userId"
    AND "User"."tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid
)
```

- Recommended `tenant_isolation` `WITH CHECK` shape:

```sql
EXISTS (
  SELECT 1
  FROM "User"
  WHERE "User"."id" = "Account"."userId"
    AND "User"."tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid
)
```

- `tenant_bypass` policy shape:

```sql
current_setting('app.bypass_rls', true) = 'true'
```

- Performance / index concerns:
  - parent-side lookup uses `User.id` PK, which is good
  - consider adding `Account("userId")` index in the same migration for adapter/user cleanup patterns
- Acceptable under PostgreSQL RLS semantics: **yes**
- Why not direct `tenantId` now:
  - `PrismaAdapter(prisma)` owns inserts/updates
  - adding a required column here would force auth-layer code/config changes in the same rollout

### 2. `Session`

- Parent table: `User`
- Join predicate: `"User"."id" = "Session"."userId"`
- Recommended `tenant_isolation` `USING` shape:

```sql
EXISTS (
  SELECT 1
  FROM "User"
  WHERE "User"."id" = "Session"."userId"
    AND "User"."tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid
)
```

- Recommended `tenant_isolation` `WITH CHECK` shape:

```sql
EXISTS (
  SELECT 1
  FROM "User"
  WHERE "User"."id" = "Session"."userId"
    AND "User"."tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid
)
```

- `tenant_bypass` policy shape:

```sql
current_setting('app.bypass_rls', true) = 'true'
```

- Performance / index concerns:
  - parent-side lookup uses `User.id` PK, which is good
  - consider adding `Session("userId")` index in the same migration
- Acceptable under PostgreSQL RLS semantics: **yes**
- Why not direct `tenantId` now:
  - same adapter-managed write concern as `Account`

## Candidates Requiring Manual Review or Deferral

No candidate requires a full stop in planning, but two implementation caveats should remain explicit:

1. `ABVariant`
   - not blocked at the design level
   - must be implemented in the same deployment unit as raw-SQL updates in `lib/self-evolving-prompts/data-access/ab-experiments.ts`
2. `Account` / `Session`
   - not blocked, but they should stay on the join-policy path unless there is a separate auth-adapter migration plan

## App / Code Impact Summary

Direct-column candidates with expected code touchpoints:

- `ReviewSnapshot`
  - `lib/monitoring/reputationMonitor.ts`
- `ConversationState`
  - `lib/closing/memory.ts`
- `ObjectionLog`
  - `lib/closing/memory.ts`
- `EmailSequence`
  - `lib/email/generator.ts`
  - read/update-only consumers in `lib/email/analytics.ts`, `lib/email/sequence-branching.ts`, `lib/graph/email-scheduler-graph.ts`, `lib/graph/retention-graph.ts`
- `ABVariant`
  - `lib/self-evolving-prompts/data-access/ab-experiments.ts`
  - `lib/self-evolving-prompts/types.ts`

Read-heavy candidates with little or no current Prisma write impact:

- `FindingStatus`
  - `lib/client/data-export.ts`
  - `lib/client/health-score.ts`
  - `app/api/client/portal/data/route.ts`
  - `app/api/client/improvement/[auditId]/route.ts`
- `ClientMessage`
  - `lib/client/data-export.ts`
- `ReviewSnapshot`
  - `app/api/client/portal/data/route.ts`

Auth adapter impact:

- `Account`
- `Session`
- `lib/auth.ts` uses `PrismaAdapter(prisma)` and is the main reason these two should avoid direct-column schema churn in the first implementation batch

## Raw SQL References to Candidate Tables

Raw-SQL hits found during planning:

- `app/api/tenants/[tenantId]/delete-data/route.ts`
  - `DELETE FROM "ClientMessage" WHERE "tenantId" = $1`
  - `DELETE FROM "FindingStatus" WHERE "tenantId" = $1`
  - `DELETE FROM "ReviewSnapshot" WHERE "tenantId" = $1`
- `lib/self-evolving-prompts/data-access/ab-experiments.ts`
  - raw `INSERT` / `SELECT` on `ABVariant`

No additional direct raw-SQL hits were found for:

- `Account`
- `Session`
- `ConversationState`
- `ObjectionLog`
- `EmailSequence`

## Risks and Rollback Notes

- The direct-column tables are safe only if parent joins are complete and deterministic; run preflight validation before adding `NOT NULL`.
- `ABVariant` must not be migrated separately from its raw-SQL writers/readers.
- `Account` / `Session` should not get a required `tenantId` column opportunistically; that would couple schema rollout to auth-adapter write behavior.
- For direct-column tables, rollback should remove RLS policies first, then FK/indexes, then the added `tenantId` columns.
- For `Account` / `Session`, rollback is policy-only and does not require schema reversal if the join-policy design is used.
