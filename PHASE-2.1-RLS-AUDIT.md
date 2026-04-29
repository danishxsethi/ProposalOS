# Phase 2.1 RLS Audit

Captured: 2026-04-29T15:25:58Z
Branch: `phase-2-rls-migration`
Starting HEAD: `7cb07b9`

This document materializes the read-only Phase 2.1 audit that preceded RLS implementation. It covers the current RLS artifacts in the repo, non-prod DB availability, live deployment visibility, and the risks in the current Prisma tenant-scoping shim.

## 0a. Non-prod DB availability

### Findings

- Local Postgres is available now:
  - `pg_isready` returned `/tmp:5432 - accepting connections`
- Local Docker-based non-prod targets also exist:
  - [docker-compose.yml](/Users/danishsethi/VSCODE/ProposalOS/docker-compose.yml) defines a Postgres container `proposal_engine_db` on `5435`
  - [docker-compose.pgbouncer.yml](/Users/danishsethi/VSCODE/ProposalOS/docker-compose.pgbouncer.yml) defines PgBouncer on `6432` in `transaction` pool mode
- Repo-side non-prod deployment hints exist:
  - [cloudbuild.yaml](/Users/danishsethi/VSCODE/ProposalOS/cloudbuild.yaml) references a staging deploy target `proposal-engine-staging`
  - [scripts/setup-cloud-sql.sh](/Users/danishsethi/VSCODE/ProposalOS/scripts/setup-cloud-sql.sh) shows Cloud SQL socket-style DSNs for local setup
- Cloud SQL discovery across visible projects was blocked by CLI auth refresh failure:

```text
ERROR: (gcloud.projects.list) There was a problem refreshing your current auth tokens:
Reauthentication failed. cannot prompt during non-interactive execution.
Please run:
  $ gcloud auth login
```

### Live Cloud SQL non-prod instances

- None verified from this audit pass because `gcloud projects list` and follow-on `gcloud sql instances list` could not complete non-interactively.

### Repo configs pointing at dev/staging DBs

- [cloudbuild.yaml](/Users/danishsethi/VSCODE/ProposalOS/cloudbuild.yaml) sets `_ENVIRONMENT: 'staging'` by default and deploys `proposal-engine-staging` outside production.
- [docker-compose.yml](/Users/danishsethi/VSCODE/ProposalOS/docker-compose.yml) defines a local Postgres dev DB `proposal_engine`.
- [docker-compose.pgbouncer.yml](/Users/danishsethi/VSCODE/ProposalOS/docker-compose.pgbouncer.yml) simulates the production pooled connection model locally.
- `.env` files present locally:
  - `.env.example`
  - `.env.local`
  - `.env.production.example`

### Local Postgres availability

- Native/local socket PostgreSQL: available on `/tmp:5432`
- Docker Postgres: configured in compose, but not confirmed running from this pass
- Local PgBouncer: configured in compose, but not confirmed running from this pass

### Recommendation for Phase 2.2 smoke tests

Use **local Postgres plus local PgBouncer transaction-mode pooling** as the first live validation target. That setup is available without IAM and directly exercises the highest-risk assumption in the current design: `SET LOCAL app.current_tenant_id` under pooled connections.

## 0b. Live deployment status

### Findings

- The repo clearly targets Cloud Run:
  - [cloudbuild.yaml](/Users/danishsethi/VSCODE/ProposalOS/cloudbuild.yaml) deploys `proposal-engine` for production and `proposal-engine-staging` for staging
  - [deploy.sh](/Users/danishsethi/VSCODE/ProposalOS/deploy.sh) deploys service `proposal-engine`
- Environment defaults show localhost in dev and Run-style URLs in production examples:
  - `.env.example`: `NEXT_PUBLIC_APP_URL="http://localhost:3000"`
  - `.env.production.example`: `NEXT_PUBLIC_APP_URL="https://your-app.run.app"`
- Git deployment markers exist:
  - branch: `production-hardening-complete`
  - commit history includes `Merge pull request #1 from danishxsethi/production-hardening-complete`
- `proposal-engine-db` is already known from Phase 0.5 to be stopped and dormant, so it should not be assumed to represent live ProposalOS traffic.

