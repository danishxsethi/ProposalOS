# Proposal Engine OS — Current State (Post-Sprint 12)

> **Architectural Source of Truth**  
> Last Updated: February 22, 2026  
> Version: Sprint 12 Complete

---

## Table of Contents

1. [Stack Summary](#1-stack-summary)
2. [Schema Baseline](#2-schema-baseline)
3. [Pipeline Topology](#3-pipeline-topology)
4. [Strict Guardrails](#4-strict-guardrails)
5. [Environment Requirements](#5-environment-requirements)
6. [Deployment Configuration](#6-deployment-configuration)

---

## 1. Stack Summary

### Core Framework

| Component      | Version | Role                                        |
| -------------- | ------- | ------------------------------------------- |
| **Next.js**    | 16.1.6  | App Router, API routes, SSR/SSG             |
| **React**      | 18.3.0  | UI components                               |
| **Prisma**     | 5.20.0  | ORM, database migrations, type-safe queries |
| **PostgreSQL** | —       | Primary database (Cloud SQL on GCP)         |

### AI/ML Layer

| Component                  | Version | Role                                 |
| -------------------------- | ------- | ------------------------------------ |
| **@langchain/langgraph**   | 1.1.5   | Multi-step LLM reasoning pipelines   |
| **@langchain/core**        | 1.1.26  | LangGraph primitives, message types  |
| **langsmith**              | 0.4.12  | Tracing, observability, run tracking |
| **@google/generative-ai**  | 0.24.1  | Gemini API client                    |
| **@google-cloud/vertexai** | 1.7.0   | Vertex AI (GCP-native Gemini)        |

### Gemini Model Configuration

| Model                | Use Case                                    | Cost (per 1K tokens)        |
| -------------------- | ------------------------------------------- | --------------------------- |
| **gemini-2.0-flash** | Diagnosis clustering, narrative generation  | $0.01 input / $0.03 output  |
| **gemini-2.5-flash** | Proposal generation, executive summary      | ~$0.01 input / $0.03 output |
| **gemini-3.1-pro**   | Single-pass deep analysis (feature-flagged) | $0.125 input / $0.50 output |

### Orchestration

| Component             | Status             | Notes                                |
| --------------------- | ------------------ | ------------------------------------ |
| **Temporal Cloud**    | ❌ NOT IMPLEMENTED | Custom orchestrator used instead     |
| **AuditOrchestrator** | ✅ Implemented     | Native Node.js phase-based execution |
| **DataBus**           | ✅ Implemented     | In-memory inter-module communication |

### Infrastructure

| Component    | Platform               | Notes                             |
| ------------ | ---------------------- | --------------------------------- |
| **Hosting**  | Cloud Run (GCP)        | Scale-to-zero, max 5 instances    |
| **Database** | Cloud SQL (PostgreSQL) | Connection pooling via Prisma     |
| **Cache**    | Redis (optional)       | Falls back to file cache          |
| **Storage**  | GCS                    | PDF storage, screenshot artifacts |
| **Email**    | Resend                 | Proposal delivery, notifications  |

---

## 2. Schema Baseline

### Entity Relationship Diagram (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              TENANT                                      │
│  id, name, slug, domain, planTier, status, stripeCustomerId             │
│  @@index([domain]), @@index([isActive])                                 │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│       USER        │    │       AUDIT       │    │      ApiKey       │
│  tenantId?        │    │  tenantId REQUIRED│    │  tenantId REQUIRED│
│  email, role      │    │  businessName     │    │  keyHash, scopes  │
│  subscriptionTier │    │  status, modules  │    │  rateLimitPerDay  │
└───────────────────┘    │  apiCostCents     │    └───────────────────┘
                         │  overallScore     │
                         └───────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │ 1:N         │ 1:N         │ 1:N
                    ▼             ▼             ▼
         ┌──────────────┐ ┌──────────────┐ ┌────────────────┐
         │   Finding    │ │   Proposal   │ │ EvidenceSnapshot│
         │ tenantId?    │ │ tenantId?    │ │ tenantId?       │
         │ auditId      │ │ auditId      │ │ auditId         │
         │ impactScore  │ │ status       │ │ module, source  │
         │ confidenceSc │ │ tiers, pricing│ │ rawResponse     │
         └──────────────┘ └──────────────┘ └────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │ 1:1         │ 1:N         │ 1:N
                    ▼             ▼             ▼
         ┌──────────────────┐ ┌─────────────┐ ┌────────────────┐
         │ ConversationState│ │ ProposalView│ │ContactRequest  │
         │ proposalId UNIQUE│ │ proposalId  │ │ proposalId     │
         │ history, sentiment││ sessionId   │ │ name, email    │
         └──────────────────┘ └─────────────┘ └────────────────┘
```

### Core Models (Tenant-Scoped)

| Model               | tenantId    | Required?       | Index                 |
| ------------------- | ----------- | --------------- | --------------------- |
| `Tenant`            | N/A (root)  | —               | `@@index([domain])`   |
| `User`              | `tenantId?` | Optional        | `@@index([tenantId])` |
| `Audit`             | `tenantId`  | ✅ **Required** | `@@index([tenantId])` |
| `Finding`           | `tenantId?` | Denormalized    | `@@index([tenantId])` |
| `Proposal`          | `tenantId?` | Denormalized    | `@@index([tenantId])` |
| `EvidenceSnapshot`  | `tenantId?` | Denormalized    | `@@index([tenantId])` |
| `ApiKey`            | `tenantId`  | ✅ **Required** | `@@index([tenantId])` |
| `ProspectLead`      | `tenantId`  | ✅ **Required** | `@@index([tenantId])` |
| `OutreachEmail`     | `tenantId`  | ✅ **Required** | `@@index([tenantId])` |
| `GeneratedArtifact` | `tenantId`  | ✅ **Required** | `@@index([tenantId])` |

### Tenant Isolation Enforcement

```typescript
// Three-layer defense strategy:

// Layer 1: Auth Middleware (lib/middleware/auth.ts)
export function withAuth(handler: Function) {
  // Validates API key or session, extracts tenantId
  return runWithTenantAsync(tenantId, () => handler(req));
}

// Layer 2: AsyncLocalStorage Context (lib/tenant/context.ts)
const tenantStorage = new AsyncLocalStorage<string>();
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run(tenantId, fn);
}

// Layer 3: Scoped Prisma Extension (lib/tenant/context.ts)
export function createScopedPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      audit: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId }; // Auto-inject
          return query(args);
        },
      },
    },
  });
}
```

---

## 3. Pipeline Topology

### Complete Audit → Proposal Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HTTP REQUEST: POST /api/audit                     │
│  withAuth() → getTenantId() → createScopedPrisma()                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AUDIT RUNNER (lib/audit/runner.ts)               │
│  runAudit(auditId)                                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼               ▼               ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
         │ runWebsite   │  │ runGBPModule │  │ runCompetitor│
         │ Module()     │  │ ()           │  │ Module()     │
         └──────────────┘  └──────────────┘  └──────────────┘
                    │               │               │
                    └───────────────┴───────────────┘
                                    │
                                    ▼
         ┌────────────────────────────────────────────────────────┐
         │  Finding Generators + Evidence Snapshots               │
         │  generateWebsiteFindings(), generateGBPFindings()...   │
         │  Output: Finding[], EvidenceSnapshot[]                 │
         └────────────────────────────────────────────────────────┘
                                    │
                                    ▼
         ┌────────────────────────────────────────────────────────┐
         │  prisma.finding.createMany({ data: allFindings })      │
         │  prisma.evidenceSnapshot.create({ ... })               │
         └────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROPOSAL GENERATION (lib/proposal/runner.ts)          │
│  generateProposal(auditId)                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    DIAGNOSIS PIPELINE (lib/diagnosis/index.ts)           │
│  runDiagnosisPipeline(findings, tracker, parentTrace, playbook)         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ preClusterFind  │───▶│ llmClusterFindings  │───▶│ validateClusters    │
│ ings()          │    │ () [Gemini Flash]   │    │ () [Rule-based]     │
│ [Rule-based]    │    │                     │    │                     │
└─────────────────┘    └─────────────────────┘    └─────────────────────┘
                                                            │
                                                            ▼
                                               ┌─────────────────────┐
                                               │ generateNarratives  │
                                               │ () [Gemini Pro]     │
                                               └─────────────────────┘
                                                            │
                                                            ▼
                                               ┌─────────────────────┐
                                               │ DiagnosisResult     │
                                               │ { clusters, meta }  │
                                               └─────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROPOSAL PIPELINE (lib/proposal/index.ts)             │
│  runProposalPipeline(businessName, industry, clusters, findings...)     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ normalizeFinding│───▶│ mapToTiers()        │───▶│ getPricing()        │
│ sForProposal()  │    │ [Essentials/Growth/ │    │ [Industry-based]    │
│ [Dedupe, Clamp] │    │  Premium]           │    │                     │
└─────────────────┘    └─────────────────────┘    └─────────────────────┘
                                                            │
                        ┌───────────────────────────────────┘
                        ▼
        ┌─────────────────────────────┐    ┌─────────────────────┐
        │ calculateTierROI()          │───▶│ generateExecutive   │
        │ [best/base/worst scenarios] │    │ Summary() [Gemini]  │
        └─────────────────────────────┘    └─────────────────────┘
                                                            │
                                                            ▼
                                               ┌─────────────────────┐
                                               │ validateCitations() │
                                               │ [Evidence backcheck]│
                                               └─────────────────────┘
                                                            │
                                                            ▼
                                               ┌─────────────────────┐
                                               │ ProposalResult      │
                                               │ (see interface)     │
                                               └─────────────────────┘
```

