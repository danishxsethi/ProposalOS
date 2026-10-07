# 12 — Don't Build Yet — Fable 5.1 Best-in-Class

Unlimited credits does not mean unlimited systems. Each item below is attractive but premature or unjustified at agency-OS scale. Every item has a measurable trigger.

| What not to build now | Why premature | Revisit trigger |
|---|---|---|
| **Temporal** durable workflows | Postgres durable `AuditJob` with leaseToken ownership is already transactional, tenant-bound and reclaimed; Temporal adds operator, versioned workers and SDK without 150/min sustained demand | `>150 audits/min sustained 1h` or `reclaim>30s` |
| **Kafka / separate event bus** | Audit→proposal is single-tenant transaction, not fan-out broadcast | Need to broadcast audit events to 3+ independent consumers at scale |
| **Microservices (2–5 services)** | Single standalone Next has single RLS client + one deploy + chromium; split adds latency, auth duplication and deploy coordination | `build>8min` or worker needs 5× API scaling independent |
| **Kubernetes env** | Cloud Run + Postgres + Redis + GCS is already prod-grade at agency tier | Need per-tenant data plane isolation (enterprise) |
| **Separate AI/LLM service** | LLM calls are `provider.ts` facade inside compiler; extracting to service adds hop + versioning | Cross-team needs Python-only prompt lab at >10 contributors |
| **Self-evolving production prompts** | `prompts/*.txt` deterministic + A/B `minSample 100 p<0.05 +2% <10%` is correct experiment gate; evolving prompts in prod before once-proven gate is hallucination drift | Gate fires once: +2% quality proven then graduate to DB catalog |
| **Live autonomous outreach** | Double-gated sandbox + DNS verify + caps 35/50/100/5000 + blocklist + KILL_SWITCH is deliverability moat; blasting without `bounce<1% 30d at 500/d` in staging burns sender reputation | `bounce<1% complaint 0% for 30d at 500/d` in staging + human review off by flag |
| **Multi-currency pricing (7-currency FX 0.92/0.79)** | Single catalog 99/299/599 with Stripe `priceId test/live` is auditable price=charged; FX hardcoding is marketing not Stripe-verified | Enterprise demands EUR/GBP checkout + Stripe `lookup_keys` validated |
| **Separate Claraud backend/frontend** | `claraud-web/` is already separate app with second Prisma client (now fixed); widget + branding already tenant-config in main; second star doubles story without isolation benefit | Claraud NRR >30% of main post-GA |
| **Complex enterprise SSO (SAML JIT SCIM)** | Google OAuth + `model-metrics admin` gate is correct RC; SAML without demand is unused surface | Enterprise prospect blocks on SAML with SLA |
| **Real-time collaboration (OT, live cursors)** | Proposals are single-editor approve-then-share; live OT is heavy before `view tracking` + `accept` proves single-editor throughput limit | >5 concurrent editors per proposal sustained |
| **Realtime websocket progressive progress** | Polling `/api/audit/batch/[batchId]` + phase `modulesCompleted` stream is enough at phone scale; SSE later if gap proven | Perceived wait p50 complaint in UX study |
| **Second observability vendor (Datadog/New Relic)** | OTel gRPC + pino + LangSmith writer already wired; query abstraction (ADV-EVAL-02) is cheaper than vendor migration | OTel collector drops >1% spans |
| **Evidence Vault separate table** | `EvidenceSnapshot JSONB + targetUrl/providerRequestId/methodVersion` + Envelope hash is enough at RC; GCS vault only when raw HTML >10GB/tenant (ADV-DATA-02) | raw HTML/screenshots >10GB/tenant |
| **Full WCAG AA certification claim** | `axe-core` 0 critical/serious + keyboard/contrast/zoom pass is correct RC bar; claiming certification without auditor is marketing liability | Auditor issues VPAT after measure |

**Operating rule:** No T4 item enters a PR before its trigger fires and an ADR is merged with the trigger artifact. Every T0→T1 must complete before a T3 is discussed.
