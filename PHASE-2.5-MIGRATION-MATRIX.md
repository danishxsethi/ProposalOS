# Phase 2.5 Migration Matrix

Captured: 2026-05-01T11:00:00-06:00
Branch: `phase-2-rls-migration`
Scope: Step 0 classification only. No code changes yet.

## Summary

- Production `createScopedPrisma(...)` callsites: **57** across **24** files.
- Grouping proposal:
  - **Batch A**: 5 sites
  - **Batch B**: 34 sites
    - **B1 Cron**: 2 sites
    - **B2 Admin destructive**: 5 sites
    - **B3 Admin reads**: 3 sites
    - **B4 Public/magic-link**: 0 sites
    - **B5 Other**: 24 sites
  - **Batch C**: 22 sites
- Supplemental direct-`prisma` sweep:
  - `rg -n "from ['\"]@/lib/prisma['\"]" ...` surfaced **162** import sites.
  - The highest-risk non-helper routes from that sweep are now folded into Batch B instead of being deferred.

## Batch Definitions

- **Batch A — Pipeline cross-tenant bypass**
  - Only the `createScopedPrisma('system')` sites that are intentionally crossing tenant boundaries.
  - Target primitive: `runWithTenantBypass(reason, async () => ...)`

- **Batch B — Specialized/background helpers and high-risk non-helper routes**
  - Pipeline/service code and non-standard routes that are outside `withAuth` ambient scoping.
  - Target primitive: usually `runWithTenantAsync(tenantId, async () => ...)`
  - No behavior change: resolve tenant first, then wrap the existing block.
  - Execution order after Batch A:
    - **B1 Cron**
    - **B2 Admin destructive**
    - **B3 Admin reads**
    - **B4 Public/magic-link**
    - **B5 Other**

- **Batch C — Single-tenant misuses already inside ambient scope**
  - Mostly `withAuth`-wrapped routes and tenant-aware helpers that already have tenant context.
  - Target primitive: plain `prisma` with the existing ALS tenant context, or preserve explicit `tenantId` filters already present in the query.

## High-Risk Sites Flagged

- `lib/pipeline/dealCloser.ts:217` — checkout session bootstrap touches billing and proposal lookup across tenants.
- `lib/pipeline/dealCloser.ts:315` — payment-success reconciliation writes win/loss and status transitions.
- `lib/pipeline/dealCloser.ts:374` — payment-failure recovery mutates lead status and loss records.
- `lib/pipeline/deadLetterQueue.ts:362` — cross-tenant cron driver loops every active tenant.
- `lib/pipeline/humanReview.ts:218` — approval path changes pipeline state and logs operator action after a global prospect lookup resolves the owning tenant.
- `lib/pipeline/humanReview.ts:259` — rejection path changes pipeline state and logs operator action after a global prospect lookup resolves the owning tenant.
- `lib/pipeline/humanReview.ts:427` — manual override changes pipeline state after a global prospect lookup resolves the owning tenant.
- `app/api/pipeline/prospects/[id]/override/route.ts:55` — admin override route mutates prospect state inside a composed auth stack, so the blast radius is tenant-scoped but operationally sensitive.
- `app/api/proposals/[id]/send/route.ts:55` — proposal send mutation changes customer-visible delivery state and triggers scheduler side effects.
- `app/api/schedule/[id]/route.ts:14` — delete/update route is destructive even though it already uses explicit `tenantId` ownership filters.
- `app/api/settings/templates/[id]/route.ts:159` — delete route removes tenant-owned templates and is high-risk because the current behavior should stay exactly stable.
- `app/api/tenants/[tenantId]/delete-data/route.ts:32` — GDPR erase route deletes or anonymizes broad tenant data sets based on a URL tenant parameter.
- `app/api/tenants/[tenantId]/offboard/route.ts:67` — offboard flow suspends tenants, revokes keys, and anonymizes PII inside a transaction.
- `app/api/tenants/[tenantId]/offboard/route.ts:177` — hard-delete path irreversibly removes a tenant and all associated data.

## High-Risk Justifications

