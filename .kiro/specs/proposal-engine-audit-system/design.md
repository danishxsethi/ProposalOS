# Design Document: Proposal Engine OS Audit System

## Overview

This design defines the **mechanism** of a repeatable, automatable audit engine (the `Audit_System`) that reconciles the **INTENDED state** of the Proposal Engine OS platform — captured in the Notion workspace under the _Proposal Engine OS_ hub (`300495b5-1135-8004-985b-c7e0d3f7235e`) — against the **ACTUAL state** — the repository at `/Users/danishsethi/VSCODE/ProposalOS`. It is itself a buildable harness, not a one-off report: a registry of checks, a pinning and capability gate, an isolated synthetic execution environment, a findings schema with deterministic identity, a self-contained scoring formula, and an explicit transform into the live Notion databases.

The audited surface is partitioned per the requirements' **Requirement Classification**: **23 SUA-Scored Domains** (the platform-capability requirements that each receive a 0–10 `Domain_Score`) and **13 Engine-Correctness Requirements** (R1–R4 and R27–R35 — the engine's own mechanics: foundation, capability gate, sandbox, reconciliation, fingerprinting, self-budget, findings schema, DB transform, severity model, scoring engine, synthetic-run procedure, remediation/Go-No-Go, and Open-Questions register). Engine-Correctness Requirements are validated by the engine's **own** property/reproducibility tests and are **never** assigned a `Domain_Score`.

The engine's job, on every run, is to:

1. **Pin state** — a git commit SHA for the repo and a Notion snapshot/timestamp for the intended-sources, so that "unchanged inspected state" and every reproducibility claim are defined relative to the same `Pinned_State`.
2. **Reconcile INTENDED vs ACTUAL** — for each audited capability, compare the governing Notion spec to the implementing repo artifact and emit findings with **dual citations** (≥1 `Intended_Source` Notion page/database + ≥1 `Actual_Source` repo `file:line`/function), or an explicit reason one side is absent. Drift is flagged in both directions (code-without-spec, spec-without-code), plus `Partially-Aligned` and `Conflicting`.
3. **Produce findings** conforming to an internal `Findings_Schema` (the source of truth), each with a stable `id` derived from a `Finding_Fingerprint`, classified as `New` / `Regression` / `Confirms-Prior`.
4. **Score the 23 SUA-Scored Domains** 0–10 via an explicit reproducible formula (baseline 10, severity-weighted deductions with `deduction(Critical)=5`, floor 0, load-bearing Critical-cap ≤3) and compute an overall `Production_Readiness_Score` by a security-weighted mean. This is a **NEW, self-contained methodology** — it is **not** claimed equivalent to the Notion System Scorecard (`b8163964-c637-495e-86b0-c952d4b955eb`), which is an unweighted 12-area expert-judgment rubric with no Critical-cap; the engine presents an explicit domain→Scorecard-area mapping and a side-by-side comparison instead (R32.3, R32.4).
5. **Recommend Go / Conditional-Go / No-Go**, flagged provisional when `Blocked_Check`s or a self-budget cap reduced coverage.

### System Under Audit (SUA)

- **Stack:** Next.js 14 (App Router, `app/` + `app/api/`) + Postgres/Prisma (`prisma/schema.prisma`) + Vertex AI Gemini (`lib/llm/gemini.ts`, `lib/config/models.ts`) + GCP Cloud Run (`Dockerfile`, `cloudbuild*.yaml`, `terraform/`).
- **Core flow:** website/business input → multi-module audit (`lib/audit/runner.ts`, `lib/modules/`) → diagnosis (`lib/diagnosis/`, `lib/graph/diagnosis-graph.ts`) → proposal generation (`lib/graph/proposal-graph.ts`, `lib/proposal/runner.ts`). Target: audit-to-proposal `<30s` at `$0.06–0.10/audit` (the canonical `Per_Audit_Cost` band). **This band is PROVISIONAL** (R16.10): the System Scorecard states a conflicting `$0.50/audit` target (~5–8× apart); per R16.10 the conflict is recorded as an `Open_Question` and per R16.11 R16's cost verdict is presented as provisional, never settled.
- **Orchestration substrate (intended):** Temporal (reliability), LangGraph (diagnosis/compiler), LangSmith (observability/evals), n8n (edge automations), Dify (internal ops).
- **Deployment model:** Multi-tenant SaaS in three modes — Internal Agency, White-Label, Self-Serve B2C — gated by the Feature Flag Matrix (`f808ec30-a105-46e5-96a4-f0004b32c5e5`).

### Design Principles & Non-Destructiveness

- **Non-destructive to production and Notion.** The engine issues no create/update/delete against production data, production infrastructure, or the Notion workspace. All live execution is confined to the `Isolated_Synthetic_Execution_Environment`. Any required Notion schema change is emitted as an `Open_Question` recommendation only.
- **Deterministic where it claims to be.** `Static_Check`s are byte-for-byte reproducible on an unchanged `Pinned_State`; `Runtime_Check`s hold a stable finding identity (same `Finding_Fingerprint` ⇒ same `id`) while measured values may vary within a `Tolerance_Band`.
- **Internal schema is the source of truth.** Notion DB population happens only through the documented transform (Requirement 30); the engine never asserts a Notion property mapping that does not exist in the verified live schemas.
- **Reconciles with `production-hardening`.** That spec already hardened tenant scoping (`createScopedPrisma`), evidence format (`createEvidence`), the `MODULE_REGISTRY` single-source-of-truth, the proposal QA gate, `validateEnv` startup wiring, and proved 12 correctness properties with `fast-check`. This audit engine **verifies those outcomes** rather than re-implementing them, reuses the same property-testing toolchain (`fast-check` + `vitest`), and treats production-hardening's resolved findings as **part of the cached prior-findings ledger** (alongside `AUDIT_REPORT*.md` and the Notion audits) for `Regression` / `Confirms-Prior` classification.

## Architecture

The harness is organized as a **Check Registry** of independently executable checks, an **execution kernel** that pins state and gates on capabilities, an **isolated environment manager** for runtime probes, and an **aggregation layer** that fingerprints, classifies, scores, and emits artifacts. Each of the **23 SUA-Scored Domains** is covered by one or more checks; **Engine-Correctness Requirements** are exercised by the engine's own property/reproducibility tests rather than scored as domains. Every check declares its `kind`, which determines how reproducibility is judged.

### Check Kinds (mechanism grouping)

#### STATIC checks — deterministic, byte-for-byte reproducible on a `Pinned_State`

These depend only on repo/config files and the Notion snapshot, never on live execution.

| Mechanism                                      | What it does                                                                                                                                                                                                                                                                                                                         | Primary Intended_Source                                                                                                             | Primary Actual_Source                                                                                                                                    | Domains              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Schema diff**                                | Field-by-field compare Prisma models vs Data Contract                                                                                                                                                                                                                                                                                | Data Contract Spec (`93bb168e…`), Data Model & Contracts (`0752971b…`)                                                              | `prisma/schema.prisma`, `prisma/migrations/`                                                                                                             | 2 (R6)               |
| **Feature-flag matrix comparison**             | Diff implemented flags vs matrix and 3 mode PRDs                                                                                                                                                                                                                                                                                     | Feature Flag Matrix (`f808ec30…`), PRDs (`257f6eff…`, `fd7b04b3…`, `3e4b9765…`)                                                     | `lib/config/feature-flags.ts`, `lib/config/FeatureFlagService.ts`, `lib/config/branding.ts`                                                              | 12 (R19)             |
| **Secret scan (gitleaks)**                     | Run gitleaks over tree/history; detect plaintext secrets                                                                                                                                                                                                                                                                             | Security, Compliance & Risk Register (`5559b7c8…`)                                                                                  | `.gitleaks.toml`, `.env.example`, tracked sources                                                                                                        | 8 (R14.2), 19        |
| **Module-registry comparison**                 | Diff implemented modules vs registry DB                                                                                                                                                                                                                                                                                              | Audit Modules Registry (`collection://92d9f52f…`)                                                                                   | `lib/audit/modules.ts`, `lib/modules/`                                                                                                                   | 7 (R13)              |
| **Dependency / supply-chain scan**             | `npm audit` vulnerabilities + lockfile pinning + license check + typosquat heuristic                                                                                                                                                                                                                                                 | Risk Register (`1b1e2e88…`)                                                                                                         | `package.json`, `package-lock.json`, `.github/workflows/`                                                                                                | 19 (R22)             |
| **File presence**                              | Assert existence of required Actual_Source artifacts                                                                                                                                                                                                                                                                                 | varies per domain                                                                                                                   | repo paths                                                                                                                                               | all                  |
| **API-contract conformance**                   | Static compare route handler shapes vs Data Contract / OpenAPI                                                                                                                                                                                                                                                                       | Data Contract Spec (`93bb168e…`)                                                                                                    | `app/api/`, `lib/api/`                                                                                                                                   | 22 (R25.1, R25.3)    |
| **Config inspection**                          | Inspect deploy/env/RLS/role config                                                                                                                                                                                                                                                                                                   | Rollout Plan (`4b391dcb…`), SOP Library (`459dd954…`)                                                                               | `Dockerfile`, `cloudbuild*.yaml`, `terraform/`, `lib/config/validateEnv.ts`, RLS docs                                                                    | 13 (R20), 3 (R7.3)   |
| **AST tenant-path enumeration**                | **AST/static scan of EVERY `PrismaClient`/DB-client call site AND every raw-SQL entry point** so that "100%" means "every query-construction location was inspected" (not "every path the reviewer happened to find"); cross-references each enumerated call site to the dual-layer (RLS + adapter `tenantId`) isolation requirement | Security, Compliance & Risk Register (`5559b7c8…`), PRDs                                                                            | `lib/tenant/context.ts`, `lib/auth/wrappedPrismaAdapter.ts`, `middleware.ts`, RLS docs (`PHASE-2.1-RLS-AUDIT.md`, `PHASE-2.6-RLS-COVERAGE-INVENTORY.md`) | 3 (R7.1, R7.2, R7.5) |
| **Scraper robots.txt / politeness inspection** | Static-inspect each scraper for `robots.txt` compliance + rate/politeness control before fetch; flag single-source fragility / missing breakage-fallback                                                                                                                                                                             | System Scorecard Legal/scraping entry (`b8163964…`), Security/Compliance & Risk Register (`5559b7c8…`), Risk Register (`1b1e2e88…`) | `lib/modules/gbp.ts`, `lib/modules/reputation.ts`, `lib/modules/website.ts`, `lib/modules/seoDeep.ts`, `lib/security/urlValidator.ts`                    | 23 (R36.1, R36.3)    |

#### RUNTIME checks — stable finding identity, values within `Tolerance_Band`

These depend on live execution inside the `Isolated_Synthetic_Execution_Environment`. Their findings are keyed on `Finding_Fingerprint` (including the originating check id) so identity is stable even though measured values move.

