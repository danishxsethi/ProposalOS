# 05 — Audit Module Scorecards — Fable 5.1

Source: `evidence/module-scorecards.csv` + `lib/audit/runner.ts:960` + `packages/shared/src/audit.ts:119`.

27 modules, all registered, reachable, real providers, SSRF via safeFetch where fetched, honest failure (FAILED/PARTIAL/UNAVAILABLE not mislabeled).

| Phase | Modules | Notes |
|---|---|---|
| 1 Foundation | website, websiteCrawler, gbp, competitor, techStack, security, emailFinder | GBP via mapsIntelligence.resolveBusiness, crawler 20-page, PSI prod |
| 2 Analysis | coreWebVitals, schemaAnalysis, reputation, social, socialDeep, gbpDeep, seoDeep, accessibility, mobileUX, contentQuality, conversion, citations, paidSearch, backlinks, privacyCompliance, schemaMarkup, keywordGap, videoPresence | accessibility axe-core/puppeteer chromium, contentQuality+reputation keywordGap via Gemini, seoDeep HEAD robots/sitemap |
| 3 Synthesis | competitorStrategy, vision | Gemini strategy + vision screenshots |

## Scorecard excerpt

All 27 VERIFIED pending matrix test fixes. See csv for per-module SSRF/honest-failure/evidence/cost flags.

## Findings semantics

- `validateFinding` + Evidence pointer required; `lib/audit/findingContract.ts` + `findingPersistence.ts` sole writer.
- `extractFindingsFromRegistryResult` normalizes legacy vs new; `normalizeAndValidateModuleFindings` rejects FAILED modules.
- Dedup by `metrics.schemaFingerprint||fingerprint||type:title` union evidence by pointer.
- No module silently dropped after dirty-branch matrix failures are fixed.

## Cost

`lib/costs/costTracker.ts` COSTS: Places 3/2¢, SERP 1¢, Gemini 0.01/0.03 pro 0.07/0.21; TIER_BUDGETS FREE 500/50 etc.; CostTracker cap 200¢; GlobalSpendTracker + redisSpendTracker atomic checkAndAddSpend + withAuditBudget reservation pattern.

