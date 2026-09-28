# 00 — Executive Verdict — Fable 5.1 RC Baseline

**Date:** 2026-09-27T23:30Z
**Commit:** `5f66e09347e4314b592f9d008128e3b241e3b84e` (branch `remediation/proposalos-e2e`, DIRTY)
**Auditor:** Fable 5.1 — clean-room, maximum-reasoning audit
**Verdict: INTERNAL_ALPHA_ONLY**
**Gate reached:** G0 (Baseline Accepted). G1 not reached.

## One-line verdict

Proposal Engine OS has a coherent, ambitious architecture and real implementations for 27 audit modules, evidence-bound proposals, RLS tenant isolation, and Stripe billing — but the current HEAD is dirty with uncommitted schema drift, 11 failing tests, 12 lint errors, and 7 moderate npm advisories. It is not RC-ready. With contained fixes it can reach a credible Public RC.

## Weighted scorecard

| Domain | Weight | Score | Evidence |
|---|---|---|:---:|
| Product coherence | 8% | 7 | Clear ICP (agencies selling audits→proposals), but multiple product stories (Claraud widget/white-label vs ProposalOS core) coexist |
| Architecture | 8% | 6 | Single canonical runner (27 modules, 3-phase, concurrency 6, timeout hierarchy) but 2 uncommitted migrations + locale_configs drop on db push |
| Security | 10% | 6 | RLS + Svix/Stripe sig verify + CSP/CORS; but auth/session boundary test FAIL, SSRF allowlist FAIL, npm uuid/protobufjs open |
| Tenancy / isolation | 10% | 7 | Prisma $extends + SET LOCAL tx + AsyncLocalStorage; ~62 tenantId models; RLS policies forced; needs prove with hostile pair |
| Auth / authz | 7% | 6 | JWT+DB session 1h, RBAC 5 tiers, pe_live_ SHA256 scopes; 23 cron via CRON_SECRET; ~79 routes have no explicit guard string (by-design public vs need review) |
| Core audit correctness | 10% | 7 | 27 real providers, CostTracker + Redis reserve/settle, dedup by fingerprint, trustState TRUSTED/DEGRADED; matrix tests failing |
| AI truthfulness / proposal | 10% | 7 | Grounding claims + publicationFingerprint SHA256 + adversarial QA + claimPolicy; hallucination gate high-severity blocks; needs 5-industry live samples |
| Premium UX | 10% | 5 | UNVERIFIED in this audit (no screenshots at 320/375/768/1024/1440, no a11y run, no keyboard/contrast) |
| Billing correctness | 5% | 6 | Stripe webhook idempotency + ProcessedWebhookEvent dedup + checkout idempotencyKey; dual pricing catalog + metering threshold drift |
| Reliability / perf | 7% | 4 | UNVERIFIED — no 10-audit/5-industry run, no p50/p95/cost, no soak/rollback proven on this HEAD |
| Testing / confidence | 7% | 6 | 266 suites, 2744 pass / 11 fail / 80 skipped; 233 pass on clean DB before; boundary tests are the signal |
| Operations / observability | 5% | 5 | 23 crons, DLQ, metering sweep, reconcile cron; no dashboard/alert/in-runbook verification in this audit | 
| Compliance / trust | 3% | 5 | EmailBlocklist + unsubscribe + CAN-SPAM footer + warmup caps; GDPR/log scrubbing/SOC claims UNVERIFIED |

**Weighted total: ~6.0/10 → 60/100 (INTERNAL_ALPHA, 50–64).** Hard gates fail (G1).

## Why not RC

- **G1 hard gate:** dirty working tree + 11 test failures + 12 lint errors + migration drift must be zero before RC.
- **G2 gate:** no measured 5-industry proposal QA (need avg ≥85, none <80) and module matrix tests failing.
- **Security gate:** auth-session and SSRF boundary tests failing on dirty branch.
- **Supply chain:** 6 moderate advisories (uuid, protobufjs) before public release declaration.

## What is actually true (verified)

- `npm run typecheck` → 0 errors. `npm run build` → success (standalone).
- 147 API routes, 58 pages, 23 crons — census captured.
- Runner `lib/audit/runner.ts:960 MODULE_REGISTRY` 27 modules, `packages/shared/src/audit.ts:87 CANONICAL_AUDIT_MODULE_IDS[27]` manifest, parity enforced by test.
- Tenant isolation via `lib/prisma.ts` $extends + `lib/tenant/context.ts` AsyncLocalStorage + RLS ENABLED/FORCED on 62 models.
- Proposal publication blocked unless `assertProposalPublishable` passes grounding + fingerprint + eval PASS + hardFailures[].

## Top 3 risks if shipped today

1. Customers hit dirty-branch behavior that tests already flag.
2. Uncommitted migrations mean fresh deploy diverges from test DB that needed `db push` + data drop.
3. Unknown UX/a11y/perf because not measured on this HEAD.

## Next step

Close G1: commit or discard working-tree changes, fix lint allowlists, update snapshots or code to make 11 tests green, resolve uuid/protobufjs, re-bootstrap clean DB without data loss. Then re-run Fable 5.1 Sections 7/8/10 with live samples before claiming RC.

*Board sentence:* Proposal Engine OS is real product with real engineering, and the remaining path to a defensible public RC is measured in weeks not quarters — but it must not be called RC until the dirty tree, failing boundary tests, and migration drift are closed and proposal quality plus performance are measured.
