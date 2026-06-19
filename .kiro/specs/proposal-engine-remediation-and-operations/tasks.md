# Implementation Plan: Remediation_And_Operations_System (RAOS)

## Overview

This plan builds the `Remediation_And_Operations_System` (RAOS) — the human + operational loop that runs **after** the already-built, already-run-once `Audit_System` (spec `proposal-engine-audit-system`). RAOS consumes the engine's four artifact sinks (machine-readable findings, human report, `Open_Questions` register, `Blocked_Checks` list), 23 `Domain_Scores`, the security-weighted `Production_Readiness_Score`, and the `Go / Conditional-Go / No-Go` verdict, and drives the SUA (`/Users/danishsethi/VSCODE/ProposalOS`) from a No-Go / Conditional-Go to a **clean, non-provisional Go**.

Implementation language: **TypeScript** (the design's Data Models, transform functions, and `fast-check`/`vitest` testing strategy are all TypeScript-concrete; no pseudocode language choice is open). RAOS reuses the `fast-check` + `vitest` toolchain proven in `production-hardening` and `proposal-engine-audit-system`. The engine is invoked as a **read-only library/subprocess**; RAOS never patches engine internals and reuses the engine's exported types (`Severity`, `EffortEstimate`, `Classification`, `Capability`, `Finding`, `OpenQuestion`, `BlockedCheck`, `RunHeader`, `DomainScore`, `FindingsLibraryRow`, `QaTestCaseRow`) **verbatim**.

The build proceeds in dependency order: (1) the persistence + models + non-destructive boundary foundation; (2) the **load-bearing closure engine** (Baseline_Run / Verification_Run / scope-gated Resolved_Delta / definition-of-done status machine) — nothing that _proves_ closure may exist before it; (3) WS1 remediation execution + verdict logic; (4) the **tenant-isolation dual-layer Critical**, proven closed by re-run before any provisional-clearance gating depends on it; (5) WS2 human-decision capture; (6) WS3 provisional clearance; (7) WS4 human-gated Notion import; (8) WS5 operationalize (CI gate, drift run, retention, alerting) + cross-cutting (doc-drift, boundary); and (9) the final zero-provisional clean-Go gate.

Key invariants honored throughout:

- **Non-destructive boundary (load-bearing).** The engine stays **read-only to production and Notion**. SUA + spec-markdown changes land only via reviewed **pull requests** (R24.2, R21.3); the **only** Notion write path is the human-gated `Notion_Import` (WS4, R24.3); Hub + System Scorecard edits are **recorded human action items**, never auto-written (R6.4). Any op that would write outside this boundary **aborts and records the attempted write** (R24.4).
- **Closure proven by absence (load-bearing).** No finding is "remediated" by assertion (R22.1). Closure is a **Resolved_Delta**: a `Finding_Fingerprint` open in the pinned `Baseline_Run` open-set and **absent** from a later `Verification_Run` open-set, **scope-gated** on its producing check having actually run: `{ fp ∈ B_open | fp ∉ V_open ∧ producingCheck(fp) ∈ exercisedChecks }`. `producingCheck(fp)` is read from the engine's per-finding `sourceCheckId` — **never derived from the fingerprint** (STATIC fingerprints omit `checkId`).
- **Persistence is version-controlled append-only.** All RAOS ledgers/state live under `.kiro/raos/` (committed), with immutability enforced two-layered (app-layer write rejection + git/PR review). No out-of-band write path.
- **11 correctness properties (Property 1–11)** are RAOS's correctness gates, implemented with `fast-check` + `vitest`, **minimum 100 iterations each**, **one property = one property test**, each tagged `Feature: proposal-engine-remediation-and-operations, Property {n}: {text}`.
- **The 11 property tests are CORE (non-`*`) and MUST NOT be skipped.** Property 1 (scope-gated Resolved_Delta), Property 4 (import idempotency), Property 6 (security-leakage Critical never excluded), and Property 8 (verdict reachability) are the load-bearing gates that make "a Critical is actually closed" and "a clean Go is reachable" real. Everything that proves a Critical is closed is CORE. Only genuinely redundant EXAMPLE/SMOKE fixture tests are marked `*`-optional.
- **Build gate vs operational outcome (read before estimating).** Tasks are tagged **[BUILD]** (implement + test RAOS mechanism; passes on code+tests alone), **[EXECUTE]** (land changes against the live SUA — RLS policies, the adapter filter, standing up Temporal, supplying capabilities), or **[BUILD+EXECUTE]**. The two **operational-outcome checkpoints — Checkpoint 7 (tenant-isolation Critical proven closed) and Checkpoint 17 (verdict is a non-provisional Go) — are conditional on real remediation success** and may require **multiple remediation cycles**; they are NOT build gates. RAOS can be fully built-and-correct (all `[BUILD]` tasks + 11 property tests green) while the SUA is still No-Go. Per-task definition-of-done: a `[BUILD]` task is done when its code + tests pass; an `[EXECUTE]` task is done when its change is landed via PR AND (where it claims closure) proven by a Resolved_Delta — never on assertion (R22.1).

## Tasks

### Phase F — FOUNDATION (persistence, models, boundary — before any closure logic)

- [x] 1. Build the RAOS foundation
  - [x] 1.1 Scaffold the RAOS package and define the data models
    - Create the RAOS module tree (`lib/raos/` with `vitest.config` wiring reused from the repo); import the engine types **verbatim** from `../proposal-engine-audit-system/types` (`Severity`, `EffortEstimate`, `Classification`, `Capability`, `Finding`, `OpenQuestion`, `BlockedCheck`, `RunHeader`, `DomainScore`, `FindingsLibraryRow`, `QaTestCaseRow`) without redefining them; define all RAOS-owned interfaces/types from the design's Data Models section: `IsoUtc`, `FindingStatus` (`open`/`remediation-pending`/`done`), `Verdict`, `BaselineRun` (incl. `full: true`, `openFingerprints` = `B_open`, `producingCheckOf` = fingerprint→`sourceCheckId`, `exceptions`, `priorBaselineRunId?`), `VerificationRun` (incl. `exercisedChecks`, `openFingerprints` = `V_open`, `full`, `completed`), `RemediationBacklogItem` (incl. `orderKeys`), `ResolvedDelta`, `ClosureKind`, `RerunProof`, `OpenQuestionResolution`, `CanonicalCostDecision`, `ToSDetermination`, `SchemaExtensionSignoff`, `AcceptedRiskOrSuppression` (incl. `isSecurityLeakageCritical`, `elevatedSignoff?`, `excludable`), `ProvisionalSource`, `ProvisionalFlagClearanceMatrixRow`/`ProvisionalFlagClearanceMatrix`, `BlockedCheckResolution`, `SelfBudgetPlan`, `DeepRunResult`, `NotionImportRecord`, `DocDriftReport`.
    - Acceptance: types compile; `producingCheck(fp)` is defined as `finding.sourceCheckId` (never derived from fingerprint); `BaselineRun.full` is the literal `true`; `RerunProof.exercisedCheckConfirmed` and `closureKind` are present.
    - Evidence to capture: the RAOS type module with engine types imported (not redefined) and `producingCheck := finding.sourceCheckId` documented inline.
    - _Requirements: 1.2, 1.7, 5.3_

  - [x] 1.2 Implement the version-controlled append-only persistence layer under `.kiro/raos/`
    - Implement the file-backed store per the design's Persistence Layer table: `baseline/<runId>.json` (write-once per baseline; re-baseline writes a new file referencing `priorBaselineRunId`), `backlog/<baselineRunId>.json` (regenerated deterministically), `verifications/<runId>.json` + `proofs/<fingerprint>.json` (append-only), `ledger/open-questions.jsonl` + `ledger/decisions.jsonl` + `ledger/exclusions.jsonl` (append-only, immutable), `state/provisional-matrix.json` (rewritten per evaluation; history via git), `ledger/prior-findings-v<N>.json` (append-only, never mutated), `artifacts/<runId>/` (the four retained engine sinks). Enforce immutability at the **application layer**: reject any modify/delete of an existing `.jsonl` entry or a write-once file; rely on git/PR as the second enforcement layer (no out-of-band write path).
    - Evidence to capture: the `.kiro/raos/` store layout, the write-once/append-only enforcement points, and a rejected-mutation log sample.
    - _Requirements: 9.2, 9.6, 19.1, 19.2_

  - [x] 1.3 Implement the non-destructive boundary guard
    - Wrap every outbound mutation in a guard that permits **only**: PRs against the SUA repo / `.kiro/specs/**` markdown, the human-gated `Notion_Import` write path (WS4), and writes under `.kiro/raos/`. If a RAOS operation would write production data, production infrastructure, or Notion outside the human-gated import, **abort the operation and record the attempted write** (target + payload summary). Re-assert the engine's read-only-to-prod/Notion precondition at the boundary before invoking a run.
    - Evidence to capture: the boundary allow-list, the engine read-only re-assertion point, and the recorded-attempted-write log shape.
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

- [x] 2. Checkpoint — Foundation
  - Ensure all tests pass, ask the user if questions arise. **Gate:** types compile; the `.kiro/raos/` append-only store rejects mutation of written entries; the boundary guard aborts + records any out-of-boundary write. No closure or proving logic proceeds until this gate passes.

### Phase WS1-A — CLOSURE ENGINE (load-bearing; nothing that proves closure exists before this)

- [x] 3. Build the baseline / backlog / closure engine
  - [x] 3.1 Implement the Findings Ingestor with field-presence exceptions
    - Load every Finding in the Baseline_Run machine-readable set with all required fields (`id`, `domain`, `severity`, `workaround_available`, `effort_estimate`, `classification`, `issue_signature`); route any Finding missing a required field to an exceptions list naming the missing field(s), surface a count of excepted Findings, and exclude excepted Findings from automated ordering until the field is supplied. Read each Finding's `sourceCheckId` + `checkKind` (required downstream for scope-gated closure).
    - Evidence to capture: the ingested findings record set, the exceptions list (finding id → missing fields) with its count.
    - _Requirements: 1.2, 1.5_

  - [x] 3.2 Write property test Property 3 — incomplete findings are excepted and excluded (CORE)
    - **Property 3: Incomplete findings are excepted and excluded from ordering** — any Finding missing ≥1 required field appears in the exceptions list naming the missing field(s), is counted, and does not appear in the ordered Remediation_Backlog.
    - **Validates: Requirements 1.5**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 3: Incomplete findings are excepted and excluded from ordering`.

  - [x] 3.3 Implement Baseline pin/store (B_open + producingCheckOf; FULL-runs-only re-baseline)
    - Pin exactly one Audit_System run (default: the most recent completion timestamp at pin time) as the `Baseline_Run`, recording its run id + completion timestamp; store the frozen `B_open` open-fingerprint reference set and the `producingCheckOf` map (fingerprint → `sourceCheckId`, taken from each baseline Finding's per-finding field — **never derived from the fingerprint**). Resist replacement except via an explicit **re-baseline** action that records `priorBaselineRunId` + the new id; **restrict re-baseline to FULL runs only** (never a scoped Verification_Run), since re-pinning `B_open` from a scoped partial open-set would silently drop out-of-scope baseline findings unverified. Re-ingesting the same pinned baseline with an unchanged findings set must reproduce an identical ordering.
    - Evidence to capture: the pinned `BaselineRun` record (runId + completedAt + `full: true`), `B_open`, the `producingCheckOf` map, and the re-baseline prior/new id record when applicable.
    - _Requirements: 1.1, 1.7_

  - [x] 3.4 Implement the Remediation_Backlog deterministic total ordering
    - Order the backlog by `severity` (Critical→High→Medium→Low) → `effort_estimate` ascending → domain security weight **descending** → Finding `id` ascending (final deterministic tie-break), populating each item's `orderKeys`; emit a contiguous `1..N` position artifact with no gaps or duplicates; append all Medium and Low Findings after every Critical and High (non-blocking per R29.1). Group ingested Findings first by `severity` then by `domain`.
    - Evidence to capture: the ordered `RemediationBacklogItem[]` artifact (position, severity, effort, security weight per item) and the contiguous-1..N position check.
    - _Requirements: 1.3, 1.4, 1.6, 29.1_

  - [x] 3.5 Write property test Property 2 — backlog ordering is deterministic and total (CORE)
    - **Property 2: Remediation_Backlog ordering is deterministic and total** — ordering by `severity` → `effort_estimate` asc → domain security weight desc → Finding `id` asc produces a strict total order whose positions are a contiguous `1..N` (no gaps/dupes), and re-ordering the same set yields an identical sequence.
    - **Validates: Requirements 1.4, 1.6, 1.8**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 2: Remediation_Backlog ordering is deterministic and total`.

  - [x] 3.6 Implement the Verification_Run orchestrator (scoped + batched + self-budget-aware)
    - Given a set of fingerprints `F` under verification, map each `fp` to its baseline Finding's `sourceCheckId` (scope driven by `sourceCheckId`, **not** the fingerprint) and select exactly those checks/domains to run; support **batching** multiple pending fixes into one run; scope every run to fit the engine `selfBudget` caps; record the `exercisedChecks` set actually run and any out-of-scope fingerprints as requiring a broader-scope run. A full run is used only when explicitly requested. Persist each `VerificationRun` record (incl. `completed`). **Ownership boundary:** task 3.6 owns **per-verification scoping** (selecting checks to fit one run within caps); the **multi-run split-coverage planning and self-budget _provisional-flag clearing_** live in task 9.5 — 3.6 does not own clearing the self-budget provisional, only scoping a single run.
    - Evidence to capture: the `VerificationRun` record (scopeFingerprints, exercisedChecks, V_open, completed, selfBudget), the scope-mapping table (fp → sourceCheckId → check), and any recorded out-of-scope fingerprints.
    - _Requirements: 28.1, 28.2, 28.5_

  - [x] 3.7 Implement the Resolved_Delta evaluator (scope-gated set difference + relocation false-closure heuristic) (CORE)
    - Compute the closure set per fingerprint independently within a batch: `ResolvedDelta = { fp ∈ B_open | fp ∉ V_open ∧ producingCheck(fp) ∈ exercisedChecks }`, where `producingCheck(fp)` is read from `producingCheckOf`/the engine `sourceCheckId`. Branches: `fp ∉ V_open ∧ producingCheck ∈ exercisedChecks` ⇒ **closed** (record `ResolvedDelta` + `RerunProof` with `exercisedCheckConfirmed = true`); `fp ∈ V_open` ⇒ **still open** regardless of its `New`/`Regression`/`Confirms-Prior` classification; `producingCheck(fp) ∉ exercisedChecks` ⇒ **out of scope, NOT closed** (record a verification gap requiring a broader run). Implement the **relocation false-closure heuristic**: when a Resolved_Delta coincides with a `New` finding in the same `domain` carrying the same `issue_signature` in the same Verification_Run, flag a possible false closure as an `Open_Question` for human disambiguation rather than silently closing.
    - Evidence to capture: the per-fingerprint closure decision table (closed / still-open / out-of-scope-gap), the recorded `RerunProof`s, and any relocation false-closure Open_Questions.
    - _Requirements: 2.4, 2.5, 2.6, 22.1, 22.2, 22.3, 22.4, 28.3, 28.4_

  - [x] 3.8 Write property test Property 1 — Resolved_Delta is the scope-gated set-difference (CORE)
    - **Property 1: Resolved_Delta is exactly the scope-gated set-difference on fingerprints** — for any `B_open`, `V_open`, `exercisedChecks`, and any assignment of classifications to `V_open`, the closed set equals exactly `{ fp ∈ B_open | fp ∉ V_open ∧ producingCheck(fp) ∈ exercisedChecks }`; (a) no fingerprint present in `V_open` is ever closed regardless of classification, (b) no fingerprint whose producing check was not exercised is ever closed (recorded as a verification gap), (c) in a batched run each fingerprint is evaluated independently against the same `(V_open, exercisedChecks)`.
    - **Validates: Requirements 2.4, 2.5, 2.6, 4.5, 4.7, 5.1, 22.2, 22.3, 28.3, 28.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 1: Resolved_Delta is exactly the scope-gated set-difference on fingerprints`.

  - [x] 3.9 Implement the definition-of-done status machine (open → remediation-pending → done)
    - Implement the lifecycle with both closure paths: a Finding reaches `done` **iff** it has BOTH (a) a merged code/spec change AND (b) a Resolved_Delta — recording a `RerunProof` with `closureKind = "code-merge"` (requires `mergedChangeRef` + `exercisedCheckConfirmed = true`) or `closureKind = "decision-cleared"` (requires `decisionRef`, for findings closed by a human decision rather than a PR, per #medium). A merged change with no covering verification ⇒ `remediation-pending` (R5.4); a covering verification where the fingerprint persists ⇒ `remediation-pending` + recorded failed-closure run id (R5.5).
    - Evidence to capture: the status-transition records per finding (with the merged-change ref and/or `RerunProof`), and the failed-closure run ids recorded for persisted fingerprints.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.10 Write property test Property 9 — definition of done requires merged change AND Resolved_Delta (CORE)
    - **Property 9: Definition of done requires merged change AND Resolved_Delta** — for any combination of (merged-change-present, verification-executed, fingerprint-still-present), status is `done` iff a merged change exists AND a Resolved_Delta exists; a merged change with no covering verification ⇒ `remediation-pending`; a covering verification in which the fingerprint persists ⇒ `remediation-pending` with the failed-closure run id recorded.
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 9: Definition of done requires merged change AND Resolved_Delta`.

  - [x] 3.11 Write example test — re-baseline records prior + new Baseline_Run ids
    - Assert an explicit re-baseline writes a new `baseline/<runId>.json` referencing `priorBaselineRunId`, and assert re-baseline is rejected for a scoped (non-full) run.
    - _Requirements: 1.7_

- [x] 4. Checkpoint — Closure engine
  - Ensure all tests pass, ask the user if questions arise. **Gate:** Property 1 (scope-gated Resolved_Delta) and Property 9 (definition of done) pass; out-of-scope fingerprints are never closed; the relocation false-closure heuristic raises an Open_Question. No remediation-closure or tenant-isolation proving task proceeds until this gate passes.

### Phase WS1-B — REMEDIATION EXECUTION, EXCLUSION & VERDICT

- [x] 5. Implement remediation execution, accepted-risk exclusion, and the verdict
  - [x] 5.1 Implement the Critical-first remediation loop with fix-proposal validation **[BUILD]** (the loop logic) **+ [EXECUTE]** (driving real Critical fixes)
    - Order all unresolved Critical Findings (excluding Accepted_Risk/Suppressed per R25) ahead of every High/Medium/Low in the execution sequence; when proposing a fix, record the Finding `id` and each `file:line` the fix changes, and **reject** any proposed fix missing the Finding `id` or a `file:line` (do not schedule it). On a landed Critical fix, trigger a scoped Verification_Run (task 3.6) including the Finding's fingerprint and close only on a Resolved_Delta (task 3.7); keep the Finding open and record a verification gap if the run does not complete or does not cover the fingerprint's scope. **Definition of done:** the loop _mechanism_ is done when implemented + tested (`[BUILD]`); _closing all real Criticals_ is an `[EXECUTE]` outcome that may span multiple remediation cycles and is gated by re-run proof, never assertion (R22.1).
    - Evidence to capture: the Critical-first execution sequence, per-fix `id`+`file:line` records, rejected-fix log, and the triggered Verification_Run ids.
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 22.1_

  - [x] 5.2 Implement the High-severity gate evaluation
    - After each remediation cycle, re-evaluate the unresolved High count (severity = High, status ≠ resolved, excluding Accepted_Risk/Suppressed); treat the High gate as satisfied **only while** the unresolved High count is strictly `< X` (`X ≥ 5`) AND strictly `< Y` (`Y ≥ 10`, `Y ≥ X`) AND the count of unresolved Highs with `workaround_available = false` is exactly 0; report the remaining unresolved High count and the `workaround_available = false` count when the gate is not satisfied.
    - Evidence to capture: per-cycle High-gate evaluation (unresolved High count, `workaround_available = false` count, gate satisfied/not).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.3 Implement accepted-risk / suppression exclusion with the security-leakage Critical exclusion bar
    - Classify a Finding as `Accepted_Risk` (engine-annotated against the Risk Register, audit R14.5) or `Suppressed_Finding` (documented suppression with justification + authorizing Risk Register reference, audit R14.6); exclude every such Finding **carrying a valid Risk Register reference** from the unresolved-Critical, unresolved-High, and `workaround_available = false` gate counts; exclude **no** finding lacking a reference and surface it as an **unauthorized exclusion**. Enforce the **security-leakage exclusion bar**: a Finding flagged `isSecurityLeakageCritical` (tenant-leakage / cross-tenant Critical) has `excludable = false` unless an `elevatedSignoff` record is present — an ordinary Risk Register reference alone never makes it excludable (#4). List all Accepted_Risk/Suppressed records separately from the active backlog so excluded findings stay visible.
    - Evidence to capture: the exclusion ledger (`ledger/exclusions.jsonl`) with per-finding Risk Register ref + owner, the unauthorized-exclusion list, and the `isSecurityLeakageCritical` / `excludable` / `elevatedSignoff` determination per security Critical.
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

  - [x] 5.4 Write property test Property 5 — accepted-risk/suppression excluded only when authorized (CORE)
    - **Property 5: Accepted-risk and suppressed findings are excluded only when authorized** — the verdict gate counts (unresolved Critical, unresolved High, unresolved High with `workaround_available = false`) exclude every annotated finding carrying a valid Risk Register reference and exclude no finding lacking one; every finding lacking a reference is surfaced as an unauthorized exclusion.
    - **Validates: Requirements 25.2, 25.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 5: Accepted-risk and suppressed findings are excluded only when authorized`.

  - [x] 5.5 Write property test Property 6 — a security-leakage Critical can never be excluded by ordinary acceptance (CORE)
    - **Property 6: A security-leakage Critical can never be excluded by ordinary acceptance** — for any finding flagged `isSecurityLeakageCritical`, `excludable` is `false` unless an `elevatedSignoff` record is present; an ordinary Risk Register reference alone never makes it excludable, so such a Critical can never be removed from the verdict gate counts by ordinary accepted-risk/suppression and cannot be used to manufacture a Clean_Go.
    - **Validates: Requirements 25.2, 25.4, 23.1**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 6: A security-leakage Critical can never be excluded by ordinary acceptance`.

  - [x] 5.6 Implement the verdict reachability function
    - Emit exactly one `Go` / `Conditional-Go` / `No-Go` over the unresolved counts/flags computed after excluding Accepted_Risk/Suppressed (task 5.3): any unresolved Critical OR unresolved High count `≥ Y` ⇒ `No-Go`; unresolved High count `≥ X` OR any unresolved High with `workaround_available = false` ⇒ at most `Conditional-Go`; `Go` exactly when no unresolved Critical, unresolved High count `< X`, every unresolved High has `workaround_available = true`, and no provisional flag is set (the `Go` case must be satisfiable — a clean Go is reachable). Do not count Medium/Low toward the Critical/High gates; carry forward unresolved Medium/Low counts into a recorded Clean_Go.
    - Evidence to capture: the verdict computation with the thresholds applied, the `workaround_available = false` clause, and the carried-forward Medium/Low counts.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 29.2, 29.3_

  - [x] 5.7 Write property test Property 8 — verdict logic is correct and a clean Go is reachable (CORE)
    - **Property 8: Verdict logic is correct and a clean Go is reachable** — for any unresolved counts/flags (after excluding Accepted_Risk/Suppressed per Property 5): `No-Go` when any unresolved Critical exists or unresolved High `≥ Y`; at most `Conditional-Go` when unresolved High `≥ X` or any unresolved High has `workaround_available = false`; `Go` exactly when no unresolved Critical, unresolved High `< X`, every unresolved High has `workaround_available = true`, and no provisional flag is set — and this last `Go` case is satisfiable.
    - **Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 8: Verdict logic is correct and a clean Go is reachable`.

- [x] 6. Remediate the tenant-isolation dual-layer Critical and prove closure by re-run (CORE) **[EXECUTE — operational outcome, may span multiple cycles]**
  - [x] 6.1 Enforce DB-layer RLS on 100% of tenant-scoped tables (Prisma/Postgres) **[EXECUTE]**
    - Land (via PR) a Postgres RLS policy on every tenant-scoped table so `count(tenant-scoped tables with active RLS) == count(tenant-scoped tables)` (100% coverage); consume the engine's AST tenant-path enumeration as the table inventory source; keep the tenant-isolation Finding at Critical and the affected domain at No-Go while any tenant-scoped table lacks an active RLS policy.
    - Evidence to capture: the tenant-scoped table inventory, the per-table RLS-policy coverage map, and the 100%-coverage count.
    - _Requirements: 4.1, 4.6_

  - [x] 6.2 Enforce the adapter-level tenantId filter on 100% of tenant-scoped query paths **[EXECUTE]**
    - Land (via PR) an injected `tenantId` predicate on every tenant-scoped query path via `lib/auth/wrappedPrismaAdapter.ts` and `lib/tenant/context.ts` so `count(paths with enforced tenantId) == count(tenant-scoped paths)` (100% coverage); keep the Finding Critical / domain No-Go while any tenant-scoped path lacks the adapter filter.
    - Evidence to capture: the tenant-scoped query-path inventory and the per-path adapter `tenantId`-filter coverage map (file:line per path).
    - _Requirements: 4.2, 4.6_

  - [x] 6.3 Verify zero BYPASSRLS roles **[EXECUTE]**
    - Verify `count(application DB roles carrying BYPASSRLS) == 0`; record a Critical and keep the domain No-Go if any application DB role carries `BYPASSRLS`.
    - Evidence to capture: the DB-role attribute scan output showing zero `BYPASSRLS` roles.
    - _Requirements: 4.3_

  - [x] 6.4 Land the dual-layer fix and prove closure with exactly one scoped Verification_Run (CORE) **[EXECUTE — operational outcome]**
    - On landing the dual-layer fix, cite the Finding `id` and each `file:line` changed; trigger **exactly one** Verification_Run scoped (task 3.6) to the tenant-isolation Critical's `Finding_Fingerprint` and mark the Critical closed **only** if that fingerprint was open in `B_open` and is **absent** from the Verification_Run open-set with its producing check exercised (a Resolved_Delta, task 3.7), recording the `RerunProof`; if the fingerprint re-appears (no Resolved_Delta) or any tenant-scoped path still lacks RLS / the adapter filter, keep the Critical and the affected domain at No-Go and do **not** mark it closed.
    - Evidence to capture: the cited `id`+`file:line` set, the single Verification_Run id, the Resolved_Delta/`RerunProof` for the tenant-isolation fingerprint (or the recorded failed-closure run id).
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 22.1_

- [x] 7. Checkpoint — Tenant-isolation Critical proven closed **(OPERATIONAL-OUTCOME gate — conditional on real remediation success; may require multiple cycles)**
  - Ensure all tests pass, ask the user if questions arise. **Gate:** RLS coverage == 100% of tenant-scoped tables; adapter `tenantId` filter == 100% of tenant-scoped paths; zero `BYPASSRLS` roles; the tenant-isolation fingerprint is closed by a recorded Resolved_Delta + `RerunProof`. The security-leakage exclusion bar (Property 6) holds. **This is an operational outcome, not a build gate** — the RAOS closure mechanism (`[BUILD]`, checkpoint 4) can be correct while this gate is not yet met on the live SUA. No WS3/WS5 gating that relies on this Critical being closed proceeds until this gate passes; WS2 human-decision capture (8.2/8.3/8.5) may proceed in parallel as it does not depend on this Critical (see graph).

### Phase WS2 — RESOLVE BLOCKING OPEN_QUESTIONS (human decisions) — **runs in parallel with WS1-B / tenant isolation; depends only on the foundation + closure engine, NOT on the tenant-isolation Critical being closed**

- [x] 8. Build the human-decision capture ledgers **[BUILD]** (ledger mechanisms) **+ [EXECUTE]** (recording the real human decisions)
  - [x] 8.1 Implement the Open_Question resolution ledger (append-only, immutable, provenance)
    - Persist each resolution to `ledger/open-questions.jsonl` as an immutable, append-only entry capturing decision text, resolving owner id, a UTC resolution timestamp (≥ second precision), and the complete list of provisional flags it clears; store resolutions as a record set distinct from the Findings set and Blocked_Checks list (no duplication into either); validate each resolution (non-empty decision text + valid owner) before persistence and reject invalid submissions, retaining the Open_Question unresolved; on a persistence failure retain the unresolved state and return a "not recorded" error; record a zero-flag-clearing resolution noting it made no change to provisional status; reject any modify/delete of a written entry.
    - Evidence to capture: the `open-questions.jsonl` entry shape, a rejected invalid-submission record, and a rejected modify/delete attempt.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 8.2 Implement the Canonical_Cost_Decision (PR + human action items; NO auto Notion write)
    - Persist a `CanonicalCostDecision` (value in `[0.01, 999.99]`, owner, UTC timestamp, `clearsFlags`) to `ledger/decisions.jsonl`; reject a submission with a missing/empty value/owner/timestamp or an out-of-range value, leaving all existing provisional flags unchanged and returning an error naming the invalid field; while the `$0.06–0.10` band and the `$0.50` Scorecard target stand unreconciled, keep the Domain 10 cost verdict provisional; on a recorded decision, propagate the canonical value to the requirements docs via a **normal PR** and emit a **recorded human action item** for each Notion-resident source (Hub + System Scorecard) — **never write Notion automatically** (via the boundary guard, task 1.3); clear the Domain 10 cost provisional flag **only** when the requirements PR is merged AND both Notion action items are marked applied, else report each unreconciled source.
    - Evidence to capture: the `CanonicalCostDecision` record, the requirements-PR ref, the two Notion human-action-item refs with applied status, and the Domain 10 cost-flag state.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 8.3 Implement the ToS_Determination per scraped source (robots + rate ≤1 rps + ToS review + 90-day staleness)
    - For each scraped source (incl. Google Business Profile, Yelp), persist a `ToSDetermination` containing a `robots.txt` result (compliant/non-compliant/not-applicable), a `rateLimitRps` that does not exceed the lower of the source-permitted rate and 1.0 req/s, a ToS review result (permitted/prohibited/conditional) with reviewer notes ≥ 1 char, owner, UTC creation timestamp, and `clearsFlags`; treat a source with no determination or a determination missing any required field as compliance-**unresolved** (never assert compliance); treat a determination older than 90 days as **stale** ⇒ compliance unresolved until a new one is recorded; retain all prior fields without modification.
    - Evidence to capture: the per-source `ToSDetermination` records, the rate-ceiling check (≤ min(source-permitted, 1.0 rps)), and the staleness (>90 days) evaluation.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.4 Write property test Property 11 — ToS determination resolved iff complete and within the rate ceiling (CORE)
    - **Property 11: ToS determination is resolved iff complete and within the rate ceiling** — a source's compliance posture is resolved iff all required fields are present (robots result, ToS review result, reviewer notes ≥ 1 char) AND `rateLimitRps ≤ min(source-permitted, 1.0 req/s)`, and a determination older than 90 days is treated as unresolved.
    - **Validates: Requirements 7.1, 7.2, 7.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 11: ToS determination is resolved iff complete and within the rate ceiling`.

  - [x] 8.5 Implement the SchemaExtensionSignoff gate
    - Define the `Findings_Library_Schema_Extension` as exactly six properties — `Severity`, `Domain`, `Intended Source`, `Actual Source`, a rich-evidence property (capable of storing multiple evidence references), and a unique `Finding Fingerprint` (external-id) property carrying each Finding's `Finding_Fingerprint` as the import match key — each documented with name, data type, and complete enumerated allowed values; persist a `SchemaExtensionSignoff` (`signed-off`/`rejected`/`withheld`, owner, ISO-8601 timestamp, `clearsFlags` populated only when signed-off) to `ledger/decisions.jsonl`; while sign-off is outstanding, **prevent the Notion_Import (WS4) from starting** and reject any import invocation (leave Notion unchanged, return an "outstanding sign-off" indication); record a rejection/withholding with owner + timestamp and clear no flags.
    - Evidence to capture: the six-property schema-extension definition, the `SchemaExtensionSignoff` record, and the import-blocked-while-outstanding indication.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.6 Write example test — Open_Question resolution immutability
    - Write a resolution entry, then assert a modify and a delete are both rejected; assert an invalid submission (empty decision text / invalid owner) leaves the Open_Question unresolved.
    - _Requirements: 9.6_

  - [x] 8.7 Write example test — Canonical_Cost_Decision validation + propagation-gated flag clearing
    - Assert the validator accepts a value in `[0.01, 999.99]` and rejects a missing/empty value/owner/timestamp and an out-of-range value (e.g. 0, -1, 1000), leaving existing provisional flags unchanged and naming the invalid field; assert the Domain 10 cost flag clears **only** when the requirements PR is merged AND both Notion action items are marked applied, and stays set (reporting each unreconciled source) otherwise.
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

  - [x] 8.8 Write example test — schema sign-off gate blocks the import while outstanding
    - Assert that invoking the Notion_Import while `SchemaExtensionSignoff` is outstanding is rejected, leaves Notion unchanged, and returns an "outstanding sign-off" indication; assert a `rejected`/`withheld` sign-off clears no flags.
    - _Requirements: 8.3, 8.4, 8.5_

### Phase WS3 — CLEAR PROVISIONAL FLAGS (de-risk the verdict)

- [x] 9. Clear every provisional flag
  - [x] 9.1 Stand up the Temporal_Dev_Server with a health check (Domain 5) **[EXECUTE]**
    - Provision a real Temporal dev-mode server in place of the `Stub_Substrate`; treat provisioning complete only when it answers a health check within 30 seconds; re-run Domain 5 reliability checks against the health-checked server and confirm every contributing Domain 5 finding carries `substrateBacking = "real-dev"` before clearing the Domain 5 provisional flag; if the health check fails or times out, retain the Domain 5 findings/score, keep their provisional flag set, and record substrate-unavailable (findings stay `substrateBacking = "stub"` and provisional).
    - Evidence to capture: the Temporal_Dev_Server health-check result, the per-finding `substrateBacking` values, and the Domain 5 provisional-flag state.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.2 Verify cost instrumentation is wired (Domain 10)
    - Execute at least one representative audit and confirm `lib/costs/costTracker.ts` and `lib/config/costBudget.ts` emit a per-audit cost signal — a non-negative numeric total cost in cents plus a per-API and per-model usage breakdown, all bound to a single audit identifier; record `costInstrumentation` available when the signal is present, ≥ 0, and bound to the audit id; if the signal is absent/null/undefined/non-numeric, keep the Domain 10 cost checks as Blocked_Checks (never report a measured `Per_Audit_Cost`), preserving the Blocked classification and indicating the signal was not emitted.
    - Evidence to capture: the per-audit cost signal (total + per-API/per-model breakdown + audit id), the `costInstrumentation` availability decision, and any Domain 10 Blocked_Check it leaves.
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 9.3 Run the opt-in Deep_Run with cold-start exclusion and p50 fallback (Domain 10 latency) **[EXECUTE — heavy synthetic run]**
    - When the Deep_Run option is enabled, execute it at 20–100 runs/industry (reject a config of < 20 runs/industry with a configuration error, retaining the existing latency gating); classify every `coldStart=true` run (cold starts may recur mid-batch) as a cold-start sample and the rest as warm; when ≥ 19 warm samples/industry exist, compute warm p95/p99 (ms) from warm samples only and gate latency on warm p95 (`gatingMode = "warm-p95"`); if fewer than 19 warm samples/industry, do **not** apply warm gating — fall back to p50 gating (`gatingMode = "p50-fallback"`) and record an insufficient-warm-samples coverage gap. **Resource note:** the Deep_Run is a heavy synthetic run (≥20–100/industry × ≥5 industries) — serialize it after the Domain 5 Temporal re-run (9.1) and the representative cost audit (9.2) rather than running all three concurrently, to avoid synthetic-environment and engine self-budget contention (see graph: 9.1→9.2→9.3 serialized).
    - Evidence to capture: the `DeepRunResult` (runs/industry, warm-samples/industry, warm p95/p99 or the p50-fallback `gatingMode`), and any recorded coverage gap.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 9.4 Resolve Blocked_Checks by supplying the missing capability (per capability) **[EXECUTE]**
    - Ingest the Baseline_Run Blocked_Checks list and record, per Blocked_Check, the missing capability (`nonProdDb`/`gcpVertex`/`langSmith`/`testExecution`/`secretScan`/`costInstrumentation`/`notionRead`) and the domain(s) it leaves provisional; where the capability can be supplied, supply it and trigger a Verification_Run so the previously-blocked check runs; on a non-blocked result, clear the Blocked_Check and the provisional flag it contributed (provided no other provisional source remains on that domain); where the capability cannot be supplied, record an unresolved coverage gap and keep the domain provisional.
    - Evidence to capture: the per-`BlockedCheckResolution` record (missing capability, domains, supplied?, verification run id, result).
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

  - [x] 9.5 Size and clear the self-budget-cap provisional
    - Own the **self-budget-cap provisional clearing** (R27.1–R27.4): plan coverage so the required checks fit the engine self-budget caps; if a run is truncated by a cap, record which checks did not run and keep the affected verdict provisional; where full required coverage cannot fit one run, **split coverage across multiple capped runs** (each scoped via task 3.6) whose combined results cover the required checks, OR record a human action item to raise the caps with owner + justification; clear the self-budget-cap provisional only when combined results cover the required checks with `capInducedOmissionRemaining = false`. (Task 3.6 owns per-run scoping; 9.5 owns the multi-run split plan + the provisional clearing — no double ownership.)
    - Evidence to capture: the `SelfBudgetPlan` (required checks, capped-run split or raise-cap action item, `capInducedOmissionRemaining`).
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

  - [x] 9.6 Implement the provisional-flag clearance matrix engine + zero-provisional (Domain 10 two-source)
    - Build the matrix tracking every `ProvisionalSource` (`cost-conflict`→Domain 10 / `stub-domain5`→Domain 5 / `blocked-check`→per capability+domain / `self-budget-cap` / `latency-percentile`→Domain 10) with its `state`, `clearingRequirementRef`, and `evidenceRef`; set `zeroProvisional = true` **iff** every row is `cleared`; while any row is uncleared, withhold a Clean_Go and report which source remains; enforce that **Domain 10 carries two sources** (cost conflict R6 + latency-percentile R12) and its domain-level flag clears only when **both** rows are cleared. Persist to `state/provisional-matrix.json`.
    - Evidence to capture: the provisional-flag clearance matrix (rows with source/detail/state/requirement/evidence), the `zeroProvisional` value, and the Domain 10 both-rows-cleared check.
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 9.7 Write property test Property 7 — provisional matrix is monotonic over the pure data structure and Clean_Go-equivalent (CORE)
    - **Property 7: Provisional matrix is monotonic over the pure data structure and Clean_Go-equivalent** — for any matrix considered as a pure data structure, `zeroProvisional` is true iff every row's state is `cleared`; setting any single row to `cleared` never changes another row to `uncleared`; and a Clean_Go determination is withheld while `zeroProvisional` is false. (Scoped to the matrix as a value; it does not claim global monotonic progress across runs.)
    - **Validates: Requirements 13.1, 13.2, 13.3**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 7: Provisional matrix is monotonic over the pure data structure and Clean_Go-equivalent`.

  - [x] 9.8 Write example test — Deep_Run warm-sample/p50-fallback logic
    - Assert: a config of < 20 runs/industry is rejected with a configuration error and the existing latency gating is retained; with recurring cold starts reducing warm samples below 19/industry, `gatingMode = "p50-fallback"` and an insufficient-warm-samples coverage gap is recorded; with ≥ 19 warm samples/industry, warm p95/p99 are computed from warm samples only (cold starts excluded) and `gatingMode = "warm-p95"`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6_

  - [x] 9.9 Write example test — Blocked_Check capability supply / unresolved-gap
    - Assert: when a missing capability is supplied and the previously-blocked check runs to a non-blocked result, the Blocked_Check and the provisional flag it contributed clear (when no other source remains on the domain); when the capability cannot be supplied, an unresolved coverage gap is recorded and the domain stays provisional.
    - _Requirements: 26.2, 26.3, 26.4_

- [x] 10. Checkpoint — WS2 / WS3 provisional clearance
  - Ensure all tests pass, ask the user if questions arise. **Gate:** Property 7 and Property 11 pass; every provisional source has a clearing path wired (cost conflict, stub Domain 5, Blocked_Checks, self-budget cap, latency-percentile); the matrix reports `zeroProvisional` correctly and Domain 10 clears only when both its rows clear. WS4/WS5 proceed only after this gate.

### Phase WS4 — NOTION IMPORT (human-gated; engine writes nothing)

- [x] 11. Build the human-gated Notion import
  - [x] 11.1 Define the six-property Findings Library schema extension
    - Specify the `Findings_Library_Schema_Extension` as the six human-applied properties (`Severity`, `Domain`, `Intended Source`, `Actual Source`, rich-evidence, unique `Finding Fingerprint` external-id), each documented with name + data type + enumerated allowed values, the rich-evidence property documented as storing multiple evidence references, and the `Finding Fingerprint` documented as unique and carrying the `Finding_Fingerprint` import match key; the engine emits an import-ready payload only and **never writes Notion**.
    - Evidence to capture: the six-property schema-extension specification document and the "engine writes nothing" boundary note.
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 11.2 Implement the transform functions
    - Implement pure `toFindingsLibrary(f)` → `impactScore` (1–10 from severity per the design's severity→Impact Score table) + `findingType` (`Missing`/`Underperforming`/`Broken`/`Opportunity`/`Risk`) + `effortEstimate` (**direct**) + `notes` (rich evidence/impact/fix as text) + `evidenceLinks` (**single URL**) + `findingFingerprint` (the sixth property); and `toQaTestCase(f)` → native `Severity` (direct) + description; never emit a property absent from the agreed schema.
    - Evidence to capture: the per-database field-mapping tables, the severity→Impact Score/Finding Type derivation, and the QA severity→native Severity mapping.
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 11.3 Implement the idempotent upsert keyed on Finding Fingerprint (after schema applied + signed off)
    - Gate the upsert on the schema extension being applied by a human AND signed off (task 8.5) — reject the invocation, leave Notion unchanged, and return an "outstanding sign-off" indication otherwise; once the gate is satisfied, **RAOS** (not the engine) performs the upsert through the single human-gated Notion write path (via the boundary guard, task 1.3): for each record, if a Notion record with a matching `Finding Fingerprint` exists, update in place; else create a new record and populate its `Finding Fingerprint`; importing the same payload twice produces the same set of Notion records as once.
    - Evidence to capture: the upsert match-key logic, the sign-off precondition gate, and a same-payload-twice idempotency demonstration record.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 14.1_

  - [x] 11.4 Write property test Property 4 — Notion import is idempotent on Finding_Fingerprint (CORE)
    - **Property 4: Notion import is idempotent on Finding_Fingerprint** — for any import payload (including repeated fingerprints and a store with pre-existing records), applying the fingerprint-keyed upsert twice produces the same set of Notion records as applying it once, where a matching `Finding Fingerprint` updates in place and a non-matching one creates exactly one new record. (Use an in-memory fingerprint-keyed store mock.)
    - **Validates: Requirements 16.2, 16.3, 16.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 4: Notion import is idempotent on Finding_Fingerprint`.

  - [x] 11.5 Write example test — severity → Impact Score band + Finding Type enum membership
    - Assert each severity maps to its documented Impact Score band/default and a `Finding Type` drawn from the live enum (`Missing`/`Underperforming`/`Broken`/`Opportunity`/`Risk`).
    - _Requirements: 15.1_

- [x] 12. Checkpoint — WS4 import
  - Ensure all tests pass, ask the user if questions arise. **Gate:** Property 4 (import idempotency) passes; the import is blocked while sign-off is outstanding and leaves Notion unchanged; the engine writes nothing to Notion.

### Phase WS5 — OPERATIONALIZE + CROSS-CUTTING

- [x] 13. Operationalize the audit (CI gate, drift run, retention, alerting)
  - [x] 13.1 Implement the CI Release_Gate as a bounded CI profile
    - Add a GitHub Actions `release-gate` job (in `.github/workflows/`) that runs a **bounded CI profile** — Static_Checks + P0 safety only (tenant-isolation RLS/adapter/BYPASSRLS, secret scan, dependency audit) on the **candidate commit**, plus a verdict computation; **no synthetic Default_Sample or Deep_Run** in the gate. Emit a **`Gate_Verdict` scoped to what was actually re-run on the candidate commit**, recorded **distinctly** from a scheduled full run's `Production_Readiness` verdict — the gate never asserts the full Go on stale synthetic evidence. Where the gate reuses synthetic-derived findings (latency/cost/AI-quality/reliability) from a prior scheduled run, **tag each reused finding with its source run id + age and mark every reused-synthetic domain provisional on the candidate commit**. Map verdict→outcome: any unresolved Critical ⇒ **fail** (R17.1); a provisional `Gate_Verdict` — including any reused-synthetic provisional domain — ⇒ **fail by default** annotated with the provisional sources + reused-finding source id/age, configurable to **warn-only** with a **recorded override** (R17.2, R17.6); static-and-P0-clean with no reused-synthetic provisional domain remaining ⇒ **pass** as a non-provisional `Gate_Verdict` (R17.3, R17.4). A static-and-P0-clean candidate carrying reused-synthetic provisional domains does **not** report a clean non-provisional Go (R17.6).
    - Evidence to capture: the `release-gate` workflow definition, the CI-profile scope (Static + P0, no synthetic), the reused-synthetic tagging (source run id + age + provisional-on-candidate), and the `Gate_Verdict`→outcome mapping incl. the warn-only override record.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 13.2 Implement the scheduled Drift_Run (full + Deep_Run)
    - Add a scheduled (cron) GitHub Actions workflow that runs a recurring `Drift_Run` of the Audit_System FULL + Deep_Run synthetic across ≥ 5 industries; this is where the full/Deep_Run lives (not the PR gate).
    - Evidence to capture: the scheduled workflow definition (cron + full/Deep_Run scope).
    - _Requirements: 18.1_

  - [x] 13.3 Implement artifact retention + the append-only ledger version bump
    - Retain each run's four sinks under `artifacts/<runId>/` per the configured retention policy; on completion, append a new `priorLedgerVersion` (`ledger/prior-findings-v<N>.json`) without mutating any prior frozen version; require **human sign-off** only when a bump would add or reclassify a prior finding used as a New/Regression/Confirms-Prior matching baseline (routine append-only bumps recording only the run's own findings do not require re-sign-off); record, per run, the ledger version used for classification.
    - Evidence to capture: the retained four-sink set per run, the appended `prior-findings-v<N>.json`, the classification-baseline-change sign-off record, and the per-run ledger-version-used note.
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x] 13.4 Implement the alerting path
    - Emit an alert through the configured alerting path when any run produces a `Regression`-classified finding or a new Critical Finding; the alert payload includes the Finding `id`, `domain`, `severity`, and `classification`.
    - Evidence to capture: the alert-payload shape (id/domain/severity/classification) and the regression / new-Critical trigger conditions.
    - _Requirements: 18.2, 18.3, 20.1, 20.2, 20.3_

  - [x] 13.5 Write example test — Release_Gate verdict → outcome mapping
    - Assert Critical→fail; provisional→fail (default); provisional+warn-only→pass with a recorded override; non-provisional Go→pass.
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 13.6 Write integration tests — scheduler wiring, alert payload, ledger append-only, retention
    - Assert the scheduled Drift_Run triggers an engine run (cron wiring); assert the alert payload contains `id`/`domain`/`severity`/`classification`; assert an append-only ledger bump does not mutate any prior frozen version and a classification-baseline change requires sign-off; assert artifact retention persists the four sinks per policy.
    - _Requirements: 18.1, 19.1, 19.2, 19.3, 20.3_