| Mechanism                                                 | What it verifies                                                                                                                                                                                                                                                                                                          | Tolerance_Band dimension   | Domains                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------ |
| **Synthetic end-to-end audit runs**                       | Full input→diagnosis→proposal across ≥5 industries, N≥20/industry                                                                                                                                                                                                                                                         | n/a (artifact capture)     | 6, 10, 21 (R33)          |
| **Measured latency / cost**                               | p50/p95/p99 latency, `Per_Audit_Cost` distribution, cold-start separated                                                                                                                                                                                                                                                  | latency ±, cost ±          | 10 (R16)                 |
| **Proposal quality scoring**                              | In-repo scorer + independent rubric, both ≥8/10                                                                                                                                                                                                                                                                           | score ±                    | 6 (R12)                  |
| **Prompt-injection payloads**                             | Hostile scraped content cannot steer LLM                                                                                                                                                                                                                                                                                  | n/a (pass/fail behavior)   | 15 (R8)                  |
| **Idempotency replay**                                    | Re-processing same input yields no duplicate side effects                                                                                                                                                                                                                                                                 | n/a                        | 5 (R11)                  |
| **Degraded-mode / module-failure injection**              | Single module failure isolates; audit still completes                                                                                                                                                                                                                                                                     | n/a                        | 5 (R11), 7 (R13)         |
| **Concurrency / load**                                    | Concurrent multi-tenant runs stay scoped; under-load percentiles                                                                                                                                                                                                                                                          | latency ±                  | 21 (R24)                 |
| **Webhook signature / replay tests**                      | Invalid sig rejected; replay processed at most once                                                                                                                                                                                                                                                                       | n/a                        | 17 (R18)                 |
| **Tenant-isolation cross-retrieval**                      | Data created under tenant A is unreachable under tenant B                                                                                                                                                                                                                                                                 | n/a (zero foreign records) | 3 (R7)                   |
| **RTBF deletion test**                                    | Synthetic tenant PII unretrievable after deletion across primary **and each enumerated derived store** — LLM/response caches (`lib/llm/cache.ts`), LangSmith traces, application logs, cross-tenant aggregates (`lib/pipeline/crossTenantIntelligence.ts`) — verified per-store (ties to R7.7/7.8 cross-tenant retention) | n/a                        | 20 (R23.3, R23.4, R23.6) |
| **Per-tenant spend-cap / rate-limit**                     | Excess requests throttled; cap blocks further cost                                                                                                                                                                                                                                                                        | n/a                        | 18 (R21)                 |
| **API response PII over-fetch (runtime)**                 | During synthetic runs, inspect **actual** `app/api/` responses + client-delivered payloads for fields beyond contract authorization (other-tenant data, internal-only fields, secrets) — exercises client-side over-exposure, not just static contract shape                                                              | n/a (pass/fail field set)  | 22 (R25.2, R25.5)        |
| **Scraper robots.txt / politeness enforcement (runtime)** | During synthetic runs, confirm scrapers honor `robots.txt` and apply rate/politeness control; a disallowed fetch is a Finding ≥ High                                                                                                                                                                                      | n/a (pass/fail behavior)   | 23 (R36.1, R36.5)        |

#### LLM-JUDGED checks — Runtime checks keyed on fingerprint, prose may vary

| Mechanism                    | What it verifies                                                         | Intended_Source                                                               | Actual_Source                                            |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Spec↔code reconciliation** | Compare prose Notion specs to code semantics; emit Reconciliation_Status | System Architecture Spec (`013b36ab…`), End-to-End Architecture (`1003be95…`) | `lib/audit/runner.ts`, `lib/orchestrator/`, `lib/graph/` |
| **Prompt fidelity**          | Deployed prompts faithful to spec vs approved baseline (R9.4)            | Prompt & Content Spec (`a2130a5c…`)                                           | `prompts/`, `lib/llm/`                                   |

The LLM produces the _reasoning_; the engine keys the resulting Finding on its `Finding_Fingerprint` so identity is stable across runs even though the LLM's prose varies (R4.7, R27). Critically, the `issue_signature` that enters the fingerprint is **not** the LLM's free prose but a single member of a **closed issue-signature taxonomy** (see "Issue-signature taxonomy" under Findings Schema); the LLM must map its judgment onto exactly one enum member, and the prose reasoning is retained only as evidence. This makes determinism real for LLM-Judged findings.

#### MANUAL review steps — where automation cannot decide

When intended behavior is ambiguous, two Intended_Sources conflict, or a determination needs human judgment, the check emits an `Open_Question` (never a guessed Finding) into the Open Questions register (R35). Schema-extension recommendations (R30.4) and fingerprint collisions (R27.5) also land here.

**Legal/ToS determination (Domain 23, R36.2/R36.4).** Whether a scraped source's Terms of Service permit automated collection is a **legal judgment**, not a computable check. For each scraped source (Google Business Profile, Yelp, etc.) the engine inspects the Intended_Sources for a documented ToS review; where the ToS posture is **undocumented or contested**, it emits an `Open_Question` citing the source and the legal/compliance determination required, rather than asserting compliance. By contrast, `robots.txt` compliance and politeness/rate control are **Static/Runtime** (above), not manual.

### Check Registry structure

Every check is a registered, enumerable record (R1.1, R1.2):

```
check id            stable, unique (e.g. "D03-tenant-dual-layer", "D10-latency-p95")
kind                Static | Runtime | LLM-Judged | Manual
domain              one of the 23 SUA-Scored Domains (mapped to its requirement number),
                    OR null for engine-precondition/safety checks (isolation confirmation R3.6,
                    capability probes R2) which are NOT assigned a Domain_Score
intended_source     Notion page/collection id(s) for "what should be"
actual_source       repo path/symbol target for "what is"
required_capability set of capabilities the check needs to run (R2)
tolerance_band      present only for Runtime checks with measured values (R16.5)
description         human-readable purpose
```

The registry is the re-runnable contract: requesting the registry returns the complete list with ids, kinds, and targets (R1.2). A check whose `required_capability` is unavailable becomes a `Blocked_Check` (R2.3), never a silent pass.

**Registry scope — SUA-domain checks PLUS engine-precondition/safety checks.** The registry contains two classes of check, distinguished by whether they carry a `domain`:

- **SUA-domain checks** — the bulk of the registry, each assigned to one of the **23 SUA-Scored Domains** and feeding that domain's `Domain_Score` (R32).
- **Engine-precondition / safety checks** — a small set of checks that verify engine correctness or safety preconditions rather than a platform capability, and are therefore **NOT assigned a `Domain_Score`**. These include the **P0 sandbox isolation-confirmation check (R3.6)** (a non-production-DB/Stripe-TEST assertion that gates whether any synthetic run may start) and the **capability probes (R2)**. They are registered (so they are enumerable and re-runnable) and carry `domain = null`, marking them as engine-correctness concerns that never contribute to a `Domain_Score`.

The engine's remaining own mechanics (R1–R4, R27–R35) that are not expressed as registered precondition checks are exercised by the property/reproducibility tests in the Testing Strategy. In short: the registry covers the **23 SUA-Scored Domains plus a small set of engine-precondition/safety checks (isolation confirmation, capability probes)**; only the SUA-domain checks are assigned a `Domain_Score`.

## Components and Interfaces

This section defines how each engine component operates: the check execution kernel and pinning, the isolated synthetic environment, the severity model, the scoring rubric, the findings schema and DB transform, and the end-to-end run procedure.

### Check Execution Model & Pinning

### Pinning a run (`Pinned_State`)

At run start the kernel records:

- **Repo pin:** `git rev-parse HEAD` → commit SHA, plus dirty-tree flag (a dirty tree is recorded and degrades Static-Check reproducibility claims to the working copy).
- **Notion pin:** a read-only snapshot of each Intended_Source page/database in the Intended-Source Index, captured with its timestamp. Because Notion does not expose a stable per-page version primitive we can rely on, each page is pinned by a **content hash** — `sha256` of the **normalized** captured page content (whitespace/ordering canonicalized) — recorded alongside the capture timestamp as `notionSnapshotHashes: Record<pageId, contentHash>`. "Unchanged inspected state" for the Notion side means the recomputed content hash matches the pinned hash.

All reproducibility claims (R1.7) and the meaning of "unchanged inspected state" are defined relative to this `Pinned_State`. Two consecutive runs on the same `Pinned_State` must yield byte-identical Static-Check finding ids/severities and fingerprint-stable Runtime-Check identities.

### Capability precondition gate (R2)

Before executing checks, the kernel probes each **Required Access & Capability** and writes the result into the `RunHeader`:

| Capability                                                  | Probe                                                                                                     | Checks gated when missing                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Notion read access                                          | Read-ping each Intended_Source page/collection (read-only)                                                | **all reconciliation checks (R4) AND all static-intended-source checks** — pinning itself depends on Notion (R2.4)        |
| Non-prod DB creds                                           | Connect to synthetic Postgres; confirm non-prod target                                                    | all Runtime DB/tenant/RTBF/concurrency checks                                                                             |
| GCP / Vertex AI                                             | Auth + minimal model ping under spend cap                                                                 | synthetic runs, latency/cost, prompt-injection, quality                                                                   |
| LangSmith                                                   | API reachability                                                                                          | eval-coverage checks (R10.3, R15.1)                                                                                       |
| Repo test-suite execution                                   | `vitest` invocable                                                                                        | test-pass-rate, coverage, P0-path checks (R15)                                                                            |
| Secret-scan tooling                                         | `gitleaks` binary present                                                                                 | secret scan (R14.2)                                                                                                       |
| **Cost instrumentation** (`costInstrumentation`, R2.1/R2.5) | Confirm `lib/costs/costTracker.ts` + `lib/config/costBudget.ts` actually emit a **per-audit cost signal** | **Domain 10 cost checks (R16)** — when unavailable/unwired they become `Blocked_Check`s, never null/zero `Per_Audit_Cost` |

If a capability is unavailable, every dependent check is marked `Blocked_Check` stating the missing capability (R2.3), kept in a list **distinct from Open_Questions and Findings** (R2.4). In particular:

- **If Notion read access is unavailable, all reconciliation checks (R4) and every static-intended-source check are Blocked** — the engine does not silently proceed as if intended-sources were confirmed (R2.4), because the `Pinned_State` Notion snapshot cannot be captured.
- **If `costInstrumentation` is unavailable or unwired** (costTracker/costBudget do not emit a per-audit cost signal), the **Domain 10 cost checks (R16)** are `Blocked_Check`s and the engine **does not report null or zero as a measured `Per_Audit_Cost`** (R2.5, R16.5); latency checks may still run since they do not depend on cost instrumentation.

Any domain with Blocked_Checks has its `Domain_Score` and the `Go_No_Go_Recommendation` flagged **provisional** (R2.5/R2.7).

### Audit System self-budget (R28)

The engine enforces a configured **maximum total run time** and **maximum LLM/compute cost** for a single run. When either cap is reached, the kernel:

1. stops launching further checks,
2. finalizes work completed so far,
3. emits a **partial report** clearly marked partial, listing completed vs not-run domains/checks (R28.3),
4. records its own measured run time and LLM/compute cost in the `RunHeader` (R28.4), and
5. flags the `Go_No_Go_Recommendation` provisional (R28.5).

This mirrors the SUA's own `Per_Audit_Cost` discipline (`lib/costs/costTracker.ts`, `lib/config/costBudget.ts`) but is the _auditor's_ budget, kept separate from any SUA cost measurement.

