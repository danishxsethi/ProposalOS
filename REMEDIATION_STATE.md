# ProposalOS Remediation Campaign — State

Source of truth: `AUDIT_REPORT.md` (immutable). Control artifacts: this file,
`REMEDIATION_FINDINGS.json`, `REMEDIATION_VERIFICATION.md`. Branch: `remediation/proposalos-e2e`.

Last updated: end of Wave 0.

## Campaign objective

All legitimate ProposalOS capabilities fully implemented, secured, tested, wired through one
durable canonical execution architecture, and verified end to end.

## Non-negotiable product decisions (already approved)

1. Ship all legitimate audit modules fully built and functional.
2. Use one canonical full audit engine.
3. Migrate all asynchronous audit entry points to the durable AuditJob queue.
4. Scheduled audits must use the canonical engine.
5. The widget may use a documented fast subset only if: selected through the canonical engine;
   findings/evidence remain contract-compliant; no fabricated score or top issue; UI clearly
   labels it a quick audit.
6. No customer-facing finding may persist without real evidence.
7. Provider/browser/LLM failure must never become verified absence or a customer deficiency.
8. No customer-facing legal certification or definitive legal advice.
9. Both frontends must meet equivalent auth, tenancy, CI, and security guarantees while deployed.
10. Marketing latency/cost/coverage claims must be based on measured full-flow results.

## Baseline (Phase C)

- Branch: `remediation/proposalos-e2e`; HEAD at campaign start: `3cd069f`.
- Wave 0 commits: `a040450` (fix), `aa9765c` (artifacts).
- Wave 1 commits: `81024eb` (fix).
- TypeScript baseline: `tsc --noEmit --pretty false --incremental false` → **exit 0** (clean)
  across the entire working tree (both change groups below).
- **Pre-existing dirty tree (68 files) — two distinct groups. Preserve both; commit only the
  wave's own files.**
  - **Group 1 — Wave 0 security work** (prior uncommitted session; verified and committed this
    wave): `lib/auth/rbac.ts`, `lib/auth/apiKeys.ts`, `lib/middleware/auth.ts`,
    `lib/modules/security.ts`, `app/api/team/invite/route.ts`,
    `app/api/team/invite/[token]/accept/route.ts`,
    `app/api/tenants/[tenantId]/delete-data/route.ts`, `app/api/settings/api-keys/route.ts`,
    plus untracked `tests/security/wave0-*.test.ts` (5 files).
  - **Group 2 — UNRELATED logger-typing work** (~46 files): `lib/logger.ts` (adds `AppLogger`
    message-first type overload) + ~45 route files each with a single
    `+import { logger } from '@/lib/logger';` line. Leftover from the console→logger migration
    (commit `92421f7`). **NOT part of any wave; left uncommitted, untouched.** Also uncommitted:
    `lib/audit/runner.ts`, `lib/observability/auditTrail.ts`,
    `lib/self-evolving-prompts/data-access/prompt-performance.ts`, `app/api/cron/metering-sweep/route.ts`.
  - `AUDIT_REPORT.md` shows as "modified" because the working-tree 4006-line adversarial audit
    replaces a stale 224-line committed report. **The working-tree copy IS the source of truth.**
    Do not revert it. **It is intentionally left UNCOMMITTED and unstaged**: the repo's
    `lint-staged` runs `prettier --write` on any staged `.md`, and prettier confirmedly reformats
    this file — staging it would mutate the immutable audit evidence. It is preserved on disk in
    this workspace; a resuming session reads it from the working tree. **Never stage
    `AUDIT_REPORT.md` while the prettier lint-staged rule is active** (would require `--no-verify`,
    which is disallowed). If a clean checkout is ever needed, copy the working-tree file aside
    first.
- Untracked helper `scripts/show-leaks.js` (from prior gitleaks work) — not staged.

## Findings normalization (Phase A)

- 107 finding rows normalized into `REMEDIATION_FINDINGS.json`: **8 P0, 44 P1, 55 P2**.
- Numbering gaps `P0-01..P0-18` and `P1-10..P1-13` are **not rows** in this report (prior/other
  numbering) — intentionally absent, not fabricated.
- **P2-26 superseded**: the "orphan file `websiteCrawlerModule.ts`" claim is retracted by an
  in-report self-correction (line 1450); the file is imported by `runner.ts:52`. The real concern
  is the duplicate crawl (P1-27). Not scheduled as an active defect.
- **P0-24 retained**; P2-52 widened its blast radius (reachable in both engines). Both resolved
  together by the single shared `fetchWithRedirect` fix.

## Root-cause groups

- **A** Immediate security containment
- **B** Tenant isolation and DB-role safety
- **C** Canonical audit engine and durable queue convergence
- **D** Finding/Evidence contract enforcement
- **E** Module adapter/result-shape correctness
- **F** Replace production stubs/placeholders/fabricated fallbacks
- **G** Network/SSRF/browser safety
- **H** Provider-state and failure normalization
- **I** Shared crawl/provider reuse and cost accounting
- **J** LLM/prompt-injection/schema validation
- **K** Auth authority and frontend parity
- **L** Billing/webhook/idempotency integrity
- **M** Test harness and module contract coverage
- **N** Observability, deployment, and CI
- **O** Runtime measurement and marketing reconciliation
- **P** P2 cleanup and documentation

## Open audit work (not defects)

The audit itself is incomplete beyond Pass 4C.1. The following passes are **unfinished audit
work**, tracked so a later wave can complete them; they are NOT confirmed defects:

- Pass 4C.2 — cost controls, persistence, idempotency, result integrity.
- Pass 4C.3 — browser-navigation SSRF interception + timeout-signal propagation.
- Passes 5–20 — proposal compiler/claim policy, diagnosis, delivery/outreach/closing/retention,
  billing/metering/webhooks, multi-tenancy/white-label/frontend, LLM/prompt security/cost
  governance, observability/infra/CI, adversarial QA, runtime certification, docs/marketing
  reconciliation, final GO/NO-GO.

## Remediation waves

