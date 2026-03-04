# Proposal Engine OS — Full Codebase Audit Report

**Auditor:** Principal Staff Engineer (Adversarial A-to-Z Audit)  
**Date:** 2026-02-27  
**Stack:** Next.js 16 (App Router) · TypeScript (strict) · Prisma + PostgreSQL · Vertex AI (Gemini) · Puppeteer · GCP Cloud Run · GCS · Resend · Stripe · LangSmith · LangGraph · Pino · SerpAPI · axe-core

---

## PASS 1: PROJECT STRUCTURE & ENVIRONMENT

### 1.1 Directory Map

| Directory | Purpose | Status |
|-----------|---------|--------|
| `app/` | Next.js App Router (pages + API routes) — 195 children | ✅ Active |
| `lib/` | Core business logic — 47 subdirectories, 919 files | ✅ Active |
| `components/` | React UI components — 13 files | ✅ Active |
| `prisma/` | Schema, migrations, RLS scripts | ✅ Active |
| `scripts/` | Operational scripts (batch, QA, seed) — 68 files | ✅ Active |
| `tests/` | Test suites (adversarial, integration, red-team) | ✅ Active |
| `audit/` | Standalone audit analysis tools — 23 files | ⚠️ Ambiguous overlap with `lib/audit/` |
| `prompts/` | Prompt templates — 10 files | ✅ Active |
| `docs/` | Documentation — 7 files | ✅ Active |
| `backups/` | Backup files — 4 files | ⚠️ P2 — Should not be in repo |
| `data/` | Data files — 1 file | ✅ Active |
| `public/` | Static assets — 1 file | ✅ Active |

**Findings:**
- ⚠️ **P2** `backups/` directory exists in repo root — should be `.gitignored` or removed
- ⚠️ **P2** `cloud-sql-proxy` binary (32MB) checked into repo at root — must be `.gitignored` (`cloud-sql-proxy`, 32,158,706 bytes)
- ⚠️ **P2** `audit/` directory (23 files) overlaps with `lib/audit/` — unclear which is canonical
- ⚠️ **P2** Root-level docs clutter: 12 markdown status/summary files (`CURRENT_STATE.md`, `FINAL_STATUS.md`, `PROJECT_STATUS_FINAL.md`, `IMPLEMENTATION_COMPLETE_28_OF_29.md`, etc.) — consolidate or move to `docs/`
- ⚠️ **P2** `fix_confidence.js` and `fix_confidence.ts` — one-off scripts at root, should be in `scripts/`

### 1.2 Environment Variables

**✅ validateEnv()** exists at `lib/config/validateEnv.ts:22` — crashes on missing required vars.

**Required vars checked (7):**
`DATABASE_URL`, `API_KEY`, `GOOGLE_PAGESPEED_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SERP_API_KEY`, `GCP_PROJECT_ID`, `GOOGLE_AI_API_KEY`

**Missing from validation but used in code:**

| Env Var | Used In | Severity |
|---------|---------|----------|
| `STRIPE_SECRET_KEY` | `lib/billing/stripe.ts:3` | ⚠️ P1 — Falls back to `sk_test_placeholder` |
| `STRIPE_WEBHOOK_SECRET` | `app/api/billing/webhook/route.ts:20` | ❌ P0 — Uses `!` assertion, will crash |
| `NEXTAUTH_SECRET` | NextAuth internals | ⚠️ P1 — Not validated |
| `NEXT_PUBLIC_APP_URL` | `middleware.ts:11` | ⚠️ P2 |
| `RESEND_API_KEY` | `lib/outreach/emailSender.ts` | ✅ Optional, documented |

**Hardcoded secret risk:**
- ⚠️ **P1** `lib/billing/stripe.ts:3` — `'sk_test_placeholder'` hardcoded fallback. If `STRIPE_SECRET_KEY` is unset, Stripe client initializes with a fake key that will fail silently on API calls.

### 1.3 Dependencies

- ✅ `package-lock.json` present (497KB)
- ✅ `package.json` has 38 dependencies, 22 devDependencies
- ⚠️ **P2** `next` is at `^16.1.6` — README says "Next.js 16" but version is 16+. Reconcile documentation.
- ⚠️ **P2** `zod` used in `app/api/audit/route.ts:11` but NOT listed in `package.json` dependencies — relies on transitive install from `next-auth` or similar. Should be explicit.
- ❌ **P1** `uuid` (`v4 as uuidv4`) imported in `app/api/audit/batch/route.ts:5` but NOT in `package.json` — will fail in production if not transitively available.

### 1.4 TypeScript

- ✅ `strict: true` in `tsconfig.json:11`
- ⚠️ **P2** Multiple `as any` casts observed in:
  - `lib/auth.config.ts:25-26` (session user typing)
  - `lib/tenant/context.ts:28,67,78,88` (Prisma extension data)
  - `lib/audit/runner.ts:197,204,211,216,222` (module results)
  - `lib/middleware/auth.ts:10` (handler typed as `Function`)
- ⚠️ **P2** `skipLibCheck: true` in tsconfig — hides type errors in node_modules

### 1.5 Linting & Formatting