**Sized to complete the Default_Sample (R28.2).** The run-time and cost caps are configured so that a normal run completing the **Default_Sample** (8–10 runs/industry × ≥5 industries, per R33.2) does **not** trip either cap — a normal run is therefore **not** provisional purely on sample volume. If the configured caps cannot accommodate the Default_Sample, the engine records a **Finding** citing the conflict between the caps and the mandated minimum sample. Only an opt-in **Deep_Run** (N≥20) may legitimately exceed the budget and be marked provisional under R28.

### Isolated Synthetic Execution Environment

The sandbox (`Isolated_Synthetic_Execution_Environment`, R3, R33) is the only place live SUA code executes. It is forbidden from reading or writing production data, production infrastructure, or Notion.

### Sandbox composition

- **Non-production Postgres** — a dedicated synthetic database, verified non-prod by configuration inspection before any run begins (R3.6). If isolation cannot be confirmed, a `Blocked_Check` is recorded and no run starts.
- **Persistent seeded fixtures vs per-run artifacts (isolation discipline).** The sandbox distinguishes two data classes, and teardown treats them differently:
  - **Persistent seeded fixtures** — the deterministically-seeded tenant baselines a check needs as a precondition (e.g. the `≥2` tenants a cross-tenant retrieval reads). These are **never** removed by per-run teardown; if a destructive check consumed them, they are **re-seeded deterministically before the next dependent check**.
  - **Per-run artifacts** — rows a Synthetic_Audit_Run _creates while executing_ (Audit, Proposal, Finding, billing artifacts). **Only these** are torn down after a run.
- **Per-test tenant namespaces (concurrency-safe isolation).** Because several sandbox-dependent runtime checks run concurrently and some are **destructive** — cross-tenant retrieval (R7.4), concurrency/load (R24), **RTBF deletion (R23, which DELETES tenant data mid-run)**, and API PII over-fetch (R25) — they MUST NOT share one global mutable tenant pair. Each sandbox-dependent runtime check is therefore given its **own freshly-seeded, uniquely-namespaced tenant set** (`tenantNamespace = check_id + runId`), each containing **≥2 tenants** so the cross-tenant/concurrency guarantee holds **per check, not globally**. A destructive check (RTBF) deletes only within its own namespace and cannot wipe a tenant another check depends on. The previous design of "2 synthetic tenants seeded once" is replaced by this per-test namespacing.
  - **Isolation strategy — per-test namespaces preferred, serialization as fallback.** Sandbox-dependent runtime checks are **either** given isolated per-test tenant namespaces **or** serialized. The design **prefers per-test namespaces** (they allow safe concurrency and preserve the R24 load signal); for any check that genuinely cannot be namespaced (e.g. a check that must observe global shared state), the engine **falls back to serializing** that check so it never overlaps a destructive or seed-mutating check.
  - Tenants are seeded via `lib/tenant/TenantProvisioningService.ts` against the synthetic DB, per namespace.
- **Stripe TEST mode** — billing artifacts use test keys only (`lib/stripe/pricingService.ts`, `lib/billing/`). Any attempt to issue a real (non-TEST) charge aborts the run, leaves external systems unchanged, and records a **Critical** Finding (R3.4).
- **Enforced (shared) LLM spend cap** — when the synthetic-execution spend cap is reached, no further synthetic runs launch and the cap event is recorded (R3.5). The spend cap is a **single shared budget** across all sandbox-dependent runtime checks, so the synthetic-run volume (R33) is **budgeted** — the Default_Sample (8–10/industry × ≥5 industries) is sized so it does **not** consume the entire cap and starve the other runtime checks (cross-tenant, RTBF, concurrency, injection, webhook, PII over-fetch) of their share. An opt-in Deep_Run (N≥20) may legitimately approach the cap and is marked provisional under R28.
- **Pre-run isolation confirmation** — config inspection asserts DB target and Stripe endpoints are non-production (R3.6). This is the registered **engine-precondition check** (domain = null), not a SUA-domain check.
- **Guaranteed teardown (finally-block, per-run artifacts only)** — teardown of the **per-run artifacts** created by a run (Audit, Proposal, Finding, billing artifacts) runs in a **`finally` block of the sandbox lifecycle**, so it executes on **every** exit path: normal success, Stripe-abort (R3.4), isolation-unconfirmed exit (R3.6), and spend-cap-hit (R3.5). Teardown removes **only per-run artifacts within the run's own tenant namespace** — it **never** wipes the persistent seeded fixtures that subsequent dependent checks need, and where a destructive check consumed its seed the engine **re-seeds deterministically before the next dependent check** rather than relying on shared survivors. Rows created before an abort are never left behind; the teardown log is captured as evidence (R3.3). (See the pipeline diagram: the `T` teardown node hangs off all exit paths and is scoped per-namespace, not a global "delete all rows created by a run".)

### Orchestration substrate provisioning

The intended orchestration substrate is **Temporal** (reliability), **LangGraph** (diagnosis/proposal compiler), **LangSmith** (observability/evals), **n8n** (edge automations), and **Dify** (internal ops). Several checks depend on this substrate actually executing — R11 reliability (idempotency/retry/degraded-mode) leans on Temporal, and the R33/R16 synthetic perf/quality runs require the graphs to execute. The sandbox provisions each component explicitly so dependent checks are either **runnable** or **clearly Blocked**, never silently Blocked:

| Substrate     | Sandbox treatment                                                                                                                                                                                                         | Consequence for dependent checks                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LangGraph** | **Stood up in-process** — the diagnosis/proposal graphs run in the synthetic process directly (no external service).                                                                                                      | Graph-node conformance (R11.4) and synthetic runs (R33) execute normally.                                                                                                                                                                                                                                            |
| **Temporal**  | **Stood up in dev mode** (local dev server) when available; **otherwise a documented semantics-preserving stub** (`Stub_Substrate`) that re-implements the idempotency/retry/timeout/degraded-mode guarantees under test. | R11.1/R11.2/R11.5 run against dev Temporal or the `Stub_Substrate`; if neither is available, the reliability checks are `Blocked_Check`s naming the missing substrate. **When backed by the `Stub_Substrate`, the resulting Domain 5 findings AND the Domain 5 `Domain_Score` are PROVISIONAL** (R11.6) — see below. |
| **LangSmith** | **Stubbed** — eval ingestion mocked; not stood up in the sandbox.                                                                                                                                                         | Eval-coverage checks (R10.3, R15.1) run against the stub for presence/shape; if the real service is required and unavailable, they become `Blocked_Check`s (ties to the LangSmith capability gate).                                                                                                                  |
| **n8n**       | **Stubbed/out-of-scope** — edge automations not executed in the sandbox.                                                                                                                                                  | n8n boundary checks (R17.1) are Static where possible; runtime-integration aspects become `Blocked_Check`s if the real service is unavailable.                                                                                                                                                                       |
| **Dify**      | **Stubbed/out-of-scope** — internal-ops sandbox not executed.                                                                                                                                                             | Dify boundary checks (R17.2) are Static where possible; runtime aspects become `Blocked_Check`s if unavailable.                                                                                                                                                                                                      |

This makes the substrate story explicit: LangGraph runs in-process; Temporal is dev-mode-or-documented-stub (preserving the guarantees R11 verifies); LangSmith/n8n/Dify are stubbed with their dependent eval/integration checks Blocked when the real service is unavailable. No check is silently Blocked without a named missing substrate.

**Stub-backed Domain 5 reliability findings are PROVISIONAL (R11.6).** When Domain 5 reliability checks (idempotency/retry/timeout/degraded-mode) execute against the **`Stub_Substrate`** rather than a real dev-mode Temporal, validating a stub's _re-implementation_ of the Temporal guarantees proves little about production behavior. Therefore:

- each reliability **Finding records which substrate backed it** via a `substrateBacking: "real-dev" | "stub"` field (added to the `Finding` data model);
- any Domain 5 Finding with `substrateBacking = "stub"` is flagged **PROVISIONAL**, and
- the **Domain 5 `Domain_Score`** is flagged **PROVISIONAL** whenever any contributing reliability finding was stub-backed (the `DomainScore.provisional` flag is set, with the reason recorded), which **propagates** into the `RunHeader.provisional` flag and the `Go_No_Go_Recommendation` provisional status (consistent with R2.7/R28 provisional propagation).

A reliability finding backed by **real dev-mode Temporal** is non-provisional on this basis.

### Synthetic-run orchestration (R33, R16)

- **Industries:** at least **5 distinct verticals** drawn from available playbooks (restaurant, dentist, law-firm, HVAC, gym, salon, retail, real-estate, veterinary, contractor).
- **Sample sizing — Default_Sample vs Deep_Run (R33.2–R33.4):**
  - **Default_Sample** — the mandated minimum per industry, **N = 8–10 runs/industry**, statistically sufficient to report **p50 and p95** for latency and `Per_Audit_Cost`. The Audit System self-budget (R28) is sized so a normal run completing the Default_Sample does **not** trip either cap; consequently a Default_Sample run yields a **non-provisional** verdict — provisional status is **never** triggered purely by sample volume. p99 is **omitted/flagged unavailable** for a Default_Sample (it requires the larger sample).
  - **Deep_Run (opt-in)** — **N ≥ 20 runs/industry**, supporting **p50/p95/p99** per R16. If a Deep_Run's volume would exceed the self-budget, only the **Deep_Run** verdict may be marked provisional (R28); the Default_Sample verdict remains non-provisional.
- **Volume-gated latency metric (R16.3, R33.3).** The 30-second latency GATE is evaluated on a metric chosen by sample volume:
  - At **Default_Sample (N = 8–10)** the gate is evaluated on **warm-run p50** only. p95/p99 are **reported informationally but NOT gated**, because at N = 8–10 the p95 approximates the single worst run and flips run-to-run (it is not statistically stable).
  - At **Deep_Run (N ≥ 20)** the gate is evaluated on **warm-run p95**, where p95 is statistically meaningful.
  - **Cold-start runs remain a separate distribution at every volume** and are never folded into the gated warm metric.
  - A Finding is recorded when the **gated metric for the run's volume** (p50 at Default_Sample, p95 at Deep_Run) exceeds 30s, citing the p50/p95/p99 latencies, the gated metric used, and the contributing stages (R16.4).
- **Capture per run:** input, modules executed, diagnosis output, generated proposal, quality score, measured latency, measured `Per_Audit_Cost`, and the synthetic tenant id used (R33.3, R33.5).
- **Cold-start separation:** the first run(s) after a cold container start are tagged `coldStart=true` and reported as a **separate distribution**; they are **never averaged** into the warm-run p50/p95/p99 (R16.9).
- **Percentile computation:** for each industry and overall, compute p50/p95/p99 of latency and `Per_Audit_Cost` from warm runs (`computePercentiles(sorted, [50,95,99])` using nearest-rank), with cold-start figures reported alongside.

### Cost decomposition (Glossary consistency)

