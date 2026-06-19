# Requirements Document

## Introduction

This spec defines a **repeatable, automatable end-to-end audit system** for the "Proposal Engine OS" platform. The deliverable is not a one-off report; it is an audit _engine_ with explicit checks, evidence capture, severity scoring, a structured findings schema, per-domain scoring, and a remediation plan. The audit engine reconciles **INTENDED state** (the Notion workspace) against **ACTUAL state** (this repository at `/Users/danishsethi/VSCODE/ProposalOS`), and flags drift in both directions: code with no governing spec, and specs with no implementing code.

This is a **DESIGN-ONLY** effort. The Audit_System SHALL NOT modify **production data, production infrastructure, or the Notion workspace**. It produces findings, evidence, scores, and recommendations only. The Audit_System MAY execute the audit-to-proposal pipeline against an **Isolated_Synthetic_Execution_Environment** (defined in the Glossary and Requirement 3) — a non-production database with seeded synthetic tenants and Stripe TEST mode — solely to measure runtime behavior. Any schema change to a Notion database is recorded as a recommendation / Open_Question; the Audit_System cannot apply it.

Checks are of two kinds, which determine how reproducibility is judged (see Glossary): **Static_Checks** (schema diff, feature-flag matrix, secret scan, module-registry comparison, file presence) produce byte-for-byte identical findings across re-runs on the same **Pinned_State**; **Runtime_Checks** (measured latency/cost, LLM-judged output, synthetic runs, and the LLM-driven spec↔code reconciliation) hold a stable **finding identity** while their measured values may vary within a stated **Tolerance_Band**.

The audit covers twenty-three SUA-scored domains across the System Under Audit (the original fourteen plus nine added coverage domains for adversarial input, prompt-evolution safety, abuse/economic-DoS, supply chain, data lifecycle, concurrency, frontend/API contract, webhook authenticity, and legal/scraping/ToS compliance). These SUA-scored domains are distinct from the engine's own mechanics (the Engine-Correctness Requirements), which are not assigned a Domain_Score — see "Requirement Classification" below:

- **Stack:** Next.js 14 + Postgres/Prisma + Vertex AI (Gemini) + GCP Cloud Run.
- **Core flow:** website/business input → multi-module audit → diagnosis → proposal generation. Target: audit-to-proposal in <30s at $0.06–0.10/audit (the canonical Per_Audit_Cost band; see Glossary).
- **Deployment model:** Multi-tenant SaaS with three modes — Internal Agency, White-Label, Self-Serve B2C.
- **Orchestration:** Temporal (reliability), LangGraph (diagnosis/compiler), LangSmith (observability/evals), n8n (edge automations), Dify (internal ops).

Every requirement below states a measurable pass/fail criterion AND the evidence the Audit_System must capture. Where the intended behavior is ambiguous or specs conflict, the Audit_System records an **Open_Question** rather than guessing. Repository file paths cited in criteria are **evidence anchors**, not implementation mandates; the requirements remain outcome-focused.

### Intended-Source Index (Notion — INTENDED state)

The following Notion pages and databases are the authoritative "intended-source" references. Findings MUST cite the specific page/database when claiming intended behavior.

- **Hub:** Proposal Engine OS (`300495b5-1135-8004-985b-c7e0d3f7235e`)
- **System Architecture Spec** (`013b36ab-315c-4de5-a441-6f51dd389de3`)
- **End-to-End Architecture** (`1003be95-e4dc-4926-957a-fe3e4500c434`)
- **Data Model & Contracts** (`0752971b-bcad-4e46-8588-653f806cb800`)
- **Data Contract Spec** (`93bb168e-5d1d-4be2-8bb8-6e7a7919d0b2`)
- **Prompt & Content Spec** (`a2130a5c-a03a-41e2-96f0-4a6b02b9b755`)
- **Proposal Template Spec** (`a981a3ab-0692-448e-9989-15e92a1b066d`)
- **Feature Flag Matrix** (`f808ec30-a105-46e5-96a4-f0004b32c5e5`)
- **Temporal Workflow Spec — Core Reliability** (`f7efa842-7053-4ca9-bfcb-9ef7b9596b6e`)
- **LangGraph Spec — Diagnosis & Proposal Compiler** (`4f8b9a79-a92b-4352-943b-d728cd623b71`)
- **LangSmith Observability & Evals Plan** (`cd890a73-1b6d-4db1-bf29-9fc2ec0076bc`)
- **n8n Integrations Spec — Edge Automations Only** (`b22dfbc4-352a-4155-ae49-0867b01cd494`)
- **Dify Internal Ops Sandbox** (`e9f7d9bb-ac33-4efd-9749-ae89f28fb842`)
- **Security, Compliance & Risk Register** (`5559b7c8-bb06-4a73-8814-a2e4b59420e4`) and **Risk Register** (`1b1e2e88-f805-460d-a7f0-616e1d548096`)
- **Rollout Plan — MVP → V1 → Agency → B2C** (`4b391dcb-dc11-44fd-bcff-c4bacd5a0f71`)
- **PRDs:** Internal Agency Mode (`257f6eff-6c41-470f-83bd-41d83f8aa8a0`), White-Label Licensing (`fd7b04b3-41bf-45d9-b2c9-9e4d083083e4`), Self-Serve B2C (`3e4b9765-19e7-4400-b5a0-1107914cf1e7`)
- **Live databases:** Product Backlog (`collection://645eba31-b8c5-48e8-a002-35f127d575e8`), Audit Modules Registry (`collection://92d9f52f-31f9-49c4-8425-463269cbd3b9`), Findings Library (`collection://e24e0634-3d62-4063-9d22-963453aaf45f`), Sales Pipeline (`collection://0434775e-4f52-4d81-9732-d01d91b255d4`), Proposal Packages & Pricing (`collection://3d1388f0-d4d0-4d47-8ac9-ad87cdaadc6c`), Metrics & Telemetry (`collection://dc07d282-29f2-46c0-b9cc-734e6bf5304a`), QA / Test Cases (`collection://d48ed205-053d-4242-b45b-3d9bfc1008fc`), SOP Library (`collection://459dd954-66d2-4eae-b5e8-1276a6c11177`), Playbooks (`collection://1454880b-4398-483e-895f-d435e770c80f`)
- **Prior audits (extend, do not duplicate):** System Audit 12-part (`Audit 1`…`Audit 12`, e.g. System Scorecard `b8163964-c637-495e-86b0-c952d4b955eb`), A2Z Production-Grade Audit (`ca0a1f47-825b-47be-8f35-324bfda177aa`), Completion Audit & Remaining Work 2026-05-14 (`360495b5-1135-8123-a03d-c245fed28f44`)

### Verified Findings-Library Schema Note (ground truth)

The reviewer loaded the live databases. The **Findings Library** (`collection://e24e0634-3d62-4063-9d22-963453aaf45f`) does **not** have a `Severity` field. It uses **Impact Score** (1–10), **Confidence Score** (1–10), **Finding Type** (Missing / Underperforming / Broken / Opportunity / Risk), **Root Cause Category**, an **Effort Estimate** enum, and an **Evidence Links** property that is a **single URL** (it cannot hold rich evidence). A `Severity` field with exactly Critical/High/Medium/Low exists only in the **QA / Test Cases** DB (`collection://d48ed205-053d-4242-b45b-3d9bfc1008fc`), which describes a different entity (test scenarios, not findings). Neither DB has `domain`, `intended_source`, `actual_source`, or a stable-id property. Consequently, the internal **Findings_Schema** is the source of truth, and DB population happens through the documented transform in Requirement 30; any field the target DB lacks is handled by that transform and/or proposed as a schema extension (recommendation only).

### Actual-Source Index (Repo — ACTUAL state)

- **Audit orchestration:** `lib/audit/runner.ts`, `lib/audit/modules.ts`, `lib/audit/batchProcessor.ts`, `lib/audit/concurrency.ts`, `lib/orchestrator/auditOrchestrator.ts`, `lib/orchestrator/dataBus.ts`, `lib/queue/auditJobQueue.ts`, `lib/queue/auditJobWorker.ts`
- **Pipeline:** `lib/pipeline/` (`orchestrator.ts`, `stateMachine.ts`, `saga.ts`, `idempotency.ts`, `circuitBreaker.ts`, `deadLetterQueue.ts`, `humanReview.ts`, `learningLoop.ts`, `crossTenantIntelligence.ts`, `tenantConfig.ts`)
- **Diagnosis & graphs:** `lib/diagnosis/`, `lib/graph/diagnosis-graph.ts`, `lib/graph/proposal-graph.ts`, `lib/graph/delivery-graph.ts`, `lib/graph/types.ts`
- **Proposal:** `lib/proposal/` (`runner.ts`, `template-system.ts`, `ProposalQAService.ts`, `schemas.ts`, `pricing.ts`, `validation.ts`), `lib/qa/proposal-quality-scorer.ts`
- **LLM layer:** `lib/llm/` (`gemini.ts`, `provider.ts`, `output-validator.ts`, `cache.ts`, `token-counter.ts`), `lib/config/models.ts`, `lib/config/thinking-budgets.ts`, `prompts/`, `lib/experiments/promptAB.ts`, `lib/telemetry/hallucinationTelemetry.ts`
- **Audit modules:** `lib/modules/` (30+ modules incl. `website.ts`, `gbp.ts`, `seoDeep.ts`, `reputation.ts`, `conversion.ts`, `findingGenerator.ts`, `types.ts`)
- **Data layer:** `prisma/schema.prisma` (models incl. `Audit`, `AuditJob`, `Finding`, `Proposal`, `Tenant`, `AuditSchedule`, `AuditTrailEvent`), `prisma/migrations/`, `lib/prisma.ts`, `lib/db.ts`
- **Tenancy:** `lib/tenant/` (`context.ts`, `TenantProvisioningService.ts`), `lib/auth/` (`rbac.ts`, `apiKeys.ts`, `wrappedPrismaAdapter.ts`), `middleware.ts`, RLS docs `PHASE-2.*-RLS-*.md`
- **Security:** `lib/security/` (`piiScrubber.ts`, `inputSanitizer.ts`, `urlValidator.ts`, `csrf.ts`), `lib/middleware/` (`auth.ts`, `rateLimit.ts`, `idempotency.ts`, `withRole.ts`), `lib/config/security.ts`, `.gitleaks.toml`
- **Observability & QA:** `lib/observability/`, `lib/monitoring/`, `lib/qa/`, `lib/metrics.ts`, `lib/tracing.ts`, `lib/__tests__/`, `tests/`, `vitest.config.ts`
- **Economics:** `lib/costs/costTracker.ts`, `lib/config/costBudget.ts`, `lib/utils/costTracking.ts`, `lib/billing/`, `lib/stripe/pricingService.ts`
- **Integrations:** `lib/integrations/` (`webhooks.ts`, `circuitBreaker.ts`, `retryWrapper.ts`), `lib/notifications/`, `lib/plugins/`
- **Modes / flags:** `lib/config/feature-flags.ts`, `lib/config/FeatureFlagService.ts`, `lib/config/branding.ts`, `lib/pipeline/partnerPortal.ts`
- **Supply chain & lifecycle:** `package.json`, `package-lock.json`, `.github/workflows/`, `lib/retention/`
- **Frontend / API:** `app/` (Next.js client + `app/api/` route handlers), `lib/api/`
- **Deploy & ops:** `Dockerfile`, `Dockerfile.migrate`, `cloudbuild*.yaml`, `terraform/`, `.github/workflows/`, `lib/config/validateEnv.ts`, `.env.example`
- **Prior audit reports:** repo-root `AUDIT_REPORT*.md` (e.g. `AUDIT_REPORT.md`, `AUDIT_REPORT_DATABASE_LAYER.md`, `AUDIT_REPORT_SECURITY_PHASE_G.md`, `AUDIT_REPORT_AI_ML_PHASE_K.md`, `AUDIT_REPORT_PHASE_Z_FINAL.md`)
- **Existing specs:** `.kiro/specs/` (`production-hardening`, `autonomous-proposal-engine`, `agentic-delivery-qa-hardening`, `deep-localization-cross-tenant-intelligence`, `self-evolving-prompts-predictive-intelligence`)

## Glossary