- `lib/pipeline/humanReview.ts:218` — not a true cross-tenant business action; it first uses global prisma to resolve the prospect's owning tenant, then performs a single-tenant approval write in that tenant context.
- `lib/pipeline/humanReview.ts:259` — same pattern as approval: global lookup only to discover owner tenant, followed by tenant-local rejection writes and audit logging.
- `lib/pipeline/humanReview.ts:427` — the manual override is tenant-scoped after tenant discovery, but high-risk because it can arbitrarily rewrite prospect state.
- `app/api/pipeline/prospects/[id]/override/route.ts:55` — high-risk inside `withRole('admin', ...)` because it changes pipeline status; there is no new authz bug in scope here, so 2.5 should preserve the current guard and swap only the scoping primitive.
- `app/api/proposals/[id]/send/route.ts:55` — high-risk inside `withAuth` because it marks proposals as sent and triggers follow-up scheduling; the route already checks tenant ownership and should keep that behavior unchanged.
- `app/api/schedule/[id]/route.ts:14` — high-risk inside `withAuth` because the route deletes or updates schedules; it already relies on explicit `tenantId` ownership filters, so 2.5 should only remove redundant helper use.
- `app/api/settings/templates/[id]/route.ts:159` — high-risk inside `withAuth` because it deletes tenant templates; the current tenant-local semantics should remain exactly as-is.

## Batch A — Pipeline Cross-Tenant

| File:line                        | Current pattern                                               | Tenant intent                                               | Target primitive      | Proposed reason                              | Risk tier |
| -------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | --------------------- | -------------------------------------------- | --------- |
| `lib/pipeline/dealCloser.ts:33`  | `createScopedPrisma('system')` in `recordEvent()` lead lookup | cross-tenant lookup by lead ID before tenant-specific write | `runWithTenantBypass` | `deal-closer-lead-lookup-by-id`              | medium    |
| `lib/pipeline/dealCloser.ts:108` | `createScopedPrisma('system')` in `computeEngagementScore()`  | cross-tenant read of lead + outreach history by lead ID     | `runWithTenantBypass` | `deal-closer-score-cross-tenant-read`        | medium    |
| `lib/pipeline/dealCloser.ts:217` | `createScopedPrisma('system')` in `createCheckoutSession()`   | cross-tenant billing bootstrap for lead/proposal lookup     | `runWithTenantBypass` | `deal-closer-checkout-session-bootstrap`     | high      |
| `lib/pipeline/dealCloser.ts:315` | `createScopedPrisma('system')` in `handlePaymentSuccess()`    | cross-tenant Stripe reconciliation and close-won write path | `runWithTenantBypass` | `deal-closer-payment-success-reconciliation` | high      |
| `lib/pipeline/dealCloser.ts:374` | `createScopedPrisma('system')` in `handlePaymentFailure()`    | cross-tenant Stripe failure recovery flow                   | `runWithTenantBypass` | `deal-closer-payment-failure-recovery`       | high      |

## Batch B — Specialized Helpers and Non-Standard Routes