### LangGraph StateGraph Implementations

#### DiagnosisGraph (lib/graph/diagnosis-graph.ts)

```
__start__
    │
    ▼
┌─────────────────┐
│ parse_findings  │  Extract findings from state
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ cluster_root_   │  Gemini Flash semantic clustering
│ causes          │  OR single-pass with aggregated context
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ rank_by_impact  │  Sort by severity
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ classify_       │  High severity → Painkillers
│ painkillers     │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ classify_       │  Lower severity → Vitamins
│ vitamins        │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ generate_       │  Gemini Pro narrative generation
│ narrative       │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ validate_       │  Rule-based cluster validation
│ diagnosis       │  All findings accounted for?
└─────────────────┘
    │
    ▼
__end__
```

#### ProposalGraph (lib/graph/proposal-graph.ts)

```
__start__
    │
    ▼
┌─────────────────┐
│ map_to_tiers    │  Impact + effort → Essentials/Growth/Premium
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ calculate_      │  Industry-based pricing with multiplier
│ pricing         │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ draft_proposal  │  Generate executive summary
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ generate_       │  ROI scenarios (best/base/worst)
│ roi_model       │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ validate_claims │  Ensure all claims backed by findings
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ apply_tone      │  Tone adjustment (placeholder)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ format_output   │  Build ProposalResult JSON
└─────────────────┘
    │
    ▼
__end__
```