| Wave | Theme                                          | Findings                                                                                                              | Groups | Status                           |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| 0    | Emergency security containment                 | P0-19, P0-20, P0-21, P0-24, P1-14, P1-16, P2-52                                                                       | A, G   | **VERIFIED / COMMITTED**         |
| 1    | Tenant & auth foundation                       | P1-05, P1-06, P1-07, P1-15, P1-17, P1-18, P2-07, P2-18, P2-22, P2-23                                                  | B, K   | **COMPLETE — see Wave 1 result** |
| 2    | Canonical engine + durable job execution       | P0-22, P0-23, P1-03, P1-20, P1-21, P1-22, P1-23, P1-24, P2-08, P2-12, P2-24, P2-25                                    | C      | **COMPLETE — see Wave 2 result** |
| 3    | Finding/Evidence enforcement layer             | P1-09, P1-25, P1-26, P1-31, P2-13, P2-36, P2-40                                                                       | D      | **COMPLETE — see Wave 3 result** |
| 4    | Shared network/browser/provider safety         | P1-46, P1-47, P1-48, P2-53, P2-54                                                                                     | G      | **COMPLETE — see Wave 4 result** |
| 5    | Module adapter & failure-state repair          | P1-28, P1-33, P1-34, P1-39, P1-43, P2-28, P2-47                                                                       | E, H   | open                             |
| 6    | Fully implement broken/missing modules         | P0-25, P1-30, P1-37, P1-41, P1-42, P2-30                                                                              | F      | open                             |
| 7    | Harden remaining partial modules               | P1-27, P1-29, P1-32, P1-35, P1-38, P2-27, P2-31, P2-32, P2-34, P2-35, P2-38, P2-41, P2-42, P2-43, P2-44, P2-46, P2-50 | I, H   | open                             |
| 8    | Diagnosis + proposal claim-policy enforcement  | P0-26, P1-36, P1-40                                                                                                   | F      | open                             |
| 9    | Delivery/outreach/closing/retention pipelines  | (Passes 9-12 audit work)                                                                                              | —      | open                             |
| 10   | Billing, metering, webhook, unit economics     | P1-08, P2-21                                                                                                          | L      | open                             |
| 11   | Multi-tenancy/white-label/frontend convergence | P1-01, P1-19, P2-10, P2-11, P2-15, P2-20                                                                              | K      | open                             |
| 12   | LLM layer, prompt security, cost governance    | P1-45, P2-37, P2-49                                                                                                   | J      | open                             |
| 13   | Observability, infrastructure, CI              | P1-02, P1-44, P2-04, P2-09, P2-14, P2-19                                                                              | N      | open                             |
| 14   | Complete tests, adversarial fixtures, coverage | P2-29, P2-33, P2-39, P2-45, P2-48, P2-51, P2-55                                                                       | M      | open                             |
| 15   | Controlled end-to-end runtime certification    | (Pass 4C.2/17 runtime)                                                                                                | O      | open                             |
| 16   | Documentation & marketing reconciliation       | P1-04, P2-06                                                                                                          | O, N   | open                             |
| 17   | Final re-audit & GO/NO-GO + P2 hygiene         | P2-01, P2-02, P2-03, P2-05, P2-16, P2-17                                                                              | P      | open                             |

Wave assignments beyond the current wave are provisional and refined on wave entry. Each wave, on
entry, must record: included findings + unfinished passes, files in scope, prerequisites,
acceptance criteria, exact verification commands, rollback strategy, and expected commit boundary.

### Wave 1 entry notes (for next session)

- **Prerequisites:** none beyond Wave 0.
- **Scope:** tenant-isolation and DB-role safety (unscoped `lib/db.ts`, RLS role confirmation,
  claraud-web connection/parameterization), unauthenticated `/api/predictions`, login rate limit.
- **Product/operator inputs likely needed:** prod `DATABASE_URL` role (app_user vs superuser)
  for P1-05/P1-06; claraud-web same-DB-or-not for P1-07/P1-18.
- **Carry-over from Wave 0:** `app/api/auth/register/route.ts` writes `role:'owner'`, which is
  NOT in `ROLE_HIERARCHY`; `normalizeRole` now returns `undefined` for it (fail-closed). Confirm
  self-registration writes a valid `Role` (e.g. `agency_admin`) or add `owner` to the hierarchy —
  address as part of P2-07/P1-14 follow-through so self-registered owners are not locked out.
- **Rollback:** all Wave 1 changes isolated to their own commit; revert the commit.

## Regression status

- TypeScript (`tsc --noEmit`): green (exit 0).
- Wave 0 targeted tests: 32/32 pass.
- ESLint on Wave 0 files: 0 errors (9 pre-existing style warnings).
- Full suite NOT run this wave (per IDE-safety rule 6/7 — targeted first). Full-suite gate owed at
  a later coherent checkpoint.

## Unresolved decisions (carried, not blocking Wave 0)

- P1-16: retire env `API_KEY` fallback vs keep (containment applied regardless).
- P1-22/P1-23: single owner of scheduled audits (cron `AuditOrchestrator` vs retention path).
- P1-08: financial/audit-record retention vs GDPR cascade (owned by Wave 10).
- P1-19: claraud-web SSO vs separate account system.

## Next wave

**Wave 2 — Canonical audit engine and durable job execution.** See continuation prompt in
`REMEDIATION_VERIFICATION.md` and the Wave 1 result block below.

## Wave 1 result summary (Tenant & authentication foundation)

- **Verified:** P1-05 (unscoped root Prisma client — full architectural fix, 8/8 callers
  migrated), P1-14 (re-verified + a critical escalation it uncovered fixed — see below),
  P1-15 (login rate limiting), P1-17 (predictions route authz/tenant-scoping), P2-07
  (re-verified from Wave 0, no duplicate work), P2-18 (self-evolving executor fail-closed
  default), P2-22 (trusted-proxy IP extraction).
- **Fixed (code changed, full acceptance criteria not exhaustively verified):** P1-06
  (repository-side fail-fast DB-role guard added; live production role confirmation is
  an operator fact, recorded BLOCKED below).
- **Still open (fixed but not fully verified — operator fact blocked):** P1-06
  (repository-side fail-fast DB-role guard added; live production role confirmation is
  an operator fact, recorded BLOCKED below).