| File:line                                              | Current pattern                                                          | Tenant intent                                        | Target primitive     | Proposed reason | Risk tier |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------- | --------------- | --------- |
| `lib/pipeline/dealCloser.ts:44`                        | `createScopedPrisma(tenantId)` after lead lookup                         | single-tenant follow-up writes after bootstrap       | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/idempotency.ts:56`                       | `createScopedPrisma(tenantId)` in `checkIdempotency()`                   | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/idempotency.ts:103`                      | `createScopedPrisma(tenantId)` in `markIdempotencyStarted()`             | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/idempotency.ts:140`                      | `createScopedPrisma(tenantId)` in `markIdempotencyCompleted()`           | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/idempotency.ts:168`                      | `createScopedPrisma(tenantId)` in `markIdempotencyFailed()`              | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/circuitBreaker.ts:92`                    | `createScopedPrisma(tenantId)` in `getCircuitState()`                    | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/circuitBreaker.ts:136`                   | `createScopedPrisma(tenantId)` in `recordSuccess()`                      | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/circuitBreaker.ts:182`                   | `createScopedPrisma(tenantId)` in `recordFailure()`                      | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/circuitBreaker.ts:243`                   | `createScopedPrisma(tenantId)` in `openCircuit()`                        | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/circuitBreaker.ts:332`                   | `createScopedPrisma(tenantId)` in `canProceed()` half-open transition    | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/circuitBreaker.ts:387`                   | `createScopedPrisma(tenantId)` in `calculateErrorRate()`                 | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/circuitBreaker.ts:428`                   | `createScopedPrisma(tenantId)` in `resetCircuit()`                       | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | high      |
| `lib/pipeline/deadLetterQueue.ts:58`                   | `createScopedPrisma(tenantId)` in `addToDLQ()`                           | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/deadLetterQueue.ts:153`                  | `createScopedPrisma(tenantId)` in `getDLQEntries()`                      | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/deadLetterQueue.ts:194`                  | `createScopedPrisma(tenantId)` in `getDLQStats()`                        | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/deadLetterQueue.ts:233`                  | `createScopedPrisma(tenantId)` in `retryFromDLQ()`                       | single-tenant retry helper outside middleware        | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/deadLetterQueue.ts:275`                  | `createScopedPrisma(tenantId)` in `resolveDLQEntry()`                    | single-tenant operator action outside middleware     | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/deadLetterQueue.ts:314`                  | `createScopedPrisma(tenantId)` in `discardDLQEntry()`                    | single-tenant destructive operator action            | `runWithTenantAsync` | n/a             | high      |
| `lib/pipeline/deadLetterQueue.ts:362`                  | `createScopedPrisma(tenant.id)` inside `processDLQ()` tenant loop        | cross-tenant cron driver with per-tenant inner work  | `runWithTenantAsync` | n/a             | high      |
| `lib/pipeline/deadLetterQueue.ts:423`                  | `createScopedPrisma(tenantId)` in `isInDLQ()`                            | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/deadLetterQueue.ts:434`                  | `createScopedPrisma(tenantId)` in `getDLQEntry()`                        | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/humanReview.ts:67`                       | `createScopedPrisma(tenantId)` in `routeToReview()`                      | single-tenant helper after tenant resolution         | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/humanReview.ts:101`                      | `createScopedPrisma(tenantId)` in `getReviewQueue()`                     | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/humanReview.ts:218`                      | `createScopedPrisma(prospectRaw.tenantId)` in `approveProspect()`        | single-tenant operator approval after global lookup  | `runWithTenantAsync` | n/a             | high      |
| `lib/pipeline/humanReview.ts:259`                      | `createScopedPrisma(prospectRaw.tenantId)` in `rejectProspect()`         | single-tenant operator rejection after global lookup | `runWithTenantAsync` | n/a             | high      |
| `lib/pipeline/humanReview.ts:295`                      | `createScopedPrisma(pRaw.tenantId)` in `getProspectContext()`            | single-tenant read after global lookup               | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/humanReview.ts:348`                      | `createScopedPrisma(tenantId)` in `getReviewQueueStats()`                | single-tenant helper outside middleware              | `runWithTenantAsync` | n/a             | low       |
| `lib/pipeline/humanReview.ts:427`                      | `createScopedPrisma(prospectRaw.tenantId)` in `overrideProspectStatus()` | single-tenant operator override after global lookup  | `runWithTenantAsync` | n/a             | high      |
| `app/api/pipeline/prospects/[id]/route.ts:42`          | `createScopedPrisma(tenantId)` in route not wrapped by `withAuth`        | single-tenant route relying on ambient tenant lookup | `runWithTenantAsync` | n/a             | medium    |
| `app/api/pipeline/prospects/[id]/override/route.ts:55` | `createScopedPrisma(tenantId)` in admin override route                   | single-tenant route with admin auth composition      | `runWithTenantAsync` | n/a             | high      |

### Batch B Sub-Batches

#### B1 Cron

| File:line                                           | Current pattern                                                   | Tenant intent                                       | Target primitive      | Proposed reason                             | Risk tier |
| --------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- | --------------------- | ------------------------------------------- | --------- |
| `lib/pipeline/deadLetterQueue.ts:362`               | `createScopedPrisma(tenant.id)` inside `processDLQ()` tenant loop | cross-tenant cron driver with per-tenant inner work | `runWithTenantAsync`  | n/a                                         | high      |
| `app/api/cron/intelligence-aggregation/route.ts:31` | direct `prisma.tenant.findMany()` cross-tenant cron               | intentional cross-tenant aggregation                | `runWithTenantBypass` | `cron-intelligence-aggregation-all-tenants` | medium    |

#### B2 Admin Destructive

| File:line                                              | Current pattern                                                          | Tenant intent                                        | Target primitive     | Proposed reason | Risk tier |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------- | --------------- | --------- |
| `app/api/tenants/[tenantId]/delete-data/route.ts:32`   | direct `prisma.*` destructive sequence under `verifyCronAuth`            | single URL-tenant destructive GDPR erase             | `runWithTenantAsync` | n/a             | high      |
| `app/api/tenants/[tenantId]/offboard/route.ts:67`      | direct `prisma.$transaction(...)` offboard flow                          | single URL-tenant destructive admin/API-key offboard | `runWithTenantAsync` | n/a             | high      |
| `app/api/tenants/[tenantId]/offboard/route.ts:177`     | direct `prisma.tenant.delete(...)` hard delete                           | single URL-tenant destructive admin/API-key delete   | `runWithTenantAsync` | n/a             | high      |
| `app/api/pipeline/prospects/[id]/override/route.ts:55` | `createScopedPrisma(tenantId)` in admin override route                   | single-tenant route with admin auth composition      | `runWithTenantAsync` | n/a             | high      |
| `lib/pipeline/humanReview.ts:427`                      | `createScopedPrisma(prospectRaw.tenantId)` in `overrideProspectStatus()` | single-tenant operator override after global lookup  | `runWithTenantAsync` | n/a             | high      |

#### B3 Admin Reads

| File:line                         | Current pattern                                               | Tenant intent                           | Target primitive     | Proposed reason | Risk tier |
| --------------------------------- | ------------------------------------------------------------- | --------------------------------------- | -------------------- | --------------- | --------- |
| `lib/pipeline/humanReview.ts:101` | `createScopedPrisma(tenantId)` in `getReviewQueue()`          | single-tenant helper outside middleware | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/humanReview.ts:295` | `createScopedPrisma(pRaw.tenantId)` in `getProspectContext()` | single-tenant read after global lookup  | `runWithTenantAsync` | n/a             | medium    |
| `lib/pipeline/humanReview.ts:348` | `createScopedPrisma(tenantId)` in `getReviewQueueStats()`     | single-tenant helper outside middleware | `runWithTenantAsync` | n/a             | low       |

