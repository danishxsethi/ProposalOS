# Stage 1 — Production Go-Live Remediation Tasks

## Overview

This is the authoritative, checked-in source of truth for Stage 1 remediation tasks.
Each task maps to an issue tag used in commit messages. No production code lands
without binding to a task # in this file.

## Critical-Path Order

Proceed in sequence: 1.1 → 1.2 → 1.3 → … → 1.8 (prep + STOP) → 1.9 → … → 1.13.

## Tasks

| Task | Issue | What                                                                                      | Verification                                          | Status                                          |
| ---- | ----- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| 1.1  | #3    | Fix `auth-session-boundary` arch test (CI meta-blocker)                                   | `vitest run tests/architecture/` exit 0               | DONE (94a9a8d — post-rewrite SHA)               |
| 1.2  | #4    | Auth-guard `PATCH /api/proposal-status/status`                                            | unauth → 401; cross-tenant → 404                      | DONE (cf8e45f + 675710a)                        |
| 1.3  | #7    | Role-guard 4 admin routes (feature-flags, hallucination-telemetry, human-review, metrics) | non-admin session → 403; super-admin → 200            | TODO — re-verify needed (commit rewritten)      |
| 1.4  | #22   | Wrap `analytics/tenant/[tenantId]/metrics` in `runWithTenantAsync`                        | valid key → 200; wrong tenant → 403                   | TODO — re-verify needed (commit rewritten)      |
| 1.5  | #5    | Wire `urlValidator`/`safeFetch` into all 27 fetch paths                                   | metadata/private-IP throws; 0 raw `fetch(` in modules | DONE (797610c)                                  |
| 1.6  | #1    | Wire Stripe usage reporting + `stripeSubscriptionItemId` schema                           | usage appears in Stripe test dashboard                | DONE (3a3e0ef, meter event verified 2026-06-18) |
| 1.7  | #8    | Move `GlobalSpendTracker` to Redis `SharedStore`                                          | two processes share spend; cap enforced               | DONE (0072cd9 + withAuditBudget helper)         |
| 1.8  | #2    | Purge git-history secrets + rotate **(GATED — prep + STOP)**                              | `gitleaks --all` → 0                                  | DONE (certified --all → 0, 2026-06-18)          |
| 1.9  | #19   | Fix 2 critical CVEs                                                                       | `npm audit --audit-level=critical` → 0                | DONE (c6da2db; 0 critical, 17 high tracked)     |
| 1.10 | #10   | Replace 127 `console.*` with logger                                                       | grep prod paths → 0                                   | TODO                                            |
| 1.11 | #28   | Guard 2 `$executeRawUnsafe` paths with RLS context                                        | targeted RLS test green                               | TODO                                            |
| 1.12 | #9    | Make coverage gate real (>=80% or tracked waiver)                                         | `vitest run --coverage` exit 0                        | TODO — see Coverage Plan below                  |
| 1.13 | —     | Re-run 4 live smokes                                                                      | `smoke:phase-z` → 4/4                                 | TODO                                            |

## Rules

1. Every commit message references a task # from this table (e.g., `fix(auth): ... [#4]`).
2. No production code changes land as a "side effect" of test work — bind or revert.
3. Each task is verified by running the exact command in the Verification column red→green.
4. Tasks marked DONE are re-verified before downstream tasks proceed.
5. A green Postman/Newman run is NOT Stage 1 progress — it is baseline hygiene only.

## Excluded WIP (2026-06-18)

**`lib/audit-engine/`** (146 files, 85 tests) and **`lib/raos/`** (96 files, 57 tests) are
un-integrated RAOS spec WIP. They implement the Audit_System engine (code-quality evaluator
of this repo, not a customer feature) and the Remediation & Operations System (remediation
lifecycle, closure engine, drift runs). Neither supersedes committed code (`lib/audit/` is
the live customer audit runner). They carry 150 eslint errors + 13 tsc errors and are
excluded from CI scope and coverage as of 2026-06-18 via:

- `.gitignore` (prevents accidental commit)
- `vitest.config.ts` test `exclude` (prevents broken tests from running in `vitest run`)
- `vitest.config.ts` coverage `exclude` (prevents v8 counting them as 0%)

**Do NOT commit without first clearing all lint/tsc errors and binding to a task in this file.**

## Coverage Plan (Task 1.12)

**Current state (2026-06-18):**

- Coverage scope: `lib/**/*.ts` excluding `lib/raos/`, `lib/audit-engine/`, `lib/prisma.ts`, tests
- Source files in scope: ~355
- Configured threshold: 80% lines/branches/functions/statements
- Actual measured (fast tests only): ~8%
- Full suite (estimated): substantially higher, but never measured at 80%
- The 80% threshold was **never enforced** — `main` uses `test.yml` (no coverage);
  `ci-cd-pipeline.yml` (which has the coverage stage) doesn't gate PRs today

**Why the threshold is aspirational, not real:**

- The codebase grew around business features, not test-first coverage targets
- Many `lib/` files (billing, orchestrator, modules) are integration-heavy with DB/API deps
- Writing mocked unit tests for 355 files is multi-sprint work, not a toggle

**Interim plan (ratchet-up approach):**

1. **Phase 1 (immediate):** Lower threshold to a realistic passing baseline. Run the full
   suite with coverage once (long), capture the actual number, set threshold to
   `actual - 2%` as the floor. This makes the gate real without red-gating everything.
2. **Phase 2 (per-task):** Each new task landing in `lib/` must include tests that maintain
   or improve the floor. The threshold ratchets up by 1% per 5 commits (tracked here).
3. **Phase 3 (enforcement):** Once the ratchet reaches 60%, switch `test.yml` to run
   `test:coverage` on PRs. Target 80% as a long-term goal after the full pipeline
   (Stripe, Redis, SSRF) is wired and testable.

**Exit criterion for 1.12:** The coverage gate runs without erroring (`exit 0`) at a
threshold the codebase actually meets, with the ratchet-up documented and enforced
per-commit. "Real" means "red when someone drops coverage," not "aspirationally 80%."

## Lint Warnings (non-blocking, tracked)

As of 2026-06-18: **1666 warnings** on committed code (0 errors). Predominantly
`@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars`.
Non-blocking since eslint exits 0 with only warnings. Future cleanup ticket — not
Stage 1 scope, but do not let the count grow. Track quarterly.

## Tracked Security Residuals

### SSRF DNS Rebinding / TOCTOU (from Task 1.5)

**Status:** Open — tracked for Stage 2 (P2 hardening)
**Severity:** Medium (reduces but does not eliminate SSRF surface)
**Added:** 2026-06-18

**Description:** `validateUrl` resolves DNS at validation time; `fetch()` re-resolves at
connect time. An attacker with a DNS server returning TTL=0 can serve a public IP at
validation, then a private/metadata IP at connection (classic DNS rebinding). The
`redirect:'manual'` + per-hop re-validation closes the most common vector (open
redirect → metadata), but the TOCTOU window remains for direct rebinding attacks.

**Proper fix:** Pin the validated resolved IP for the actual TCP connection — either:

1. Use a custom `undici.Agent` dispatcher with `connect: { lookup }` that returns only
   the pre-validated IP (prevents re-resolution at connect time), OR
2. Use Node.js `dns.setServers` with a validating resolver that caches results for the
   connection lifetime.

**Target:** Stage 2 task (post-go-live hardening). The redirect-chain fix and scheme
blocking deployed in 1.5 are the priority controls; rebinding is a residual risk
requiring a lower-level fix. Do NOT overstate "SSRF hardened" — the safeFetch header
comment explicitly documents this limitation.

**Why not Stage 1:** The undici dispatcher approach requires testing against the full
module suite with real DNS, and risks breaking legitimate fetch behavior. The risk is
mitigated by: (a) cloud metadata services requiring specific headers (`Metadata-Flavor: Google`)
that safeFetch does not set, (b) short validation-to-connect window, (c) the redirect
chain closes the most exploitable path.