#### AdversarialQAGraph (lib/graph/adversarial-qa-graph.ts)

```
__start__
    │
    ▼
┌─────────────────┐
│ hallucination_  │  Gemini Pro sweeps for unsupported claims
│ sweep           │  Output: HallucinationFlag[]
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ consistency_    │  Check for internal contradictions
│ check           │  Output: ConsistencyFlag[]
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ competitor_     │  Verify competitor claims are fair
│ fairness        │  Output: CompetitorFairnessFlag[]
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ apply_confidence│  Score confidence, soften LOW claims
│ _and_soften     │  Output: hardenedContent
└─────────────────┘
    │
    ▼
__end__
```

---

## 4. Strict Guardrails

> **⚠️ These rules MUST NOT be broken in future updates.**

### A. Multi-Tenancy

| Rule                               | Enforcement                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| **Always filter by `tenantId`**    | Use `createScopedPrisma()` or explicit `where: { tenantId }` |
| **Never bypass `withAuth()`**      | All protected routes must use auth middleware                |
| **Never expose cross-tenant data** | List/aggregate endpoints must always scope queries           |
| **API keys are tenant-scoped**     | `pe_live_*` keys resolve to single tenant                    |

```typescript
// ✅ CORRECT
const audits = await prisma.audit.findMany({
  where: { tenantId, status: "COMPLETE" },
});

// ❌ WRONG
const audits = await prisma.audit.findMany({
  where: { status: "COMPLETE" }, // Missing tenantId!
});
```

