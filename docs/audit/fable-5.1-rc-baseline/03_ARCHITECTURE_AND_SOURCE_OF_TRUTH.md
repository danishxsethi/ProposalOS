# 03 — Architecture & Source of Truth — Fable 5.1

## Canon

- Frontend: Next.js 16.3.3 standalone, 58 pages across (marketing)/(dashboard)/(admin)/(client)/public
- API: 147 route files (~197 handlers), `middleware.ts` does CSP nonce + OWASP headers + CORS + tracing only; auth is per-route `withAuth/withRole/verifyCronAuth`
- Audit: single canonical `lib/audit/runner.ts:960 MODULE_REGISTRY` 27 modules, 3 phases (Foundation 7, Analysis 18, Synthesis 2), concurrency 6, dependency skip, per-module withTimeout + AbortSignal, wall-clock 5m, deduplicate by fingerprint, `assessAuditResult` trustState
- Manifest: `packages/shared/src/audit.ts:87/119 CANONICAL_AUDIT_MODULE_IDS + CANONICAL_AUDIT_MODULES` — contract test enforces parity
- DB: Prisma 5.22.0 PostgreSQL 15, single client `lib/prisma.ts` $extends, AsyncLocalStorage `lib/tenant/context.ts`, RLS ENABLED/FORCED on tenant-owned tables, `set_config('app.current_tenant_id', …)` on same tx
- Queue: durable `AuditJob` (`prisma/audit_jobs`) idempotencyKey unique, leaseOwner/leaseToken/leaseExpiresAt heartbeat, `lib/audit/dispatch.ts` → `auditJobQueue` → `/api/worker/audit-job` cron
- LLM: `lib/llm/provider.ts` generateWithGemini (retry 3, circuit-breaker 5/60s, token budget 1M), ProviderRegistry GOOGLE_AI>OPENAI>ANTHROPIC with fallback, MODEL_CONFIG + thinking budgets, cache LRU SHA256
- Billing: Stripe 2024-12-18.acacia, lazy singleton proxy, BILLING_LIVE_MODE guards, ProcessedWebhookEvent dedup + CheckoutAttempt idempotencyKey

## Duplication / drift hunted

| Concept | Duplicates | Winner | Drift | Disposition |
|---|---|---|---|---|
| Audit runner | runner 27 vs orchestrator 14 (deprecated) vs retention wrapper | runner | 14 missing modules; now logs [DEPRECATED] 0 callers | keep runner, remove orchestrator file before RC |
| Module registry | runner MODULE_REGISTRY vs packages/shared manifest vs claraud-web copy | runner + shared | local copy not auto-synced | keep 2, add sync check or delete claraud-web copy |
| Prisma client | lib/prisma.ts single vs claraud-web second | lib/prisma.ts | claraud-web had P1-07 raw SQL bug, now fixed | keep single; claraud-web is separate app — not RC blocker |
| Pricing | PlanCatalogService + SAAS_PLANS vs PricingService 7-currency + metering thresholds | PlanCatalogService | FX hardcoded 0.92/0.79, tiers diverged | canonicalize on PlanCatalogService, deprecate PricingService for RC |
| Stripe webhook | /api/stripe/webhook vs /api/billing/webhook re-export | stripe/webhook | alias doubles audit events if both configured | keep one URL in Stripe dashboard, remove alias or document |
| Tenant context | AsyncLocalStorage + prisma $extends + raw SQL GUC | $extends tx path | one Unsafe $executeRawUnsafe in sniperWorker:575 | replace with Prisma.sql |

## Dead/shadow

- `lib/orchestrator/auditOrchestrator.ts` deprecated, 0 importers confirmed.
- `locale_configs` table dropped by db push — indicates stale migration vs schema drift.