### Cloud Run services and jobs

- Actual Cloud Run inventory was **unverifiable** during this pass because `gcloud run services list` and `gcloud run jobs list` failed with the same non-interactive reauth error:

```text
ERROR: (gcloud.run.services.list) There was a problem refreshing your current auth tokens:
Reauthentication failed. cannot prompt during non-interactive execution.
Please run:
  $ gcloud auth login
```

### Other host configs

- No `.vercel/` directory detected
- No `vercel.json`
- No `netlify.toml`
- Current repo evidence points most strongly to GCP Cloud Run, not Vercel or Netlify

### Inference

**Live deployment configured, runtime status unverifiable from current CLI auth.**

The repo has clear Cloud Run deployment machinery, but this audit pass could not confirm:

- whether any ProposalOS service is currently live,
- which Cloud SQL instance it attaches to,
- or which DB role the app uses (`postgres`, `app_user`, or another role).

### Commands to re-run after auth refresh

```bash
gcloud auth login
gcloud auth application-default login

for proj in $(gcloud projects list --format='value(projectId)'); do
  echo "=== Project: $proj ==="
  gcloud run services list --project="$proj" --format='table(metadata.name,status.url,status.latestReadyRevisionName)' | head -10
  gcloud sql instances list --project="$proj" --format='table(name,region,state)' | head -10
done
```

## 1. Existing RLS files

### RLS-related files discovered

- [prisma/enable_rls.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/enable_rls.sql)
- [prisma/migrations/rls/enable_rls.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/rls/enable_rls.sql)
- [prisma/migrations/rls/revert_rls.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/rls/revert_rls.sql)
- [prisma/schema.prisma](/Users/danishsethi/VSCODE/ProposalOS/prisma/schema.prisma)

### File sizes and last-modified

- `prisma/enable_rls.sql` — 10,589 bytes — modified `2026-04-25 02:24:17`
- `prisma/migrations/rls/enable_rls.sql` — 20,190 bytes — modified `2026-02-27 21:48:29`
- `prisma/migrations/rls/revert_rls.sql` — 1,398 bytes — modified `2026-02-25 14:22:23`

### Tracking status

- `prisma/enable_rls.sql` is tracked in git
- `prisma/migrations/**` is ignored by [.gitignore](/Users/danishsethi/VSCODE/ProposalOS/.gitignore:37) via `/prisma/migrations/`
- `git ls-files` shows:
  - tracked: `prisma/enable_rls.sql`, `prisma/schema.prisma`
  - not tracked: all files under `prisma/migrations/`

### Key observation

The repo currently has **two divergent RLS artifacts**, and the structurally stronger one lives in a gitignored directory. That means there is no single authoritative tracked RLS source of truth today.

## 2. Coverage table (67 models)

Using [prisma/migrations/rls/enable_rls.sql](/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/rls/enable_rls.sql) as the stricter baseline:

- `35/67` tenant-bearing models have `CREATE POLICY`
- `32/67` are missing
- `0` have `CREATE POLICY` without `ENABLE ROW LEVEL SECURITY`
- `0` have `CREATE POLICY` without `FORCE ROW LEVEL SECURITY`

Across both divergent files combined, nominal coverage reaches `46/67`, but that number is not trustworthy because the tracked file contains `@@map` mismatches for physical table names.