- **Completed in the Wave 1 continuation session (2026-07-11):** P1-07, P1-18
  (claraud-web tenant-scoping client — full rewrite of `claraud-web/src/lib/prisma.ts`;
  see `REMEDIATION_VERIFICATION.md`'s "Wave 1 continuation" section), P2-23
  (registration enumeration response + audit-trail criticality classification extended
  to cover tenant-deletion and role-change events).
- **New findings discovered and logged:** P2-56 (latent type debt uncovered by removing
  the `any`-typed client, in `signalDetector.ts`/`tenantConfig.ts` — preserved exact
  prior runtime behavior via a documented `as any` cast rather than blind-fixing under
  time pressure), P2-57 (5 more duplicate/spoofable client-IP-extraction sites beyond
  the 2 fixed in `rateLimit.ts`).
- **Critical fix (not a pre-planned finding, discovered during P2-07 reverification):**
  `LEGACY_ROLE_VALUES.owner` mapped to `'super_admin'` — every self-registered tenant
  admin (`role:'owner'`) was normalizing to **platform-wide super_admin** via the very
  `normalizeRole()` Wave 0 shipped and verified. Fixed to `agency_admin`; self-registration
  now writes `agency_admin` directly. Proven closed by
  `tests/security/wave1-owner-role-escalation.test.ts`. This should be flagged to the
  team as a severe finding that shipped in Wave 0 and was caught one wave later — a
  fresh Wave 2 session should sanity-check other `LEGACY_ROLE_VALUES`/role-mapping
  tables for similar mistakes if time allows.

### Operator-blocked facts (Wave 1)

1. **P1-06:** confirm the live production `DATABASE_URL` connects as a restricted
   application role (e.g. `app_user`), not `postgres`/a superuser or BYPASSRLS role.
   Read-only check: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname
= current_user;` run against the production connection. `lib/config/dbRoleGuard.ts`'s
   `assertSafeDbRole()` automates this check but is not yet wired into a startup probe.
2. **P1-07/P1-18:** the code defect itself (wrong connection, unparameterized SQL, no
   fail-closed default) is now fully fixed and tested (Wave 1 continuation,
   2026-07-11) — this is no longer blocked. The separate, purely factual question of
   whether claraud-web's database is the SAME physical Postgres instance as the root
   app's was already recorded BLOCKED in Pass 2/3 of the audit and remains
   unconfirmed; it does not affect the fix's correctness (the tenant-scoping client is
   now structurally sound regardless of which physical database it points at).

### Unresolved decisions (Wave 1, carried forward)

- Whether to also review `app/api/tenants/route.ts` and
  `lib/tenant/TenantProvisioningService.ts` (both still write `role:'owner'` literally)
  — no fix needed there since the shared `LEGACY_ROLE_VALUES` mapping fix covers all
  read sites uniformly, but a future wave may want to normalize the write sites to
  write `'agency_admin'` directly for clarity.

## Wave 1 completion continuation — Wave 2 WIP isolated via scoped stash (2026-07-11)

Resumed from HEAD `dc6591a` (branch `remediation/proposalos-e2e`). Prior session had, after
committing the Wave 1 checkpoint (`9c20648`) and a follow-up architecture-test fix (`dc6591a`),
begun unauthorized Wave 2 work (canonical audit engine / durable `AuditJob` queue migration —
explicitly commented `P1-22/P1-23`, `P1-24`, `P0-22/P0-23`, `P2-25` in the diffs) and was
terminated mid-edit with a broken build.

### Stash isolation

- **Stash ref:** `stash@{0}`
- **Stash name/message:** `proposalos-wave2-wip-before-wave1-completion-2026-07-11`
- **Base HEAD at stash time:** `dc6591a8484019b61f2d4e02145190513ee68f28`
- **Untracked files included:** yes — exactly one, `lib/audit/dispatch.ts` (new file, part of the
  verified Wave 2 WIP set). `git stash push -u -- <pathspec>` was used so only untracked files
  matching the explicit pathspec were swept in; the other untracked file present at the time,
  `scripts/show-leaks.js` (unrelated prior gitleaks helper), was correctly excluded.
- **Exact file list stashed (16 files):**
  - `app/api/audit/route.ts`
  - `app/api/client/scan/route.ts`
  - `app/api/cron/scheduled-audits/route.ts`
  - `app/api/public/audit/route.ts`
  - `app/api/v1/audit/route.ts`
  - `app/api/worker/audit-job/route.ts`
  - `cron.yaml`
  - `lib/audit/modules.ts`
  - `lib/audit/runner.ts`
  - `lib/config/feature-flags.ts`
  - `lib/orchestrator/auditOrchestrator.ts`
  - `lib/orchestrator/index.ts` (deleted in WIP)
  - `lib/outreach/sprint2/sniperWorker.ts`
  - `lib/retention/scheduled-audit-runner.ts`
  - `packages/shared/src/audit.ts`
  - `lib/audit/dispatch.ts` (untracked/new)
- **`git stash show --stat stash@{0}`:**
  ```
   app/api/audit/route.ts                  |  41 ++--
   app/api/client/scan/route.ts            |  24 +++
   app/api/cron/scheduled-audits/route.ts  | 321 ++------------------------------
   app/api/public/audit/route.ts           |  37 ++--
   app/api/v1/audit/route.ts               |  35 ++--
   app/api/worker/audit-job/route.ts       |  85 +++++++--
   cron.yaml                               |  20 ++
   lib/audit/modules.ts                    |  11 +-
   lib/audit/runner.ts                     |  35 +++-
   lib/config/feature-flags.ts             |  31 +--
   lib/orchestrator/auditOrchestrator.ts   |   2 +-
   lib/orchestrator/index.ts               | 113 -----------
   lib/outreach/sprint2/sniperWorker.ts    |   6 +-
   lib/retention/scheduled-audit-runner.ts | 281 +++++++++++++++++++++-------
   packages/shared/src/audit.ts            |  32 +++-
   15 files changed, 496 insertions(+), 578 deletions(-)
  ```
  (16th file, `lib/audit/dispatch.ts`, is untracked and not shown by `--stat` but is present in
  the stash's untracked-files tree — confirmed via `git stash show -p` / `git show stash@{0}^3`.)
- **Explicitly NOT stashed (preserved untouched in the working tree, per instruction):**
  `AUDIT_REPORT.md`; the ~46 single-line `+import { logger } ...` route files; `lib/logger.ts`;
  `lib/observability/auditTrail.ts`; `lib/self-evolving-prompts/data-access/prompt-performance.ts`
  (pre-existing unrelated timestamp/parameterization fix, not Wave-2-themed);
  `app/api/cron/metering-sweep/route.ts` (pre-existing unrelated `await` fix, not Wave-2-themed);
  `scripts/show-leaks.js`; `REMEDIATION_STATE.md` / `REMEDIATION_FINDINGS.json` /
  `REMEDIATION_VERIFICATION.md` (already committed/clean).
- **Verification post-stash:** `git status --short` confirms none of the 16 files remain dirty;
  `git diff HEAD -- lib/audit/runner.ts` (and each other stashed file) is empty, confirming exact
  restoration to committed HEAD content.

### Gate result after isolation — STOPPED, new pre-existing defect surfaced (not caused by the stash)

```
$ ./node_modules/.bin/tsc --noEmit --pretty false --incremental false
lib/audit/runner.ts(1128,39): error TS2353: Object literal may only specify known properties,
and 'error' does not exist in type '(Without<AuditUpdateInput, AuditUncheckedUpdateInput> &
AuditUncheckedUpdateInput) | (Without<...> & AuditUpdateInput)'.
(exit 2)
```

This is **not** part of the Wave 2 WIP just isolated (`git diff HEAD -- lib/audit/runner.ts` is
empty — the file is byte-identical to the committed `dc6591a` blob). It is a latent, pre-existing
type error in the code Wave 1 itself committed: `runAudit()`'s `BUDGET_EXCEEDED` branch writes
`data: { status: 'FAILED', error: 'BUDGET_EXCEEDED', completedAt: new Date() }` to `prisma.audit.update`,
but the `Audit` model (per `prisma/schema.prisma`, unchanged since `63d40dc`, 2026-05-30) has no
`error` field — only `modulesFailed: Json`. Confirmed this is not a stale-Prisma-client artifact:
`node_modules/.prisma/client` was generated 2026-05-30, matching the schema's last-change date;
schema itself is clean (`git status --short prisma/schema.prisma` empty).

This means `REMEDIATION_VERIFICATION.md`'s Wave 1 "final gates: tsc exit 0" claim was only true of
the _working tree at that moment_, which already silently contained an early, uncommitted version
of the now-stashed Wave 2 fix for this exact line (the Wave 2 WIP's `runner.ts` hunk replaces this
same `error: 'BUDGET_EXCEEDED'` line with a schema-valid `modulesFailed: [...]` array) — the bug
was masked by unrelated, uncommitted, unauthorized work at verification time and never actually
fixed or covered by a committed regression test. **Per instruction, stopping here rather than
patching `lib/audit/runner.ts` unilaterally** — this file is outside the Wave 1 finding set
(P1-05/06/07/15/17/18, P2-07/18/22/23) and fixing it is a judgment call (either revert to the
schema-correct field, or treat as a small pre-existing-defect fix) that should be confirmed before
editing.

### Status: Wave 1 remaining work (P1-07/P1-18, P2-23) NOT YET STARTED this continuation

Blocked on resolving the above pre-existing `runner.ts:1128` type error first, since the
mandatory whole-tree `tsc --noEmit` gate must be green before/after the remaining Wave 1 fixes.

### Baseline-repair commit (2026-07-11, follow-up to the stash isolation above)

- **Fix:** `lib/audit/runner.ts`'s `BUDGET_EXCEEDED` branch now writes
  `modulesFailed: [...existing, { module: 'budget', error: 'BUDGET_EXCEEDED' }]` instead of the
  schema-invalid `error: 'BUDGET_EXCEEDED'` scalar field; merges rather than overwrites any
  pre-existing `modulesFailed` entries on the row. No Prisma schema change.
- **New test:** `tests/security/wave1-baseline-budget-exceeded-write.test.ts` (2/2 pass).
- **Gates:** `tsc --noEmit` exit 0; `eslint` on the 2 changed files — 0 errors, 39 pre-existing
  warnings (0 new); 15-file/81-test targeted regression run — all green. Full detail in
  `REMEDIATION_VERIFICATION.md`'s "Correction to the Wave 1 final gates tsc result" section.
- **Stash status:** `stash@{0}`
  (`proposalos-wave2-wip-before-wave1-completion-2026-07-11`) — **unchanged, not applied, not
  popped, not dropped**. Re-verified via `git stash show --stat stash@{0}` immediately after this
  fix; output identical to the isolation record above.
- **Commit:** `fix(audit): persist budget-exceeded failure in valid schema` (code + test, isolated
  from Wave 1's own tenant/auth commits and from the stashed Wave 2 WIP).
- **Next:** resume and complete the two remaining Wave 1 findings (P1-07/P1-18, P2-23) from this
  now-clean baseline.

## Wave 1 — FINAL result (continuation session, 2026-07-11)

All 10 Wave 1 findings resolved:

- **Verified (9):** P1-05, P1-07, P1-15, P1-17, P1-18, P2-07, P2-18, P2-22, P2-23.
- **Fixed, operator-fact blocked (1):** P1-06 — repository-side fail-fast DB-role guard
  shipped and tested; the live production `DATABASE_URL` role cannot be confirmed from the
  repository (see the exact read-only SQL check recorded above).

Plus one out-of-plan baseline repair, isolated and committed separately from the Wave 1
finding set: `lib/audit/runner.ts`'s `BUDGET_EXCEEDED` branch wrote a schema-invalid `error`
column; fixed to use `modulesFailed` (commit `2f94df6`).

New findings discovered this wave, logged (none block Wave 1 closure): P2-56, P2-57 (from
the first continuation session), P2-58, P2-59, P2-60 (from this session) — all low-priority,
inert, or explicitly out-of-scope product decisions, recorded in
`REMEDIATION_FINDINGS.json`.

### Wave 2 WIP stash — still isolated, untouched

`stash@{0}` (`proposalos-wave2-wip-before-wave1-completion-2026-07-11`) remains exactly as
recorded earlier in this file: 15 tracked files + `lib/audit/dispatch.ts` (untracked),
representing an unauthorized, incomplete Wave 2 (canonical audit engine / durable job
queue) excursion from a prior terminated session. **Not applied, popped, or dropped at any
point in this Wave 1 work.** A fresh Wave 2 session must inspect it before applying.

## Next wave

**Wave 2 — Canonical audit engine and durable job execution.**

## Wave 2 result summary (Canonical audit engine and durable job execution)

Resumed from an entry state that contradicted its own control-artifact record just above
("still isolated, untouched"): the actual working tree already contained a near-complete
Wave 2 implementation from an interrupted prior session (stash applied and substantially
extended: full 27-module canonical manifest, dispatch layer, lease/heartbeat queue, Prisma
migration, new tests) plus an unresolved 3-way git-index conflict in `lib/audit/runner.ts`
(the working-tree content itself had no conflict markers — a manual resolution had been
made but never staged). Full reconciliation, review, and gap-fixing detail is in
`REMEDIATION_VERIFICATION.md`'s "Wave 2" section.

- **Verified (11):** P0-22, P0-23, P1-03, P1-20, P1-21, P1-22, P1-23, P1-24, P2-08, P2-24,
  P2-25.
- **Fixed, environmentally blocked (1):** P2-12 — lease/heartbeat code, schema migration,
  and unit tests complete; empty-database migration replay blocked by no local Postgres in
  this sandbox (`localhost:5435` connection refused — same class of environment limitation
  recorded for P1-06 in Wave 1).

### Canonical architecture after Wave 2

1. **Module source of truth:** `packages/shared/src/audit.ts::CANONICAL_AUDIT_MODULES` (27
   modules: id/phase/dependsOn/optional/timeoutMs/rolloutFlag). Enforced against
   `lib/audit/runner.ts::MODULE_REGISTRY` by
   `tests/architecture/canonical-module-manifest.test.ts`. The old 5-module
   "CANONICAL_MODULES" was renamed `CRITICAL_COMPLETION_MODULES` with a doc comment; it is
   a completeness-guardrail subset, not a competing full list. The 14-module
   `AuditOrchestrator` list survives only inside the deprecated, non-production-reachable
   class.
2. **Execution engine:** `lib/audit/runner.ts`'s `executePhase()`/`MODULE_REGISTRY` is the
   only production engine. `runModuleSubset()` runs a named subset through the identical
   path. `AuditOrchestrator` has zero production callers; its dead wrapper
   (`lib/orchestrator/index.ts`) is deleted.
3. **Durable dispatch:** `lib/audit/dispatch.ts::dispatchAuditExecution()` is the one
   shared enqueue entry point (idempotent, `batchId === auditId`), used by every
   audit-creation surface: `/api/audit`, `/api/v1/audit`, `/api/public/audit`,
   `/api/client/scan`, the outreach sniper worker, and scheduled/retention re-audits.
4. **Scheduled-audit owner:** `lib/retention/scheduled-audit-runner.ts::processScheduledAudits()`,
   called by both `app/api/cron/scheduled-audits/route.ts` and
   `lib/graph/retention-graph.ts`'s `run_scheduled_audits` node; atomic claim via
   conditional `updateMany` prevents double-dispatch of the same due occurrence.
5. **Widget quick-audit:** `EXECUTION_PROFILES.QUICK_AUDIT` (`website`+`gbp`), executed via
   `runModuleSubset()`; score/topIssue derive from real normalized findings, no
   fabrication.
6. **Feature flags:** `lib/config/feature-flags.ts::getEffectiveFeatureFlags()`/
   `isFeatureEnabledEffective()` is the one DB-override-aware read path, used by both the
   admin API and `MODULE_REGISTRY`'s gating — an admin toggle now has a real, tested effect
   on execution (previously it only changed the admin API's own GET response; found and
   fixed during this session's own verification, beyond the inherited WIP).
7. **Job lease/heartbeat:** `AuditJob.leaseOwner/leaseToken/leaseExpiresAt/lastHeartbeatAt`
   (additive migration); atomic claim, owner-bound heartbeat/complete/fail, stale-lease
   reclaim, rejected late completions from a superseded worker.

### Files changed (Wave 2, beyond the already-tracked Wave 0/1 unrelated groups)

`app/api/audit/route.ts`, `app/api/v1/audit/route.ts`, `app/api/public/audit/route.ts`,
`app/api/client/scan/route.ts`, `app/api/cron/scheduled-audits/route.ts`,
`app/api/worker/audit-job/route.ts`, `app/api/widget/quick-audit/route.ts`,
`app/api/admin/feature-flags/route.ts`, `lib/audit/dispatch.ts` (new),
`lib/audit/modules.ts`, `lib/audit/runner.ts`, `lib/config/feature-flags.ts`,
`lib/orchestrator/auditOrchestrator.ts`, `lib/orchestrator/index.ts` (deleted),
`lib/outreach/sprint2/sniperWorker.ts`, `lib/pipeline/stages/auditStage.ts`,
`lib/queue/auditJobQueue.ts`, `lib/queue/auditJobWorker.ts`,
`lib/retention/scheduled-audit-runner.ts`, `packages/shared/src/audit.ts`, `cron.yaml`,
`prisma/schema.prisma`, `prisma/migrations/20260711120000_audit_job_lease_heartbeat/` (new),
`tests/architecture/canonical-module-manifest.test.ts` (new),
`tests/security/audit-job-lease-heartbeat.test.ts` (new),
`tests/security/feature-flag-effective-override.test.ts` (new),
`tests/security/widget-graceful-degradation.test.ts`,
`tests/security/widget-origin-allowlist.test.ts`, `tests/integration/audit-api.test.ts`,
`tests/security/batch-queue-worker.test.ts`.

### Stash disposition

`stash@{0}` (`proposalos-wave2-wip-before-wave1-completion-2026-07-11`) — **dropped** this
session after full review/verification (see `REMEDIATION_VERIFICATION.md` for the exact
reasoning; the working tree had already superseded it and had zero remaining dependency on
it).

### Known out-of-scope pre-existing issue (not touched)

`lib/modules/__tests__/auditOrchestrator.test.ts` times out (30s) — predates this campaign
entirely (zero Wave 0/1/2 changes to that file), mocks the wrong GBP export name and only 2
of ~14 modules, so the rest attempt real network calls with no credentials. Deprecated
component, unrelated to any Wave 2 finding; left for whichever future wave addresses
`AuditOrchestrator`'s eventual deletion.

## Next wave

**Wave 3 — Finding/Evidence contract enforcement.** See the exact continuation prompt at
the end of `REMEDIATION_VERIFICATION.md`'s Wave 2 section / the final chat response of this
session.

## Wave 3 result summary (Finding/Evidence contract enforcement)

### Entry-state verification (this session)

- Branch `remediation/proposalos-e2e`; HEAD `a0fba244` = documented Wave 2 checkpoint
  (`chore(remediation): checkpoint wave 2`), with `fix(audit-engine): consolidate