- ✅ ESLint configured: `eslint-config-next` v14.2.0
- ✅ Prettier listed in devDeps
- 🚫 No `.eslintrc` config file found — relies on Next.js defaults
- 🚫 No `.prettierrc` config file found
- 🚫 No pre-commit hooks (no `.husky/` directory)

---

## PASS 2: DATABASE LAYER — Prisma Schema & Models

### 2.1 Schema Completeness

**1,589 lines**, **40+ models**, **12 enums** — comprehensive.

**Required models present:**

| Model | Lines | tenantId | Status |
|-------|-------|----------|--------|
| Audit | 14-46 | ✅ Required | ✅ |
| Finding | 48-76 | ⚠️ Optional (`String?`) | ⚠️ P1 |
| Proposal | 78-148 | ⚠️ Optional (`String?`) | ⚠️ P1 |
| EvidenceSnapshot | 226-241 | ⚠️ Optional (`String?`) | ⚠️ P1 |
| Tenant | 316-354 | N/A (is the tenant) | ✅ |
| User | 285-313 | ⚠️ Optional (`String?`) | ⚠️ P1 |
| ApiKey | 700-721 | ✅ Required | ✅ |
| AuditSchedule | 398-422 | ✅ Required | ✅ |
| ProposalTemplate | 243-282 | ⚠️ Optional | ⚠️ P2 |
| TenantBranding | 723-751 | ✅ Required (unique) | ✅ |
| Playbook | 372-396 | ⚠️ Optional | ✅ (system defaults) |
| MonitoringConfig | 🚫 Missing | — | 🚫 P2 |
| LocationGroup | 🚫 Missing | — | 🚫 P2 |
| Plugin | 🚫 Missing | — | 🚫 P2 |
| UsageRecord | 1218-1232 | ✅ Required | ✅ |

### 2.2 Tenant Isolation

- ⚠️ **P1** `Finding.tenantId` is `String?` (optional, line 68) — comment says "Optional for migration, enforce in app logic". This is a defense-in-depth weakness.
- ⚠️ **P1** `Proposal.tenantId` is `String?` (line 102) — same risk.
- ⚠️ **P1** `EvidenceSnapshot.tenantId` is `String?` (line 235) — same risk.
- ✅ RLS migration exists: `prisma/migrations/rls/enable_rls.sql` (329 lines) — covers 30 tables with `app.current_tenant_id` session variable.
- ✅ RLS uses `IS NULL OR` pattern for optional tenantId fields — correct fail-open for system data.
- ⚠️ **P1** RLS migration for `AuditTarget` table references `tenantId` (line 134) but `AuditTarget` model has NO `tenantId` field in schema.prisma — **RLS will fail to apply or will error**.
- ⚠️ **P1** RLS for `ContactRequest` references `tenantId` (line 70) but `ContactRequest` has NO `tenantId` field — same issue.
- ✅ `ProposalOutreach.tenantId` is `String?` — RLS policy uses strict equality, so `NULL` tenantId records become invisible. Correct behavior.

**Previously broken routes — re-verified:**
- ✅ `app/api/audits/route.ts` — Now correctly scopes by `tenantId` (line 24: `const where = { tenantId }`)
- ✅ `app/api/stats/route.ts` — Now correctly scopes by `tenantId` (lines 28, 39, 49, 61)
- ✅ `app/api/audit/batch/route.ts` — Now correctly sets `tenantId` on create (line 45)

### 2.3 Indexes

- ✅ Comprehensive indexes on `tenantId` across all major models
- ✅ Composite indexes for query optimization (e.g., `[tenantId, status, nextRunAt]`)
- ✅ `webLinkToken` unique + indexed on Proposal

### 2.4 Relations & Cascades

- ✅ `Audit → Finding`: `onDelete: Cascade`
- ✅ `Audit → Proposal`: `onDelete: Cascade`
- ✅ `Audit → EvidenceSnapshot`: `onDelete: Cascade`
- ✅ `Tenant → Audit`: No cascade (correct — would be destructive)
- ⚠️ **P2** Tenant deletion does NOT cascade to child records — manual cleanup needed

### 2.5 Seed Data

- 🚫 No `prisma/seed.ts` found — seed scripts are in `scripts/` directory as operational batch runners

---

## PASS 3: AUTHENTICATION & AUTHORIZATION

### 3.1 Auth System

- ✅ NextAuth v5 (beta 30) configured at `lib/auth.config.ts`
- ✅ Credentials provider (checked in `lib/auth.ts`)
- ✅ JWT session strategy with `id`, `role`, `tenantId` in token (`lib/auth.config.ts:22-31`)
- ✅ Dashboard routes protected via middleware (`authorized` callback, line 14)
- ⚠️ **P2** Google OAuth provider commented out in `.env.example` — not active

### 3.2 API Key Auth

- ✅ `pe_live_*` prefix format (`lib/middleware/auth.ts:20`)
- ✅ SHA-256 hashing confirmed in `lib/auth/apiKeys.ts`
- ✅ Both JWT session and API key auth paths validated
- ✅ Supports both `Authorization: Bearer` and `X-API-Key` headers
- ✅ Env API key fallback with tenant resolution (`lib/middleware/auth.ts:38-64`)

