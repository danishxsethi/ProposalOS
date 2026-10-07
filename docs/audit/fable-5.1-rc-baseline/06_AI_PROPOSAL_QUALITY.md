# 06 — AI, Diagnosis, Proposal, Truthfulness — Fable 5.1

Chain: `raw data → module result → evidence → finding → diagnosis (preCluster→llmCluster→narratives) → graph → proposal (exec-summary LLM + pricing deterministic + tier mapping) → grounding → QA → adversarial QA → fingerprint → publication`.

## Contracts

- Evidence: `createEvidence` pointer non-placeholder/secret; Zod pooled.
- Findings: `FindingRuntimeSchema` evidence≥1, impact 0-10, confidence 0-10.
- Diagnosis Graph: StateGraph verify_evidence→cluster→rank→classify→narrative→validate→adversarial QA (retry 2, hallucinationScore>0.3 retry) 90s timeout, degraded not 500.
- Proposal Grounding: `ProposalGroundingSchema` version 1, claims per text span with sourceFindingIds or commercial configRefs, roiStatus calculated, tier price=pricing consistency.
- Publication: `publicationBlockReasons` + `assertProposalPublishable` blocks unless APPROVED+fingerprint+eval PASS+hardFailures[]+claimPolicy valid+status PASS.

## Prompt injection controls

- `lib/security/piiScrubber.ts` NFKC + zero-width strip + 20 INJECTION_PATTERNS → [INJECTION_BLOCKED], PII redaction, 10k cap.
- `lib/llm/output-validator.ts` PROBLEMATIC_PATTERNS (offensive/legalRisk/unsubstantiated/PII/promptLeak/encoding) canned deflection on critical.
- Prompt framing: `<UNTRUSTED_FINDINGS>`/`<VALIDATED_CLUSTERS>`/`<ALLOWED_FINDING_IDS>` labeled, ignore instructions, low temps 0-0.3, responseModality json + Zod + markdown fence strip.
- Adversarial suite `lib/qa/adversarial-tests.ts` 20 cases (injection/jailbreak/exfiltration).

## Claim policy enforced

Every customer-visible factual claim must map to evidence via `validateCustomerClaim` numeric/substantive term overlap + audit/tenant binding + metricInput source binding. Gemini never invents prices/timelines/ROI — those are deterministic `tierMapping + pricing` rule IDs only.

## Proposal quality

UNVERIFIED on this HEAD — no 5-industry live proposals generated in this audit. Requirement: avg ≥85/100, none <80, zero unsupported high-impact claims, zero invented metrics/rankings/competitors/ROI, no broken primary section. Run `proposalQuality` scorer (6-axis 1-10 avg ≥8) + executiveSummaryQa vs live samples before claiming RC.

Prompts: `prompts/` 10 .txt files (exec-summary, clustering, narrative variants) + self-evolving-prompts DB layer not yet in schema — design vs prod mixed; keep .txt for RC.

