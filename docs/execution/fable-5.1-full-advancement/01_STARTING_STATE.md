# 01 — Starting State — Fable 5.1 Full Advancement Execution

**Starting SHA:** `5f66e09347e4314b592f9d008128e3b241e3b84e` on `remediation/proposalos-e2e` DIRTY (31 modified, 10 untracked prior to this session)
**Starting verdict (Fable 5.1 baseline):** INTERNAL_ALPHA_ONLY, G0 reached, G1 not
**Gates blocking G1:** 12 import/order lint errors, 11 failing tests (5 suites), `businessLatitude/Longitude` migration drift with `locale_configs` 7-row loss on `db push`, ` rolled_back be33d811` lingering
**Gates blocking G2–G4:** 7 moderate npm vulns not HIGH so policy passed but noisy, route auth ~79 grep-no-guard, SSRF allowlist missing lib/maps + competitor drift, checkout authz 404 contract mismatch, matrix allowlist drift, public-proposal select mismatch

**Decisions adopted from 13_PRE_IMPLEMENTATION_DECISIONS:**
- #1 migrations: commit lat/lng in committed migrations (20260926020000 already had them, empty-replay proven 26 applied) + keep locale_configs 7 rows (not dropped)
- #2 pricing: PlanCatalogService canonical, PricingService deferred as experimental (kept but documented)
- #3 billing alias: kept but noted single canonical is /api/stripe/webhook
- #4-8 defaults as recommended (Claraud appendix, prompts deterministic, sandbox default)

**Execution removes perfect plan fallacy and fixes root causes not snapshots.**