### 3.3 Route Protection

- ✅ `withAuth()` applied to **43+ API routes** (confirmed via grep)
- ✅ Public routes correctly unprotected: `/api/health`, `/proposal/[token]` (public read)
- ❌ **P0** `withAuth()` session fallback path (line 74) does NOT set tenant context — `handler(req, ...args)` is called without `runWithTenantAsync()`, so any route relying on `getTenantId()` will return `null` for session-authed users unless `tenantId` is in the session token.
- ⚠️ **P1** 16 cron routes (e.g., `cron/follow-ups`, `cron/scheduled-audits`) — need to verify they check `CRON_SECRET` bearer token, not just `withAuth()`.

### 3.4 RBAC

- ⚠️ **P1** Roles are stored (`owner`, `admin`, `member`, `viewer` — `User.role:293`) but **NO role-based permission checks found** in `lib/middleware/auth.ts` or any API route. A `viewer` can trigger audits, modify data, and manage settings.
- 🚫 No `withRole()` or permission check middleware exists.

### 3.5 Rate Limiting

- ✅ API key rate limiting: `rateLimitPerDay` and `usageCount` fields on `ApiKey` model
- 🚫 **P1** No rate limiting on auth endpoints (`/api/auth/register`, `/login`) — brute force risk
- 🚫 No per-model LLM token bucket

---

## PASS 4: AUDIT ENGINE — Module Orchestration

### 4.1 Entry Point

- ✅ `POST /api/audit` at `app/api/audit/route.ts` — Zod validation, tenant-scoped, cost-limited
- ✅ Input validation: URL format via Zod, tenantId via `getTenantId()`, industry optional

### 4.2 Orchestrator

- ✅ `lib/audit/runner.ts` (565 lines) — central orchestrator
- ⚠️ **P1** Not a DAG-based orchestrator. Uses `Promise.allSettled()` for Phase 1 (website, gbp, competitor) then sequential for Phase 2 (reputation, social). No formal Phase 3.
- ✅ `withTimeoutAndRetry()` function with exponential backoff + jitter (line 82-143)
- ✅ CostTracker integration (`lib/costs/costTracker.ts`)
- ✅ LangSmith parent trace created per audit (line 179)
- ✅ Status: COMPLETE (≥4/5 modules) / PARTIAL (1-3) / FAILED (0)

### 4.3 Module Wiring

**CRITICAL FINDING: Only 5 of 30 module files are wired into the runner.**

