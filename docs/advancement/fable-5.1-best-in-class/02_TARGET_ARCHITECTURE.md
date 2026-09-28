# 02 — Target Architecture — Fable 5.1 Best-in-Class

Single Next standalone remains. Planes are logical, not services — minimal moves, maximal clarity.

```
┌─────────────────────────────────────────────────────────────────────┐
│ REQUEST PLANE  browser / public links / API clients                 │
│  →  middleware.ts (CSP nonce+OWASP, CORS, traceparent)             │
│  →  lib/middleware/auth|rateLimit|idempotency + generated           │
│     evidence/route-census.csv gate (per-route withAuth robot)      │
│  →  app/api/* (147 routes)  app/(marketing|dashboard|admin|client) │
└──────────────┬──────────────────────────────────────────────────────┘
               │  tenant context via lib/tenant/context.ts (ALS)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DATA PLANE   prisma: single lib/prisma.ts $extends                  │
│  →  95 models (62 tenantId FORCED RLS, adapter allowlist 4)         │
│  →  same-tx set_config('app.current_tenant_id')                    │
│  →  raw SQL only via Prisma.sql / withRawExecutor(requireTenant)  │
└─────────────────────────────────────────────────────────────────────┘

┌ AUDIT PLANE (input→job→collectors→analyzers→trust) ─────────────────┐
│ input norm (businessName+city+url+placeId)                          │
│  → job admission: checkAndDecrementQuota + FOR UPDATE lock (WS4)    │
│  → lib/audit/dispatch.ts → AuditJob (idempotencyKey+lease/heartbeat)│
│  → /api/worker/audit-job (WORKER_SECRET) + 23 cron sweeps           │
│  → SHARED COLLECTORS (ADV-AUDIT-03): crawlWebsite 20 + safeFetch     │
│     + PageSpeed + Places resolveBusiness + SerpAPI + screenshots    │
│     emitted once as Typed Evidence Vault via Envelope               │
│  → 27 ANALYZERS as typed ModuleIO (ModuleInput → ModuleResult)      │
│     dependency graph, phase 1/2/3, concurrency 6, withTimeout 10-60s │
│  → lib/audit/findingContract.ts + findingPersistence.ts sole writer │
│  → dedup + trustState (TRUSTED/DEGRADED_REVIEW/FAILED)             │
│     COST via costTracker.ts + redisSpendTracker reserve→settle 10m  │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌ INTELLIGENCE PLANE (findings→diagnosis→proposal→gate) ──────────────┐
│ lib/claims/claimContract.ts validateCustomerClaim per span           │
│ lib/graph/diagnosis-graph.ts StateGraph ≤5 clusters cite exact ids   │
│ lib/proposal/compiler.ts:   EnvelopeV1 = collectors                  │
│      + analyzed findings + grounded claims + commercial ruleIds      │
│      + tierMapping  (+ deterministic pricing/timeline/ROI)           │
│      + ProposalQAService + adversarial-qa-graph (retry if halluc>0.3)│
│  → buildProposalGrounding → buildPersistedQaResults                  │
│     publicationFingerprint SHA256 canonical JSON                     │
│  → lib/proposal/publication.ts assertProposalPublishable gate        │
│     (APPROVED + version + fingerprint + eval PASS + hardFails[] +    │
│      grounding valid + claimPolicy valid)  →  READY/SENT/VIEWED…     │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌ COMMERCIAL PLANE (proposal→order→cash) ─────────────────────────────┐
│ Proposal.publicAccessRevokedAt + proposalVersion + commercialFingerprint│
│  → /api/proposal/token/[token]/accept → acceptedCommercialFingerprint │
│  → /api/stripe/checkout-proposal (idempotency proposal-checkout:{fp})│
│     price verify stripe.prices.retrieve exact amount+currency else 409│
│  → checkout-saas (ADD idempotencyKey `${tenant}:${plan}:${period}`)  │
│  → /api/stripe/webhook constructEvent → webhookHandler.ts            │
│     ProcessedWebhookEvent PK dedup + $transaction reservation        │
│     Order/Payment/Project/FulfillmentTask upserts (unique keys)      │
│     5× FailedWebhookEvent retry + reconcile.ts + grace +15d         │
│  CANON pricing: PlanCatalogService (single source; display=charge)   │
└─────────────────────────────────────────────────────────────────────┘

┌ GROWTH PLANE (prospect→enrich→qualify→audit→outreach) ──────────────┐
│ lib/outreach/sprint2/discovery (Places+Yelp+directories, chain     │
│   blocklist 12, dedup), qualification pain 0-100 ≥60, enrichment    │
│   waterfall Apollo→Hunter→Proxycurl→Clearbit + ZeroBounce,          │
│   quality gate ≥90, domainRotation DNS+warmup 10*1.2^d               │
│  → sniperWorker 5-touch sequence sandboxed (LIVE requires           │
│     OUTREACH_LIVE_SENDING + OUTBOUND_DELIVERY_ENABLED + Flag +      │
│     DNS + caps 35/50/100/5000 + blocklist + KILL_SWITCH + approval) │
│  → outboundDelivery idempotency SHA256 + outboundSafety shared lock  │
└─────────────────────────────────────────────────────────────────────┘

┌ OPERATIONS PLANE ───────────────────────────────────────────────────┐
│ OTel (auto-instrumentation + pg) + pino + LangSmith writer           │
│ MetricsRecorder + QATelemetry + auditTrailEvent per mutation         │
│ Dashboards per-tenant SLO / error budget / p95 / cost / bounce      │
│ Alerts → runbooks,  KILL_SWITCH + OUTREACH caps + billing freeze     │
└─────────────────────────────────────────────────────────────────────┘
```

**Collector vs analyzer split (the key structural change):** today 27 modules each re-fetch same origin. Target: 5 collectors (`WebsiteCrawl`, `PlacesIdentity`, `Search/Competitor`, `Screenshot/Rendering`, `DNS/Headers`) run once, emit Evidence Vault entries via Envelope; 22 analyzers are pure functions over the vault (typed, unit-testable, zero network). AnalyzerModule vs CollectorModule discriminated via ModuleIO contract.

**Canonical owners:**

| Capability | Owner file/dir |
|---|---|
| request auth/rate | `lib/middleware/*` + generated `evidence/route-census.csv` + script `build-target-list.ts` |
| tenant/context/RLS | `lib/prisma.ts` + `lib/tenant/context.ts` |
| audit dispatch/queue | `lib/audit/dispatch.ts`, `lib/queue/auditJobQueue.ts`, `prisma/audit_jobs` |
| collectors/analyzers | `lib/audit/runner.ts:MODULE_REGISTRY` + new `lib/audit/collectors/*` |
| diagnosis/proposal/grounding/QA | `lib/graph/*`, `lib/proposal/*`, `lib/claims/*`, `lib/qa/*` |
| billing | `lib/stripe/*`, `lib/billing/*`, `app/api/stripe/webhook` |
| outreach | `lib/outreach/sprint2/*`, `lib/maps/googleMapsProvider.ts` |
| frontend | `app/(marketing|dashboard|admin|client)` + design-system `components/ui/*` |
| observability | `instrumentation.ts`, `lib/observability/*`, `lib/telemetry/*` |

No microservices. No Kafka. No Temporal. No K8s env beyond current Cloud Run + Postgres + Redis + GCS.
