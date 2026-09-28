# FINAL AUDIT REPORT — Fable 5.1 — Proposal Engine OS — Public RC Baseline

**Date:** 2026-09-27T23:30Z
**Commit:** `5f66e09347e4314b592f9d008128e3b241e3b84e` on branch `remediation/proposalos-e2e` (DIRTY)
**Auditor:** Fable 5.1 — clean-room, dual-probe, evidence-bound
**Verdict:** **INTERNAL_ALPHA_ONLY**
**Gate reached:** G0 Baseline Accepted. G1 P0 Containment NOT reached. Public RC NOT READY.

---

## 1. Audit identity and conditions

Maximum reasoning, maximum context, no token/time constraint. Clean-room: no prior audit inherited. Read-only product/code audit. Evidence under `docs/audit/fable-5.1-rc-baseline/evidence/` with route/module/findings/rc-gates csvs and command transcripts. Branch dirty (28 modified, 10 untracked); Node v25.6.0 npm 11.8.0 Prisma 5.22.0 Postgres 15 Redis 7.

## 2. One-line verdict

Real, premium-ambition product with 27 real audit modules, evidence-bound proposal grounding, RLS isolation, and Stripe idempotency — but dirty HEAD with migration drift, 11 failing tests, 12 lint errors, and unmeasured UX/perf blocks RC. Fix is weeks-scale.

## 3. Executive summary

Typecheck 0, build pass, 147 routes + 58 pages + 23 crons, single canonical runner, manifest parity, RLS forced, proposal fingerprint gating, provider-resilient costs. Blockers are repo hygiene + boundary tests + supply chain, not architecture rewrite. Weighted ~6.0/10 (60/100).

## 4. What the product actually is

Agency-focused audit → diagnosis → tiered proposal → public share + PDF → Stripe acceptance. Three user modes implemented: internal agency, white-label agency (branding, domain, widget allowlist), public/free audit widget. Self-serve business owner is present but not RC-core. Claraud is second brand surface. Deployable is single Next.js standalone on Cloud Run.

## 5. Current release classification

**INTERNAL_ALPHA_ONLY** (50–64). Not CLOSED_BETA (65–74) until G1 green.

## 6. Weighted scorecard

See `00_EXECUTIVE_VERDICT.md`. Weighted ~6.0/10. Cannot reach 75+ with failing gates.

## 7. Top 10 release blockers

1. Migration drift businessLatitude/Longitude + locale_configs loss (P1).
2. 11 tests failing (ARCH boundaries + matrix + checkout authz).
3. 12 import/order lint errors.
4. npm uuid/protobufjs moderate vulns.
5. Dual pricing truth + metering thresholds drift.
6. SSRF allowlist miss (maps provider).
7. Auth boundary flags outreach webhook (needs allowlist).
8. No 5-industry proposal QA measured.
9. No responsive/a11y/mobile evidence.
10. No p50/p95/soak/billing smoke evidence.

## 8. Baseline command results

| Check | Result | Evidence |
|---|---|---|
| typecheck | PASS | evidence/commands/01_typecheck.txt |
| lint | 12e/1881w FAIL | 02_lint.txt |
| build | PASS | 03_build.txt |
| tests | 2744 pass 11 fail | 04_tests.txt + test-results |
| prisma validate | valid | 05_prisma.txt |
| audit | 7 vulns (1 low 6 mod) | 06_npm_audit.txt |

## 9–18. Domain verdicts

- **Architecture (6/10):** single runner canon, drift in 2 uncommitted migrations.
- **Security (6/10):** sig verify + CSP/CORS; boundaries failing.
- **Tenancy (7/10):** RLS forced, AsyncLocalStorage, hostile pair not run.
- **Authz (6/10):** RBAC 5 tiers, CRON_SECRET fail-closed; ~79 grep no-guard need manual triage.
- **Core audit (7/10):** 27 real, CostTracker + Redis reserve/settle, trustState, matrix needs green.
- **AI truthfulness (7/10):** grounding + fingerprint + adversarial QA + claimPolicy; live samples UNVERIFIED.
- **Premium UX (5/10):** UNVERIFIED — no screenshots/a11y.
- **Billing (6/10):** webhook dedup + idempotencyKey; catalog drift.
- **Reliability (4/10):** queue lease/timeouts/concurrency real; no soak/p95 measured.
- **Testing (6/10):** 261/266 suites green; boundaries are signal.
- **Compliance (5/10):** blocklist/unsubscribe/CAN-SPAM/footer; GDPR/SOC claims downgrade.