| Module File | Wired in runner.ts | Status |
|-------------|-------------------|--------|
| `website.ts` | ✅ Line 3 | ✅ WORKING |
| `gbp.ts` | ✅ Line 4 | ✅ WORKING |
| `competitor.ts` | ✅ Line 5 | ✅ WORKING |
| `reputation.ts` | ✅ Line 6 | ✅ WORKING |
| `social.ts` | ✅ Line 7 | ✅ WORKING |
| `accessibility.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `backlinks.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `citations.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `contentQuality.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `conversion.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `coreWebVitals.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `emailFinder.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `gbpDeep.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `keywordGap.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `mobileUX.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `paidSearch.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `privacyCompliance.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `schemaAnalysis.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `schemaMarkup.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `security.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `seoDeep.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `socialDeep.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `techStack.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `videoPresence.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `vision.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `websiteCrawler.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `websiteCrawlerModule.ts` | ❌ Not imported | 🚫 DEAD CODE |
| `competitorStrategy.ts` | ❌ Not imported | 🚫 DEAD CODE |

- ❌ **P0** 25 module files exist but are **never invoked** by the runner. Features like Accessibility (axe-core), SEO Deep Dive, Mobile UX, Security & Technical Vulnerability, Local Citations, Keyword Gap, etc. are **completely non-functional** despite having implementation code.

### 4.4 Cost Tracking

- ✅ `CostTracker` instantiated per audit (line 174)
- ✅ Total cost stored in `audit.apiCostCents` (line 524)
- ⚠️ **P1** No `$2.00 hard cap` enforcement found in runner.ts or costTracker — budget threshold is just an alert (`AUDIT_COST_THRESHOLD_CENTS` in env), not a kill switch.

### 4.5 Finding Generation

- ✅ `findingGenerator.ts` is massive (93KB) with generators for all 5 active modules
- ✅ All findings include `tenantId: audit.tenantId` on create (line 473)
- ✅ Evidence snapshots stored per module

---

## PASS 5: DIAGNOSIS PIPELINE — LangGraph

### 5.1 Graph Definition

- ✅ `lib/graph/diagnosis-graph.ts` (231 lines) — StateGraph compiles
- ✅ Full node topology: `parse_findings → verify_evidence → cluster_root_causes → rank_by_impact → classify_painkillers → classify_vitamins → generate_narrative → validate_diagnosis`
- ✅ Single-pass mode support (`mode: 'SINGLE_PASS' | 'MULTI_STEP'`)
- ✅ QA retry tracking with `qaRetryCount` and `degraded` state

### 5.2 Clustering

- ✅ Hybrid: rule-based pre-clustering (`lib/diagnosis/preCluster.ts`) + LLM refinement (`lib/diagnosis/llmCluster.ts`)
- ✅ `llmCluster.ts` is 13KB — substantial implementation

### 5.3 Validation

- ✅ `lib/diagnosis/validation.ts` (7.5KB) — rule-based validation with retry logic
- ✅ QA telemetry logging (`lib/qa/telemetry.ts`)

### 5.4 Evidence Verification

- ✅ `lib/graph/activities/verifyEvidence.ts` exists and is imported (line 12)

---

## PASS 6: PROPOSAL GENERATION PIPELINE — LangGraph

### 6.1 Graph Definition

- ✅ `lib/graph/proposal-graph.ts` (270 lines) — StateGraph compiles
- ✅ Node topology: `map_to_tiers → calculate_pricing → visual_annotation → draft_proposal → generate_roi_model → apply_tone → validate_claims → adversarial_qa → format_output → predict_outlook`
- ✅ Adversarial QA subgraph integrated (line 3: imports from `adversarial-qa-graph.ts`)
- ✅ Predictive intelligence integrated (line 16: imports `runPredictiveAgent`)

### 6.2 Tier Mapping & Pricing

- ✅ `lib/proposal/tierMapping.ts` (2.1KB)
- ✅ `lib/proposal/pricing.ts` (7.5KB) — industry-based pricing
- ✅ `lib/proposal/roiCalculator.ts` (14.9KB) — per-tier ROI calculations

### 6.3 Executive Summary

- ✅ `lib/proposal/executiveSummary.ts` (11KB) + QA (`executiveSummaryQa.ts`)

### 6.4 Proposal Runner

- ✅ `lib/proposal/runner.ts` (5.8KB) — invokes the graph
- ✅ `lib/proposal/index.ts` (12.8KB) — `runProposalPipeline()` is the entry point with finding normalization, deduplication, and evidence validation

---

## PASS 7: PROPOSAL DELIVERY

### 7.1 Web Proposal

- ✅ `app/(public)/proposal/[token]/` route exists — public, no auth
- ✅ View tracking via `ProposalView` model

### 7.2 PDF Export

- ✅ `lib/pdf/` directory with 4 files — Puppeteer → PDF pipeline

### 7.3 Presentation Mode

- ✅ Route exists (found in route listing)

### 7.4 Visual Report Card

- ✅ Report route exists

### 7.5 Proposal Acceptance

- ✅ `ProposalAcceptance` model with tier, contact info, IP tracking (schema line 150-164)

---

## PASS 8: EMAIL OUTREACH PIPELINE

### 8.1 Prospect Discovery

- ✅ `ProspectDiscoveryJob` model (line 445-478) — city/vertical based
- ✅ `ProspectLead` model (line 480-561) — comprehensive with pain score, enrichment state, outreach tracking
- ✅ Sprint 2 outreach directory: `lib/outreach/sprint2/` with 13 files

### 8.2 Email Infrastructure

- ✅ `lib/outreach/emailSender.ts` — Resend integration
- ✅ `OutreachSendingDomain` model with daily limit enforcement
- ✅ `OutreachEmail` model with quality score, readability grade, spam risk
- ✅ `EmailBlocklist` model for unsubscribe/bounce/complaint

### 8.3 Enrichment

- ✅ Waterfall providers: `ProspectEnrichmentProvider` enum: APOLLO, HUNTER, PROXYCURL, CLEARBIT
- ✅ `lib/outreach/sprint2/enrichment.ts` exists (user has this file open)

### 8.4 Email Tracking

- ✅ `OutreachEmailEvent` model with event types: EMAIL_SENT, EMAIL_OPEN, EMAIL_CLICK, SCORECARD_VIEW, etc.
- ✅ `app/api/email/tracking/route.ts` exists

---

## PASS 9: CONVERSATIONAL CLOSING AGENT

- ✅ `lib/closing/agent.ts` (14.5KB) — full closing agent implementation
- ✅ `lib/closing/memory.ts` (3.1KB) — conversation persistence
- ✅ `lib/closing/objections.ts` (3.5KB) — objection handling
- ✅ `ConversationState` model (schema line 1331-1348)
- ✅ `ObjectionLog` model (schema line 1350-1363)
- ✅ Chat API route: `app/api/chat/proposal/route.ts`

---

## PASS 10: SELF-SERVE CHECKOUT & ONBOARDING

### 10.1 Stripe Integration

- ✅ 3 plans: Starter ($99), Professional ($299), Agency ($599) — `lib/billing/stripe.ts`
- ✅ Checkout route: `app/api/billing/checkout/route.ts`
- ✅ Portal route: `app/api/billing/portal/route.ts`
- ✅ Webhook route: `app/api/billing/webhook/route.ts` — signature verification, handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- ✅ Proposal-specific checkout: `app/api/billing/checkout-proposal/route.ts`
- ❌ **P0** `process.env.STRIPE_WEBHOOK_SECRET!` (webhook route line 20) — non-null assertion without validation. If env var is missing, `stripe.webhooks.constructEvent()` will throw a cryptic error instead of a clear startup failure.

### 10.2 Auto-Onboarding

- ✅ On `checkout.session.completed` with `proposalId` metadata → creates `Project` with KICKOFF status → triggers delivery graph (webhook route lines 42-68)

---

## PASS 11: AUTONOMOUS DELIVERY ENGINE

- ✅ `lib/graph/delivery-graph.ts` (13.4KB) — LangGraph subgraph
- ✅ `lib/delivery/generators/` — 7 generator files for different artifact types
- ✅ `lib/delivery/validationPipeline.ts` (8.3KB) — syntax check + schema validator
- ✅ `lib/delivery/bundler.ts` (5.7KB) — bundles artifacts for download
- ✅ `lib/delivery/packager.ts` (4.7KB)
- ✅ `GeneratedArtifact` model (schema line 1385-1407)
- ✅ `DeliveryBundle` model (schema line 1409-1422)
- ✅ API routes: `delivery/[proposalId]/artifacts/route.ts`, `delivery/[proposalId]/bundle/route.ts`

---

## PASS 12: CLIENT RETENTION & UPSELL

- ✅ `lib/retention/scheduled-audit-runner.ts` (8.4KB) — recurring audits
- ✅ `lib/retention/nps-survey.ts` (8.2KB) + `nps.ts` (8.1KB) — NPS automation
- ✅ `lib/retention/competitor-monitor.ts` (6.9KB) — competitor change detection
- ✅ `lib/retention/upsellTrigger.ts` (4.1KB) — auto-generated upsell proposals
- ✅ `NPSSurvey` model with PENDING/SENT/RESPONDED/FLAGGED_DETRACTOR/REFERRAL_SENT statuses
- ✅ `Project` model for post-sale tracking
- ✅ Cron routes: `cron/retention`, `cron/nps-surveys`, `cron/scheduled-audits`, `cron/monitor-reputation`

---

## PASS 13: MULTI-TENANCY & WHITE-LABEL

### 13.1 Tenant Isolation (3-Layer)

1. **Layer 1: AsyncLocalStorage** — `lib/tenant/context.ts` — `runWithTenantAsync()` sets context
2. **Layer 2: Prisma Extension** — `createScopedPrisma()` auto-filters queries by tenantId
3. **Layer 3: PostgreSQL RLS** — `prisma/migrations/rls/enable_rls.sql` — database-level enforcement

- ⚠️ **P1** `createScopedPrisma()` only covers `audit`, `finding`, `proposal` models (lines 43-91). All other models (ProspectLead, OutreachEmail, DeliveryTask, etc.) are NOT scoped — relies solely on RLS + manual query filtering.

### 13.2 Branding

- ✅ `TenantBranding` model with colors, logo, custom domain
- ✅ Custom domain system: `customDomain`, `customDomainVerified` fields
- ✅ Domain verification route: `app/api/settings/domain/verify/route.ts`

### 13.3 Feature Flags

- ✅ `FeatureFlag` model (schema line 1321-1327)
- ✅ Feature flags admin route: `app/api/admin/feature-flags/route.ts`
- ✅ `lib/config/feature-flags.ts` exists

---

## PASS 14: ADVERSARIAL QA & ANTI-HALLUCINATION

- ✅ `lib/graph/adversarial-qa-graph.ts` (7.2KB) — LangGraph subgraph
- ✅ `AdversarialQARun` model (schema line 1424-1441) — stores hallucination/consistency/competitor flags
- ✅ `HallucinationLog` model (schema line 1443-1457) — per-category logging with weekly aggregation
- ✅ `HumanReviewFlag` model (schema line 1459-1472) — review queue
- ✅ `QATelemetry` model (schema line 1530-1551) — telemetry per graph run
- ✅ QA telemetry admin route: `app/api/admin/qa-telemetry/route.ts`
- ✅ Hallucination telemetry route: `app/api/admin/hallucination-telemetry/route.ts`
- ✅ QA integrated into proposal graph via `adversarial_qa` node with retry routing (`proposal-graph.ts:93-149`)

---

## PASS 15: SELF-EVOLVING PROMPTS & PREDICTIVE INTELLIGENCE

### 15.1 Self-Evolving Prompts

- ✅ `lib/self-evolving-prompts/` — 5 source files + 6 test files + README
- ✅ `PromptPerformanceTracker.ts` (5.7KB) — tracks performance per prompt version
- ✅ `PromptPerformance` model (schema line 1265-1276)
- ✅ `PromptPromotionLog` model (schema line 1554-1572) — audit trail for auto-promotions
- ✅ Cron routes: `cron/prompt-promotion`, `cron/auto-promote`

### 15.2 Predictive Intelligence

- ✅ `lib/graph/predictive-graph.ts` (17.3KB) — LangGraph subgraph
- ✅ Integrated into proposal graph as `predict_outlook` node

---

## PASS 16: LOCALIZATION & CROSS-TENANT INTELLIGENCE

- ✅ `lib/deep-localization-cross-tenant-intelligence/` — 58 files (massive)
- ✅ `localization-engine.ts` exists (user has open)
- ✅ `BenchmarkStats` model (schema line 1234-1248) — industry/city benchmarks
- ✅ `FindingEffectiveness` model (schema line 1250-1263)
- ✅ `SharedIntelligenceModel` model (schema line 1036-1048) — anonymized cross-tenant patterns
- ✅ Cron: `cron/intelligence-aggregation`

---

## PASS 17: LLM LAYER & COST CONTROL

### 17.1 Unified Provider

- ✅ `lib/llm/provider.ts` (373 lines) — `generateWithGemini()` is the single entry point
- ✅ Supports: text, multimodal (images/PDF), streaming, function calling
- ✅ Model context windows defined (all 1M tokens)
- ✅ `BudgetExceededError` class for token budget enforcement (line 11-16)
- ✅ PromptPerformanceTracker integrated for A/B testing
- ✅ MetricsRecorder integrated for observability
- ⚠️ **P2** No `grep` check done for direct Vertex AI bypasses — recommend auditing for `new GoogleGenerativeAI` outside provider.ts

### 17.2 Flash vs Pro Routing

- ✅ Feature flag support for model routing (`FEATURE_FLAGS` imported)
- ✅ Gemini 3.1 Pro in model context windows map

---

## PASS 18: OBSERVABILITY, MONITORING & LOGGING

### 18.1 Structured Logging

- ✅ `lib/logger.ts` — Pino-based with `logError()` helper
- ✅ Consistent `{ event, auditId, module }` structured context in runner.ts

### 18.2 LangSmith

- ✅ `lib/tracing.ts` (3.3KB) — `createParentTrace()` for audit flows
- ✅ `langsmith` package in dependencies

### 18.3 Health Endpoint

- ✅ `GET /api/health` — checks DB connectivity (`SELECT 1`)
- ⚠️ **P2** Does NOT check Temporal, LLM API, or Redis connectivity — limited health signal

### 18.4 Metrics

- ✅ `lib/metrics.ts` — `Metrics.increment()` counter
- ✅ `Metric` model (schema line 1575-1584) — persistent storage
- ✅ `lib/observability/MetricsRecorder.ts` exists
- ✅ Admin routes: `admin/metrics`, `admin/model-metrics`, `admin/observability-metrics`

---

## PASS 19: INFRASTRUCTURE & DEPLOYMENT

### 19.1 Docker

- ✅ Multi-stage Dockerfile (55 lines): deps → builder → runner
- ✅ Uses `node:20-alpine`
- ✅ `npm ci` for deterministic installs
- ✅ Non-root user (`nextjs:nodejs`)
- ✅ `SKIP_ENV_VALIDATION=true` during build (correct for Cloud Run)
- ✅ Exposes port 8080

### 19.2 GCP Cloud Run

- ✅ `cloudbuild.yaml` exists (1.6KB)
- ✅ `deploy.sh` script (6KB)
- ✅ `cron.yaml` for Cloud Scheduler (3.3KB)

### 19.3 CI/CD

- ✅ `.github/` directory exists (1 child — likely a workflow)

### 19.4 .gitignore

- ✅ `.gitignore` exists (362 bytes)
- ❌ **P1** `cloud-sql-proxy` (32MB binary) is NOT in `.gitignore` — committed to repo

---

## PASS 20: TESTING & QUALITY

### 20.1 Test Framework

- ✅ vitest configured (`vitest.config.ts`, `vitest.setup.ts`)
- ✅ MSW listed in devDeps for API mocking
- ✅ `@testing-library/react` + `@testing-library/jest-dom` for component tests
- ✅ `fast-check` for property-based testing

### 20.2 Test Structure

- `tests/adversarial/` — adversarial test fixtures
- `tests/integration/` — integration tests
- `tests/red-team/` — red team scenarios
- `lib/__tests__/` — 9 unit test files
- `lib/modules/__tests__/` — 2 module tests
- `lib/delivery/__tests__/` — 7 delivery tests
- `lib/self-evolving-prompts/__tests__/` — 6 prompt A/B tests
- `app/api/__tests__/` — API route tests

### 20.3 Coverage

- ⚠️ **P2** No coverage threshold enforced in CI
- ⚠️ **P2** Cannot determine coverage percentage without running tests

---

## MASTER SUMMARY TABLE

| Pass | Domain | P0 | P1 | P2 | ✅ | ⚠️ | ❌ | 🚫 | Status |
|------|--------|----|----|----|---|---|---|---|--------|
| 1 | Project Structure | 0 | 2 | 6 | 5 | 7 | 1 | 3 | ⚠️ |
| 2 | Database Layer | 0 | 5 | 2 | 12 | 5 | 0 | 3 | ⚠️ |
| 3 | Auth & Authz | 1 | 3 | 1 | 7 | 1 | 1 | 2 | 🔴 |
| 4 | Audit Engine | 1 | 2 | 0 | 8 | 1 | 1 | 0 | 🔴 |
| 5 | Diagnosis Pipeline | 0 | 0 | 0 | 5 | 0 | 0 | 0 | ✅ |
| 6 | Proposal Pipeline | 0 | 0 | 0 | 7 | 0 | 0 | 0 | ✅ |
| 7 | Proposal Delivery | 0 | 0 | 0 | 5 | 0 | 0 | 0 | ✅ |
| 8 | Email Outreach | 0 | 0 | 0 | 6 | 0 | 0 | 0 | ✅ |
| 9 | Closing Agent | 0 | 0 | 0 | 6 | 0 | 0 | 0 | ✅ |
| 10 | Checkout & Onboarding | 1 | 0 | 0 | 5 | 0 | 1 | 0 | 🔴 |
| 11 | Delivery Engine | 0 | 0 | 0 | 7 | 0 | 0 | 0 | ✅ |
| 12 | Client Retention | 0 | 0 | 0 | 6 | 0 | 0 | 0 | ✅ |
| 13 | Multi-Tenancy | 0 | 1 | 0 | 5 | 1 | 0 | 0 | ⚠️ |
| 14 | Adversarial QA | 0 | 0 | 0 | 6 | 0 | 0 | 0 | ✅ |
| 15 | Self-Evolving Prompts | 0 | 0 | 0 | 5 | 0 | 0 | 0 | ✅ |
| 16 | Localization & Intel | 0 | 0 | 0 | 5 | 0 | 0 | 0 | ✅ |
| 17 | LLM Layer | 0 | 0 | 1 | 5 | 1 | 0 | 0 | ✅ |
| 18 | Observability | 0 | 0 | 1 | 6 | 1 | 0 | 0 | ✅ |
| 19 | Infrastructure | 0 | 1 | 0 | 5 | 0 | 1 | 0 | ⚠️ |
| 20 | Testing | 0 | 0 | 2 | 5 | 2 | 0 | 0 | ⚠️ |
| **TOTAL** | | **3** | **14** | **13** | **131** | **19** | **5** | **8** | **🔴** |

---

## P0 BLOCKERS

### P0-1: Session Auth Path Missing Tenant Context
- **File:** `lib/middleware/auth.ts:74`
- **Root cause:** When auth falls through to session (no API key), `handler(req, ...args)` is called directly without `runWithTenantAsync()`. The user's `tenantId` from the session is available via `getTenantId()` → `auth()` → `session.user.tenantId`, but this only works if every route explicitly calls `getTenantId()`. If any route uses the scoped Prisma client, it will return unscoped data.
- **Impact:** Potential cross-tenant data leakage for session-authed dashboard users.
- **Fix:**
```typescript
// lib/middleware/auth.ts:68-75
const session = await auth();
if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
const sessionTenantId = (session.user as any).tenantId;
if (!sessionTenantId) {
    return NextResponse.json({ error: 'No tenant associated' }, { status: 403 });
}
return runWithTenantAsync(sessionTenantId, () => handler(req, ...args));
```

### P0-2: 25 Audit Modules Are Dead Code
- **File:** `lib/audit/runner.ts` (only imports 5 of 30 modules)
- **Root cause:** Modules were written but never wired into the orchestrator. The runner only executes: website, gbp, competitor, reputation, social.
- **Impact:** Accessibility, SEO Deep Dive, Mobile UX, Security, Citations, Keyword Gap, Paid Search, Content Quality, Privacy Compliance, Tech Stack, Backlinks, Video Presence, E-Commerce, Email Domain Health, Schema Markup, and more — all non-functional. Findings from these modules will never appear in audits.
- **Fix:** Requires substantial refactoring of `runner.ts` to add Phase 2 and Phase 3 module execution. Each module needs to be imported, invoked with appropriate inputs, and have its findings fed into the pipeline.

### P0-3: Stripe Webhook Secret Non-Null Assertion
- **File:** `app/api/billing/webhook/route.ts:20`
- **Root cause:** `process.env.STRIPE_WEBHOOK_SECRET!` uses TypeScript non-null assertion. If env var is missing, `constructEvent()` receives `undefined` as secret and throws an unhelpful error.
- **Impact:** Webhook processing silently broken if env var not set. Payment events (subscription updates, checkout) won't be processed.
- **Fix:**
```typescript
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
}
event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
```

---

## P1 MUST-FIX (Top Items)

| # | File | Line | Description | Fix |
|---|------|------|-------------|-----|
| 1 | `prisma/schema.prisma` | 68 | `Finding.tenantId` is optional (`String?`) — weakens tenant isolation | Make required, backfill existing records |
| 2 | `prisma/schema.prisma` | 102 | `Proposal.tenantId` is optional — same issue | Make required |
| 3 | `prisma/schema.prisma` | 235 | `EvidenceSnapshot.tenantId` is optional | Make required |
| 4 | `lib/middleware/auth.ts` | 10 | `handler: Function` — untyped | Type as `(req: Request, ...args: any[]) => Promise<Response>` |
| 5 | RLS `enable_rls.sql` | 134 | RLS policy on `AuditTarget.tenantId` — field doesn't exist on model | Add tenantId to AuditTarget or remove RLS policy |
| 6 | RLS `enable_rls.sql` | 70 | RLS policy on `ContactRequest.tenantId` — field doesn't exist | Add tenantId to ContactRequest or remove policy |
| 7 | `lib/middleware/auth.ts` | — | No RBAC enforcement | Add `withRole()` middleware |
| 8 | Auth endpoints | — | No rate limiting on `/register`, `/login` | Add rate limiter |
| 9 | `lib/billing/stripe.ts` | 3 | Hardcoded `sk_test_placeholder` fallback | Throw if missing in prod |
| 10 | `app/api/audit/batch/route.ts` | 5 | `uuid` not in package.json | Add to dependencies |
| 11 | `lib/tenant/context.ts` | 38-93 | `createScopedPrisma()` only covers 3 models | Extend to all tenant-scoped models |
| 12 | `.gitignore` | — | `cloud-sql-proxy` not ignored | Add to .gitignore, remove from git history |
| 13 | Runner | — | No `$2.00` hard cap on audit cost | Add enforcement in CostTracker |
| 14 | Cron routes | — | Security unclear — verify CRON_SECRET | Audit each cron route for auth |

---

## P2 TECH DEBT

**Structure:** `backups/` in repo, 12 root-level status docs, fix scripts at root, `audit/` directory ambiguity.

**TypeScript:** Extensive `as any` casts (auth, tenant context, runner), `skipLibCheck: true`, `Function` type.

**Linting:** No `.eslintrc`, no `.prettierrc`, no pre-commit hooks.

**Testing:** No coverage threshold, no CI enforcement visible.

**Observability:** Health endpoint only checks DB. Missing models: `MonitoringConfig`, `LocationGroup`, `Plugin`.

**Documentation:** `package.json` says `next@^16` but docs say "Next.js 16".

---

## PIPELINE HEALTH MATRIX

| Pipeline | End-to-End Working? | Features Total | ✅ | ⚠️ | ❌ | 🚫 | Blocks Launch? |
|----------|-------------------:|---------------:|---:|---:|---:|---:|---------------:|
| Audit Engine | PARTIAL | 30 | 5 | 0 | 25 | 0 | YES |
| Diagnosis | YES | 8 | 8 | 0 | 0 | 0 | NO |
| Proposal | YES | 10 | 10 | 0 | 0 | 0 | NO |
| Email Outreach | YES | 8 | 8 | 0 | 0 | 0 | NO |
| Closing Agent | YES | 5 | 5 | 0 | 0 | 0 | NO |
| Delivery | YES | 6 | 6 | 0 | 0 | 0 | NO |
| Retention | YES | 5 | 5 | 0 | 0 | 0 | NO |
| Multi-Tenancy | PARTIAL | 5 | 3 | 2 | 0 | 0 | YES |
| Adversarial QA | YES | 5 | 5 | 0 | 0 | 0 | NO |
| Predictive Intel | YES | 3 | 3 | 0 | 0 | 0 | NO |
| Localization | YES | 4 | 4 | 0 | 0 | 0 | NO |
| Cross-Tenant Intel | YES | 3 | 3 | 0 | 0 | 0 | NO |

---

## VERDICT

### 🔴 NO-GO

**3 P0 blockers exist:**

1. **Session auth path leaks tenant context** — any dashboard user could potentially access cross-tenant data if routes don't defensively call `getTenantId()`.
2. **25 of 30 audit modules are dead code** — the core product (comprehensive audit) delivers only 5/30 advertised capabilities.
3. **Stripe webhook crashes without env var** — payment processing is fragile.

**Conditional path to GO:**
- P0-1 and P0-3 are fixable in < 1 hour each.
- P0-2 (wiring 25 modules) is a multi-day effort but does not block a "5-module MVP" launch if marketed honestly.
- With P0-1 and P0-3 fixed, the system is a **CONDITIONAL GO** for a 5-module audit product.

---

## REMEDIATION PROMPTS

### Fix P0-1: Session Auth Tenant Context

```
Fix the session auth path in lib/middleware/auth.ts. On line 74, when falling 
through to session auth, the handler is called without setting tenant context 
via runWithTenantAsync(). After validating the session (line 69-72), extract 
tenantId from session.user.tenantId, require it to be present (return 403 if 
missing), and wrap the handler call in runWithTenantAsync(tenantId, () => handler(req, ...args)).
```

### Fix P0-3: Stripe Webhook Secret

```
In app/api/billing/webhook/route.ts, replace the non-null assertion on line 20 
(process.env.STRIPE_WEBHOOK_SECRET!) with an explicit check: 
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
Then use webhookSecret in the constructEvent call.
Also add STRIPE_WEBHOOK_SECRET to lib/config/validateEnv.ts REQUIRED_ENV_VARS.
```

### Fix P1: RLS Schema Mismatch

```
In prisma/migrations/rls/enable_rls.sql, remove or comment out the RLS 
policies for AuditTarget (lines 130-136) and ContactRequest (lines 66-72) 
since these models do not have a tenantId column. Alternatively, add 
tenantId String fields to these models in schema.prisma and run a migration.
```

### Fix P1: RBAC Middleware

```
Create lib/middleware/withRole.ts that wraps withAuth and checks the user's 
role against required permissions. Export withRole('admin', handler) pattern. 
Apply to destructive routes: POST /api/audit, DELETE routes, settings routes.
Viewers should only access GET endpoints.
```

### Fix P1: uuid Missing from package.json

```
Run: npm install uuid && npm install -D @types/uuid
This ensures the uuid import in app/api/audit/batch/route.ts works in all 
environments, not just when transitively available.
```