| Model                       | Postgres table              | tenantId column present | CREATE POLICY present | ENABLE ROW LEVEL SECURITY present | FORCE ROW LEVEL SECURITY present |
| --------------------------- | --------------------------- | ----------------------- | --------------------- | --------------------------------- | -------------------------------- |
| Audit                       | Audit                       | YES                     | YES                   | YES                               | YES                              |
| Finding                     | Finding                     | YES                     | YES                   | YES                               | YES                              |
| Proposal                    | Proposal                    | YES                     | YES                   | YES                               | YES                              |
| ProposalAcceptance          | ProposalAcceptance          | YES                     | NO                    | NO                                | NO                               |
| ProposalView                | ProposalView                | YES                     | NO                    | NO                                | NO                               |
| ContactRequest              | ContactRequest              | YES                     | YES                   | YES                               | YES                              |
| ProposalFollowUp            | ProposalFollowUp            | YES                     | YES                   | YES                               | YES                              |
| EvidenceSnapshot            | EvidenceSnapshot            | YES                     | YES                   | YES                               | YES                              |
| ProposalTemplate            | ProposalTemplate            | YES                     | YES                   | YES                               | YES                              |
| User                        | User                        | YES                     | YES                   | YES                               | YES                              |
| Invitation                  | Invitation                  | YES                     | YES                   | YES                               | YES                              |
| Playbook                    | Playbook                    | YES                     | YES                   | YES                               | YES                              |
| AuditSchedule               | AuditSchedule               | YES                     | YES                   | YES                               | YES                              |
| AuditTarget                 | AuditTarget                 | YES                     | YES                   | YES                               | YES                              |
| ProspectDiscoveryJob        | ProspectDiscoveryJob        | YES                     | YES                   | YES                               | YES                              |
| ProspectLead                | ProspectLead                | YES                     | YES                   | YES                               | YES                              |
| ProspectEnrichmentRun       | ProspectEnrichmentRun       | YES                     | YES                   | YES                               | YES                              |
| OutreachSendingDomain       | OutreachSendingDomain       | YES                     | YES                   | YES                               | YES                              |
| OutreachDomainDailyStat     | OutreachDomainDailyStat     | YES                     | YES                   | YES                               | YES                              |
| OutreachEmail               | OutreachEmail               | YES                     | YES                   | YES                               | YES                              |
| OutreachEmailEvent          | OutreachEmailEvent          | YES                     | YES                   | YES                               | YES                              |
| ApiKey                      | ApiKey                      | YES                     | YES                   | YES                               | YES                              |
| TenantBranding              | TenantBranding              | YES                     | YES                   | YES                               | YES                              |
| ProspectStateTransition     | ProspectStateTransition     | YES                     | YES                   | YES                               | YES                              |
| DeliveryTask                | DeliveryTask                | YES                     | YES                   | YES                               | YES                              |
| PipelineConfig              | PipelineConfig              | YES                     | YES                   | YES                               | YES                              |
| PipelineErrorLog            | PipelineErrorLog            | YES                     | YES                   | YES                               | YES                              |
| OutreachTemplatePerformance | OutreachTemplatePerformance | YES                     | NO                    | NO                                | NO                               |
| WinLossRecord               | WinLossRecord               | YES                     | YES                   | YES                               | YES                              |
| PreWarmingAction            | PreWarmingAction            | YES                     | YES                   | YES                               | YES                              |
| DetectedSignal              | DetectedSignal              | YES                     | YES                   | YES                               | YES                              |
| ChatConversation            | ChatConversation            | YES                     | YES                   | YES                               | YES                              |
| PartnerDeliveredLead        | PartnerDeliveredLead        | YES                     | NO                    | NO                                | NO                               |
| ProposalOutreach            | ProposalOutreach            | YES                     | YES                   | YES                               | YES                              |
| FollowUpEmailSend           | FollowUpEmailSend           | YES                     | YES                   | YES                               | YES                              |
| UsageRecord                 | UsageRecord                 | YES                     | YES                   | YES                               | YES                              |
| FailedWebhookEvent          | failed_webhook_events       | YES                     | NO                    | NO                                | NO                               |
| CartAbandonmentEvent        | cart_abandonment_events     | YES                     | NO                    | NO                                | NO                               |
| Subscription                | subscriptions               | YES                     | NO                    | NO                                | NO                               |
| Payment                     | payments                    | YES                     | NO                    | NO                                | NO                               |
| CheckoutAttempt             | checkout_attempts           | YES                     | NO                    | NO                                | NO                               |
| GeneratedArtifact           | GeneratedArtifact           | YES                     | NO                    | NO                                | NO                               |
| DeliveryBundle              | DeliveryBundle              | YES                     | NO                    | NO                                | NO                               |
| AdversarialQARun            | AdversarialQARun            | YES                     | NO                    | NO                                | NO                               |
| HallucinationLog            | HallucinationLog            | YES                     | NO                    | NO                                | NO                               |
| HumanReviewFlag             | HumanReviewFlag             | YES                     | NO                    | NO                                | NO                               |
| Project                     | Project                     | YES                     | YES                   | YES                               | YES                              |
| NPSSurvey                   | NPSSurvey                   | YES                     | YES                   | YES                               | YES                              |
| QATelemetry                 | QATelemetry                 | YES                     | YES                   | YES                               | YES                              |
| Metric                      | Metric                      | YES                     | NO                    | NO                                | NO                               |
| AuditTrailEvent             | AuditTrailEvent             | YES                     | NO                    | NO                                | NO                               |
| MonitoringConfig            | MonitoringConfig            | YES                     | NO                    | NO                                | NO                               |
| LocationGroup               | LocationGroup               | YES                     | NO                    | NO                                | NO                               |
| CircuitBreakerState         | CircuitBreakerState         | YES                     | NO                    | NO                                | NO                               |
| DeadLetterQueue             | DeadLetterQueue             | YES                     | NO                    | NO                                | NO                               |
| ClientDashboard             | ClientDashboard             | YES                     | NO                    | NO                                | NO                               |
| UpsellOpportunity           | UpsellOpportunity           | YES                     | NO                    | NO                                | NO                               |
| NotificationPreference      | NotificationPreference      | YES                     | NO                    | NO                                | NO                               |
| ScheduledAuditRun           | ScheduledAuditRun           | YES                     | NO                    | NO                                | NO                               |
| CompetitorSignal            | CompetitorSignal            | YES                     | NO                    | NO                                | NO                               |
| ReEngagementCampaign        | ReEngagementCampaign        | YES                     | NO                    | NO                                | NO                               |
| WinBackCampaign             | WinBackCampaign             | YES                     | NO                    | NO                                | NO                               |
| PromptVersion               | PromptVersion               | YES                     | NO                    | NO                                | NO                               |
| PromptPerformanceLog        | PromptPerformanceLog        | YES                     | NO                    | NO                                | NO                               |
| ABExperiment                | ABExperiment                | YES                     | NO                    | NO                                | NO                               |
| Prediction                  | Prediction                  | YES                     | NO                    | NO                                | NO                               |
| Scenario                    | Scenario                    | YES                     | NO                    | NO                                | NO                               |

