# Requirements Document

## Introduction

Sprint 10 extends the Autonomous Proposal Engine with two major capabilities:

1. **Agentic Delivery** — a new `delivery_agent` LangGraph subgraph that takes audit findings and approved proposal sections as input and generates concrete, validated, ready-to-install code and content artifacts (JSON-LD schema snippets, HTML meta tags, optimization scripts, GBP content drafts, content briefs, and ARIA/accessibility fixes). Each artifact is packaged with installation instructions, a before/after preview, and an estimated impact score, then bundled into a downloadable ZIP with a README.

2. **Adversarial QA Hardening** — a new `adversarial_qa` LangGraph node that runs after every diagnosis and proposal generation pass. It performs three deliberate fact-checking sweeps (hallucination detection, consistency checking, and competitor fairness), assigns a confidence score (HIGH / MEDIUM / LOW) to every finding and claim, softens low-confidence language automatically, and logs all caught hallucinations for weekly telemetry reporting.

Together these features ensure that every word delivered to a client is true, every artifact is installable, and the system can prove it.

## Glossary

- **Delivery_Agent**: The new LangGraph subgraph responsible for generating, validating, and packaging code/content artifacts from audit findings.
- **Adversarial_QA**: The new LangGraph node that performs hallucination sweeps, consistency checks, and competitor fairness checks on all generated content.
- **Artifact**: A single generated output unit — a JSON-LD snippet, HTML block, script, content draft, or ARIA fix — tied to one finding.
- **Implementation_Package**: The per-finding bundle containing an artifact, installation instructions, before/after preview, and estimated impact.
- **Delivery_Bundle**: The full ZIP archive containing all Implementation_Packages plus a README for a given proposal acceptance.
- **Confidence_Score**: A three-level label (HIGH, MEDIUM, LOW) assigned to every finding and claim, indicating the strength of the underlying evidence.
- **Hallucination**: Any factual claim in a diagnosis or proposal that cannot be traced to raw audit data.
- **Validation_Pipeline**: The sequential checks (syntax, schema, Lighthouse dry-run, human-in-the-loop flag) that every generated artifact must pass before delivery.
- **Red_Team_Dataset**: The 50 adversarial test cases used as a CI gate to verify the Adversarial_QA node catches seeded hallucinations.
- **Finding**: A Prisma `Finding` record produced by an audit module, carrying category, evidence, metrics, and impact score.
- **WordPress_Plugin**: An auto-generated `.php` plugin file that applies common fixes (schema, meta tags) to a WordPress site.

---

## Requirements

### Requirement 1: Delivery Agent — Artifact Generation

**User Story:** As an agency operator, I want the system to automatically generate ready-to-install code and content artifacts for each audit finding, so that clients receive concrete fixes rather than just recommendations.

#### Acceptance Criteria

1. WHEN the Delivery_Agent receives a Finding of category `SCHEMA`, THE Delivery_Agent SHALL generate a valid JSON-LD snippet using one of the LocalBusiness, FAQPage, or Review schema types appropriate to the finding context.
2. WHEN the Delivery_Agent receives a Finding of category `SEO` with missing or suboptimal meta tags, THE Delivery_Agent SHALL generate HTML meta tag blocks covering title, description, and Open Graph tags for the affected pages.
3. WHEN the Delivery_Agent receives a Finding of category `SPEED` or `PERFORMANCE`, THE Delivery_Agent SHALL generate optimization scripts covering at least one of: image compression, lazy loading, or CSS minification.
4. WHEN the Delivery_Agent receives a Finding of category `GBP`, THE Delivery_Agent SHALL generate GBP content drafts covering at least one of: business description, categories, Q&A entries, or post copy.
5. WHEN the Delivery_Agent receives a Finding of category `CONTENT`, THE Delivery_Agent SHALL generate a content brief or draft covering the identified content gap (blog post, service page, or FAQ section).
6. WHEN the Delivery_Agent receives a Finding of category `ACCESSIBILITY`, THE Delivery_Agent SHALL generate ARIA label additions, alt text strings, or color contrast CSS fixes appropriate to the finding.
7. THE Delivery_Agent SHALL use a thinking budget of 16,384 tokens for artifact generation to support complex code reasoning.
8. WHEN the Delivery_Agent generates an artifact, THE Delivery_Agent SHALL include the finding ID, artifact type, and generation timestamp in the artifact metadata.

---

### Requirement 2: Code Validation Pipeline

**User Story:** As an agency operator, I want every generated artifact to be automatically validated before delivery, so that clients never receive broken or invalid code.

#### Acceptance Criteria

