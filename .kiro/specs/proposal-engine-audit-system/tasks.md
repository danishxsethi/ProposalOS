# Implementation Plan: Proposal Engine OS Audit System

## Overview

This plan builds — and then runs — the `Audit_System`: a repeatable, non-destructive audit engine (TypeScript, matching the SUA's Next.js stack and reusing the `fast-check` + `vitest` toolchain proven in `production-hardening`) that reconciles the INTENDED state (Notion) against the ACTUAL state (this repo) and emits findings, scores, and a Go/No-Go recommendation.

The engine is constructed in two foundational phases (engine scaffolding, then the isolated synthetic environment), then the audit-execution phases (P0–P4) build and run the 23 SUA-Scored Domain checks, and a final phase aggregates everything into scores, a prioritized remediation plan, and the production Go/No-Go.

Implementation language: **TypeScript** (the design's Data Models, interfaces, and `fast-check`/`vitest` testing strategy are all TypeScript-concrete; no pseudocode language choice is open).

Key invariants honored throughout:

- **Non-destructive**: no create/update/delete against production data, production infrastructure, or the Notion workspace. All live SUA execution is confined to the `Isolated_Synthetic_Execution_Environment`. Notion schema changes are emitted as `Open_Question` recommendations only.
- **14 correctness properties (P1–P14)** are the engine's own correctness gates, implemented with `fast-check` + `vitest`, **minimum 100 iterations each**, **one property = one property test**, each tagged `Feature: proposal-engine-audit-system, Property {n}: {text}`. Engine-Correctness Requirements (R1–R4, R27–R35) are validated by these tests and are **never** assigned a `Domain_Score`.
- **The 14 property tests (P1–P14) and the P0/security-critical integration tests are CORE (non-`*`) and MUST NOT be skipped** — they are the engine's correctness gates and the safety checks that make the "any Critical forces No-Go" model real (a skippable cross-tenant leak test would make that model hollow). Only genuinely redundant EXAMPLE/SMOKE fixture tests remain `*`-optional.

## Tasks

### Phase F — FOUNDATION (engine scaffolding before any audit can run)

- [x] 1. Build the engine foundation
  - [x] 1.1 Scaffold the engine package and core type system
    - Create the engine module tree (`lib/audit-engine/` or equivalent) with `vitest.config` wiring reused from the repo, and define all design Data Model interfaces/types: `CheckKind`, `Severity`, `ReconciliationStatus`, `Classification`, `EffortEstimate`, `Capability`, `IssueSignature`, `ToleranceBand`, `Check`, `Finding`, `OpenQuestion`, `BlockedCheck`, `RunHeader`, `DomainScore`, `ScorecardEntry`, `LatencyCostDistribution`, `SyntheticRunResult`, and the DB-transform row types.
    - Acceptance: types compile; `Finding` enforces all required fields; `effort_estimate` is the 5-value union; `domain` constrained to 1..23.
    - _Requirements: 1.1, 29.1_

  - [x] 1.2 Implement the Check Registry and execution kernel
    - Implement a registry of enumerable `Check` records (stable unique id, `kind`, `domain`, `requirement`, `intendedSource[]`, `actualSource[]`, `requiredCapabilities[]`, optional `toleranceBand`, `description`); expose an API that returns the complete list with ids, kinds, and targets. Build the kernel that executes registered checks and routes results to the four artifact sinks.
    - Acceptance: requesting the registry returns the full check list; a check with an unavailable capability becomes a `Blocked_Check` (never a silent pass); the registry contains the 23 SUA-Scored Domain checks PLUS a small set of engine-precondition/safety checks (e.g., sandbox isolation confirmation per task 5.3, capability probes) that carry `domain = null` and are NOT assigned a `Domain_Score` (reconciling with the registered isolation-confirmation check).
    - Evidence to capture: the registered-check list (ids, kinds, targets), with engine-precondition/safety checks (domain=null) distinguished from the 23 SUA-domain checks.
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 1.3 Write property test P1 — Static_Check byte-equality on unchanged Pinned_State (CORE)
    - **Property 1: Static_Check byte-equality on unchanged Pinned_State** — evaluate registered Static_Checks twice on the same unchanged `Pinned_State`; assert finding `id`s and `severities` are byte-for-byte identical across runs.
    - **Validates: Requirements 1.7**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 1: Static_Check byte-equality on unchanged Pinned_State`.

  - [x] 1.4 Implement Pinned_State capture and RunHeader
    - Capture the repo pin (`git rev-parse HEAD` + dirty-tree flag) and the Notion pin (per-page `sha256` of normalized content → `notionSnapshotHashes` + capture timestamp). Populate `RunHeader` (runId, pinnedState, priorLedgerVersion, capabilities, selfBudget, provisional).
    - Acceptance: "unchanged inspected state" is defined by matching recomputed Notion content hashes + git SHA; dirty tree recorded as `treeDirty=true`.
    - Evidence to capture: the Pinned_State (git SHA + Notion snapshot/timestamp + content hashes).
    - _Requirements: 1.7, 1.3_

  - [x] 1.5 Implement the capability precondition gate
    - Probe each capability (`notionRead`, `nonProdDb`, `gcpVertex`, `langSmith`, `testExecution`, `secretScan`, `costInstrumentation`); record available/unavailable sets in `RunHeader`; mark every dependent check `Blocked_Check` with the missing capability. The `costInstrumentation` probe MUST verify that `lib/costs/costTracker.ts` + `lib/config/costBudget.ts` actually emit a per-audit cost signal. When `notionRead` is unavailable, mark all reconciliation (R4) and all static-intended-source checks Blocked (pinning depends on Notion). When `costInstrumentation` is unavailable/unwired, mark the Domain 10 cost checks Blocked (never report null/zero as a measured Per_Audit_Cost). Keep Blocked_Checks in a list distinct from Open_Questions and Findings; flag affected domains' scores and Go/No-Go provisional.
    - Evidence to capture: per-run capability availability table (incl. Notion read-access status and the `costInstrumentation` status), Blocked_Check list, provisional-coverage flags per domain.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 1.6 Write property test P12 — Capability gate maps unavailable capabilities to Blocked_Checks (CORE)
    - **Property 12: Capability gate maps unavailable capabilities to Blocked_Checks** — for any capability-availability vector + check set, every check whose required capability is unavailable is a `Blocked_Check` (never passed), and the Blocked_Checks list is disjoint from Findings and Open_Questions.
    - **Validates: Requirements 2.1, 2.3, 2.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 12: Capability gate maps unavailable capabilities to Blocked_Checks`.

  - [x] 1.7 Implement the closed issue-signature taxonomy
    - Define the closed `IssueSignature` enum (16 members: `SpecWithoutCode`, `CodeWithoutSpec`, `FieldTypeMismatch`, `MissingControl`, `BoundaryViolation`, `OrderingDivergence`, `UngroundedClaim`, `MissingEvalBaseline`, `MissingSection`, `ToleranceBreach`, `ReplayOrAuthGap`, `IsolationGap`, `RetentionGap`, `ScrapingComplianceGap`, `DependencyRisk`, `ConfigDrift`) and a mapper that forces every (incl. LLM-judged) finding onto exactly one member; a finding outside the enum becomes an `Open_Question` (taxonomy gap).
    - _Requirements: 27.1, 4.7_

  - [x] 1.8 Implement Finding_Fingerprint and stable id derivation
    - Compute `fingerprint = normalize(domain) + normalize(actual_source) + issue_signature(closed enum) + (Runtime ? check_id : "")`; derive stable `id = stableHash(fingerprint)`. Normalize `actual_source` (path + symbol) so cosmetic differences do not yield false `New`. Flag fingerprint collisions of distinct findings as an `Open_Question`.
    - Evidence to capture: the fingerprint definition applied + per-finding fingerprint values.
    - _Requirements: 27.1, 27.2, 27.4, 27.5, 29.3_

  - [x] 1.9 Write property test P2 — Fingerprint determinism, id derivation, and normalization (CORE)
    - **Property 2: Fingerprint determinism, id derivation, and normalization** — fingerprint is a deterministic function of domain + normalized actual_source + closed-enum issue_signature (+ check_id for Runtime); cosmetic actual_source differences produce the same fingerprint/id; same enum member ⇒ same signature regardless of LLM prose; distinct enum members ⇒ distinct fingerprints.
    - **Validates: Requirements 27.1, 27.2, 27.4, 29.3, 1.7, 4.7**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 2: Fingerprint determinism, id derivation, and normalization`.

  - [x] 1.10 Implement the internal Findings_Schema with Unknown rules and effort-estimate validation
    - Enforce all required fields present/non-null — including the new required `workaround_available` boolean (an independent recorded attribute, NOT the High-vs-Medium discriminator; consumed by the Go/No-Go workaround clause); a non-populatable field is set to literal `Unknown` with a paired `Open_Question`; a Critical Finding may not carry `Unknown` in `intended_source`/`actual_source`/`evidence` (record a Blocked_Check or downgrade-pending Open_Question instead); enforce the `Unknown`-rate threshold (withhold PASS for affected domains when exceeded); reject/exclude any record whose `effort_estimate` is not exactly one of the 5 enum values with an error indication; emit a field-completeness summary.
    - Evidence to capture: internal findings record set (incl. `workaround_available` per finding), field-completeness summary, `Unknown` rate vs threshold, Critical-with-Unknown exclusion list.
    - _Requirements: 29.1, 29.2, 29.4, 29.5, 29.6, 29.7, 29.8_

  - [x] 1.11 Write property test P7 — Findings record completeness and Unknown rules (CORE)
    - **Property 7: Findings record completeness and Unknown rules** — every required field present/non-null (else literal `Unknown` + paired Open_Question); no Critical emitted complete with `Unknown` in intended_source/actual_source/evidence; over-threshold `Unknown` rate records a cap Finding and withholds PASS.
    - **Validates: Requirements 29.1, 29.4, 29.5, 29.6**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 7: Findings record completeness and Unknown rules`.

  - [x] 1.12 Write property test P8 — effort_estimate enum totality (CORE)
    - **Property 8: effort_estimate enum totality** — a candidate Finding is accepted iff `effort_estimate` is exactly one of the 5 enumerated values; otherwise excluded with an error indication naming the invalid value.
    - **Validates: Requirements 29.2, 29.7**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 8: effort_estimate enum totality`.

  - [x] 1.13 Implement the severity model and decision table
    - Classify every Finding as exactly one of Critical/High/Medium/Low using the documented IMPACT-based trigger table (High vs Medium is decided by impact, NOT by workaround availability); tenant data leakage / cross-tenant access is always Critical; when multiple triggers match, assign the highest; record the trigger that justifies each severity; record the independent `workaround_available` boolean as a separate attribute that does NOT influence the High/Medium decision (per revised R31.3).
    - Evidence to capture: impact-based severity rubric with trigger definitions + per-finding severity-justification table + the independent `workaround_available` value per finding.
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5_

  - [x] 1.14 Write property test P4 — Severity classifier totality, precedence, and leakage⇒Critical (CORE)
    - **Property 4: Severity classifier is total, single-valued, highest-precedence, and leakage⇒Critical** — returns exactly one severity equal to the highest-precedence matching trigger; any leakage/cross-tenant trigger ⇒ Critical regardless of other triggers.
    - **Validates: Requirements 31.1, 31.2, 31.5**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 4: Severity classifier is total, single-valued, highest-precedence, and leakage implies Critical`.

  - [x] 1.15 Implement the Domain_Score formula with floor and load-bearing Critical-cap
    - Compute `raw = 10 − Σ deduction(sev)` with `deduction = {Critical:5, High:4, Medium:2, Low:0.5}`; `floored = max(0, raw)`; cap to `min(floored, 3)` when the domain has ≥1 unresolved Critical, recording that the cap was applied. Apply ONLY to the 23 SUA-Scored Domains. Justify each score from its contributing findings.
    - Evidence to capture: scoring formula with deductions + per-domain scoring table with Critical-cap noted.
    - _Requirements: 32.1, 32.2, 32.5_

  - [x] 1.16 Write property test P5 — Domain_Score formula with floor and load-bearing Critical-cap (CORE)
    - **Property 5: Domain_Score formula with floor and load-bearing Critical-cap** — score equals `max(0, 10 − Σ deductions)` in [0,10]; a single Critical yields raw=5 → cap min(5,3)=3 (cap is load-bearing); deterministic; SUA-Scored Domains only.
    - **Validates: Requirements 32.1, 32.2**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 5: Domain_Score formula with floor and load-bearing Critical-cap`.

  - [x] 1.17 Implement the overall Production_Readiness_Score (security-weighted mean)
    - Compute `Σ(score_d × weight_d) / Σ(weight_d)` using the documented weights (Domain 3 = 3.0; Domains 8/4/5/6/15/20 = 2.0; Domains 18/17/23/10 = 1.5; all others = 1.0). Present as a NEW self-contained methodology; do not claim Scorecard equivalence.
    - _Requirements: 32.3_

  - [x] 1.18 Write property test P6 — Overall Production_Readiness_Score weighted mean (CORE)
    - **Property 6: Overall Production_Readiness_Score is the documented weighted mean** — equals `Σ(score_d × weight_d)/Σ(weight_d)`, lies in [0,10], reproducible from the domain scores.
    - **Validates: Requirements 32.3**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 6: Overall Production_Readiness_Score is the documented weighted mean`.

  - [x] 1.19 Implement the findings→Notion DB transform and schema-extension recommendation
    - Implement `toFindingsLibrary` (severity → `Impact Score` 1–10 + `Finding Type`; `effort_estimate` direct; rich evidence → notes text; `Evidence Links` = single URL pointer; `Root Cause Category` from issue signature) and `toQaTestCase` (severity → native `Severity`). Never emit a property absent from the verified live schema. Record missing-property gaps (`Severity`, `Domain`, `Intended Source`, `Actual Source`, rich-evidence) as schema-extension Open_Questions, stating the engine cannot apply the change to Notion.
    - Evidence to capture: per-database field-mapping tables, the severity→Impact Score/Finding Type derivation, schema-extension Open_Questions.
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

  - [x] 1.20 Write property test P9 — Database transform correctness against verified live schemas (CORE)
    - **Property 9: Database transform correctness against verified live schemas** — `FindingsLibraryRow` yields only properties that exist in the live schema (Impact Score ∈ 1..10, Finding Type ∈ enum, Effort Estimate direct, Evidence Links single URL); `QaTestCaseRow` maps severity directly; never emits an absent property.
    - **Validates: Requirements 30.1, 30.2, 30.3**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 9: Database transform correctness against verified live schemas`.

  - [x] 1.21 Implement the cached prior-findings ledger and New/Regression/Confirms-Prior classification
    - Perform a one-time LLM extraction normalizing each prior finding from `AUDIT_REPORT*.md`, the Notion 12-part System Audit / A2Z / Completion Audit, AND `production-hardening`'s resolved findings into the same closed taxonomy + normalized `actual_source`; require a one-time human review/sign-off of the extracted ledger (the fingerprints + classifications of each prior finding) BEFORE it is frozen/pinned, recording the ledger version + reviewer sign-off (reviewer + timestamp); then cache, pin, and version-control the reviewed frozen ledger (`priorLedgerVersion`). Classify each current Finding by fingerprint match against the reviewed frozen ledger: `New` / `Regression` (prior resolved) / `Confirms-Prior` (prior still open). Never re-extract prior prose live; subsequent runs match against the reviewed frozen ledger.
    - Evidence to capture: the per-finding fingerprint match table against prior audit sources, the frozen-ledger version with its one-time human-review/sign-off record (reviewer + timestamp).
    - _Requirements: 1.8, 27.3, 27.6, 26.5_

  - [x] 1.22 Write property test P3 — New/Regression/Confirms-Prior classification is total and deterministic (CORE)
    - **Property 3: New/Regression/Confirms-Prior classification is total and deterministic** — classification returns exactly one label, determined purely by fingerprint match against the cached version-pinned ledger (incl. production-hardening resolved findings); repeated calls return the same label.
    - **Validates: Requirements 1.8, 27.3, 26.5**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 3: New/Regression/Confirms-Prior classification is total and deterministic`.

  - [x] 1.23 Implement dual-citation enforcement
    - For every Finding, require ≥1 `Intended_Source` AND ≥1 `Actual_Source`, or an explicit recorded reason one side is absent.
    - _Requirements: 4.1_

  - [x] 1.24 Write property test P10 — Dual-citation completeness (CORE)
    - **Property 10: Dual-citation completeness** — every emitted Finding cites ≥1 Intended_Source and ≥1 Actual_Source, or records an explicit reason one side is absent.
    - **Validates: Requirements 4.1**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 10: Dual-citation completeness`.

  - [x] 1.25 Implement the Audit System self-budget cap
    - Enforce a configured max total run time and max LLM/compute cost; size the caps so a normal run completing the Default_Sample (8–10/industry × ≥5 industries) does NOT trip either cap, and record a Finding if the caps cannot accommodate the Default_Sample. On cap-hit: stop launching checks, finalize completed work, emit a partial report listing completed vs not-run domains/checks, record own measured runtime/cost in `RunHeader`, and flag Go/No-Go provisional.
    - Evidence to capture: configured caps, Default_Sample sizing reconciliation, measured runtime/cost, partial-report coverage list (if applicable).
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6_

  - [x] 1.26 Implement the four artifact sinks
    - Wire the kernel outputs to: (1) machine-readable findings set (each with id, severity, source check id, check kind, classification), (2) human-readable summary report (id, severity, classification), (3) Open_Questions register (separate from Findings and Blocked_Checks), (4) Blocked_Checks list.
    - Evidence to capture: machine findings set + human report + Open_Questions register + Blocked_Checks list.
    - _Requirements: 1.5, 1.6, 35.3, 35.4_

  - [x] 1.27 Implement the Go/No-Go verdict function
    - Emit exactly one of `Go` / `Conditional-Go` / `No-Go`: any unresolved Critical ⇒ No-Go; unresolved High count ≥ Y (≥10) ⇒ No-Go; High count ≥ X (≥5) ⇒ at most Conditional-Go; any unresolved High with `workaround_available = false` ⇒ at most Conditional-Go (the workaround clause bites ONLY on this real subset, keeping the X≥5/Y≥10 count thresholds, so a clean `Go` is reachable when Highs are below X and every unresolved High has `workaround_available = true`); mark provisional when Blocked_Checks or a cap reduced coverage.
    - _Requirements: 34.2, 34.3, 34.4_

  - [x] 1.28 Write property test P11 — Go/No-Go verdict rules are total and monotonic (CORE)
    - **Property 11: Go/No-Go verdict rules are total and monotonic** — verdict is exactly one of {Go, Conditional-Go, No-Go}; any Critical ⇒ No-Go; High ≥ Y(≥10) ⇒ No-Go; High ≥ X(≥5) ⇒ at most Conditional-Go; any unresolved High with `workaround_available = false` ⇒ at most Conditional-Go (the workaround clause bites only on this real subset, so a clean Go is reachable when Highs are below X and every unresolved High has `workaround_available = true`); adding a higher-severity finding never improves the verdict.
    - **Validates: Requirements 34.2, 34.3, 34.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 11: Go/No-Go verdict rules are total and monotonic`.

- [x] 2. Checkpoint — Foundation
  - Ensure all tests pass, ask the user if questions arise.

### Phase E — ISOLATED SYNTHETIC EXECUTION ENVIRONMENT

- [x] 3. Build the isolated synthetic execution environment
  - [x] 3.1 Provision the non-production Postgres and pre-run isolation confirmation
    - Connect to a dedicated synthetic Postgres; inspect configuration to confirm the DB target (and later Stripe endpoints) are non-production before any run begins; if isolation cannot be confirmed, record a `Blocked_Check` and start no run. Forbid all production/Notion reads/writes during synthetic runs.
    - Evidence to capture: synthetic-environment configuration (DB target), the pre-run isolation confirmation.
    - _Requirements: 3.1, 3.2, 3.6_

  - [x] 3.2 Write example/smoke test for the isolation-confirmation guard
    - Assert no run starts when isolation cannot be confirmed (Blocked_Check recorded); assert the Notion-read capability probe wiring.
    - _Requirements: 3.6, 2.1_

  - [x] 3.3 Provision per-test tenant namespaces and distinguish persistent fixtures from per-run artifacts
    - Replace the single global "seed 2 tenants" model with PER-TEST TENANT NAMESPACES: each sandbox-dependent runtime check gets its own freshly-seeded, uniquely-namespaced (`tenantNamespace = check_id + runId`) tenant set of ≥2 tenants (seeded via `lib/tenant/TenantProvisioningService.ts` against the synthetic DB), so cross-tenant retrieval (R7.4) and concurrency scoping (R24.2) hold PER CHECK, not globally, and a destructive check (e.g. RTBF) deletes only within its own namespace. Distinguish two data classes: PERSISTENT SEEDED FIXTURES (deterministic tenant baselines a check needs as a precondition — never removed by per-run teardown; re-seeded deterministically before the next dependent check if a destructive check consumed them) and PER-RUN ARTIFACTS (rows a run creates while executing — the only rows torn down).
    - Acceptance: every sandbox-dependent runtime check is either per-test-namespaced (preferred, to preserve the R24 load signal) OR serialized so it never overlaps a destructive or seed-mutating check; the shared LLM spend cap is budgeted so the Default_Sample synthetic runs (task 9.1) do NOT consume the entire cap and starve other runtime checks (cross-tenant, RTBF, concurrency, injection, webhook, PII over-fetch) of their share.
    - Evidence to capture: the per-namespace seed map (namespace → tenant ids), the persistent-fixture vs per-run-artifact classification, the spend-cap budget allocation across checks.
    - _Requirements: 3.1, 33.5, 33.8_

  - [x] 3.4 Wire Stripe TEST mode with a non-TEST abort guard
    - Use Stripe TEST keys only (`lib/stripe/pricingService.ts`, `lib/billing/`); if a run would issue a real (non-TEST) charge or write a production datastore, abort the run, leave external systems unchanged, and record a Critical Finding citing the attempted side effect.
    - Evidence to capture: Stripe TEST mode flag in the env config.
    - _Requirements: 3.1, 3.4_

  - [x] 3.5 Write example test for the Stripe non-TEST abort guard
    - Assert an attempted non-TEST charge aborts the run, leaves external systems unchanged, and records a Critical Finding.
    - _Requirements: 3.4_

  - [x] 3.6 Enforce the LLM spend cap for synthetic execution
    - When the configured synthetic-execution spend cap is reached, stop launching further synthetic runs and record the cap event.
    - Evidence to capture: the spend-cap configuration and any cap event.
    - _Requirements: 3.5_

  - [x] 3.7 Implement finally-guaranteed teardown of per-run artifacts (per-namespace) across all exit paths
    - In a `finally` block of the sandbox lifecycle, tear down ONLY the PER-RUN ARTIFACTS created by a run (Audit, Proposal, Finding, billing artifacts) WITHIN the run's own tenant namespace, so it runs on every exit path: success, Stripe-abort, isolation-unconfirmed, and spend-cap-hit. Teardown MUST NOT remove the PERSISTENT SEEDED FIXTURES a subsequent dependent check needs; where a destructive check consumed its seed, re-seed deterministically before the next dependent check rather than relying on shared survivors. Capture the teardown log per namespace.
    - Evidence to capture: the post-run per-namespace teardown log (per-run artifacts removed; persistent fixtures preserved/re-seeded).
    - _Requirements: 3.2, 3.3_

  - [x] 3.8 Provision the orchestration substrate
    - Stand up LangGraph in-process; stand up Temporal in dev mode when available else a documented semantics-preserving stub (idempotency/retry/timeout); stub LangSmith, n8n, and Dify. When a real substrate is required and unavailable, mark dependent checks `Blocked_Check` naming the missing substrate (never silently Blocked). Record per dependent reliability finding which substrate backed it (`substrateBacking: "real-dev" | "stub"`); when the Stub_Substrate backs a Domain 5 finding, that finding and the Domain 5 score are PROVISIONAL, and the provisional status propagates into `RunHeader.provisional` and the Go/No-Go (consumed by tasks 6.3 and 12.2).
    - Evidence to capture: substrate provisioning table (component → real-dev/stub/blocked), the provisional-propagation note for stub-backed Domain 5 findings.
    - _Requirements: 3.1, 11.1, 11.2, 11.4, 11.6, 2.3_

  - [x] 3.9 Implement the industry fixtures for ≥5 verticals
    - Provide representative synthetic business inputs for at least 5 distinct verticals (e.g., restaurant, dentist, law-firm, HVAC, gym, salon, retail, real-estate, veterinary, contractor).
    - _Requirements: 33.1_

  - [x] 3.10 Implement the Default_Sample vs Deep_Run harness with per-run capture
    - Configurable per-industry run count: Default_Sample N = 8–10/industry (yields non-provisional verdict, p50/p95 only, p99 flagged unavailable); opt-in Deep_Run N ≥ 20/industry (p50/p95/p99, may be provisional only if it exceeds self-budget). Capture per run: input, modules executed, diagnosis, proposal, quality score, latency, `Per_Audit_Cost`, synthetic tenant id; record a Finding when a run fails to produce a proposal; verify outputs are scoped to the synthetic tenant.
    - Evidence to capture: per-industry run log (input → modules → diagnosis → proposal → score → latency → cost), tenant-scope verification.
    - _Requirements: 33.2, 33.4, 33.6, 33.7, 33.8, 28.2_

  - [x] 3.11 Implement percentile computation with cold-start separation and volume-appropriate latency gating
    - Tag the first run(s) after a cold container start as `coldStart=true` and report them as a separate distribution, never averaged into warm p50/p95/p99; compute `computePercentiles(sorted, [50,95,99])` (nearest-rank) per industry and overall for latency and `Per_Audit_Cost`. The 30s latency GATE is evaluated on warm-run p50 at Default_Sample (p95/p99 reported informationally but NOT gated, since at N=8–10 p95 ≈ the single worst run); the p95 gate applies only at Deep_Run (N≥20).
    - _Requirements: 16.2, 16.3, 16.7, 33.3_

  - [x] 3.12 Write property test P13 — Percentile computation with cold-start partition (CORE)
    - **Property 13: Percentile computation with cold-start partition** — warm percentiles satisfy p50 ≤ p95 ≤ p99; no cold-start sample contributes to the warm distribution; a Default_Sample reports only p50/p95 (p99 unavailable) and the 30s latency GATE is evaluated on warm-run p50 at Default_Sample; a Deep_Run reports p99 and gates on warm-run p95.
    - **Validates: Requirements 16.2, 16.3, 16.7, 33.3, 33.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 13: Percentile computation with cold-start partition`.

  - [x] 3.13 Implement Tolerance_Band defaults and the threshold-decision function
    - Configure defaults: latency ±15% (floor ±250 ms), cost ±10% (floor ±$0.01), quality ±0.5 points. A value moving only within band never changes finding identity; record a Finding iff the value is outside band / over budget. Implement the hard gates separately from identity bands (e.g., the ≥8/10 quality gate fails a 7.9 even within the ±0.5 identity band; `Per_Audit_Cost` below $0.06 is an informational Low Finding, not a failure). The latency gate is evaluated on warm-run p50 at Default_Sample and warm-run p95 at Deep_Run (per task 3.11).
    - _Requirements: 16.3, 16.5, 16.6, 10.5, 12.3, 12.4_

  - [x] 3.14 Write property test P14 — Threshold decision over measured values respects Tolerance_Band (CORE)
    - **Property 14: Threshold decision over measured values respects Tolerance_Band** — records a Finding iff the measured value is outside band/over budget; cost below $0.06 ⇒ informational Low; the ≥8 quality gate evaluates the measured score (7.9 fails); the 30s latency gate evaluates warm-run p50 at Default_Sample (p95 at Deep_Run); within-band movement never changes identity.
    - **Validates: Requirements 16.3, 16.4, 16.5, 16.6, 10.5, 12.3, 12.4**
    - fast-check + vitest, ≥100 iterations, tagged `Feature: proposal-engine-audit-system, Property 14: Threshold decision over measured values respects Tolerance_Band`.

- [x] 4. Checkpoint — Isolated Synthetic Environment
  - Ensure all tests pass, ask the user if questions arise.

### Phase P0 — Critical Safety checks (any Critical here forces No-Go)

- [x] 5. Build and run the P0 Critical Safety domain checks
  - [x] 5.1 Implement tenant-isolation defense-in-depth + BYPASSRLS role check (Domain 3, R7)
    - Enumerate 100% of tenant-scoped data paths via an AST/static scan of EVERY `PrismaClient` (and equivalent DB-client) call site AND every raw-SQL entry point in the repository — so "100%" means "every query-construction location was inspected," not "every path the reviewer happened to find" — cross-referencing `lib/tenant/context.ts`, `lib/auth/wrappedPrismaAdapter.ts`, `middleware.ts`, RLS docs; require BOTH an active DB-layer RLS policy AND an adapter-level `tenantId` filter per path (single-layer-only ⇒ Critical); verify no application DB role is table-owner-with-implicit-bypass or holds `BYPASSRLS` (any ⇒ Critical); verify every tenant-owned Prisma model has a `tenantId` + both controls; verify `crossTenantIntelligence.ts` aggregates only through anonymization controls (raw exposure ⇒ Critical).
    - Evidence to capture: the AST/static-scan method, the enumerated tenant-path call-site inventory (file:line per `PrismaClient`/DB-client call site and per raw-SQL entry point) with both isolation layers per path, DB-role/BYPASSRLS check output, RLS coverage cross-reference, per-model `tenantId`/control map.
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8_

  - [x] 5.2 Write integration test — synthetic cross-tenant retrieval (R7.4) (CORE — P0 safety)
    - In the sandbox, create data under synthetic tenant A and assert it is unretrievable under tenant B (zero foreign-tenant records); on leakage record a Critical Finding and set Go/No-Go to No-Go.
    - Evidence to capture: synthetic cross-tenant isolation test result (tenant ids used, per-tenant record counts).
    - _Requirements: 7.4_

  - [x] 5.3 Implement the sandbox isolation-confirmation P0 gate check (R3.6)
    - Register a P0 check that asserts the pre-run isolation confirmation (DB + Stripe endpoints non-production) passed before any synthetic run; record a `Blocked_Check` if isolation is unconfirmable.
    - _Requirements: 3.6_

  - [x] 5.4 Implement Security, Privacy & Compliance checks incl. secret scan/gitleaks (Domain 8, R14)
    - Verify authn/authz controls (`lib/auth/rbac.ts`, `lib/middleware/auth.ts`, `withRole.ts`, `middleware.ts`) enforce the Risk Register access model; run gitleaks over tree/history (Static) and record a Critical Finding for any plaintext secret; verify PII handling (`piiScrubber.ts`, `inputSanitizer.ts`); map each Risk Register risk to its mitigating control; reconcile accepted-risks (annotate, do not re-fire); allow documented suppression only with justification + Risk Register reference (list suppressed separately); flag unauthorized tenant-data route exposure ≥High (Critical if cross-tenant).
    - Evidence to capture: risk-register-to-control mapping (incl. accepted-risk status), secret-scan results, PII-control trace, route authorization inventory, suppressed-findings list.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 5.5 Implement webhook signature/replay checks (Domain 17, R18)
    - Verify every inbound handler in `lib/integrations/webhooks.ts` validates a cryptographic signature before acting (acting-before-verify ⇒ ≥High) and enforces replay protection (timestamp/window and/or nonce/event-id dedup).
    - Evidence to capture: per-handler signature-verification trace + replay-protection mechanism.
    - _Requirements: 18.1, 18.2, 18.5_

  - [x] 5.6 Write integration test — webhook invalid-signature and replay (R18.3, R18.4) (CORE — P0 safety)
    - Submit a webhook with an invalid signature and assert rejection without side effects; replay a previously valid webhook and assert it is processed at most once.
    - Evidence to capture: invalid-signature and replay test results.
    - _Requirements: 18.3, 18.4_

  - [x] 5.7 Implement the prompt-injection canary oracle (Domain 15, R8)
    - Verify untrusted scraped input is sanitized/bounded (`inputSanitizer.ts`) and `urlValidator.ts` rejects disallowed schemes/SSRF targets before fetch; implement the steered-oracle (structure deviation, role-break/forbidden-string, cross-tenant leakage, format/target change) with embedded canary markers; a successful injection ⇒ Finding ≥High; record injection findings separately from grounding/hallucination findings. Record that a PASS = "no canary tripped" is a LOWER BOUND on injection resistance, NOT proof of injection-immunity (subtle semantic steering may evade the oracle); emit an Open_Question recommending periodic manual adversarial review.
    - Evidence to capture: sanitizer/URL-validator control trace, injection-payload inputs + resulting outputs, separation from grounding findings, the recorded lower-bound limitation note + semantic-steering Open_Question.
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.8 Write integration test — prompt-injection resistance via canary oracle (R8.2) (CORE — P0 safety)
    - In a synthetic run, supply injection payloads and assert the canary effect is absent (token not emitted, format unchanged, template structure holds); record a Finding if behavior is altered.
    - Note: a PASS = "no canary tripped" = a LOWER BOUND on injection resistance, NOT proof of injection-immunity; subtle semantic steering may evade the oracle. Emit an Open_Question recommending periodic manual adversarial review (R8.6).
    - _Requirements: 8.2, 8.6_

  - [x] 5.9 Implement legal/scraping robots.txt + politeness checks and the ToS Open_Question (Domain 23, R36)
    - Statically inspect each scraper (`lib/modules/gbp.ts`, `reputation.ts`, `website.ts`, `seoDeep.ts`, `urlValidator.ts`) for `robots.txt` compliance + a rate/politeness control before fetch; assess single-source fragility / missing breakage-fallback; for each scraped source (Google Business Profile, Yelp, etc.) check for a documented ToS review and record an `Open_Question` requesting the legal determination where undocumented/contested (never assert compliance); a disallowed/ToS-prohibited fetch ⇒ Finding ≥High.
    - Evidence to capture: per-scraper robots.txt/politeness trace, per-source ToS-review status table, scraping-fragility/single-source inventory with breakage-handling status, ToS Open_Questions.
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5_

  - [x] 5.10 Write integration test — scraper robots.txt/politeness enforcement (R36.1, R36.5) (CORE — P0 safety)
    - In a synthetic run, confirm scrapers honor `robots.txt` and apply a rate/politeness control; assert a disallowed fetch produces a Finding ≥High.
    - _Requirements: 36.1, 36.5_

### Phase P1 — Reliability & Data Contracts

- [x] 6. Build and run the P1 Reliability & Data Contracts domain checks
  - [x] 6.1 Implement the data-contract schema diff (Domain 2, R6)
    - Field-by-field compare every `prisma/schema.prisma` model (incl. `Audit`, `AuditJob`, `Finding`, `Proposal`, `Tenant`, `AuditTrailEvent`) against the Data Contract Spec / Data Model & Contracts pages; record spec-without-code, code-without-spec, and type/nullability/relation conflicts; verify each migration in `prisma/migrations/` is consistent and no contract-required model lacks a migration.
    - Evidence to capture: per-model field comparison table (Static, byte-reproducible), migration consistency output, citations to both contract pages.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Write fixture (example) test for schema-diff correctness
    - Assert the static schema diff produces deterministic, correct findings against known-good and known-drifted Prisma/contract fixtures.
    - _Requirements: 6.1_

  - [x] 6.3 Implement orchestration reliability, idempotency, and degraded-mode checks (Domain 5, R11)
    - Verify idempotency controls (`lib/pipeline/idempotency.ts`, `lib/middleware/idempotency.ts`, runner idempotency keys) match the Temporal Workflow Spec; verify retry/timeout/dead-letter behavior (`circuitBreaker.ts`, `deadLetterQueue.ts`, `saga.ts`, `lib/resilience/`); verify each LangGraph node in the diagnosis/proposal graphs maps to a spec node + output contract; record a Finding for duplicate side effects. Record `substrateBacking` (`"real-dev"` vs `"stub"`) per reliability finding; flag every stub-backed Domain 5 finding AND the Domain 5 score PROVISIONAL (validating a stub's re-implementation of Temporal guarantees does not prove production behavior), propagating the provisional flag for task 12.2 to consume.
    - Evidence to capture: idempotency replay output, retry/timeout config comparison, degraded-mode trigger trace, graph-node-to-spec mapping, the per-finding substrate-backing record (real-dev vs stub) with resulting provisional flags on Domain 5 findings and score.
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6_

  - [x] 6.4 Write integration test — idempotency replay + degraded-mode/module-failure isolation (R11.3, R11.5)
    - Re-process the same input and assert no duplicate side effects; inject a module/stage failure and assert the system enters the documented degraded mode and the audit still completes.
    - _Requirements: 11.3, 11.5_

  - [x] 6.5 Implement the module registry coverage + fallback check (Domain 7, R13)
    - Compare modules in `lib/audit/modules.ts` / `lib/modules/` against the Audit Modules Registry DB; record registry-without-implementation (spec-without-code) and implementation-without-registry (code-without-spec) drift.
    - Evidence to capture: module registry-vs-implementation table (Static, byte-reproducible).
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 6.6 Write fixture + integration test — registry diff and single-module-failure isolation (R13.4, R13.5)
    - Fixture-test the registry diff determinism; in a synthetic run, fail a single module and assert the overall audit completes with that module marked degraded (no cascading abort).
    - Evidence to capture: single-module-failure isolation trace.
    - _Requirements: 13.4, 13.5_

  - [x] 6.7 Implement concurrency & load behavior checks (Domain 21, R24)
    - Verify concurrency controls (`lib/audit/concurrency.ts`, `batchProcessor.ts`, `lib/queue/`) match the Temporal Workflow Spec limits/queueing; run concurrent multi-tenant synthetic runs and assert outputs stay tenant-scoped and uncorrupted; measure under-load p50/p95/p99 latency; assert over-limit work is queued/rejected; record ≥High on corruption/deadlock/lost-update/tenant-scope breach.
    - Evidence to capture: concurrency-control-vs-spec comparison, concurrent-run tenant-scope verification, under-load latency distribution, over-limit queueing/rejection behavior.
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [x] 6.8 Implement data lifecycle, retention & RTBF checks across enumerated derived stores (Domain 20, R23)
    - Verify a retention policy exists (`lib/retention/`) per data class vs Risk Register; verify backups exist with scope/cadence vs Rollout Plan/Risk Register; verify an RTBF deletion path removes tenant PII across primary AND each enumerated derived store — LLM/response caches (`lib/llm/cache.ts`), LangSmith traces, application logs, cross-tenant aggregates (`crossTenantIntelligence.ts`); record a Finding for any store retaining retrievable PII.
    - Evidence to capture: retention-policy-to-data-class map, backup configuration, enumerated-derived-store list, deletion-path inventory across primary + each derived store.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.6_

  - [x] 6.9 Write integration test — RTBF deletion across primary and each enumerated derived store (R23.4, R23.5) (CORE — P0 safety)
    - In a synthetic run, request deletion of a synthetic tenant's data and assert PII is unretrievable from the primary store and from each enumerated derived store.
    - Evidence to capture: synthetic deletion verification (per-store unretrievability check).
    - _Requirements: 23.4, 23.5_

  - [x] 6.10 Implement dependency & supply-chain security checks (Domain 19, R22)
    - Inventory deps from `package.json`/`package-lock.json`; run `npm audit` (or equivalent) and flag vulnerabilities at/above the stated threshold; verify all direct deps are lockfile-pinned; check licenses against policy; verify a CI supply-chain/secret scan gate exists in `.github/workflows/`; flag typosquat/suspicious packages.
    - Evidence to capture: dependency inventory, vulnerability scan output, license report, CI scan-gate configuration.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

- [x] 7. Checkpoint — P0 + P1
  - Ensure all tests pass, ask the user if questions arise.

### Phase P2 — AI Quality & Evals

- [x] 8. Build and run the P2 AI Quality & Evals domain checks
  - [x] 8.1 Implement prompt fidelity & grounding checks (Domain 4, R10)
    - Compare prompts in `prompts/` and `lib/llm/` against the Prompt & Content Spec using the approved-baseline definition (R9.4), recording deviations in tone/guardrails/claim policy; verify anti-hallucination/grounding controls (`output-validator.ts`, `hallucinationTelemetry.ts`) implement the claim policy; record a Drift Finding if the configured model in `lib/config/models.ts` differs from the spec; record a Finding when measured `LLM_Cost_Subset` exceeds its LLM allocation (without redefining the total band) and when latency >30s.
    - Evidence to capture: prompt-vs-spec diffs, grounding-control trace, measured `LLM_Cost_Subset` and latency per run with Tolerance_Bands.
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6_

  - [x] 8.2 Implement learning-loop & self-evolving prompt safety checks (Domain 16, R9)
    - Verify automated prompt changes from `lib/pipeline/learningLoop.ts` are regression-gated against an eval baseline before promotion, bounded within a defined drift limit, and have an approval + rollback path (ungated/unbounded/un-revertible ⇒ ≥High); reconcile the fidelity baseline as the most-recently-approved prompt version.
    - Evidence to capture: learning-loop promotion path, regression-gate + drift-bound config, rollback mechanism, fidelity-baseline reconciliation note.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.3 Implement proposal quality dual-scoring with the independent rubric and agreement check (Domain 6, R12)
    - Compare proposal structure (`template-system.ts`, `runner.ts`) section-by-section to the Proposal Template Spec; score each synthetic proposal with BOTH the in-repo scorer (`lib/qa/proposal-quality-scorer.ts`, `ProposalQAService.ts`) AND the independent spec-defined rubric (weighted dimensions; no scorer code reuse), recording a Finding for any proposal <8/10 on either method (hard gate; 7.9 fails); when the two methods disagree by >0.5 (quality band), record a Finding citing the in-repo scorer as a potential error source; verify pricing logic vs the Proposal Packages & Pricing DB; flag ungrounded claims.
    - Evidence to capture: template section conformance table, per-proposal scores from both methods, scorer-vs-rubric agreement analysis, pricing comparison, ungrounded-claim list.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 8.4 Implement spec↔code LLM-judged reconciliation + Architecture & Data Flow trace (Domain 1, R5; engine R4.7)
    - Build the LLM-judged reconciliation engine that compares prose Notion specs (System Architecture Spec, End-to-End Architecture) to code semantics (`lib/audit/runner.ts`, `lib/orchestrator/`, `lib/graph/`), mapping each judgment onto exactly one closed-taxonomy `issue_signature` (prose retained as evidence only) and keying findings on the fingerprint; trace the audit-to-proposal flow stage-by-stage, flag spec-without-code / code-without-spec / ordering divergence, and verify stage handoffs preserve required fields (`dataBus.ts`).
    - Evidence to capture: stage-by-stage trace table (spec stage → repo file:function → status), data-handoff field comparison, citations to both architecture pages.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 4.7_

### Phase P3 — Performance & Economics

- [x] 9. Build and run the P3 Performance & Economics domain checks
  - [x] 9.1 Execute synthetic end-to-end audit runs across ≥5 industries (engine R33)
    - Drive the harness (task 3.10) to run the full input→diagnosis→proposal flow across ≥5 verticals at the Default_Sample (8–10/industry) inside the sandbox, against seeded synthetic tenants + Stripe TEST + LLM spend cap, with post-run teardown; record per-industry Findings when results vary beyond Tolerance_Band (e.g., quality <8/10 or out-of-band latency/cost).
    - Evidence to capture: per-industry run log with captured artifacts and tenant-scoped outputs; teardown confirmation.
    - _Requirements: 33.1, 33.5, 33.6, 33.9_

  - [x] 9.2 Implement measured latency + Per_Audit_Cost percentile checks with cold-start separation and the cost-conflict Open_Question (Domain 10, R16)
    - Own the canonical `Per_Audit_Cost` (LLM tokens + infra/compute + third-party) measured via `costTracker.ts`/`costBudget.ts`; when the `costInstrumentation` capability (task 1.5) is unavailable/unwired, mark the Domain 10 cost checks as Blocked_Checks (NOT null/zero cost) and flag the domain provisional; report p50/p95/p99 distributions per industry with cold-start separated (Default_Sample → p50/p95, p99 flagged unavailable); evaluate the 30s latency GATE on warm-run p50 at Default_Sample (p95/p99 reported but not gated) and on warm-run p95 only at Deep_Run; record a Finding when the gated latency exceeds 30s and when p50 cost is outside $0.06–0.10 (below-band ⇒ informational Low); declare default Tolerance_Bands; record the Open_Question citing BOTH the $0.06–0.10 band AND the Scorecard's $0.50/audit target and mark the cost verdict provisional while the conflict is open.
    - Evidence to capture: per-run latency/cost, p50/p95/p99 per industry with cold-start separated, the gated latency metric used per sample volume (p50 at Default_Sample, p95 at Deep_Run), stage-level latency breakdown, cost-driver breakdown, `costInstrumentation` status and any Blocked_Check it triggered, declared Tolerance_Bands, the cost-conflict Open_Question.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

  - [x] 9.3 Implement rate-limiting & economic-abuse resistance checks (Domain 18, R21)
    - Verify rate limiting (`lib/middleware/rateLimit.ts`) is applied to audit-triggering / cost-incurring endpoints; verify a per-tenant spend cap exists and blocks further cost-incurring work when exceeded; flag any unbounded audit-invocation/cost path ≥High.
    - Evidence to capture: endpoint-to-rate-limit map, per-tenant spend-cap configuration, throttle/cap enforcement test results.
    - _Requirements: 21.1, 21.2, 21.5_

  - [x] 9.4 Write integration test — rate-limit throttling and per-tenant spend-cap enforcement (R21.3, R21.4) (CORE — security/economic-abuse)
    - Issue requests exceeding the rate limit and assert throttle/reject (no unbounded audits); drive a synthetic tenant's spend to its cap and assert further cost-incurring operations are blocked.
    - _Requirements: 21.3, 21.4_

### Phase P4 — Docs/Traceability & Remediation checks

- [x] 10. Build and run the P4 Docs/Traceability domain checks
  - [x] 10.1 Implement forward/reverse coverage and drift quantification (Domain 14, R26)
    - Produce a forward coverage report (each Intended_Source → does an Actual_Source exist) and a reverse coverage report (each major Actual_Source area → does a governing Intended_Source exist); record documentation-drift Findings for stale specs; quantify drift as a percentage of audited capabilities in each Reconciliation_Status (incl. `Partially-Aligned`); record a Regression Finding (via fingerprint) where a prior audit finding marked resolved is found unresolved.
    - Evidence to capture: forward and reverse coverage reports, drift percentages by status, regression list vs prior audits.
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 10.2 Implement mode-specific feature-flag correctness checks (Domain 12, R19)
    - Compare flag definitions in `lib/config/feature-flags.ts` / `FeatureFlagService.ts` against the Feature Flag Matrix and the three mode PRDs; record spec-without-code and code-without-spec flag drift; verify per mode (Internal Agency / White-Label / B2C) exactly its PRD-defined capabilities; flag cross-mode capability exposure.
    - Evidence to capture: flag-matrix comparison table, per-mode capability map, cross-mode exposure trace.
    - _Requirements: 19.1, 19.2, 19.3, 19.5_

  - [x] 10.3 Write fixture (example) test for the feature-flag matrix comparison
    - Assert the static flag-matrix diff is deterministic and correct against known-good and known-drifted flag/matrix fixtures.
    - _Requirements: 19.1_

  - [x] 10.4 Implement deployment & ops readiness checks (Domain 13, R20)
    - Verify deploy config (`Dockerfile`, `cloudbuild*.yaml`, `terraform/`, `cron.yaml`) matches the Rollout Plan Cloud Run targets; verify required env vars are validated at startup (`validateEnv.ts`) and documented in `.env.example`; verify a rollback path matches the Incident Response & Rollback SOP; verify SOP runbooks have implemented capabilities; record spec-without-code drift for any deploy step lacking pipeline config.
    - Evidence to capture: deploy-config-vs-rollout-plan comparison, env-variable validation map, rollback-path verification, runbook-to-capability mapping.
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 10.5 Implement frontend & API contract + runtime PII over-fetch checks (Domain 22, R25)
    - Statically verify `app/api/` route handlers conform to the Data Contract / OpenAPI shapes and auth/role requirements; during synthetic runs inspect actual API responses + client-delivered payloads for fields beyond contract authorization (other-tenant data, internal-only fields, secrets — cross-tenant exposure ⇒ Critical); verify error responses do not leak stack traces/internal ids/PII.
    - Evidence to capture: route-to-contract conformance table, client-payload field inventory, auth-requirement comparison, error-response inspection.
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

  - [x] 10.6 Write integration test — runtime API/client PII over-fetch (R25.2, R25.5) (CORE — cross-tenant exposure)
    - During a synthetic run, assert API/client payloads carry only contract-authorized fields and that no cross-tenant/internal/secret field is over-exposed.
    - _Requirements: 25.2, 25.5_

  - [x] 10.7 Implement the bidirectional reconciliation traceability matrix (engine R4)
    - Consume the reconciliation engine (task 8.4) to produce a traceability matrix mapping each audited capability to its Intended_Source + Actual_Source with a `Reconciliation_Status` of `Aligned` / `Code-Without-Spec` / `Spec-Without-Code` / `Conflicting` / `Partially-Aligned`; record code-without-spec and spec-without-code Drift Findings and conflicting-source Open_Questions; ensure 100% of findings carry dual citations.
    - Evidence to capture: the traceability matrix (with Partially-Aligned entries), per-finding citation pairs, conflicting-source Open_Questions.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 10.8 Implement AI/LLM eval-coverage checks (Domain 4, R10.3)
    - Verify LangSmith eval coverage exists for the diagnosis and proposal graphs per the LangSmith Observability & Evals Plan; record a `MissingEvalBaseline` Finding when a required eval dataset/baseline is absent; when LangSmith is unavailable, run against the stub for presence/shape or mark Blocked.
    - Evidence to capture: LangSmith eval dataset/baseline inventory.
    - _Requirements: 10.3_

  - [x] 10.9 Implement observability & QA checks incl. test-suite execution (Domain 9, R15)
    - Verify structured logging/tracing/metrics (`logger.ts`, `tracing.ts`, `metrics.ts`, `lib/observability/`) emit the LangSmith-plan signals; execute the repo test suites (`lib/__tests__/`, `tests/`, `vitest.config.ts`) and record the pass rate (Finding for any failing test); compare implemented tests against the QA / Test Cases DB (Finding for documented cases without coverage); verify CI regression gates block merges on test failure; record a Finding for any uncovered P0 path (tenant isolation, proposal generation, cost tracking).
    - Evidence to capture: observability signal inventory, test run output with pass rate, QA-database coverage map, CI gate configuration.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 10.10 Implement integrations & edge-automations blast-radius checks (Domain 11, R17)
    - Verify n8n usage matches the "n8n Integrations Spec — Edge Automations Only" page and Dify usage matches the "Dify Internal Ops Sandbox" page (flag any boundary violation or Dify dependency in a customer-facing path); inventory integration entry points (`lib/integrations/webhooks.ts`, `lib/notifications/`, `lib/plugins/`) and document each blast radius; flag integrations that can trigger core-flow state changes or lack a circuit breaker / retry boundary.
    - Evidence to capture: n8n/Dify boundary comparison, integration blast-radius inventory, resilience-control presence per integration.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 11. Checkpoint — P2 + P3 + P4
  - Ensure all tests pass, ask the user if questions arise.

### Phase SCORING, REMEDIATION & GO/NO-GO (final)

- [x] 12. Aggregate, score, and produce the production recommendation
  - [x] 12.1 Aggregate findings, fingerprint, and classify against the cached prior-findings ledger
    - Collect all findings from P0–P4 into the machine findings set; compute each fingerprint and classify each as `New` / `Regression` / `Confirms-Prior` against the cached version-pinned ledger (task 1.21); record fingerprint collisions as Open_Questions.
    - Evidence to capture: the cross-reference table mapping findings to prior `AUDIT_REPORT*.md` and Notion audit entries.
    - _Requirements: 1.8, 27.3_

  - [x] 12.2 Compute the 23 Domain_Scores and the security-weighted Production_Readiness_Score with Critical-cap
    - Apply the Domain_Score formula (task 1.15) to each of the 23 SUA-Scored Domains (never to Engine-Correctness Requirements), flag any Critical-capped domain at ≤3, and compute the overall security-weighted mean (task 1.17); justify each score from its contributing findings; flag domains affected by Blocked_Checks/caps as provisional; propagate the Domain 5 provisional status (when any contributing reliability finding was stub-backed, per task 6.3) into `RunHeader.provisional` and the Go/No-Go provisional status.
    - Evidence to capture: per-domain scoring table with the Critical cap noted and the Domain 5 stub-backed provisional flag, the scoring formula with deductions/weights.
    - _Requirements: 32.1, 32.2, 32.3, 32.5, 11.6_

  - [x] 12.3 Build the domain→Scorecard-12-area mapping and side-by-side comparison with disclosed divergence
    - Present each SUA Domain mapped to its Scorecard area and a side-by-side table (area, engine Domain_Score, prior Scorecard expert score, evidence, fix, priority) WITHOUT claiming methodological equivalence; explicitly disclose that the Scorecard is unweighted with no Critical-cap and that the engine's severity weighting + Critical-cap are intentional divergences; note aggregation where multiple domains map to one area.
    - Evidence to capture: the domain→Scorecard-area mapping, the disclosed-divergence note, the side-by-side engine-vs-prior-Scorecard comparison table.
    - _Requirements: 32.3, 32.4, 32.6_

  - [x] 12.4 Finalize the Open_Questions register
    - Assemble all Open_Questions (id, description, intended/actual references, decision required) — including the $0.06–0.10 vs $0.50/audit cost conflict, the schema-extension recommendations (R30.4), fingerprint collisions (R27.5), and the per-source ToS determinations (R36) — in a register separate from Findings and Blocked_Checks; flag every downstream severity/Go-No-Go determination blocked by an Open_Question as provisional.
    - Evidence to capture: the Open_Questions register and the list of provisional determinations.
    - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5_

  - [x] 12.5 Compile the prioritized remediation backlog and emit the Go/No-Go production recommendation (FINAL)
    - Produce the remediation plan ordering findings by severity then effort (each item citing finding `id`, `fix`, `effort_estimate`); emit exactly one Go/No-Go verdict via the verdict function (task 1.27) honoring Critical→No-Go, High ≥ X(5)→at most Conditional-Go (list conditions), High ≥ Y(10)→No-Go, and the workaround clause biting ONLY on unresolved Highs marked `workaround_available = false` (so a clean Go is reachable when Highs are below X and every unresolved High has `workaround_available = true`); summarize total findings by severity alongside the Production_Readiness_Score; mark the recommendation provisional if any Blocked_Check, cap-induced partial run, or stub-backed Domain 5 finding affected coverage; populate findings via the Notion DB transform (task 1.19) by emitting the import-ready transform payload + schema-extension Open_Question ONLY. State plainly that auto-population is OUT OF SCOPE — the engine writes nothing to Notion; a human must FIRST apply the ~5 schema-extension properties (R30.4 Open_Question: Severity, Domain, Intended Source, Actual Source, rich-evidence) and THEN import the emitted payload.
    - Evidence to capture: the prioritized remediation table, the go/no-go verdict with justification (incl. High-count thresholds applied and the `workaround_available=false` subset), the severity summary with the readiness score, and the emitted (non-written) import-ready Notion DB transform payload with the out-of-scope auto-population note.
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6, 30.1, 30.4, 30.6_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The 14 property tests (P1–P14) and the P0/security-critical integration tests are **CORE (non-`*`) and MUST NOT be skipped**: P1–P14 are the engine's own correctness gates, and the safety integration tests — cross-tenant retrieval (5.2), webhook invalid-sig/replay (5.6), prompt-injection canary (5.8), scraper robots.txt/politeness (5.10), RTBF deletion across derived stores (6.9), rate-limit/spend-cap (9.4), and runtime PII over-fetch (10.6) — verify the security/economic-abuse/cross-tenant behaviors that make the "any Critical forces No-Go" model real. A skippable leak test would make that model hollow.
- Only genuinely redundant EXAMPLE/SMOKE fixture tests remain `*`-optional and may be skipped for a faster MVP: the isolation-confirmation smoke (3.2), the Stripe-abort example (3.5), and the fixture-determinism tests (6.2, 6.6, 10.3). No blanket "all `*` may be skipped for MVP" applies to the safety/correctness set above.
- Each task references the specific sub-requirements it implements for traceability, and each audit-domain task captures the evidence named in that requirement's "Evidence to capture" line.
- The 14 property tests (P1–P14) are implemented with `fast-check` + `vitest` (≥100 iterations each, one property per test); Engine-Correctness Requirements are validated here and are never assigned a Domain_Score.
- The engine is non-destructive to production and Notion throughout; all live SUA execution is confined to the Isolated_Synthetic_Execution_Environment with per-test tenant namespaces and finally-guaranteed teardown of per-run artifacts only (persistent seeded fixtures are preserved/re-seeded); Notion schema changes are emitted as Open_Question recommendations only and the engine never auto-populates Notion.
- Checkpoints (tasks 2, 4, 7, 11, 13) provide incremental validation at phase boundaries and act as wave barriers in the dependency graph below.

## Task Dependency Graph

Checkpoints (2, 4, 7, 11, 13) are included as explicit WAVE BARRIERS: each sits in its own wave, depends on all tasks of the phases before it, and gates every task after it, so no Phase-E task runs before the Foundation checkpoint (task 2), no P0/P1 task runs before the Synthetic-Environment checkpoint (task 4), and so on. Every property/safety test is scheduled in a wave after the code it validates. Every incomplete leaf sub-task appears exactly once.

Destructive/concurrent runtime checks (5.2, 6.7, 6.9, 9.1, 10.6) do NOT share mutable tenant state: per task 3.3 each runs in its OWN freshly-seeded per-test tenant namespace, so where two appear in the same wave (5.2 and 6.9 in wave 12) they operate on disjoint namespaces and MAY safely run in parallel; the remaining ones (6.7 wave 11, 9.1 wave 14, 10.6 wave 15) fall in separate waves. Any check that genuinely cannot be namespaced falls back to serialization (task 3.3) so it never overlaps a destructive or seed-mutating check.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.5", "1.7"] },
    { "id": 2, "tasks": ["1.3", "1.6", "1.8", "1.10", "1.13", "1.25", "1.26"] },
    { "id": 3, "tasks": ["1.9", "1.11", "1.12", "1.14", "1.15", "1.19", "1.21", "1.23", "1.27"] },
    { "id": 4, "tasks": ["1.16", "1.17", "1.20", "1.22", "1.24", "1.28"] },
    { "id": 5, "tasks": ["1.18"] },
    { "id": 6, "tasks": ["2"] },
    { "id": 7, "tasks": ["3.1", "3.4", "3.6", "3.8", "3.9"] },
    { "id": 8, "tasks": ["3.2", "3.3", "3.5", "3.7", "3.10", "3.11", "3.13"] },
    { "id": 9, "tasks": ["3.12", "3.14"] },
    { "id": 10, "tasks": ["4"] },
    {
      "id": 11,
      "tasks": ["5.1", "5.3", "5.4", "5.5", "5.7", "5.9", "6.1", "6.3", "6.5", "6.7", "6.8", "6.10"]
    },
    { "id": 12, "tasks": ["5.2", "5.6", "5.8", "5.10", "6.2", "6.4", "6.6", "6.9"] },
    { "id": 13, "tasks": ["7"] },
    {
      "id": 14,
      "tasks": ["8.1", "8.2", "8.4", "9.1", "9.3", "10.2", "10.4", "10.5", "10.9", "10.10"]
    },
    { "id": 15, "tasks": ["8.3", "9.2", "9.4", "10.1", "10.3", "10.6", "10.7", "10.8"] },
    { "id": 16, "tasks": ["11"] },
    { "id": 17, "tasks": ["12.1"] },
    { "id": 18, "tasks": ["12.2", "12.4"] },
    { "id": 19, "tasks": ["12.3"] },
    { "id": 20, "tasks": ["12.5"] },
    { "id": 21, "tasks": ["13"] }
  ]
}
```
