# Implementation Plan: Agentic Delivery + QA Hardening

## Overview

Implement the `delivery_agent` LangGraph subgraph and `adversarial_qa` node, along with the validation pipeline, confidence scoring, delivery packaging, hallucination telemetry, and red team evaluation dataset. TypeScript throughout, using the existing `generateWithGemini` LLM provider, `fast-check` for property-based tests, and `archiver` for ZIP assembly.

## Tasks

- [x] 1. Database schema migrations and type extensions
  - Add `GeneratedArtifact`, `DeliveryBundle`, `AdversarialQARun`, `HallucinationLog`, and `HumanReviewFlag` models to `prisma/schema.prisma`
  - Add `artifactId`, `bundleId`, `confidenceLevel` fields to existing `DeliveryTask` model
  - Add `confidenceLevel` field to existing `Finding` model
  - Run `prisma generate` and `prisma migrate dev` to apply changes
  - _Requirements: 1.8, 2.4, 2.7, 3.2, 4.1, 7.1, 9.1_

- [ ] 2. Confidence scorer
  - [x] 2.1 Implement `lib/delivery/confidenceScorer.ts`
    - Export `scoreConfidence(finding: Finding): ConfidenceLevel` using the three-rule cascade (HIGH/MEDIUM/LOW) based on evidence quality
    - Export `softenLanguage(text: string, level: ConfidenceLevel): string` applying the softening map for LOW-confidence claims
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 2.2 Write property test for confidence score assignment completeness
    - **Property 7: Confidence score assignment completeness**
    - *For any* Finding, `scoreConfidence` returns exactly one of {HIGH, MEDIUM, LOW} — never null
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Use `fast-check` with `fc.record` to generate random Finding shapes

  - [x] 2.3 Write property test for LOW confidence language softening
    - **Property 8: LOW confidence language softening**
    - *For any* LOW-confidence claim text, `softenLanguage` output must not contain the original assertive phrasing and must contain a qualifier word
    - **Validates: Requirements 7.4**

- [ ] 3. Artifact generators
  - [x] 3.1 Implement `lib/delivery/generators/schemaGenerator.ts`
    - Generate JSON-LD snippets for LocalBusiness, FAQPage, Review schema types based on finding context
    - Export `generate(finding, context): Promise<RawArtifact>` and `supportsWordPress(): boolean`
    - _Requirements: 1.1_

  - [x] 3.2 Implement `lib/delivery/generators/metaTagGenerator.ts`
    - Generate HTML `<meta>` blocks for title, description, and OG tags
    - _Requirements: 1.2_

  - [x] 3.3 Implement `lib/delivery/generators/speedGenerator.ts`
    - Generate optimization scripts (image compression, lazy loading, CSS minification) based on finding metrics
    - _Requirements: 1.3_

  - [x] 3.4 Implement `lib/delivery/generators/gbpGenerator.ts`
    - Generate GBP content drafts (business description, categories, Q&A, posts)
    - _Requirements: 1.4_

  - [x] 3.5 Implement `lib/delivery/generators/contentGenerator.ts`
    - Generate content briefs and drafts for blog posts, service pages, FAQ sections
    - _Requirements: 1.5_

  - [x] 3.6 Implement `lib/delivery/generators/accessibilityGenerator.ts`
    - Generate ARIA label additions, alt text strings, and color contrast CSS fixes
    - _Requirements: 1.6_

  - [x] 3.7 Implement `lib/delivery/generators/index.ts`
    - Export a `generatorRegistry: Record<string, ArtifactGenerator>` mapping category strings to generator instances
    - Export `getGenerator(category: string): ArtifactGenerator | undefined`
    - Add `delivery_agent: 16384` to `lib/config/thinking-budgets.ts`
    - _Requirements: 1.7, 1.8_

  - [x] 3.8 Write property test for artifact type coverage
    - **Property 1: Artifact type coverage**
    - *For any* Finding with category in {SCHEMA, SEO, SPEED, GBP, CONTENT, ACCESSIBILITY}, `getGenerator(category)` returns a non-null generator and `generate()` returns an artifact with the correct `artifactType`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