### B. Observability

| Rule                               | Enforcement                                       |
| ---------------------------------- | ------------------------------------------------- |
| **Never bypass LangSmith tracing** | All LLM calls must use `traceLlmCall()`           |
| **Always include metadata**        | Trace must include `node`, `auditId`, `model`     |
| **Log structured data**            | Use `logger.info({ event, ... }, message)` format |
| **Never log sensitive data**       | API keys, passwords, PII must be redacted         |

```typescript
// ✅ CORRECT
await traceLlmCall({
    name: "clustering",
    run_type: "chain",
    inputs: { findings },
    metadata: { node: 'cluster_root_causes', auditId }
}, async () => { ... });

// ❌ WRONG
const result = await model.generateContent(prompt);  // No tracing!
```

### C. Cost Control

| Rule                                  | Enforcement                                           |
| ------------------------------------- | ----------------------------------------------------- |
| **Respect the $1.00 alert threshold** | Monitor `CostTracker.totalCents` during audit         |
| **Default to Gemini Flash**           | Use Pro/3.1 Pro only when necessary                   |
| **Track all LLM calls**               | Every call must go through `CostTracker.addLlmCall()` |
| **Thinking budgets are per-node**     | Use `getThinkingBudgetForNode()` for allocation       |

```typescript
// ✅ CORRECT
const result = await generateWithGemini({
    model: MODEL_CONFIG.diagnosis.model,  // Defaults to Flash
    thinkingBudget: getThinkingBudgetForNode('cluster_root_causes'),
    metadata: { node: 'cluster_root_causes', auditId }
});

if (tracker && result.usageMetadata) {
    tracker.addLlmCall('GEMINI_31_PRO', usage.promptTokenCount, ...);
}
```

### D. Pipeline Integrity

| Rule                                            | Enforcement                                          |
| ----------------------------------------------- | ---------------------------------------------------- |
| **Never put core logic in Temporal activities** | Temporal is NOT implemented; use native orchestrator |
| **Validate all citations**                      | Claims must reference existing finding IDs           |
| **Handle module failures gracefully**           | Use `Promise.allSettled()` for parallel modules      |
| **Never skip diagnosis validation**             | All clusters must pass `validateClusters()`          |

```typescript
// ✅ CORRECT
const validation = validateClusters(clusters, findings);
if (!validation.valid) {
  console.error("Validation failed:", validation.errors);
  // Fallback to pre-clusters
}

// ❌ WRONG
// Skipping validation and using raw clusters directly
```

### E. Database Operations

| Rule                                    | Enforcement                                     |
| --------------------------------------- | ----------------------------------------------- |
| **Use transactions for related writes** | Wrap multiple writes in `prisma.$transaction()` |
| **Never N+1 query**                     | Use `include` or batch queries                  |
| **Cascade deletes where appropriate**   | Set `onDelete: Cascade` on relations            |
| **Index frequently queried fields**     | `tenantId`, `status`, `createdAt`               |

### F. Security

| Rule                              | Enforcement                                               |
| --------------------------------- | --------------------------------------------------------- |
| **Hash API keys before storage**  | SHA256 hash stored in `keyHash` field                     |
| **Validate JWT on every request** | Session must be verified via `auth()`                     |
| **CORS only on widget routes**    | `Access-Control-Allow-Origin: *` only for `/api/widget/*` |
| **Rate limit API keys**           | Enforce `rateLimitPerDay` (default 1000/day)              |

---

## 5. Environment Requirements

### Required Variables

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/db"

# Authentication
API_KEY="pe_live_xxx"              # Bearer token for API access
ADMIN_SECRET="xxx"                  # Admin endpoints

