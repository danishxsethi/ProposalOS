# FINAL — Best-in-Class Advancement Design — Fable 5.1 — Proposal Engine OS

**Date:** 2026-09-28 | **Baseline:** `docs/audit/fable-5.1-rc-baseline/` INTERNAL_ALPHA_ONLY G0 | **Mode:** READ-ONLY design, no product code changed | **Inputs:** 27-module runner, 147 routes, 95 models, 23 crons, evidence-bound proposals, RLS+ALS, Stripe dedup — all re-checked before each recommendation.

---

## 1. What is true now (A)

See `00` — single standalone Next, 58 pages, durable AuditJob lease/heartbeat, LLM resilient, proposal fingerprint gating, sandbox outreach — but dirty tree, migration drift `businessLatitude/Longitude` → `locale_configs` loss, 11 failing tests, 12 lint `import/order`, 7 moderate vulns.

## 2. What is strong — preserve (B)

Runner/registry/tenant-isolation/billing-dedup/claim-grounding/LLM-resilience as listed in `01` PRESERVE/HARDEN — correct primitives, not to be replaced.

## 3. Systemic weaknesses — not just findings (C)

Eight enumerated in `00` — key: duplicate sources of truth, 27 modules re-fetch same origin (2–3× cost), route auth by human memory, evidence implicit, quality asserted not measured, dashboard theatre risk, product story multiply, lint 1881 noise hides 12 signal.

## 4. Best-in-class target (D)

See `02` planes: shared collectors emit Evidence Vault once; analyzers become pure; Envelope `collectors+findings+claims+ruleIds` hashes to `publicationFingerprint`; public proposal traverses click chain; billing is single-catalog idempotent; durable Postgres queue stays boring; every trust claim proven by hostile-pair/golden-eval/money-smoke/p95/a11y artifact.

## 5. Top improvements (E)

Collector vs analyzer split (−30% latency/cost), typed ModuleIO + route-census generation, Envelope chain, golden eval + hostile pair + Stripe smoke gates, single pricing canon + quota lock, design-system pass on audit→proposal→public.

## 6. Architecture decisions (F)

20 ADRs in `11` — key: keep AuditJob (not Temporal), keep monolith, runner 27 sole writer, shared manifest, Claraud as appendix, proposal Envelope, LLM via registry, LangGraph kept shrunken (2 graphs), LangSmith writer kept with thin query, PlanCatalogService canon, billing alias deleted, multi-currency/prompts/outreach live all deferred until triggers.

## 7. Product/UX evolution (G)

See `07` — workflow-correct IA (marketing→auth→workspace→QUICK/FULL→stream 15s→grouped findings→evidence drawer→≤5 diagnoses→tiered proposal→explicit human queue→share/PDF parity→accept→batch→prospecting), design tokens, responsive matrices.

## 8. AI/proposal evolution (H)

See `06` — deterministic business rules (pricing/tier/timeline/ROI) never LLM, injection scrub + output validator + framing `<UNTRUSTED_*>` temps 0-0.3, adversarial 3-pass retry>0.3, golden 40-case eval with hard-fails, human-review state explicit.

## 9. Trust/security evolution (I)

See `04` — machine-enforced census + orphan priv closure + last Unsafe→Prisma.sql + hostile-pair live through pgbouncer tx pool + token `publicLinkExpiresAt` + rotation — security as system not checklist.

## 10. Reliability/ops evolution (J)

See `08` — keep durable queue lease proof (kill-mid-phase), poison-DLQ fast, backpressure before enqueue, per-tenant SLO/error budget/alert→runbook, restore drill monthly, canary/rollback via single image tag.

## 11. Advancement tiers (K)

`03` 70 items: 12 T0 blockers (unsafe/dishonest), 20 T1 premium-RC, remainder T2 GA / T3 category-leading, T4 via `12` don't-build.

## 12. What not to build (L)

`12` 15 items — Temporal, Kafka, microservices, K8s, separate AI service, self-evolving prod prompts, live outreach, multi-currency, Claraud second backend, SSO, realtime collab, second APM, vault table, WCAG certification claim — each with trigger.

## 13. Decisions required (M)

`13` 8 items — only #1 lat/lng+locale_configs restore and #2 pricing canon truly block first PR; rest flag-default.

## 14. Inputs for next implementation plan (N)

`14` gives workstreams WS-H/T/C/I/X/P/O, DAG `H→T→{C→I→X→P, O}`, gate placement `migrate/route-census/axe per PR`, money-smoke/p95/soak at G4, required artifacts per PR, estimate.

---

**Files in this design:** `00 Executive Brief`, `01 Preserve/Harden`, `02 Target Architecture`, `03 Ledger (70)`, `04 Security`, `05 Audit/Evidence`, `06 AI/Proposal/Eval`, `07 UX`, `08 Billing/Reliability/Ops`, `09 Perf/Cost/Observability`, `10 Source of Truth/Docs`, `11 Architecture Decisions (20)`, `12 Don't Build (15)`, `13 Pre-Implementation (8)`, `14 Next Plan Inputs`, `FINAL …` — 16 files total, no fake evidence placeholders, every advancement has typed Files/Acceptance.

*Signature:* Fable 5.1 — would sign this best-in-class target as the correct build after INTERNAL_ALPHA_G0.