canonical engine and durable job execution` directly beneath it. Confirmed via
  `git log --oneline -12`.
- `git stash list` — empty, matching the documented "Wave 2 stash dropped" disposition.
- Dirty working tree exactly matched the documented baseline (AUDIT_REPORT.md,
  logger-typing group, `prompt-performance.ts`, `metering-sweep/route.ts`,
  untracked `scripts/show-leaks.js`) — none of it touched this session.
- Baseline `tsc --noEmit --pretty false --incremental false` — exit 0 (clean) before any
  Wave 3 edit.

### Authoritative Wave 3 finding set (reconciled against REMEDIATION_FINDINGS.json)

`P1-09, P1-25, P1-26, P1-31, P2-13, P2-36, P2-40` — confirmed by filtering
`REMEDIATION_FINDINGS.json` for `wave === 3`. **P1-33 is `wave: 5`, not Wave 3** (schemaMarkup
result-shape drift is root-cause group E — module adapter correctness — not group D; the
campaign prompt's "if assigned to Wave 3 by the campaign ledger" condition is false for P1-33,
so it was left untouched and still open, assigned to Wave 5).

### Step 2 — finding-construction/persistence inventory (bounded)

Every production path that can create, normalize, persist, or transform a Finding was
enumerated via `grep -rn "prisma\.finding\.(create|createMany|update|upsert)"` plus a read of
`lib/audit/runner.ts`'s aggregation loop and every module's `generate*Findings`/`AuditModuleResult`
return sites:

| Path                                                                                                     | Classification (before Wave 3)                                                                                                                                                        | Classification (after Wave 3)                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/audit/runner.ts` `runAuditInternal` → `prisma.finding.createMany`                                   | DIRECT_UNVALIDATED                                                                                                                                                                    | CANONICAL_VALIDATED (routed through `persistFindings`)                                                                                                                                                                                                               |
| `app/api/finding/[id]/route.ts` PATCH/DELETE → `prisma.finding.update`                                   | DIRECT_UNVALIDATED                                                                                                                                                                    | CANONICAL_VALIDATED (routed through `updateFindingFields`/`excludeFinding`)                                                                                                                                                                                          |
| `lib/outreach/AutomatedOutreachOrchestrator.ts` simulate mode → `prisma.finding.createMany`              | DIRECT_UNVALIDATED, fabricated evidence                                                                                                                                               | CANONICAL_VALIDATED (routed through `persistFindings`; fabricated evidence now honestly labeled `sandbox://` and, where still contract-invalid, rejected — see P2-61)                                                                                                |
| `lib/modules/*.ts` (`techStack`, `gbpDeep`, and 25 other module adapters) → `AuditModuleResult.findings` | mixed CANONICAL_VALIDATED / DIRECT_UNVALIDATED (many `evidence:[]`)                                                                                                                   | `techStack`/`gbpDeep` mechanically fixed at source (P1-26/P1-31); the other 25 modules' raw output is now uniformly forced through `normalizeAndValidateModuleFindings` at the aggregation boundary — LEGACY_SHAPE/invalid output is REJECTED, not silently accepted |
| `gbpAdapter`/`competitorAdapter` (`lib/audit/runner.ts`) — legacy `LegacyAuditModuleResult.status` field | DIRECT_UNVALIDATED (status laundered to COMPLETE regardless — P1-28/P1-49)                                                                                                            | CANONICAL_VALIDATED (status propagated honestly)                                                                                                                                                                                                                     |
| `lib/proposal/index.ts` `normalizeFindingsForProposal` (diagnosis/proposal input)                        | DIRECT_UNVALIDATED (fabricated a replacement Evidence item for 0-evidence findings)                                                                                                   | CANONICAL_VALIDATED (drops rather than repairs — P1-51)                                                                                                                                                                                                              |
| `app/api/widget/quick-audit/route.ts` (QUICK_AUDIT profile)                                              | CANONICAL_VALIDATED (shares `MODULE_REGISTRY`/`extractFindingsFromRegistryResult` with the full engine; does not persist Findings to the DB at all, only computes an in-memory score) | unchanged — already canonical per Wave 2 (P1-21); no Wave 3 change needed                                                                                                                                                                                            |
| `lib/tenant/__tests__/isolation*.test.ts`, `prisma/seed.ts`                                              | test fixtures / dev seed tooling                                                                                                                                                      | unchanged — allowlisted in the architecture guard, never request-serving production code                                                                                                                                                                             |

