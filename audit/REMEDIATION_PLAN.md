# Remediation Plan: Proposal Engine Audit Fixes

## Goal Description
This plan addresses all broken (`❌ BROKEN`), missing (`🚫 MISSING`), and partial (`⚠️ PARTIAL`) features identified during the end-to-end functional audit of the 18 pipelines. The goal is to fully remediate the codebase so that all pipelines are 100% functional, fully wired together, and operating according to their original specifications.

## Proposed Changes

### High Priority: Severely Broken Pipelines

---

#### [MODIFY] `lib/graph/email-sequence-graph.ts`
- **Fix Node Topology:** Restructure the graph from `load_prospect_data → validate_email → generate_sequence → schedule_cadence` to the specified `analyze_prospect → draft_sequence` topology.
- **Fix Sequence Length:** Force the sequence generator to produce exactly 3 emails (Awareness, Proof, Urgency) instead of 5.

#### [MODIFY] `lib/outreach/sprint2/emailComposer.ts`
- **Preemptive Objection Handling:** Add logic in the generation prompt to actively handle potential objections based on the prospect's industry context.
- **Deliverability & Validation:** Enforce spam keyword stripping and ensure the final LLM output matches a strict, parsable JSON schema so it successfully saves without crashing.

#### [MODIFY] `lib/audit/runner.ts` / `lib/delivery/confidenceScorer.ts`
- **Audit Confidence Scores:** Refactor the logic assigning `85`, `90`, `95` to enforce a strict `1-10` scale.
- **Orchestrate Vision Pipeline:** Ensure `vision.ts` is imported and its node is actively orchestrated by the `runAudit` flow to surface `VISUAL_UX` findings.

### Medium Priority: Core Business Logic Gaps

---

#### [NEW] `lib/discovery/zeroBounce.ts`
- Integrate email verification via the ZeroBounce API. 

#### [MODIFY] `app/api/cron/discovery/route.ts`
- Implement the call to `enrichProspect` so waterfall enrichment runs automatically via cron rather than staying stubbed.

#### [MODIFY] `lib/diagnosis/validationNode.ts` (or relevant logic)
- **Truthfulness Verification:** Enhance the Diagnosis graph's validation node to reject uncited claims, pulling directly from the evidence payload rather than just checking schema structure.
- **Evidence Freshness:** Enforce `max_age_hours` checks on loaded evidence data.
- **Partial Audit Handling:** Implement retry rules if a module times out, marking the audit as partial and generating the proposal based on available data.

#### [MODIFY] `lib/proposal/pricing.ts` & `lib/proposal/generator.ts`
- **Dynamic Pricing:** Replace the hardcoded $497/$1497/$2997 tiers with a dynamic pricing model based on LTV and pain scores.
- **Annotated Screenshots:** Hook into the PDF generation and web viewer logic to embed the visual evidence collected by the Vision pipeline into the proposal output.

#### [MODIFY] `lib/graph/delivery-graph.ts`
- Add a conditional edge loop for **rejection auto-retry**. If an artifact fails syntax, schema, or Lighthouse validation, send it back to `generate_artifact` (max 3 retries) rather than dropping it silently.

#### [MODIFY] `lib/graph/adversarial-qa-graph.ts`
- Add a state node loop (Max 3 revisions). If `hallucination_sweep` flags claims, route back to a rewrite node. Currently, the graph is entirely linear and cannot repair hallucinations.

#### [MODIFY] `lib/pipeline/aiSalesChat.ts`
- **Framework Rewrite:** Refactor the direct function calls into a LangGraph state machine.
- **Context Expansion:** Expand the context window to fetch past sent emails, rather than just the last 5 chat messages.
- **Calendar Links:** Inject auto-scheduling calendar logic into the chat responses when purchase intent is extremely high.

### Low Priority / System Enhancements

---

#### [MODIFY] `app/api/billing/webhook/route.ts` & `lib/pipeline/dealCloser.ts`
- Remove the `// TODO` stubs from `handlePaymentSuccess`. Execute physical tenant provisioning and initiate the SLA tracking clock.

#### [NEW] `lib/retention/upsellGenerator.ts`
- Read the `newCount` finding metrics from `deltaReport.ts` (Pipeline 9). If new issues are found, auto-generate an Upsell proposal and link it in the `winReport.ts` email.

#### [MODIFY] `app/api/cron/prompt-promotion/route.ts`
- Add Webhook/Email logic to proactively alert admins of continuous prompt degradation or failures.

#### [NEW] `lib/predictions/ltvModel.ts`
- Implement the missing Life-Time Value (LTV) Prediction model alongside the existing Churn Risk and Win Probability scoring.

## Verification Plan

### Automated Tests
- Execute `npm run test` (or relevant test runner) targeting `/lib/graph/` to verify that newly implemented `LangGraph` loops (Delivery, Adversarial QA) properly hit their retry threshold caps and correctly fail after 3 revisions without infinite loops.
- Verify node topologies of `email-sequence-graph` print the exact expected path.

### Manual Verification
- **Run Discovery & Audit:** Deploy local server (`npm run dev`), input a test business. Observe local console / LangSmith traces to confirm `vision.ts` captures screenshots and confidence scores map from 1-10.
- **Inspect Email Payload:** Ensure the generated sequence is exactly 3 emails long, formatted cleanly as JSON, and spans Awareness, Proof, and Urgency.
- **Test Webhook Simulation:** Use Stripe CLI (`stripe listen --forward-to localhost:3000/api/billing/webhook`) to simulate a `checkout.session.completed` event, ensuring the Tenant is physically provisioned in the local database.
