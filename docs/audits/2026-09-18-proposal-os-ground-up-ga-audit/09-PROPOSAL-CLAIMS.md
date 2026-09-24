# Proposal & Claim Integrity

## Implemented

- Deterministic pricing code and tier mapping surround LLM proposal content.
- Claim contracts, evidence/finding citations, grounding validation, and publication assertions exist.
- Proposal schema validation and adversarial QA exist.

## Findings

- Grounding support uses limited token/numeric overlap rather than robust sentence-level entailment.
- Grounding bindings do not cover every customer-facing section, including assumptions/disclaimers/next steps and all rendered comparison/visual content.
- HTTP and worker proposal paths pass different evidence/comparison inputs.
- QA readiness has multiple competing thresholds and human-review semantics.
- Public proposal response serializes complete finding content; email finder can place discovered contact data in findings.
- Public status mutation accepts lifecycle statuses without authenticated agency authorization or dedicated acceptance proof.
- Acceptance tier vocabulary conflicts with proposal/checkout tier vocabulary (`starter/professional/enterprise/custom` vs `essentials/growth/premium`).

**State:** `WORKING_WITH_LIMITATIONS`.

**Required policy:** separate observed, derived, benchmarked, estimated, recommendation, commercial offer, guarantee, and unsupported claims in data and rendering. Pricing, SKU, discounts, taxes, payment IDs, and permissions remain deterministic and server-authoritative.