- **Audit_System**: The repeatable audit engine defined by this spec. It runs checks, captures evidence, scores domains, and emits findings and a remediation plan. It does not modify production data, production infrastructure, or the Notion workspace.
- **System_Under_Audit (SUA)**: The Proposal Engine OS platform — its repository code, data layer, infrastructure config, and runtime behavior.
- **Intended_Source**: A Notion page or database that defines intended/spec'd behavior. The authoritative source of "what should be."
- **Actual_Source**: A repository artifact (file path, function, line range, migration, config, or test) representing "what is."
- **Finding**: A single recorded audit result describing a defect, gap, risk, or drift, conforming to the Findings_Schema.
- **Findings_Schema**: The required field set for every Finding (defined in Requirement 29). This internal schema is the source of truth; population of Notion databases is via the transform in Requirement 30.
- **Static_Check**: A check whose result depends only on Pinned_State (repo/config files, the Notion snapshot) and not on live execution — e.g., schema diff, feature-flag matrix comparison, secret scan, module-registry comparison, file presence. Static_Checks SHALL produce byte-for-byte identical findings (ids and severities) across repeated runs on the same Pinned_State.
- **Runtime_Check**: A check that depends on live execution, measured values, or LLM-judged output — e.g., measured latency/cost, Synthetic_Audit_Run behavior, proposal quality scoring, and the LLM-driven spec↔code reconciliation. Reproducibility for a Runtime_Check is **stable finding identity** (same Finding_Fingerprint ⇒ same finding `id`), with measured values allowed to vary within a Tolerance_Band.
- **Tolerance_Band**: The explicitly stated acceptable variation range for a measured value (latency, cost, score) across runs. A Runtime_Check finding's identity is stable while its measured value may differ within this band; only a value outside the band changes pass/fail.
- **Finding_Fingerprint**: The deterministic key used to assign a Finding's stable `id` and to match findings across runs and prior audits. Defined as `domain` + normalized `actual_source` + issue signature (for Runtime_Checks, plus the originating check identifier). Used to classify each Finding as `New`, `Regression`, or `Confirms-Prior` against prior `AUDIT_REPORT*.md` files and Notion audits.
- **Pinned_State**: The snapshot a run is evaluated against — a git commit SHA for the repository **and** a Notion snapshot/timestamp for the intended-sources. "Unchanged inspected state" and all reproducibility claims are defined relative to the same Pinned_State.
- **Isolated_Synthetic_Execution_Environment**: The non-production environment in which Synthetic_Audit_Runs execute — a non-production database, seeded synthetic tenants, Stripe TEST mode, and an enforced LLM spend cap — with teardown of any data it creates. It is forbidden from reading or writing production data, production infrastructure, or the Notion workspace.
- **Severity_Model**: The Critical/High/Medium/Low classification scheme with explicit triggers (defined in Requirement 31). Severity is a property of the internal Findings_Schema; the Findings Library has no native Severity field, so Requirement 30 defines how severity maps into target databases. In this model, severity is based on IMPACT and is independent of workaround availability (see `workaround_available`).
- **workaround_available**: An independent boolean attribute of every Finding (recorded in the Findings_Schema, Requirement 29) stating whether a documented workaround exists for that Finding. It is NOT the discriminator between High and Medium severity (severity is based on impact per Requirement 31.3); it is a separate recorded field consumed by the Go/No-Go logic (Requirement 34.4), where an unresolved High with `workaround_available = false` constrains the verdict.
- **Cost_Instrumentation_Capability**: A probed capability (Requirement 2) indicating whether the cost-tracking instrumentation (`lib/costs/costTracker.ts`, `lib/config/costBudget.ts`) actually emits a per-audit cost signal. WHEN this capability is unavailable or unwired, the Domain 10 cost checks (Requirement 16) become Blocked_Checks rather than reporting null/zero cost.
- **Stub_Substrate**: A "semantics-preserving stub" that re-implements Temporal guarantees (idempotency/retry/timeout/degraded-mode) and against which Domain 5 reliability checks (Requirement 11) MAY run when a real Temporal dev server is unavailable. Findings produced against a Stub_Substrate (and the Domain 5 score) are marked PROVISIONAL because validating a stub's re-implementation proves little about production behavior; the backing substrate (real dev-mode vs stub) is recorded per finding.
- **Drift**: A mismatch between Intended_Source and Actual_Source. **Code-without-spec drift** = implemented behavior with no governing Notion spec. **Spec-without-code drift** = specified behavior with no implementing code.
- **Reconciliation_Status**: One of `Aligned`, `Code-Without-Spec`, `Spec-Without-Code`, `Conflicting`, or `Partially-Aligned`.
- **Partially-Aligned**: A Reconciliation_Status where an Intended_Source and Actual_Source partially correspond — some specified behavior is implemented and some drifts — capturing the common case where drift is partial rather than total.
- **Per_Audit_Cost (COGS)**: The single canonical definition of the cost to produce one audit-to-proposal run = LLM/Gemini token cost + per-audit infrastructure/compute cost + per-audit third-party/API cost attributable to that run. Its target band is $0.06–0.10 and is owned by Requirement 16 (Domain 10). This $0.06–0.10 band is PROVISIONAL: the Notion System Scorecard (`b8163964-c637-495e-86b0-c952d4b955eb`) states a conflicting "$0.50/audit" target, and per Requirement 16.10 this conflict is recorded as an Open_Question (conflicting Intended_Sources are not silently reconciled). A measured Per_Audit_Cost **below** $0.06 is recorded as an informational (Low) Finding noting cost is below the expected band (which may indicate efficiency, under-provisioning, or a measurement gap), not a failure.
- **LLM_Cost_Subset**: The Gemini/LLM-token portion of Per_Audit_Cost. It is a component of Per_Audit_Cost owned for fidelity/grounding purposes by Requirement 10 (Domain 4); Requirement 10 evaluates only this subset against its LLM allocation and does not redefine the total Per_Audit_Cost band.
- **Domain_Score**: A 0–10 score assigned to each audit domain via the formula in Requirement 32.
- **Production_Readiness_Score**: An aggregate 0–10 score computed by the self-contained, security-weighted formula in Requirement 32 (with a Critical-cap). It uses a NEW methodology distinct from the Notion System Scorecard (`b8163964-c637-495e-86b0-c952d4b955eb`), which is an unweighted 12-area expert-judgment blend with no Critical-cap; the engine's weighting and cap are an intentional, disclosed divergence and the two are compared via the domain→Scorecard-area mapping in Requirement 32, not claimed to be equivalent.
- **Evidence**: Concrete artifacts that substantiate a Finding (file:line excerpts, command output, test results, screenshots, Notion citations, trace IDs).
- **Synthetic_Audit_Run**: A controlled end-to-end execution of the SUA audit-to-proposal flow against a representative business input, executed only within the Isolated_Synthetic_Execution_Environment, used to verify runtime behavior.
- **Go_No_Go_Recommendation**: The final production-readiness verdict (Go / Conditional-Go / No-Go) with justification.
- **Open_Question**: A recorded ambiguity or spec conflict requiring human resolution before a definitive Finding can be issued.
- **Blocked_Check**: A check that cannot run because a required access or capability (DB creds, GCP, LangSmith, test execution, secret-scan tooling) is unavailable. Blocked_Checks are reported explicitly as BLOCKED, distinct from Open_Questions.
- **P0**: Highest priority designation. In this spec, tenant data leakage is always P0/Critical.
- **Engine-Correctness Requirement**: A requirement describing the Audit_System's own internal mechanics (its foundation, gates, schema, fingerprinting, scoring engine, registers, and synthetic-environment plumbing). Engine-Correctness Requirements are validated by the engine's own tests and reproducibility checks and are NOT assigned a SUA Domain_Score.
- **SUA-Scored Domain**: A requirement describing an actual capability of the System Under Audit (architecture, data contracts, tenancy, AI/LLM, reliability, proposal quality, modules, security, observability, perf/econ, integrations, modes, deploy/ops, doc-drift, prompt-injection, learning-loop safety, webhook authenticity, rate-limit/abuse, supply-chain, data-lifecycle/RTBF, concurrency/load, frontend/API, and legal/scraping/ToS). Each SUA-Scored Domain receives a 0–10 Domain_Score via Requirement 32.

## Requirement Classification (Engine-Correctness vs SUA-Scored Domains)

Requirements in this spec fall into two classes. Production-readiness scoring (Requirement 32) applies ONLY to the SUA-Scored Domains; you cannot assign a production-readiness 0–10 to the engine's own findings schema or fingerprint logic.