#### B4 Public/Magic-Link

No Batch B callsites currently land in this family. Existing public and magic-link reads were migrated in Phase 2.3/2.4 and do not use `createScopedPrisma(...)`.

#### B5 Other

Everything remaining in Batch B stays here:

- `lib/pipeline/dealCloser.ts:44`
- `lib/pipeline/idempotency.ts:56`
- `lib/pipeline/idempotency.ts:103`
- `lib/pipeline/idempotency.ts:140`
- `lib/pipeline/idempotency.ts:168`
- `lib/pipeline/circuitBreaker.ts:92`
- `lib/pipeline/circuitBreaker.ts:136`
- `lib/pipeline/circuitBreaker.ts:182`
- `lib/pipeline/circuitBreaker.ts:243`
- `lib/pipeline/circuitBreaker.ts:332`
- `lib/pipeline/circuitBreaker.ts:387`
- `lib/pipeline/circuitBreaker.ts:428`
- `lib/pipeline/deadLetterQueue.ts:58`
- `lib/pipeline/deadLetterQueue.ts:153`
- `lib/pipeline/deadLetterQueue.ts:194`
- `lib/pipeline/deadLetterQueue.ts:233`
- `lib/pipeline/deadLetterQueue.ts:275`
- `lib/pipeline/deadLetterQueue.ts:314`
- `lib/pipeline/deadLetterQueue.ts:423`
- `lib/pipeline/deadLetterQueue.ts:434`
- `lib/pipeline/humanReview.ts:67`
- `lib/pipeline/humanReview.ts:218`
- `lib/pipeline/humanReview.ts:259`
- `app/api/pipeline/prospects/[id]/route.ts:42`

## Batch C — Ambient Single-Tenant Cleanup