No other `prisma.finding.*` mutating call site exists in `app/` or `lib/` outside the
above (confirmed by the final grep in Mandatory Verification below and enforced going
forward by `tests/architecture/finding-persistence-boundary.test.ts`).

### Step 3/4 — canonical contract + createEvidence hardening

- **New file `lib/modules/types.ts` additions**: `PLACEHOLDER_POINTER_VALUES`,
  `isPlaceholderPointer()`, `containsSecretLike()`, `assertRealPointer()`.
  `createEvidence()`'s `pointer` parameter is now required (removed the `?`) and the
  `pointer: opts.pointer || 'unknown'` fallback is gone — a missing/blank/placeholder/
  secret-like pointer throws instead of silently producing a fabricated value.
- **Deliberate scope decision on domain-based placeholder detection**: an earlier
  iteration additionally banned `example.com`/`example.org`/`example.net`/`test.com` as
  pointer domains (operationalizing "reject fabricated pseudo-URLs"). This broke 3
  pre-existing test suites (`lib/modules/__tests__/findingGenerator.test.ts`,
  `tests/security/widget-origin-allowlist.test.ts`) that use `https://example.com` as a
  deliberate, real, live-fetchable test domain — not a fabricated placeholder. A pointer
  identifying a URL that was genuinely fetched is real evidence regardless of which
  domain it happens to be; domain identity alone cannot prove fabrication. Narrowed the
  banned-domain list to `localhost`/`127.0.0.1` only (a real customer site can never
  legitimately be a loopback host) and rely on the exact-placeholder-word list +
  module-name-only-pointer check + secret-scan for lexical fabrication detection. The
  concrete fabrication case the campaign named (`AutomatedOutreachOrchestrator`'s
  `{url:'https://example.com'}`) is still fixed — not because of the domain, but because
  that object never had `pointer`/`source`/`collected_at` fields at all (shape
  violation) and, separately, was honestly relabeled with a `sandbox://` provenance
  scheme rather than impersonating a real external URL (see P2-61).