1. WHEN an artifact is generated, THE Validation_Pipeline SHALL perform a syntax check to verify the artifact parses without errors for its declared type (JSON, HTML, JavaScript, PHP).
2. WHEN an artifact is of type JSON-LD schema, THE Validation_Pipeline SHALL validate it against Google's Rich Results Test API and record the pass/fail result.
3. WHEN an artifact is of type speed optimization script, THE Validation_Pipeline SHALL perform a Lighthouse dry-run simulation and record whether the projected score improves.
4. WHEN an artifact fails any validation check, THE Validation_Pipeline SHALL mark the artifact status as `FAILED_VALIDATION`, record the failure reason, and flag it for human review.
5. WHEN an artifact passes all applicable validation checks, THE Validation_Pipeline SHALL mark the artifact status as `VALIDATED`.
6. THE Validation_Pipeline SHALL track and expose a rejection rate metric: the percentage of generated artifacts that fail at least one validation check, queryable per tenant and per artifact type.
7. WHEN an artifact is flagged for human review, THE Validation_Pipeline SHALL create a human-in-the-loop review record linked to the artifact and the originating finding.

---

### Requirement 3: Delivery Packaging

**User Story:** As an agency operator, I want each validated artifact packaged with installation instructions and impact estimates, so that non-technical clients can implement fixes without developer help.

#### Acceptance Criteria

1. WHEN an artifact is validated, THE Delivery_Agent SHALL produce an Implementation_Package containing: the artifact content, plain-language installation instructions (copy-paste ready), a before/after preview where applicable, and an estimated impact label.
2. WHEN all Implementation_Packages for a proposal acceptance are ready, THE Delivery_Agent SHALL assemble a Delivery_Bundle as a ZIP archive containing all packages plus a README file.
3. THE README in the Delivery_Bundle SHALL list every included artifact, its finding title, its estimated impact, and its installation instructions summary.
4. WHEN a finding is addressable by a WordPress plugin, THE Delivery_Agent SHALL generate a WordPress_Plugin `.php` file and include it in the Implementation_Package alongside the standard artifact.
5. WHEN a Delivery_Bundle is assembled, THE Delivery_Agent SHALL upload it to GCS and store the download URL on the associated `DeliveryTask` record.
6. THE Delivery_Agent SHALL generate Delivery_Bundles for at least the top 6 finding categories: SCHEMA, SEO, SPEED, GBP, CONTENT, and ACCESSIBILITY.

---

### Requirement 4: Adversarial QA — Hallucination Sweep

**User Story:** As an agency operator, I want every factual claim in a diagnosis or proposal to be cross-referenced against raw audit data, so that no unsupported claim reaches a client.

#### Acceptance Criteria

1. WHEN a diagnosis or proposal is generated, THE Adversarial_QA node SHALL run a Hallucination Sweep that cross-references every factual claim against the raw audit evidence.
2. WHEN a factual claim has no traceable source in the raw audit data, THE Adversarial_QA node SHALL flag the claim for removal or replacement and record it as a caught hallucination.
3. THE Adversarial_QA node SHALL use a thinking budget of 8,192 tokens to support deliberate fact-checking reasoning.
4. WHEN the Hallucination Sweep completes, THE Adversarial_QA node SHALL return a structured result listing each flagged claim, its location in the document, and the reason it was flagged.
5. THE Adversarial_QA node SHALL run AFTER every diagnosis graph execution and AFTER every proposal graph execution, before the output is persisted.

---

### Requirement 5: Adversarial QA — Consistency Check

**User Story:** As an agency operator, I want the system to verify that findings, recommendations, and ROI claims are internally consistent, so that proposals do not contradict themselves.

#### Acceptance Criteria

1. WHEN the Adversarial_QA node runs a Consistency Check, THE Adversarial_QA node SHALL compare findings against recommendations and flag any recommendation that does not correspond to a finding.
2. WHEN the Adversarial_QA node runs a Consistency Check, THE Adversarial_QA node SHALL compare ROI claims against the findings they reference and flag any ROI claim that overstates the measured impact by more than the allowed modeling tolerance.
3. WHEN a consistency mismatch is detected, THE Adversarial_QA node SHALL record the mismatch type, the conflicting elements, and a suggested correction.
4. THE Adversarial_QA node SHALL run the Consistency Check as the second of three adversarial passes, after the Hallucination Sweep.

---

### Requirement 6: Adversarial QA — Competitor Fairness

**User Story:** As an agency operator, I want competitor comparisons to be factually accurate and based on current data, so that the agency is not exposed to false advertising claims.

#### Acceptance Criteria

1. WHEN the Adversarial_QA node runs a Competitor Fairness check, THE Adversarial_QA node SHALL verify that all competitor data referenced in the proposal was collected during the current audit run.
2. WHEN a competitor claim cannot be verified against current audit evidence, THE Adversarial_QA node SHALL flag the claim and suggest softening language (e.g., "as of last audit" qualifier).
3. WHEN the Adversarial_QA node runs a Competitor Fairness check, THE Adversarial_QA node SHALL verify that no competitor is described as worse than the audit data supports.
4. THE Adversarial_QA node SHALL run the Competitor Fairness check as the third of three adversarial passes, after the Consistency Check.