| File:line                                             | Current pattern                                                                               | Tenant intent                                               | Target primitive | Proposed reason | Risk tier |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------- | --------------- | --------- |
| `app/api/stripe/checkout-saas/route.ts:21`            | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant billing portal bootstrap                      | `prisma`         | n/a             | medium    |
| `app/api/stripe/portal/route.ts:14`                   | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant billing portal bootstrap                      | `prisma`         | n/a             | low       |
| `app/api/analytics/route.ts:12`                       | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant analytics read                                | `prisma`         | n/a             | low       |
| `lib/billing/limits.ts:10`                            | `createScopedPrisma(tenantId)` in `checkAuditLimit()`                                         | single-tenant helper relying on current tenant context      | `prisma`         | n/a             | low       |
| `lib/billing/limits.ts:67`                            | `createScopedPrisma(tenantId)` in `checkSeatLimit()`                                          | single-tenant helper relying on current tenant context      | `prisma`         | n/a             | low       |
| `app/api/proposals/[id]/send/route.ts:55`             | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant mutation                                      | `prisma`         | n/a             | high      |
| `app/api/proposals/route.ts:30`                       | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant list read                                     | `prisma`         | n/a             | low       |
| `app/api/team/invite/route.ts:31`                     | `createScopedPrisma(tenantId)` inside `withAuth` + admin RBAC                                 | single-tenant invite creation after global uniqueness check | `prisma`         | n/a             | medium    |
| `app/api/audits/route.ts:31`                          | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant list read                                     | `prisma`         | n/a             | low       |
| `app/api/audit/[id]/compare/[previousId]/route.ts:14` | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant compare read                                  | `prisma`         | n/a             | medium    |
| `app/api/audit/route.ts:48`                           | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant audit creation                                | `prisma`         | n/a             | medium    |
| `app/api/schedule/[id]/route.ts:14`                   | `createScopedPrisma(tenantId)` but route already uses explicit `tenantId` filters on `prisma` | single-tenant destructive route                             | `prisma`         | n/a             | high      |
| `app/api/schedule/route.ts:12`                        | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant schedule list                                 | `prisma`         | n/a             | low       |
| `app/api/schedule/route.ts:40`                        | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant schedule create                               | `prisma`         | n/a             | medium    |
| `app/api/stats/route.ts:15`                           | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant stats read                                    | `prisma`         | n/a             | low       |
| `app/api/settings/templates/route.ts:13`              | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant template list                                 | `prisma`         | n/a             | low       |
| `app/api/settings/templates/route.ts:33`              | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant template create                               | `prisma`         | n/a             | medium    |
| `app/api/v1/audit/[id]/route.ts:10`                   | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant audit detail read                             | `prisma`         | n/a             | low       |
| `app/api/settings/templates/[id]/route.ts:59`         | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant template read                                 | `prisma`         | n/a             | low       |
| `app/api/settings/templates/[id]/route.ts:114`        | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant template update                               | `prisma`         | n/a             | medium    |
| `app/api/settings/templates/[id]/route.ts:159`        | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant template delete                               | `prisma`         | n/a             | high      |
| `app/api/v1/audit/route.ts:40`                        | `createScopedPrisma(tenantId)` inside `withAuth`                                              | single-tenant audit creation                                | `prisma`         | n/a             | medium    |

## Folded Batch B Non-Helper Routes

These surfaced during the direct-`prisma` sweep. They are **not** `createScopedPrisma(...)` callers, but they are now part of Batch B so the migration source of truth stays aligned with execution.

| File:line                                            | Current pattern                                               | Tenant intent                                        | Proposed target primitive                            | Proposed reason                             | Risk tier |
| ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- | --------- |
| `app/api/tenants/[tenantId]/delete-data/route.ts:32` | direct `prisma.*` destructive sequence under `verifyCronAuth` | single URL-tenant destructive GDPR erase             | `runWithTenantAsync` around the deletion block       | n/a                                         | high      |
| `app/api/tenants/[tenantId]/offboard/route.ts:67`    | direct `prisma.$transaction(...)` offboard flow               | single URL-tenant destructive admin/API-key offboard | `runWithTenantAsync` around the offboard transaction | n/a                                         | high      |
| `app/api/tenants/[tenantId]/offboard/route.ts:177`   | direct `prisma.tenant.delete(...)` hard delete                | single URL-tenant destructive admin/API-key delete   | `runWithTenantAsync` around delete block             | n/a                                         | high      |
| `app/api/cron/intelligence-aggregation/route.ts:31`  | direct `prisma.tenant.findMany()` cross-tenant cron           | intentional cross-tenant aggregation                 | `runWithTenantBypass` at cron entry                  | `cron-intelligence-aggregation-all-tenants` | medium    |

## Notes for Operator Approval

- No caller in the current matrix needs a vague bypass reason; the only proposed bypass reasons are the five `dealCloser` system sites plus the supplemental cron aggregation route.
- I did **not** find any Phase 2.4-style server-component bypass site that obviously wants tenant context instead. The existing app-page bypasses still look justified.
- The clearest high-risk Batch B/C sites to scrutinize before implementation are:
  - `lib/pipeline/deadLetterQueue.ts:362`
  - `lib/pipeline/humanReview.ts:218`
  - `lib/pipeline/humanReview.ts:259`
  - `lib/pipeline/humanReview.ts:427`
  - `app/api/pipeline/prospects/[id]/override/route.ts:55`
  - `app/api/proposals/[id]/send/route.ts:55`
  - `app/api/schedule/[id]/route.ts:14`
  - `app/api/settings/templates/[id]/route.ts:159`

## Migration Execution Notes

### Completed: B1 Cron (`e4a8a80`)

