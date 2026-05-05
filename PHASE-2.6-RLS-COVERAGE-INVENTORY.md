# Phase 2.6-A RLS Coverage Inventory

- Branch at inventory start: `phase-2-rls-migration`
- HEAD at inventory start: `c524070`
- Scope: schema / migration / raw-SQL inventory only
- Production DB changes made: **none**

## Summary

| Category                                                                       | Count | Notes                                                                                                       |
| ------------------------------------------------------------------------------ | ----: | ----------------------------------------------------------------------------------------------------------- |
| Prisma models total                                                            |    89 | Parsed from `prisma/schema.prisma`                                                                          |
| Models with first-class `tenantId`                                             |    70 | Direct tenant-bearing schema models                                                                         |
| Tenant-bearing models covered by `tenant_isolation`                            |    70 | `50` from Phase 2.1.5 plus `16` added in Phase 2.6-B plus `3` added in Phase 2.6-E plus `1` in Phase 2.6-G  |
| Tenant-bearing models uncovered by `tenant_isolation`                          |     0 | First-class tenant-bearing coverage is still closed                                                         |
| Models with `tenant_bypass` policy                                             |    70 | Bypass parity matches all first-class tenant-bearing tables                                                 |
| Tenant-bearing models missing `tenant_bypass`                                  |     0 | First-class tenant-bearing bypass parity is still closed                                                    |
| Indirect tenant-scoped candidates (no `tenantId`, tenant implied by parent FK) |     2 | `Account` and `Session` remain; both are blocked on auth-safety preflight                                   |
| Tenant-agnostic / shared-system tables                                         |    14 | Includes one mixed telemetry table (`Metric`) that likely needs design, not simple RLS                      |
| Direct executable raw SQL callsites                                            |    21 | Across 9 production files; 2 comment-only grep matches excluded                                             |
| Hidden raw-SQL helper fan-out                                                  |     7 | Additional `executeQuery` / `executeCommand` / `executeTransaction` uses under `lib/self-evolving-prompts/` |

## Covered Tenant-Bearing Models

These 50 schema models / tables have first-class `tenantId`, are covered by `tenant_isolation`, and have matching `tenant_bypass` parity today:

1. `Audit` -> `Audit`
2. `Finding` -> `Finding`
3. `Proposal` -> `Proposal`
4. `ProposalAcceptance` -> `ProposalAcceptance`
5. `ProposalView` -> `ProposalView`
6. `ContactRequest` -> `ContactRequest`
7. `ProposalFollowUp` -> `ProposalFollowUp`
8. `EvidenceSnapshot` -> `EvidenceSnapshot`
9. `ProposalTemplate` -> `ProposalTemplate`
10. `User` -> `User`
11. `Invitation` -> `Invitation`
12. `Playbook` -> `Playbook`
13. `AuditSchedule` -> `AuditSchedule`
14. `AuditTarget` -> `AuditTarget`
15. `ProspectDiscoveryJob` -> `ProspectDiscoveryJob`
16. `ProspectLead` -> `ProspectLead`
17. `ProspectEnrichmentRun` -> `ProspectEnrichmentRun`
18. `OutreachSendingDomain` -> `OutreachSendingDomain`
19. `OutreachDomainDailyStat` -> `OutreachDomainDailyStat`
20. `OutreachEmail` -> `OutreachEmail`
21. `OutreachEmailEvent` -> `OutreachEmailEvent`
22. `ApiKey` -> `ApiKey`
23. `TenantBranding` -> `TenantBranding`
24. `ProspectStateTransition` -> `ProspectStateTransition`
25. `DeliveryTask` -> `DeliveryTask`
26. `PipelineConfig` -> `PipelineConfig`
27. `PipelineErrorLog` -> `PipelineErrorLog`
28. `OutreachTemplatePerformance` -> `OutreachTemplatePerformance`
29. `WinLossRecord` -> `WinLossRecord`
30. `PreWarmingAction` -> `PreWarmingAction`
31. `DetectedSignal` -> `DetectedSignal`
32. `ChatConversation` -> `ChatConversation`
33. `PartnerDeliveredLead` -> `PartnerDeliveredLead`
34. `ProposalOutreach` -> `ProposalOutreach`
35. `FollowUpEmailSend` -> `FollowUpEmailSend`
36. `UsageRecord` -> `UsageRecord`
37. `FailedWebhookEvent` -> `failed_webhook_events`
38. `CartAbandonmentEvent` -> `cart_abandonment_events`
39. `Subscription` -> `subscriptions`
40. `Payment` -> `payments`
41. `GeneratedArtifact` -> `GeneratedArtifact`
42. `DeliveryBundle` -> `DeliveryBundle`
43. `AdversarialQARun` -> `AdversarialQARun`
44. `HallucinationLog` -> `HallucinationLog`
45. `HumanReviewFlag` -> `HumanReviewFlag`
46. `Project` -> `Project`
47. `NPSSurvey` -> `NPSSurvey`
48. `QATelemetry` -> `QATelemetry`
49. `MonitoringConfig` -> `MonitoringConfig`
50. `LocationGroup` -> `LocationGroup`

