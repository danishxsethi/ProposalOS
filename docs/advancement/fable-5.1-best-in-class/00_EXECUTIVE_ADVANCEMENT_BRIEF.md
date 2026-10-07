# 00 — Executive Advancement Brief — Fable 5.1 Best-in-Class

**Date:** 2026-09-28 | **Baseline:** `docs/audit/fable-5.1-rc-baseline/` commit `5f66e09` INTERNAL_ALPHA_ONLY (G0 reached, G1 not)
**Mode:** READ-ONLY advancement design. No code changed. Previous audit observations are evidence after re-confirmation; previous recommendations are hypotheses, not instructions.
**Question answered:** What should we change — beyond bare remediation — to make Proposal Engine OS genuinely best-in-class?

---

## What is actually true now

Single Next.js 16.3.3 standalone (`Dockerfile` + chromium), 147 API routes (~197 handlers), 58 pages, 23 crons. Canonical audit engine `lib/audit/runner.ts:960` 27 modules in 3 phases (concurrency 6, per-module 10–60s, 5m wall, AbortSignal, fingerprint dedup, trustState TRUSTED/DEGRADED). Manifest `packages/shared/src/audit.ts:87` parity via contract test. Prisma 5.22.0, 95 models (~62 tenantId required), RLS ENABLED FORCED, single client `lib/prisma.ts` $extends + `lib/tenant/context.ts` AsyncLocalStorage + same-tx `set_config`. Durable `AuditJob` with lease/heartbeat + `dispatch.ts` queue. LLM `lib/llm/provider.ts` generateWithGemini (retry 3, breaker 5/60s, 1M budget, LRU SHA256) + ProviderRegistry failover. Evidence-bound proposals via `lib/proposal/publication.ts` fingerprint SHA256 + grounding + adversarial QA. Stripe 2024-12-18.acacia with `ProcessedWebhookEvent` dedup + `CheckoutAttempt` idempotency. Outreach discovery→qualification→enrichment→sniper all sandbox-guarded (Resend+Zoho, DNS verify, caps 35/50/100/5000, blocklist). Build/typecheck PASS; tests 2744p/11f (dirty tree); 12 import/order lint errors; 7 moderate npm vulns (uuid/protobufjs); migration drift `businessLatitude/Longitude` vs committed migrations caused `db push` to drop `locale_configs` (7 rows).

## What is already strong — keep it

The runner/registry/tenant-isolation/billing-dedup/proposal-grounding/LLM-resilience primitives are correct and should be **preserved and hardened, not replaced**. See `01` for per-subsystem PRESERVE/HARDEN vs REFACTOR/DELETE. Best assets: single canonical runner (no orchestration rewrite needed), RLS + same-tx GUC, grounding chain, idempotent webhooks, provider-resilient costs.

## Biggest systemic weaknesses (beyond the finding list)

1. **Duplicate sources of truth** inflate risk: pricing has 3 answers (PlanCatalogService 99/299/599 vs PricingService 7-currency FX 0.92/0.79 vs metering thresholds 3 vs 10), runner vs deprecated orchestrator vs retention wrapper, prisma client second copy in `claraud-web`, stripe/billing webhook alias.
2. **Collectors and analyzers conflate**: 27 "modules" each re-fetch same URL/GBP/Serp payload; no shared crawl/probe layer → 2–3× latency/cost and dedup tax.
3. **Route auth is human-memory** — `middleware.ts` does only CSP/CORS/tracing; 147 routes rely on remembering `withAuth/withRole/verifyCronAuth`; ~79 grep-no-guard routes are a future public exposure waiting to happen. No machine-enforced census.
4. **Evidence is stored but not traversable**: EvidenceSnapshot exists, but there is no collector→observation→finding→claim chain a reviewer can click, and no freshness/staleness at read time nor viewer UX.
5. **Quality is asserted, not measured**: no golden proposal eval, no 10-audit p95, no hostile-pair live, no a11y matrix, no price-equality assertion, no soak/rollback/backup drill — so "premium/trusted" cannot be claimed.
6. **Operational observability is dashboard theatre risk**: OTel + LangSmith + metrics exist, but no tenant-level SLO/error-budget/alert→runbook linkage.
7. **Product story multiplies**: Claraud brand, self-evolving prompts design-vs-prod split, multi-currency pricing as aspiration — dilute the canonical agency OS.
8. **Lint signal is 12 signal + 1881 noise** — `any`/`unused-vars` floods hide real boundary breaks.

## Best-in-class target in one paragraph

A single-tenant-isolated, single-runner, shared-collection audit plane feeds typed analyzers that emit evidence-pointed findings; a diagnosis graph clusters to ≤5 pain roots with citations; a proposal compiler applies deterministic pricing/tier/timeline business rules and only then asks the LLM for executive prose within a claim contract that is re-validated before a fingerprint gates publication; a public proposal surface renders the evidence chain a buyer can traverse; billing is single-catalog single-webhook idempotent with displayed=charged proven; the durable Postgres queue stays boring until proven insufficient; and every trust claim (isolation, truthfulness, idempotency, price accuracy) is proven by a live hostile-pair/golden-eval/money-smoke/p95/a11y artifact that CI generates.

## Most consequential improvements

See `03` ledger (70 items T0–T4) but the force multipliers are: shared collector layer (cuts latency/cost 30–50%), typed ModuleIO contract + route-auth census generation (prevents exposure by construction), unified proposal Envelope contract (collection→claim chain), golden-eval + hostile-pair + Stripe smoke as CI gates, single pricing canon + SaaS checkout idempotency, and a coherent design-system pass on audit→proposal→public-acceptance as one story.

## What we recommend not to build

Temporal/Kafka/microservices/K8s/second AI service/live autonomous outreach/multi-currency/self-evolving production prompts/complex SSO/real-time collab/Claraud second backend — all deferred until a measured trigger. See `12`.

## What is needed to authorize implementation

Eight pre-implementation decisions (migrations, pricing canon, webhook URL, Claraud scope, prompts DB, outreach approval default, module count honesty, locale_configs). Most technical calls are already decided in `11`. See `13` and `14` for machined next-plan inputs.

**Artifacts:** 15 docs in this directory. No product code changed. Next prompt may turn `03`+`11`+`14` into workstreams, PR sequence and gates almost mechanically.