- `app/api/cron/intelligence-aggregation/route.ts`
  - Pattern chosen: isolated `runWithTenantBypass('cron-intelligence-aggregation-all-tenants', ...)` for tenant enumeration, then `runWithTenantAsync(tenant.id, ...)` inside each tenant pass.
  - Justification: the cron needs one cross-tenant tenant list read, but each tenant's aggregation work is properly tenant-local.
  - Existing auth preserved: yes (`verifyCronAuth` and rate limiting remain unchanged).
  - Latent followup: none surfaced in this batch.

- `lib/pipeline/deadLetterQueue.ts`
  - Pattern chosen: isolated `runWithTenantBypass('dlq-cross-tenant-retry-driver', ...)` for active-tenant enumeration, then `runWithTenantAsync(tenant.id, ...)` for each tenant's retry work.
  - Justification: DLQ processing is a cross-tenant driver only at the outer fan-out step; the actual retries, updates, and alerts are single-tenant work and should stay inside tenant scope.
  - Existing auth preserved: n/a (library helper, no route auth layer).
  - Latent followup: none surfaced in this batch.

### Completed: B2 Admin destructive

- `app/api/tenants/[tenantId]/delete-data/route.ts`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` around the destructive delete/anonymize workflow. No bypass added.
  - Justification: the URL tenant param already defines the target tenant, so this route should execute fully inside tenant scope while preserving its current cron/user gate behavior.
  - Existing auth preserved: yes (`verifyCronAuth` and the existing TODO user-auth placeholder remain unchanged).
  - Latent authz/RLS followup: route still contains raw SQL delete/status queries (`$executeRawUnsafe`, `$queryRawUnsafe`) that bypass the Prisma shim; Phase 2.6 should migrate or wrap those callsites before app_user rollout.

- `app/api/tenants/[tenantId]/offboard/route.ts:67`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` around the offboard transaction. No bypass added.
  - Justification: the POST offboard flow is destructive but tenant-local; the URL tenant param and current API-key authorization already define the target tenant.
  - Existing auth preserved: yes (Bearer API key validation, scope checks, and tenant ownership/admin checks remain unchanged).
  - Latent authz followup: none discovered during mechanism swap.

- `app/api/tenants/[tenantId]/offboard/route.ts:177`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` around the hard-delete block. No bypass added.
  - Justification: hard delete is tenant-local and irreversible, so the route param should drive scoping directly instead of broadening access with bypass.
  - Existing auth preserved: yes (admin-scope API key validation remains unchanged).
  - Latent authz followup: none discovered during mechanism swap.

- `app/api/pipeline/prospects/[id]/override/route.ts:55`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` when request tenant context exists; otherwise preserve the current global prospect lookup to resolve `tenantId`, then run the override under `runWithTenantAsync(resolvedTenantId, ...)`. No full-route bypass added.
  - Justification: this is a high-risk tenant-local admin mutation by prospect ID, so the override work should run inside the owning tenant context without broadening the whole handler.
  - Existing auth preserved: yes (`auth()`, `withRole('admin')`, rate limiting, body validation, and 401/404/400 response semantics remain unchanged).
  - Latent authz followup: the fallback global prospect lookup remains intentionally visible for Phase 2.6 verification under `app_user` + RLS.

