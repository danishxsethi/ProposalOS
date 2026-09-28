# 10 — Source of Truth and Documentation — Fable 5.1 Best-in-Class

## Problem: repo facts and vision story have diverged

- Notion still names Temporal/n8n/Dify as mandatory, old module counts, old cost goals.
- Repo has `docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/{module-matrix,public-proposal-mutation,route-matrix}.json` that are generated but stale on dirty tree (git shows 20+ line diffs uncommitted).
- `.env.example` 10603 lines vs `validateEnv.ts:153` pattern — source-of-truth is runtime `instrumentation.ts` but doc not generated.
- Pricing has 2 live catalogs + meter divergent; claims ledger lives in audit dirs, not product.

## Target documentation model: facts are generated, vision is labeled

```
repo fact (generated) ──→ artifact with hash
product vision (labeled ASPIRATIONAL) ──→ Notion with date + owner
release state (audited) ──→ docs/advancement/... + evidence/  (this run)
```

| Artifact | How now | How target | Generator |
|---|---|---|---|
| Module registry (27) | `runner.ts:960` constant + manifest copy | Generated manifest + rendered markdown | `scripts/build-target-list.ts:75` → `artifacts/module-matrix.json` + markdown table |
| Route census (147) | implicit per-route memory | Generated + gated | `scripts/route-census.ts` (new) → `route-matrix.json` + `evidence/route-census.csv` |
| Pricing canon | `PlanCatalogService 99/299/599` vs `PricingService 7×` | Single `PlanCatalogService` emitted as `pricing-manifest.json` | `PricingService` moved to `experimental/` |
| Env vars | hand-edited 10k lines | Generated from `validateEnv.ts` schema | `scripts/validate-env.ts:153` → `.env.example` |
| Claims ledger | audit-local ledger | Product ledger at `docs/product/CLAIMS_LEDGER.md` updated per gate | human reviewed, generated module/price rows |
| Public proposal mutation | stale `public-proposal-mutation.json` | Generated from `publication.ts` contract | `scripts/qualify-proposal-trust.sh` |
| Performance numbers | none | `evidence/performance/p95-*.json` per gate | `scripts/e2e-full-audit.js` |
| Golden eval results | none | `evidence/proposal-scorecards/` + leaderboard | eval runner |

## What to keep / rewrite / archive / generate

| Document | Disposition | Why |
|---|---|---|
| `docs/audits/2026-09-18*` history | **RETAIN** archived | Provenance of pre-Fable work |
| `docs/advancement/fable-5.1-best-in-class/*` | **RETAIN** new canonical design | This run |
| `docs/audit/fable-5.1-rc-baseline/*` | **RETAIN** baseline evidence | Immutable gate G0 |
| `docs/docs/*` legacy project docs | **PRUNE** — move stale Temporal/n8n pages to `docs/archived/` | Reduce confusion |
| `docs/security/audit-evidence/npm-audit-*.json` | **GENERATE** — replace committed snapshots with CI artifact | Stale 6-line diff proves snapshot drift |
| `lib/orchestrator/*` references in docs | **DELETE** with code | Dual story |
| `experimental/self-evolving-prompts/README` | **CREATE** ADR deferring | Make "Notion experiment, not RC" explicit |
| `docs/product/PRODUCT_CONTRACT.md` | **CREATE** single page from Section 4 | Agency OS promise + ICP |
| `.github/workflows/test.yml` | **REFINE** add gates (see 08) | Enforce generated sync |

**Rule:** any doc that could be generated must not be hand-edited after RC — CI fails if `build-target-list` output diverges from committed artifact (pattern already exists for `module-matrix.json`; extend to all rows above).

**Acceptance:** `npm run build-targets` + `route-census` + `validate:env` all exit 0 on clean branch, and PR CI fails when committed artifact diverges — reproduced locally then fixed.