## Phase 2.6-B Coverage Update

Phase 2.6-B adds both `tenant_isolation` and `tenant_bypass` coverage for the 16 previously-uncovered first-class tenant-bearing tables. No production DB changes were made in this batch; the migration is staged in-repo only.

These are now covered by `20260504164459_rls_cover_remaining_tenant_tables`:

| Model                    | Table                    | Risk   | Notes                                                                                    |
| ------------------------ | ------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| `CheckoutAttempt`        | `checkout_attempts`      | medium | Billing route-context followup from Phase 2.5 remains open                               |
| `AuditTrailEvent`        | `AuditTrailEvent`        | high   | Raw SQL writer/reader in `lib/observability/auditTrail.ts`; optional `tenantId`          |
| `CircuitBreakerState`    | `CircuitBreakerState`    | medium | Pipeline runtime table added after base RLS migration                                    |
| `DeadLetterQueue`        | `DeadLetterQueue`        | high   | Cross-tenant maintenance driver exists; app-user rollout still needs raw-query hardening |
| `ClientDashboard`        | `ClientDashboard`        | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `UpsellOpportunity`      | `UpsellOpportunity`      | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `NotificationPreference` | `NotificationPreference` | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `ScheduledAuditRun`      | `ScheduledAuditRun`      | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `CompetitorSignal`       | `CompetitorSignal`       | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `ReEngagementCampaign`   | `ReEngagementCampaign`   | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `WinBackCampaign`        | `WinBackCampaign`        | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `PromptVersion`          | `PromptVersion`          | medium | Nullable `tenantId`; optional-tenant policy semantics preserved                          |
| `PromptPerformanceLog`   | `PromptPerformanceLog`   | high   | Table is now covered, but raw-SQL access paths still need hardening                      |
| `ABExperiment`           | `ABExperiment`           | high   | Table is now covered, but raw-SQL writes still need hardening                            |
| `Prediction`             | `Prediction`             | medium | First-class tenant-bearing coverage added in 2.6-B                                       |
| `Scenario`               | `Scenario`               | medium | First-class tenant-bearing coverage added in 2.6-B                                       |

## Indirect Tenant-Scoped Candidates

These 2 models still do not have first-class `tenantId`, but tenant ownership is implied by a parent relation and they remain the open indirect-schema candidates after Phase 2.6-G:

| Model     | Parent relation | Why it is a candidate                                            |
| --------- | --------------- | ---------------------------------------------------------------- |
| `Account` | `User`          | Auth account records are tenant-scoped via the owning user today |
| `Session` | `User`          | Auth sessions are tenant-scoped via the owning user today        |

### Known Phase 2.6 Candidate Gaps Reconciled

The previously noted candidate gap set is confirmed by the current schema:

- `Account`
- `Session`

### Phase 2.6-F Auth-Table Safety Classification

