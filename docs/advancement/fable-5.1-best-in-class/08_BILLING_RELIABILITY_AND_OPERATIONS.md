# 08 — Billing, Reliability, and Operations — Fable 5.1 Best-in-Class

## Billing target (single coherent commercial architecture — see 11 decision 10)

**Canonical catalog:** `lib/stripe/PlanCatalogService.ts:20` (`starter 99 25 audits, pro 299 100, agency 599 1000`, aliases `pro→growth, agency→scale`) plus `lib/stripe/stripe.ts:113 SAAS_PLANS` is the commercial source of truth including Stripe `PriceId test/live`. The DB `lib/stripe/pricingService.ts:88` 7-currency generator (`0.92/0.79 FX`) and its `PricingPlan` model move to `experimental/` — defer past GA.

**Invariants proven:**
- `displayed === charged`: Proposal checkout already `stripe.prices.retrieve(unit_amount+currency)` exact 409 on mismatch (`app/api/stripe/checkout-proposal/route.ts:177`); add same assertion at compile time (ADV-BILL-04) and SaaS `plan.priceId→retrieve` equality. Stripe is display verifier.
- SaaS idempotency: add `CheckoutAttempt.idempotencyKey `${tenant}:${plan}:${period}`` + Stripe `Idempotency-Key` header (ADV-BILL-01) mirroring proposal `proposal-checkout:{fingerprint} SHA256 canonical JSON` (`lib/proposal/publication.ts:acceptedCommercialFingerprint`).
- Webhook: keep only `/api/stripe/webhook` `constructEvent(body,sig,webhookSecret)` + 10/m crown + `ProcessedWebhookEvent PK id + createMany skipDuplicates` reservation tx (`lib/stripe/webhookHandler.ts:97`); delete billing alias to avoid duplicate auditTrail.
- Concurrency near quota: `lib/billing/limits.ts:70 + EntitlementService:96` TOCTOU → fix with `SELECT … FOR UPDATE` advisory lock (ADV-DATA-01); concurrent 2× at 99/100 proves `200 + 429`.
- Metering exactly-once: `UsageRecord` before Stripe `meterEvents.create`; deduplicate via `usage-${recordId}` plus DB flag prevents resend; reconcile `lib/stripe/reconcile.ts` as backstop not cop.
- States: `Subscription` `pending|trialing|active|past_due|canceled` + `Tenant.gracePeriodEndsAt+14d` + `invoice.payment_failed` replay guard + `currentPeriodEnd` out-of-order guard already correct; add displayed grace banner.

## Reliability — make it boring (see 11 decision 1)

**Queue:** Keep Postgres durable `AuditJob` (`prisma/audit_jobs` `idempotencyKey unique`, `leaseOwner/leaseToken/leaseExpiresAt+lastHeartbeatAt`) — boring is best-in-class at this throughput. Prove crash recovery: kill worker mid-phase → peer reclaims `leaseExpiresAt` < now if token mismatch → completion of stale worker rejected not overwriting newer attempt. Adv: `lib/queue/auditJobQueue.ts`, `app/api/worker/audit-job`.

**Failure classes and recoveries:** partial audit `DEGRADED_REVIEW_REQUIRED` (runner `assessAuditResult`); poison job (`malformed url` modulesFailed pattern → DLQ fast no 3× waste); provider 5xx per-collector fallback vs whole-phase retry; Redis outage `handleRedisDown LOCAL_FALLBACK 0.1`; storage outage `DELIVERY_STORAGE_UNAVAILABLE`; billing outage `assertBillingNotFrozen` freeze; email outage bounce→blocklist already; DB outage alert; duplicate queue delivery dedup by `idempotencyKey` + `ProcessedWebhookEvent` skipDup.

**No Temporal now:** Trigger `>150 audits/min sustained 1h` or `reclaim >30s` (11 decision 1) before introducing Temporal/Cloud Tasks. Proving boring queue handles 25-batch + 50-metro discovery fanout is cheaper than operating workflow engine.

## Operations — actionable, not theatre

- **SLOs per tenant:** `audit success ≥95%`, `degraded <10%`, `wall p95 <5m`, `proposal <90s`, `cost p95 < cap`, `bounce <5%`. Error budget = 1−SLO.
- **Tracer:** OTel auto-instrumentation + `lib/tracing.ts createParentTrace` LangSmith + `lib/observability` metrics; add tenantId to every trace span so per-tenant drill is one click.
- **Dashboards:** job wait/lease/DLQ, module wall+success, spend per audit/module/currency, proposal QA `computeHallucinationScore weekly >5%`, billing `FailedWebhookEvent` queue, outreach bounce/complaint.
- **Alerts→runbooks:** p95 breach → scale concurrency 6→8; burn burn→pause dispatch; webhook backlog → retry service; bounce >5% domain pause is automated (`lib/outreach/sprint2/domainRotation.ts checkAndEnforceDomainHealth`); billing freeze on `KILL_SWITCH_FORCE_MANUAL_MODE`.
- **Backup/PITR:** `scripts/test-restore.ts` + `Dockerfile.migrate` restore to ephemeral PG + RLS spot-check monthly.
- **Canary/rollback:** single image `server.js` canary tag + instant rollback via prior image; prove with `smoke:phase-z` + `check-migration-replay`.

**Proof artifacts for RC:** p50/p90/p95 wall+cost, success/degraded/duplicate rates, rollback log, restore drill log, burn chart.
