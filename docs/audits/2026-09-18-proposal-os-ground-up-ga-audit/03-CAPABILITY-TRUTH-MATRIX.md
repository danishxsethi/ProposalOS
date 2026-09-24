# Capability Truth Matrix

| Capability | Current implementation | Primary state | Evidence class | Limitation / closure proof |
| --- | --- | --- | --- | --- |
| Business input and audit creation | Authenticated, public, v1, client, batch routes | IMPLEMENTED_NOT_INTEGRATED | REPRODUCED_LOCAL_EVIDENCE | Runtime/provider and live tenant trace absent |
| Business resolution/discovery | URL extraction, Places/Serp modules, discovery cron | PARTIALLY_IMPLEMENTED | REPRODUCED_LOCAL_EVIDENCE | Wrong-business and live lead-source proof absent |
| Canonical audit registry | 27 executable modules and shared manifest | IMPLEMENTED | REPRODUCED_LOCAL_EVIDENCE | Adapter failure states inconsistent |
| Durable audit queue | AuditJob idempotency, retry, lease, heartbeat, worker route | IMPLEMENTED_NOT_INTEGRATED | TEST_EVIDENCE | Running worker and crash recovery unverified |
| Evidence snapshots | Prisma model and runner writes | WORKING_WITH_LIMITATIONS | REPRODUCED_LOCAL_EVIDENCE | Writes non-fatal; schema/provenance not validated transactionally |
| Findings | Runtime contract and persistence boundary | WORKING_WITH_LIMITATIONS | TEST_EVIDENCE | Prisma enum/score mismatch; evidence-less outputs rejected |
| Unknown vs negative | Newer modules model unavailable states | PARTIALLY_IMPLEMENTED | REPRODUCED_LOCAL_EVIDENCE | Citations/PageSpeed still collapse outage into negative |
| Diagnosis | LangGraph clustering, ranking, narrative, validation, QA | WORKING_WITH_LIMITATIONS | REPRODUCED_LOCAL_EVIDENCE | Degraded result returns 200 and may feed proposal |
| Proposal compilation | Tier mapping, pricing, LLM content, schemas | WORKING_WITH_LIMITATIONS | TEST_EVIDENCE | HTTP/background inputs and QA gates diverge |
| Claim grounding | Claim contract, citations, publication predicate | WORKING_WITH_LIMITATIONS | TEST_EVIDENCE | Token-overlap support and incomplete section coverage |
| Proposal QA | `ProposalQAService`, autoQA, adversarial QA | PARTIALLY_IMPLEMENTED | TEST_EVIDENCE | Multiple inconsistent readiness predicates |
| PDF/hosted proposal | Token page, PDF, PPTX export | WORKING_WITH_LIMITATIONS | REPRODUCED_LOCAL_EVIDENCE | Alternate token surfaces differ; runtime origin unverified |
| Controlled delivery | Email provider boundaries and proposal send routes | PARTIALLY_IMPLEMENTED | SOURCE_ONLY | Multiple senders; mock sends stored as SENT |
| Checkout/billing | Stripe checkout, signature webhook, reconciliation | PARTIALLY_IMPLEMENTED | SOURCE_ONLY | Payment/acceptance/fulfillment state not atomic |
| Onboarding | Tenant provisioning and setup routes | PARTIALLY_IMPLEMENTED | SOURCE_ONLY | Checkout session not verified; transaction boundary incomplete |
| Fulfillment | Tasks and delivery graph/engine | EXTERNAL_GATE | DIRECT_RUNTIME_EVIDENCE (source behavior) | Executor unavailable; verification always fails closed |
| Retention/re-audit | Retention cron, graph, scheduled audit source | PARTIALLY_IMPLEMENTED | SOURCE_ONLY | Graph disconnected from route; live cron absent |
| Learning/self-improvement | Win/loss, predictions, prompt promotion source | PARTIALLY_IMPLEMENTED | SOURCE_ONLY | Global scope/placeholder stats; mutation safety unproven |
| Multi-tenancy | Tenant IDs, Prisma extension, RLS migrations | WORKING_WITH_LIMITATIONS | TEST_EVIDENCE | Critical route/header/API-key gaps; live RLS unverified |
| Observability | Pino, metrics, tracing, QA telemetry | IMPLEMENTED_NOT_INTEGRATED | SOURCE_ONLY | Local LangSmith disabled; dashboards/alerts/runtime unknown |
| Backups/restore | Terraform/docs describe backups/PITR | DOCUMENTATION_ONLY | DOCUMENTED_CLAIM | Restore not demonstrated |
| GA deployment | Cloud Build, Docker, Terraform | DEPLOYED_NOT_VERIFIED | DOCUMENTED_CLAIM | No immutable image/revision/traffic evidence |