- [ ] 4. Validation pipeline
  - [x] 4.1 Implement `lib/delivery/validationPipeline.ts`
    - Implement `runSyntaxCheck(artifact: RawArtifact): ValidationCheckResult` using `JSON.parse`, `node-html-parser`, `acorn`, and regex for PHP
    - Implement `runSchemaCheck(artifact: RawArtifact): Promise<ValidationCheckResult>` calling Google Rich Results Test API
    - Implement `runLighthouseCheck(artifact: RawArtifact): Promise<ValidationCheckResult>` using Lighthouse CI
    - Implement `runValidationPipeline(artifact: RawArtifact): Promise<ValidatedArtifact>` running all applicable checks and setting status to `VALIDATED` or `FAILED_VALIDATION`
    - Implement `createHumanReviewFlag(artifact, reason)` for failed artifacts
    - Implement `computeRejectionRate(tenantId, artifactType?): Promise<number>`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 4.2 Write property test for validation status completeness
    - **Property 2: Validation status completeness**
    - *For any* artifact after `runValidationPipeline` completes, status is exactly `VALIDATED` or `FAILED_VALIDATION`
    - **Validates: Requirements 2.4, 2.5**

  - [x] 4.3 Write property test for rejection rate monotonicity
    - **Property 3: Rejection rate monotonicity**
    - *For any* set of N artifacts, `computeRejectionRate` equals `failedCount / N`
    - **Validates: Requirements 2.6**

- [x] 5. Checkpoint — Ensure generators and validation pipeline tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Delivery packaging
  - [x] 6.1 Implement `lib/delivery/packager.ts`
    - Implement `packageArtifact(artifact: ValidatedArtifact, finding: Finding): ImplementationPackage`
    - Generate plain-language installation instructions via LLM (flash model, no thinking budget)
    - Generate before/after preview strings where applicable
    - Assign estimated impact label from finding's `impactScore`
    - For WordPress-eligible findings, call `generator.generateWordPressPlugin()` and attach to package
    - _Requirements: 3.1, 3.4_

  - [x] 6.2 Implement `lib/delivery/bundler.ts`
    - Implement `assembleBundle(packages: ImplementationPackage[], proposalId: string): Promise<DeliveryBundle>`
    - Use `archiver` npm package to create ZIP buffer
    - Generate README content listing all artifacts with finding titles, impact, and instruction summaries
    - Implement `uploadBundle(bundle: DeliveryBundle): Promise<string>` uploading to GCS via `lib/storage.ts`
    - Persist `DeliveryBundle` record and update `DeliveryTask.bundleId` and `DeliveryTask` status
    - _Requirements: 3.2, 3.3, 3.5_

  - [x] 6.3 Write property test for implementation package completeness
    - **Property 4: Implementation package completeness**
    - *For any* validated artifact, `packageArtifact` returns a package where all four required fields are non-null and non-empty
    - **Validates: Requirements 3.1**

  - [x] 6.4 Write property test for delivery bundle integrity
    - **Property 5: Delivery bundle integrity**
    - *For any* set of packages, the assembled bundle's `artifactCount` equals the number of packages, and the ZIP contains a README entry
    - **Validates: Requirements 3.2, 3.3**

- [ ] 7. Delivery LangGraph subgraph
  - [x] 7.1 Implement `lib/graph/delivery-graph.ts`
    - Define `DeliveryState` annotation with `findings`, `proposalSections`, `artifacts`, `packages`, `bundle`, `validationSummary`, `tenantId`, `proposalId`
    - Implement nodes: `generate_artifact`, `validate_artifact`, `package_artifact`, `assemble_bundle`, `upload_bundle`
    - Wire the graph: `generate_artifact → validate_artifact → package_artifact → assemble_bundle → upload_bundle`
    - Export `deliveryGraph` compiled StateGraph
    - _Requirements: 1.1–1.8, 2.1–2.7, 3.1–3.6_

  - [x] 7.2 Replace stub in `lib/pipeline/deliveryEngine.ts`
    - Replace the stub `dispatchToAgent` body with a call to `deliveryGraph.invoke()`
    - Pass finding data and proposal sections as input state
    - Store returned `bundle.zipUrl` on the `DeliveryTask` record
    - _Requirements: 3.5_

