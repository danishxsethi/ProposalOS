# Requirements Document

## Introduction

This spec defines the **human + operational loop that runs AFTER** the already-built, already-run-once **Proposal Engine OS Audit_System** (spec: `proposal-engine-audit-system`). That engine produces, on each run, four artifact sinks (a machine-readable findings set, a human-readable report, an Open_Questions register, and a Blocked_Checks list), 23 `Domain_Scores`, a security-weighted `Production_Readiness_Score`, and a `Go / Conditional-Go / No-Go` verdict carrying provisional flags. This feature — the **Remediation_And_Operations_System (RAOS)** — consumes that audit output and drives the System Under Audit (SUA) from a **No-Go or Conditional-Go** verdict to a **clean, NON-PROVISIONAL Go**.

RAOS spans five workstreams: (WS1) triage and remediate findings in severity-then-effort order; (WS2) resolve the blocking `Open_Questions` only a human can decide; (WS3) eliminate every provisional flag; (WS4) import findings into Notion after a human applies the required schema extension; and (WS5) operationalize the audit as a recurring/CI release gate.

**Boundary discipline (load-bearing).** RAOS MAY modify the SUA repository (`/Users/danishsethi/VSCODE/ProposalOS` — Next.js 14 App Router + Postgres/Prisma + Vertex AI Gemini + GCP Cloud Run; modes: Internal Agency, White-Label, Self-Serve B2C; target audit→proposal `<30s` at the canonical `Per_Audit_Cost` band) through **normal pull requests**. RAOS MUST keep the Audit_System engine **read-only to production and to Notion**: the only writes to Notion happen through the explicit, human-gated import defined in WS4 (Requirements 14–16), and the only writes to the SUA happen through reviewed PRs. Edits RAOS makes to the spec documents (the `.kiro/specs/**` markdown of either spec) are also delivered through reviewed PRs; edits to Notion pages that hold INTENDED state (the Hub and the System Scorecard) are never written by RAOS automatically — they are emitted as recorded **human action items**.

**Closure discipline (load-bearing).** No finding may be marked "remediated" by assertion. Closure is **proven by a re-run** and is defined as a **Resolved_Delta**: a `Finding_Fingerprint` that was present and open in the pinned `Baseline_Run` open-findings set is **absent** from a later `Verification_Run` open-findings set. A fingerprint that re-appears in the Verification_Run as `Confirms-Prior` is **still open** (not closed); a fingerprint the engine classifies `Regression` means a previously-resolved finding **came back** (the opposite of closure). Closure is therefore proven by _absence from the open-findings set_, never by a `Regression` classification.

This document groups requirements by workstream (WS1–WS5) and a Cross-Cutting section. Each requirement carries a user story and EARS acceptance criteria. Where a decision was deferred, it is recorded in **Open_Questions / Assumptions** at the end rather than guessed.

## Glossary

