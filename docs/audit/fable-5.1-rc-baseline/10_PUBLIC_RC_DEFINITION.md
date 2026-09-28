# 10 — Public RC Definition — Fable 5.1

**Target customer:** Agency owner/team selling website audits → evidence-bound proposals to local SMB prospects. Not self-serve SMB direct for RC.

**Supported use cases:** Single audit (paste URL+city), batch audit (≤25 at RC), diagnosis→proposal→share (public token + PDF), Stripe proposal acceptance + checkout, SaaS subscription checkout + portal, basic outreach discovery/qualification/enrichment guarded sandbox.

**Supported envs:** Standalone Docker on Cloud Run, Postgres 15, Redis, GCS for PDFs/delivery bundles.

**Supported modules:** All 27 but feature-flag gated: accessibility/performance/seo/security off by flags if needed; optional modules socialDeep/gbpDeep/vision/paidSearch/backlinks/videoPresence may skip gracefully.

**Billing mode:** Stripe test then live; proposals meter via AuditJob quota + CostTracker caps.

**Service level (RC):** Audit p95 <5m wall, proposal <90s, PDF <15s; success ≥95%, degraded <10%; cost per audit p95 documented.

**Guarantees:** Zero known cross-tenant exposure; zero unauthenticated mutation except public token/cron sig; tenant isolation proven via hostile pair; public tokens 90d + revocation; money displayed = charged; webhooks idempotent deduped.

**Known limitations (RC):** No real-time collaboration, no SOC 2 claim, outreach live sends require human approval + DNS SPF/DKIM/DMARC + caps, self-evolving prompts DB deferred, Claraud separate brand not part of RC story.

**Hard gates (must all pass):**

- Sec/data: 0 P0, auth matrix for primary resources, no high SSRF, no secrets in history, tokens meet entropy/expiry/revocation.
- Build/tests: every deployable builds 0 errors, type+lint 0 errors, all blocking tests pass, no unexplained skips, migration replay empty DB passes, coverage meaningful threshold, E2E for primary journeys.
- Product: audit e2e + proposal e2e + public proposal+PDF professional, 5-industry live run avg ≥85 none <80 zero unsupported claims, desktop+mobile, a11y no critical/serious.
- Reliability: success threshold met, p95/cost measured, retry/idempotency proven, 24h soak + rollback + alert drill + backup/restore pass.
- Billing: Stripe test-mode smoke + no double webhook + usage/entitlement reconciled + prices equal.
- Ops: dashboards+alerts+runbooks + kill switches tested + human sign-off sec/product/eng/release.