# Google APIs (Required for Audits)
GOOGLE_PAGESPEED_API_KEY="xxx"      # PageSpeed Insights
GOOGLE_PLACES_API_KEY="xxx"         # GBP/Local search
GOOGLE_AI_API_KEY="xxx"             # Gemini LLM
GCP_PROJECT_ID="my-project"         # GCP project ID
GCP_REGION="us-central1"            # GCP region

# External APIs
SERP_API_KEY="xxx"                  # Competitor search
```

### Optional Variables

```bash
# LangSmith Tracing
LANGCHAIN_API_KEY="xxx"
LANGCHAIN_PROJECT="proposalos"
LANGSMITH_WORKSPACE_ID="xxx"

# Email (Resend)
RESEND_API_KEY="xxx"
RESEND_FROM_EMAIL="noreply@domain.com"

# Cloud Storage
GCS_BUCKET_NAME="my-bucket"

# Redis Cache
REDIS_URL="redis://localhost:6379"

# Stripe Billing
STRIPE_SECRET_KEY="sk_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"

# Feature Flags
GEMINI_31_PRO_ENABLED="true"
GEMINI_31_PRO_TRAFFIC_PCT="10"
```

### ⚠️ Notable Absence

- **No Temporal variables** — System does NOT use Temporal Cloud
- Use custom `AuditOrchestrator` for orchestration

---

## 6. Deployment Configuration

### Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
RUN npx prisma generate
ENV SKIP_ENV_VALIDATION=true
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PORT=8080
CMD ["node", "server.js"]
```

### Cloud Run Configuration

```yaml
# cloudbuild.yaml
gcloud run deploy proposal-engine:
  --memory: 1Gi
  --cpu: 1
  --min-instances: 0          # Scale to zero
  --max-instances: 5          # Cap at 5 instances
  --port: 8080
  --platform: managed
  --allow-unauthenticated
```

### Resource Limits

| Parameter       | Value                   |
| --------------- | ----------------------- |
| Memory          | 1Gi                     |
| CPU             | 1 vCPU                  |
| Min Instances   | 0 (scale-to-zero)       |
| Max Instances   | 5                       |
| Request Timeout | 60s (Cloud Run default) |
| Concurrency     | 80 (Cloud Run default)  |

---

## Appendix: Key File Locations

```
ProposalOS/
├── app/
│   ├── api/                    # Next.js API routes
│   │   ├── audit/              # Audit endpoints
│   │   ├── proposal/           # Proposal endpoints
│   │   ├── billing/webhook/    # Stripe webhook
│   │   └── widget/quick-audit/ # Widget endpoint
│   └── (dashboard)/            # Dashboard pages
├── lib/
│   ├── audit/runner.ts         # Canonical audit execution
│   ├── diagnosis/              # Diagnosis pipeline
│   │   ├── index.ts            # Main pipeline
│   │   ├── llmCluster.ts       # Gemini clustering
│   │   └── validation.ts       # Rule-based validation
│   ├── proposal/               # Proposal pipeline
│   │   ├── index.ts            # Main pipeline
│   │   ├── tierMapping.ts      # Tier assignment
│   │   ├── pricing.ts          # Industry pricing
│   │   └── validation.ts       # Citation validation
│   ├── graph/                  # LangGraph definitions
│   │   ├── diagnosis-graph.ts
│   │   ├── proposal-graph.ts
│   │   ├── delivery-graph.ts
│   │   └── adversarial-qa-graph.ts
│   ├── llm/provider.ts         # Gemini abstraction
│   ├── tenant/context.ts       # Multi-tenancy context
│   ├── middleware/auth.ts      # Auth middleware
│   ├── costs/costTracker.ts    # Cost tracking
│   └── tracing.ts              # LangSmith tracing
├── prisma/
│   └── schema.prisma           # Database schema
├── Dockerfile                  # Cloud Run container
├── cloudbuild.yaml             # CI/CD pipeline
└── .env.example                # Environment template
```

---

**End of CURRENT_STATE.md**