| Model     | Classification                           | Why no policy migration was applied in 2.6-F                                                                  |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Account` | `UNSAFE_UNTIL_AUTH_ADAPTER_CONTEXT_PLAN` | `PrismaAdapter(prisma)` performs pre-tenant `getUserByAccount(...)` and `linkAccount(...)` operations today.  |
| `Session` | `UNSAFE_UNTIL_AUTH_ADAPTER_CONTEXT_PLAN` | JWT sessions reduce current use, but adapter-owned session methods remain unwrapped and unverified under RLS. |

Recommended follow-up before enabling parent-join RLS for either table:

- wrap auth-adapter pre-tenant reads/writes in a narrowly-audited auth bootstrap strategy
- verify credentials sign-in, OAuth account linking, and session retrieval against local Postgres + PgBouncer under RLS
- only then add `Account` / `Session` `tenant_isolation` + `tenant_bypass` policies

## Tenant-Agnostic / Shared-System Tables

These 14 models do not currently look like straight tenant-local RLS candidates:

1. `Tenant`
2. `VerificationToken`
3. `AgencyPartner`
4. `SharedIntelligenceModel`
5. `EmailBlocklist`
6. `ProcessedWebhookEvent`
7. `PricingPlan`
8. `BenchmarkStats`
9. `FindingEffectiveness`
10. `PromptPerformance`
11. `FeatureFlag`
12. `PromptPromotionLog`
13. `Metric`
14. `Plugin`

Notes:

- `Metric` is not a clean tenant-agnostic table in the product sense because `labels` may include `tenantId`, but it also does not have a first-class relational `tenantId`. That makes it a design problem, not a simple “add it to the current RLS manifest” task.
- `EmailBlocklist` is intentionally global in current code paths (for example the sniper worker’s domain / email suppression check).

## Bypass Parity

- `tenant_bypass` coverage is currently **70 / 70** for the first-class tenant-bearing tables covered by `tenant_isolation`.
- There are **0** tables covered by `tenant_isolation` but missing `tenant_bypass`.
- First-class tenant-bearing bypass parity is now closed; the remaining RLS design surface is the indirect tenant-scoped candidate set.

## Raw SQL Inventory

### Direct Raw SQL Sites

Direct grep inventory (`$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`) found **21 executable callsites across 9 production files**:

| File                                                      | Executable raw callsites | Classification                            | Risk   | Notes                                                                                                                                                |
| --------------------------------------------------------- | -----------------------: | ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/prisma.ts`                                           |                        4 | tenant-local internal shim support        | low    | Internal `set_config(...)` calls inside the repaired runtime shim; intentionally not a Phase 2.6 hardening target                                    |
| `lib/stripe/webhookRetryService.ts`                       |                        3 | unsafe under `app_user + RLS`             | high   | Cross-tenant/system webhook retry flow uses raw reads/writes with no bypass hook and no tenant-scoped runtime context                                |
| `lib/observability/auditTrail.ts`                         |                        2 | unsafe under `app_user + RLS`             | high   | Raw read/write on `AuditTrailEvent`; table coverage is added in 2.6-B, but the helper still runs outside scoped raw-query protections                |
| `app/api/tenants/[tenantId]/delete-data/route.ts`         |                        4 | unsafe under `app_user + RLS`             | high   | Three tenant-local deletes target models whose schema / raw-query contracts still need cleanup; one audit-trail status query reads `AuditTrailEvent` |
| `app/api/health/route.ts`                                 |                        1 | tenant-agnostic/system query              | low    | `SELECT 1` itself is harmless, though the route’s non-raw Prisma counts still need app-user verification                                             |
| `app/api/cron/prompt-promotion/route.ts`                  |                        1 | unknown / manual review                   | medium | Cross-tenant/system analytics query over raw prompt-performance storage; currently outside the shim’s raw-query protection                           |
| `lib/self-evolving-prompts/data-access/ab-experiments.ts` |                        2 | unsafe under `app_user + RLS`             | high   | Inventory snapshot from 2.6-A; ABVariant paired raw-SQL coverage was implemented in 2.6-G, but the broader self-evolving-prompts raw surface remains |
| `lib/self-evolving-prompts/db.ts`                         |                        3 | unsafe abstraction under `app_user + RLS` | high   | Standalone `PrismaClient` plus generic raw query/command wrappers bypass the shared shim entirely                                                    |
| `lib/outreach/sprint2/sniperWorker.ts`                    |                        1 | tenant-agnostic/system query              | low    | Global `EmailBlocklist` check appears intentionally system-wide                                                                                      |

Comment-only grep matches excluded from the executable count:

- `app/api/cron/prompt-promotion/route.ts:27`
- `lib/prisma.ts:145`

### Hidden Raw-SQL Wrapper Fan-Out

`lib/self-evolving-prompts/db.ts` hides additional raw-SQL use behind helper functions. Current downstream helper usage found during this inventory:

| File                                                       | Helper fan-out | Risk | Notes                                                                      |
| ---------------------------------------------------------- | -------------: | ---- | -------------------------------------------------------------------------- |
| `lib/self-evolving-prompts/data-access/ab-experiments.ts`  |              4 | high | Inherits the unsafe wrapper risk in addition to its 2 direct raw callsites |
| `lib/self-evolving-prompts/data-access/predictions.ts`     |              1 | high | Raw command path hidden behind `executeCommand(...)`                       |
| `lib/self-evolving-prompts/data-access/scenarios.ts`       |              1 | high | Raw command path hidden behind `executeCommand(...)`                       |
| `lib/self-evolving-prompts/data-access/prompt-versions.ts` |              2 | high | Raw command path hidden behind `executeCommand(...)`                       |