## 3. Policy correctness

### Migration-style file: `prisma/migrations/rls/enable_rls.sql`

Strengths:

- uses `current_setting('app.current_tenant_id', true)` consistently
- uses `ENABLE ROW LEVEL SECURITY`
- uses `FORCE ROW LEVEL SECURITY`
- creates `app_user`
- ships with a matching revert file

Weaknesses:

- only `34` explicit policies in the file body
- no `WITH CHECK` clauses for writes
- no explicit admin/system bypass policy
- incomplete model coverage
- some comments are stale (for example, comments imply some tables lack direct `tenantId` when schema now includes it)

### Tracked root file: `prisma/enable_rls.sql`

Strengths:

- attempts to cover some newer models absent from the migration-style file

Weaknesses:

- no `FORCE ROW LEVEL SECURITY`
- no `WITH CHECK` clauses
- no role creation or privilege model
- targets Prisma model names instead of physical table names for some `@@map`ped models
- not paired with a tracked revert

### `@@map` correctness bug

The tracked file appears to target model names rather than physical table names for mapped models. Examples:

- `FailedWebhookEvent` instead of `failed_webhook_events`
- `CartAbandonmentEvent` instead of `cart_abandonment_events`
- `Subscription` instead of `subscriptions`
- `Payment` instead of `payments`

These policies either never applied successfully or target non-existent relations.

### NULL `tenantId` behavior

Nullable tables in the migration-style file use predicates such as:

```sql
"tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true)
```

That allows system-wide rows to remain visible. This may be intentional, but it is a policy choice that needs to be explicit and reviewed per table.

## 4. Application status

### Migration history evidence

- `prisma/migrations/**` exists on disk but is ignored by git
- `git log --all --oneline -- prisma/migrations/rls/` returned no tracked history
- `git ls-files prisma/migrations/rls prisma/enable_rls.sql prisma/migrations/migration_lock.toml` returned only `prisma/enable_rls.sql`