---

### Requirement 7: Confidence Scoring

**User Story:** As a client reviewing a proposal, I want every finding and claim to display a confidence level, so that I can distinguish between measured facts and modeled estimates.

#### Acceptance Criteria

1. THE Delivery_Agent SHALL assign a Confidence_Score of HIGH to every finding whose claim is directly supported by a raw data measurement in the audit evidence.
2. THE Delivery_Agent SHALL assign a Confidence_Score of MEDIUM to every finding whose claim is inferred from indirect signals or benchmarks.
3. THE Delivery_Agent SHALL assign a Confidence_Score of LOW to every finding whose claim is estimated or modeled without direct measurement.
4. WHEN a finding or claim has a Confidence_Score of LOW, THE Delivery_Agent SHALL automatically apply softened language (e.g., replace "your traffic loss is $2,400/month" with "estimated monthly traffic impact: ~$2,400 (modeled)").
5. WHEN a proposal is rendered, THE Proposal SHALL display the Confidence_Score inline next to each claim (e.g., "Your page speed is 34 (measured)" vs "estimated monthly traffic loss: ~$2,400 (modeled)").
6. THE Dashboard SHALL display a confidence distribution chart showing the breakdown of HIGH / MEDIUM / LOW confidence findings across all audits for a tenant.

---

### Requirement 8: Red Team Evaluation Dataset

**User Story:** As an engineering lead, I want a suite of adversarial test cases that exercise the system's hallucination detection, so that I can gate releases on proven QA accuracy.

#### Acceptance Criteria

1. THE Red_Team_Dataset SHALL contain at least 50 adversarial test cases covering: sites with hidden redirects, sites with fake schema markup, sites where competitors are genuinely better, sites with no real issues, and sites with ambiguous data admitting multiple valid interpretations.
2. WHEN the CI pipeline runs, THE Red_Team_Dataset SHALL be executed against the Adversarial_QA node and the pass rate SHALL be computed.
3. IF the Adversarial_QA node catches fewer than 90% of seeded hallucinations in the Red_Team_Dataset, THEN the CI pipeline SHALL fail and block the release.
4. THE Red_Team_Dataset SHALL be stored as structured test fixtures in the repository and versioned alongside the code.
5. WHEN a new adversarial test case is added to the Red_Team_Dataset, THE test case SHALL include: a description, the seeded hallucination or edge condition, the expected Adversarial_QA output, and the pass/fail criterion.

---

### Requirement 9: Hallucination Telemetry

**User Story:** As an engineering lead, I want hallucination events logged and trended over time, so that I can track whether the system is improving and alert on regressions.

#### Acceptance Criteria

1. WHEN the Adversarial_QA node catches a hallucination, THE Hallucination_Telemetry system SHALL log the event with: audit ID, proposal ID (if applicable), hallucination category (data fabrication, metric inflation, false competitor claim, unsupported recommendation), the flagged text, and the timestamp.
2. THE Hallucination_Telemetry system SHALL compute a weekly hallucination rate: the number of caught hallucinations divided by the total number of factual claims processed in that week.
3. THE Dashboard SHALL display a hallucination rate trend chart showing weekly rates over the trailing 12 weeks.
4. IF the hallucination rate on production audits exceeds 5% in any rolling 7-day window, THEN the Hallucination_Telemetry system SHALL trigger an alert to the tenant admin.
5. THE system SHALL target a hallucination rate below 2% on production audits as a long-term quality goal (tracked but not a hard gate).

---

### Requirement 10: Exit Criteria Validation

**User Story:** As an engineering lead, I want automated checks that verify all Sprint 10 exit criteria are met before a release is approved, so that the release process is objective and repeatable.

#### Acceptance Criteria

1. THE Validation_Pipeline SHALL verify that code generation produces valid artifacts for all 6 finding categories (SCHEMA, SEO, SPEED, GBP, CONTENT, ACCESSIBILITY) in the CI test suite.
2. THE Validation_Pipeline SHALL verify that at least 95% of generated artifacts pass syntax validation in the CI test suite.
3. THE Validation_Pipeline SHALL verify that JSON-LD schema artifacts validate against Google's Rich Results Test in the CI test suite.
4. THE Adversarial_QA node SHALL catch at least 90% of seeded hallucinations in the Red_Team_Dataset CI gate (per Requirement 8.3).
5. THE system SHALL verify that every finding and claim in a generated proposal has an assigned Confidence_Score before the proposal is marked READY.
6. THE system SHALL verify that no proposal marked READY contains an unattributed factual claim (a claim with no traceable finding ID or evidence pointer).
7. THE Delivery_Agent SHALL verify that Delivery_Bundle ZIP files generate correctly with a valid README in the CI test suite.