- **New file `lib/audit/findingContract.ts`**: `EvidenceRuntimeSchema`,
  `FindingRuntimeSchema` (Zod, mirroring the existing `Evidence`/`Finding` TS interfaces
  — not a parallel contract), `normalizeAndValidateModuleFindings()` (the adapter/
  aggregation boundary, Step 5), `validateFindingForPersistence()` (Step 6), plus
  `hasContractValidEvidence()`/`validateEvidenceItem()`/`validateFinding()` helpers.
  `FINDING_ELIGIBLE_STATES = {'COMPLETE', 'PARTIAL'}` — a finding from any other module
  status is rejected outright, not merely filtered for negativity.
- **Deliberate scope decision on module-status vocabulary (Step 5 requirement 2's
  escape clause)**: did NOT introduce a new `VERIFIED_ABSENT`/`UNAVAILABLE` value on
  `ModuleResult.status` (which would have touched all ~25 existing adapters). Root
  cause investigation showed `lib/audit/runner.ts::extractFindingsFromRegistryResult`
  already refuses to extract any finding from a module whose `ModuleResult.status !==
'COMPLETE'` — the real, previously unguarded gap was exactly two adapters
  (`gbpAdapter`, `competitorAdapter`) that reported `COMPLETE` unconditionally,
  discarding the wrapped legacy module's own `status: 'failed'` signal (AUDIT_REPORT.md
  Pass 4B, P1-28). Fixed both directly (P1-28, and the newly-discovered identical
  `competitorAdapter` case, P1-49) instead of adding a new enum value with no real
  producer. The Evidence contract (non-empty, non-placeholder, real pointer) is the
  actual proof-of-observation mechanism regardless of which status label a module used.

### Step 5 — adapter/aggregation boundary wiring

