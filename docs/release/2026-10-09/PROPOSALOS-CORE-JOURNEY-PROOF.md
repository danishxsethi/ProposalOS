# ProposalOS core-journey proof

**Evidence snapshot:** 2026-10-10 00:05 UTC
**Code/test head:** 627fe1db61643cb86d8f8cc7c2db22164095c47e on codex/clean-release-candidate-20261009
**Journey verdict:** CORE_JOURNEY_BLOCKED
**Completed end-to-end journeys:** 0

## Journey status

| Step                                     | Verified evidence                                                                                                                                                                 | Result                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Business intake and URL validation       | The authenticated POST /api/audit route validates input, persists a queued audit, and dispatches durable work. Its integration test mocks auth, Prisma, extraction, and dispatch. | Route behavior covered; no joined journey |
| Data collection and evidence persistence | No worker was run on an authorized target or controlled HTTP fixture. Public Claraud scan intake remains disabled.                                                                | NOT RUN                                   |
| Diagnosis                                | The diagnosis route requires a COMPLETE, TRUSTED audit, evidence snapshots, and complete module status. Existing tests mock persistence and graph calls.                          | Unit/route coverage only                  |
| Proposal and QA                          | Proposal auto-ready tests exercise route status logic, but mock Prisma and the proposal compiler/QA boundary. No proposal was generated from an audit run.                        | Fixture unit evidence only                |
| Authenticated preview                    | No preview was rendered from a persisted journey in this session.                                                                                                                 | NOT RUN                                   |
| Public secure view or PDF                | No share link was created or resolved, and no PDF was generated or inspected.                                                                                                     | NOT RUN                                   |
| Recorded next action                     | No customer follow-up, email, payment, or external action was performed.                                                                                                          | NOT RUN                                   |

On exact head 627fe1db61643cb86d8f8cc7c2db22164095c47e, Test Suite run 38006971578 passed clean-database migration replay and the deterministic suite: 278 test files and 2,847 tests passed. This includes the disposable PostgreSQL/PgBouncer RLS and queue qualification that previously failed to connect. The correction uses an IPv4 PgBouncer endpoint and an authenticated app_user SQL preflight. It proves the isolated CI database path, not production parity or the full customer journey.

## Safety boundary and first blocker

The existing Playwright file tests/e2e/critical-flows.test.ts is not a safe fixture journey to run as written: it targets example.com and ten external domains and includes a test-email flow. It was not run. Do not use it against a live site or email service. The public Claraud scan intake returns 503 by design while browser egress is unqualified.

The smallest product blocker is the absence of a controlled end-to-end harness that connects the actual intake, durable worker, evidence persistence, trusted diagnosis, proposal QA, authenticated preview, and safe delivery against disposable tenant data. Current route tests cover these boundaries separately with mocked persistence and providers; they cannot demonstrate the whole chain. No live Bedrock call was made because there is no approved inference budget, and arbitrary browser egress has not been qualified.

## Counts and measurements

- Real non-mocked business audit runs: **0**
- Complete fixture route journeys: **0**
- Real provider/Bedrock calls: **0**
- Genuine proposals produced from an audit run: **0**
- Independently scored proposal QA results: **0**
- Candidate journey latency and provider cost: **not measured**
- Customer-ready PDF or secure viewer artifact: **none**

The public sample report is synthetic and explicitly does not represent an audited business. Historical R4/R7 records are not this candidate’s evidence: each reported one degraded audit, zero trusted audits, and zero proposals.

## Minimum next proof

1. Add a controlled fixture test that invokes the real intake/API handlers and durable worker against the CI disposable database while stubbing outbound collection/model calls and disabling email, billing, outreach, and external jobs.
2. Carry the same persisted fixture through evidence persistence, diagnosis, proposal QA, authenticated preview, and a locally generated PDF or validated secure web response.
3. Record every stub explicitly; this would prove a fixture journey only. Migration replay, RLS, and queue tests now pass separately, but they do not join this full product path.
4. Separately authorize a property, network boundary, Bedrock model, and inference-cost ceiling before the first real audit. Review and score that proposal before calling it accepted.

Until a joined fixture journey passes, the core journey remains blocked. A real audit or customer-ready proposal has not been demonstrated.
