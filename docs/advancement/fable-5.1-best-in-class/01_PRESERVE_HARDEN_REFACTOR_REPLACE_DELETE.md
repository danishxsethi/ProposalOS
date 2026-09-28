# 01 — Preserve / Harden / Refine / Refactor / Replace / Delete / Defer

Verdict per major subsystem — evidence-checked against current HEAD commit `5f66e09`. The goal is fewer systems and clearer canonical paths, not more.

| # | Subsystem | Verdict | Why | Location |
|---|---|---|---|---|
| 1 | Next standalone frontend (58 pages) | **PRESERVE + REFINE** | `Dockerfile` node:20-alpine + chromium correct; product polish is the gap, not framework | `app/`, `Dockerfile:1` |
| 2 | API surface (147 routes) | **HARDEN** | Real routes; auth is per-route memory — needs machine census, not rewrite | `app/api/**/route.ts`, `middleware.ts:23` |
| 3 | Audit runner `MODULE_REGISTRY` 27 in 3 phases | **PRESERVE + HARDEN** | Correct single writer; needs collector sharing + typed ModuleIO (see Domain E) | `lib/audit/runner.ts:960` |
| 4 | Module registry manifest | **PRESERVE** | Parity with runner via contract test is good; keep 2 (runner + shared) add sync check | `packages/shared/src/audit.ts:87` |
| 5 | Findings/Evidence model | **HARDEN + REFINE** | `FindingRuntimeSchema evidence≥1` + sole `findingPersistence.ts` writer correct; needs chain viewer + freshness | `lib/audit/findingContract.ts`, `lib/audit/findingPersistence.ts:101` |
| 6 | Diagnosis graph | **REFINE** | StateGraph works; cluster≤5 + narrative per cluster sound; tighten vertical context + retry semantics | `lib/graph/diagnosis-graph.ts` |
| 7 | Proposal compiler + grounding chain | **PRESERVE + HARDEN** | Fingerprint SHA256 gate is strongest asset; needs Envelope contract + tier mapping hardening | `lib/proposal/compiler.ts`, `lib/proposal/publication.ts:assertProposalPublishable` |
| 8 | Claim/grounding contract | **PRESERVE** | `validateCustomerClaim` numeric/substantive overlap is differentiation; harden with golden eval | `lib/claims/claimContract.ts` |
| 9 | LLM provider (`generateWithGemini`) + ProviderRegistry | **PRESERVE + HARDEN** | Retry 3 + breaker 5/60s + 1M budget + LRU correct; add budget-aware routing + OpenAI/Anthropic wired as real fallback | `lib/llm/provider.ts`, `lib/llm/providers/registry.ts` |
| 10 | Tenant isolation (RLS + AsyncLocalStorage + $extends) | **PRESERVE + HARDEN** | Same-tx `set_config` fix landed; needs hostile-pair proof + removing last Unsafe | `lib/prisma.ts`, `lib/tenant/context.ts`, `lib/self-evolving-prompts/db.ts` |
| 11 | Authentication (NextAuth Google+Credentials, DB session 1h) | **PRESERVE** | Design sound; rotate + revoke via `rotateApiKey` good | `lib/auth.ts`, `lib/auth.config.ts:100` |
| 12 | Authorization wrappers (`withAuth/withRole/withPermission`, CRON timingSafeEqual) | **HARDEN** | Logic correct; needs generated route census gate so omission = fail | `lib/middleware/auth.ts`, `lib/auth/rbac.ts:428`, `lib/middleware/cronAuth.ts` |
| 13 | Public-token system (`webLinkToken` + fingerprint chain) | **PRESERVE** | uuid + 90d + revocation + provenance valid; project to 90d in UI next | `lib/proposal/publicAccess.ts`, `lib/proposal/grounding.ts` |
| 14 | Prisma/data access | **HARDEN** | Single client ideal; kill remaining `sniperWorker:575 $executeRawUnsafe` → `Prisma.sql` | `lib/prisma.ts:195` |
| 15 | Schema (95 models) | **REFINE** | Mostly coherent; 2 decisions: businessLatitude/Longitude & locale_configs restore vs deprecate | `prisma/schema.prisma` |
| 16 | Migrations | **REFINE** | 26 files; drift proves process debt — make `migrate status` + `db push` divergence a CI gate | `prisma/migrations/*` |
| 17 | AuditJob queue (durable Postgres, lease/heartbeat) | **PRESERVE** | Boring is correct at this scale; Temporal is premature | `lib/queue/auditJobQueue.ts`, `lib/audit/dispatch.ts:48` |
| 18 | Worker execution (`/api/worker/audit-job` + cron sweeps) | **HARDEN** | LeaseToken holder-only completion good; needs crash-mid-audit proof + WORKER_SECRET | `app/api/worker/audit-job/route.ts` |
| 19 | Cron scheduling (23) | **HARDEN** | All `verifyCronAuth` fail-closed; meter/reconcile under-owned in ops | `app/api/cron/*` |
| 20 | Rate limiting (Upstash + Redis) | **PRESERVE** | Dual scopes (10/h invalid IP, 100/h token hash + 5/m cron) sound | `lib/middleware/rateLimit.ts` |
| 21 | Cost tracking (CostTracker + redisSpendTracker + withAuditBudget 10m) | **HARDEN** | Per-module add* + cap 200¢ correct; expose as module label `COST_TRACKED` | `lib/costs/costTracker.ts:674` |
| 22 | Stripe/billing webhook dedup | **PRESERVE** | `ProcessedWebhookEvent PK` + `skipDuplicates` tx reservation + `CheckoutAttempt` idempotency correct | `lib/stripe/webhookHandler.ts:97` |
| 23 | Pricing | **REFACTOR** | Three truths must become one canon (PlanCatalogService) | `lib/stripe/PlanCatalogService.ts:20` |
| 24 | Entitlement/quota | **HARDEN** | `EntitlementService` + trial/grace real; fix TOCTOU with row lock | `lib/billing/EntitlementService.ts:30`, `lib/billing/limits.ts:70` |
| 25 | PDF/export | **REFINE** | Puppeteer/Chromium + archiver correct; needs parity assertion vs public proposal | `lib/pdf/`, `lib/delivery/bundler.ts` |
| 26 | Storage (GCS PDFs/bundles) | **PRESERVE** | Correct at this scale | `lib/storage.ts`, `@google-cloud/storage` |
| 27 | Email (Resend + Zoho SMTP, Svix 300s) | **PRESERVE + HARDEN** | Provider inventory + Svix correct; needs provider allowlist fix for outbound | `lib/outreach/providers.ts` |
| 28 | Outreach discovery/qualification/enrichment/sniper | **HARDEN** | Waterfall + quality gate 90 + caps + blocklist strong; default stays sandbox/human-approved | `lib/outreach/sprint2/*` |
| 29 | Prospect discovery (googlePlaces + yelp + directories) | **HARDEN** | Dedup chain blocklist + `CHAIN_BLOCKLIST 12` good; polish maps scoring thresholds | `lib/outreach/sprint2/discovery.ts`, `lib/maps/googleMapsProvider.ts` |
| 30 | White-label (TenantBranding, widget allowlist, templates, domain verify) | **REFINE** | Real; needs agency workflow polish not second stack | `app/(dashboard)/settings/*` |
| 31 | Client/public proposal experience | **REFINE** | `resolvePublicProposalAccess` stripped DTO good; needs traversal chain UX + view tracking | `lib/proposal/publicAccess.ts:resolvePublicProposalAccess` |
| 32 | Observability (OTel + LangSmith + metrics) | **HARDEN** | Pipes exist; needs SLO/error-budget/alert linkage per tenant | `instrumentation.ts`, `lib/observability/*` |
| 33 | Eval infra (adversarial QA + hallucination scorer) | **HARDEN** | 20 adversarial cases + 3-pass graph good; needs golden eval program not ad-hoc | `lib/qa/adversarial-tests.ts`, `lib/graph/adversarial-qa-graph.ts` |
| 34 | CI (`test.yml`) | **HARDEN** | `npm ci → security:audit:prod → generate → postgres+pgbouncer → bootstrap → dot` solid; add migration-drift + census + money-smoke + axe gates | `.github/workflows/test.yml` |
| 35 | Test architecture (266 suites, boundary tests) | **HARDEN** | Boundaries are signal — make them generate allowlist rather than fail on new route | `tests/architecture/*`, `tests/matrix/*` |
| 36 | Deployment (standalone + Secret Manager SKIP_ENV_VALIDATION build trick) | **PRESERVE** | Intentional; document + add health/readiness proven | `Dockerfile`, `instrumentation.ts` |
| 37 | Secrets/config validation | **HARDEN** | `validateEnv` + `BILLING_LIVE_MODE` guards live `sk_live_` + `whsec` pattern good; add expiry rotation job | `lib/config/validateEnv.ts` |
| 38 | Incident response (kill switches) | **HARDEN** | `KILL_SWITCH_FORCE_MANUAL_MODE` + `OUTREACH_LIVE_SENDING` double gate real; needs runbook+alert proof | `lib/config/feature-flags.ts` |
| 39 | Documentation vs Notion | **REFACTOR** | Repo facts must be generated; vision labeled; claims ledger current | `docs/` |
| 40 | Legacy Claraud surface (`claraud-web` second app) | **DEFER** | Separate app, second Prisma client now fixed; not RC-critical — defer as appendix | `claraud-web/` |
| 41 | Deprecated orchestrator 14-module | **DELETE** | 0 callers, logs [DEPRECATED] | `lib/orchestrator/auditOrchestrator.ts` |
| 42 | Self-evolving prompts design-vs-prod split | **DEFER** | Tables not in `schema.prisma` main, `prompts/*.txt` is prod — defer multi-currency of prompts | `lib/self-evolving-prompts/`, `prompts/*.txt` |
| 43 | Billing webhook alias `/api/billing/webhook` | **DELETE** | 1-line re-export doubles events if both dashboard URLs | `app/api/billing/webhook/route.ts:1` |

Rule: nothing is REPLACE (no Temporal/microservices) — the primitives are correct and boring is best-in-class at this scale.
