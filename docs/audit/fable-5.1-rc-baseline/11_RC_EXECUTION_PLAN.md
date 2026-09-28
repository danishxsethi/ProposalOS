# 11 — RC Execution Plan — Fable 5.1

## Gates G0→G6

G0 Baseline Accepted — **REACHED**
G1 P0 Containment — close P1 drift/lint/tests + npm vulns
G2 Core Correctness — modules + proposal truthfulness + RLS hostile pair proven
G3 Premium Polish — UX/a11y/PDF measured, no primary broken
G4 Staging RC — Stripe smoke + soak + chaos
G5 Public RC — all gates + weighted ≥75 + board sign-off
G6 GA — SLOs + 30d monitoring + incident proven

## Workstreams (5–8 parallel)

### WS1 — Repo hygiene & supply chain (P1)
- Findings F51-P1-001/002/003, F51-P2-003/006, F51-P3-001
- Files: prisma/schema.prisma vs migrations/*, _prisma_migrations, package.json/lock uuid/protobufjs, .eslint boundary allowlists
- DoD: `npm run lint` 0 errors, `npm test` 0 fail, `npm audit` 0 high/moderate, `prisma migrate status` clean without db push data loss
- Verify: `npm run typecheck && npm run lint && npm run build && bootstrap && npm test -- --reporter=dot && prisma migrate status`
- Effort: solo 1–2d / team 1d

### WS2 — Security boundaries (P2)
- F51-P2-001/002/007/008
- Files: lib/maps/googleMapsProvider.ts, lib/security/safeFetch allowlist, tests/architecture/*, app/api/admin/model-metrics/route.ts, app/api/billing/webhook/route.ts
- DoD: SSRF + auth-session boundaries green (allowlist updated or fetch replaced)
- Effort: 1–2d

### WS3 — Billing canon (P2)
- F51-P2-004
- Files: lib/stripe/PlanCatalogService.ts, lib/stripe/pricingService.ts, lib/billing/metering.ts, lib/stripe/stripe.ts SAAS_PLANS
- DoD: single source of truth decision + thresholds aligned or explicitly deferred with doc; reconcile cron tested
- Effort: 1–2d

### WS4 — Matrix & checkout authz (P1/P2)
- F51-P2-005 + stripe-checkout-authz 3 fails
- Files: lib/modules/types.ts, lib/maps/*, tests/matrix/module-provider-matrix.test.ts, app/api/stripe/checkout-proposal/route.ts
- DoD: matrix green, checkout 400 messages match or test snapshot updated, public proposal fields assertion adjusted
- Effort: 1–2d

### WS5 — Proposal quality measurement (G2/G3)
- Generate 5-industry proposals (dentist, law-firm, hvac, restaurant, real-estate), score 100-pt rubric, avg≥85 none<80
- Files: lib/proposal/*, lib/qa/*, prompts/*
- DoD: 5 scorecards in evidence/proposal-scorecards/ + no high hallucination + pricing tier mapping valid
- Effort: 2–4d (needs LLM keys + time)

### WS6 — Premium UX & a11y (G3)
- Screenshots 320/375/768/1024/1440 + keyboard + axe core + contrast + 200% zoom
- DoD: no critical/serious a11y on primary surfaces, visual baseline committed
- Effort: 3–6d designer + eng

### WS7 — Reliability & billing smoke (G4)
- 10 audits ×5 industries + soak 24h + chaos injection + Stripe test-mode checkout→webhook→Order/Payment
- DoD: p50/p95 latency+cost + success/degraded rates documented, rollback + backup/restore drills logged
- Effort: 2–4d + 24h soak

## Scenarios

| Scenario | Earliest RC | Expected RC | Conservative | Critical path |
|---|---|---|---:|---|
| Solo founder | 7d | 14d | 21d | WS1→WS2→WS5 (LLM) →WS6 |
| 2 eng + 1 designer | 5d | 9d | 14d | WS1/WS2/WS3 parallel →WS5→WS6, WS7 overlaps |
| 5-person strike team | 4d | 7d | 10d | all WS parallel, WS5 LLM wall time is limiter |

Dates assume no new P0 found in hostile pair/chaos; each finding may add 1–3d. Not commitments.