- **`Per_Audit_Cost` (COGS)** = `LLM_Cost_Subset` (Gemini tokens) + per-audit infra/compute + per-audit third-party/API. Canonical band `$0.06–0.10`, owned exclusively by R16. **The band is PROVISIONAL (R16.10/R16.11):** the Notion System Scorecard (`b8163964…`) states a conflicting `$0.50/audit` target (~5–8× apart); per R16.10 this is recorded as an `Open_Question` (conflicting Intended_Sources are not silently reconciled), and per R16.11 R16's cost verdict (R16.6) is marked **provisional** in the run output — not presented as definitive — while the conflict is open. A measured value **below `$0.06`** is an informational **Low** Finding noting cost is below the expected band, which **may indicate efficiency, under-provisioning, or a measurement gap** (R16.6) — it is not a failure and not assumed to be under-provisioning.
- **`LLM_Cost_Subset`** is the Gemini-token portion only; R10.4 evaluates it against its LLM allocation for fidelity/grounding purposes and does **not** redefine the total band.

### Tolerance_Band default values (R16.8)

`Tolerance_Band` governs **run-to-run finding-identity stability**, not the pass line. Concrete configurable defaults:

| Dimension         | Default band                                                             | Applied to                                                     | "Within band" evaluation      |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------- | ------------------- | ------------------------------ |
| **Latency**       | `±15%` of the pinned baseline (with a floor of `±250 ms`) on p50 and p95 | measured audit-to-proposal latency                             | a value is "within band" if ` | measured − baseline | ≤ max(15% × baseline, 250 ms)` |
| **Cost**          | `±10%` of baseline (with a floor of `±$0.01`) on `Per_Audit_Cost`        | measured `Per_Audit_Cost`                                      | `                             | measured − baseline | ≤ max(10% × baseline, $0.01)`  |
| **Quality score** | `±0.5` points (0–10 scale)                                               | proposal quality score (in-repo scorer and independent rubric) | `                             | measured − baseline | ≤ 0.5`                         |

These are **configurable defaults**. A measured value moving only **within** its band never changes a finding's identity (R1.7); only a value **outside** the band changes pass/fail.

**Gate-vs-tolerance for proposal quality (resolving the oddity).** The `≥8/10` proposal-quality bar is a **HARD gate on the measured score** — a `7.9` **fails** the gate even though `7.9` is within the `±0.5` band of `8.0`. The `Tolerance_Band` governs only **run-to-run finding-identity stability** (whether a re-measured score reopens/duplicates a finding), and **does not move the `8.0` threshold**. Band affects identity, not the pass line.

### Independent proposal-quality rubric (R12.3)

R12.3 requires scoring every synthetic proposal with **both** the in-repo scorer (`lib/qa/proposal-quality-scorer.ts`, `lib/proposal/ProposalQAService.ts`) **and** an independent rubric that **does not reuse the in-repo scorer's code** — the cross-check that keeps the scorer itself honest (R12.4). The independent rubric is defined here concretely as a weighted 0–10 over named dimensions:

| Dimension                     | What it measures                                                              | Weight |
| ----------------------------- | ----------------------------------------------------------------------------- | ------ |
| Structural completeness       | every required section of the Proposal Template Spec (`a981a3ab…`) is present | 0.25   |
| Grounding / claim support     | every claim traces to a captured audit finding (no ungrounded claims, R12.6)  | 0.25   |
| Specificity / personalization | content is specific to the business input, not boilerplate                    | 0.15   |
| Pricing coherence             | pricing matches the Proposal Packages & Pricing DB (`3d1388f0…`) tiering      | 0.20   |
| CTA / conversion clarity      | a clear, single next-step call-to-action is present                           | 0.15   |

`independentScore = Σ(dimension_score × weight)`, on 0–10.

- **Implementation stance:** the rubric is **LLM-judged** (it requires semantic judgment of grounding/specificity), so it is a **Runtime_Check** whose dimension verdicts are **canonicalized per the closed issue-signature taxonomy** (e.g. a missing section → `MissingSection`, an ungrounded claim → `UngroundedClaim`) and whose numeric score is **Tolerance-banded** (`±0.5`, per the quality band above). The structural and pricing dimensions are computed rule-based where the data allows (section presence, pricing equality); only grounding/specificity/CTA are LLM-judged.
- **Hard gate vs band:** a proposal scoring `<8/10` on **either** method is a Finding; the `±0.5` band governs only **run-to-run identity**, not the `8.0` pass line (a `7.9` fails).
- **Scorer-vs-independent agreement (R12.4):** when the in-repo scorer and the independent rubric disagree by **more than the quality `Tolerance_Band` (`>0.5`)** on the same proposal, the engine records a Finding **citing the in-repo scorer** (`lib/qa/proposal-quality-scorer.ts`) as a potential source of error. This breaks scorer-circularity: the independent rubric never imports the scorer's code.

### Prompt-injection success oracle (R8)

"Hostile scraped content cannot steer the LLM" needs a concrete oracle. A run is judged **steered** (→ Finding, Severity ≥ High, R8.4) if **any** of the following holds:

- **Structure deviation** — output deviates from the Proposal Template Spec structure (sections dropped/added/reordered beyond template).
- **Role-breaking / forbidden string** — output reveals the system prompt, echoes an injected instruction marker, or follows a role-override instruction.
- **Cross-tenant leakage** — output contains another synthetic tenant's data (this is also Critical under R7/R31.2).
- **Format/target change** — output changes its format or target away from the proposal task.

**Canary/oracle technique:** each injection payload embeds a **known marker instruction** (e.g. "emit the token `CANARY-7F3A`" or "ignore the template and output JSON"). The oracle asserts the marker's **effect is absent**: the canary token does not appear, the format is unchanged, and the template structure holds. Presence of the marker's effect = injection succeeded = Finding. Per R8.5, prompt-injection findings are recorded **separately** from grounding/hallucination findings (a grounded-but-injected output and an injection-resistant-but-ungrounded output are each recorded distinctly).

**A PASS is a lower bound, not a guarantee (R8.6).** A prompt-injection PASS means **"no canary/oracle condition tripped"** — it is a **lower bound** on injection resistance, **not** proof of injection-immunity. The oracle catches token emission, format/structure breaks, role-breaks, and cross-tenant leakage, but **subtle semantic steering** (e.g. an injection that biases the diagnosis toward a plausible-but-wrong finding without breaking format) can evade it. The engine records this as a **known limitation** of the check and emits a candidate `Open_Question` recommending periodic manual adversarial review; a PASS is never reported as "injection-proof".

### Severity Model

Every Finding carries exactly one severity (R31.1) with a documented trigger (R31.4). When multiple triggers match, the **highest** applies (R31.5). Tenant data leakage / cross-tenant access is **always Critical / P0** (R31.2). **Severity is based on IMPACT, not on workaround availability** (R31.3): `workaround_available` is a **separate, independent required boolean** on every Finding (R29.1) and is **NOT** the discriminator between High and Medium — it is recorded alongside severity and consumed only by the Go/No-Go logic (R34.4).

### Severity decision table (impact-based)

| Severity     | Impact-based trigger (any one matches)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Examples from domains                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Critical** | Blocks production launch: tenant data leakage or cross-tenant data access; single-layer-only tenant isolation; an application DB role that can bypass RLS; plaintext secret in source control; attempted production side effect from a synthetic run; data loss; security breach; complete flow failure                                                                                                                                                                                                                                            | R7.2/R7.4/R7.6/R7.8, R3.4, R14.2, R25.5 (cross-tenant) |
| **High**     | **Materially degrades a core capability OR carries significant security-or-correctness impact** (impact-based, regardless of whether a workaround exists): successful prompt injection altering behavior; webhook acting before signature verification; ungated/unbounded prompt promotion; unbounded cost path / missing per-tenant cap; concurrency corruption/deadlock/lost update; API exposes tenant data without authz (no cross-tenant); scraper fetches a disallowed target or processes a source whose ToS prohibits automated collection | R8.4, R18.5, R9.5, R21.5, R24.5, R14.7, R25.5, R36.5   |
| **Medium**   | **Limited or non-core impact** (impact-based): spec/code drift not on a P0 path; missing eval baseline; non-Critical contract divergence; scraper missing `robots.txt`/politeness control or single-source fragility without breakage handling                                                                                                                                                                                                                                                                                                     | R6, R10, R13, R19, R26, R36.1, R36.3                   |
| **Low**      | Cosmetic or minor; informational `Per_Audit_Cost` below `$0.06` (may indicate efficiency, under-provisioning, **or** a measurement gap — not assumed to be under-provisioning); documentation polish                                                                                                                                                                                                                                                                                                                                               | R16.6, R26.3                                           |

**`workaround_available` is orthogonal to severity.** The High/Medium split above is decided purely by impact (core-capability/significant-impact ⇒ High; limited/non-core ⇒ Medium). Whether a documented workaround exists is recorded **independently** in the `workaround_available` boolean field on each Finding (R29.1, R31.3) and never moves a Finding between High and Medium. It is read later, only by the Go/No-Go rule (R34.4), where an unresolved High with `workaround_available = false` constrains the verdict.

### Scoring Rubric

`Domain_Score` and `Production_Readiness_Score` are computed by a **self-contained, reproducible formula (R32)** that applies **ONLY to the 23 SUA-Scored Domains** — never to the Engine-Correctness Requirements (R1–R4, R27–R35), which are validated by the engine's own tests. This is a **NEW methodology**: it is **not** claimed to be consistent with, or equivalent to, the Notion System Scorecard (`b8163964-c637-495e-86b0-c952d4b955eb`). The Scorecard is an **unweighted, 12-area expert-judgment rubric with no Critical-cap** (overall ~6.3/10); the engine's method is a **security-weighted deduction formula with a load-bearing Critical-cap**. The two are compared honestly via the domain→Scorecard-area mapping and side-by-side table below, with the divergence explicitly disclosed (R32.3, R32.4).

### Per-domain formula (0–10)

```
baseline        = 10
deduction(sev)  = Critical:5, High:4, Medium:2, Low:0.5   (per unresolved Finding)
raw             = baseline - Σ deduction(severity of each unresolved Finding in domain)
floored         = max(0, raw)
DomainScore     = if (domain has ≥1 unresolved Critical) then min(floored, 3)   // Critical-cap
                  else floored
```

- **Floor:** scores never go below 0 (R32.1).
- **Critical-cap (load-bearing):** any domain with an unresolved Critical Finding is capped at **≤3**, and the cap application is stated explicitly (R32.2). `deduction(Critical)=5` is deliberately chosen so the cap actually **binds**: a single Critical alone gives `raw = 10 − 5 = 5`, and the cap forces `min(5, 3) = 3` — i.e. "a Critical present ⇒ at most 3". (With the old `deduction(Critical)=10`, a single Critical drove `raw ≤ 0`, floored to 0, so `min(0,3)` never bound and the cap was dead logic. The corrected arithmetic makes the cap demonstrably do the work.)
- **Reproducibility:** the score is justified by listing the findings and deductions that produced it (R32.5), so it is recomputable from the findings set.

### Overall `Production_Readiness_Score`

A **security-weighted mean** of the 23 SUA-Scored `Domain_Score`s with documented weights. Security/isolation/privacy-critical domains carry higher weight; this weighting is the engine's own choice (an **intentional divergence** from the Scorecard's unweighted blend), disclosed as such:

```
weight(domain):   // weights apply to SUA-Scored Domains only
  Domain 3  (R7  Multi-Tenancy/Isolation, P0)        = 3.0
  Domain 8  (R14 Security/Privacy/Compliance)        = 2.0
  Domain 4  (R10 AI/LLM Fidelity & Grounding)        = 2.0
  Domain 5  (R11 Orchestration Reliability)          = 2.0
  Domain 6  (R12 Proposal Quality)                   = 2.0
  Domain 15 (R8  Prompt-Injection Defense)           = 2.0   // security risk
  Domain 20 (R23 Data Lifecycle / RTBF)              = 2.0   // privacy risk
  Domain 18 (R21 Rate-Limit / Economic-Abuse)        = 1.5   // security/abuse risk
  Domain 17 (R18 Webhook Authenticity)               = 1.5   // security risk
  Domain 23 (R36 Legal / Scraping / ToS)             = 1.5   // legal exposure
  Domain 10 (R16 Performance & Economics)            = 1.5
  all other SUA-Scored Domains                       = 1.0 each

ProductionReadinessScore = Σ(DomainScore_d × weight_d) / Σ(weight_d)
```

### Domain → System-Scorecard-area mapping (R32.3)

Each of the 23 SUA-Scored Domains maps to one of the Scorecard's **12 areas** (Product clarity, Data coverage, Diagnosis, Proposal conversion, Workflow reliability, Cost control, Security, Multi-tenancy, B2C, Observability, Legal/scraping, Monetization). This mapping is the **honest comparison basis** — not a claim of methodological equivalence.

| SUA Domain (Req)                          | Scorecard area       |
| ----------------------------------------- | -------------------- |
| D1 Architecture & Data Flow (R5)          | Product clarity      |
| D2 Data Contracts (R6)                    | Data coverage        |
| D3 Multi-Tenancy/Isolation (R7)           | Multi-tenancy        |
| D4 AI/LLM Fidelity & Grounding (R10)      | Diagnosis            |
| D5 Orchestration Reliability (R11)        | Workflow reliability |
| D6 Proposal Quality & Conversion (R12)    | Proposal conversion  |
| D7 Audit Modules Registry (R13)           | Data coverage        |
| D8 Security/Privacy/Compliance (R14)      | Security             |
| D9 Observability & QA (R15)               | Observability        |
| D10 Performance & Economics (R16)         | Cost control         |
| D11 Integrations & Edge Automations (R17) | Workflow reliability |
| D12 Mode-Specific Correctness (R19)       | B2C                  |
| D13 Deployment & Ops Readiness (R20)      | Workflow reliability |
| D14 Spec↔Code Traceability (R26)          | Product clarity      |
| D15 Prompt-Injection Defense (R8)         | Security             |
| D16 Learning-Loop Safety (R9)             | Diagnosis            |
| D17 Webhook Authenticity (R18)            | Security             |
| D18 Rate-Limit/Economic-Abuse (R21)       | Cost control         |
| D19 Dependency/Supply-Chain (R22)         | Security             |
| D20 Data Lifecycle/RTBF (R23)             | Multi-tenancy        |
| D21 Concurrency & Load (R24)              | Workflow reliability |
| D22 Frontend & API Contract (R25)         | Product clarity      |
| D23 Legal/Scraping/ToS (R36)              | Legal/scraping       |

(Scorecard areas **Monetization** and **B2C** are reference areas in the comparison; **Monetization** has no direct 1:1 SUA-Scored Domain and is reported as a comparison-only row.)

### Side-by-side comparison & disclosed divergence (R32.4, R32.6)

Output presents, per comparable Scorecard area, a table with columns **area, engine Domain_Score, prior Scorecard expert score, evidence, fix, priority** — **without claiming methodological equivalence**. The output **explicitly discloses**:

1. the Scorecard is an **unweighted** 12-area expert-judgment blend (overall ~6.3/10) with **no Critical-cap**;
2. the engine applies **severity weighting** and a **Critical-cap ≤3** — both **intentional, disclosed divergences**, not hidden;
3. where multiple SUA Domains map to one Scorecard area, the comparison row notes the aggregation so the numbers are read honestly.

### Worked example (recomputed with `deduction(Critical)=5`)

Domain 3 (Multi-Tenancy), weight 3.0, has one unresolved Critical (single-layer tenant path) and one Medium:

```
raw      = 10 - (5 + 2) = 3  → floored = 3  → Critical-cap min(3,3)=3
DomainScore(D3) = 3   (Critical-cap applied and binding)
```

Domain 6 (Proposal Quality), weight 2.0, has two High and one Low:

```
raw = 10 - (4 + 4 + 0.5) = 1.5  → no Critical → DomainScore(D6) = 1.5
```

Domain 2 (Data Contracts), weight 1.0, has one Medium:

```
raw = 10 - 2 = 8  → DomainScore(D2) = 8
```

Overall over just these three (illustrative):

```
(3×3.0 + 1.5×2.0 + 8×1.0) / (3.0 + 2.0 + 1.0) = (9 + 3 + 8) / 6 = 20/6 ≈ 3.33
```

Because Domain 3 carries an unresolved Critical, the `Go_No_Go_Recommendation` is forced to **No-Go** (R34.3) independent of the numeric mean — and the Critical-cap keeps D3 at a non-zero but bounded `3`, demonstrating the cap is load-bearing (the domain can score up to 3 with a Critical present, not collapse to 0).

### Go / No-Go decision logic (R34)

The verdict is exactly one of `Go`, `Conditional-Go`, or `No-Go`, computed from the **unresolved** findings set after scoring:

1. **Any unresolved `Critical` ⇒ `No-Go`** (R34.3), independent of the numeric scores.
2. **When there are no unresolved Criticals**, apply BOTH the High-count thresholds AND the workaround clause:
   - unresolved `High` count `≥ Y` (Y = **10**) ⇒ **`No-Go`** (R34.4);
   - unresolved `High` count `≥ X` (X = **5**) ⇒ at most **`Conditional-Go`** (R34.4);
   - **workaround clause** — any unresolved `High` with `workaround_available = false` ⇒ at most **`Conditional-Go`** (R34.4).
3. Otherwise ⇒ **`Go`**.

**The workaround clause bites only on a real subset of Highs.** Because `workaround_available` is an **independent impact-orthogonal boolean** (R31.3) and NOT part of the High definition, the clause constrains the verdict only for the Highs explicitly marked `workaround_available = false`. Consequently a **clean `Go` is reachable**: when there are fewer than X (5) unresolved Highs and **every** unresolved High has `workaround_available = true`, neither the count thresholds nor the workaround clause fire, and the verdict is `Go`. A `Conditional-Go` lists the specific findings that must be resolved before launch (R34.5).

**Provisional flagging.** The verdict is marked **provisional** when any `Blocked_Check` (R2.7), self-budget cap-induced partial run (R28), or **stub-backed Domain 5 finding (R11.6)** reduced or qualified coverage — propagated via `RunHeader.provisional` (R34.6).

### Findings Schema + Database Transform

### Internal `Findings_Schema` (source of truth, R29)

Every Finding is an internal record with all fields present and non-null:

```
id              stable, derived from Finding_Fingerprint
domain          one of the 23 SUA-Scored Domains (1..23)
severity        Critical | High | Medium | Low   (IMPACT-based, R31.3)
workaround_available  REQUIRED boolean — independent of severity (R29.1, R31.3);
                      NOT the High/Medium discriminator; consumed only by Go/No-Go (R34.4)
intended_source Notion page/collection reference
actual_source   repo file:line or function name
evidence        rich evidence (excerpts, command output, trace ids, test results)
impact          consequence description
fix             recommended remediation
effort_estimate one of the 5 enumerated values (below)
```

- **`workaround_available` (required boolean):** every Finding records, independently of its impact-based severity, whether a documented workaround exists (R29.1). It is **not** the discriminator between High and Medium (R31.3) and is read only by the Go/No-Go logic (R34.4).

- **`effort_estimate` enum** (verified against the live Findings Library): `Quick Win (1-2 hrs)`, `Small (1-2 days)`, `Medium (3-5 days)`, `Large (1-2 weeks)`, `XL (2+ weeks)`. A record whose `effort_estimate` is not exactly one of these five is **rejected and excluded** with an error indication (R29.7).
- **`Unknown` handling:** a field that cannot be populated is set to the literal `Unknown` with an associated `Open_Question` (R29.4) — never omitted or null.
- **Critical-no-Unknown rule:** a Critical Finding **may not** carry `Unknown` in `intended_source`, `actual_source`, or `evidence`; if it would, the engine records a `Blocked_Check` or downgrade-pending `Open_Question` and does **not** emit that Critical Finding as complete (R29.5).
- **`Unknown`-rate cap:** an overall `Unknown` rate threshold is enforced; exceeding it records a Finding and withholds PASS for affected domains (R29.6). A field-completeness summary reports per-Finding completeness and the overall rate vs threshold (R29.8).

### Issue-signature taxonomy (canonicalization for LLM-judged findings)

The `issue_signature` that enters the `Finding_Fingerprint` is a member of a **closed enum of defect classes**, never free prose. For deterministic checks the engine assigns the enum directly; for **LLM-Judged** findings (spec↔code reconciliation, prompt-fidelity) the LLM must **map its judgment onto exactly one** enum member — that member enters the fingerprint, while the LLM's prose reasoning is retained as **evidence only**. This makes determinism real even when the LLM's wording varies run-to-run.

```
type IssueSignature =
  | "SpecWithoutCode"      // Intended_Source with no implementing Actual_Source
  | "CodeWithoutSpec"      // implemented behavior with no governing spec
  | "FieldTypeMismatch"    // schema/contract type/nullability/relation conflict
  | "MissingControl"       // a required security/privacy/reliability control absent
  | "BoundaryViolation"    // integration/automation acting outside its declared scope
  | "OrderingDivergence"   // stage/sequence diverges from architecture spec
  | "UngroundedClaim"      // proposal claim not grounded in captured findings
  | "MissingEvalBaseline"  // required eval dataset/baseline absent
  | "MissingSection"       // required proposal/template section missing
  | "ToleranceBreach"      // measured value outside Tolerance_Band / over budget
  | "ReplayOrAuthGap"      // webhook signature/replay or authz gap
  | "IsolationGap"         // tenant-isolation / RLS / cross-tenant exposure
  | "RetentionGap"         // retention/RTBF/derived-store residual PII
  | "ScrapingComplianceGap"// robots.txt/politeness/ToS/single-source fragility
  | "DependencyRisk"       // vulnerable/unpinned/typosquat dependency
  | "ConfigDrift";         // deploy/env/flag config drift
```

A finding whose nature does not fall in the enum is recorded as an `Open_Question` (taxonomy gap) rather than fingerprinted with prose.

### `Finding_Fingerprint` and id derivation (R27)

```
Finding_Fingerprint =
    normalize(domain)
  + normalize(actual_source)          // path + symbol form, canonicalized
  + issue_signature                   // CLOSED-ENUM member (above), never free prose
  + (kind == Runtime ? check_id : "") // Runtime checks include originating check id

id = stableHash(Finding_Fingerprint)  // same fingerprint ⇒ same id on same Pinned_State
```