`lib/audit/runner.ts::runAuditInternal`'s per-module aggregation loop now calls
`normalizeAndValidateModuleFindings(modName, res.status, ext.findings)` immediately after
`extractFindingsFromRegistryResult`, before pushing into `allFindings`. Rejected findings
are accumulated and logged as one structured `audit.findings_rejected_at_aggregation`
event (module, title, reason, issues) rather than silently dropped. Trusted `module`
identity is now always the canonical dispatcher's `moduleName`, never `f.module` from
module output (previously `f.module || moduleName` preferred the module's own claim).

Removed the "GBP missing fallback" block that fabricated a "No Google Business Listing
Detected" PAINKILLER Finding whenever `gbp` wasn't in `modulesCompleted` — this could not
distinguish a genuine zero-result search from a provider outage, quota error, or missing
API key (all three previously produced the identical fabricated finding). No finding is
synthesized in its place; a trustworthy "verified no GBP listing" finding requires
`gbp.ts` itself to return real evidence identifying the search that ran, which is module
work for Wave 5/6 (root-cause group E/H), not a Wave 3 boundary fix.

### Step 6 — persistence enforcement boundary

**New file `lib/audit/findingPersistence.ts`** — the one module allowed to call
`prisma.finding.create/createMany/update`:

- `persistFindings(auditId, tenantId, findings)`: revalidates every finding
  independently immediately before the Prisma call (`validateFindingForPersistence`);
  `auditId`/`tenantId` always come from function parameters, never trusted off the
  finding object (proven by test: an attacker-supplied `auditId`/`tenantId` on the
  finding object is silently overwritten with the trusted value). Explicit partial-batch
  policy: valid findings persist, invalid ones are dropped and returned in `rejected`
  with structured reasons — a malformed finding never blocks its valid siblings, and
  never silently vanishes (logged via `audit.findings_rejected_at_persistence`).
- `updateFindingFields(id, fields)` / `excludeFinding(id)`: bounded human-review edits
  (title/description/scores/effort/excluded) that never touch
  evidence/module/auditId/tenantId — those are set once, at creation.
- `lib/audit/runner.ts`'s `prisma.finding.createMany` call replaced with
  `persistFindings(...)`. `app/api/finding/[id]/route.ts`'s two `prisma.finding.update`
  calls replaced with the two bounded helpers.
- `tests/architecture/finding-persistence-boundary.test.ts`: greps `app/`+`lib/` for any
  mutating `prisma.finding.*` call outside `lib/audit/findingPersistence.ts` (allowlists
  only `.test.ts` files and `prisma/seed.ts`, mirroring the existing
  `no-unscoped-db-import.test.ts` pattern) — 4/4 pass.

Prisma schema itself is unchanged (`Finding.evidence`/`metrics`/`recommendedFix` remain
`Json`) — no migration was judged necessary this wave; the runtime boundary is the
enforcement point per the campaign's "smallest robust boundary" guidance.

### Step 7 — mechanical evidence repairs with real provenance

- **`techStack.ts`** (P1-26): `generateTechFindings` now takes `(stack, url,
collectedAt)`; every evidence item (including the two previously-`evidence:[]`
  findings and the three hand-built-literal findings) routes through `createEvidence`
  with the real analyzed URL as pointer. Fixed an incidental empty-evidence edge case
  in "Modern Technology Stack" (triggered by hosting alone, with no matching framework —
  the evidence filter now covers both signals that can trigger the finding).
- **`gbpDeep.ts`** (P1-31): `generateGbpFindings` now takes `(analysis,
placeRecordPointer, collectedAt)`; the 2 real evidence:[] findings (Description
  Missing, Missing Attributes) plus 4 other hand-built-literal findings in the same
  function now cite the real Places API record; the AI-photo-quality finding cites the
  real photo URL. The catch-all "GBP Analysis Failed" fabricated finding is removed
  (Step 7 "failure/fallback findings" — see Step 8 note below). The Gemini
  photo-analysis fallback no longer fabricates a `{quality:5,...}` score on LLM failure
  (changed `degrade:true`+fabricated `fallbackValue` to `degrade:false`, matching the
  sibling photo-fetch call two lines above — the existing catch block already skips a
  photo cleanly on failure).
- **`lib/audit/runner.ts` `emailFinder` branch** (P2-36 mechanical instance): evidence
  now routes through `createEvidence` with the real crawled URL, instead of a hand-built
  `{type,value,label}` literal missing pointer/collected_at.
- **`lib/modules/website.ts`** (new finding P1-50): the double-fallback failure branch
  (crawler AND PageSpeed fallback both failed) fabricated a "Website Analysis Failed"
  PAINKILLER Finding with `evidence: []` — exactly the zero-evidence Finding
  AUDIT_REPORT.md's own module table proved. Removed; returns `findings: []` on total
  failure (matching the established `techStack.ts` graceful-degradation pattern),
  logging the real error instead.
- **`schemaMarkup`** (P1-33): left untouched — confirmed `wave: 5`, not Wave 3.

### Step 8 — provider-failure vs verified-absence

- **P1-28 / P1-49** (new): `gbpAdapter` and `competitorAdapter` (`lib/audit/runner.ts`)
  previously discarded the wrapped legacy module's `status: 'failed'`/`'error'` field via
  `data: (data as any)?.data || data`, unconditionally returning `ModuleResult.status:
'COMPLETE'`. Both now check the legacy status and return `FAILED` honestly, with the
  real error message propagated. This was assigned to Wave 5 (P1-28) but is the exact
  provider-failure-normalization defect Step 8 names for this wave's 27-module rollout
  of the widget's Wave 2 guarantee, so it was fixed now rather than deferred; P1-49
  (competitorAdapter — same 2-line pattern, no existing tracked ID) was discovered and
  fixed in the same change.
- **GBP missing-listing fallback removed** (see Step 5) — was the single highest-value
  fix here: collapsed "provider outage", "missing API key", and "genuine zero-result
  search" into one fabricated customer-negative finding.
- **`website.ts` double-fallback** (P1-50) and **`gbpDeep.ts` catch-all failure finding**
  (part of P1-31) — both technical-failure-as-Finding patterns removed per Step 7/8.
- **`gbpDeep.ts` Gemini fallback** — fabricated numeric score on LLM failure, fixed (see
  Step 7).
- Explicitly **not** touched this wave (real module-logic defects, correctly deferred to
  their existing Wave 5/6/7 slot): `socialDeep`'s stubbed provider always returning
  `[]` presented as verified absence (P0-25, Wave 6); PageSpeed-missing-key/robots-
  sitemap-failure/backlink-video-provider-failure patterns inside `keywordGap`,
  `privacyCompliance`, `backlinks`, `citations`, `competitorStrategy`, `contentQuality`,
  `mobileUX`, `paidSearch`, `seoDeep` — all still emit `evidence:[]` at the source and
  are simply rejected (not repaired) by the new aggregation boundary until their own
  module fix lands.

### Step 9 — downstream consumer protections

- **`lib/proposal/index.ts::normalizeFindingsForProposal`** (new finding P1-51): the
  proposal-compiler input path previously "repaired" a 0-evidence finding by inventing a
  replacement `createEvidence({pointer:'audit', value: f.title, ...})` citation —
  exactly the "QA repairs missing evidence by inventing citations" anti-pattern Step 9
  names. Now filters such findings out of the proposal input entirely instead of
  fabricating evidence for them. In steady state (post-boundary, post-persistence
  enforcement) this is a no-op; it protects against any pre-existing/legacy-persisted
  finding that predates the contract.
- Full proposal claim-to-Finding citation enforcement (matching a proposal claim
  sentence back to a specific cited Finding) remains Wave 8 scope, per campaign
  instruction — recorded, not expanded into.
- Public/widget quick-audit path: unchanged this wave, already canonical (Wave 2,
  P1-21) — does not persist Findings, computes score/topIssue from real
  `extractFindingsFromRegistryResult` output in-memory.

### Step 10 — architecture guards added

1. `createEvidence` requires `pointer` (compile-time + runtime) —
   `lib/modules/__tests__/createEvidence.test.ts`.
2. Placeholder/secret-like pointers rejected — same file.
3. Customer Finding schema requires non-empty Evidence —
   `lib/audit/__tests__/findingContract.test.ts`.
4. Every persisted Finding passes runtime validation —
   `lib/audit/__tests__/findingPersistence.test.ts`.
5. No unauthorized direct Prisma Finding writes —
   `tests/architecture/finding-persistence-boundary.test.ts`.
6. Provider failure cannot normalize to a false "success" —
   `lib/audit/__tests__/adapterFailureMasking.test.ts` (P1-28/P1-49 regression).
7. Invalid finding rejection is observable — structured `logger.warn` events at both the
   aggregation and persistence boundaries (verified by code review + the persistence
   test's rejection assertions; no dedicated log-capture test added, out of scope for the
   test budget this wave).
   8/9. Rejected findings cannot affect customer score/top issues — enforced structurally:
   `normalizeAndValidateModuleFindings` runs before a finding ever enters `allFindings`,
   which feeds both persistence and (for the widget) the score calculation.
8. Canonical quick and full profiles use the same Finding validator — the widget path
   already shares `extractFindingsFromRegistryResult` with the full engine (Wave 2);
   Wave 3 adds no new divergent validator.
9. Future modules cannot bypass validation via a legacy shape — the boundary function
   validates the _finding_ shape after extraction, independent of which
   `extractFindingsFromRegistryResult` branch (legacy vs new-modules-path) produced it.

### Known out-of-scope / environment-blocked items

- `lib/__tests__/outreachE2ESandbox.test.ts` and `lib/tenant/__tests__/isolation*.test.ts`
  require a live local Postgres (`localhost:5444`/real DB) not reachable in this sandbox
  — same class of limitation as P1-06/P2-12 in prior waves. P2-61's fix could not be
  proven end-to-end for this reason (see its `fixed`, not `verified`, status).
- `tests/security/public-routes-tenant-context.test.ts` — 3 pre-existing failures
  (`POST /api/widget/quick-audit` returns 500 instead of 200) confirmed via `git stash`
  to be **identical on the unmodified Wave 2 checkpoint** (this test does not mock
  `runWebsiteModule`/attempts a real, environment-dependent network path) — pre-existing,
  unrelated to any Wave 3 change, not touched or claimed fixed.
- `lib/modules/__tests__/auditOrchestrator.test.ts` — pre-existing 30s timeout, documented
  in Wave 2's own state notes as out-of-scope deprecated-component test debt; unchanged.

### Result

**Verified (10):** P1-09, P1-25, P1-26, P1-31, P2-13, P2-36, P2-40, P1-28 (pulled forward
from Wave 5), P1-49 (new), P1-50 (new), P1-51 (new).
**Fixed, environmentally blocked (1):** P2-61 (new) — code complete, tsc/eslint green, the
one end-to-end test for this path needs a live DB unavailable in this sandbox.
**Still open, correctly assigned to their existing later wave:** P1-33 (Wave 5),
P0-25/P1-34/P1-39/P1-43/P2-28/P2-47 (Wave 5), and the 9 modules whose own `evidence:[]`
Finding-generation logic is unfixed at the source but can no longer persist
(keywordGap, privacyCompliance, backlinks, citations, competitorStrategy, contentQuality,
mobileUX, paidSearch, seoDeep — Wave 5-7).

### Files changed

`lib/modules/types.ts`, `lib/audit/findingContract.ts` (new),
`lib/audit/findingPersistence.ts` (new), `lib/audit/runner.ts`, `lib/modules/techStack.ts`,
`lib/modules/gbpDeep.ts`, `lib/modules/website.ts`,
`lib/outreach/AutomatedOutreachOrchestrator.ts`, `lib/proposal/index.ts`,
`app/api/finding/[id]/route.ts`. New tests:
`lib/modules/__tests__/createEvidence.test.ts`,
`lib/audit/__tests__/findingContract.test.ts`,
`lib/audit/__tests__/findingPersistence.test.ts`,
`lib/audit/__tests__/adapterFailureMasking.test.ts`,
`lib/modules/__tests__/techStackEvidence.test.ts`,
`lib/modules/__tests__/gbpDeepEvidence.test.ts`,
`tests/architecture/finding-persistence-boundary.test.ts`.

## Next wave

**Wave 4 — Shared network, browser, and provider safety.** See the exact continuation
prompt in `REMEDIATION_VERIFICATION.md`'s Wave 3 section / the final chat response of
this session.

## Wave 4 result summary (Shared network, browser, and provider safety)

### Entry state and scope

- Branch `remediation/proposalos-e2e`, HEAD `f843bbe` (`chore(remediation): checkpoint wave 3`);
  Wave 0-3 fix/checkpoint commits present, no stash, and the documented 51-file dirty baseline
  (immutable `AUDIT_REPORT.md`, logger-typing group, prompt-performance, metering sweep, and
  `scripts/show-leaks.js`) was preserved exactly.
- Baseline and post-change `./node_modules/.bin/tsc --noEmit --pretty false --incremental false`
  exit 0. Authoritative Wave 4 set: P1-46, P1-47, P1-48, P2-53, P2-54. All are **verified**.

### Shared contracts

- `safeFetch` validates canonical HTTP(S) URLs at initial and every redirect hop, blocks
  credentialed/dangerous URLs, cancels redirect bodies, strips sensitive headers on cross-origin
  redirects, and applies a 2 MiB streaming response cap (5 MiB for approved response-derived media).
  DNS is checked before connection against all answers; DNS rebinding remains a documented
  runtime TOCTOU limit because Node fetch does not pin the validated IP to its socket.
- `safePageGoto` is the one browser boundary: initial/final validation, request interception for
  every interceptable subresource, unsafe-request aborts, popup closure, and abort-driven loading
  stop. All production `page.goto` callers in `app/lib/packages/claraud-web` route through it.
- Provider resilience derives `tenantId` and audit signal from trusted AsyncLocalStorage, links
  caller/deadline signals to each provider attempt and backoff, bounds Retry-After, and does not
  retry caller aborts. The breaker remains shared-store backed; state is tenant scoped, while
  store-read failure intentionally fails open and now says so accurately.
- The canonical runner gives each module a real signal, aborts it on module/global deadline,
  prevents post-abort aggregation/persistence, and removes the unclassified outer retry loop.

### Inventory decisions

- User/discovered target and browser paths migrated to the shared boundaries: security probe,
  accessibility, conversion, mobile UX, privacy, screenshot capture, and PDF navigation.
- Remaining `fetch(url)` exceptions in citations/backlinks/keyword-gap/video are fixed
  `yelp.com`/`bbb.org`/`yellowpages.com`/`serpapi.com` hosts with user data encoded only as
  parameters. They remain provider-resilience calls, not user-controlled destination URLs.
- Removed production `ignoreHTTPSErrors:true`; no `rejectUnauthorized:false` or
  `NODE_TLS_REJECT_UNAUTHORIZED` production escape remains.

### Verification

- New local-only Wave 4 tests: 4 files / 15 tests for redirect header stripping/body cap,
  browser subresource blocking, provider abort propagation, inherited audit signal, and
  tenant circuit isolation.
- Existing shared SSRF/Wave 0 test set: 37 tests; provider resilience set: 11 tests;
  documented Wave 0-3 regression groups: 314 tests. All green.
- ESLint: 0 errors (pre-existing warnings only). Full suite not run: local Postgres-dependent
  suites remain unavailable at `localhost:5444`/`5435`, as already documented in Waves 1-3.

## Next wave

**Wave 5 — Module adapter and failure-state repair.** Use the continuation prompt recorded in
`REMEDIATION_VERIFICATION.md`; stop after its checkpoint without beginning Wave 6.