- [ ] 8. Adversarial QA node
  - [x] 8.1 Implement `lib/graph/adversarial-qa-graph.ts`
    - Define `AdversarialQAState` annotation
    - Implement `hallucination_sweep` node: prompts LLM with `thinkingBudget: 8192` to enumerate and cross-reference all factual claims against raw evidence; returns `hallucinationFlags[]`
    - Implement `consistency_check` node: prompts LLM to compare recommendations vs findings and ROI claims vs impact scores; returns `consistencyFlags[]`
    - Implement `competitor_fairness` node: prompts LLM to verify competitor claims against `comparisonReport` evidence timestamps; returns `competitorFairnessFlags[]`
    - Implement `apply_confidence_and_soften` node: calls `confidenceScorer` for each finding, applies `softenLanguage` to LOW-confidence claims, produces `hardenedContent`
    - Wire: `hallucination_sweep → consistency_check → competitor_fairness → apply_confidence_and_soften`
    - Export `adversarialQAGraph` compiled StateGraph
    - Add `adversarial_qa: 8192` to `lib/config/thinking-budgets.ts`
    - _Requirements: 4.1–4.5, 5.1–5.4, 6.1–6.4, 7.1–7.4_

  - [x] 8.2 Integrate `adversarial_qa` into `lib/graph/diagnosis-graph.ts`
    - Add `adversarialQAGraph.invoke()` call after `validate_diagnosis` node
    - Pass `hardenedContent` back into the diagnosis state
    - Persist `AdversarialQARun` record
    - _Requirements: 4.5_

  - [x] 8.3 Integrate `adversarial_qa` into `lib/graph/proposal-graph.ts`
    - Add `adversarialQAGraph.invoke()` call after `validate_claims` node
    - Apply `hardenedContent` to `executiveSummary` before `format_output`
    - Persist `AdversarialQARun` record
    - Block proposal from being set to `READY` if QA run is `INCOMPLETE`
    - _Requirements: 4.5, 10.6_

  - [x] 8.4 Write property test for hallucination sweep coverage
    - **Property 6: Hallucination sweep coverage**
    - *For any* content string containing a planted claim with no matching evidence pointer, `hallucination_sweep` must include that claim in `hallucinationFlags`
    - **Validates: Requirements 4.1, 4.2**

  - [x] 8.5 Write property test for no unattributed claims in READY proposals
    - **Property 11: No unattributed claims in READY proposals**
    - *For any* proposal that passes the adversarial QA node, every factual claim in the executive summary has a traceable finding ID
    - **Validates: Requirements 10.6**

- [x] 9. Checkpoint — Ensure delivery graph and adversarial QA tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Hallucination telemetry
  - [x] 10.1 Implement `lib/telemetry/hallucinationTelemetry.ts`
    - Implement `logHallucination(event: HallucinationEvent): Promise<void>` writing to `HallucinationLog` with `weekStart` truncated to Monday
    - Implement `computeWeeklyRate(tenantId, weekStart): Promise<WeeklyHallucinationReport>` computing `caughtHallucinations / totalClaims`
    - Implement `checkRateAlert(tenantId): Promise<boolean>` returning true if 7-day rate > 0.05
    - Wire `checkRateAlert` to send email via `lib/notifications/email.ts` when threshold exceeded
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 10.2 Write property test for hallucination log consistency
    - **Property 10: Hallucination log consistency**
    - *For any* `AdversarialQARun`, `totalFlagged` equals `hallucinationFlags.length + consistencyFlags.length + competitorFlags.length`
    - **Validates: Requirements 9.1**

  - [x] 10.3 Write property test for weekly rate computation
    - **Property (rate): Weekly hallucination rate**
    - *For any* set of N total claims and M caught hallucinations, `computeWeeklyRate` returns `rate = M / N`
    - **Validates: Requirements 9.2**