## 19. Full findings register

`02_FINDINGS_REGISTER.md` + `evidence/findings.csv` (3 P1 BROKEN, 8 P2 PARTIAL, 2 P3).

## 20. Public RC definition

`10_PUBLIC_RC_DEFINITION.md` — agency ICP, 27 modules with flags, Stripe live/test, p95 audit <5m, guarantees (0 P0, isolation proven, tokens 90d+revocation, prices = charged), known limits.

## 21. Recommended release package

**Package B — Recommended Premium RC:** keep 27 modules + evidence-bound proposals + Stripe saas/proposal + RLS + durable queue + outreach sandbox. Flag-off multi-currency PricingService, defer self-evolving prompts DB + Claraud separate brand. Best balance of polish/capability/time.

## 22. Workstreams and critical path

7 workstreams (WS1 hygiene → WS7 billing smoke). Critical path WS1→WS2→WS5 (LLM) →WS6. See `11_RC_EXECUTION_PLAN.md`.

## 23. Gate-by-gate execution plan

G0 reached → G1 (1–2d solo) → G2 (2–4d) → G3 (3–6d) → G4 (2–4d+24h) → G5 RC → G6 GA. Re-audit at each gate.

## 24. Dated RC and GA forecast

| Scenario | Earliest RC | Expected RC | Conservative RC | Earliest GA | Expected GA |
|---|---|---|---|---|---|
| Solo | 7d | 14d | 21d | 21d | 35d |
| 2eng+1des | 5d | 9d | 14d | 14d | 21d |
| 5-person | 4d | 7d | 10d | 10d | 17d |

Assumes no new P0 in pair/chaos; each adds 1–3d. Not commitments.

## 25. Risk register

Dirty tree, migration loss, unmeasured UX/perf, outreach live misconfig, LLM cost spikes (mitigated by 200¢ cap + Redis reserve).

## 26. Day-one RC operating plan

Deploy single image, enable feature flags accessibility/performance/seo/security per plan, enforce CRON_SECRET + STRIPE_WEBHOOK_SECRET + RESEND_WEBHOOK_SECRET, enable Redis, set OUTREACH_LIVE_SENDING false until DNS caps proven, arm KILL_SWITCH, monitor p95 + error budget + bounce >5% pause.

## 27. First-30-days monitoring

Audit success ≥95%, degraded <10%, p95 audit <5m, proposal QA telemetry weekly >5% alert, Stripe reconciliation daily, RLS violation alert, outbound caps 100/d tenant 5000 global, backup weekly + restore test.

## 28. Decisions required

See `13_DECISION_LOG_REQUIRED.md` (8 decisions — migrations, pricing canon, webhook URL, Claraud scope, prompts DB, outreach approval, module count honesty, locale_configs restore).

## 29. Final board-level statement

Proposal Engine OS would earn a "mature product built by an excellent, well-funded team" verdict after G1→G3 are closed and WS5/WS7 measured — and not before. Today it is an impressive internal alpha 7–14 days of focused repair away from a defensible public RC.

## 30. Audit limitations and unverified areas

No screenshots/responsive/a11y/keyboard, no 10-audit perf run, no Stripe test-mode money smoke on this HEAD, no hostile pair live, no backup/restore drill, no inbox deliverability live, no load/soak — all required before G5. Secret/history/license scans not run on this pass.

---

**Artifacts:** `00_` through `13_` + `evidence/` csvs + `evidence/commands/` transcripts. No fake evidence placeholders.

*Signature:* Fable 5.1 — would sign this under my name.