### Implication

There is currently **no tracked migration history** proving the stronger migration-style RLS SQL was ever committed, reviewed, or deployed in a repeatable way.

### SQL to run against the live DB after auth and access are restored

```sql
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

These queries are the source of truth for whether RLS is actually enabled and forced in the live environment.

## 5. Shim transaction semantics

Current behavior in [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts):

- global Prisma `$extends` query hook wraps `$allModels / $allOperations`
- reads tenant context from AsyncLocalStorage via `getTenantIdFromStore()`
- if tenant context exists, opens an interactive transaction and executes:

```sql
SET LOCAL app.current_tenant_id = '<tenantId>'
```

- then executes the Prisma model query
- if tenant context is absent, it runs the query unmodified

### What this means

- the hook attempts to scope **every Prisma model operation**
- raw client-level SQL paths such as `$queryRaw`, `$executeRaw`, and `$executeRawUnsafe` are outside this model-hook coverage and can bypass Prisma-layer protections
- behavior under nested transactions is not proven from static inspection alone
- `SET LOCAL` only lives for the current transaction; if the query does not actually run on the same transaction connection, RLS will not see the tenant setting

### Risk to validate in Phase 2.2

The repo assumes `SET LOCAL` remains viable with its pooled connection design. That is exactly the behavior that must be validated under local Postgres plus PgBouncer.

## 6. Cloud SQL pooling

### Direct vs pooled connection model

- [docs/pgbouncer-setup.md](/Users/danishsethi/VSCODE/ProposalOS/docs/pgbouncer-setup.md) documents:
  - direct/admin URL on `5432`
  - pooled application URL on `6432`
  - PgBouncer in **transaction mode**
- [docker-compose.pgbouncer.yml](/Users/danishsethi/VSCODE/ProposalOS/docker-compose.pgbouncer.yml) sets:
  - `PGBOUNCER_POOL_MODE=transaction`

### Prisma datasource configuration

[prisma/schema.prisma](/Users/danishsethi/VSCODE/ProposalOS/prisma/schema.prisma) currently uses:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

There is no active `directUrl` or `DIRECT_URL` in the Prisma datasource.

### Viability assessment

- the app is designed around a pooled application `DATABASE_URL`
- the repo explicitly models transaction-mode PgBouncer as the expected production architecture
- therefore the current RLS shim depends on `SET LOCAL` working correctly in a transaction-pooled environment
- this is a known footgun and needs live validation before any confidence is warranted

## 7. Isolation tests

### What the tests use

- [lib/tenant/**tests**/isolation.test.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/tenant/__tests__/isolation.test.ts) uses a real `PrismaClient`
- [lib/tenant/**tests**/isolation-stress.test.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/tenant/__tests__/isolation-stress.test.ts) also uses a real `PrismaClient`

### What they actually prove

They prove:

- local multi-tenant patterns can be tested against a real DB
- the codebase has at least some intentional tenant isolation coverage

They do **not** prove:

- that the live environment actually has RLS enabled
- that the live environment uses `FORCE ROW LEVEL SECURITY`
- that the live app connects as a restricted role rather than `postgres`
- that `SET LOCAL` behaves correctly under the production pooled connection model

## Post-Auth Verification

### What became accessible after auth refresh

- `gcloud config get-value project` returned `ixcc-486621`
- `gcloud projects list` succeeded and showed visible projects including:
  - `ixcc-486621`
  - `proposal-487522`
  - `swinglabs-fund`
  - `drape-prod`
  - `dealpilot-ae`
  - `blazecrawl-prod`
- `gcloud sql instances list --project=ixcc-486621` succeeded
- Secret Manager access for `DATABASE_URL` and `DIRECT_URL` in `ixcc-486621` succeeded

### What is still blocked

- Cloud Run service listing in `ixcc-486621` is still denied:

```text
ERROR: (gcloud.run.services.list) PERMISSION_DENIED:
Permission 'run.services.list' denied on resource 'namespaces/ixcc-486621/services'
```

- Cloud Run job listing in `ixcc-486621` is still denied:

```text
ERROR: (gcloud.run.jobs.list) PERMISSION_DENIED:
Permission 'run.jobs.list' denied on resource 'namespaces/ixcc-486621/jobs'
```

- Direct `describe` calls for the likely ProposalOS services are also denied:
  - `proposal-engine`
  - `proposal-engine-staging`

So post-auth access improved, but not enough to inspect actual Cloud Run runtime env or Cloud SQL attachment metadata for ProposalOS in `ixcc-486621`.

### Cloud SQL inventory in `ixcc-486621`

Visible instances:

- `immigration-db` — `northamerica-northeast1` — `RUNNABLE`
- `immigration-prod` — `northamerica-northeast1` — `RUNNABLE`
- `proposal-engine-db` — `us-central1` — `STOPPED`
- `misprice-db` — `us-central1` — `RUNNABLE`

This confirms again that `proposal-engine-db` remains stopped and is not the active secret-backed target today.

### Secret Manager findings

Accessible secrets:

- `DATABASE_URL`
- `DIRECT_URL`

Latest `DATABASE_URL` versions list:

- version `18` — enabled — `2026-02-14T21:20:45`
- version `17` — enabled — `2026-02-07T19:31:05`
- version `16` — enabled — `2026-02-07T19:23:16`

Masked `DATABASE_URL` shape:

```text
postgresql://postgres:REDACTED@/immigration_platform?host=/cloudsql/ixcc-486621:northamerica-northeast1:immigration-prod
```

Parsed fields:

- role: `postgres`
- database: `immigration_platform`
- Cloud SQL socket target: `ixcc-486621:northamerica-northeast1:immigration-prod`

`DIRECT_URL` resolved to the same masked shape and the same parsed role/database/instance.

### Best-effort inference

- The current `DATABASE_URL` and `DIRECT_URL` secrets in `ixcc-486621` are **not** pointing at `proposal-engine-db`
- They point to `immigration-prod` / `immigration_platform`
- The current connecting DB role encoded in both secrets is **`postgres`**

This is a strong signal that the visible DB credentials in this project are for another live app in the shared project, not for the dormant `proposal-engine-db`.

### Remaining unknowns

Because Cloud Run access remains denied in `ixcc-486621`, this audit still cannot prove:

- whether a live ProposalOS Cloud Run service exists in that project,
- whether ProposalOS consumes `DATABASE_URL` / `DIRECT_URL`,
- whether any ProposalOS runtime is actually attached to `immigration-prod`,
- or whether a different secret or different project backs ProposalOS runtime traffic.

## Critical findings

1. **`prisma/migrations/**` is gitignored.\*\* This is a source-of-truth failure for schema and RLS history across machines and deploys.
2. **Two divergent RLS files exist.** The stronger one is untracked; the tracked one is weaker and partially wrong.
3. **The tracked file has `@@map` table-name bugs.** Policies for `Subscription`, `Payment`, `FailedWebhookEvent`, and `CartAbandonmentEvent` appear to target model names, not physical tables.
4. **The tracked file lacks `FORCE ROW LEVEL SECURITY`.** If the app connects as the table owner, RLS may be bypassed silently.
5. **The repo assumes Prisma + PgBouncer transaction mode + `SET LOCAL` is safe.** That assumption is unproven and must be validated before rollout.

## Recommended Phase 2.2 scope

1. Restore migration tracking in git before touching RLS behavior.
2. Reconcile the two RLS files into one authoritative tracked artifact.
3. Validate `SET LOCAL app.current_tenant_id` under:
   - direct local Postgres
   - local PgBouncer transaction mode
4. Confirm live deployment details after `gcloud` auth refresh:
   - Cloud Run service name
   - Cloud SQL attachment
   - DB role used by the app
5. Expand policy coverage from the current partial state to full tenant-bearing model coverage.

## Open questions

1. After auth refresh, which Cloud Run service is the real ProposalOS production target?
2. Does the live app connect as `postgres`, `app_user`, or another role?
3. Was `prisma/migrations/**` intentionally gitignored at some point, or is it pure drift?
4. Should nullable `tenantId` rows remain globally visible on all such tables, or only on a narrower allowlist?
