# 09 — Performance, Cost, and Observability — Fable 5.1 Best-in-Class

## Why performance and cost are one topic here

Every audit wall minute is server bill + LLM bill + provider API cents + prospect wait. At agency throughput (50 audits/day), $0.30 extra per audit is $450/mo — worth a Collector refactor.

## Current state

- Wall 5m (`lib/audit/runner.ts:1604 runAudit`) + phases worker-pool 6 (`getPhaseConcurrency`), per-module `withTimeout` 10–60s, AbortSignal.
- Cost: `COSTS: PAGESPEED 0, WEBSITE_FETCH 0, PLACES_TEXT 3 PLACES_DETAILS 2 SERP 1, GEMINI_FLASH 0.01/0.03 GEMINI_PRO 0.07/0.21 GEMINI_31_PRO 0.125/0.5` per 1k (`lib/costs/costTracker.ts:674`), tier budgets `FREE 500/50 … WHITE_LABEL 500k/75`, cap 200¢, `GlobalSpendTracker` + `redisSpendTracker checkAndAddSpend` atomic, `withAuditBudget reserve→settle 10m`. Per-audit `apiCostCents` persisted on `Audit` but per-module cost is internal.
- Observability: `@opentelemetry/* 1.9/0.222`, `lib/tracing.ts`, `lib/observability`, `lib/qa/telemetry.ts`, `lib/costs/redisSpendTracker.ts` + `costTracker`, `prompts` cache LRU. No p50/p90/p95 artifact yet, no module breakdown dashboard, no cache-hit label.

## Target numbers (measured, not marketed)

| Metric | Target (after collectors) | How measured | Evidence |
|---|---|---|---|
| audit p50 wall | <90s  QUICK: <20s | 10 audits×5 industries× env profit lab run `scripts/e2e-full-audit.js` + `phase-z` | `evidence/performance/p95-*.json` |
| audit p95 wall | <3m (was <5m) | same | same |
| proposal p95 | <90s | compiler trace | same |
| PDF p95 | <15s | GCS upload span | same |
| cost p95 per FULL audit | <80¢ (stripe+places+serp+LLM) | `costTracker.getReport()` per module sum | `evidence/performance/cost-*.json` |
| cost p50 | <35¢ | same | same |
| provider error rate | <5% degraded (<0.5% failed) | moduleResults `COMPLETE/PARTIAL/UNAVAILABLE/FAILED/SKIPPED` | dashboard |
| cache hit | crawl 40% cross-audit PageSpeed | fetchCache + module label | label per module |

Marketing must not paste these numbers until artifact exists + second reproduction on clean branch.

## Concrete engineering opportunities

1. **Shared collectors (ADV-AUDIT-01):** One `WebsiteCrawl 20 pages + safeFetch` + one `Places resolveBusiness` (TextSearch 3¢ once vs `gbp`+`gbpDeep` 5¢ twice) + one SerpAPI landscape reused by `competitor+keywordGap+paidSearch` (3×1¢→1¢). Dominant cost is `gemini-31-pro` at 0.5 output — keep via `contentQuality+vision+competitorStrategy` only; flash for `reputation/keywordGap` validation.
2. **Parallelization shape:** Keep collectors `concurrency 2` (place API rate), analyzers `concurrency 6`. Expanding analyzer concurrency beyond 6 adds Postgres contention before wall savings.
3. **Caching:** Per-audit `fetchCache Map<url, html>` eliminates crawler vs `techStack` double-fetch (ADV-PERF-03). Cross-audit `moduleCache` TTL PageSpeed 12h, Places identity `T24h`.
4. **Lazy work:** `vision` screenshots only if `websiteCrawler.screenshots≥1`; `paidSearch/backlinks/videoPresence` optional remain skipped unless proposal needs them — not eager.
5. **Token-aware routing:** `provider.ts` budget 1M soft truncation (+20% cut) is correct; add model routing: `flash` for extraction, `pro` only for strategy/vision — currently some analyzers use pro by default.
6. **Prospective:** progressive publish (ADV-AUDIT-04) moots latency perception without optimizing wall.

## Observability that makes cost actionable (ADV-OBS-01/ADV-PERF-02)

- `lib/qa/telemetry.ts` ← per-module `{wallMs, status, cached, costCents, provider}` → `QATelemetry` + dashboard chart `cost by module × tier`.
- Tag every OTel span with `tenantId, auditId, moduleName, collectorHit`.
- Alert: `cost p95 > cap 200¢` or `collector repeat >1 per URL` → fire.
- Daily `reconcile-billing` extends to `reconcile-spend` that compares `CostTracker sum` vs `GlobalSpendTracker` month vs `redis` — divergence >2% pages.

**Why this target is best-in-class:** agencies compare us on "is each audit cheaper than my analyst hour?" — p50 35¢ and p95 80¢ with traceable module breakdown is sellable; 27 modules re-fetching same HTML is not.