**Engine-Correctness Requirements (NOT assigned a Domain_Score; validated by the engine's own tests):**

- Requirement 1 — Audit System Foundation (Repeatable, Pinned & Non-Destructive)
- Requirement 2 — Required Access & Capabilities Precondition Gate
- Requirement 3 — Isolated Synthetic Execution Environment
- Requirement 4 — Bidirectional Spec-to-Code Reconciliation
- Requirement 27 — Finding Fingerprint & Regression Matching
- Requirement 28 — Audit System Self-Budget (Run-Time & Compute Cost Cap)
- Requirement 29 — Findings Record Schema (Internal Source of Truth)
- Requirement 30 — Findings-to-Database Field-Mapping Transform & Schema-Extension Recommendation
- Requirement 31 — Severity Model
- Requirement 32 — Per-Domain & Overall Production-Readiness Scoring
- Requirement 33 — Synthetic End-to-End Audit Runs Across ≥5 Industries (an engine procedure that produces evidence for the SUA-Scored Domains; not itself scored)
- Requirement 34 — Remediation Plan & Go/No-Go Recommendation
- Requirement 35 — Open Questions Register

**SUA-Scored Domains (each receives a 0–10 Domain_Score via Requirement 32):**

| Domain    | Requirement    | Title                                            |
| --------- | -------------- | ------------------------------------------------ |
| Domain 1  | Requirement 5  | Architecture & Data Flow Integrity               |
| Domain 2  | Requirement 6  | Data Contracts & Schema Conformance              |
| Domain 3  | Requirement 7  | Multi-Tenancy & Data Isolation                   |
| Domain 4  | Requirement 10 | AI/LLM Layer Fidelity, Grounding & Eval Coverage |
| Domain 5  | Requirement 11 | Orchestration Reliability                        |
| Domain 6  | Requirement 12 | Proposal Quality & Conversion                    |
| Domain 7  | Requirement 13 | Audit Modules Registry Coverage & Fallback       |
| Domain 8  | Requirement 14 | Security, Privacy & Compliance                   |
| Domain 9  | Requirement 15 | Observability & QA                               |
| Domain 10 | Requirement 16 | Performance & Economics                          |
| Domain 11 | Requirement 17 | Integrations & Edge Automations Blast Radius     |
| Domain 12 | Requirement 19 | Mode-Specific Correctness via Feature Flags      |
| Domain 13 | Requirement 20 | Deployment & Ops Readiness                       |
| Domain 14 | Requirement 26 | Spec ↔ Code Traceability & Documentation Drift   |
| Domain 15 | Requirement 8  | Prompt Injection & Adversarial Input Defense     |
| Domain 16 | Requirement 9  | Learning-Loop & Self-Evolving Prompt Safety      |
| Domain 17 | Requirement 18 | Webhook Authenticity                             |
| Domain 18 | Requirement 21 | Rate Limiting & Economic-Abuse Resistance        |
| Domain 19 | Requirement 22 | Dependency & Supply-Chain Security               |
| Domain 20 | Requirement 23 | Data Lifecycle, Retention & Deletion             |
| Domain 21 | Requirement 24 | Concurrency & Load Behavior                      |
| Domain 22 | Requirement 25 | Frontend & API Contract Surface                  |
| Domain 23 | Requirement 36 | Legal, Scraping & ToS Compliance                 |

## Requirements

### Requirement 1: Audit System Foundation (Repeatable, Pinned & Non-Destructive)

**User Story:** As a platform owner, I want the audit to be a repeatable, automatable system rather than a one-off report, so that I can re-run it on demand and trust it never alters production, while still measuring live runtime behavior.

#### Acceptance Criteria

1. THE Audit_System SHALL maintain a re-runnable set of registered checks where each check has a unique check identifier, a declared check kind (`Static_Check` or `Runtime_Check`), a target domain, an Intended_Source reference, and an Actual_Source target.
2. WHEN the registered checks are requested, THE Audit_System SHALL return the complete enumerable list of checks with their identifiers, kinds, and targets.
3. THE Audit_System SHALL operate without issuing any create, update, or delete operation against **production data, production infrastructure, or the Notion workspace**; writes required to exercise the pipeline SHALL occur only within the Isolated_Synthetic_Execution_Environment defined in Requirement 3.
4. IF a check would require modifying production code, production data, production infrastructure, or Notion content, THEN THE Audit_System SHALL skip the mutation, leave the target unchanged, and record an Open_Question identifying the check and the skipped mutation.
5. WHEN an audit run completes, THE Audit_System SHALL produce a machine-readable findings record set in which each Finding includes its finding identifier, severity, source check identifier, check kind, and prior-finding classification.
6. WHEN an audit run completes, THE Audit_System SHALL produce a human-readable summary report listing each Finding with its identifier, severity, and classification.
7. WHEN a run is repeated against the same Pinned_State, THE Audit_System SHALL produce, for every `Static_Check`, findings whose identifiers and severities are byte-for-byte identical across two or more consecutive runs; and for every `Runtime_Check`, findings whose identifiers (keyed on the Finding_Fingerprint) and severities are identical, while measured values MAY differ only within the check's stated Tolerance_Band.
8. WHEN an audit run completes, THE Audit_System SHALL cross-reference prior findings recorded in repo-root `AUDIT_REPORT*.md` files and in the Notion 12-part System Audit, A2Z Production-Grade Audit, and Completion Audit, and SHALL classify each Finding — using its Finding_Fingerprint — as exactly one of `New`, `Regression`, or `Confirms-Prior` relative to those sources.

- **Pass/Fail:** PASS when checks are enumerable, non-destructive to production/Notion, and re-runnable with stable finding identity (byte-for-byte for Static_Checks; fingerprint-stable with within-band values for Runtime_Checks); FAIL if any check mutates production/Notion, a Static_Check's finding identity changes on the same Pinned_State, or a Runtime_Check's finding identity changes for an unchanged fingerprint.
- **Evidence to capture:** the registered-check list (ids, kinds, targets); the non-destructive-mode declaration; the Pinned_State (git SHA + Notion snapshot/timestamp); a diff of two consecutive runs (showing Static_Check byte-equality and Runtime_Check fingerprint-stability with per-value Tolerance_Bands); and the cross-reference table mapping findings to prior `AUDIT_REPORT*.md` and Notion audit entries.

### Requirement 2: Required Access & Capabilities Precondition Gate

**User Story:** As an audit operator, I want the audit to declare which capabilities it has before running, so that checks it cannot perform are reported as explicitly blocked rather than silently passing or collapsing into open questions.

#### Acceptance Criteria

1. WHEN an audit run starts, THE Audit_System SHALL determine the availability of each required capability: non-production database credentials, GCP/Vertex AI access, LangSmith access, repository test-suite execution, secret-scan tooling, Notion read access (required to read every Intended_Source for reconciliation and static-intended-source checks), and Cost_Instrumentation_Capability (whether `lib/costs/costTracker.ts` and `lib/config/costBudget.ts` emit a per-audit cost signal).
2. THE Audit_System SHALL record, in the run header, the set of capabilities that were available and the set that were unavailable for that run.
3. IF a required capability is unavailable, THEN THE Audit_System SHALL mark every check depending on that capability as a Blocked_Check stating the missing capability, and SHALL NOT report those checks as passed.
4. IF Notion read access is unavailable, THEN THE Audit_System SHALL mark all reconciliation checks (Requirement 4) and all static-intended-source checks as Blocked_Checks, and SHALL NOT silently proceed as if intended-sources were confirmed.
5. IF the Cost_Instrumentation_Capability is unavailable or unwired (costTracker/costBudget do not emit a per-audit cost signal), THEN THE Audit_System SHALL mark the Domain 10 cost checks (Requirement 16) as Blocked_Checks, and SHALL NOT report null or zero Per_Audit_Cost as a measured value.
6. THE Audit_System SHALL keep Blocked_Checks in a list distinct from Open_Questions and from Findings.
7. WHEN one or more Blocked_Checks affect a domain, THE Audit_System SHALL flag that domain's score and the Go_No_Go_Recommendation as provisional with respect to the blocked coverage.

- **Pass/Fail:** PASS when capability availability (including Notion read access and Cost_Instrumentation_Capability) is recorded and every unavailable-capability check is reported as BLOCKED (never silently passed), with reconciliation and static-intended-source checks marked Blocked when Notion is unreachable and Domain 10 cost checks marked Blocked when cost instrumentation is unavailable; FAIL if a check that could not run is reported as passed, is silently merged into Open_Questions, reconciliation proceeds while Notion is unreachable, or a null/zero cost is reported as a measured Per_Audit_Cost when instrumentation is unwired.
- **Evidence to capture:** the per-run capability availability table (including the Notion read-access status and the Cost_Instrumentation_Capability status), the Blocked_Check list with missing capabilities, and the provisional-coverage flags per affected domain.

### Requirement 3: Isolated Synthetic Execution Environment

**User Story:** As a security owner, I want all live pipeline executions to run in an isolated sandbox, so that measuring runtime behavior never touches production data, infrastructure, real money, or Notion.

#### Acceptance Criteria

1. THE Audit_System SHALL execute every Synthetic_Audit_Run inside the Isolated_Synthetic_Execution_Environment: a non-production database, seeded synthetic tenants, Stripe TEST mode, and an enforced LLM spend cap.
2. THE Audit_System SHALL NOT read or write production data, production infrastructure, or the Notion workspace during any Synthetic_Audit_Run.
3. WHEN a Synthetic_Audit_Run creates rows (Audit, Proposal, Finding, or billing artifacts), THE Audit_System SHALL tear down all data it created in the synthetic database after the run completes.
4. IF a Synthetic_Audit_Run would issue a real (non-TEST) Stripe charge or write to a production datastore, THEN THE Audit_System SHALL abort that run, leave external systems unchanged, and record a Critical Finding citing the attempted production side effect.
5. WHEN the configured LLM spend cap for synthetic execution is reached, THE Audit_System SHALL stop launching further synthetic runs and record the cap event.
6. THE Audit_System SHALL verify (via configuration inspection) that the synthetic environment's database and Stripe endpoints are non-production before any run begins, and SHALL record a Blocked_Check if it cannot confirm isolation.

- **Pass/Fail:** PASS when all synthetic runs execute against non-production DB + synthetic tenants + Stripe TEST + spend cap and created data is torn down; FAIL on any production read/write, real charge, or un-torn-down synthetic data.
- **Evidence to capture:** the synthetic-environment configuration (DB target, tenant seeds, Stripe TEST mode flag, spend cap), the pre-run isolation confirmation, and the post-run teardown log.

### Requirement 4: Bidirectional Spec-to-Code Reconciliation

**User Story:** As a tech lead, I want every finding to cite both the Notion spec and the repo implementation, so that I can see exactly where intended and actual states diverge in both directions.

#### Acceptance Criteria

1. THE Audit_System SHALL, for each Finding, cite at least one Intended_Source (Notion page/database) AND at least one Actual_Source (repo file path with line range or function), OR explicitly record why one side is absent.
2. WHEN implemented behavior exists in an Actual_Source with no governing Intended_Source, THE Audit_System SHALL record a code-without-spec Drift Finding.
3. WHEN an Intended_Source specifies behavior with no implementing Actual_Source, THE Audit_System SHALL record a spec-without-code Drift Finding.
4. WHEN an Intended_Source and an Actual_Source partially correspond — some specified behavior is implemented and some drifts — THE Audit_System SHALL record the capability with Reconciliation_Status = `Partially-Aligned` and cite the aligned and drifting portions.
5. IF two or more Intended_Sources conflict on the same behavior, THEN THE Audit_System SHALL record an Open_Question citing each conflicting source.
6. THE Audit_System SHALL produce a traceability matrix mapping each audited capability to its Intended_Source and Actual_Source with a Reconciliation_Status of `Aligned`, `Code-Without-Spec`, `Spec-Without-Code`, `Conflicting`, or `Partially-Aligned`.
7. WHERE a reconciliation conclusion is produced by the LLM-driven comparison (a Runtime_Check), THE Audit_System SHALL key the resulting Finding on its Finding_Fingerprint so that the finding identity is stable across runs even though the LLM's prose may vary.

- **Pass/Fail:** PASS when 100% of findings carry dual citations (or a documented reason for absence) and the traceability matrix covers all domains using the five-value status set; FAIL on any uncited finding.
- **Evidence to capture:** the traceability matrix (with Partially-Aligned entries); per-finding citation pairs; the list of conflicting-source Open_Questions.

### Requirement 5: Architecture & Data Flow Integrity (Domain 1)

**User Story:** As an architect, I want the end-to-end request → proposal flow verified against the architecture specs, so that I know the implemented pipeline matches the intended design.

#### Acceptance Criteria

1. THE Audit_System SHALL trace the audit-to-proposal flow from input entry through diagnosis to proposal generation across Actual_Sources (`app/api/audit/`, `lib/audit/runner.ts`, `lib/orchestrator/auditOrchestrator.ts`, `lib/diagnosis/`, `lib/graph/diagnosis-graph.ts`, `lib/graph/proposal-graph.ts`, `lib/proposal/runner.ts`) and compare each stage to the System Architecture Spec and End-to-End Architecture pages.
2. WHEN a pipeline stage in the architecture spec has no corresponding implemented stage, THE Audit_System SHALL record a spec-without-code Drift Finding.
3. WHEN an implemented stage performs a transformation not described in the architecture spec, THE Audit_System SHALL record a code-without-spec Drift Finding.
4. THE Audit_System SHALL verify that stage-to-stage data handoffs preserve required fields defined in the End-to-End Architecture and `lib/orchestrator/dataBus.ts`.
5. IF the implemented stage ordering diverges from the architecture spec ordering, THEN THE Audit_System SHALL record a Finding with the divergent sequence.

- **Pass/Fail:** PASS when every architecture-spec stage maps to an implemented stage with matching ordering and field handoffs; FAIL on any unmapped stage or handoff field loss.
- **Evidence to capture:** a stage-by-stage trace table (spec stage → repo file:function → status), the data-handoff field comparison, and citations to both architecture pages.

### Requirement 6: Data Contracts & Schema Conformance (Domain 2)

**User Story:** As a data engineer, I want Prisma models and migrations verified against the Data Contract Spec, so that the persisted schema matches the contract.

#### Acceptance Criteria

1. THE Audit_System SHALL compare every model in `prisma/schema.prisma` (including `Audit`, `AuditJob`, `Finding`, `Proposal`, `Tenant`, `AuditTrailEvent`) field-by-field against the Data Contract Spec and Data Model & Contracts pages.
2. WHEN a field defined in the Data Contract Spec is absent from `prisma/schema.prisma`, THE Audit_System SHALL record a spec-without-code Drift Finding.
3. WHEN a model or field exists in `prisma/schema.prisma` with no corresponding contract entry, THE Audit_System SHALL record a code-without-spec Drift Finding.
4. THE Audit_System SHALL verify that each migration in `prisma/migrations/` is consistent with the current schema and that no model required by the contract lacks a migration.
5. IF a field's type, nullability, or relation in the schema contradicts the Data Contract Spec, THEN THE Audit_System SHALL record a Finding with the conflicting definitions.

- **Pass/Fail:** PASS when all contract fields map to schema fields with matching types/nullability/relations and migrations are consistent; FAIL on any mismatch or missing migration.
- **Evidence to capture:** a per-model field comparison table (a Static_Check, byte-for-byte reproducible on the Pinned_State), the migration consistency check output, and citations to the Data Contract Spec and Data Model & Contracts pages.

### Requirement 7: Multi-Tenancy & Data Isolation (Domain 3 — P0/Critical, Defense-in-Depth)

**User Story:** As a security owner, I want tenant data isolation verified with zero tolerance for leakage and defense-in-depth, so that no tenant can ever access another tenant's data even if one layer is misconfigured.

#### Acceptance Criteria

1. THE Audit_System SHALL enumerate tenant-scoped data paths by an AST/static scan of EVERY `PrismaClient` (and equivalent DB-client) call site AND every raw-SQL entry point in the repository — covering `lib/tenant/context.ts`, `lib/auth/wrappedPrismaAdapter.ts`, `middleware.ts`, and the RLS coverage documents (`PHASE-2.1-RLS-AUDIT.md`, `PHASE-2.6-RLS-COVERAGE-INVENTORY.md`) — such that "100%" means "every query-construction location was inspected," not "every path the reviewer happened to find," and SHALL compare the enumerated call sites to the tenant-isolation requirements in the Security, Compliance & Risk Register and the relevant PRDs.
2. THE Audit_System SHALL require defense-in-depth for every tenant-scoped path: an active RLS policy enforced at the database layer AND an adapter-level `tenantId` filter applied before query execution; satisfaction of only one layer SHALL be recorded as a Critical Finding citing the single-layer path.
3. THE Audit_System SHALL verify that database roles used by the application do not silently defeat RLS — specifically that the application role is not the table owner with implicit bypass and does not hold `BYPASSRLS` — and SHALL record a Critical Finding for any role that can bypass RLS.
4. IF a Synthetic_Audit_Run demonstrates that data created under one tenant is retrievable under another tenant, THEN THE Audit_System SHALL record a Critical Finding and SHALL set the Go_No_Go_Recommendation to No-Go.
5. THE Audit_System SHALL verify that every Prisma model carrying tenant-owned data has a `tenantId` (or equivalent ownership) column and a corresponding enforced isolation control at both the RLS and adapter layers.
6. IF a Prisma model carrying tenant-owned data lacks a `tenantId` column or lacks isolation control at either layer, THEN THE Audit_System SHALL record a Finding with Severity = Critical citing the model and the missing layer.
7. THE Audit_System SHALL verify that `lib/pipeline/crossTenantIntelligence.ts` aggregates data only through the anonymization/privacy controls defined in its Intended_Source.
8. IF `lib/pipeline/crossTenantIntelligence.ts` exposes raw (non-anonymized) cross-tenant data, THEN THE Audit_System SHALL record a Finding with Severity = Critical citing the exposure path.

- **Pass/Fail:** PASS only when 100% of tenant paths carry BOTH RLS and adapter-level isolation, no application DB role can bypass RLS, every tenant-owned model has a `tenantId` + both controls, and a synthetic cross-tenant retrieval returns zero foreign-tenant records; ANY single-layer-only path, RLS-bypassing role, leakage, or unscoped path = FAIL = Critical = No-Go.
- **Evidence to capture:** the AST/static-scan method and the enumerated tenant-path call-site inventory (file:line per `PrismaClient`/DB-client call site and per raw-SQL entry point) with both isolation layers per path, the DB-role/BYPASSRLS check output, the RLS coverage cross-reference, the per-model `tenantId`/control map, and the synthetic cross-tenant isolation test result including tenant identifiers used and the count of records returned per tenant.

### Requirement 8: Prompt Injection & Adversarial Input Defense (Domain 15)

**User Story:** As an AI security owner, I want defenses against prompt injection from scraped business websites verified, so that hostile page content cannot steer the LLM into unintended actions or output.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that untrusted scraped input is sanitized and bounded before reaching the LLM, citing `lib/security/inputSanitizer.ts` and `lib/security/urlValidator.ts` as the implementing controls and the Prompt & Content Spec / Risk Register as the Intended_Source.
2. WHEN a Synthetic_Audit_Run supplies input containing injection payloads (e.g., instructions attempting to override system prompts, exfiltrate data, or change output format), THE Audit_System SHALL verify the generated proposal and diagnosis remain within the intended task and SHALL record a Finding if the injected instruction alters system behavior.
3. THE Audit_System SHALL verify that `lib/security/urlValidator.ts` rejects disallowed URL schemes and internal/SSRF targets before fetching, recording a Finding for any unvalidated fetch path.
4. IF injected content causes the system to emit content outside the proposal task (e.g., leaking system prompt, following attacker instructions), THEN THE Audit_System SHALL record a Finding with Severity ≥ High.
5. THE Audit_System SHALL treat prompt-injection defense as distinct from grounding/hallucination control (Requirement 10); a grounded-but-injected output and an injection-resistant-but-ungrounded output SHALL each be recorded separately.
6. THE Audit_System SHALL record that a prompt-injection PASS means "no canary/oracle condition tripped" — a LOWER BOUND on injection resistance, NOT a proof of injection-immunity; because subtle semantic steering (e.g., biasing a diagnosis toward a plausible-but-wrong finding) may evade the canary oracle, THE Audit_System SHALL note this evasion risk as a known limitation and SHALL record it as a candidate Open_Question for manual review.

- **Pass/Fail:** PASS (lower-bound) when sanitization/URL validation are enforced and no canary/oracle condition is tripped by injection payloads in synthetic runs; this is a lower bound on injection resistance, NOT a proof of injection-immunity, and the residual risk of subtle semantic steering evading the oracle SHALL be stated as a known limitation. FAIL on any tripped oracle condition, successful injection, or unvalidated fetch.
- **Evidence to capture:** the sanitizer/URL-validator control trace, the injection-payload test inputs and resulting outputs, the separation of injection findings from grounding findings, and the recorded lower-bound limitation note plus the semantic-steering Open_Question candidate.

### Requirement 9: Learning-Loop & Self-Evolving Prompt Safety (Domain 16)

**User Story:** As an AI governance owner, I want automated prompt mutation audited for regression risk, bounded drift, and rollback, so that self-evolving prompts cannot silently degrade quality or safety.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that automated prompt changes produced by `lib/pipeline/learningLoop.ts` (and the self-evolving-prompts spec) are subject to a regression check against an eval baseline before promotion.
2. THE Audit_System SHALL verify that prompt evolution is bounded — each automated change stays within a defined drift limit relative to the prompt baseline — recording a Finding when no bound is enforced.
3. THE Audit_System SHALL verify that an approval and rollback path exists for automated prompt changes, recording a Finding if a promoted prompt cannot be reverted to a prior version.
4. THE Audit_System SHALL reconcile the prompt-fidelity baseline of Requirement 10.1 with sanctioned evolution: the fidelity baseline SHALL be defined as the most recently APPROVED prompt version, and a difference between a deployed prompt and the Prompt & Content Spec SHALL be recorded as a Drift Finding only when it lies outside a sanctioned, approved evolution.
5. IF an automated prompt change is promoted without passing the regression check or without a rollback path, THEN THE Audit_System SHALL record a Finding with Severity ≥ High.

- **Pass/Fail:** PASS when prompt evolution is regression-gated, bounded, approvable, and reversible, and fidelity is measured against the approved baseline; FAIL on ungated promotion, unbounded drift, or missing rollback.
- **Evidence to capture:** the learning-loop promotion path, the regression-gate and drift-bound configuration, the rollback mechanism, and the reconciliation note tying fidelity baseline to approved prompt versions.

### Requirement 10: AI/LLM Layer Fidelity, Grounding & Eval Coverage (Domain 4)

**User Story:** As an AI lead, I want prompts, grounding, eval coverage, and the LLM cost subset verified against the Prompt & Content Spec and LangSmith plan, so that LLM output is faithful, grounded, and measured.

#### Acceptance Criteria

1. THE Audit_System SHALL compare prompts in `prompts/` and `lib/llm/` against the Prompt & Content Spec — using the approved-baseline definition from Requirement 9.4 — recording any deviation in tone standards, guardrails, or claim policy as a Finding.
2. THE Audit_System SHALL verify that anti-hallucination and grounding controls (`lib/llm/output-validator.ts`, `lib/telemetry/hallucinationTelemetry.ts`) implement the claim policy defined in the Prompt & Content Spec.
3. THE Audit_System SHALL verify that LangSmith eval coverage exists for the diagnosis and proposal graphs as defined in the LangSmith Observability & Evals Plan, and SHALL record a Finding when a required eval dataset or baseline is absent.
4. WHEN the measured LLM_Cost_Subset for a Synthetic_Audit_Run exceeds its allocated LLM budget within the Per_Audit_Cost band, THE Audit_System SHALL record a Finding citing the measured LLM-token cost and the LLM allocation; this criterion evaluates only the LLM_Cost_Subset and SHALL NOT redefine the total Per_Audit_Cost band, which is owned exclusively by Requirement 16.
5. WHEN measured audit-to-proposal latency exceeds 30 seconds in a Synthetic_Audit_Run, THE Audit_System SHALL record a Finding citing the measured value and the budgeted value.
6. IF the configured model in `lib/config/models.ts` differs from the model specified in the Prompt & Content Spec, THEN THE Audit_System SHALL record a Drift Finding.

- **Pass/Fail:** PASS when prompts match the approved baseline, grounding controls enforce the claim policy, eval baselines exist, and measured LLM_Cost_Subset and latency are within budget (within Tolerance_Band across runs); FAIL on prompt drift, missing grounding, missing evals, or budget breach.
- **Evidence to capture:** prompt-vs-spec diffs, grounding-control trace, LangSmith eval dataset/baseline inventory, and measured LLM_Cost_Subset and latency per synthetic run with their Tolerance_Bands.

### Requirement 11: Orchestration Reliability (Domain 5)

**User Story:** As a reliability engineer, I want idempotency, retries, timeouts, degraded-mode handling, and graph-node correctness verified, so that the pipeline behaves reliably under failure.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that orchestration idempotency controls (`lib/pipeline/idempotency.ts`, `lib/middleware/idempotency.ts`, `lib/audit/runner.ts` idempotency keys) match the guarantees in the Temporal Workflow Spec.
2. THE Audit_System SHALL verify that retry, timeout, and dead-letter behavior (`lib/pipeline/circuitBreaker.ts`, `lib/pipeline/deadLetterQueue.ts`, `lib/pipeline/saga.ts`, `lib/resilience/`) match the Temporal Workflow Spec.
3. WHEN a module or stage fails during a Synthetic_Audit_Run, THE Audit_System SHALL verify the system enters the degraded mode defined in the "SOP: Handling Failed Modules / Degraded Mode" page, and SHALL record a Finding if it does not.
4. THE Audit_System SHALL verify that each LangGraph node in `lib/graph/diagnosis-graph.ts` and `lib/graph/proposal-graph.ts` corresponds to a node defined in the LangGraph Spec and produces the specified output contract.
5. IF re-processing the same input produces duplicate side effects (duplicate findings, duplicate proposals, double charges), THEN THE Audit_System SHALL record a Finding with the duplicated artifact.
6. WHEN reliability checks (idempotency/retry/timeout/degraded-mode) execute against a Stub_Substrate rather than a real Temporal dev server, THE Audit_System SHALL mark the resulting Domain 5 findings (and the Domain 5 score) as provisional and SHALL record which substrate (real dev-mode vs stub) backed each finding.

- **Pass/Fail:** PASS when idempotency holds, retries/timeouts/degraded-mode match spec, and graph nodes conform; FAIL on duplicate side effects or unhandled failure. WHEN any reliability finding is backed by a Stub_Substrate, that finding and the Domain 5 score are PROVISIONAL, because validating a stub's re-implementation of the Temporal guarantees does not prove production behavior.
- **Evidence to capture:** idempotency replay test output, retry/timeout config comparison, degraded-mode trigger trace, the graph-node-to-spec mapping, and the per-finding substrate-backing record (real Temporal dev-mode vs Stub_Substrate) with the resulting provisional flags on the Domain 5 findings and score.

### Requirement 12: Proposal Quality & Conversion (Domain 6)

**User Story:** As a product owner, I want generated proposals verified against the Proposal Template Spec and a ≥8/10 quality rubric using an independent cross-check, so that the product output meets the conversion bar and the scorer itself is trustworthy.

#### Acceptance Criteria

1. THE Audit_System SHALL compare proposal output structure from `lib/proposal/template-system.ts` and `lib/proposal/runner.ts` against the Proposal Template Spec section-by-section.
2. WHEN a required proposal section defined in the Proposal Template Spec is missing from generated output, THE Audit_System SHALL record a Finding.
3. THE Audit_System SHALL score each proposal produced in a Synthetic_Audit_Run using BOTH the in-repo scorer (`lib/qa/proposal-quality-scorer.ts`, `lib/proposal/ProposalQAService.ts`) AND an independent rubric defined by this spec that does not reuse the in-repo scorer's code, and SHALL record a Finding for any proposal scoring below 8/10 on either method.
4. THE Audit_System SHALL audit the in-repo proposal-quality scorer itself: WHEN the in-repo scorer and the independent rubric disagree beyond a stated Tolerance_Band on the same proposal, THE Audit_System SHALL record a Finding citing the scorer as a potential source of error.
5. THE Audit_System SHALL verify that proposal pricing logic (`lib/proposal/pricing.ts`, `lib/proposal/tierMapping.ts`) matches the Proposal Packages & Pricing database.
6. IF a generated proposal contains a claim not grounded in captured audit findings, THEN THE Audit_System SHALL record a Finding citing the ungrounded claim.

- **Pass/Fail:** PASS when proposal structure matches the template spec, all synthetic proposals score ≥8/10 on both the in-repo scorer and the independent rubric (agreeing within Tolerance_Band), and pricing matches the pricing database; FAIL on missing sections, sub-8 scores on either method, scorer/independent disagreement beyond band, or ungrounded claims.
- **Evidence to capture:** template section conformance table, per-proposal scores from both the in-repo scorer and the independent rubric, the scorer-vs-rubric agreement analysis, pricing comparison, and ungrounded-claim list.

### Requirement 13: Audit Modules Registry Coverage & Fallback (Domain 7)

**User Story:** As an audit-engine owner, I want module coverage and failure fallback verified against the Audit Modules Registry, so that the registry reflects reality and module failures degrade gracefully.

#### Acceptance Criteria

1. THE Audit_System SHALL compare the modules registered in `lib/audit/modules.ts` and `lib/modules/` against the Audit Modules Registry database, recording any registry entry with no implementing module and any implemented module absent from the registry.
2. WHEN a registered module has no corresponding implementation file, THE Audit_System SHALL record a spec-without-code Drift Finding.
3. WHEN an implemented module is absent from the Audit Modules Registry, THE Audit_System SHALL record a code-without-spec Drift Finding.
4. WHEN a single module fails during a Synthetic_Audit_Run, THE Audit_System SHALL verify the overall audit still completes with the failed module's contribution marked as degraded, per the registry's fallback behavior.
5. IF a module failure aborts the entire audit run, THEN THE Audit_System SHALL record a Finding citing the failed module and the abort behavior.

- **Pass/Fail:** PASS when registry and implementation match (a Static_Check, byte-for-byte reproducible) and single-module failure is isolated; FAIL on registry drift or cascading module failure.
- **Evidence to capture:** the module registry-vs-implementation table, and the single-module-failure isolation trace.

### Requirement 14: Security, Privacy & Compliance (Domain 8)

**User Story:** As a compliance owner, I want authz, secrets, PII handling, and tenant boundaries verified against the Risk Register, so that security controls match documented risks.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that authentication and authorization controls (`lib/auth/rbac.ts`, `lib/middleware/auth.ts`, `lib/middleware/withRole.ts`, `middleware.ts`) enforce the access model defined in the Security, Compliance & Risk Register.
2. THE Audit_System SHALL verify that secrets are sourced from a secret manager and not committed, cross-checking `.env.example`, `.gitleaks.toml`, and `SECURITY-INCIDENT.md`, and SHALL record a Critical Finding for any plaintext secret in source control.
3. THE Audit_System SHALL verify that PII handling (`lib/security/piiScrubber.ts`, input sanitization in `lib/security/inputSanitizer.ts`) matches the privacy requirements in the Risk Register.
4. THE Audit_System SHALL map each risk in the Risk Register to its mitigating Actual_Source control, recording a Finding for any unmitigated risk.
5. WHEN a risk in the Risk Register is marked as an accepted risk, THE Audit_System SHALL reconcile findings against that accepted-risk status so that an already-accepted risk is not re-raised as a new Finding, and SHALL instead annotate it as accepted with a citation to the Risk Register entry.
6. THE Audit_System SHALL allow documented suppression of a Finding only when a justification and an authorizing Risk Register reference are recorded, and SHALL list all suppressed findings separately.
7. IF an API route exposes tenant-scoped data without an authorization check, THEN THE Audit_System SHALL record a Finding with Severity ≥ High (Critical if cross-tenant exposure is possible).

- **Pass/Fail:** PASS when authz/secrets/PII controls match the Risk Register, every register risk maps to a control, and accepted risks are reconciled rather than re-fired; FAIL on any plaintext secret, unmitigated non-accepted risk, undocumented suppression, or unauthorized data exposure.
- **Evidence to capture:** risk-register-to-control mapping (including accepted-risk status), secret-scan results, PII-control trace, the route authorization inventory, and the suppressed-findings list with justifications.

### Requirement 15: Observability & QA (Domain 9)

**User Story:** As a QA lead, I want logging, tracing, metrics, test coverage, and regression gates verified, so that the system is observable and protected against regressions.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that structured logging, tracing, and metrics (`lib/logger.ts`, `lib/tracing.ts`, `lib/metrics.ts`, `lib/observability/`) emit the signals required by the LangSmith Observability & Evals Plan.
2. THE Audit_System SHALL execute the repository test suites (`lib/__tests__/`, `tests/`, `vitest.config.ts`) and record the pass rate, recording a Finding for any failing test.
3. THE Audit_System SHALL compare implemented test cases against the QA / Test Cases database and SHALL record a Finding for any documented test case with no automated coverage.
4. THE Audit_System SHALL verify that CI regression gates (`.github/workflows/`) block merges on test failure, recording a Finding if a required gate is absent.
5. IF measured test coverage for a P0 path (tenant isolation, proposal generation, cost tracking) is absent, THEN THE Audit_System SHALL record a Finding citing the uncovered path.

- **Pass/Fail:** PASS when observability signals exist, test suite passes, QA database cases are covered, and regression gates are enforced; FAIL on failing tests, uncovered P0 paths, or missing gates.
- **Evidence to capture:** observability signal inventory, test run output with pass rate, QA-database coverage map, and CI gate configuration.

### Requirement 16: Performance & Economics — Measured with Statistical Rigor (Domain 10)

**User Story:** As a finance-aware owner, I want the <30s and $0.06–0.10/audit targets measured with statistically meaningful samples, so that performance and unit economics are verified by data rather than a single worst-case sample.

#### Acceptance Criteria

1. THE Audit_System SHALL own the canonical Per_Audit_Cost (COGS) definition — LLM/Gemini token cost + per-audit infrastructure/compute cost + per-audit third-party/API cost — and SHALL measure it using `lib/costs/costTracker.ts` and `lib/config/costBudget.ts` instrumentation; this measurement depends on the Cost_Instrumentation_Capability probed in Requirement 2.
2. THE Audit_System SHALL execute a minimum of N Synthetic_Audit_Runs per industry (N ≥ 20) and SHALL report latency and Per_Audit_Cost as distributions with p50, p95, and p99 values, explicitly separating cold-start runs from warm runs.
3. THE Audit_System SHALL gate audit-to-proposal latency by sample volume: for a Default_Sample (N = 8–10 per Requirement 33), THE Audit_System SHALL evaluate the 30-second latency GATE on the warm-run p50 (reporting p95/p99 informationally but NOT gating on them at Default_Sample volume, where p95 ≈ the single worst run and flips run-to-run); for a Deep_Run (N ≥ 20), THE Audit_System SHALL evaluate the 30-second latency GATE on the warm-run p95, where p95 is statistically meaningful. Cold-start runs SHALL remain a separate distribution at every volume.
4. WHEN the gated latency value for the run's sample volume (p50 at Default_Sample, p95 at Deep_Run) exceeds 30 seconds, THE Audit_System SHALL record a Finding citing the p50/p95/p99 latencies, the gated metric used, and the contributing stages.
5. IF the Cost_Instrumentation_Capability is unavailable or unwired (per Requirement 2.5), THEN THE Audit_System SHALL mark the Domain 10 cost checks as Blocked_Checks and SHALL NOT report null or zero as a measured Per_Audit_Cost.
6. WHEN measured p50 Per_Audit_Cost falls outside the $0.06–0.10 band, THE Audit_System SHALL record a Finding citing the measured cost distribution and the dominant cost drivers; a measured Per_Audit_Cost below $0.06 SHALL be recorded as an informational (Low) Finding noting that cost is below the expected band (which may indicate efficiency, under-provisioning, or a measurement gap), not a failure.
7. THE Audit_System SHALL define a Tolerance_Band for latency and cost and SHALL treat measured values within the band as stable across runs (per Requirement 1.7), so that finding identity does not change merely because a measured value moved within the band.
8. THE Audit_System SHALL declare concrete default Tolerance_Band values for latency, cost, and proposal quality score (the specific numeric values are specified by the design), so that "within band" is evaluable rather than abstract.
9. THE Audit_System SHALL state the cold-start handling explicitly: cold-start runs SHALL be reported as a separate distribution and SHALL NOT be averaged into the warm-run p50/p95/p99 figures.
10. THE Audit_System SHALL record an Open_Question citing BOTH the $0.06–0.10 hub/requirements canonical band AND the Notion System Scorecard's (`b8163964-c637-495e-86b0-c952d4b955eb`) stated "$0.50/audit" target as conflicting Intended_Sources (~5–8× apart), and SHALL treat the canonical $0.06–0.10 band as PROVISIONAL pending reconciliation of that conflict, applying the engine's own rule that conflicting Intended_Sources produce an Open_Question rather than a guessed constant.
11. WHILE the cost-target conflict in criterion 10 remains unresolved, THE Audit_System SHALL mark this requirement's cost verdict (criterion 6) as provisional in the run output, and SHALL NOT present the cost PASS/FAIL as definitive.

- **Pass/Fail:** PASS when ≥N runs/industry are collected, p50/p95/p99 are reported with cold-start separated, default Tolerance_Bands are declared, the volume-appropriate latency gate holds (p50 ≤ 30s at Default_Sample; p95 ≤ 30s at Deep_Run), and p50 Per_Audit_Cost is within $0.06–0.10; FAIL on insufficient sample size, missing percentiles, undeclared Tolerance_Bands, the gated latency value exceeding 30s, or p50 cost outside band (over-band only; under-band is informational). WHEN the Cost_Instrumentation_Capability is unavailable, the cost checks are BLOCKED (not PASS/FAIL). The cost verdict is PROVISIONAL while the $0.06–0.10 vs $0.50/audit conflict (criterion 10) remains open.
- **Evidence to capture:** per-run latency and cost measurements, the p50/p95/p99 distributions per industry with cold-start separated, the gated latency metric used per sample volume (p50 at Default_Sample, p95 at Deep_Run), the stage-level latency breakdown, the cost-driver breakdown, the Cost_Instrumentation_Capability status (and any Blocked_Check it triggered), the declared default Tolerance_Bands for latency/cost/quality, and the cost-conflict Open_Question citing both the $0.06–0.10 band and the $0.50/audit Scorecard target.

### Requirement 17: Integrations & Edge Automations Blast Radius (Domain 11)

**User Story:** As an integrations owner, I want n8n and Dify boundaries verified against their specs, so that automations stay within their intended scope and blast radius.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that n8n usage matches the "n8n Integrations Spec — Edge Automations Only" page, recording a Finding for any n8n automation operating outside the edge-automation boundary.
2. THE Audit_System SHALL verify that Dify usage matches the "Dify Internal Ops Sandbox" page, recording a Finding for any Dify dependency in a customer-facing path.
3. THE Audit_System SHALL inventory integration entry points (`lib/integrations/webhooks.ts`, `lib/notifications/`, `lib/plugins/`) and document the blast radius (data accessed, side effects) of each.
4. WHEN an integration can trigger a state change in the core audit-to-proposal flow, THE Audit_System SHALL record a Finding citing the coupling.
5. IF an integration lacks a circuit breaker or retry boundary (`lib/integrations/circuitBreaker.ts`, `lib/integrations/retryWrapper.ts`), THEN THE Audit_System SHALL record a Finding.

- **Pass/Fail:** PASS when n8n/Dify stay within spec boundaries and each integration has a bounded blast radius with resilience controls; FAIL on boundary violations or unbounded coupling.
- **Evidence to capture:** n8n/Dify boundary comparison, integration blast-radius inventory, and resilience-control presence per integration.

### Requirement 18: Webhook Authenticity (Domain 17)

**User Story:** As an integrations security owner, I want inbound webhooks verified for signature and replay protection, so that forged or replayed webhook calls cannot drive system behavior.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that every inbound webhook handler in `lib/integrations/webhooks.ts` validates a cryptographic signature before acting on the payload, recording a Finding for any handler that processes unsigned or unverified payloads.
2. THE Audit_System SHALL verify that webhook handlers enforce replay protection (timestamp/window and/or nonce or event-id deduplication), recording a Finding for any handler lacking replay protection.
3. WHEN a Synthetic_Audit_Run submits a webhook with an invalid signature, THE Audit_System SHALL verify the handler rejects the request without side effects.
4. WHEN a Synthetic_Audit_Run replays a previously valid webhook, THE Audit_System SHALL verify the handler processes the event at most once.
5. IF a webhook handler acts on a payload before verifying its signature, THEN THE Audit_System SHALL record a Finding with Severity ≥ High.

- **Pass/Fail:** PASS when all inbound webhooks verify signatures and reject replays with no side effects; FAIL on any unverified payload processing or successful replay.
- **Evidence to capture:** per-handler signature-verification trace, replay-protection mechanism, and the invalid-signature and replay test results.

### Requirement 19: Mode-Specific Correctness via Feature Flags (Domain 12)

**User Story:** As a multi-mode product owner, I want Agency, White-Label, and B2C behavior verified against the Feature Flag Matrix, so that each mode exposes only its intended capabilities.

#### Acceptance Criteria

1. THE Audit_System SHALL compare flag definitions in `lib/config/feature-flags.ts` and `lib/config/FeatureFlagService.ts` against the Feature Flag Matrix and the three mode PRDs.
2. WHEN a flag required by the Feature Flag Matrix is absent from the implementation, THE Audit_System SHALL record a spec-without-code Drift Finding.
3. WHEN an implemented flag is absent from the Feature Flag Matrix, THE Audit_System SHALL record a code-without-spec Drift Finding.
4. THE Audit_System SHALL verify, per mode (Internal Agency, White-Label, Self-Serve B2C), that capabilities gated by flags match the corresponding PRD, including White-Label branding (`lib/config/branding.ts`) and partner portal scope (`lib/pipeline/partnerPortal.ts`).
5. IF a capability intended for one mode is reachable in another mode, THEN THE Audit_System SHALL record a Finding citing the cross-mode exposure.

- **Pass/Fail:** PASS when flags match the matrix (a Static_Check, byte-for-byte reproducible) and each mode exposes exactly its PRD-defined capabilities; FAIL on flag drift or cross-mode capability exposure.
- **Evidence to capture:** flag-matrix comparison table, per-mode capability map, and any cross-mode exposure trace.

### Requirement 20: Deployment & Ops Readiness (Domain 13)

**User Story:** As an ops owner, I want Cloud Run config, env, rollback, and runbooks verified against the Rollout Plan and SOPs, so that the system is operationally ready.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that deployment configuration (`Dockerfile`, `cloudbuild*.yaml`, `terraform/`, `cron.yaml`) matches the GCP Cloud Run targets in the Rollout Plan.
2. THE Audit_System SHALL verify that required environment variables are validated at startup (`lib/config/validateEnv.ts`) and documented in `.env.example`, recording a Finding for any undocumented or unvalidated required variable.
3. THE Audit_System SHALL verify that a rollback path exists and matches the "SOP: Incident Response & Rollback" page, recording a Finding if absent.
4. THE Audit_System SHALL verify that operational runbooks in the SOP Library have corresponding implemented capabilities (e.g., scheduled audits via `lib/retention/scheduled-audit-runner.ts`).
5. IF a deploy step in the Rollout Plan has no corresponding pipeline configuration, THEN THE Audit_System SHALL record a spec-without-code Drift Finding.

- **Pass/Fail:** PASS when deploy config, env validation, rollback path, and runbooks match the Rollout Plan and SOPs; FAIL on config mismatch, unvalidated env, or missing rollback.
- **Evidence to capture:** deploy-config-vs-rollout-plan comparison, env-variable validation map, rollback-path verification, and runbook-to-capability mapping.

### Requirement 21: Rate Limiting & Economic-Abuse Resistance (Domain 18)

**User Story:** As a Self-Serve B2C owner, I want rate limits and per-tenant spend caps verified, so that an attacker cannot trigger expensive audits as an economic denial-of-service.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that rate limiting (`lib/middleware/rateLimit.ts`) is applied to the audit-triggering and other cost-incurring endpoints, recording a Finding for any cost-incurring endpoint without a rate limit.
2. THE Audit_System SHALL verify that a per-tenant spend cap exists for audit/LLM cost and that exceeding it stops further cost-incurring work for that tenant, recording a Finding if no per-tenant cap is enforced.
3. WHEN a Synthetic_Audit_Run issues requests exceeding the configured rate limit, THE Audit_System SHALL verify the system throttles or rejects the excess rather than executing unbounded audits.
4. WHEN a synthetic tenant's spend reaches its configured cap, THE Audit_System SHALL verify further cost-incurring operations for that tenant are blocked.
5. IF the system permits unbounded audit invocation that drives unbounded LLM/compute cost, THEN THE Audit_System SHALL record a Finding with Severity ≥ High citing the unbounded path.

- **Pass/Fail:** PASS when cost-incurring endpoints are rate-limited and per-tenant spend caps are enforced and effective in synthetic tests; FAIL on any unbounded cost path or missing per-tenant cap.
- **Evidence to capture:** the endpoint-to-rate-limit map, the per-tenant spend-cap configuration, and the throttle/cap enforcement test results.

### Requirement 22: Dependency & Supply-Chain Security (Domain 19)

**User Story:** As a security owner, I want npm dependency vulnerabilities and license compliance verified, so that the supply chain does not introduce known vulnerabilities or incompatible licenses.

#### Acceptance Criteria

1. THE Audit_System SHALL inventory dependencies from `package.json` and `package-lock.json` and check them against a vulnerability source, recording a Finding for each dependency with a known vulnerability at or above a stated severity threshold.
2. THE Audit_System SHALL verify that dependency versions are resolved/pinned via the lockfile, recording a Finding for any direct dependency without a locked resolution.
3. THE Audit_System SHALL check dependency licenses for compatibility with the project's licensing policy, recording a Finding for any disallowed or unknown license.
4. THE Audit_System SHALL verify that CI (`.github/workflows/`) runs a dependency/secret scan, recording a Finding if no supply-chain scan gate exists.
5. IF a dependency name appears to be a typosquat or otherwise suspicious package, THEN THE Audit_System SHALL record a Finding citing the package and the concern.

- **Pass/Fail:** PASS when no known vulnerabilities at/above threshold, all direct deps are locked, licenses comply, and a CI scan gate exists; FAIL on any threshold vulnerability, unlocked dep, disallowed license, or missing scan gate.
- **Evidence to capture:** the dependency inventory, the vulnerability scan output, the license report, and the CI scan-gate configuration. (This is distinct from secret handling in Requirement 14.2.)

### Requirement 23: Data Lifecycle, Retention & Deletion (Domain 20)

**User Story:** As a privacy owner, I want retention, backup, and right-to-be-forgotten verified against the Risk Register, so that multi-tenant PII is governed across its lifecycle.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that a data retention policy is implemented (`lib/retention/`) and matches the retention requirements in the Security, Compliance & Risk Register, recording a Finding for any data class lacking a defined retention period.
2. THE Audit_System SHALL verify that a backup mechanism exists for tenant data and that its scope and cadence match the Rollout Plan / Risk Register, recording a Finding if backups are absent or undefined.
3. THE Audit_System SHALL verify that a deletion (right-to-be-forgotten) path exists that removes a tenant's PII across primary stores and derived/aggregated stores, recording a Finding for any store from which tenant PII cannot be deleted.
4. THE Audit_System SHALL ENUMERATE the concrete derived/aggregated stores in scope for deletion — at minimum: LLM/response caches (`lib/llm/cache.ts`), LangSmith traces, application logs, and cross-tenant aggregates (`lib/pipeline/crossTenantIntelligence.ts`) — and SHALL verify that a tenant's PII is unretrievable from EACH enumerated store after deletion, recording a Finding for any enumerated store that retains retrievable PII (tied to the cross-tenant retention concern in Requirement 7.7/7.8).
5. WHEN a Synthetic_Audit_Run requests deletion of a synthetic tenant's data, THE Audit_System SHALL verify the data is no longer retrievable from the synthetic primary store after deletion.
6. IF cross-tenant aggregated data (`lib/pipeline/crossTenantIntelligence.ts`) retains a tenant's identifiable contribution after deletion, THEN THE Audit_System SHALL record a Finding citing the residual data.

- **Pass/Fail:** PASS when retention is defined per data class, backups exist, the derived stores (LLM/response caches, LangSmith traces, application logs, cross-tenant aggregates) are enumerated, and tenant PII is deletable and unretrievable across primary and EACH enumerated derived store (verified synthetically); FAIL on any undefined retention, missing backup, unenumerated derived store, or undeletable PII in any enumerated store.
- **Evidence to capture:** the retention-policy-to-data-class map, the backup configuration, the enumerated-derived-store list, the deletion-path inventory across primary and each enumerated derived store, and the synthetic deletion verification (per-store unretrievability check).

### Requirement 24: Concurrency & Load Behavior (Domain 21)

**User Story:** As a reliability engineer, I want behavior under concurrent load verified, so that correctness and isolation hold beyond single-run latency.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that concurrency controls (`lib/audit/concurrency.ts`, `lib/audit/batchProcessor.ts`, `lib/queue/`) match the concurrency limits and queueing behavior defined in the Temporal Workflow Spec.
2. WHEN multiple Synthetic_Audit_Runs execute concurrently across multiple synthetic tenants, THE Audit_System SHALL verify that outputs remain correctly tenant-scoped (supporting Requirement 7) and that no run corrupts another's state.
3. THE Audit_System SHALL measure throughput and latency under a defined concurrent load and report the p50/p95/p99 latency under that load alongside the single-run figures from Requirement 16.
4. WHEN concurrency exceeds the configured limit, THE Audit_System SHALL verify excess work is queued or rejected rather than overwhelming shared resources.
5. IF concurrent execution produces cross-run data corruption, deadlock, or lost updates, THEN THE Audit_System SHALL record a Finding with Severity ≥ High citing the failure.

- **Pass/Fail:** PASS when concurrency controls match spec, concurrent runs stay tenant-scoped and uncorrupted, and excess load is queued/rejected; FAIL on any corruption, deadlock, lost update, or tenant-scope breach under load.
- **Evidence to capture:** the concurrency-control-vs-spec comparison, the concurrent-run tenant-scope verification, the under-load latency distribution, and the over-limit queueing/rejection behavior.

### Requirement 25: Frontend & API Contract Surface (Domain 22)

**User Story:** As a frontend owner, I want the Next.js client and API contract verified, so that the API conforms to its contract and the client does not over-expose data.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that `app/api/` route handlers conform to the API contract defined in the Data Contract Spec / OpenAPI definition, recording a Finding for any route whose request/response shape diverges from the contract.
2. THE Audit_System SHALL verify that client-delivered payloads (`app/` Next.js client) do not include fields beyond what the contract authorizes for the client, recording a Finding for any over-exposed field (e.g., other tenants' data, internal-only fields, secrets).
3. WHEN a route requires authentication or a role, THE Audit_System SHALL verify the contract and the handler agree on that requirement, recording a Finding on mismatch.
4. THE Audit_System SHALL verify that error responses do not leak stack traces, internal identifiers, or PII to the client.
5. IF a client-side bundle or response exposes tenant-scoped or internal data not authorized for the client, THEN THE Audit_System SHALL record a Finding with Severity ≥ High (Critical if cross-tenant data is exposed).

- **Pass/Fail:** PASS when API routes conform to the contract, client payloads carry only authorized fields, auth requirements match, and errors do not leak internals; FAIL on contract divergence, over-exposure, auth mismatch, or leaking errors.
- **Evidence to capture:** the route-to-contract conformance table, the client-payload field inventory, the auth-requirement comparison, and the error-response inspection.

### Requirement 26: Spec ↔ Code Traceability & Documentation Drift (Domain 14)

**User Story:** As a documentation owner, I want documentation drift quantified across all Notion specs and repo artifacts, so that I know where the source of truth has decayed.

#### Acceptance Criteria

1. THE Audit_System SHALL produce a coverage report stating, for each Intended_Source in the Intended-Source Index, whether a corresponding Actual_Source exists.
2. THE Audit_System SHALL produce a reverse coverage report stating, for each major Actual_Source area, whether a governing Intended_Source exists.
3. WHEN an Intended_Source has not been updated to reflect a known implemented change, THE Audit_System SHALL record a documentation-drift Finding.
4. THE Audit_System SHALL quantify drift as a percentage of audited capabilities in each Reconciliation_Status (`Aligned`, `Code-Without-Spec`, `Spec-Without-Code`, `Conflicting`, `Partially-Aligned`).
5. IF a prior audit finding (repo `AUDIT_REPORT*.md` or Notion audit) has been marked resolved but the Audit_System finds it unresolved, THEN THE Audit_System SHALL record a Regression Finding (matched via Finding_Fingerprint per Requirement 27).

- **Pass/Fail:** PASS when both coverage reports are complete and drift percentages are computed across the five statuses; FAIL if any Intended-Source or major Actual-Source area is unassessed.
- **Evidence to capture:** forward and reverse coverage reports, drift percentages by status, and the regression list versus prior audits.

### Requirement 27: Finding Fingerprint & Regression Matching

**User Story:** As an auditor, I want a deterministic matching key for findings, so that New/Regression/Confirms-Prior classification is reproducible rather than guessed.

#### Acceptance Criteria

1. THE Audit_System SHALL compute a Finding_Fingerprint for every Finding as a deterministic function of `domain` + normalized `actual_source` + issue signature (and, for Runtime_Checks, the originating check identifier).
2. THE Audit_System SHALL derive each Finding's stable `id` from its Finding_Fingerprint so that the same fingerprint yields the same `id` across runs on the same Pinned_State.
3. WHEN classifying a Finding against prior `AUDIT_REPORT*.md` files and prior Notion audits, THE Audit_System SHALL match by Finding_Fingerprint and classify as `New` (no prior match), `Regression` (prior match previously marked resolved), or `Confirms-Prior` (prior match still open).
4. THE Audit_System SHALL normalize `actual_source` (path and symbol form) before fingerprinting so that cosmetic path differences do not produce false `New` classifications.
5. IF two distinct findings produce the same Finding_Fingerprint, THEN THE Audit_System SHALL record an Open_Question flagging the collision so the issue signature can be disambiguated.
6. BEFORE the prior-findings ledger is frozen/pinned for deterministic matching, THE Audit_System SHALL require a one-time human review and sign-off of the extracted ledger (the fingerprint and classification of each prior finding extracted from `AUDIT_REPORT*.md` files and Notion audits), and SHALL record the ledger version plus the reviewer sign-off; subsequent runs SHALL match against the reviewed, frozen ledger so that a mis-mapped extraction cannot deterministically produce wrong `Regression`/`Confirms-Prior` labels without human review.

- **Pass/Fail:** PASS when classification is fully determined by Finding_Fingerprint, is reproducible across runs, and the frozen prior-findings ledger carries a recorded one-time human-review sign-off with a ledger version; FAIL on any non-deterministic or unexplained classification, or a frozen ledger pinned without a recorded human-review sign-off.
- **Evidence to capture:** the fingerprint definition applied, the per-finding fingerprint values, the match table against prior audit sources, and the frozen-ledger version with its one-time human-review/sign-off record (reviewer + timestamp).

### Requirement 28: Audit System Self-Budget (Run-Time & Compute Cost Cap)

**User Story:** As an audit operator, I want the audit engine itself to have a run-time and cost cap, so that a tool measuring cost and latency does not itself run unbounded.

#### Acceptance Criteria

1. THE Audit_System SHALL enforce a configured maximum total run time and a configured maximum LLM/compute cost for a single audit run.
2. THE Audit_System SHALL size the run-time and cost caps so that a normal run completing the Default_Sample mandated by Requirement 33.2 does NOT trip either cap; IF the configured caps cannot accommodate the Default_Sample, THEN THE Audit_System SHALL record a Finding citing the conflict between the caps and the mandated minimum sample.
3. WHEN the run-time cap or the cost cap is reached, THE Audit_System SHALL stop launching further checks, finalize the work completed so far, and emit a partial report marked as partial.
4. WHEN a partial report is emitted, THE Audit_System SHALL list which domains and checks were completed and which were not run due to the cap.
5. THE Audit_System SHALL record its own measured run time and LLM/compute cost in the run header for every run.
6. IF the Audit_System stops due to a cap, THEN THE Audit_System SHALL flag the Go_No_Go_Recommendation as provisional pending a complete run.

- **Pass/Fail:** PASS when caps are enforced, the caps are sized to complete the Default_Sample without tripping, a cap stop produces a clearly-marked partial report listing completed vs skipped coverage, and the run's own cost/time are recorded; FAIL if the audit runs unbounded, the caps cannot accommodate the Default_Sample, or a truncated run is presented as complete.
- **Evidence to capture:** the configured caps, the Default_Sample sizing reconciliation, the audit's own measured run time and cost, and (if applicable) the partial-report coverage list.

### Requirement 29: Findings Record Schema (Internal Source of Truth)

**User Story:** As an audit consumer, I want every issue captured in a structured internal findings record, so that findings are complete and reproducible before any database transform.

#### Acceptance Criteria

1. THE Audit_System SHALL emit, for every Finding, an internal record in which each of the following fields is present and non-null: `id`, `domain`, `severity`, `workaround_available` (a required boolean), `intended_source` (Notion page or database reference), `actual_source` (repo file:line or function name), `evidence`, `impact`, `fix`, and `effort_estimate`.
2. THE Audit_System SHALL constrain `effort_estimate` to exactly one of the Findings Library options (verified to match the live schema): `Quick Win (1-2 hrs)`, `Small (1-2 days)`, `Medium (3-5 days)`, `Large (1-2 weeks)`, `XL (2+ weeks)`.
3. THE Audit_System SHALL assign each Finding a deterministic `id` derived from its Finding_Fingerprint (Requirement 27), identical across repeated runs whenever `domain`, `actual_source`, and issue signature are unchanged.
4. WHEN a Finding cannot populate one of the required fields in criterion 1, THE Audit_System SHALL set that field to the explicit literal `Unknown` and record an associated Open_Question, rather than omitting the field or leaving it null.
5. THE Audit_System SHALL NOT permit a Critical Finding to carry the literal `Unknown` in its `intended_source`, `actual_source`, or `evidence` fields; IF a Critical Finding would carry `Unknown` in any of those fields, THEN the Audit_System SHALL record a Blocked_Check or downgrade-pending Open_Question and SHALL NOT emit that Critical Finding as complete.
6. THE Audit_System SHALL enforce a maximum `Unknown` rate across the emitted findings set (a stated threshold), and WHEN the `Unknown` rate exceeds that threshold THE Audit_System SHALL record a Finding and SHALL withhold an overall PASS for affected domains until the rate is reduced.
7. IF a Finding's `effort_estimate` is not exactly one of the five enumerated values in criterion 2, THEN THE Audit_System SHALL reject that record, exclude it from the emitted findings set, and produce an error indication identifying the invalid `effort_estimate` value.
8. WHEN an audit run completes, THE Audit_System SHALL produce a field-completeness summary reporting, per Finding, whether all required fields are present and whether any field holds the literal `Unknown`, AND SHALL report the overall `Unknown` rate against the threshold from criterion 6.

- **Pass/Fail:** PASS when every Finding has all required fields present and non-null with a valid effort-estimate and a stable id, no Critical Finding carries `Unknown` in `intended_source`/`actual_source`/`evidence`, and the `Unknown` rate is within threshold; FAIL on any missing/null field, invalid enum, Critical-with-Unknown, or over-threshold `Unknown` rate.
- **Evidence to capture:** the internal findings record set, the field-completeness summary, the computed `Unknown` rate vs threshold, and the list of Critical findings checked for `Unknown` exclusions.

### Requirement 30: Findings-to-Database Field-Mapping Transform & Schema-Extension Recommendation

**User Story:** As an audit consumer, I want an explicit transform from the internal Findings_Schema to the real Notion database properties, so that findings can populate the live databases despite their schema differences without claiming a mapping that does not exist.

#### Acceptance Criteria

1. THE Audit_System SHALL define an explicit field-mapping transform from the internal Findings_Schema to the real properties of the **Findings Library** (`collection://e24e0634-3d62-4063-9d22-963453aaf45f`): `severity` SHALL be transformed into the Findings Library's `Impact Score` (1–10) and `Finding Type` via a documented derivation, `effort_estimate` SHALL map directly to the verified `Effort Estimate` enum, rich `evidence` SHALL map to a text/notes property, and `Evidence Links` SHALL hold only a URL pointer to the full evidence artifact.
2. THE Audit_System SHALL define an explicit field-mapping transform to the **QA / Test Cases** database (`collection://d48ed205-053d-4242-b45b-3d9bfc1008fc`) in which `severity` maps to that database's `Severity` property (Critical/High/Medium/Low), acknowledging this database represents test scenarios rather than findings.
3. THE Audit_System SHALL NOT assert a one-to-one field mapping to both databases; it SHALL document, per target database, which internal fields have a native target property and which are carried via the transform.
4. WHERE a target database lacks a native property for an internal field (e.g., Findings Library has no `Severity`, `domain`, `intended_source`, `actual_source`, or rich-evidence property, and `Evidence Links` is a single URL), THE Audit_System SHALL record a schema-extension recommendation as an Open_Question proposing the missing properties (e.g., add `Severity`, `Domain`, `Intended Source`, `Actual Source`, rich-evidence text), and SHALL state that, being design-only, it cannot apply the change to Notion.
5. THE Audit_System SHALL state that the internal Findings_Schema (Requirement 29) is the source of truth and that database population occurs via the documented transform.
6. THE Audit_System SHALL state, as a deliberate scope boundary, that the engine EMITS a transform-ready payload but DOES NOT write to Notion: auto-population of the Findings Library is OUT OF SCOPE because the engine is non-destructive to Notion (Requirement 1.3) and the Findings Library lacks `Severity`, `Domain`, `Intended Source`, `Actual Source`, and rich-evidence properties. "Populate the Findings Library without rework" therefore means a human FIRST applies the schema extension (the ~5 missing properties recorded as the Open_Question in criterion 4) and THEN imports/pastes the emitted transform payload; the engine SHALL NOT imply or perform automatic population.

- **Pass/Fail:** PASS when transforms to both databases are explicit, accurate to the verified live schemas, the Effort Estimate direct mapping is preserved, missing-property gaps are recorded as schema-extension Open_Questions, and the out-of-scope auto-population boundary (human applies schema extension, then imports the emitted payload) is stated plainly; FAIL on any asserted-but-nonexistent property mapping, undocumented field, or any claim/implication that the engine auto-populates Notion.
- **Evidence to capture:** the per-database field-mapping tables (internal field → target property or transform), the severity→Impact Score/Finding Type derivation, the schema-extension recommendation Open_Questions, and the explicit out-of-scope auto-population scope note (emit-only payload + required human schema-extension precondition).

### Requirement 31: Severity Model

**User Story:** As a triage owner, I want a severity model with explicit triggers, so that severity is assigned consistently and tenant data leakage is always treated as the top severity.

#### Acceptance Criteria

1. THE Audit_System SHALL classify every Finding as exactly one of `Critical`, `High`, `Medium`, or `Low`.
2. WHEN a Finding involves tenant data leakage or cross-tenant data access, THE Audit_System SHALL assign Severity = Critical.
3. THE Audit_System SHALL base the High vs Medium distinction on IMPACT, not on workaround availability: Severity = Critical for findings that block production launch (data loss, security breach, complete flow failure); Severity = High for findings that materially degrade a core capability or carry significant security-or-correctness impact; Severity = Medium for findings with limited or non-core impact; Severity = Low for cosmetic or minor findings. Workaround availability SHALL be recorded as a SEPARATE independent attribute `workaround_available` (boolean) on the Finding (per Requirement 29) and SHALL NOT be the discriminator between High and Medium.
4. THE Audit_System SHALL document the explicit trigger that justifies each Finding's assigned severity, AND SHALL record the independent `workaround_available` attribute for each Finding.
5. IF a Finding matches multiple severity triggers, THEN THE Audit_System SHALL assign the highest matching severity.

- **Pass/Fail:** PASS when every Finding has a single impact-based severity with a documented trigger, an independently recorded `workaround_available` value, and all tenant-leakage findings are Critical; FAIL on any unjustified or under-classified severity, or any Finding whose High-vs-Medium classification was driven by workaround availability rather than impact.
- **Evidence to capture:** the impact-based severity rubric with trigger definitions, the independent `workaround_available` field per Finding, and a per-finding severity-justification table.

### Requirement 32: Per-Domain & Overall Production-Readiness Scoring (Self-Contained Formula)

**User Story:** As an executive, I want each domain scored 0–10 by an explicit reproducible formula plus an overall score, so that scoring is self-contained and comparable to the System Scorecard.

#### Acceptance Criteria

1. THE Audit_System SHALL compute each Domain_Score on a 0–10 scale — applied ONLY to the SUA-Scored Domains (see "Requirement Classification"), not to Engine-Correctness Requirements — using an explicit formula that maps the domain's finding counts weighted by severity to a score, where each unresolved Finding deducts a stated number of points by severity (Critical, High, Medium, Low) from a baseline of 10, floored at 0.
2. THE Audit_System SHALL cap any domain containing an unresolved Critical Finding at a Domain_Score of at most 3 (the explicit Critical-cap value), regardless of the deduction formula, and SHALL state the cap was applied.
3. THE Audit_System SHALL compute the overall Production_Readiness_Score as the stated aggregate of the SUA-Scored Domain_Scores (a security-weighted mean with documented weights). This is a NEW, self-contained methodology and the Audit_System SHALL NOT claim it is consistent with the Notion System Scorecard's methodology; instead, THE Audit_System SHALL present, ALONGSIDE the score, an explicit mapping of each SUA-Scored Domain onto the System Scorecard's twelve areas (`b8163964-c637-495e-86b0-c952d4b955eb`: Product clarity, Data coverage, Diagnosis, Proposal conversion, Workflow reliability, Cost control, Security, Multi-tenancy, B2C, Observability, Legal/scraping, Monetization) so the comparison is honest.
4. THE Audit_System SHALL disclose that the System Scorecard is an unweighted expert-judgment blend with no Critical-cap, and that the engine's severity-weighting and Critical-cap are an intentional divergence (not hidden), stating the divergence explicitly in the output.
5. THE Audit_System SHALL justify each Domain_Score by listing the findings and deductions that produced it, so the score is reproducible from the findings set.
6. THE Audit_System SHALL present a side-by-side comparison table (engine Domain_Score vs the Scorecard's prior expert score per comparable Scorecard area, via the mapping in criterion 3) with columns for area, engine score, prior Scorecard score, evidence, fix, and priority — WITHOUT claiming methodological equivalence.

- **Pass/Fail:** PASS when all SUA-Scored Domains and the overall score are computed by the stated security-weighted formula, Critical-capped domains are flagged at ≤3, the domain→Scorecard-area mapping and the disclosed divergence are presented, and each score is reproducible from its findings; FAIL on any unscored SUA-Scored Domain, an Engine-Correctness Requirement being assigned a Domain_Score, an unstated weight, a claimed-but-false methodological equivalence with the Scorecard, or a score not reproducible from the formula.
- **Evidence to capture:** the scoring formula with severity deductions and weights, the per-domain scoring table with the Critical cap noted, the domain→Scorecard-area mapping, the disclosed-divergence note, and the side-by-side engine-vs-prior-Scorecard comparison table.

### Requirement 33: Synthetic End-to-End Audit Runs Across ≥5 Industries

**User Story:** As a validation owner, I want the audit-to-proposal flow exercised across at least five industries with statistically meaningful repetition, so that runtime behavior is verified on representative inputs in isolation rather than from assumptions.

#### Acceptance Criteria

1. THE Audit_System SHALL execute Synthetic_Audit_Runs across at least five distinct industries (drawing from available vertical playbooks such as restaurant, dentist, law-firm, HVAC, gym, salon, retail, real-estate, veterinary, contractor).
2. THE Audit_System SHALL define a configurable per-industry run count with a stated minimum (the Default_Sample) that is statistically sufficient to report p50 and p95 for latency and Per_Audit_Cost, and SHALL size the Audit System Self-Budget (Requirement 28) so that a normal run completing the Default_Sample does NOT trip the self-budget cap; a normal run completing the Default_Sample SHALL therefore yield a NON-provisional verdict (provisional status is not triggered purely by sample volume).
3. WHERE the Default_Sample is used, THE Audit_System SHALL report p50 and p95 and SHALL omit or explicitly flag p99 as unavailable, because p99 reporting requires the larger Deep_Run sample; the latency GATE at Default_Sample volume SHALL be evaluated on warm-run p50 (not p95), per Requirement 16.3, since at N = 8–10 the p95 approximates the single worst run and is not statistically stable.
4. THE Audit_System SHALL support an opt-in Deep_Run of N ≥ 20 runs per industry that supports p50/p95/p99 percentile reporting per Requirement 16; WHEN a Deep_Run's volume would exceed the self-budget, THE Audit_System MAY mark the Deep_Run verdict provisional per Requirement 28, but the Default_Sample verdict SHALL remain non-provisional.
5. THE Audit_System SHALL execute all Synthetic_Audit_Runs within the Isolated_Synthetic_Execution_Environment (Requirement 3), against seeded synthetic tenants, Stripe TEST mode, and the LLM spend cap, and SHALL tear down created data afterward.
6. THE Audit_System SHALL capture, for each Synthetic_Audit_Run, the input, the modules executed, the diagnosis output, the generated proposal, the proposal quality score, the measured latency, and the measured Per_Audit_Cost.
7. WHEN a Synthetic_Audit_Run fails to produce a proposal, THE Audit_System SHALL record a Finding citing the failure stage.
8. THE Audit_System SHALL verify that findings and outputs are correctly scoped to the synthetic tenant used for each run (supporting Requirement 7), including under the concurrent execution of Requirement 24.
9. IF results vary materially across industries beyond the stated Tolerance_Band (e.g., quality below 8/10 for some verticals, or latency/cost percentiles out of band), THEN THE Audit_System SHALL record per-industry Findings.

- **Pass/Fail:** PASS when ≥5 industries each complete at least the Default_Sample end-to-end within the isolated environment with captured evidence and tenant-scoped outputs and post-run teardown, with the self-budget sized so the Default_Sample completes without tripping; FAIL on fewer than five industries, fewer than the Default_Sample per industry, any uncaptured run artifact, or any production/Notion side effect. A Default_Sample run is non-provisional purely on sample volume; p99 is reported only for a Deep_Run.
- **Evidence to capture:** the per-industry run log (input → modules → diagnosis → proposal → score → latency → cost) across all runs, the Default_Sample size and the self-budget sizing that accommodates it, the isolated-environment confirmation, the tenant-scope verification per run, and the teardown log.

### Requirement 34: Remediation Plan & Go/No-Go Recommendation

**User Story:** As a decision-maker, I want a prioritized remediation plan and a clear production go/no-go recommendation that accounts for both Critical and High findings, so that I know what to fix and whether to launch.

#### Acceptance Criteria

1. THE Audit_System SHALL produce a remediation plan ordering findings by severity then effort, with each item citing its Finding `id`, `fix`, and `effort_estimate`.
2. THE Audit_System SHALL emit a Go_No_Go_Recommendation of exactly one of `Go`, `Conditional-Go`, or `No-Go`.
3. WHEN any unresolved Critical Finding exists, THE Audit_System SHALL set the Go_No_Go_Recommendation to `No-Go`.
4. WHEN there are no unresolved Critical Findings, THE Audit_System SHALL apply BOTH the High-count thresholds AND the workaround clause: IF the count of unresolved High Findings is at least a stated threshold (X ≥ 5), OR any unresolved High Finding is marked `workaround_available = false`, THEN THE Audit_System SHALL set the Go_No_Go_Recommendation to at most `Conditional-Go`; and WHEN unresolved High findings reach a stated higher threshold (Y ≥ 10) THE Audit_System SHALL set it to `No-Go`. Because `workaround_available` is an independent attribute (Requirement 31.3) rather than part of the High definition, the workaround clause bites only on the real subset of Highs explicitly marked `workaround_available = false`, so a clean `Go` is reachable when there are fewer than X Highs and every unresolved High has `workaround_available = true`.
5. WHEN the recommendation is `Conditional-Go`, THE Audit_System SHALL list the specific conditions (findings) that must be resolved before launch.
6. THE Audit_System SHALL summarize total findings by severity and the resulting Production_Readiness_Score alongside the recommendation, and SHALL mark the recommendation provisional if any Blocked_Check (Requirement 2) or cap-induced partial run (Requirement 28) affected coverage.

- **Pass/Fail:** PASS when the plan is prioritized, the recommendation follows the Critical→No-Go rule and the High thresholds (X ≥ 5 ⇒ at most Conditional-Go; Y ≥ 10 ⇒ No-Go) together with the workaround clause applied only to Highs marked `workaround_available = false`, a clean `Go` is reachable when Highs are below X and all carry `workaround_available = true`, conditions are explicit, and provisional status is flagged when coverage is incomplete; FAIL on any Critical paired with Go, a High-threshold breach not reflected in the verdict, or an unresolved High marked `workaround_available = false` not constraining the verdict.
- **Evidence to capture:** the prioritized remediation table, the go/no-go verdict with justification (including High-count thresholds applied), and the severity summary with the readiness score.

### Requirement 35: Open Questions Register

**User Story:** As an auditor, I want ambiguities and spec conflicts recorded rather than guessed, so that uncertain areas are escalated for human resolution.

#### Acceptance Criteria

1. WHEN intended behavior is ambiguous or undocumented, THE Audit_System SHALL record an Open_Question instead of asserting a Finding.
2. WHEN two or more Intended_Sources conflict, THE Audit_System SHALL record an Open_Question citing each conflicting source. THE Audit_System SHALL include, as an explicit registered example, the Per_Audit_Cost target conflict between the $0.06–0.10 hub/requirements canonical band and the Notion System Scorecard's (`b8163964-c637-495e-86b0-c952d4b955eb`) "$0.50/audit" target (per Requirement 16.10), recording it as an Open_Question rather than guessing a canonical constant.
3. THE Audit_System SHALL assign each Open_Question an `id`, a description, the relevant Intended_Source and Actual_Source references, and the decision required.
4. THE Audit_System SHALL list all Open_Questions in a dedicated register separate from Findings and separate from Blocked_Checks (Requirement 2).
5. IF an Open_Question blocks a severity or go/no-go determination, THEN THE Audit_System SHALL flag that downstream determination as provisional pending resolution.

- **Pass/Fail:** PASS when all ambiguities/conflicts are captured as Open_Questions with required fields and provisional determinations are flagged; FAIL on any guessed determination over a known ambiguity.
- **Evidence to capture:** the Open_Questions register (including the schema-extension recommendations from Requirement 30.4), and the list of provisional determinations dependent on open questions.

### Requirement 36: Legal, Scraping & ToS Compliance (Domain 23)

**User Story:** As a legal/compliance owner, I want the scraping strategy, robots.txt and Terms-of-Service posture, and single-source fragility of scraped business data verified, so that scraped-data acquisition is neither a legal exposure nor an undisclosed reliability risk.

#### Acceptance Criteria

1. THE Audit_System SHALL verify that each scraper that acquires external business data respects `robots.txt` directives and applies a rate/politeness control before fetching, citing `lib/modules/gbp.ts`, `lib/modules/reputation.ts`, `lib/modules/website.ts`, `lib/modules/seoDeep.ts`, and `lib/security/urlValidator.ts` as the implementing Actual_Sources and the System Scorecard's Legal/scraping entry plus the Security, Compliance & Risk Register (`5559b7c8-bb06-4a73-8814-a2e4b59420e4`) and Risk Register (`1b1e2e88-f805-460d-a7f0-616e1d548096`) as Intended_Sources, and SHALL record a Finding for any scraper that ignores `robots.txt` or fetches without a politeness/rate control.
2. THE Audit_System SHALL verify, per scraped source (e.g., Google Business Profile, Yelp), whether a documented Terms-of-Service review exists in the Intended_Sources, recording a Finding for any scraped source whose ToS posture is undocumented and an Open_Question requesting the ToS determination.
3. THE Audit_System SHALL assess the fragility of the scraping strategy — including single-source dependency and the absence of breakage/fallback handling — for each scraped data path, recording a Finding where a single scraped source has no fallback or documented breakage handling.
4. WHERE a scraped source's ToS posture is undocumented or contested, THE Audit_System SHALL record an Open_Question citing the source and the legal/compliance determination required, rather than asserting compliance.
5. IF a scraper fetches a disallowed target (per `robots.txt` or `lib/security/urlValidator.ts`) or processes data from a source whose ToS prohibits automated collection, THEN THE Audit_System SHALL record a Finding with Severity ≥ High citing the source and the prohibited fetch.

- **Pass/Fail:** PASS when every scraper respects `robots.txt` with a politeness/rate control, each scraped source has a documented ToS review (or a recorded Open_Question where undocumented), and single-source scraping fragility is identified with breakage handling; FAIL on any `robots.txt`-ignoring or disallowed fetch, any scraped source processed against a prohibiting ToS, or undocumented ToS posture left unrecorded.
- **Evidence to capture:** the per-scraper `robots.txt`/politeness-control trace across `lib/modules/gbp.ts`, `lib/modules/reputation.ts`, `lib/modules/website.ts`, `lib/modules/seoDeep.ts`, and `lib/security/urlValidator.ts`; the per-source ToS-review status table (Google Business Profile, Yelp, etc.); the scraping-fragility/single-source-dependency inventory with breakage-handling status; and the ToS Open_Questions.
