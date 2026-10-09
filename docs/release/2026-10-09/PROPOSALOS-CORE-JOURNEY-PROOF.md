# ProposalOS core-journey proof

**Candidate source:** `75f1c5dcf412b5b37339dd438fda9d5db809e7c3` on `codex/final-ci-qualification`<br>
**Qualification status:** no current end-to-end customer journey is qualified.

## Journey status

| Step | Evidence in this session | Status |
|---|---|---|
| Create or choose a business | No authenticated tenant/database journey executed | NOT RUN |
| Submit an authorized website URL | Claraud public scan intake is deliberately disabled and returns 503 | BLOCKED BY DESIGN |
| Collect evidence and run audit modules | No approved properties, disposable database, or live provider invocation | NOT RUN |
| Produce diagnosis and a three-tier proposal | No live audit result; no proposal artifact generated | NOT RUN |
| Review evidence, scope, and claims | Unit and source checks cover trust boundaries only; no real report review | NOT QUALIFIED |
| Securely share or download | Resolver/revocation unit coverage passed; no live share created, no actual PDF verified. Claraud PDF action says unavailable | PARTIAL SOURCE EVIDENCE |
| Record customer follow-up | No email, direct message, payment, or customer record created | NOT RUN |

## What was verified

The focused local suite passed **47 tests across 10 files** on Node 24. It includes fail-closed Claraud public routes, synthetic sample-report labeling, cache namespace clearing, canonical proposal path handling, proposal share-token revocation and route authorization, revoked-token resolution, Stripe checkout authorization, and SSRF/auth architecture boundaries. All provider and persistence behavior in these tests is mocked or source-inspected; this is not a live product run.

The revocation tests cover the super-admin route, rate-limited entry point, no-store dry run, explicit apply confirmation, exact target snapshot, tenant/proposal identity binding, audit record, idempotency, conflict handling, and invalidation through the resolver. The source Prisma wrapper places model queries inside the current interactive transaction. The unit test propagates audit-write failure, but PostgreSQL rollback and actual role middleware were not integration-tested. No revocation was executed against production.

The public sample report is explicitly synthetic and states that no real website was audited. It is suitable only as a UI walkthrough, not as customer evidence. The Claraud report viewer suppresses unverified competitor comparisons and ROI claims, and the PDF control is disabled because no complete PDF path was proven in this session.

## Historical runs are not current acceptance

The preserved R4 and R7 summaries each report one run, zero trusted audits, one degraded audit, zero failed runs, and zero proposals. R4 records 55.358 seconds and $0.14; R7 records 83.101 seconds and $0.14. They are September 28 historical evidence, not runs of source commit `75f1c5d`, and they do not qualify a trusted customer proposal.

## Measured results

- Qualified real audit runs on this candidate: **0**
- Audit modules executed against a real business property: **0**
- Real Bedrock/provider calls: **0**
- Customer proposals produced and independently scored: **0**
- Proposal QA scores: **none**
- Current audit-to-proposal latency or provider cost: **not measured**
- Screenshots or customer-ready PDF artifacts: **none**

No website was audited during this work. There was no approved property list or customer authorization, no isolated PostgreSQL/PgBouncer service, and no completed production-source-to-image provenance. The public scan path remains intentionally paused because browser request interception, DNS rebinding defense, redirect restrictions, private/metadata blocking, and bounded egress have not been proven.

## Exact next qualification sequence

1. Provide an isolated disposable PostgreSQL/PgBouncer test environment and pass migration replay, tenant/RLS, queue ownership, and recovery tests without production data.
2. Approve a small set of representative website properties, permission scope, provider/model use, and a cost ceiling. Do not use customer URLs as tests without approval.
3. Run at least five complete audits across three industries on one reviewed source/image identity; record actual modules, evidence, degraded states, latency, cost, and operator effort.
4. Withhold proposals when evidence or module quality is insufficient. Independently score every output against a written evidence, feasibility, pricing, and claim rubric; the initial target is at least 8/10.
5. Verify proposal viewer, private storage, PDF, revocation, and follow-up in the same tenant context using test data, then repeat the full user journey end to end.

Until those steps pass, the product is **not demo-ready** and no sample report should be represented as a customer result.
