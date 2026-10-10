# ProposalOS first-revenue plan

**Status:** operator-assisted pilot hypothesis; not ready for sale.
**Evidence snapshot:** 2026-10-10 00:25 UTC — updated 2026-10-10 06:05 UTC (joined journey qualified)
**Source snapshot:** PR #6 head 4284e9c + execution branch `execution/glm53-core-journey-20261009` (see branch log).

## Initial customer and delivery path

Start with owner-operated HVAC contractors in one US metro. This is a segment hypothesis, not validated demand. An existing home-services playbook could support a narrow website/local-presence review, but no completed audit demonstrates customer value yet. Begin with direct, operator-assisted fulfillment. Agency resale remains a later channel after repeatable delivery; Canada is a separate future geography test, not combined demand evidence.

## Offer and pricing hypothesis

**Working offer:** a review of one owner-authorized HVAC contractor website and its local-presence information; a concise report of dated, evidence-linked observations; prioritized remediation steps; and one operator-led review call. Exclude implementation, rankings or lead guarantees, unsupported competitor comparisons, invented financial impact, and ongoing monitoring.

**Internal price-test hypothesis:** USD $500 for a fixed-scope one-time review. This is only a discovery anchor, not market validation, a published price, a quote, or permission to charge. The earlier CAD $500 idea remains a separate unvalidated Canadian hypothesis and is not evidence for US willingness to pay. Confirm scope, taxes, seller identity, agreement, refund/correction terms, delivery time, and fulfillment capacity before offering a price to anyone.

## Fulfillment and acceptance

1. Obtain an opt-in introduction and written authorization for the target website and scope.
2. Confirm the owner’s goals, service area, customer-provided constraints, and permitted data.
3. Run only after the source/runtime, disposable data-path, SSRF/egress, and provider-budget gates are satisfied.
4. A human reviews each evidence source, finding, recommendation, price, and claim. Withhold results for degraded or unsupported evidence.
5. Deliver privately with a review call. Record corrections and approval. Measure operator time and the same evidence again only with customer authorization.
6. Use a manually reviewed agreement and invoice process. No autonomous checkout, charge, email, or fulfillment has been qualified.

## Warm/design-partner activation sequence

This sequence is prepared but not authorized or started. First produce a validated demonstration and pass the safety gates. Then have the owner identify a small number of existing warm paths without scraping or buying lists; approve one introduction message and the intended recipient; proceed only after the recipient opts into a conversation; obtain written authorization for the specific website and collection scope; and confirm the offer, terms, and delivery date before any work. The owner must separately approve any customer-facing message or commitment. No outreach has occurred.

## Lightweight funnel tracker

Counts below are current as of this report. Track prospects by an internal alias until they consent; store authorization evidence and a next-action date, not unneeded personal data.

| Stage                                   | Current | Exit evidence                                               |
| --------------------------------------- | ------: | ----------------------------------------------------------- |
| Owner-approved warm-path candidates     |       0 | Owner identifies a legitimate introduction path             |
| Opt-in discovery conversations          |       0 | Prospect agrees to discuss the bounded review               |
| Authorized HVAC website and scope       |       0 | Written domain, collection boundary, and goal authorization |
| Completed, evidence-reviewed real audit |       0 | Traceable sources and human-checked findings                |
| QA-reviewed proposal delivered          |       0 | Proposal passes factual, scope, and quality review          |
| Accepted / paid pilot                   |       0 | Signed terms and manually verified payment                  |

## Current readiness

- Validated segment or customer demand: **none**
- Disposable PostgreSQL migration/RLS/queue qualification: **passed on CI run 38008270296**
- Joined audit-to-proposal journey: **VERIFIED 2026-10-10 as a controlled fixture journey** (`CONTROLLED_JOINED_JOURNEY_VERIFIED`): intake → durable worker → 23-module collection → 48 evidence-backed findings → trusted diagnosis → READY proposal (QA 86/100) → authenticated review → secure token view → 8-page PDF. Model responses were deterministic fixtures (labeled; no real inference). Latency ~62 s; tracked provider cost 17 cents (fixture accounting). Eight real product defects found and fixed en route (see the execution report append).
- Complete real audits and accepted proposals: **0**
- Demonstration deliverable with independently scored QA: **fixture-quality demonstration exists** (the journey PDF); an independently scored real-evidence deliverable does not
- Approved warm/design-partner cohort or outreach: **none**
- Funnel: **0** through every stage; the activation sequence is not started
- Agreement, invoice, and payment path: **not qualified**
- Fulfillment effort, latency, and cost: **fixture-journey measured** (~62 s, 17 cents tracked, single operator review needed); real-audit economics still unmeasured

No outreach, customer contact, charge, or commitment was made. The public sample report is synthetic and cannot serve as proof of delivery; the fixture-journey deliverable is a controlled demonstration, not customer evidence.

## Minimum path to the first paid pilot

1. ~~Build and pass the joined fixture-journey test~~ **DONE 2026-10-10** (`CONTROLLED_JOINED_JOURNEY_VERIFIED`). Resolve the source dependency-policy blocker before release acceptance.
2. Replace fixture inference with authorized real Bedrock inference on the same fixture (owner approves identity, model, region, and a small fixed cost ceiling); keep the same QA thresholds and record model/latency/cost.
3. Qualify one authorized US HVAC website with a bounded network policy and explicit provider/model cost ceiling; complete a real audit and human-review every finding and the proposal.
4. Have the owner approve a warm introduction only after the demo, scope, agreement, privacy/retention terms, and fulfillment capacity are ready.
5. Invoice manually only after seller, tax, refund, payment, and delivery details are verified and the customer accepts the terms.

Do not use the USD or CAD hypothesis in public copy until willingness to pay and delivery economics are tested.
