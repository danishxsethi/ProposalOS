# 14 — Next Plan Inputs — Fable 5.1 Best-in-Class

This file makes the next prompt (workstreams→PR sequence→gates) mechanical. Implementer consumes `03` ledger + `11` decisions + this file without re-reading code.

## Source inputs that are already sufficient

- **Master ledger** `03` — 70 items with ID/Domain/Type/Priority/Files/Acceptance — is the backlog.
- **Decisions** `11` 20 ADRs + `13` 8 pre-implementation product decisions.
- **Target arch** `02` — request/data/audit/intelligence/commercial/growth/ops planes + canonical owners.
- **Baseline evidence** `docs/audit/fable-5.1-rc-baseline/evidence/*.csv + commands/*.txt` — do not reuse stale `npm-audit-*.json` committed snapshots; treat as regenerated artifacts.

## Workstreams (suggested slice for next plan)

- **WS-H Hygiene (A,O):** F51-P1-001/002/003/006 + P3-001 + ADV-DOC-01 (T0) — `typecheck 0 + lint 0 + tests 0 + migrate clean + audit 0 high/mode`.
- **WS-T Trust (C):** ADV-AUTH-01/02, ADV-SEC-01/02, F51-P2-007/008 (T0) — census gate + boundary greens + Unsafe 0.
- **WS-C Commerce (K,D):** ADV-BILL-01/02/03/04, ADV-DATA-01 (T0) — single catalog + checkout idempotency + quota lock + money smoke.
- **WS-I Intelligence (E,G,H):** ADV-AUDIT-01/02/03, ADV-DATA-02, ADV-AI-01/02, ADV-EVAL-01 (T1) — shared collectors + Envelope + vertical context + golden eval.
- **WS-X Experience (I,J, part of N):** ADV-UX-01/02/03, ADV-OBS-01 (T1) — design system + evidence viewer + ROI range + stream progress.
- **WS-P Performance (M):** ADV-PERF-01/02 (T1) — shared fetchCache + per-module cost dashboards.
- **WS-O Ops (L,N):** ADV-REL-01/02, ADV-OPS-01 (T2) — crash recovery + backpressure + restore drill + SLO/error budget.

T3 items (ADV-EVAL-02, ADV-REL-03, ADV-GTM-02) are intentionally not in next plan.

## PR sequence constraints (DAG; implement in this order inside each WS)

```
WS-H(1) ─→ WS-T(2) ─┬─→ WS-C(3) ─→ WS-I(4) ─→ WS-X(5) ─→ WS-P(6)
                     └─→ WS-O(7) (can overlap WS-I/X)
```

Inside WS-H: `migrations (#1/8) → lint ordering → boundary allowlists → uuid/protobufjs → bootstrap diff`.
Inside WS-T: `route-census script → gate admin/model-metrics → delete billing alias → guard worker`.
Inside WS-C: `canonical catalog → threshold align → add SaaS idempotency → price-equality contract`.
Inside WS-I: `ModuleIO refactor → collectors → phases manifest → tierMapping rulebook → vertical context → golden eval green`.
Inside WS-X: `design tokens → admin/client layouts → evidence drawer → ROI range → progressive progress`.

## Gates: where they belong

| Gate | Belongs | Fails PR if |
|---|---|---|
| `migrate status clean` + `empty-DB replay without data loss` | every PR (via `test.yml`) | rolled_back row or `locale_configs` drop |
| `npm audit 0 high/mode` or waived ADR | every PR | uuid/protobufjs unfixed |
| `route-census.csv` + boundary 0 fail | every PR | orphan NO-guard route or Unsafe raw fetch |
| `money smoke (Stripe test) 200 same URL second click` | RC gate G4, preview on PR with liveTest tag | double session |
| `golden eval 40 cases 0 hard fail` | T1 PRs that touch `lib/proposal`/`lib/graph` | hallucination/wrong-city |
| `axe 0 critical/serious` | every PR touching `app/**/*` | a11y regression |
| `p95 wall+cost artifact` | G4 soak | claim drift |
| `hostile tenant live` | T0 ship, else holds G2 | cross-tenant read |

## Required artifacts per PR (acceptance hooks)

- `migrate status` log + `psql \d Audit` sniff `businessLatitude` present.
- `npm run lint` + `npm test -- --reporter=dot` log 0 fail.
- Generated `artifacts/{module-matrix,route-matrix,public-proposal-mutation}.json` diff 0 vs committed or PR fails.
- `price-equality` contract test vs `stripe.prices.retrieve` fixture.
- `quota TOCTOU 2× at cap 99/100` concurrency test.

## Sequencing estimate for next plan (not wall time — graph distance)

Solo 14d expected breaks into: H 1d → T 1d → C 1d → I 4d → X 3d → P 1d → O 1d + 24h soak overlaps X/P. Two-eng+designer 9d with H|T|C 1d parallel then I|X.

## Few truly unresolved inputs

See `13` — only items #1 (lat/lng+locale_configs) and #2 (pricing canon) need answer before first PR merges. Remainder can merge behind flags.

## Input completeness checklist for next prompt

- [ ] Ledger 03 loaded as backlog source
- [ ] 20 ADRs from 11 referenced by WS headers
- [ ] Target arch 02 planes respected
- [ ] Route census 147 and module 27 paths treated as generated, not hand counts
- [ ] Acceptance column in 03 treated as PR Done definition (no "looks good")
- [ ] Don't-Build 12 T4 excluded from WS list
- [ ] Pre-implementation 13 minimal questions surfaced to human once, not per-PR