- [ ] 11. Confidence score display in proposals
  - [x] 11.1 Update `lib/proposal/executiveSummary.ts` to accept and embed confidence labels
    - After adversarial QA runs, annotate each metric/claim in the executive summary with its confidence label inline (e.g., "(measured)" or "(modeled)")
    - _Requirements: 7.5_

  - [x] 11.2 Add confidence distribution query to `lib/scoring/reportCard.ts`
    - Add `getConfidenceDistribution(tenantId): Promise<{high: number, medium: number, low: number}>` querying `Finding.confidenceLevel` counts
    - _Requirements: 7.6_

- [ ] 12. Red team evaluation dataset and CI gate
  - [x] 12.1 Create `tests/red-team/fixtures/` directory with 50 adversarial test case JSON files
    - 10 cases: sites with hidden redirects (planted claim: redirect destination is the canonical URL)
    - 10 cases: sites with fake schema markup (planted claim: schema is valid when it is not)
    - 10 cases: sites where competitors are genuinely better (planted claim: prospect outperforms competitor)
    - 10 cases: sites with no real issues (planted claim: critical issues exist when none do)
    - 10 cases: ambiguous data with multiple valid interpretations (planted claim: one interpretation stated as fact)
    - Each fixture must include: `id`, `description`, `category`, `seedHallucination`, `mockFindings`, `mockEvidence`, `expectedFlags`, `passCriteria`
    - _Requirements: 8.1, 8.4, 8.5_

  - [x] 12.2 Implement `tests/red-team/adversarialQA.eval.ts`
    - Load all 50 fixtures from `tests/red-team/fixtures/`
    - For each fixture, invoke `adversarialQAGraph` with mock findings and evidence
    - Assert that `expectedFlags` substrings appear in the flagged claims output
    - Compute overall pass rate and assert ≥ 90%
    - _Requirements: 8.2, 8.3_

  - [x] 12.3 Write property test for red team pass rate gate
    - **Property 9: Red team pass rate gate**
    - *For any* run of the 50 red team fixtures, the pass rate must be ≥ 0.90
    - **Validates: Requirements 8.3, 10.4**

- [ ] 13. API endpoints
  - [x] 13.1 Create `app/api/delivery/[proposalId]/bundle/route.ts`
    - `GET`: Return the `DeliveryBundle` record (zipUrl, status, artifactCount) for a proposal
    - `POST`: Trigger bundle assembly for a proposal (calls `deliveryGraph.invoke()`)
    - Auth: require tenant membership
    - _Requirements: 3.2, 3.5_

  - [x] 13.2 Create `app/api/delivery/[proposalId]/artifacts/route.ts`
    - `GET`: Return all `GeneratedArtifact` records for a proposal with their validation status and confidence level
    - _Requirements: 2.5, 7.1–7.3_

  - [x] 13.3 Create `app/api/admin/hallucination-telemetry/route.ts`
    - `GET`: Return weekly hallucination rate data for the trailing 12 weeks (for dashboard chart)
    - _Requirements: 9.2, 9.3_

  - [x] 13.4 Create `app/api/admin/human-review/route.ts`
    - `GET`: Return pending `HumanReviewFlag` records for the tenant
    - `PATCH`: Update a flag status to `approved` or `rejected`
    - _Requirements: 2.7_

- [x] 14. Final checkpoint — Ensure all tests pass and exit criteria are met
  - Run `vitest --run` and verify all property tests, unit tests, and the red team eval pass
  - Verify that `tests/red-team/adversarialQA.eval.ts` reports ≥ 90% pass rate
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The red team eval (`tests/red-team/adversarialQA.eval.ts`) is a required CI gate — it must pass before any release
- Property tests use `fast-check` with minimum 100 iterations per test
- Each property test file includes a comment: `// Feature: agentic-delivery-qa-hardening, Property N: {property_text}`
- The `archiver` npm package must be added to `package.json` for ZIP assembly
- `node-html-parser` and `acorn` must be added to `package.json` for syntax validation
- Google Rich Results Test API requires `GOOGLE_SEARCH_CONSOLE_API_KEY` env var
- Lighthouse CI requires `LHCI_TOKEN` env var (can be skipped in dev with `VALIDATED_PARTIAL` fallback)