- `actual_source` is **normalized** (path + symbol) before fingerprinting so cosmetic path differences never produce false `New` classifications (R27.4).
- `issue_signature` is a **closed-taxonomy enum member**, so two runs that describe the same defect (even with different LLM prose) produce the **same** fingerprint — eliminating false `New`/`Regression` for LLM-Judged findings.
- **Deterministic prior-fingerprint pipeline (regression matching).** Prior findings in `AUDIT_REPORT*.md`, prior Notion audits (12-part System Audit, A2Z, Completion Audit), **and the `production-hardening` spec's resolved findings** are prose with no fingerprints. To keep `New`/`Regression`/`Confirms-Prior` deterministic, the engine does **not** re-extract them live each run. Instead:
  1. a **one-time LLM extraction** normalizes each prior finding into the **same closed taxonomy** + normalized `actual_source`, producing a **prior-findings ledger**;
  2. the ledger is **cached, pinned, and version-controlled** (committed alongside the engine), so every subsequent run matches the current findings against the **cached deterministic ledger**, not a fresh nondeterministic extraction;
  3. the matching corpus **explicitly includes** `production-hardening`'s resolved findings (the regression baseline cited in the design principles), in addition to `AUDIT_REPORT*.md` and the Notion audits.
- **Classification** against the cached ledger: `New` (no prior match), `Regression` (prior match previously marked resolved), `Confirms-Prior` (prior match still open) — matched by fingerprint (R27.3, R1.8, R26.5).
- **Collision:** if two distinct findings produce the same fingerprint, record an `Open_Question` flagging the collision to disambiguate the issue signature (R27.5).

### Transform to live Notion databases (R30)

The internal schema is the source of truth; DB population is via an explicit, per-database transform. The engine **does not** assert a one-to-one mapping to both DBs (R30.3) and records schema-extension gaps as Open_Questions (R30.4, design-only — it cannot modify Notion).

#### Findings Library (`collection://e24e0634-3d62-4063-9d22-963453aaf45f`)

Verified live schema has **no native `Severity`, `domain`, `intended_source`, `actual_source`, or rich-evidence** property, and `Evidence Links` is a **single URL**.

| Internal field                               | Findings Library target                    | Mechanism                                     |
| -------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `severity`                                   | `Impact Score` (1–10) **+** `Finding Type` | derived (table below)                         |
| `effort_estimate`                            | `Effort Estimate` (enum)                   | **direct** (verified enum match)              |
| `evidence` (rich)                            | text/notes property                        | carried as text; **not** native rich-evidence |
| `evidence` artifact URL                      | `Evidence Links` (single URL)              | URL pointer to full artifact only             |
| `impact` / `fix`                             | text/notes property                        | carried via transform                         |
| `domain`, `intended_source`, `actual_source` | _(no native property)_                     | **schema-extension Open_Question** (R30.4)    |
| `severity` (also surfaced via)               | `Confidence Score` is independent          | not a severity proxy                          |

##### severity → Impact Score / Finding Type derivation

| Internal `severity` | `Impact Score` (1–10) | Default `Finding Type`                         |
| ------------------- | --------------------- | ---------------------------------------------- |
| Critical            | 9–10                  | `Broken` or `Risk` (leakage/security → `Risk`) |
| High                | 7–8                   | `Underperforming` or `Broken`                  |
| Medium              | 4–6                   | `Underperforming` or `Missing`                 |
| Low                 | 1–3                   | `Opportunity`                                  |