- `lib/pipeline/humanReview.ts:427`
  - Pattern chosen: preserve the existing global tenant-discovery lookup, then `runWithTenantAsync(resolvedTenantId, ...)` for the manual override transition and audit-log write.
  - Justification: manual status override is a high-risk tenant-local mutation once the owning tenant has been resolved.
  - Existing auth preserved: yes (no caller auth logic changed; only the helper's scoping mechanism changed).
  - Latent authz followup: the global tenant-discovery lookup remains intentionally preserved and should stay on the Phase 2.6 verification list.

### Completed: B3 Admin reads

- `lib/pipeline/humanReview.ts:getReviewQueue()`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` around the tenant-local queue read. No bypass added.
  - Justification: this helper reads one tenant's review queue after the caller has already chosen the tenant, so ambient tenant scope is the right primitive.
  - Existing auth preserved: yes (no auth logic changed here; callers still own admin/operator access checks).
  - Latent authz followup: none discovered during mechanism swap.

- `lib/pipeline/humanReview.ts:getProspectContext()`
  - Pattern chosen: `runWithTenantAsync(pRaw.tenantId, ...)` after the existing global lookup resolves the owning tenant. No bypass added.
  - Justification: the global read is only for tenant discovery; the actual admin-read context fetch is tenant-local and should execute under that tenant scope.
  - Existing auth preserved: yes (no auth logic changed here; callers still own admin/operator access checks).
  - Latent authz followup: the initial tenant-discovery lookup still uses global prisma by prospect ID; preserved intentionally for this batch because changing discovery semantics would be a behavior change.

- `lib/pipeline/humanReview.ts:getReviewQueueStats()`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` around the tenant-local stats read. No bypass added.
  - Justification: queue metrics are computed from a single tenant's prospects and review logs, so bypass would be over-broad.
  - Existing auth preserved: yes (no auth logic changed here; callers still own admin/operator access checks).
  - Latent authz followup: none discovered during mechanism swap.

### Completed: B4 Public/magic-link

- No Phase 2.5 code changes were required for Batch B4 because the matrix still classifies this family as zero sites.
- Validation pass:
  - `app/api/public/audit/route.ts` already uses `runWithTenantAsync(...)` and is outside the remaining `createScopedPrisma(...)` migration scope.
  - `app/proposal/[token]/page.tsx` and `app/proposal/[token]/pdf/page.tsx` already use narrow bypass for token bootstrap plus tenant-local reads under `runWithTenantAsync(...)`.
  - `app/api/proposals/[id]/send/route.ts` remains intentionally classified as Batch C, not B4, because it is a `withAuth`-scoped tenant mutation rather than a public/magic-link surface.
- Existing token/auth/public validation preserved: yes (no code changed in this batch).
- Latent followup: keep the existing proposal-token and public-audit bypass patterns visible during Phase 2.5 closure / Phase 2.6 verification under `app_user` + RLS, but do not reclassify them mid-phase.

### Completed: C1 Stripe/billing tenant-local callers

- `app/api/stripe/checkout-saas/route.ts`
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: this subscription checkout bootstrap is a tenant-local authenticated billing flow, so it should rely on the already-established tenant context rather than a second scoped client wrapper.
  - Existing billing/auth behavior preserved: yes (`withAuth`, `getTenantId()`, Stripe checkout parameters, metadata, URLs, and response codes remain unchanged).
  - Latent followup: `checkoutAttempt.create` still depends on the route's tenant context being present under the repaired shim; keep that visible during Phase 2.6 verification.

- `app/api/stripe/portal/route.ts`
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: portal-session creation is a tenant-local authenticated billing flow and does not need bypass or a secondary scoped client wrapper.
  - Existing billing/auth behavior preserved: yes (`withAuth`, `getTenantId()`, Stripe portal semantics, return URL, and response codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `lib/billing/limits.ts`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` around tenant-local tenant/audit reads after the helper resolves `tenantId` via its existing contract.
  - Justification: the limit checks already resolve a single tenant, so they should perform their DB work inside explicit tenant scope without changing plan math or fallback behavior.
  - Existing billing/auth behavior preserved: yes (tenantId lookup contract, plan selection, trial handling, limit calculations, fallback values, and returned reason strings remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

### Completed: C2 Analytics/stats/audits tenant-local read cluster

- `app/api/analytics/route.ts`
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: this analytics surface reads only current-tenant data and already resolves `tenantId` inside an authenticated request, so a second scoped client wrapper is redundant.
  - Existing auth/reporting/list/create behavior preserved: yes (date-range params, aggregations, ordering, response shape, and status codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `app/api/stats/route.ts`
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: this monthly stats surface is tenant-local reporting, so it should use the repaired ambient tenant context rather than a deprecated scoped client helper.
  - Existing auth/reporting/list/create behavior preserved: yes (auth checks, month window, conversion/cost math, response shape, and status codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `app/api/audits/route.ts`
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: this audits list route stays tenant-local under `withAuth`, and its explicit filters/pagination should continue to run without a separate wrapper client.
  - Existing auth/reporting/list/create behavior preserved: yes (rate limiting, query params, pagination, filters, projection, response shape, and status codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

### Completed: C3 Settings/templates tenant-local cluster

- `app/api/settings/templates/route.ts` (GET list)
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: this template list is a tenant-local authenticated settings read, so the deprecated scoped client wrapper was redundant.
  - Existing auth/settings/template CRUD behavior preserved: yes (auth check, ordering, response shape, and status codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `app/api/settings/templates/route.ts` (POST create)
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: template creation already receives the current tenant and writes a tenant-owned record, so it should continue under the repaired ambient tenant context without bypass.
  - Existing auth/settings/template CRUD behavior preserved: yes (auth check, body parsing, defaults, `isDefault` handling, create fields, and response shape remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `app/api/settings/templates/[id]/route.ts` (GET read)
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: id-based template reads must remain tenant-local; keeping the existing `where: { id }` under ambient tenant scope preserves not-found-versus-not-in-scope behavior.
  - Existing auth/settings/template CRUD behavior preserved: yes (forbidden handling, trace headers, not-found path, and response shape remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `app/api/settings/templates/[id]/route.ts` (PATCH update)
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: template updates are tenant-local CRUD and should continue to rely on the current tenant context rather than a deprecated scoped wrapper.
  - Existing auth/settings/template CRUD behavior preserved: yes (body validation, update payload, `isDefault` demotion logic, trace headers, and status codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

- `app/api/settings/templates/[id]/route.ts` (DELETE delete)
  - Pattern chosen: existing ambient `withAuth` tenant context plus plain `prisma`.
  - Justification: deleting a tenant-owned template is high-risk but still tenant-local; the route continues to require current-tenant scope instead of authorizing by id alone.
  - Existing auth/settings/template CRUD behavior preserved: yes (forbidden handling, delete side effect, success response, trace headers, and status codes remain unchanged).
  - Latent followup: none discovered during the mechanism swap.

### Completed: B5 Other specialized routes/helpers

- `lib/pipeline/idempotency.ts`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` for tenant-local idempotency lookups/writes; isolated `runWithTenantBypass(...)` only for the global expired-key cleanup scan/delete path.
  - Justification: request-bound idempotency state is tenant-local, while the periodic cleanup job is a true cross-tenant maintenance sweep.
  - Existing auth/validation preserved: n/a (library helper, no route auth layer).
  - Latent followup: the key format (`pending:` prefix vs tenant-prefixed keys) was preserved exactly even though the cleanup logic looks odd; behavior change deferred.

- `lib/pipeline/circuitBreaker.ts`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` for tenant-local state/config/error-rate work; isolated `runWithTenantBypass('circuit-breaker-global-config-scan', ...)` only for the cross-tenant cron driver that enumerates enabled tenant configs.
  - Justification: circuit state mutations and reads are tenant-local once the tenant is known, but the auto-close cron must first discover all participating tenants globally.
  - Existing auth/validation preserved: n/a (library helper, no route auth layer).
  - Latent followup: none discovered beyond the intentional global config scan now being explicit.

- `lib/pipeline/deadLetterQueue.ts`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` for all tenant-local DLQ CRUD helpers; the existing isolated bypass on `processDLQ()` tenant enumeration from B1 remains the only cross-tenant piece.
  - Justification: DLQ entry management is tenant-local once the tenant is known, so the old scoped-client wrappers were replaced with explicit ambient tenant scope.
  - Existing auth/validation preserved: n/a (library helper, no route auth layer).
  - Latent followup: none discovered in this batch beyond the already-recorded B1 cross-tenant driver reason.

- `lib/pipeline/humanReview.ts`
  - Pattern chosen: `runWithTenantAsync(resolvedTenantId, ...)` for `routeToReview()`, `approveProspect()`, and `rejectProspect()` after the existing tenant-discovery lookup.
  - Justification: these are tenant-local state transitions and audit-log writes once the owning tenant has been resolved.
  - Existing auth/validation preserved: yes (no caller auth logic changed; helper semantics preserved).
  - Latent followup: the initial global tenant-discovery lookups remain in place by design and should stay visible through Phase 2.6 verification.

- `lib/pipeline/dealCloser.ts:recordEvent()`
  - Pattern chosen: existing narrow bypass for lead-id tenant discovery, then `runWithTenantAsync(tenantId, ...)` for tenant-local event write/update work.
  - Justification: engagement webhooks arrive keyed by lead ID, but once the tenant is known the actual writes are tenant-local.
  - Existing auth/validation preserved: yes (no webhook semantics changed).
  - Latent followup: other deal-closer cross-tenant reconciliation flows remain intentionally handled by their earlier explicit bypass reasons.

- `app/api/pipeline/prospects/[id]/route.ts`
  - Pattern chosen: `runWithTenantAsync(tenantId, ...)` after the existing `getTenantId()` resolution; no bypass added.
  - Justification: this is a tenant-local authenticated detail route, so tenant context should come from the existing request/session resolution rather than a permissive scoped client.
  - Existing auth/validation preserved: yes (`getTenantId()`, rate limiting, response codes, and the two-step prospect/context lookup all remain unchanged).
  - Latent followup: this route still depends on `getProspectContext()`'s global tenant-discovery lookup, which remains intentionally preserved from B3.