### Raw SQL Risk Summary

Direct executable raw callsites only:

- Tenant-local / already protected internal shim support: **4**
- Cross-tenant and intentionally bypassed: **0**
- Tenant-agnostic / system query: **3**
- Unsafe under `app_user + RLS`: **13**
- Unknown / manual review: **1**

The highest-risk 2.6 raw-SQL items are:

1. `lib/observability/auditTrail.ts`
2. `lib/stripe/webhookRetryService.ts`
3. `app/api/tenants/[tenantId]/delete-data/route.ts`
4. `lib/self-evolving-prompts/db.ts` and its downstream consumers
5. `lib/self-evolving-prompts/data-access/ab-experiments.ts`

## Phase 2.6-H Raw SQL Hardening Update

Phase 2.6-H hardens the first highest-risk production batch without changing production DB state. The scoped files now have **0 remaining raw SQL callsites**.

| File                                              | Before | After | Classification after 2.6-H                   | What changed                                                                                                  | Residual risk / deferred item                                                                                  |
| ------------------------------------------------- | -----: | ----: | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `app/api/tenants/[tenantId]/delete-data/route.ts` |      4 |     0 | tenant-local destructive route               | Replaced three unsafe tenant-local deletes and one audit-status raw read with Prisma model operations         | Route still needs local `app_user + RLS` verification once `localhost:5435` is available                       |
| `lib/observability/auditTrail.ts`                 |      2 |     0 | mixed tenant-local + system audit event path | Replaced unsafe raw read/write with scoped Prisma model operations; tenant-local events use tenant context    | System audit events now use narrow per-call bypass until broader local `app_user + RLS` verification runs      |
| `lib/stripe/webhookRetryService.ts`               |      3 |     0 | cross-tenant/system retry queue              | Replaced raw queue scan/update SQL with Prisma model operations and isolated named bypasses for global replay | Retry flow remains intentionally bypassed because tenant context is unavailable during global webhook recovery |

### 2.6-H Scoped File Notes

- `app/api/tenants/[tenantId]/delete-data/route.ts`
  - Removed all remaining `$executeRawUnsafe` / `$queryRawUnsafe` usage.
  - Added explicit tenant-scoped model deletes for `ClientMessage`, `FindingStatus`, and `ReviewSnapshot`.
  - Moved deletion-history reads onto `AuditTrailEvent` Prisma reads and wrapped the `GET` path in `runWithTenantAsync(tenantId, ...)` so the route param remains the tenant authority.
- `lib/observability/auditTrail.ts`
  - Removed all remaining raw SQL.
  - `tenantId`-backed audit events now stay tenant-local via `runWithTenantAsync`.
  - System-level audit events with no tenant context use a narrow `runWithTenantBypass('audit-trail:system-event-read-write', ...)` wrapper so best-effort logging semantics stay intact.
  - Previous-hash lookup now also includes tenant scoping whenever a tenant is available.
- `lib/stripe/webhookRetryService.ts`
  - Removed all remaining raw SQL.
  - Global retry queue scan, replay, stats, and cleanup now use explicit named bypasses:
    - `stripe-webhook-retry:global-failed-webhook-scan`
    - `stripe-webhook-retry:replay-failed-event`
    - `stripe-webhook-retry:global-stats`
    - `stripe-webhook-retry:cleanup-resolved-events`
  - This keeps the cross-tenant/system recovery behavior unchanged while making the bypass reason visible and auditable.

### 2.6-H Outcome

- Unsafe raw SQL removed in scoped files: **9 / 9**
- Unsafe raw SQL retained in scoped files: **0**
- New production DB changes made: **none**
- Broader raw-SQL hardening still open for:
  - `lib/self-evolving-prompts/db.ts`
  - `lib/self-evolving-prompts/data-access/ab-experiments.ts`
  - `app/api/cron/prompt-promotion/route.ts`
  - `app/api/health/route.ts`
  - `lib/outreach/sprint2/sniperWorker.ts`
- `Account` / `Session` remain intentionally blocked pending auth-adapter context planning and local auth/RLS smoke.
- Local `app_user + RLS` verification remains required before Phase 2.6 closure.

## Preserved Phase 2.5 Followups Carried Forward

These items remain intentionally visible and should stay in scope for Phase 2.6 verification / fixes:

- `lib/pipeline/humanReview.ts` global tenant-discovery lookups
- `app/api/pipeline/prospects/[id]/override/route.ts` fallback global lookup
- `app/api/team/invite/route.ts` global-user uniqueness lookup
- `checkoutAttempt.create` route-context verification
- Raw SQL cleanup / `app_user` verification
- Other direct Prisma / global lookup mechanism swaps intentionally preserved during Phase 2.5

## Recommended Phase 2.6 Sub-Batches

### Phase 2.6-B

Completed in this commit:

- Added `tenant_isolation` and `tenant_bypass` coverage for all 16 previously-uncovered first-class tenant-bearing tables

### Phase 2.6-C

Schema / RLS coverage for orphan or indirectly tenant-scoped models:

- `FindingStatus`
- `ClientMessage`
- `ReviewSnapshot`
- `ConversationState`
- `ObjectionLog`
- `EmailSequence`
- `ABVariant`
- Evaluate `Account` / `Session` separately because auth-table semantics may need a different policy design

### Phase 2.6-D

Raw SQL hardening batch 1, highest-risk production paths:

- `lib/observability/auditTrail.ts`
- `lib/stripe/webhookRetryService.ts`
- `app/api/tenants/[tenantId]/delete-data/route.ts`
- `lib/self-evolving-prompts/db.ts`
- `lib/self-evolving-prompts/data-access/ab-experiments.ts`

### Phase 2.6-E

Raw SQL hardening batch 2 and lower-risk / manual-review items:

- `app/api/cron/prompt-promotion/route.ts`
- `app/api/health/route.ts`
- `lib/outreach/sprint2/sniperWorker.ts`
- Remaining `lib/self-evolving-prompts/data-access/*` consumers

### Phase 2.6-F

Local `app_user + RLS` verification:

- Re-run preserved Phase 2.5 followups under local Postgres + PgBouncer
- Verify raw-query sites after hardening
- Verify server-component / route discovery lookups still behave correctly

### Phase 2.6-G

Phase closure:

- Coverage counts updated
- Raw SQL inventory reduced / closed
- Build / Phase 1 security / broad-gate snapshot
- Explicit app-user readiness statement

## Inventory Notes

- The current base RLS migration header still says `target 50/67 multi-tenant models`, but the current Prisma schema now parses to **70** first-class tenant-bearing models after the 2.6-D, 2.6-E, and 2.6-G direct-column additions. The stale `67` appears to be an older working count rather than the current schema truth.
- That same header includes `Metric` in the “known remaining gaps” comment even though `Metric` does not expose first-class `tenantId` in Prisma today. Treat that as documentation drift, not as evidence that `Metric` is already a ready-to-policy table.
- Phase 2.6-C follow-on design is captured in `PHASE-2.6-C-SCHEMA-GAP-PLAN.md`. It classifies the remaining 9 indirect tenant-scoped candidates into:
  - direct `tenantId` + deterministic backfill (`FindingStatus`, `ClientMessage`, `ReviewSnapshot`, `ConversationState`, `ObjectionLog`, `EmailSequence`, `ABVariant`)
  - parent-join RLS only (`Account`, `Session`)
- Phase 2.6-D implements the audit-scoped direct-column subset:
  - complete: `FindingStatus`, `ClientMessage`, `ReviewSnapshot`
  - remaining direct-column candidates after 2.6-D: `ConversationState`, `ObjectionLog`, `EmailSequence`, `ABVariant`
  - remaining parent-policy candidates: `Account`, `Session`
  - raw SQL hardening and local `app_user + RLS` verification remain open
- Phase 2.6-E implements the proposal-scoped direct-column subset:
  - complete: `ConversationState`, `ObjectionLog`, `EmailSequence`
  - remaining direct-column candidate: `ABVariant`
  - remaining parent-policy candidates: `Account`, `Session`
  - raw SQL hardening and local `app_user + RLS` verification remain open
- Phase 2.6-F preflighted the auth tables and intentionally did not create a migration:
  - `Account`: blocked on auth-adapter pre-tenant lookup/link flows
  - `Session`: blocked on unverified adapter/session behavior under RLS despite JWT strategy
  - remaining direct-column candidate at that point: `ABVariant`
  - remaining auth-table candidates: `Account`, `Session`
  - raw SQL hardening and local `app_user + RLS` verification remain open
- Phase 2.6-G completes the last direct-column schema gap:
  - complete: `ABVariant`
  - `tenantId`, deterministic backfill, `tenant_isolation`, and `tenant_bypass` added
  - ABVariant raw SQL readers/writers were updated in the paired batch
  - remaining indirect candidates: `Account`, `Session`
  - broader raw SQL hardening and local `app_user + RLS` verification remain open