- **Remediation_And_Operations_System (RAOS)**: The system defined by this spec — the human and operational loop that consumes Audit_System output and drives the SUA to a clean, non-provisional Go. Distinct from the Audit_System engine, which it does not make destructive.
- **Audit_System**: The pre-existing audit engine (spec `proposal-engine-audit-system`) that reconciles INTENDED state (Notion) against ACTUAL state (the repo) and emits findings, scores, and a verdict. RAOS treats it as read-only to production and Notion.
- **System_Under_Audit (SUA)**: The Proposal Engine OS platform repository at `/Users/danishsethi/VSCODE/ProposalOS` — code, data layer, infrastructure config, and runtime behavior.
- **Finding**: A single audit result conforming to the Audit_System Findings_Schema, carrying: `id` (from `Finding_Fingerprint`), `domain` (1..23), `severity` (Critical/High/Medium/Low), `workaround_available` (boolean), `intended_source`, `actual_source`, `evidence`, `impact`, `fix`, `effort_estimate` (5-value enum), `classification` (New/Regression/Confirms-Prior), and a closed `issue_signature`.
- **Finding_Fingerprint**: The deterministic key that assigns a Finding its stable `id` and matches it across runs (`domain` + normalized `actual_source` + closed-enum `issue_signature` (+ check id for Runtime checks)). RAOS uses fingerprint identity to detect a `Resolved_Delta` across runs.
- **Classification**: The Audit_System label on a Finding that is _present_ in a run — one of `New` (no prior match), `Regression` (a prior finding previously marked resolved that has re-appeared), or `Confirms-Prior` (a prior finding still open). All three classifications denote a finding that is **currently open in that run**. None of them denotes a resolved finding; closure is therefore never represented by a classification value (see `Resolved_Delta`).
- **Baseline_Run**: The single pinned Audit_System run that RAOS freezes as the source of the Remediation_Backlog and as the open-findings reference set for closure. The Baseline_Run does not change as verification re-runs are executed; it is only advanced by an explicit re-baseline action (see Requirement 1).
- **Verification_Run**: An Audit_System run RAOS triggers (scoped or full) to test whether one or more remediated fingerprints are now absent from the open-findings set. A Verification_Run proves closure but does not replace the Baseline_Run unless RAOS explicitly re-baselines.
- **Resolved_Delta**: The sole accepted proof of remediation closure — a `Finding_Fingerprint` that was present and open in the `Baseline_Run` open-findings set and is **absent** from a later `Verification_Run` open-findings set (equivalently, emitted in the engine's resolved-delta between the two runs). A fingerprint re-appearing as `Confirms-Prior` is still open; a `Regression` classification is the opposite of closure.
- **Remediation_Backlog**: The ordered work list RAOS derives from the `Baseline_Run` machine-readable findings set, ordered by severity, then `effort_estimate`, then security weight.
- **effort_estimate**: The Audit_System 5-value effort enum carried on each Finding; the secondary ordering key (after severity) for the Remediation_Backlog.
- **Open_Question**: A recorded ambiguity or conflict requiring human resolution before a definitive verdict can be issued. RAOS resolves the blocking subset (WS2) and records decision, owner, timestamp, and which provisional flags each resolution clears.
- **Blocked_Check**: An Audit_System check that could not run because a required capability was unavailable (`nonProdDb`, `gcpVertex`, `langSmith`, `testExecution`, `secretScan`, `costInstrumentation`, `notionRead`). RAOS resolves Blocked_Checks by supplying the missing capability so the check runs (Requirement 26).
- **Accepted_Risk / Suppressed_Finding**: An audit finding the Audit_System annotates as an accepted risk (audit R14.5, citing the Risk Register) or a documented suppression (audit R14.6, with justification + authorizing Risk Register reference). These are not re-fired as new findings by the engine, and RAOS does not count them toward the verdict gates (Requirement 25).
- **self-budget cap**: The Audit_System's configured maximum run time and maximum LLM/compute cost for a single run (audit R28). When a run is truncated by the cap it emits a partial report and a provisional verdict. RAOS clears this provisional source by scoping runs to fit the cap or by raising the cap with provenance (Requirement 27).
- **provisional flag**: A marker the Audit_System sets on a `Domain_Score`, the `RunHeader`, and/or the `Go_No_Go_Recommendation` when Blocked_Checks, a self-budget cap, a stub-backed substrate, or an unresolved cost conflict reduced confidence. A **clean, NON-PROVISIONAL Go** requires every provisional flag cleared.
- **Deep_Run**: An opt-in synthetic-run mode at `N ≥ 20` runs/industry that yields warm-run p95/p99 latency percentiles (vs the Default_Sample at `N = 8–10`/industry which reports p50/p95 and gates on warm p50). Per the audit spec (R16.9), any run that follows a cold container start is tagged `coldStart=true` and kept in a separate distribution; cold starts may recur mid-batch, so the count of warm samples is not assumed to be `N − 1`.
- **Stub_Substrate**: The Audit_System's semantics-preserving Temporal stub used when a real Temporal dev server is unavailable. Domain 5 findings backed by the Stub_Substrate are PROVISIONAL.
- **Temporal_Dev_Server**: A real, locally-run Temporal dev-mode server that replaces the Stub_Substrate so Domain 5 (orchestration reliability) findings are `substrateBacking = "real-dev"` and therefore non-provisional on that basis.
- **RLS (Row-Level Security)**: A Postgres database-layer access control that restricts row visibility per policy. The intended tenant-isolation design requires a DB-layer RLS policy on every tenant-scoped table.
- **BYPASSRLS**: A Postgres role attribute that exempts a role from RLS policies. The intended state requires that no application DB role carries `BYPASSRLS`.
- **adapter-level tenantId filter**: An application-layer guarantee (e.g. `lib/auth/wrappedPrismaAdapter.ts`, `lib/tenant/context.ts`) that injects a `tenantId` predicate on every tenant-scoped query, forming the second isolation layer alongside RLS.
- **pinned-ledger (prior-findings ledger)**: The Audit_System's reviewed, frozen, version-controlled set of prior findings (`priorLedgerVersion`) used for New/Regression/Confirms-Prior classification. RAOS bumps the pinned-ledger version per operational run.
- **doc-drift**: Divergence between the three spec artifacts (`requirements.md`, `design.md`, `tasks.md`) within a spec, or between the audit spec and this spec (e.g. 22 vs 23 domains; Critical deduction 10 vs the load-bearing 5; the legal domain R36 added late). RAOS includes a reconciliation requirement and a doc-drift check.
- **Per_Audit_Cost (COGS)**: The canonical cost to produce one audit-to-proposal run. The hub/requirements state a `$0.06–0.10/audit` band; the Notion System Scorecard states `$0.50/audit`. WS2 requires a single canonical decision; until then the cost verdict (Domain 10) stays provisional.
- **Canonical_Cost_Decision**: The single, human-signed determination that reconciles the `$0.06–0.10` vs `$0.50` conflict across the hub, requirements, and Scorecard, clearing the Domain 10 cost provisional flag.
- **ToS_Determination**: A recorded human/legal determination, per scraped source (Google Business Profile, Yelp, etc.), of whether automated collection is permitted — combining `robots.txt` compliance, politeness/rate control, and a documented Terms-of-Service review. Compliance is never asserted without a recorded determination.
- **Findings_Library_Schema_Extension**: The human-applied addition of six properties to the Notion Findings Library (`collection://e24e0634-3d62-4063-9d22-963453aaf45f`), which today lacks them: `Severity`, `Domain`, `Intended Source`, `Actual Source`, a rich-evidence property, and a unique `Finding Fingerprint` (external-id) property that carries the `Finding_Fingerprint` so the import has a stable match key. RAOS defines the extension; a human applies it; then the import runs.
- **Notion_Import**: The human-gated procedure that transforms the Audit_System import-ready payload into Notion Findings Library / QA Test Cases rows, idempotently keyed on the `Finding Fingerprint` property that carries each Finding's `Finding_Fingerprint`.
- **Release_Gate**: The CI integration that runs the audit before release: any unresolved Critical fails the pipeline; a provisional verdict fails the pipeline by default (configurable to warn-only).
- **Drift_Run**: A scheduled, recurring audit run that surfaces drift and `Regression` findings over time.
- **Re-run_Proof**: The evidence record of a `Resolved_Delta` — the `Finding_Fingerprint`, the `Baseline_Run` identifier in which it was open, and the `Verification_Run` identifier from whose open-findings set it is absent. It is the only accepted proof of remediation closure.
- **Clean_Go**: A `Go` verdict with zero unresolved Critical findings, High count below the configured thresholds, no unresolved High with `workaround_available = false`, and **no provisional flags** set on any `Domain_Score`, the `RunHeader`, or the verdict.
- **Hub**: The Notion "Proposal Engine OS" hub (`300495b5-1135-8004-985b-c7e0d3f7235e`) that holds the INTENDED state.
- **System Scorecard**: The prior expert Notion System Scorecard (`b8163964-c637-495e-86b0-c952d4b955eb`), ~6.3/10, with known Criticals (single-layer tenant isolation) and unresolved items.

## Requirements

---

## WS1 — Triage & Remediation Backlog Execution

### Requirement 1: Ingest and order the remediation backlog

**User Story:** As a remediation lead, I want a single pinned baseline audit run ingested and ordered, so that I work the highest-leverage fixes first against a stable list that does not shift as I trigger verification re-runs.

#### Acceptance Criteria

1. WHEN RAOS establishes a Baseline_Run, THE RAOS SHALL pin exactly one Audit_System run (by default the run with the most recent completion timestamp at pin time) as the Baseline_Run and SHALL record its run identifier and completion timestamp.
2. WHEN RAOS ingests the Baseline_Run, THE RAOS SHALL load every Finding in that run's machine-readable findings set, including each Finding's `id`, `domain`, `severity`, `workaround_available`, `effort_estimate`, `classification`, and `issue_signature`.
3. THE RAOS SHALL group the ingested Findings first by `severity` and then by `domain`.
4. THE RAOS SHALL order the Remediation_Backlog by `severity` (Critical → High → Medium → Low), then by `effort_estimate` ascending, then by the Audit_System domain security weight descending, then by Finding `id` ascending as a final deterministic tie-breaker.
5. IF an ingested Finding is missing any of the required fields (`id`, `domain`, `severity`, `workaround_available`, `effort_estimate`, `classification`, `issue_signature`), THEN THE RAOS SHALL record the affected Finding in an exceptions list naming which field is missing, SHALL surface a count of excepted Findings, and SHALL exclude the Finding from automated ordering until the field is supplied.
6. THE RAOS SHALL produce a Remediation_Backlog artifact that records, per Finding, its order position (a contiguous integer sequence beginning at 1 with no gaps or duplicates), `severity`, `effort_estimate`, and the security weight used for ordering.
7. WHILE a Baseline_Run is pinned, THE RAOS SHALL NOT replace it or re-derive the Remediation_Backlog from a later Verification_Run except through an explicit re-baseline action that records the prior and new Baseline_Run identifiers.
8. WHEN RAOS re-ingests the same pinned Baseline_Run with no change to its findings set, THE RAOS SHALL produce a Remediation_Backlog whose ordering is identical to the prior ingestion.

### Requirement 2: Remediate all unresolved Critical findings first

**User Story:** As a remediation lead, I want every unresolved Critical remediated before lower-severity work, so that the verdict can leave No-Go.

#### Acceptance Criteria

1. WHILE at least one unresolved Critical Finding exists (a Finding with `severity = Critical` AND `status = open`, excluding any Accepted_Risk or Suppressed_Finding per Requirement 25), THE RAOS SHALL order all such Critical Findings ahead of every High, Medium, and Low Finding in the Remediation_Backlog execution sequence.
2. WHEN RAOS proposes a fix for a Critical Finding, THE RAOS SHALL record the Finding `id` and each `file:line` the fix changes; IF the Finding `id` or a `file:line` reference is missing, THEN THE RAOS SHALL reject the proposed fix and SHALL NOT schedule it for landing.
3. WHEN a Critical remediation is landed, THE RAOS SHALL trigger a Verification_Run whose scope includes the Finding's `Finding_Fingerprint` (Requirement 28).
4. WHEN the Finding's `Finding_Fingerprint` is open in the Baseline_Run and is absent from the Verification_Run open-findings set (a Resolved_Delta), THE RAOS SHALL mark the Finding closed (closure proven by re-run).
5. IF the Finding's `Finding_Fingerprint` re-appears in the Verification_Run open-findings set (as `Confirms-Prior`, `Regression`, or `New`), THEN THE RAOS SHALL keep the Finding open, SHALL NOT mark it remediated, and SHALL record an indication that closure verification failed.
6. IF the triggered Verification_Run does not complete or produces no open-findings set covering the Finding's `Finding_Fingerprint` scope, THEN THE RAOS SHALL keep the Finding open and SHALL record an unresolved verification gap.

### Requirement 3: Drive High-severity findings below the configured thresholds

**User Story:** As a remediation lead, I want High findings driven below the verdict thresholds, so that a clean Go becomes reachable.

#### Acceptance Criteria

1. WHEN a remediation cycle completes, THE RAOS SHALL re-evaluate the unresolved High Finding count, where an unresolved High Finding is any Finding with `severity = High` and `status ≠ resolved`, excluding any Accepted_Risk or Suppressed_Finding per Requirement 25.
2. THE RAOS SHALL treat the High-severity gate as satisfied only WHILE the unresolved High Finding count is strictly less than the configured threshold `X` (where `X` is an integer, `X ≥ 5`) AND strictly less than the configured threshold `Y` (where `Y` is an integer, `Y ≥ 10`, and `Y ≥ X`).
3. THE RAOS SHALL treat the High-severity gate as satisfied only WHILE the count of unresolved High Findings with `workaround_available = false` is exactly 0.
4. WHEN the unresolved High Finding count is strictly less than `X` AND every unresolved High Finding has `workaround_available = true`, THE RAOS SHALL record that the High-severity gate for a clean Go is satisfied.
5. IF a remediation cycle completes AND the unresolved High Finding count is greater than or equal to `X`, OR at least one unresolved High Finding has `workaround_available = false`, THEN THE RAOS SHALL record that the High-severity gate is not satisfied and report the remaining unresolved High Finding count and the count of unresolved High Findings with `workaround_available = false`.

### Requirement 4: Remediate the single-layer tenant isolation Critical (dual-layer enforcement)

**User Story:** As a security owner, I want tenant isolation enforced at both the database and adapter layers, so that the known single-layer-isolation Critical is closed.

#### Acceptance Criteria

1. THE RAOS SHALL require a DB-layer RLS policy on each table identified as tenant-scoped, such that the count of tenant-scoped tables with an active RLS policy equals the total count of tenant-scoped tables (100% coverage).
2. THE RAOS SHALL require an adapter-level `tenantId` filter on each tenant-scoped query path, such that the count of tenant-scoped query paths with an enforced `tenantId` filter equals the total count of tenant-scoped query paths (100% coverage).
3. THE RAOS SHALL require that the count of application DB roles carrying the `BYPASSRLS` attribute equals zero.
4. WHEN RAOS lands a tenant-isolation fix, THE RAOS SHALL cite the Finding `id` and each `file:line` changed by the fix.
5. WHEN the dual-layer isolation fix is landed, THE RAOS SHALL trigger exactly one Verification_Run whose scope includes the original tenant-isolation Critical's `Finding_Fingerprint`, and SHALL mark the Critical closed only IF that fingerprint was open in the Baseline_Run and is absent from the Verification_Run open-findings set (a Resolved_Delta; closure proven by re-run).
6. IF any tenant-scoped path lacks the RLS policy or lacks the adapter-level `tenantId` filter, THEN THE RAOS SHALL keep the tenant-isolation Finding at Critical and SHALL keep the affected domain at No-Go.
7. IF the tenant-isolation Critical's `Finding_Fingerprint` re-appears in the Verification_Run open-findings set (no Resolved_Delta), THEN THE RAOS SHALL keep the Finding at Critical, keep the affected domain at No-Go, and SHALL NOT mark the Critical closed.

### Requirement 5: Enforce the definition of done for every finding

**User Story:** As a remediation lead, I want a single, strict definition of done, so that "remediated" always means proven, not asserted.

#### Acceptance Criteria

1. IF a Finding has both (a) an associated code or spec change recorded as merged to the target branch and (b) a Resolved_Delta (its `Finding_Fingerprint` was open in the Baseline_Run and is absent from a Verification_Run open-findings set), THEN THE RAOS SHALL set the Finding status to `done`.
2. IF a Finding lacks either a merged code/spec change or a Resolved_Delta, THEN THE RAOS SHALL NOT set the Finding status to `done`.
3. WHEN a Verification_Run produces a Resolved_Delta for a Finding, THE RAOS SHALL record a Re-run_Proof capturing the `Finding_Fingerprint`, the Baseline_Run identifier in which it was open, and the Verification_Run identifier from whose open-findings set it is absent, as the closure evidence.
4. IF a code or spec change has landed but no Verification_Run has been executed covering the matching `Finding_Fingerprint`, THEN THE RAOS SHALL set the Finding status to `remediation-pending` and SHALL NOT set it to `done`.
5. IF a code or spec change has landed and a Verification_Run covering the matching `Finding_Fingerprint` has executed but the fingerprint is still present in that run's open-findings set, THEN THE RAOS SHALL set the Finding status to `remediation-pending`, SHALL NOT set it to `done`, and SHALL record the failed-closure Verification_Run identifier as evidence indicating the fix did not resolve the Finding.

---

## WS2 — Resolve Blocking Open_Questions (Human Decisions)

### Requirement 6: Resolve the Per_Audit_Cost target conflict with a single canonical decision

**User Story:** As a product owner, I want one canonical cost target reconciled across all sources, so that the audit's cost verdict can stop being provisional.

#### Acceptance Criteria

1. WHILE the `$0.06–0.10/audit` band and the `$0.50/audit` Scorecard target both stand unreconciled, THE RAOS SHALL keep the Domain 10 cost verdict flagged provisional.
2. WHEN a Canonical_Cost_Decision is recorded, THE RAOS SHALL persist the decision value (a cost-per-audit amount in the range $0.01 to $999.99), the owner identifier, the UTC timestamp, and the list of provisional flags the decision is intended to clear.
3. IF a Canonical_Cost_Decision is submitted with a missing or empty decision value, owner identifier, or timestamp, or with a decision value outside the range $0.01 to $999.99, THEN THE RAOS SHALL reject the submission, leave all existing provisional flags unchanged, and return an error indication identifying the invalid field.
4. WHEN a Canonical_Cost_Decision is recorded, THE RAOS SHALL propagate the canonical value to the requirements documents through a normal pull request, and SHALL emit a recorded human action item for each Notion-resident source (the Hub and the System Scorecard) rather than writing to Notion automatically (Requirement 24).
5. WHEN the canonical value has been confirmed applied to all three sources (the requirements PR merged and both Notion human action items marked applied), THE RAOS SHALL clear the Domain 10 cost provisional flag.
6. IF the requirements PR is unmerged OR either Notion human action item is not yet marked applied, THEN THE RAOS SHALL keep the Domain 10 cost provisional flag set and return an indication identifying each source that is not yet reconciled.

### Requirement 7: Record a ToS / legal determination for every scraped source

**User Story:** As a compliance owner, I want a recorded legal determination per scraped source, so that the platform never asserts compliance it has not verified.

#### Acceptance Criteria

1. THE RAOS SHALL require, for each scraped source (including Google Business Profile and Yelp), a ToS_Determination that contains all of the following: (a) a `robots.txt` compliance result (compliant / non-compliant / not-applicable), (b) a configured request rate limit, expressed in requests per second, that does not exceed the rate the source's own `robots.txt` or published Terms permit and in no case exceeds 1 request/second per source, and (c) a Terms-of-Service review result (permitted / prohibited / conditional) with reviewer-supplied notes of at least 1 character.
2. IF a scraped source has no recorded ToS_Determination, OR the recorded ToS_Determination is missing any of the fields required by Criterion 1, THEN THE RAOS SHALL treat that source's compliance posture as unresolved, SHALL NOT assert compliance for that source, and SHALL surface an indication that the determination is incomplete or absent.
3. WHEN a ToS_Determination is recorded for a source, THE RAOS SHALL persist the decision result, the owner identifier, the creation timestamp in UTC (ISO 8601), and the list of provisional flags the decision clears, retaining all prior fields without modification.
4. WHILE a recorded ToS_Determination is older than 90 days from its creation timestamp, THE RAOS SHALL mark that determination as stale and SHALL treat the source's compliance posture as unresolved until a new ToS_Determination is recorded.

### Requirement 8: Obtain sign-off on the Findings Library schema extension

**User Story:** As a data owner, I want explicit sign-off on the Findings Library schema extension, so that the Notion import has an agreed target schema.

#### Acceptance Criteria

1. THE RAOS SHALL define the Findings_Library_Schema_Extension as comprising exactly six properties — `Severity`, `Domain`, `Intended Source`, `Actual Source`, a rich-evidence property, and a unique `Finding Fingerprint` (external-id) property — where each property is documented with a name, a data type, and its complete enumerated set of allowed values, where the rich-evidence property is documented as capable of storing multiple evidence references per finding, and where the `Finding Fingerprint` property is documented as unique and carrying the `Finding_Fingerprint` used as the import match key.
2. WHEN the schema extension is signed off, THE RAOS SHALL record, in a single retained decision entry, the sign-off decision outcome, the identity of the owner granting it, an ISO-8601 timestamp, and the complete enumerated list of provisional flags the decision clears.
3. WHILE the schema-extension sign-off is outstanding, THE RAOS SHALL prevent the Notion_Import (Requirement 14) from starting.
4. IF the Notion_Import (Requirement 14) is invoked while the schema-extension sign-off is outstanding, THEN THE RAOS SHALL reject the invocation, leave the Notion workspace unchanged, and return an indication that the schema-extension sign-off is outstanding.
5. IF the schema-extension sign-off is rejected or withheld, THEN THE RAOS SHALL record the rejection outcome with the owner identity and an ISO-8601 timestamp, retain the outstanding state, and clear no provisional flags.

### Requirement 9: Record provenance for every Open_Question resolution

**User Story:** As an auditor, I want each Open_Question resolution to carry full provenance, so that decisions are traceable and their effect on the verdict is explicit.

#### Acceptance Criteria

1. WHEN any blocking Open_Question is resolved, THE RAOS SHALL record a provenance entry containing the decision text, the resolving owner identifier, a resolution timestamp in UTC with at least second-level precision, and the complete list of provisional flags the resolution clears.
2. THE RAOS SHALL store each Open_Question resolution record as a separate record set distinct from the Findings set and the Blocked_Checks list, such that no resolution record is duplicated into either of those two sets.
3. IF an Open_Question resolution clears zero provisional flags, THEN THE RAOS SHALL record in the provenance entry that the resolution cleared no flags and made no change to the verdict's provisional status.
4. IF an Open_Question resolution is submitted without a valid owner identifier or without a non-empty decision text, THEN THE RAOS SHALL reject the resolution, SHALL retain the Open_Question in its prior unresolved state, and SHALL return an error indication identifying the missing field.
5. IF the RAOS fails to persist a provenance entry for a resolved Open_Question, THEN THE RAOS SHALL retain the Open_Question in its prior unresolved state and SHALL return an error indication that the resolution was not recorded.
6. THE RAOS SHALL treat each persisted provenance entry as immutable, rejecting any modification or deletion of a recorded entry after it is written.

---

## WS3 — Clear Provisional Flags (De-Risk the Verdict)

### Requirement 10: Stand up a real Temporal dev server for Domain 5

**User Story:** As a reliability owner, I want Domain 5 findings backed by a real Temporal dev server, so that orchestration-reliability results are real-dev-backed rather than stub-backed.

#### Acceptance Criteria

1. WHEN Domain 5 reliability checks are initiated, THE RAOS SHALL provision a Temporal_Dev_Server in place of the Stub_Substrate and SHALL consider provisioning complete only when the Temporal_Dev_Server responds successfully to a health check within 30 seconds.
2. WHEN Domain 5 reliability checks have run against a health-check-passed Temporal_Dev_Server, THE RAOS SHALL confirm that each resulting Domain 5 finding carries `substrateBacking = "real-dev"` (the value the Audit_System records as a precondition) before treating the substrate basis as cleared.
3. WHEN every contributing Domain 5 finding carries `substrateBacking = "real-dev"`, THE RAOS SHALL clear the Domain 5 provisional flag.
4. IF the Temporal_Dev_Server fails its health check or does not respond within 30 seconds at run time, THEN THE RAOS SHALL retain the Domain 5 findings and the `Domain_Score`, keep their provisional flag set, and record an indication that the substrate was unavailable.
5. IF the Temporal_Dev_Server is unavailable at run time, THEN THE RAOS SHALL treat the affected Domain 5 findings as `substrateBacking = "stub"` (the fallback value the Audit_System records) and SHALL keep them provisional.

### Requirement 11: Verify cost instrumentation is wired

**User Story:** As a reliability owner, I want the per-audit cost signal verified as actually emitted, so that Domain 10 is measured rather than Blocked.

#### Acceptance Criteria

1. WHEN the RAOS verification check executes at least one representative audit, THE RAOS SHALL confirm that `lib/costs/costTracker.ts` and `lib/config/costBudget.ts` produce a per-audit cost signal, where the cost signal is defined as a non-negative numeric total cost value in cents accompanied by a per-API and per-model usage breakdown, both bound to a single audit identifier.
2. WHEN the per-audit cost signal for the executed audit is present, is a number greater than or equal to 0, and is associated with that audit's identifier, THE RAOS SHALL record the `costInstrumentation` capability as available.
3. IF the per-audit cost signal is absent, null, undefined, or non-numeric for the executed audit, THEN THE RAOS SHALL keep the Domain 10 cost checks classified as Blocked_Checks, SHALL NOT report `Per_Audit_Cost` as a measured value, and SHALL provide an indication that the cost signal was not emitted while preserving the existing Blocked_Checks classification.

### Requirement 12: Run an opt-in Deep_Run for warm-run percentile gating

**User Story:** As a performance owner, I want a Deep_Run executed, so that latency gating uses warm-run p95/p99 instead of only p50.

#### Acceptance Criteria

1. WHERE the Deep_Run option is enabled, THE RAOS SHALL execute the Deep_Run with at least 20 and at most 100 runs per industry.
2. IF the Deep_Run is configured with fewer than 20 runs per industry, THEN THE RAOS SHALL not start the Deep_Run and SHALL record a configuration error indicating the minimum run count was not met, while retaining the existing latency gating result.
3. WHEN the Deep_Run completes, THE RAOS SHALL classify every run tagged `coldStart=true` (any run following a cold container start, which may recur mid-batch per audit R16.9) as a cold-start sample and all other runs as warm-run samples.
4. WHEN the Deep_Run completes with at least 19 warm-run samples per industry, THE RAOS SHALL compute warm-run p95 and p99 latency percentiles in milliseconds from the warm-run samples only, excluding all cold-start samples.
5. WHEN warm-run p95 and p99 are available from the Deep_Run, THE RAOS SHALL gate latency on the warm-run p95 value.
6. IF warm-run p95 and p99 cannot be computed because fewer than 19 warm-run samples are available per industry (for example, because cold starts recurred and reduced the warm sample count below 19), THEN THE RAOS SHALL not apply warm-run gating, SHALL fall back to p50 gating, and SHALL record an unresolved coverage gap indicating insufficient warm-run samples.

### Requirement 13: Achieve zero provisional flags (WS3 closure)

**User Story:** As a release owner, I want every provisional flag eliminated, so that the Go verdict is non-provisional.

#### Acceptance Criteria

1. WHILE any `Domain_Score`, the `RunHeader`, or the `Go_No_Go_Recommendation` carries a provisional flag, THE RAOS SHALL withhold a Clean_Go determination.
2. WHEN all provisional sources are cleared — the cost conflict (Requirement 6), the stub-backed Domain 5 substrate (Requirement 10), all Blocked_Checks (Requirement 26), the self-budget cap (Requirement 27), and latency-percentile coverage (Requirement 12) — THE RAOS SHALL record the verdict as non-provisional.
3. IF any one of the provisional sources enumerated in criterion 2 remains uncleared, THEN THE RAOS SHALL keep the verdict provisional and SHALL report which provisional source remains.

---

## WS4 — Notion Import (Human-Gated; Engine Writes Nothing)

### Requirement 14: Define the human-applied Findings Library schema extension

**User Story:** As a data owner, I want the schema extension defined and human-applied before import, so that the import has fields to write into and the engine stays non-writing.

#### Acceptance Criteria

1. THE Audit_System SHALL emit an import-ready payload only and SHALL NOT write to Notion.
2. THE RAOS SHALL specify the Findings_Library_Schema_Extension as six human-applied properties: `Severity`, `Domain`, `Intended Source`, `Actual Source`, a rich-evidence property, and a unique `Finding Fingerprint` (external-id) property that stores each Finding's `Finding_Fingerprint` as the import match key.
3. WHILE the schema extension (including the `Finding Fingerprint` property) has not been applied by a human, THE RAOS SHALL NOT run the Notion_Import.

### Requirement 15: Transform findings into Notion rows on import

**User Story:** As a data owner, I want the import to map findings onto the agreed Notion fields, so that imported records are complete and correctly typed.

#### Acceptance Criteria

1. WHEN the Notion_Import runs, THE RAOS SHALL map each Finding's `severity` to an `Impact Score` (1–10) and a `Finding Type`.
2. WHEN the Notion_Import runs, THE RAOS SHALL map each Finding's `effort_estimate` directly to the Notion `Effort Estimate` property.
3. WHEN the Notion_Import runs, THE RAOS SHALL map each Finding's rich evidence to the notes property and SHALL map `Evidence Links` to a single URL.
4. WHEN importing QA / Test Case records, THE RAOS SHALL map their severity to the native `Severity` property of the QA / Test Cases database.

### Requirement 16: Make the Notion import idempotent on Finding_Fingerprint

**User Story:** As a data owner, I want re-imports to update rather than duplicate, so that repeated runs keep the Findings Library clean.

#### Acceptance Criteria

1. THE RAOS SHALL key each imported record on the Notion `Finding Fingerprint` property, populated from the Finding's `Finding_Fingerprint`.
2. WHEN a record whose `Finding Fingerprint` property matches the incoming Finding's `Finding_Fingerprint` already exists in the target database, THE RAOS SHALL update that record in place rather than create a duplicate.
3. WHEN no record with a matching `Finding Fingerprint` property exists, THE RAOS SHALL create a new record and populate its `Finding Fingerprint` property.
4. FOR ALL findings, importing the same payload twice SHALL produce the same set of Notion records as importing it once (idempotent re-import).

---

## WS5 — Operationalize as a Release Gate

### Requirement 17: Wire the audit into CI as a pre-release gate

**User Story:** As a release owner, I want the audit enforced in CI before release, so that Criticals block shipping and provisional verdicts are surfaced.

#### Acceptance Criteria

1. WHEN the Release_Gate runs in CI and any unresolved Critical Finding is present, THE Release_Gate SHALL fail the pipeline.
2. IF the audit verdict is provisional, THEN THE Release_Gate SHALL fail the pipeline by default and SHALL annotate it with the provisional sources; THE Release_Gate MAY be configured to warn-only instead of failing, in which case it SHALL record that the provisional verdict was allowed by explicit configuration.
3. WHEN the audit verdict is a non-provisional Go, THE Release_Gate SHALL allow the pipeline to proceed.
4. THE Release_Gate SHALL run its checks against the candidate commit and SHALL emit a verdict explicitly scoped to the checks it actually re-ran on that commit (a Gate_Verdict), distinct from the full `Production_Readiness` Go a scheduled full run produces.
5. WHERE the Release_Gate reuses synthetic-derived findings (e.g. latency, cost, AI-quality, reliability domains) from a prior scheduled run rather than re-measuring them on the candidate commit, THE Release_Gate SHALL tag each reused finding with its source run identifier and age, and SHALL treat every reused-synthetic domain as provisional on the candidate commit.
6. IF the candidate commit is static-and-P0-clean but carries reused-synthetic provisional domains, THEN THE Release_Gate SHALL NOT report a clean non-provisional Go, and SHALL apply the fail-by-default / recorded-warn-only-override policy of criterion 2 to that provisional state.

### Requirement 18: Run a scheduled recurring audit to surface drift and regressions

**User Story:** As an operations owner, I want a recurring audit, so that drift and Regression findings are caught over time rather than only at release.

#### Acceptance Criteria

1. THE RAOS SHALL run a scheduled recurring Drift_Run of the Audit_System.
2. WHEN a Drift_Run produces a `Regression`-classified finding, THE RAOS SHALL surface that finding through the alerting path (Requirement 20).
3. WHEN a Drift_Run produces a new Critical Finding, THE RAOS SHALL surface that finding through the alerting path (Requirement 20).

### Requirement 19: Manage artifact retention and the pinned-ledger version bump

**User Story:** As an operations owner, I want retained artifacts and a versioned ledger per run, so that runs are comparable and history is preserved.

#### Acceptance Criteria

1. THE RAOS SHALL retain each run's four artifact sinks (machine-readable findings, human report, Open_Questions register, Blocked_Checks list) per the configured retention policy.
2. WHEN an operational run completes, THE RAOS SHALL append a new pinned-ledger version (`priorLedgerVersion`) for that run without mutating any prior frozen ledger version (append-only versioning).
3. IF a pinned-ledger version bump would add or reclassify a prior finding used as a New/Regression/Confirms-Prior matching baseline, THEN THE RAOS SHALL require human sign-off on that version (consistent with the audit spec's reviewed-frozen ledger) before it is used for classification; routine append-only bumps that only record the run's own findings SHALL NOT require re-sign-off.
4. THE RAOS SHALL record, per run, the pinned-ledger version used for New/Regression/Confirms-Prior classification.

### Requirement 20: Alert on regressions and new Criticals

**User Story:** As an operations owner, I want an alerting path, so that a regression or new Critical is escalated immediately.

#### Acceptance Criteria

1. WHEN a Regression finding appears in any run, THE RAOS SHALL emit an alert through the configured alerting path.
2. WHEN a new Critical Finding appears in any run, THE RAOS SHALL emit an alert through the configured alerting path.
3. THE alert SHALL include the Finding `id`, `domain`, `severity`, and `classification`.

---

## Cross-Cutting Requirements

### Requirement 21: Reconcile spec-set documents and prevent doc-drift

**User Story:** As a spec owner, I want the three spec artifacts kept in sync across both specs, so that doc-drift (22 vs 23 domains, Critical deduction 10 vs 5, late-added legal domain R36) cannot recur.

#### Acceptance Criteria

1. THE RAOS SHALL re-sync `requirements.md`, `design.md`, and `tasks.md` within the `proposal-engine-audit-system` spec and within this `proposal-engine-remediation-and-operations` spec.
2. WHEN a reconciliation runs, THE RAOS SHALL resolve known drift points to a single value (the 23-domain count, the load-bearing Critical deduction of 5, and the inclusion of the legal/scraping domain).
3. WHEN RAOS edits the markdown of either spec to resolve drift, THE RAOS SHALL deliver those edits through a normal pull request (the spec documents are version-controlled in the SUA repository) and SHALL NOT write them to any Notion-resident copy automatically.
4. WHEN the three artifacts of a spec diverge on a load-bearing value, THE doc-drift check SHALL fail and SHALL report the diverging artifacts and values.
5. WHILE the three artifacts of a spec are mutually consistent on load-bearing values, THE doc-drift check SHALL pass.

### Requirement 22: Require re-run proof for every remediation closure

**User Story:** As an auditor, I want closure gated on a re-run, so that no finding is closed on assertion alone.

#### Acceptance Criteria

1. THE RAOS SHALL NOT mark any Finding remediated on assertion alone.
2. WHEN a Finding is claimed remediated, THE RAOS SHALL require a Resolved_Delta — its `Finding_Fingerprint` open in the Baseline_Run and absent from a Verification_Run open-findings set — as the closure proof.
3. IF the Finding's `Finding_Fingerprint` is still present in the Verification_Run open-findings set (under any classification, including `Confirms-Prior` or `Regression`), THEN THE RAOS SHALL keep the Finding open.
4. IF a Resolved_Delta for a fingerprint coincides, in the same Verification_Run, with a `New` finding in the same `domain` carrying the same `issue_signature`, THEN THE RAOS SHALL treat the closure as a possible relocation false-closure (the fix may have moved or renamed code, changing `actual_source` and thus the fingerprint) and SHALL raise an Open_Question for human disambiguation rather than marking the Finding `done` on that delta alone.

### Requirement 23: Preserve verdict reachability of a clean Go

**User Story:** As a release owner, I want the corrected Go/No-Go logic preserved, so that a clean Go is actually reachable after remediation.

#### Acceptance Criteria

1. IF any unresolved Critical Finding exists (excluding Accepted_Risk and Suppressed_Finding per Requirement 25), THEN THE Go_No_Go_Recommendation SHALL be No-Go.
2. IF the unresolved High count (excluding Accepted_Risk and Suppressed_Finding) is at or above `Y` (`Y ≥ 10`), THEN THE Go_No_Go_Recommendation SHALL be No-Go.
3. IF the unresolved High count (excluding Accepted_Risk and Suppressed_Finding) is at or above `X` (`X ≥ 5`), THEN THE Go_No_Go_Recommendation SHALL be at most Conditional-Go.
4. IF any unresolved High Finding (excluding Accepted_Risk and Suppressed_Finding) has `workaround_available = false`, THEN THE Go_No_Go_Recommendation SHALL be at most Conditional-Go.
5. WHEN no unresolved Critical exists, the unresolved High count is below `X`, every unresolved High has `workaround_available = true`, and no provisional flag is set — all counts excluding Accepted_Risk and Suppressed_Finding — THE Go_No_Go_Recommendation SHALL be a Clean_Go.

### Requirement 24: Enforce the non-destructive boundary

**User Story:** As a platform owner, I want the engine kept read-only to production and Notion, so that audit and remediation never put production or the workspace at risk.

#### Acceptance Criteria

1. THE Audit_System SHALL remain read-only to production data, production infrastructure, and the Notion workspace during every RAOS operation.
2. WHEN RAOS lands a remediation change to the SUA, THE RAOS SHALL deliver it through a normal pull request.
3. WHERE a Notion write is required, THE RAOS SHALL perform it only through the human-gated Notion_Import defined in WS4.
4. IF any RAOS operation would write to production data, production infrastructure, or Notion outside the human-gated import, THEN THE RAOS SHALL abort that operation and SHALL record the attempted write.

### Requirement 25: Exclude accepted-risk and suppressed findings from the verdict gates

**User Story:** As a release owner, I want accepted-risk and documented-suppressed findings excluded from the verdict gates, so that a clean Go is reachable and a deliberately accepted risk does not block release forever.

#### Acceptance Criteria

1. THE RAOS SHALL classify a Finding as an Accepted_Risk WHEN the Audit_System has annotated it as accepted against the Risk Register (audit R14.5), and as a Suppressed_Finding WHEN the Audit_System has recorded it as a documented suppression with justification and an authorizing Risk Register reference (audit R14.6).
2. THE RAOS SHALL exclude every Accepted_Risk and Suppressed_Finding from the unresolved-Critical count, the unresolved-High count, and the `workaround_available = false` count used by the verdict gates (Requirements 2, 3, 23).
3. WHEN RAOS excludes a Finding as Accepted_Risk or Suppressed_Finding, THE RAOS SHALL record, for that Finding, the exclusion reason, the authorizing Risk Register reference, and the owner of the acceptance or suppression.
4. IF a Finding is marked Accepted_Risk or Suppressed_Finding without an authorizing Risk Register reference, THEN THE RAOS SHALL NOT exclude it from the verdict gates and SHALL surface it as an unauthorized exclusion.
5. THE RAOS SHALL list all Accepted_Risk and Suppressed_Finding records separately from the active Remediation_Backlog so that excluded findings remain visible and auditable.

### Requirement 26: Resolve Blocked_Checks by supplying the missing capability

**User Story:** As a coverage owner, I want each Blocked_Check resolved by supplying its missing capability, so that no domain stays provisional merely because a check could not run.

#### Acceptance Criteria

1. WHEN RAOS ingests the Baseline_Run Blocked_Checks list, THE RAOS SHALL record, for each Blocked_Check, the missing capability (one of `nonProdDb`, `gcpVertex`, `langSmith`, `testExecution`, `secretScan`, `costInstrumentation`, `notionRead`) and the domain(s) it leaves provisional.
2. WHERE a Blocked_Check's required capability can be supplied, THE RAOS SHALL supply it and SHALL trigger a Verification_Run so the previously-blocked check runs.
3. WHEN a previously-blocked check has run to a non-blocked result in a Verification_Run, THE RAOS SHALL clear the Blocked_Check and SHALL clear the provisional flag it contributed, provided no other provisional source remains on that domain.
4. IF a Blocked_Check's required capability cannot be supplied, THEN THE RAOS SHALL record the Blocked_Check as an unresolved coverage gap and SHALL keep the affected domain in a provisional state.

### Requirement 27: Size and clear the self-budget-cap provisional

**User Story:** As a release owner, I want the self-budget-cap provisional source addressed, so that "zero provisional flags" is actually attainable.

#### Acceptance Criteria

1. WHEN RAOS schedules a Verification_Run or operational run, THE RAOS SHALL scope the run (selecting checks, industries, and sample volume) so its projected run time and LLM/compute cost stay within the Audit_System self-budget caps (audit R28).
2. IF a run is truncated by a self-budget cap (a partial report with a cap-induced provisional flag), THEN THE RAOS SHALL record which checks did not run and SHALL keep the affected verdict provisional.
3. WHERE the full required coverage cannot fit within the current self-budget caps, THE RAOS SHALL either split the coverage across multiple capped runs whose combined results cover the required checks, OR record a human action item to raise the caps with an owner and justification.
4. WHEN the combined results of one or more capped runs cover the required checks with no cap-induced omission remaining, THE RAOS SHALL clear the self-budget-cap provisional flag.

### Requirement 28: Scope and batch Verification_Runs for affordable closure

**User Story:** As a remediation lead, I want verification re-runs scoped and batched, so that proving closure does not require a full multi-industry audit per finding and does not itself trip the self-budget cap.

#### Acceptance Criteria

1. WHEN RAOS triggers a Verification_Run to prove closure for one or more landed fixes, THE RAOS SHALL scope the run to the checks and domains whose `Finding_Fingerprint`s are under verification rather than re-running the full audit, unless a full run is explicitly requested.
2. THE RAOS SHALL allow multiple landed fixes whose findings are pending verification to be batched into a single Verification_Run.
3. WHEN a batched Verification_Run completes, THE RAOS SHALL evaluate a Resolved_Delta independently per `Finding_Fingerprint` in the batch, closing only those fingerprints absent from the run's open-findings set and keeping the rest open.
4. WHERE a scoped Verification_Run cannot exercise the check that produces a given `Finding_Fingerprint` (for example, a cross-domain dependency), THE RAOS SHALL record that fingerprint as requiring a broader-scope run and SHALL NOT mark it closed on the scoped run alone.
5. THE RAOS SHALL scope every Verification_Run to stay within the Audit_System self-budget caps per Requirement 27.

### Requirement 29: Track Medium and Low findings as non-blocking

**User Story:** As a remediation lead, I want Medium and Low findings tracked but explicitly non-blocking, so that their handling is unambiguous and they do not silently gate or silently disappear.

#### Acceptance Criteria

1. THE RAOS SHALL include every unresolved Medium and Low Finding in the Remediation_Backlog after all Critical and High Findings.
2. THE RAOS SHALL NOT count Medium or Low Findings toward the Critical or High verdict gates (Requirements 2, 3, 23).
3. WHEN a Clean_Go is recorded, THE RAOS SHALL report the count of unresolved Medium and Low Findings carried forward so they remain visible despite being non-blocking.

---

## Open_Questions / Assumptions

These items are recorded (not guessed). Each is the human decision the workflow itself exists to drive; resolution provenance is captured per Requirements 6–9.

1. **Canonical Per_Audit_Cost value (OPEN — WS2 / Requirement 6).** The hub/requirements state `$0.06–0.10/audit`; the System Scorecard states `$0.50/audit`. The single canonical value is a human decision (owner + timestamp required) and is deferred to the Canonical_Cost_Decision. _Assumption until resolved:_ the Domain 10 cost verdict remains provisional and the `$0.06–0.10` band is treated as the stated target only for reachability math, not as settled.
2. **Real Temporal dev server in scope now (ASSUMED YES — WS3 / Requirement 10).** _Assumption:_ standing up a real Temporal_Dev_Server is in scope for this feature, since clearing the Domain 5 stub-backed provisional flag is a stated objective. If infrastructure constraints prevent it, Domain 5 stays provisional per Requirement 10.4.
3. **Findings Library schema extension sign-off owner (OPEN — WS2/WS4 / Requirement 8).** The owner who signs off the schema extension is a human decision and is deferred. _Assumption until resolved:_ the Notion_Import is blocked (Requirement 8.3 / 14.3).
4. **Deep_Run (N ≥ 20/industry) in scope now (ASSUMED YES — WS3 / Requirement 12).** _Assumption:_ the opt-in Deep_Run is in scope, as warm-run p95/p99 gating is required to clear the latency-percentile provisional flag. A Deep_Run that exceeds the Audit_System self-budget may itself be provisional per the audit spec.
5. **Per-source ToS/legal determination owner (OPEN — WS2 / Requirement 7).** Who owns each per-source ToS_Determination (legal/compliance) is a human decision and is deferred per source. _Assumption until resolved:_ every source without a recorded determination is treated as compliance-unresolved (Requirement 7.2).
6. **Threshold values X and Y (ASSUMED bounds).** _Assumption:_ `X ≥ 5` and `Y ≥ 10` per the audit spec's corrected Go/No-Go logic; exact values inherit from the Audit_System configuration and are not re-decided here.
7. **Alerting path and retention policy specifics (DEFERRED to design).** The concrete alerting channel (Requirement 20) and retention duration/storage (Requirement 19) are implementation choices deferred to the design phase.

## Review-Driven Decisions (resolved in this revision)

These were raised in review and are now settled in the requirements above (recorded so the rationale is traceable):

1. **Closure model corrected to Resolved_Delta.** The engine's `New`/`Regression`/`Confirms-Prior` classifications all denote a finding _present_ in a run, so "closure = a Regression-classified resolution" was logically unreachable. Closure is now defined as a **Resolved_Delta**: a `Finding_Fingerprint` open in the pinned `Baseline_Run` that is **absent** from a later `Verification_Run` open-findings set (Intro, Glossary, Requirements 2, 4, 5, 22).
2. **Idempotency key now exists in Notion.** The schema extension is expanded from five to six properties, adding a unique `Finding Fingerprint` (external-id) property so the import has a stable match key (Requirements 8, 14, 16).
3. **No automated Notion writes for cost reconciliation.** Requirement 6 now propagates the canonical value to the requirements documents via PR and emits recorded human action items for the Hub and System Scorecard (both Notion-resident), preserving the non-destructive boundary (Requirement 24). The arbitrary 5-second SLA was removed.
4. **Intro cross-reference fixed.** The human-gated import is Requirements 14–16 (not Requirement 13).
5. **Accepted-risk / suppressed findings excluded from gates.** New Requirement 25 defines Accepted_Risk and Suppressed_Finding and excludes them from the verdict gates (referenced by Requirements 2, 3, 23), so a deliberately accepted risk cannot make Clean_Go unreachable.
6. **Blocked_Check resolution and self-budget clearing are now first-class.** Blocked_Check resolution moved out of Requirement 12 into standalone Requirement 26; the self-budget-cap provisional source gets a clearing path in Requirement 27; Requirement 13 now references both.
7. **Verification re-runs are scoped/batched.** New Requirement 28 scopes Verification_Runs to the fingerprints under test and allows batching, so closure verification is affordable and does not trip the self-budget cap.
8. **Cold-start recurrence aligned with audit R16.9.** Requirement 12 no longer assumes a single first-run cold start; any `coldStart=true` run is excluded from warm samples, and insufficient warm samples fall back to p50 gating.
9. **Baseline vs verification runs separated.** Requirement 1 pins a `Baseline_Run` as the backlog source so verification re-runs do not churn the working backlog; re-baselining is explicit.
10. **Provisional builds block by default.** Requirement 17 fails the pipeline on a provisional verdict by default (configurable to warn-only with a recorded override).
11. **Ledger bump is append-only.** Requirement 19 makes operational bumps append-only and requires human sign-off only when a bump changes the classification baseline.
12. **Actor bleed removed.** Requirements 10 and 12 are phrased as RAOS obligations that reference engine-recorded values (e.g. `substrateBacking`) as preconditions rather than re-specifying Audit_System behavior.
13. **Doc-drift edits delivered via PR.** Requirement 21 specifies that spec-markdown edits land through PRs and are never auto-written to any Notion copy.
14. **Medium/Low handling made explicit.** New Requirement 29 tracks Medium and Low findings as non-blocking and carries their counts forward into a Clean_Go.
15. **Scrape rate ceiling grounded.** Requirement 7 caps the per-source request rate at the lower of what the source permits and 1 request/second, replacing the arbitrary 10 req/s ceiling.