(`Finding Type` chosen from the live enum `Missing / Underperforming / Broken / Opportunity / Risk` by the finding's nature; `Root Cause Category` populated from the issue signature.)

#### QA / Test Cases (`collection://d48ed205-053d-4242-b45b-3d9bfc1008fc`)

This database **does** have a native `Severity` (Critical/High/Medium/Low) but represents **test scenarios, not findings** (R30.2).

| Internal field     | QA / Test Cases target                | Mechanism             |
| ------------------ | ------------------------------------- | --------------------- |
| `severity`         | `Severity` (Critical/High/Medium/Low) | **direct**            |
| `evidence` / `fix` | scenario description fields           | carried via transform |

#### Schema-extension recommendation (Open_Question, design-only)

Recommend adding to Findings Library: `Severity`, `Domain`, `Intended Source`, `Actual Source`, and a rich-evidence text property — recorded as an `Open_Question` stating the engine cannot apply the change to Notion (R30.4).

#### Notion population is OUT OF SCOPE (deliberate scope boundary, R30.6)

The engine **emits a transform-ready payload** but **does NOT write to Notion** — consistent with the non-destructive-to-Notion invariant. Auto-population of the Findings Library is therefore **explicitly out of scope**: because the live Findings Library lacks native `Severity`, `Domain`, `Intended Source`, `Actual Source`, and rich-evidence properties, a **human must first apply the ~5 schema-extension properties** (the R30.4 Open_Question) before the emitted payload can be imported. This is a **deliberate boundary**, not implied auto-population: the user story's "populate without rework" goal is satisfied by producing an import-ready payload mapped to the (post-extension) schema, with the human schema change and import being manual steps the engine cannot and does not perform.

### Audit Run Procedure (End-to-End)

The run executes in ordered phases; artifacts/evidence accumulate into four sinks: a **machine-readable findings set**, a **human-readable report**, the **Open_Questions register**, and the **Blocked_Checks list**.

- **P0 — Critical Safety.** Tenant isolation & defense-in-depth (R7), isolation confirmation of the sandbox (R3.6), secret scan (R14.2), webhook authenticity (R18), prompt-injection defense (R8), and **legal/scraping/ToS compliance (R36)** — disallowed-fetch / ToS-prohibited collection is a ≥High legal exposure and `robots.txt`-ignoring fetches are caught here; the ToS determination is escalated as an `Open_Question` (legal judgment). Any Critical here forces No-Go.
- **P1 — Reliability & Data Contracts.** Data contract/schema diff (R6), orchestration reliability & idempotency (R11), module registry & fallback (R13), concurrency/load (R24), data lifecycle/RTBF (R23), supply chain (R22).
- **P2 — AI Quality & Evals.** Prompt fidelity & grounding (R10), learning-loop safety (R9), proposal quality dual-scoring (R12), spec↔code reconciliation (R4/R5/R26).
- **P3 — Performance & Economics.** Synthetic runs across ≥5 industries (R33), measured latency/`Per_Audit_Cost` percentiles with cold-start separation (R16), rate-limit/spend-cap abuse resistance (R21).
- **P4 — Docs/Traceability & Remediation.** Forward/reverse coverage & drift quantification (R26), feature-flag/mode correctness (R19), deployment/ops readiness (R20), frontend/API contract (R25), scoring (R32), remediation plan & Go/No-Go (R34), Open_Questions finalization (R35).

After all (non-blocked, non-capped) checks complete, the aggregation layer fingerprints and classifies findings, computes domain and overall scores, and emits the Go/No-Go recommendation with provisional flags where Blocked_Checks or a cap reduced coverage.

## Mermaid Diagrams

### (a) Audit Pipeline

```mermaid
flowchart TD
    A[Pin State: git SHA + Notion content-hash snapshot] --> B[Capability Precondition Gate\nincl. Notion read access]
    B -->|missing capability| BC[Record Blocked_Check]
    B -->|Notion unreachable| BC
    C0[STATIC checks: schema diff, flag matrix, secret scan,\nmodule registry, dependency scan, file presence,\nAPI-contract, config inspection,\nscraper robots.txt/politeness] --> D
    B --> C0
    D[Spin up Isolated Synthetic Env\nnon-prod DB + synthetic tenants + Stripe TEST + spend cap\n+ orchestration substrate: LangGraph in-proc, Temporal dev/stub,\nLangSmith/n8n/Dify stubbed] -->|isolation unconfirmed| EXIT
    D --> E[RUNTIME checks: synthetic runs, latency/cost,\nquality dual-score, injection oracle, idempotency,\ndegraded-mode, concurrency, webhook, cross-tenant, RTBF derived stores,\nAPI PII over-fetch, scraper enforcement]
    E --> F[LLM-JUDGED reconciliation: spec<->code, prompt fidelity\n(closed-taxonomy issue_signature)]
    F --> G[Aggregate Findings]
    BC --> G
    G --> H[Fingerprint + Classify vs CACHED prior-findings ledger\nNew / Regression / Confirms-Prior]
    H --> I[Score 23 SUA Domains 0-10\nseverity deductions Critical:5 + load-bearing Critical-cap <=3]
    I --> J[Overall Production_Readiness_Score\nsecurity-weighted mean + Scorecard-area mapping]
    J --> K{Go / No-Go?\nCritical=>No-Go; High thresholds}
    K --> L[Emit Artifacts:\nmachine findings + human report +\nOpen_Questions register + Blocked_Checks list]
    M[Self-Budget cap hit] -.->|finalize| EXIT
    E --> EXIT
    EXIT[Sandbox exit: success | abort | cap-hit | isolation-unconfirmed] --> T[finally: Teardown synthetic data\nruns on ALL exit paths]
    T --> L
    EXIT --> L
```

### (b) System-Under-Test flow with audit probes

```mermaid
flowchart LR
    IN[Website / Business Input] --> MOD[Multi-Module Audit\nlib/audit/runner.ts + lib/modules/]
    MOD --> DIAG[Diagnosis\nlib/graph/diagnosis-graph.ts]
    DIAG --> PROP[Proposal Generation\nlib/graph/proposal-graph.ts + lib/proposal/runner.ts]
    PROP --> OUT[Proposal + Pricing]

    P1[[Probe: prompt-injection\n+ URL/SSRF validation\nR8]] -.-> IN
    P2[[Probe: module registry\n+ degraded-mode\nR13]] -.-> MOD
    P3[[Probe: idempotency replay\n+ graph-node conformance\nR11]] -.-> DIAG
    P4[[Probe: quality dual-score\n+ grounding + claim policy\nR12/R10]] -.-> PROP
    P5[[Probe: pricing vs DB\n+ Stripe TEST\nR12.5/R3]] -.-> OUT
    P6[[Probe: latency/cost percentiles\nR16]] -.-> MOD
    P6 -.-> PROP
    P7[[Probe: tenant isolation\ncross-retrieval\nR7]] -.-> MOD
    P8[[Probe: concurrency/load\nR24]] -.-> MOD
    P9[[Probe: webhook authenticity\nR18]] -.-> MOD
    P10[[Probe: rate-limit/spend-cap\nR21]] -.-> IN
    P11[[Probe: RTBF deletion across derived stores\nR23]] -.-> OUT
    P12[[Probe: legal/scraping/ToS\nrobots.txt + politeness + single-source fragility\nToS = Open_Question\nR36]] -.-> IN
```

## Data Models

Implementation-agnostic TypeScript-style interfaces.

```typescript
type CheckKind = 'Static' | 'Runtime' | 'LLM-Judged' | 'Manual';
type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type ReconciliationStatus =
  | 'Aligned'
  | 'Code-Without-Spec'
  | 'Spec-Without-Code'
  | 'Conflicting'
  | 'Partially-Aligned';
type Classification = 'New' | 'Regression' | 'Confirms-Prior';
type EffortEstimate =
  | 'Quick Win (1-2 hrs)'
  | 'Small (1-2 days)'
  | 'Medium (3-5 days)'
  | 'Large (1-2 weeks)'
  | 'XL (2+ weeks)';
type Capability =
  | 'notionRead'
  | 'nonProdDb'
  | 'gcpVertex'
  | 'langSmith'
  | 'testExecution'
  | 'secretScan'
  | 'costInstrumentation';

type IssueSignature =
  | 'SpecWithoutCode'
  | 'CodeWithoutSpec'
  | 'FieldTypeMismatch'
  | 'MissingControl'
  | 'BoundaryViolation'
  | 'OrderingDivergence'
  | 'UngroundedClaim'
  | 'MissingEvalBaseline'
  | 'MissingSection'
  | 'ToleranceBreach'
  | 'ReplayOrAuthGap'
  | 'IsolationGap'
  | 'RetentionGap'
  | 'ScrapingComplianceGap'
  | 'DependencyRisk'
  | 'ConfigDrift';

interface ToleranceBand {
  dimension: 'latency' | 'cost' | 'score';
  unit: string; // "ms" | "usd" | "points"
  plusMinus: number; // acceptable +/- variation (latency ±15%/±250ms, cost ±10%/±$0.01, score ±0.5)
  pctOfBaseline?: number; // e.g. 0.15 latency, 0.10 cost; absolute floor in plusMinus
}

interface Check {
  id: string; // stable, unique
  kind: CheckKind;
  domain: number | null; // 1..23 (SUA-Scored Domain) OR null for engine-precondition/safety checks (R3.6 isolation confirmation, R2 capability probes) — null ⇒ no Domain_Score
  requirement: string; // e.g. "R7.2"
  intendedSource: string[]; // Notion page/collection ids
  actualSource: string[]; // repo paths/symbols
  requiredCapabilities: Capability[];
  toleranceBand?: ToleranceBand; // Runtime measured checks only
  description: string;
}

interface Finding {
  id: string; // derived from fingerprint
  fingerprint: string; // domain + normalized actual_source + issue_signature (closed enum) [+ checkId]
  domain: number; // 1..23 (SUA-Scored Domain)
  severity: Severity; // IMPACT-based (R31.3); independent of workaround_available
  severityTrigger: string; // documented trigger (R31.4)
  workaround_available: boolean; // REQUIRED, independent attribute (R29.1, R31.3); NOT a severity discriminator; consumed only by Go/No-Go (R34.4)
  issueSignature: IssueSignature; // CLOSED-ENUM member; for LLM-Judged findings the prose is evidence only
  intendedSource: string | 'Unknown';
  actualSource: string | 'Unknown';
  evidence: string | 'Unknown';
  evidenceArtifactUrl?: string; // for Findings Library single-URL Evidence Links
  impact: string;
  fix: string;
  effortEstimate: EffortEstimate;
  sourceCheckId: string;
  checkKind: CheckKind;
  classification: Classification;
  reconciliationStatus?: ReconciliationStatus;
  measuredValue?: number; // Runtime checks; compared within toleranceBand
  substrateBacking?: 'real-dev' | 'stub'; // Domain 5 reliability findings (R11.6): which substrate backed the finding; "stub" ⇒ provisional
}

interface OpenQuestion {
  id: string;
  description: string;
  intendedSource: string[];
  actualSource: string[];
  decisionRequired: string;
  blocksDetermination?: 'severity' | 'go-no-go' | null;
  kind?: 'ambiguity' | 'conflict' | 'schema-extension' | 'fingerprint-collision';
}

interface BlockedCheck {
  checkId: string;
  domain: number;
  missingCapability: Capability;
  reason: string;
}

interface RunHeader {
  runId: string;
  pinnedState: {
    gitSha: string;
    treeDirty: boolean;
    notionSnapshotAt: string;
    notionSnapshotHashes: Record<string, string>;
  }; // pageId -> sha256 of normalized content
  priorLedger: {
    // R27.6 reviewed-frozen prior-findings ledger
    version: string; // pinned, version-controlled ledger version used for matching
    reviewedBy: string; // human reviewer who signed off the extracted fingerprints+classifications
    reviewedAt: string; // sign-off timestamp
    frozen: boolean; // true once human-reviewed and pinned; runs match only against a frozen, reviewed ledger
  };
  capabilitiesAvailable: Capability[];
  capabilitiesUnavailable: Capability[];
  selfBudget: {
    maxRuntimeMs: number;
    maxCostUsd: number;
    measuredRuntimeMs: number;
    measuredCostUsd: number;
    defaultSampleFitsBudget: boolean; // R28.2 reconciliation
    capHit: 'runtime' | 'cost' | null;
    partial: boolean;
  };
  provisional: boolean; // true if Blocked_Checks, a cap, or any stub-backed Domain 5 finding (R11.6) affected coverage
}

interface DomainScore {
  domain: number; // 1..23, SUA-Scored Domains only (never Engine-Correctness Reqs)
  rawScore: number; // before floor/cap
  score: number; // 0..10 after floor + Critical-cap
  criticalCapApplied: boolean;
  weight: number;
  contributingFindings: { id: string; severity: Severity; deduction: number }[];
  provisional: boolean; // Blocked_Checks affected this domain
}

interface ScorecardEntry {
  // side-by-side comparison row (R32.6) — NOT an equivalence claim
  scorecardArea: string; // one of the Scorecard's 12 areas (via R32.3 mapping)
  suaDomains: number[]; // SUA-Scored Domain(s) mapped to this area
  engineScore: number; // engine Domain_Score (or aggregate where multiple domains map)
  priorScorecardScore: number | 'n/a'; // prior expert score for the comparable area
  evidence: string;
  fix: string;
  priority: Severity;
}

interface LatencyCostDistribution {
  p50: number;
  p95: number;
  p99: number;
  coldStart: { p50: number; p95: number; p99: number; samples: number };
  warmSamples: number;
}

interface SyntheticRunResult {
  runId: string;
  industry: string;
  tenantId: string; // synthetic tenant scope (R33.5)
  coldStart: boolean;
  input: unknown;
  modulesExecuted: string[];
  diagnosis: unknown;
  proposal: unknown;
  inRepoScore: number; // lib/qa/proposal-quality-scorer.ts
  independentScore: number; // spec-defined rubric (no scorer reuse)
  latencyMs: number;
  perAuditCostUsd: number; // LLM_Cost_Subset + infra + third-party
  llmCostSubsetUsd: number;
  tornDown: boolean;
}

// DB-transform mapping types (R30)
interface FindingsLibraryRow {
  impactScore: number; // 1..10, derived from severity
  confidenceScore: number; // 1..10, independent of severity
  findingType: 'Missing' | 'Underperforming' | 'Broken' | 'Opportunity' | 'Risk';
  rootCauseCategory: string;
  effortEstimate: EffortEstimate; // direct mapping
  notes: string; // rich evidence/impact/fix carried as text
  evidenceLinks: string; // single URL pointer only
}

interface QaTestCaseRow {
  severity: Severity; // native, direct
  description: string;
}

interface FindingTransform {
  toFindingsLibrary(f: Finding): FindingsLibraryRow; // severity -> ImpactScore + FindingType
  toQaTestCase(f: Finding): QaTestCaseRow; // severity -> Severity (direct)
}
```

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

These properties target the **deterministic core of the audit engine** (fingerprinting, static-check determinism, scoring, severity totality, transform correctness, verdict rules). Synthetic-run _measured_ values (latency, cost, quality scores) are validated **within a `Tolerance_Band`, not exactly** — only the threshold/decision logic over those values is asserted as a property (see P13, P14).

### Property 1: Static_Check byte-equality on unchanged Pinned_State

_For any_ set of registered `Static_Check`s evaluated twice against the same unchanged `Pinned_State`, the produced findings' `id`s and `severities` are byte-for-byte identical across the two runs.

**Validates: Requirements 1.7**

### Property 2: Fingerprint determinism, id derivation, and normalization

_For any_ Finding, the `Finding_Fingerprint` is a deterministic function of `domain` + normalized `actual_source` + a **closed-taxonomy `issue_signature` enum member** (+ originating `check_id` for Runtime checks), and the `id` derives deterministically from the fingerprint; two findings whose `actual_source` differs only cosmetically (path/symbol form) produce the **same** fingerprint and `id`, two findings mapped to the **same** `issue_signature` enum member produce the same signature regardless of any LLM prose, and findings with distinct enum members produce distinct fingerprints. This subsumes the Runtime_Check identity-stability half of Requirement 1.7 and makes LLM-Judged findings deterministic.

**Validates: Requirements 27.1, 27.2, 27.4, 29.3, 1.7, 4.7**

### Property 3: New/Regression/Confirms-Prior classification is total and deterministic

_For any_ Finding and the **cached, version-pinned prior-findings ledger** (extracted once into the same closed taxonomy + normalized `actual_source`, and including `production-hardening`'s resolved findings, the `AUDIT_REPORT*.md` files, and the prior Notion audits), classification returns **exactly one** of `New`, `Regression`, or `Confirms-Prior`, determined purely by the Finding's fingerprint matched against the **cached ledger** (`New` = no prior match, `Regression` = prior match previously marked resolved, `Confirms-Prior` = prior match still open), and repeated calls on the same inputs return the same label (matching against the cached ledger, never a fresh live extraction).

**Validates: Requirements 1.8, 27.3, 26.5**

### Property 4: Severity classifier is total, single-valued, highest-precedence, and leakage⇒Critical

_For any_ set of matched severity triggers, the classifier returns **exactly one** severity in {Critical, High, Medium, Low} equal to the highest-precedence matching trigger; and whenever the trigger set includes tenant data leakage or cross-tenant access, the result is `Critical` regardless of any other triggers.

**Validates: Requirements 31.1, 31.2, 31.5**

### Property 5: Domain_Score formula with floor and load-bearing Critical-cap

_For any_ set of unresolved findings in a SUA-Scored Domain, `Domain_Score` equals `max(0, 10 − Σ severity_deductions)` using `deduction = {Critical:5, High:4, Medium:2, Low:0.5}`, lies in `[0, 10]`, and whenever the domain contains at least one unresolved `Critical` finding the score is capped at `≤ 3` (the cap is load-bearing: a single Critical alone gives `raw=5` → `min(5,3)=3`, not 0); the same input always yields the same score. The formula applies **only** to SUA-Scored Domains, never to Engine-Correctness Requirements.

**Validates: Requirements 32.1, 32.2**

### Property 6: Overall Production_Readiness_Score is the documented weighted mean

_For any_ vector of `Domain_Score`s with their documented weights, the `Production_Readiness_Score` equals `Σ(score_d × weight_d) / Σ(weight_d)`, lies in `[0, 10]`, and is reproducible from the domain scores.

**Validates: Requirements 32.3**

### Property 7: Findings record completeness and Unknown rules

_For any_ emitted Finding, every required field (`id`, `domain`, `severity`, `intended_source`, `actual_source`, `evidence`, `impact`, `fix`, `effort_estimate`) is present and non-null — any field that cannot be populated holds the literal `Unknown` with a paired `Open_Question`; no `Critical` Finding is emitted complete while carrying `Unknown` in `intended_source`, `actual_source`, or `evidence`; and when the `Unknown` rate across the set exceeds the threshold a cap Finding is recorded and PASS is withheld for affected domains.

**Validates: Requirements 29.1, 29.4, 29.5, 29.6**

### Property 8: effort_estimate enum totality

_For any_ candidate Finding, it is accepted into the emitted set **iff** its `effort_estimate` is exactly one of the five enumerated values (`Quick Win (1-2 hrs)`, `Small (1-2 days)`, `Medium (3-5 days)`, `Large (1-2 weeks)`, `XL (2+ weeks)`); otherwise the record is excluded and an error indication identifying the invalid value is produced.

**Validates: Requirements 29.2, 29.7**

### Property 9: Database transform correctness against verified live schemas

_For any_ Finding, the transform to a `FindingsLibraryRow` yields only properties that exist in the verified live Findings Library schema — `Impact Score` ∈ `1..10` derived from `severity`, `Finding Type` ∈ {Missing, Underperforming, Broken, Opportunity, Risk}, `Effort Estimate` mapped **directly/identically**, and `Evidence Links` holding a single URL — and the transform to a `QaTestCaseRow` maps `severity` directly to the native `Severity`; the transform never emits a property absent from the target schema.

**Validates: Requirements 30.1, 30.2, 30.3**

### Property 10: Dual-citation completeness

_For any_ emitted Finding, either it cites at least one `Intended_Source` **and** at least one `Actual_Source`, or it records an explicit reason why one side is absent.

**Validates: Requirements 4.1**

### Property 11: Go/No-Go verdict rules are total and monotonic

_For any_ set of findings, the `Go_No_Go_Recommendation` is exactly one of {Go, Conditional-Go, No-Go}; any unresolved `Critical` forces `No-Go`; unresolved `High` count `≥ Y (≥10)` forces `No-Go`; `High` count `≥ X (≥5)` forces at most `Conditional-Go`; the workaround clause forces at most `Conditional-Go` **only for the real subset of unresolved Highs explicitly marked `workaround_available = false`** (since `workaround_available` is an impact-orthogonal independent attribute per R31.3, not part of the High definition); a clean `Go` is therefore reachable when unresolved Highs are below X and **every** unresolved High has `workaround_available = true`; and adding a higher-severity finding never improves the verdict (monotonicity).

**Validates: Requirements 34.2, 34.3, 34.4**

### Property 12: Capability gate maps unavailable capabilities to Blocked_Checks

_For any_ capability-availability vector and registered check set, every check whose `required_capability` is unavailable is recorded as a `Blocked_Check` (never reported passed), and the Blocked_Checks list is disjoint from both Findings and Open_Questions.

**Validates: Requirements 2.1, 2.3, 2.4**

### Property 13: Percentile computation with cold-start partition

_For any_ set of measured latency/cost samples partitioned into cold-start and warm, the computed warm percentiles satisfy `p50 ≤ p95 ≤ p99`, and no cold-start sample contributes to the warm distribution (cold-start is reported as a separate distribution). For a **Default_Sample** only `p50`/`p95` are reported (p99 flagged unavailable); `p99` is reported only for a **Deep_Run**.

**Validates: Requirements 16.2, 16.7, 33.3, 33.4**

### Property 14: Threshold decision over measured values respects Tolerance_Band

_For any_ measured value and its declared `Tolerance_Band`/budget (latency `±15%`/`±250 ms`, cost `±10%`/`±$0.01`, quality `±0.5`), the decision function records a Finding **iff** the value lies outside the band/over budget; a measured `Per_Audit_Cost` below `$0.06` yields an informational `Low` Finding (not a failure), the proposal-quality `≥8` gate is evaluated against the **measured score** (a `7.9` fails even though it is within the `±0.5` identity band), and a value moving only within the band never changes finding identity.

**Validates: Requirements 16.3, 16.4, 16.5, 16.6, 10.5, 12.3, 12.4**

## Error Handling

The following table covers error conditions and edge cases.

| Condition                                                     | Engine behavior                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Required capability missing** (R2.3)                        | Mark every dependent check `Blocked_Check` with the missing capability; never report passed; flag affected domains' scores and Go/No-Go provisional.                                                                                                                                                 |
| **Self-budget cap hit** (R28.2)                               | Stop launching checks, finalize completed work, emit **partial report** listing completed vs not-run coverage; record own runtime/cost in `RunHeader`; flag verdict provisional.                                                                                                                     |
| **Fingerprint collision** (R27.5)                             | Two distinct findings → equal fingerprint: record an `Open_Question` flagging the collision so the issue signature can be disambiguated; do not silently merge.                                                                                                                                      |
| **Scorer vs independent rubric disagree beyond band** (R12.4) | Record a Finding citing the in-repo scorer as a potential source of error, with both scores and the band.                                                                                                                                                                                            |
| **Accepted-risk reconciliation** (R14.5)                      | A risk marked accepted in the Risk Register is annotated as accepted with citation, **not** re-raised as a new Finding.                                                                                                                                                                              |
| **Documented suppression** (R14.6)                            | Allowed only with justification + authorizing Risk Register reference; suppressed findings listed separately.                                                                                                                                                                                        |
| **Critical Finding would carry `Unknown`** (R29.5)            | Do not emit as complete; record a `Blocked_Check` or downgrade-pending `Open_Question` instead.                                                                                                                                                                                                      |
| **Invalid `effort_estimate`** (R29.7)                         | Reject and exclude the record; produce an error indication naming the invalid value.                                                                                                                                                                                                                 |
| **Attempted production side effect in sandbox** (R3.4)        | Abort the run, leave external systems unchanged, record a **Critical** Finding citing the attempted side effect.                                                                                                                                                                                     |
| **Isolation unconfirmable** (R3.6)                            | Record a `Blocked_Check`; do not start any synthetic run.                                                                                                                                                                                                                                            |
| **LLM non-determinism** (R4.7, R27)                           | Require the LLM to map its judgment onto exactly one member of the **closed `issue_signature` taxonomy**; that enum member (not the prose) enters the `Finding_Fingerprint`, so identity is stable across runs even though the LLM's prose varies; the prose is stored as evidence, not as identity. |
| **Prior-findings ledger drift** (R27.3)                       | Match against the **cached, version-pinned** prior-findings ledger (extracted once, including `production-hardening` resolved findings); never re-extract prior prose live, which would make classification nondeterministic.                                                                        |
| **Two Intended_Sources conflict** (R4.5, R35.2)               | Record an `Open_Question` citing each conflicting source rather than guessing a Finding.                                                                                                                                                                                                             |
| **Ambiguous/undocumented intended behavior** (R35.1)          | Record an `Open_Question`; flag any dependent severity/Go-No-Go determination provisional.                                                                                                                                                                                                           |
| **Dirty git tree at pin time**                                | Record `treeDirty=true` in `Pinned_State`; Static-Check reproducibility claims apply to the working copy, noted in the report.                                                                                                                                                                       |

## Testing Strategy

### Dual approach

- **Property-based tests** verify the universal properties of the engine's deterministic core (P1–P14) using **`fast-check`** with **`vitest`** — the same toolchain already proven in the `production-hardening` spec. Each property test runs a **minimum of 100 iterations** and is tagged referencing its design property.
- **Example-based unit tests** cover specific static-diff correctness against fixtures (R5, R6, R13.1, R19.1), the Stripe-abort guard (R3.4), and the isolation-confirmation guard (R3.6).
- **Integration tests** (1–3 representative cases each, **not** property-based) cover SUA runtime behaviors exercised in the `Isolated_Synthetic_Execution_Environment`: cross-tenant retrieval (R7.4), prompt-injection resistance via the canary oracle (R8.2), webhook signature/replay (R18.3, R18.4), idempotency replay (R11.5), degraded-mode/module-failure isolation (R11.3, R13.4), rate-limit/spend-cap enforcement (R21.3, R21.4), RTBF deletion across **each enumerated derived store** — LLM/response caches, LangSmith traces, application logs, cross-tenant aggregates (R23.4, R23.5), runtime API/client PII over-fetch (R25.2, R25.5), and scraper `robots.txt`/politeness enforcement (R36.1, R36.5).
- **Smoke tests** (single execution) verify capability-probe wiring including **Notion read access** and sandbox config inspection (R2.1, R3.6), and the **prior-findings ledger** being present, pinned, and version-matched to `priorLedgerVersion`.
- **Manual/Open_Question** steps (no automated oracle): per-source **ToS determination** (R36.2, R36.4) — a legal judgment escalated as an `Open_Question`, never asserted.

### Why measured values are not property-tested for exact equality

Synthetic-run latency, `Per_Audit_Cost`, and quality scores are **Runtime_Check** measurements. Their identity is stable (fingerprint), but their _values_ vary within a `Tolerance_Band`. Property tests therefore assert the **decision logic** over those values (P14: Finding iff outside band) and the **distribution math** (P13: percentile ordering + cold-start partition), never an exact measured number.

### Property test configuration

- Library: `fast-check` + `vitest` (`vitest.config.ts` already present).
- Minimum **100 iterations** per property test.
- Each property test tagged: **Feature: proposal-engine-audit-system, Property {number}: {property_text}**.
- Each correctness property (P1–P14) is implemented by a **single** property-based test.

### Coverage mapping

| Property | Engine component under test                                                                                                                 | Test kind                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| P1       | Static-check evaluation determinism                                                                                                         | property (fast-check)                        |
| P2       | `Finding_Fingerprint` + id + normalization                                                                                                  | property                                     |
| P3       | New/Regression/Confirms-Prior classifier                                                                                                    | property                                     |
| P4       | Severity decision table                                                                                                                     | property                                     |
| P5       | `Domain_Score` formula + Critical-cap                                                                                                       | property                                     |
| P6       | Overall weighted-mean aggregation                                                                                                           | property                                     |
| P7       | Findings record completeness + Unknown rules                                                                                                | property                                     |
| P8       | `effort_estimate` enum totality                                                                                                             | property                                     |
| P9       | Findings Library / QA transform                                                                                                             | property                                     |
| P10      | Dual-citation invariant                                                                                                                     | property                                     |
| P11      | Go/No-Go verdict rules + monotonicity                                                                                                       | property                                     |
| P12      | Capability gate → Blocked_Checks                                                                                                            | property                                     |
| P13      | Percentile + cold-start partition                                                                                                           | property                                     |
| P14      | Threshold decision within Tolerance_Band                                                                                                    | property                                     |
| —        | Static diff correctness (R5/R6/R13/R19)                                                                                                     | example (fixtures)                           |
| —        | Cross-tenant, injection oracle, webhook, idempotency, degraded-mode, spend-cap, RTBF derived stores, API PII over-fetch, scraper robots.txt | integration (sandbox, 1–3 cases)             |
| —        | Stripe-abort guard, isolation confirmation, Notion-read probe, prior-ledger pin                                                             | example / smoke                              |
| —        | Per-source ToS determination (R36.2/R36.4)                                                                                                  | manual / Open_Question (no automated oracle) |
