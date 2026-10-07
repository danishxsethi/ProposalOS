# 08 — Billing, Reliability, Operations — Fable 5.1

## Billing

- Plans (`lib/stripe/stripe.ts:113 SAAS_PLANS` starter 99/25, pro 299/100, agency 599/1000) vs `PlanCatalogService` (growth/scale aliases) vs DB `PricingService` 7-currency (orphaned for RC) vs `lib/billing/metering.ts` thresholds (free 10 vs 3, agency 999999 vs 1000) — P2 drift to canonicalize.
- Checkout SaaS: `withAuth` → trial 14d, customer via tenant.stripeCustomerId, metadata tenantId/planId, CheckoutAttempt create no idempotencyKey (gap).
- Checkout Proposal: public token resolve + fingerprint commercialFingerprint `proposal-checkout:{fingerprint}` idempotent, price verify via `stripe.prices.retrieve` exact match.
- Webhook: `app/api/stripe/webhook` sig verify + 429 after 10/m, `lib/stripe/webhookHandler.ts` idempotency ProcessedWebhookEvent pk + skipDuplicates reservation tx, tenant resolve narrow bypass, upserts Order/Payment/Project/FulfillmentTask, out-of-order guard by periodEnd, FailedWebhookEvent 5x retry, reconcile cron.

## Reliability

- Queue: durable AuditJob idempotencyKey unique, leaseOwner/leaseToken/leaseExpiresAt heartbeat, only holder may complete.
- Timeout hierarchy: phase 10-60s per module, wall 5m global, AbortSignal propagation.
- Retries: LLM 3 jitter + circuit breaker 5/60s half-open 60s; AuditJob maxAttempts 3, DLQ via DeadLetterQueue.
- Concurrency: runWithConcurrency limit 6 via AUDIT_PHASE_CONCURRENCY.
- Cost: atomic reserve then settle via Redis, localFallback 0.1 fraction if Redis down.
- UNVERIFIED on this HEAD: 10 audits/5 industries wall/queue/LLM/provider timings, p50/p90/p95 cost, success/degraded/duplicate rates; queue durability/concurrency under load; worker killed mid-audit; duplicate delivery; soak 24h; rollback drill; backup/PITR.

## Operations

- 23 crons + metering sweep + reconcile + retry-webhooks + scheduled-audits.
- Observability: OpenTelemetry, LangSmith traces, MetricsRecorder, Adversarial/QA telemetry.
- Required before RC: dashboards, alerts, runbooks, kill switches `KILL_SWITCH_FORCE_MANUAL_MODE` tested, canary, health/readiness endpoints proven via failure injection (DB/Redis/LLM timeout/429/5xx/email/Stripe/storage/duplicate dispatch).