- [x] 14. Cross-cutting — doc-drift reconciliation and boundary verification
  - [x] 14.1 Implement the doc-drift reconciliation checker over the three load-bearing values
    - Read each load-bearing value — 23-domain count (**23**, not 22), load-bearing Critical deduction (**5**, not 10), legal/scraping domain inclusion (Domain 23 / R36 **present**) — from all three artifacts (`requirements.md`, `design.md`, `tasks.md`) of **both** the `proposal-engine-audit-system` and `proposal-engine-remediation-and-operations` specs; **fail** the check and report the diverging artifacts + values when they diverge on any load-bearing value, **pass** while mutually consistent; deliver any reconciling spec-markdown edits through a **normal PR** (never auto-written to any Notion-resident copy, via the boundary guard task 1.3); emit a `DocDriftReport`.
    - Evidence to capture: the `DocDriftReport` (per-value requirements/design/tasks values + consistent flag + divergences) across both specs.
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [x] 14.2 Write property test Property 10 — doc-drift check passes iff artifacts agree (CORE)
    - **Property 10: Doc-drift check passes iff artifacts agree** — for any triple of load-bearing values drawn from `requirements.md`, `design.md`, `tasks.md` for a load-bearing name, the check passes iff all three values are equal; when they diverge the report names the diverging artifacts and their values.
    - **Validates: Requirements 21.4, 21.5**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-remediation-and-operations, Property 10: Doc-drift check passes iff artifacts agree`.

  - [x] 14.3 Write example test — non-destructive boundary guard
    - With mocked prod/Notion clients, assert the engine path issues no writes, and assert an op that would write prod data/infra or Notion outside the human-gated import aborts and records the attempted write.
    - _Requirements: 24.1, 24.4_

- [x] 15. Checkpoint — WS5 operationalize + cross-cutting
  - Ensure all tests pass, ask the user if questions arise. **Gate:** Property 10 passes; the CI gate fails on Critical and on provisional-by-default; the scheduled Drift_Run + alerting + retention + append-only ledger bump are wired; the doc-drift checker passes across both specs (or its PR edits are pending). The final clean-Go gate proceeds only after this gate.

### Phase FINAL — ZERO-PROVISIONAL CLEAN-GO GATE

- [x] 16. Wire the end-to-end clean-Go determination
  - [x] 16.1 Assemble the Clean_Go gate over closure + provisional clearance + verdict
    - Wire the final determination: record a `Clean_Go` **only** when there is no unresolved Critical (incl. the tenant-isolation Critical proven closed by Resolved_Delta, task 6.4), the unresolved High count is `< X`, every unresolved High has `workaround_available = true`, the provisional-flag clearance matrix reports `zeroProvisional = true` (task 9.6), and the verdict function (task 5.6) returns `Go`; carry forward and report the count of unresolved Medium/Low findings; while any provisional source remains or any Critical is open, withhold Clean_Go and report what remains.
    - Evidence to capture: the final Clean_Go determination record (verdict + `zeroProvisional` + closed-Criticals + High-gate state + carried-forward Medium/Low counts), or the withheld-Clean_Go reason set.
    - _Requirements: 13.1, 13.2, 23.5, 29.3_

- [x] 17. Final checkpoint — Clean-Go gate
  - Ensure all tests pass, ask the user if questions arise. **Gate:** all 11 property tests pass; every provisional flag is cleared (`zeroProvisional = true`); the tenant-isolation Critical is closed by a recorded Resolved_Delta; the verdict is a non-provisional `Go`. This is the workflow's terminal artifact gate.

## Notes

- The 11 property tests (Property 1–11) are **CORE (non-`*`) and MUST NOT be skipped** — they are RAOS's correctness gates. Property 1 (scope-gated Resolved_Delta), Property 4 (import idempotency), Property 6 (security-leakage Critical never excluded), and Property 8 (verdict reachability) are the load-bearing gates that prove "a Critical is actually closed" and "a clean Go is reachable"; everything that proves a Critical is closed is CORE.
- Only genuinely redundant EXAMPLE/SMOKE fixture tests are marked `*`-optional and may be skipped for a faster MVP: the re-baseline example (3.11), the Open_Question immutability example (8.6), the cost-decision validation example (8.7), the schema-sign-off-gate example (8.8), the Deep_Run warm-sample/fallback example (9.8), the Blocked_Check capability-supply example (9.9), the severity→Impact Score example (11.5), the Release_Gate verdict→outcome example (13.5), the WS5 wiring integration tests (13.6), and the boundary-guard example (14.3). The property-test sub-tasks carry `*` only to mark them as the dedicated test layer per the audit-spec convention; per the rule above they are CORE and MUST be implemented — they are never skipped. (Note: 8.7 and 9.8 cover deterministic validators the prior draft left untested — keep them even in an MVP.)
- Each task references the specific sub-requirements it implements for traceability, and each task captures the evidence named in its "Evidence to capture" line, mirroring the audit spec.
- The 11 property tests are implemented with `fast-check` + `vitest` (≥100 iterations each, one property per test) over RAOS's deterministic core (closure set-difference, backlog ordering, import idempotency, exclusion arithmetic, the provisional matrix, verdict logic, the done-status mapping, doc-drift, ToS completeness); Notion and the engine are mocked for property tests. Engine internals (fingerprinting, scoring, synthetic-run measurement) are preconditions verified by the Audit_System's own property tests and are not re-tested here.
- RAOS is non-destructive throughout: the engine stays read-only to production and Notion; SUA + spec-markdown changes land via reviewed PRs; the only Notion write is the human-gated WS4 import (after schema applied + signed off); Hub + Scorecard edits are recorded human action items; any out-of-boundary write aborts + records (task 1.3).
- Persistence lives under version-controlled, append-only files in `.kiro/raos/`, with immutability enforced two-layered (app-layer write rejection + git/PR review).
- Checkpoints (tasks 2, 4, 7, 10, 12, 15, 17) provide incremental validation at phase boundaries and act as wave barriers in the dependency graph below; each states the gate condition that must pass before the next wave.

## Task Dependency Graph

Checkpoints (2, 4, 7, 10, 12, 15, 17) are included as explicit **WAVE BARRIERS**: each sits in its own wave, depends on all leaf tasks of the phases before it, and gates every task after it. The graph is built so the **closure engine + persistence + models come before anything that proves closure** (no proving task runs before checkpoint 4), the **tenant-isolation Critical is verified before any WS3/WS5 gating depends on it** (no WS3 task runs before checkpoint 7), and the **final clean-Go checkpoint (17) depends on all provisional-clearance + WS1 closure tasks** (16.1 depends on 6.4 closure, 9.6 zero-provisional, and 5.7 verdict). Each property/example test is scheduled in a wave after the code it validates. The `dependencies` map lists each leaf task's prerequisite task ids; the graph is acyclic and every leaf task id appears in exactly one wave.

```json
{
  "waves": [
    { "id": 0, "barrier": false, "tasks": ["1.1"] },
    { "id": 1, "barrier": false, "tasks": ["1.2", "1.3"] },
    { "id": 2, "barrier": true, "checkpoint": "2", "tasks": ["2"] },
    { "id": 3, "barrier": false, "tasks": ["3.1"] },
    { "id": 4, "barrier": false, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 5, "barrier": false, "tasks": ["3.5", "3.6", "3.11"] },
    { "id": 6, "barrier": false, "tasks": ["3.7"] },
    { "id": 7, "barrier": false, "tasks": ["3.8", "3.9"] },
    { "id": 8, "barrier": false, "tasks": ["3.10"] },
    { "id": 9, "barrier": true, "checkpoint": "4", "tasks": ["4"] },
    {
      "id": 10,
      "barrier": false,
      "tasks": ["5.1", "5.2", "5.3", "6.1", "6.2", "6.3", "8.1", "8.2", "8.3", "8.5"]
    },
    {
      "id": 11,
      "barrier": false,
      "tasks": ["5.4", "5.5", "5.6", "6.4", "8.4", "8.6", "8.7", "8.8"]
    },
    { "id": 12, "barrier": false, "tasks": ["5.7"] },
    { "id": 13, "barrier": true, "checkpoint": "7", "tasks": ["7"] },
    { "id": 14, "barrier": false, "tasks": ["9.1"] },
    { "id": 15, "barrier": false, "tasks": ["9.2"] },
    { "id": 16, "barrier": false, "tasks": ["9.3", "9.4", "9.5"] },
    { "id": 17, "barrier": false, "tasks": ["9.6", "9.8", "9.9"] },
    { "id": 18, "barrier": false, "tasks": ["9.7"] },
    { "id": 19, "barrier": true, "checkpoint": "10", "tasks": ["10"] },
    { "id": 20, "barrier": false, "tasks": ["11.1"] },
    { "id": 21, "barrier": false, "tasks": ["11.2"] },
    { "id": 22, "barrier": false, "tasks": ["11.3", "11.5"] },
    { "id": 23, "barrier": false, "tasks": ["11.4"] },
    { "id": 24, "barrier": true, "checkpoint": "12", "tasks": ["12"] },
    { "id": 25, "barrier": false, "tasks": ["13.1", "13.2", "13.3", "13.4", "14.1", "14.3"] },
    { "id": 26, "barrier": false, "tasks": ["13.5", "13.6", "14.2"] },
    { "id": 27, "barrier": true, "checkpoint": "15", "tasks": ["15"] },
    { "id": 28, "barrier": false, "tasks": ["16.1"] },
    { "id": 29, "barrier": true, "checkpoint": "17", "tasks": ["17"] }
  ],
  "dependencies": {
    "1.1": [],
    "1.2": ["1.1"],
    "1.3": ["1.1"],
    "2": ["1.1", "1.2", "1.3"],
    "3.1": ["2"],
    "3.2": ["3.1"],
    "3.3": ["3.1"],
    "3.4": ["3.1"],
    "3.5": ["3.4"],
    "3.6": ["3.3"],
    "3.11": ["3.3"],
    "3.7": ["3.6"],
    "3.8": ["3.7"],
    "3.9": ["3.7"],
    "3.10": ["3.9"],
    "4": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11"],
    "5.1": ["4", "3.6"],
    "5.2": ["4"],
    "5.3": ["4"],
    "5.4": ["5.3"],
    "5.5": ["5.3"],
    "5.6": ["5.1", "5.2", "5.3"],
    "5.7": ["5.6"],
    "6.1": ["4"],
    "6.2": ["4"],
    "6.3": ["4"],
    "6.4": ["6.1", "6.2", "6.3", "3.6", "3.7"],
    "8.1": ["4"],
    "8.2": ["8.1", "1.3"],
    "8.3": ["8.1"],
    "8.5": ["8.1"],
    "8.4": ["8.3"],
    "8.6": ["8.1"],
    "8.7": ["8.2"],
    "8.8": ["8.5"],
    "7": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "6.1", "6.2", "6.3", "6.4"],
    "9.1": ["7"],
    "9.2": ["9.1"],
    "9.3": ["9.2"],
    "9.4": ["7"],
    "9.5": ["7", "3.6"],
    "9.6": ["8.2", "9.1", "9.2", "9.3", "9.4", "9.5"],
    "9.7": ["9.6"],
    "9.8": ["9.3"],
    "9.9": ["9.4"],
    "10": [
      "8.1",
      "8.2",
      "8.3",
      "8.4",
      "8.5",
      "8.6",
      "8.7",
      "8.8",
      "9.1",
      "9.2",
      "9.3",
      "9.4",
      "9.5",
      "9.6",
      "9.7",
      "9.8",
      "9.9"
    ],
    "11.1": ["10"],
    "11.2": ["11.1"],
    "11.3": ["11.2", "8.5", "1.3"],
    "11.4": ["11.3"],
    "11.5": ["11.2"],
    "12": ["11.1", "11.2", "11.3", "11.4", "11.5"],
    "13.1": ["12", "5.6"],
    "13.2": ["12"],
    "13.3": ["12", "1.2"],
    "13.4": ["12"],
    "13.5": ["13.1"],
    "13.6": ["13.2", "13.3", "13.4"],
    "14.1": ["12", "1.3"],
    "14.2": ["14.1"],
    "14.3": ["1.3"],
    "15": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "14.1", "14.2", "14.3"],
    "16.1": ["15", "6.4", "9.6", "5.7"],
    "17": ["16.1"]
  }
}
```
