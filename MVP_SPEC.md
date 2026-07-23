# MVP Specification for Proposal Engine

<aside>
🚀

**MVP Promise:** Give me a business name + city, and in under 90 seconds I'll hand you an evidence-backed audit report and a close-ready 3-tier proposal — painkillers first, vitamins second — that you send as-is to close the deal.

</aside>

---

## Target User

**You** — a solo agency operator running Proposal Engine internally. You find local businesses, run an audit, generate a proposal, and send it to close a deal. No dashboard needed. No onboarding flow. Just input → output → revenue.

**User profile:**

- Technical founder who can debug and iterate
- Sells digital marketing / web services to local SMBs
- Needs to send 5–20 proposals per week
- Values speed and evidence over polish

---

## Success Criteria (14–30 Days)

| Criterion | Target | Measurement | Kill If |
| --- | --- | --- | --- |
| **End-to-end audit completes** | ≥80% success rate | audits.status = 'complete' / total | <50% |
| **Audit runtime** | <90 seconds (3 modules) | completed_at - started_at | >5 minutes |
| **Every claim cites evidence** | 100% citation rate | Validation node pass rate | <90% |
| **Proposals sent to real prospects** | ≥10 proposals sent | proposals.status = 'sent' | <3 |
| **At least 1 deal closed** | ≥1 accepted proposal | proposals.status = 'accepted' | 0 after 30 days |
| **Cost per audit** | <$1.00 (LLM + APIs) | audits.api_cost_cents | >$3.00 |
| **Proposal reads as handcrafted** | 8/10 on blind review | Self-review + 2 peer reviews | <6/10 |

---

## MVP Feature List

### Must Have (Week 1–4)

- [ ]  **Audit input:** Accept business name + city OR business URL
- [ ]  **Module: Website Performance** — Lighthouse scores, mobile/desktop, Core Web Vitals, basic crawl (title, meta, H1, broken links)
- [ ]  **Module: Google Business Profile** — Completeness check, review count/rating, category accuracy, photo count, hours, Q&A
- [ ]  **Module: Competitor Comparison** — Top 3 local competitors from SERP/local pack, side-by-side scores
- [ ]  **Findings normalization** — All modules output Finding objects with Evidence
- [ ]  **Diagnosis engine** — LangGraph: cluster findings → score → validate citations → generate narrative
- [ ]  **Proposal compiler** — LangGraph: pain clusters → 3-tier packages → pricing → executive summary
- [ ]  **Validation node** — Reject any uncited claim, re-generate with feedback
- [ ]  **Export: Shareable web page** — `/proposal/[token]` with dark professional theme
- [ ]  **Export: PDF** — Generated from the web page, downloadable
- [ ]  **LangSmith tracing** — Every LLM call traced with input/output/cost
- [ ]  **Workflow orchestration** — Temporal parent + child workflows with retries and degraded mode
- [ ]  **Postgres storage** — audits, findings, proposals tables with basic schema

### Should Have (Week 5–6)

- [ ]  **Edit findings** — Manually adjust/remove findings before proposal generation
- [ ]  **Regenerate proposal** — Re-run proposal compiler after edits
- [ ]  **Proposal status tracking** — draft → ready → sent → viewed → accepted/rejected
- [ ]  **Cost tracking** — Actual LLM + API cost per audit logged
- [ ]  **Basic CLI or simple web form** — Trigger audits without hitting API directly
- [ ]  **10 golden test audits** — Human-verified baseline for eval

### Could Have (Week 7–8)

- [ ]  Email delivery of proposal link
- [ ]  Proposal view tracking (when prospect opens the link)
- [ ]  Basic agency dashboard (list audits, view proposals)
- [ ]  Vertical playbook templates (dentist, roofer, restaurant)
- [ ]  Batch audit mode (CSV of business names)

### Explicitly Out of Scope

- ❌ Multi-tenancy / white-label branding
- ❌ B2C self-serve signup
- ❌ Ahrefs/SEMrush backlink analysis
- ❌ Full citations/NAP scanning
- ❌ Ad library analysis
- ❌ Advanced dashboards or analytics
- ❌ Complex onboarding flows
- ❌ Stripe billing / subscriptions
- ❌ n8n / Dify (unless proven faster)
- ❌ Custom domains

---

## Non-Functional Requirements

### Speed

- Full audit (3 modules) completes in <90 seconds
- Proposal generation <30 seconds after audit completes
- PDF export <10 seconds
- Web proposal page loads in <2 seconds

### Reliability

- If 1 module fails, other 2 still complete (degraded mode)
- Temporal retries failed activities up to 3 times with exponential backoff
- Idempotency keys prevent duplicate work on retry
- Partial results are saved — never lose completed module data

### Evidence Quality

- 100% of claims backed by Evidence objects
- Every Evidence has a verifiable `pointer` (URL, API response)
- Confidence scores ≤4 show visible disclaimers
- No fabricated URLs or metrics — validation node enforces

### Cost

- Target <$0.50/audit variable cost
- Hard ceiling: $1.00/audit (circuit breaker stops LLM calls)
- Use GPT-3.5-turbo / Claude Haiku for clustering/scoring
- GPT-4 / Claude Sonnet only for executive summary narrative

---

## MVP Architecture (Summary)

```
Input (name+city or URL)
  → Temporal: AuditOrchestrator
    → Child: WebsiteModule (Lighthouse API + crawl)
    → Child: GBPModule (Google Places API + scrape)
    → Child: CompetitorModule (SERP API + local pack)
  → Findings[] stored in Postgres
  → LangGraph: DiagnosisGraph (cluster → score → validate → narrate)
  → LangGraph: ProposalGraph (tiers → pricing → summary)
  → Proposal stored in Postgres
  → Web page at /proposal/[token]
  → PDF generated from web page
```

---

## Definition of Done: MVP

- [ ]  Run `audit("Joe's Plumbing", "Saskatoon")` and get a complete audit + proposal in <90 seconds
- [ ]  Every finding has evidence with a real, verifiable pointer
- [ ]  Proposal has 3 tiers with pricing, painkillers first
- [ ]  PDF exports cleanly and looks professional
- [ ]  Web proposal page is shareable and renders on mobile
- [ ]  10 audits run on real businesses with 0 hallucinated claims
- [ ]  1 proposal sent to a real prospect
- [ ]  LangSmith shows full trace for every audit pass

---

## Flow 1: Run Audit → Generate Proposal → Export → Send

```
1. Operator enters: business_name + city  OR  business_url
2. System resolves URL (if name+city: Google Places lookup → extract website)
3. Temporal starts AuditOrchestrator workflow
   3a. Child: WebsiteModule runs (Lighthouse + crawl) → Finding[]
   3b. Child: GBPModule runs (Places API + scrape) → Finding[]
   3c. Child: CompetitorModule runs (SERP + local pack) → Finding[]
4. All Finding[] stored in Postgres
5. LangGraph DiagnosisGraph runs:
   5a. Cluster findings by root cause → PainCluster[]
   5b. Score each cluster (impact + confidence)
   5c. Validation node checks all citations → reject/pass
   5d. Narrative node generates human-readable explanations
6. LangGraph ProposalGraph runs:
   6a. Map findings to 3 tiers (essentials/growth/premium)
   6b. Generate pricing per tier
   6c. Generate executive summary (evidence-backed)
   6d. Compile full Proposal object
7. Proposal stored in Postgres with web_link_token
8. Web proposal page live at /proposal/[token]
9. PDF generated from web page (Puppeteer/Playwright)
10. Operator reviews proposal → copies link or downloads PDF
11. Operator emails prospect with link/PDF
```

### Acceptance Criteria

- [ ]  End-to-end completes in <90 seconds for 3 modules
- [ ]  All 3 modules produce ≥1 Finding each
- [ ]  Every Finding has ≥1 Evidence with non-null `pointer`
- [ ]  Validation node passes on first attempt ≥85% of the time
- [ ]  Proposal contains exactly 3 tiers with pricing
- [ ]  Executive summary references specific Finding IDs
- [ ]  Web page renders correctly on desktop and mobile
- [ ]  PDF is <5MB and renders all content cleanly
- [ ]  LangSmith trace shows full pipeline with cost breakdown
- [ ]  Audit status transitions: queued → running → complete

---

## Flow 2: Edit Findings → Regenerate → Approve → Deliver

```
1. Operator views completed audit findings
2. Operator edits findings:
   2a. Remove irrelevant findings (mark as excluded)
   2b. Adjust impact_score or confidence_score
   2c. Add manual findings (from personal knowledge)
   2d. Edit finding descriptions or titles
3. Operator triggers "Regenerate Proposal"
4. System re-runs ProposalGraph with edited findings:
   4a. Re-clusters based on updated finding set
   4b. Re-maps to tiers
   4c. Re-generates executive summary
   4d. Re-validates all citations
5. New Proposal version stored (old version preserved)
6. Operator reviews regenerated proposal
7. If satisfied → marks as "ready"
8. If not → repeats from step 2 (max 3 regenerations)
9. Once "ready" → operator sends via email/link
10. Proposal status: draft → ready → sent
```

### Acceptance Criteria

- [ ]  Editing a finding and regenerating produces a visibly different proposal
- [ ]  Removed findings do not appear in regenerated proposal
- [ ]  Added manual findings are included with `confidence_score: 10` (human-verified)
- [ ]  Previous proposal versions are preserved (not overwritten)
- [ ]  Regeneration completes in <30 seconds
- [ ]  Max 3 regeneration cycles before system suggests manual editing
- [ ]  Proposal status correctly transitions through states
- [ ]  Edited findings are flagged as `manually_edited: true` in the database

---

## Flow 3: Degraded Mode (Module Failures)

```
Scenario A: 1 of 3 modules fails
1. Module times out or throws error
2. Temporal marks module as failed in audit.modules_failed
3. Other 2 modules complete normally
4. Audit status = 'partial' (not 'complete')
5. Diagnosis runs on available findings with disclaimer:
   "Note: [Module] data was unavailable. This analysis is based on 
    [available modules] only. Results may be incomplete."
6. Proposal generates with visible caveat in executive summary
7. Proposal is still usable — just has gaps clearly marked

Scenario B: 2 of 3 modules fail
1. Only 1 module completes
2. Audit status = 'partial'
3. System generates findings list (no clustering — too sparse)
4. Proposal is flagged as "Limited Assessment"
5. Only essentials tier is populated (not enough data for 3 tiers)
6. Operator warned: "Limited data available. Consider re-running or 
   supplementing with manual findings."

Scenario C: All 3 modules fail
1. Audit status = 'failed'
2. No findings generated
3. No proposal generated
4. Operator notified with failure reasons per module
5. System suggests: retry, check URL validity, try alternate input
6. Failed audit logged for debugging (full error context in LangSmith)
```

### Acceptance Criteria

- [ ]  1-module failure still produces a usable (if limited) proposal
- [ ]  Partial audits are clearly labeled — never presented as complete
- [ ]  Disclaimers appear in both the audit report and the proposal
- [ ]  Failed modules show specific error reason (timeout, 403, API error)
- [ ]  Retry button available for failed audits
- [ ]  All 3 modules fail → no proposal generated, clear error message
- [ ]  Temporal logs show which modules failed and why
- [ ]  No silent failures — every failure is visible to the operator

---

## Flow 4: Proposal Delivery & Tracking

```
1. Operator copies shareable link: /proposal/[token]
2. Operator pastes link into email to prospect
3. Prospect clicks link → web proposal loads
4. System logs: viewed_at timestamp on proposal record
5. Prospect reads report:
   - Executive summary (evidence-backed)
   - Key findings with severity indicators
   - 3-tier package options with pricing
   - Next steps / CTAs
6. Prospect can:
   a. Download PDF version
   b. Reply to operator (email CTA in proposal)
   c. Click "Accept" on a tier (future feature)
7. Operator checks proposal status: sent → viewed
8. Operator follows up based on viewed/not-viewed status
```

### Acceptance Criteria

- [ ]  Shareable link works without authentication
- [ ]  Proposal page loads in <2 seconds
- [ ]  `viewed_at` is set on first visit (not on operator's own views)
- [ ]  PDF download works from the web page
- [ ]  Proposal page looks professional on mobile and desktop
- [ ]  No sensitive data exposed beyond what's in the proposal itself
- [ ]  Token is unguessable (64-char random string)

---

## State Machine: Audit Lifecycle

```
[queued] ──→ [running] ──→ [complete]
                │              │
                │              └──→ Proposal: [draft] → [ready] → [sent] → [viewed]
                │
                ├──→ [partial]  (1-2 modules failed, findings available)
                │       └──→ Proposal: [draft] → [ready] → [sent] → [viewed]
                │
                └──→ [failed]   (all modules failed, no findings)
                        └──→ No proposal. Retry available.
```

## State Machine: Proposal Lifecycle

```
[draft] ──→ [ready] ──→ [sent] ──→ [viewed] ──→ [accepted]
  │           │                                     │
  │           └── (edit) ──→ [draft]                └──→ [rejected]
  │
  └── (regenerate) ──→ [draft]
```

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENTRY LAYER                              │
│  CLI: `audit "Joe's Plumbing" "Saskatoon"`                     │
│  API: POST /api/audit { name, city } or { url }               │
│  Web Form: Simple Next.js page (stretch goal)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ORCHESTRATION (Temporal Cloud)                │
│                                                                 │
│  AuditOrchestrator (parent workflow)                           │
│  ├── Activity: resolveBusinessUrl(name, city)                  │
│  ├── Child WF: WebsiteAuditWorkflow ──→ Finding[]              │
│  ├── Child WF: GBPAuditWorkflow ──→ Finding[]                  │
│  ├── Child WF: CompetitorAuditWorkflow ──→ Finding[]           │
│  ├── Activity: storeFindingsInPostgres(findings)               │
│  ├── Activity: runDiagnosisGraph(findings) ──→ PainCluster[]   │
│  ├── Activity: runProposalGraph(clusters) ──→ Proposal         │
│  ├── Activity: storeProposal(proposal)                         │
│  └── Activity: generatePDF(proposal_id) ──→ pdf_url            │
│                                                                 │
│  Config: startToCloseTimeout=60s per activity                  │
│          retryPolicy: maxAttempts=3, backoff=exponential        │
│          idempotencyKey: audit_id + module_name                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Website     │ │  GBP         │ │  Competitor   │
│  Module      │ │  Module      │ │  Module       │
│              │ │              │ │               │
│ Lighthouse   │ │ Places API   │ │ SERP API      │
│ Crawl (fetch)│ │ GBP Scrape   │ │ Local Pack    │
│ → Finding[]  │ │ → Finding[]  │ │ → Finding[]   │
└──────┬───────┘ └──────┬───────┘ └───────┬───────┘
       │                │                 │
       └────────────────┼─────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DIAGNOSIS (LangGraph)                        │
│                                                                 │
│  DiagnosisGraph:                                               │
│  findings[] → pre_cluster(rules) → llm_refine_clusters         │
│            → score(deterministic) → validate(rule-based)        │
│            → narrate(LLM) → output PainCluster[]               │
│                                                                 │
│  ProposalGraph:                                                │
│  clusters[] → map_to_tiers(rules) → generate_pricing           │
│            → write_executive_summary(LLM)                      │
│            → validate_citations(rules) → output Proposal       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE (Postgres)                         │
│                                                                 │
│  Tables: audits, findings, proposals, evidence_snapshots       │
│  File storage: Cloud Storage (PDFs, screenshots)               │
│  Indexes: audit_id, status, web_link_token                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OUTPUT LAYER (Next.js)                      │
│                                                                 │
│  /proposal/[token]  → Public shareable proposal page           │
│  /api/proposal/[token]/pdf  → PDF download endpoint            │
│  /api/audit  → POST trigger new audit                          │
│  /api/audit/[id]  → GET audit status + findings                │
│  /api/audit/[id]/proposal  → GET proposal for audit            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Services & Components

| Component | Technology | Responsibility | Deployment |
| --- | --- | --- | --- |
| **API Server** | Next.js 14 (App Router) | API routes, proposal web pages, PDF generation | Vercel or Cloud Run |
| **Temporal Worker** | Node.js + @temporalio/worker | Runs all workflow + activity code | Cloud Run (long-running) |
| **Temporal Cloud** | Managed service | Workflow scheduling, durability, retry | [temporal.io](http://temporal.io) (SaaS) |
| **LangGraph Runtime** | Python (langgraph + langchain) | Diagnosis + Proposal compilation | Cloud Run or colocated with worker |
| **LangSmith** | Managed service | LLM tracing, eval, cost tracking | [smith.langchain.com](http://smith.langchain.com) (SaaS) |
| **Postgres** | Neon / Supabase / Cloud SQL | Audits, findings, proposals, evidence | Managed Postgres |
| **Cloud Storage** | GCS or S3 | PDFs, screenshots, raw API responses | Managed object storage |

---

## Workflow Orchestration Details

### Temporal Configuration

```tsx
// AuditOrchestrator workflow
const auditOrchestrator = async (input: AuditInput) => {
  // Step 1: Resolve business URL
  const resolved = await resolveBusinessUrl(input);
  
  // Step 2: Run modules in parallel (child workflows)
  const results = await Promise.allSettled([
    executeChild(websiteAuditWorkflow, { url: resolved.url }),
    executeChild(gbpAuditWorkflow, { name: resolved.name, city: resolved.city }),
    executeChild(competitorAuditWorkflow, { name: resolved.name, city: resolved.city }),
  ]);
  
  // Step 3: Collect findings (handle partial failures)
  const findings = collectFindings(results);
  const status = determineAuditStatus(results); // complete | partial | failed
  
  if (status === 'failed') return { status: 'failed', errors: getErrors(results) };
  
  // Step 4: Store findings
  await storeFindings(audit_id, findings);
  
  // Step 5: Run diagnosis + proposal
  const diagnosis = await runDiagnosisGraph(findings);
  const proposal = await runProposalGraph(diagnosis, resolved);
  
  // Step 6: Store proposal + generate PDF
  await storeProposal(audit_id, proposal);
  const pdf_url = await generatePDF(proposal.id);
  
  return { status, proposal_id: proposal.id, pdf_url };
};
```

### Retry & Idempotency

| Activity | Timeout | Max Retries | Backoff | Idempotency Key |
| --- | --- | --- | --- | --- |
| resolveBusinessUrl | 15s | 2 | 1s, 3s | audit_id + "resolve" |
| websiteAuditWorkflow | 45s | 2 | 5s, 15s | audit_id + "website" |
| gbpAuditWorkflow | 30s | 2 | 5s, 15s | audit_id + "gbp" |
| competitorAuditWorkflow | 30s | 2 | 5s, 15s | audit_id + "competitor" |
| runDiagnosisGraph | 30s | 2 | 3s, 10s | audit_id + "diagnosis" |
| runProposalGraph | 30s | 2 | 3s, 10s | audit_id + "proposal" |
| generatePDF | 20s | 2 | 3s, 5s | proposal_id + "pdf" |

---

## Storage Design

### Postgres Schema (MVP)

```sql
-- Audits
CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  business_city VARCHAR(255),
  business_url VARCHAR(500),
  business_industry VARCHAR(100),
  status VARCHAR(20) DEFAULT 'queued'
    CHECK (status IN ('queued','running','complete','partial','failed')),
  modules_completed TEXT[] DEFAULT '{}',
  modules_failed JSONB DEFAULT '[]',
  overall_score INTEGER,
  api_cost_cents INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Findings
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  module VARCHAR(30) NOT NULL,
  category VARCHAR(30) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('painkiller','vitamin')),
  title VARCHAR(120) NOT NULL,
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '[]',
  metrics JSONB DEFAULT '{}',
  impact_score INTEGER NOT NULL CHECK (impact_score BETWEEN 1 AND 10),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 1 AND 10),
  effort_estimate VARCHAR(10) CHECK (effort_estimate IN ('low','medium','high')),
  recommended_fix JSONB DEFAULT '[]',
  manually_edited BOOLEAN DEFAULT FALSE,
  excluded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_findings_audit ON findings(audit_id);

-- Proposals
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id),
  version INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft','ready','sent','viewed','accepted','rejected')),
  executive_summary TEXT,
  pain_clusters JSONB DEFAULT '[]',
  tier_essentials JSONB DEFAULT '{}',
  tier_growth JSONB DEFAULT '{}',
  tier_premium JSONB DEFAULT '{}',
  pricing JSONB DEFAULT '{}',
  assumptions TEXT[] DEFAULT '{}',
  disclaimers TEXT[] DEFAULT '{}',
  next_steps TEXT[] DEFAULT '{}',
  pdf_url VARCHAR(500),
  web_link_token VARCHAR(64) UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_proposals_audit ON proposals(audit_id);
CREATE INDEX idx_proposals_token ON proposals(web_link_token);

-- Evidence snapshots (raw API responses for auditability)
CREATE TABLE evidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  module VARCHAR(30) NOT NULL,
  source VARCHAR(100) NOT NULL,
  raw_response JSONB NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_evidence_audit ON evidence_snapshots(audit_id);
```

### File Storage

```
gs://proposal-engine-storage/
  └── audits/
      └── {audit_id}/
          ├── screenshots/
          │   ├── lighthouse-desktop.png
          │   ├── lighthouse-mobile.png
          │   └── gbp-listing.png
          ├── raw/
          │   ├── lighthouse-response.json
          │   ├── places-api-response.json
          │   └── serp-response.json
          └── output/
              └── proposal-{proposal_id}.pdf
```

---

## API Endpoints (MVP)

| Method | Endpoint | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/audit` | Start a new audit. Body: `{ name, city }` or `{ url }` | API key |
| GET | `/api/audit/[id]` | Get audit status, findings, module results | API key |
| GET | `/api/audit/[id]/proposal` | Get proposal for this audit | API key |
| POST | `/api/audit/[id]/regenerate` | Re-run proposal with edited findings | API key |
| PATCH | `/api/finding/[id]` | Edit a finding (score, description, exclude) | API key |
| PATCH | `/api/proposal/[id]/status` | Update proposal status (ready, sent) | API key |
| GET | `/proposal/[token]` | Public shareable proposal page | None (public) |
| GET | `/proposal/[token]/pdf` | Download PDF version | None (public) |
| GET | `/api/health` | Health check (DB, Temporal, LLM API) | None |

---

## LangGraph / LLM Integration

### Option A: Python Sidecar (Recommended)

LangGraph runs as a separate Python service (Cloud Run). Temporal activities call it via HTTP.

```
Temporal Worker (Node.js)
  → HTTP POST to LangGraph Service (Python)
  → LangGraph Service runs DiagnosisGraph or ProposalGraph
  → Returns JSON result
  → Temporal Worker stores result in Postgres
```

### Option B: LangGraph.js (Alternative)

If you want to stay Node.js-only, use `@langchain/langgraph` (JS). Slightly less mature than Python but avoids a second service.

**Recommendation:** Start with Option A (Python sidecar) since LangGraph Python is more mature, better documented, and has native LangSmith integration.

---

## Environment Variables (MVP)

```bash
# Postgres
DATABASE_URL=postgresql://...

# Temporal
TEMPORAL_ADDRESS=your-namespace.tmprl.cloud:7233
TEMPORAL_NAMESPACE=proposal-engine
TEMPORAL_TLS_CERT_PATH=./certs/client.pem
TEMPORAL_TLS_KEY_PATH=./certs/client.key

# LLM
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=proposal-engine-mvp

# Google APIs
GOOGLE_PLACES_API_KEY=AIza...
GOOGLE_PAGESPEED_API_KEY=AIza...

# SERP API
SERP_API_KEY=...

# Storage
GCS_BUCKET=proposal-engine-storage

# App
API_KEY=pe_...
BASE_URL=https://app.proposalengine.com
```

---

## Epics Overview

| Epic | Week | Deliverable | Owner | Risks | DoD |
| --- | --- | --- | --- | --- | --- |
| **E1: Foundation** | 1 | Postgres schema, Temporal setup, project scaffolding, API skeleton | Danish | Temporal Cloud account setup may take 1–2 days | Can trigger an audit via CLI that creates a DB record and starts a Temporal workflow |
| **E2: Data Collection** | 2 | 3 audit modules producing real Finding[] from real APIs | Danish | API keys, rate limits, scraping flakiness | Each module returns ≥3 Findings with real Evidence for a known test business |
| **E3: Diagnosis** | 3 | LangGraph diagnosis pipeline: cluster → score → validate → narrate | Danish | LangGraph learning curve, LLM consistency | 10 test findings → consistent clusters, 0 uncited claims, narratives read naturally |
| **E4: Proposal** | 4 | Proposal compiler + web page + PDF export | Danish | PDF generation complexity, proposal quality | Full proposal with 3 tiers, pricing, executive summary, shareable link, downloadable PDF |
| **E5: Integration** | 5 | End-to-end pipeline, editing, regeneration, status tracking | Danish | Integration bugs, timing issues | Full audit → proposal in <90s, edit → regenerate works, status transitions correct |
| **E6: Pilot** | 6 | 10 real audits, 5 proposals sent, 1 deal closed | Danish | Real-world data variance, proposal quality gaps | ≥10 audits on real businesses, ≥5 proposals emailed, ≥1 positive response |

---

## Week 1: Foundation

### Tasks (1–2 day chunks)

- [ ]  **Day 1–2: Project scaffolding**
    - Next.js 14 project with App Router
    - TypeScript config, ESLint, Prettier
    - Folder structure: `/app/api/`, `/lib/`, `/workers/`, `/graphs/`
    - Basic health check endpoint (`/api/health`)
- [ ]  **Day 2–3: Postgres setup**
    - Provision Neon or Supabase Postgres instance
    - Run migration: audits, findings, proposals, evidence_snapshots tables
    - Test: INSERT and SELECT on each table from Node.js
    - Set up connection pooling (Prisma or pg)
- [ ]  **Day 3–4: Temporal Cloud setup**
    - Create Temporal Cloud namespace
    - Generate TLS certificates
    - Scaffold Temporal worker (Node.js)
    - Create AuditOrchestrator workflow (skeleton — just logs steps)
    - Verify: trigger workflow from API route, see it in Temporal Cloud UI
- [ ]  **Day 4–5: API routes**
    - `POST /api/audit` — creates audit record, starts Temporal workflow
    - `GET /api/audit/[id]` — returns audit status
    - `GET /api/health` — checks DB + Temporal connectivity
    - Simple API key middleware (env var check)
- [ ]  **Day 5: LangSmith integration**
    - Set env vars for LangChain tracing
    - Verify: make a test LLM call, see trace in LangSmith dashboard
    - Create project: `proposal-engine-mvp`

### Week 1 DoD

- [ ]  Can run `curl -X POST /api/audit -d '{"name":"Test","city":"Saskatoon"}'`
- [ ]  Audit record created in Postgres with status='queued'
- [ ]  Temporal workflow starts and appears in Cloud UI
- [ ]  Health check returns 200 with DB and Temporal status
- [ ]  LangSmith trace visible for test LLM call

---

## Week 2: Data Collection Modules

### Tasks

- [ ]  **Day 1–2: Website Module**
    - Integrate Google PageSpeed Insights API (Lighthouse)
    - Parse: performance, accessibility, best-practices, SEO scores
    - Basic crawl: fetch homepage HTML, extract title, meta description, H1, broken link check (5 links max)
    - Output: 3–6 Findings with Evidence (API response as pointer)
    - Wire as Temporal child workflow with 45s timeout
- [ ]  **Day 2–3: GBP Module**
    - Integrate Google Places API (Place Details)
    - Parse: name, rating, review count, categories, hours, photos count, website
    - Completeness scoring: what's missing from the profile
    - Output: 3–6 Findings with Evidence
    - Wire as Temporal child workflow with 30s timeout
- [ ]  **Day 3–4: Competitor Module**
    - Integrate SerpAPI or ValueSERP for local search
    - Query: "{industry} in {city}" → get local pack results
    - Extract top 3 competitors: name, rating, review count, website
    - Compare against target business
    - Output: 3–5 Findings with Evidence
    - Wire as Temporal child workflow with 30s timeout
- [ ]  **Day 4–5: Integration + testing**
    - Wire all 3 modules into AuditOrchestrator (parallel execution)
    - Handle partial failures (1 module fails, others continue)
    - Store all findings in Postgres
    - Run 3 test audits on known businesses
    - Verify all Evidence objects have valid pointers

### Week 2 DoD

- [ ]  Each module produces ≥3 real Findings for "Joe's Plumbing, Saskatoon" (or similar)
- [ ]  All Findings have ≥1 Evidence with real API data
- [ ]  3 modules run in parallel within 45s total
- [ ]  1-module failure still produces findings from other 2
- [ ]  Evidence snapshots stored in evidence_snapshots table

---

## Week 3: Diagnosis Pipeline

### Tasks

- [ ]  **Day 1–2: LangGraph setup**
    - Set up Python service (FastAPI + LangGraph)
    - Deploy to Cloud Run (or run locally for dev)
    - HTTP endpoint: `POST /diagnose` accepts Finding[]
    - Wire Temporal activity to call this endpoint
- [ ]  **Day 2–3: DiagnosisGraph nodes**
    - `pre_cluster` node: group findings by module + category (rule-based)
    - `llm_refine_clusters` node: LLM merges/splits clusters (GPT-3.5)
    - `score_clusters` node: deterministic severity from finding scores
    - `validate` node: check every cluster references real finding IDs
    - `narrate` node: LLM writes human-readable narrative per cluster (GPT-4)
- [ ]  **Day 3–4: Validation + reject loop**
    - Validation node rejects clusters with uncited claims
    - Rejected clusters go back through narrate with feedback
    - Max 3 retries, then output with `diagnosis_quality: degraded`
- [ ]  **Day 4–5: Testing + tuning**
    - Run diagnosis on 5 real audit results
    - Check: cluster stability (run same input 3x, compare)
    - Check: narrative accuracy (no fabricated facts)
    - Check: validation pass rate (≥85% first-pass)
    - Tune prompts based on results

### Week 3 DoD

- [ ]  DiagnosisGraph produces PainCluster[] from real findings
- [ ]  0 uncited claims in output (validation enforced)
- [ ]  Cluster stability ≥80% (Jaccard) across 3 runs
- [ ]  Narratives read naturally and cite specific evidence
- [ ]  End-to-end: audit → findings → diagnosis in <60s

---

## Week 4: Proposal Compiler + Output

### Tasks

- [ ]  **Day 1–2: ProposalGraph**
    - `map_to_tiers` node: essentials = high-impact/low-effort, growth = medium, premium = comprehensive
    - `generate_pricing` node: base pricing by industry + tier (lookup table)
    - `write_summary` node: LLM writes executive summary referencing findings (GPT-4)
    - `validate_citations` node: every summary claim references a finding ID
    - Output: complete Proposal object
- [ ]  **Day 2–3: Web proposal page**
    - Next.js page at `/proposal/[token]`
    - Dark professional theme (Tailwind CSS)
    - Sections: executive summary, key findings, 3-tier packages, next steps
    - Mobile responsive
    - Track `viewed_at` on first visit
- [ ]  **Day 3–4: PDF generation**
    - Puppeteer/Playwright renders web page to PDF
    - PDF stored in Cloud Storage
    - Download endpoint: `/proposal/[token]/pdf`
    - PDF looks clean, <5MB
- [ ]  **Day 4–5: Store + retrieve**
    - Store complete proposal in Postgres
    - Generate web_link_token on creation
    - API: `GET /api/audit/[id]/proposal` returns proposal JSON

### Week 4 DoD

- [ ]  Full proposal generates from real diagnosis output
- [ ]  3 tiers with pricing, painkillers first in each tier
- [ ]  Executive summary cites specific findings
- [ ]  Web page looks professional on desktop + mobile
- [ ]  PDF downloads cleanly from the web page
- [ ]  Shareable link works without auth

---

## Week 5: Integration & Polish

### Tasks

- [ ]  **Day 1–2: End-to-end pipeline**
    - Full flow: input → modules → findings → diagnosis → proposal → web + PDF
    - Run 5 audits end-to-end, fix integration bugs
    - Verify <90s total runtime
    - Cost tracking: log actual LLM + API costs per audit
- [ ]  **Day 2–3: Edit + regenerate flow**
    - `PATCH /api/finding/[id]` — edit score, description, exclude
    - `POST /api/audit/[id]/regenerate` — re-run proposal with edited findings
    - Preserve old proposal version, create new one
    - Test: edit a finding, regenerate, verify proposal changes
- [ ]  **Day 3–4: Degraded mode hardening**
    - Test each failure scenario from User Flows page
    - Verify disclaimers appear in partial audits
    - Verify all-fail produces clear error, no proposal
- [ ]  **Day 4–5: Simple web form + CLI**
    - Basic Next.js page with input form (name + city, submit)
    - Shows audit progress, then links to proposal
    - CLI script: `npx ts-node scripts/audit.ts "Business" "City"`

### Week 5 DoD

- [ ]  5 consecutive audits complete end-to-end with no errors
- [ ]  Edit → regenerate produces updated proposal
- [ ]  All degraded scenarios handled gracefully
- [ ]  Web form and CLI both trigger audits successfully
- [ ]  Cost per audit logged and <$1.00 average

---

## Week 6: Pilot Launch

### Tasks

- [ ]  **Day 1–2: Run 10 real audits**
    - Select 10 local businesses across 5 industries (dentist, roofer, restaurant, salon, HVAC)
    - Run full audit for each
    - Review every finding for accuracy
    - Flag any hallucinated or incorrect findings
- [ ]  **Day 2–3: QA proposals**
    - Review each proposal for quality (handcrafted feel)
    - Rate each on 10-point scale
    - Fix prompt issues for proposals scoring <7
    - Re-run and verify improvement
- [ ]  **Day 3–4: Send 5 proposals**
    - Select 5 best audit/proposal pairs
    - Email proposal link to real prospects
    - Track: sent, opened, response
- [ ]  **Day 4–5: Measure and iterate**
    - Log: time to complete, cost, quality scores
    - Gather feedback (even from cold outreach replies)
    - Document top 3 quality issues for post-MVP fixes
    - Declare MVP done if success criteria met

### Week 6 DoD

- [ ]  ≥10 real audits completed with ≥80% success rate
- [ ]  Average quality score ≥8/10 on blind review
- [ ]  ≥5 proposals emailed to real businesses
- [ ]  ≥1 positive response or closed deal
- [ ]  All success criteria from MVP Definition evaluated

---

## Dependency Map

```
Week 1: Foundation (no dependencies)
  │
  ▼
Week 2: Data Collection (depends on: Temporal, Postgres, API keys)
  │
  ▼
Week 3: Diagnosis (depends on: real findings from Week 2)
  │
  ▼
Week 4: Proposal (depends on: diagnosis output from Week 3)
  │
  ▼
Week 5: Integration (depends on: all previous weeks)
  │
  ▼
Week 6: Pilot (depends on: working end-to-end pipeline)
```

### Risk Flags

| Risk | Impact | Mitigation | Week |
| --- | --- | --- | --- |
| Temporal Cloud onboarding delay | Blocks Week 1 | Start signup on Day 1, use BullMQ as temp fallback | 1 |
| Google Places API quota | Blocks GBP module | Apply for elevated quota early, cache results | 2 |
| SerpAPI free tier limits | Blocks competitor module | Budget $50/mo, use ValueSERP as backup | 2 |
| LangGraph Python learning curve | Slows Week 3 | Start with simple 3-node graph, iterate | 3 |
| PDF rendering inconsistencies | Delays Week 4 | Use Puppeteer with fixed viewport, test early | 4 |
| Real-world data variance | Impacts pilot quality | Run diverse test businesses in Week 5 | 6 |

## Module 1: Website Performance & UX

### Input

`business_url: string` — Homepage URL (resolved from name+city via Google Places if needed)

### Data Sources & Tools

| Source | What It Provides | Cost | Reliability |
| --- | --- | --- | --- |
| **Google PageSpeed Insights API** | Performance, accessibility, best-practices, SEO scores (0–100), Core Web Vitals | Free (25K req/day) | High |
| **HTTP fetch (Node.js)** | Raw HTML for meta extraction | Free | High |
| **Link checker** | Broken links (check up to 5 internal links) | Free | Medium |

### Output Fields → Finding Schema

| Finding Title | Type | Category | Evidence Source | Impact Logic |
| --- | --- | --- | --- | --- |
| "Page speed score is {X}/100 on mobile" | painkiller if <50, vitamin if ≥50 | performance | PageSpeed API `lighthouseResult.categories.performance.score` | Score <30=10, <50=8, <70=6, <90=4, ≥90=2 |
| "Missing meta description" | vitamin | visibility | HTML parse — `<meta name="description">` absent | Impact: 5 (missed SEO opportunity) |
| "No H1 tag on homepage" | vitamin | visibility | HTML parse — `<h1>` absent | Impact: 4 |
| "Site not mobile-friendly" | painkiller | performance | PageSpeed API mobile vs. desktop score delta >20 | Impact: 8 (direct revenue loss on mobile) |
| "Core Web Vitals failing: LCP={X}s" | painkiller if LCP>4s | performance | PageSpeed API `lighthouseResult.audits` | LCP>4s=9, >2.5s=6, ≤2.5s=2 |
| "{N} broken links found" | painkiller if N>0 | conversion | HTTP HEAD check on 5 internal links | N>3=7, N=1-3=5 |
| "No SSL certificate (HTTP only)" | painkiller | trust | URL scheme check + redirect test | Impact: 9 (browsers show "not secure") |

### Failure Modes & Fallbacks

| Failure | Fallback | Finding Generated |
| --- | --- | --- |
| PageSpeed API timeout (>15s) | Retry once, then report "data unavailable" | `data_unavailable` finding, confidence: 1 |
| URL returns 404/500 | Report "Website appears to be down" | painkiller, impact: 10, confidence: 9 |
| URL redirects to different domain | Follow redirect, note in evidence | Normal findings + redirect finding |
| SSL certificate error | Log error, attempt HTTP fallback | painkiller finding: "SSL issue detected" |
| No HTML returned (JS-only SPA) | Use PageSpeed API data only, skip HTML parse | Reduced findings, noted in disclaimer |

### Runtime & Cost

- **Expected runtime:** 8–15 seconds (PageSpeed API is the bottleneck)
- **API cost:** $0.00 (free tier, 25K requests/day)
- **Compute cost:** ~$0.001 (HTTP fetch + HTML parse)

### QA Checks

- [ ]  PageSpeed scores match manual Lighthouse run (±2 points)
- [ ]  Meta description finding only fires when truly missing
- [ ]  Broken link check doesn't follow external links
- [ ]  SSL finding correctly identifies HTTP-only sites
- [ ]  All evidence objects have valid `pointer` to API response

---

## Module 2: Google Business Profile

### Input

- `business_name: string` + `business_city: string` → used for Places API text search
- OR `place_id: string` if already resolved

### Data Sources & Tools

| Source | What It Provides | Cost | Reliability |
| --- | --- | --- | --- |
| **Google Places API (Text Search)** | Place ID resolution from name+city | $0.032/request | High |
| **Google Places API (Place Details)** | Name, rating, reviews, categories, hours, photos, website, address | $0.017/request | High |
| **Google Places API (Reviews)** | Up to 5 most recent reviews | Included in Place Details | High |

### Output Fields → Finding Schema

| Finding Title | Type | Category | Evidence Source | Impact Logic |
| --- | --- | --- | --- | --- |
| "GBP rating is {X}/5 with {N} reviews" | painkiller if <4.0 or N<10 | trust | Places API `rating`, `user_ratings_total` | <3.5=9, <4.0=7, <4.5=5, ≥4.5=2 |
| "Only {N} Google reviews (competitors average {M})" | painkiller if N<10 | trust | Places API `user_ratings_total` vs. competitor data | N<5=9, N<10=7, N<25=5 |
| "Business hours not set on Google" | vitamin | visibility | Places API `opening_hours` null/empty | Impact: 6 |
| "Only {N} photos on GBP (recommend 10+)" | vitamin | visibility | Places API `photos` array length | N=0: 7, N<5: 5, N<10: 3 |
| "No website linked in GBP" | painkiller | conversion | Places API `website` field null | Impact: 8 |
| "GBP category may be suboptimal: '{category}'" | vitamin | visibility | Places API `types` array, cross-ref with industry norms | Impact: 4 |
| "No GBP listing found" | painkiller | visibility | Places API returns no results for name+city | Impact: 10, confidence: 7 (may be search issue) |

### Failure Modes & Fallbacks

| Failure | Fallback | Finding Generated |
| --- | --- | --- |
| Places API returns 0 results | Try alternate name spellings, then report "no listing found" | painkiller: "No GBP listing found", confidence: 7 |
| Places API returns wrong business | Check name similarity (>70% fuzzy match), discard if low | `data_unavailable` finding with note |
| API quota exceeded | Cache results aggressively, retry after backoff | Deferred — retry or skip module |
| Multiple place results | Take highest-rated match with closest name similarity | Evidence notes which result was selected |

### Runtime & Cost

- **Expected runtime:** 3–5 seconds (2 API calls: search + details)
- **API cost:** ~$0.05 per audit (search + details)
- **Note:** Google Places API has a $200/month free credit

### QA Checks

- [ ]  Correct business resolved (name match >80% fuzzy similarity)
- [ ]  Review count and rating match what Google Maps shows
- [ ]  Hours finding only fires when truly missing (not "hours not available")
- [ ]  Photo count is accurate
- [ ]  Evidence includes the Place ID for verification

---

## Module 3: Competitor Comparison

### Input

- `business_name: string` + `business_city: string`
- `business_industry: string` (inferred from GBP category or user input)

### Data Sources & Tools

| Source | What It Provides | Cost | Reliability |
| --- | --- | --- | --- |
| **SerpAPI / ValueSERP** | Local pack results for "{industry} in {city}" | $0.01–0.05/search | Medium-High |
| **Google Places API** | Details for each competitor (rating, reviews) | $0.017/request | High |

### Output Fields → Finding Schema

| Finding Title | Type | Category | Evidence Source | Impact Logic |
| --- | --- | --- | --- | --- |
| "You rank #{X} in local pack for '{query}'" | painkiller if not in top 3 | visibility | SERP API local pack position | Not in pack=8, #4-10=6, #1-3=2 |
| "Competitor '{name}' has {N} more reviews than you" | painkiller if delta >20 | trust | Places API comparison | Delta>50=8, >20=6, >10=4 |
| "Competitor '{name}' rates {X}/5 vs. your {Y}/5" | vitamin (or painkiller if delta >0.5) | trust | Places API comparison | Lower by >0.5=7, >0.3=5, >0.1=3 |
| "Top 3 competitors all have websites; you don't" | painkiller | conversion | Places API website field comparison | Impact: 9 |
| "Your competitors average {N} photos; you have {M}" | vitamin | visibility | Places API photo count comparison | Impact: 3–5 based on gap |

### Failure Modes & Fallbacks

| Failure | Fallback | Finding Generated |
| --- | --- | --- |
| SERP API returns no local pack | Try broader query ("{industry} near {city}"), then skip | `data_unavailable`: "No local competitors found in search" |
| <3 competitors found | Generate findings for available competitors | Reduced comparison, noted in disclaimer |
| Competitor Places API fails | Skip that competitor, compare against available | Partial comparison |
| Target business not in SERP results | Report as finding: "Not appearing in local search" | painkiller, impact: 8 |
| Industry inference wrong | Use broader category, note low confidence | Findings with confidence: 5 |

### Runtime & Cost

- **Expected runtime:** 5–10 seconds (1 SERP call + 3–4 Places calls)
- **API cost:** ~$0.10–0.15 per audit (SERP + Places for 3 competitors)
- **Budget:** ~$50/month at 300 audits/month

### QA Checks

- [ ]  Top 3 competitors are actually in the same industry and city
- [ ]  Review/rating comparisons use current data (not cached stale data)
- [ ]  "Not in local pack" finding only fires when genuinely absent (not API error)
- [ ]  Competitor names are real businesses (not ads or map pins)
- [ ]  All evidence includes SERP query and Place IDs

---

## Cross-Module Summary

| Module | Expected Findings | Runtime | Cost | Confidence Range |
| --- | --- | --- | --- | --- |
| Website | 3–7 | 8–15s | $0.00 | 8–10 (API data) |
| GBP | 3–7 | 3–5s | ~$0.05 | 7–10 (API data) |
| Competitors | 3–5 | 5–10s | ~$0.10–0.15 | 6–9 (SERP + API) |
| **Total** | **9–19** | **<30s parallel** | **~$0.15–0.20** | **6–10 average** |

## Painkiller vs. Vitamin Classification

### Rules (Deterministic)

| Classification | Criteria | Examples | Proposal Position |
| --- | --- | --- | --- |
| **Painkiller** | impact_score ≥ 7 OR directly losing customers/revenue | Site down, no GBP listing, 0 reviews, no SSL, not in local pack | **Lead with these.** Show urgency. "This is actively costing you money." |
| **Vitamin** | impact_score < 7 AND improvement opportunity (not active loss) | Missing meta desc, low photo count, suboptimal category, minor speed issues | **Second tier.** Show upside. "This will help you grow faster." |

### Override Rules

- If confidence_score ≤ 4 → always classify as vitamin (not enough evidence to claim pain)
- If a finding has `type: 'data_unavailable'` → neither painkiller nor vitamin, show as disclaimer
- Manual findings (operator-added) use the operator's classification

---

## Diagnosis Pipeline (DiagnosisGraph)

```
Input: Finding[]
  → Node 1: pre_cluster (rule-based)
  → Node 2: llm_refine_clusters (LLM)
  → Node 3: score_clusters (deterministic)
  → Node 4: validate (rule-based)
  → Node 5: narrate (LLM)
  → Output: PainCluster[]
```

### Node 1: Pre-Cluster (Rule-Based)

**Logic:** Group findings by `module` + `category` to create initial buckets.

```python
def pre_cluster(findings: list[Finding]) -> list[Cluster]:
    groups = {}
    for f in findings:
        key = f"{f.module}:{f.category}"  # e.g., "website:performance"
        groups.setdefault(key, []).append(f)
    
    # Merge small groups (<2 findings) into nearest category
    return [Cluster(key=k, findings=v) for k, v in groups.items() if len(v) >= 2]
    # Remaining singletons go into an "Other Issues" cluster
```

### Node 2: LLM Refine Clusters (GPT-3.5-turbo)

**Purpose:** Merge or split clusters based on semantic meaning. Find root causes.

**Prompt pattern:**

```
You are analyzing audit findings for a local business. 
Group these findings into root-cause clusters. 
Each cluster should represent ONE underlying problem.

Findings: {findings_json}
Pre-clusters: {pre_clusters_json}

For each cluster, provide:
- root_cause: 1-sentence description of the underlying problem
- finding_ids: array of finding IDs in this cluster
- severity: critical | high | medium | low

Rules:
- Every finding must appear in exactly one cluster
- Do NOT invent new findings or data
- Reference finding IDs, not descriptions
```

**Model:** GPT-3.5-turbo (cheap, fast, sufficient for categorization)

### Node 3: Score Clusters (Deterministic)

**Rules:**

- **Critical:** Contains ≥1 finding with impact ≥ 9, OR ≥3 findings with impact ≥ 7
- **High:** Contains ≥1 finding with impact ≥ 7, OR ≥3 findings with impact ≥ 5
- **Medium:** Average impact across findings ≥ 5
- **Low:** Everything else

```python
def score_cluster(cluster: Cluster) -> str:
    impacts = [f.impact_score for f in cluster.findings]
    if any(i >= 9 for i in impacts) or sum(1 for i in impacts if i >= 7) >= 3:
        return "critical"
    if any(i >= 7 for i in impacts) or sum(1 for i in impacts if i >= 5) >= 3:
        return "high"
    if sum(impacts) / len(impacts) >= 5:
        return "medium"
    return "low"
```

### Node 4: Validate (Rule-Based)

**Checks:**

- [ ]  Every cluster references real finding IDs that exist in the input
- [ ]  No finding ID appears in more than one cluster
- [ ]  All input findings are accounted for
- [ ]  Severity matches the deterministic scoring rules

**If validation fails:** Return to Node 2 with error feedback. Max 3 retries.

### Node 5: Narrate (GPT-4 / Claude Sonnet)

**Purpose:** Write human-readable narrative for each cluster.

**Prompt pattern:**

```
Write a clear, empathetic explanation of this problem for a 
local business owner. Use plain English, no jargon.

Cluster: {cluster_json}
Findings in this cluster: {findings_details}

Rules:
- Reference specific metrics from the findings (e.g., "your page speed score is 34/100")
- Explain WHY this matters to their business
- Do NOT make claims that aren't in the findings
- Keep it to 2-3 sentences
- Tone: concerned but helpful, not alarming
```

**Model:** GPT-4 or Claude Sonnet (quality matters here — prospect reads this)

---

## Proposal Pipeline (ProposalGraph)

```
Input: PainCluster[] + BusinessContext
  → Node 1: map_to_tiers (rule-based)
  → Node 2: generate_pricing (lookup + rules)
  → Node 3: write_executive_summary (LLM)
  → Node 4: validate_citations (rule-based)
  → Output: Proposal
```

### Node 1: Map to Tiers (Rule-Based)

**Tier mapping logic:**

```python
def map_to_tiers(clusters: list[PainCluster]) -> TierMapping:
    essentials = []  # High-impact, low-effort fixes
    growth = []      # Medium complexity
    premium = []     # Comprehensive
    
    for cluster in clusters:
        for finding_id in cluster.finding_ids:
            finding = get_finding(finding_id)
            if finding.impact_score >= 7 and finding.effort_estimate == 'low':
                essentials.append(finding_id)
            elif finding.impact_score >= 5 or finding.effort_estimate == 'medium':
                growth.append(finding_id)
            else:
                premium.append(finding_id)
    
    # Ensure essentials has at least 3 items (move from growth if needed)
    # Ensure each tier has at least 2 items
    return TierMapping(essentials=essentials, growth=growth, premium=premium)
```

**Tier definitions:**

- **Essentials ($300–700):** Quick wins. Fix the things that are actively costing you money. 1–2 week delivery.
- **Growth ($800–1,500):** Essentials + competitive improvements. Close the gap with top competitors. 3–4 week delivery.
- **Premium ($1,500–3,000):** Full optimization. Everything in Growth + long-term positioning. 6–8 week delivery.

### Node 2: Generate Pricing (Lookup + Rules)

**Base pricing by industry:**

| Industry | Essentials | Growth | Premium |
| --- | --- | --- | --- |
| Restaurant | $400 | $900 | $1,800 |
| Dental | $500 | $1,200 | $2,500 |
| HVAC / Trades | $450 | $1,000 | $2,000 |
| Salon / Spa | $350 | $800 | $1,600 |
| Legal / Medical | $600 | $1,400 | $2,800 |
| Default | $500 | $1,100 | $2,200 |

**Adjustment factors:**

- If >5 critical findings: +15% (more work needed)
- If city population >500K: +10% (higher market rates)
- If <10 total findings: -10% (less scope)

### Node 3: Write Executive Summary (GPT-4)

**Prompt pattern:**

```
Write an executive summary for a business proposal. 
The prospect is {business_name} in {business_city}.

Pain clusters (in order of severity):
{clusters_json}

3-tier packages:
{tiers_json}

Rules:
- Lead with the biggest pain point (painkiller first)
- Reference specific metrics ("your site scores 34/100")
- Every factual claim MUST reference a finding ID in [brackets]
- Tone: professional, empathetic, confident
- Length: 150-250 words
- End with a clear CTA
- Do NOT make promises about ROI without evidence
```

### Node 4: Validate Citations (Rule-Based)

**Checks:**

- [ ]  Every `[finding_id]` in executive summary exists in the audit
- [ ]  No factual claims without a `[finding_id]` reference
- [ ]  All tiers have ≥2 deliverables
- [ ]  Pricing is within ±30% of base pricing for industry
- [ ]  No hallucinated business details

**If validation fails:** Return to Node 3 with specific feedback. Max 3 retries.

---

## Regeneration / Editing Loop Rules

1. Operator edits findings (add, remove, adjust scores)
2. System re-runs **full ProposalGraph** (not just Node 3)
3. New proposal version created (old preserved)
4. Max 3 regeneration cycles per audit
5. After 3 regenerations, system suggests manual editing of proposal text
6. Manually edited proposal text bypasses validation (operator takes responsibility)

---

## Example Output

### Example PainCluster (JSON)

```json
{
  "root_cause": "Poor website performance driving away mobile visitors",
  "finding_ids": ["f-001", "f-003", "f-005"],
  "severity": "critical",
  "narrative": "Your website scores 34 out of 100 on Google's mobile speed test, which means most visitors on phones are leaving before the page even loads. Combined with failing Core Web Vitals (your largest content takes 5.2 seconds to appear), you're likely losing 30-40% of potential customers who search on mobile."
}
```

### Example Proposal Structure (Narrative Outline)

```
┌─────────────────────────────────────────────────────┐
│  EXECUTIVE SUMMARY                                  │
│  "Hi {name}, we analyzed your online presence       │
│   and found 3 critical issues costing you           │
│   customers right now..." [f-001][f-008][f-012]     │
├─────────────────────────────────────────────────────┤
│  KEY FINDINGS (painkillers first)                    │
│  🔴 Critical: Website too slow (34/100) [f-001]     │
│  🔴 Critical: Only 3 Google reviews [f-008]        │
│  🟡 High: Not in local search top 3 [f-012]        │
│  🟢 Medium: Missing business hours [f-006]         │
├─────────────────────────────────────────────────────┤
│  TIER 1: ESSENTIALS ($500)                           │
│  Fix critical speed issues + SSL                    │
│  Add missing GBP information                        │
│  Timeline: 1–2 weeks                                │
├─────────────────────────────────────────────────────┤
│  TIER 2: GROWTH ($1,100)                             │
│  Everything in Essentials +                         │
│  Review generation strategy                         │
│  Local SEO optimization                             │
│  Timeline: 3–4 weeks                                │
├─────────────────────────────────────────────────────┤
│  TIER 3: PREMIUM ($2,200)                            │
│  Everything in Growth +                             │
│  Full competitor analysis implementation             │
│  Ongoing monitoring + monthly reports                │
│  Timeline: 6–8 weeks                                │
├─────────────────────────────────────────────────────┤
│  NEXT STEPS                                         │
│  1. Reply to this email to discuss                  │
│  2. We'll schedule a 15-min walkthrough             │
│  3. Choose your tier and we start this week         │
└─────────────────────────────────────────────────────┘
```

### Example Proposal JSON (Essentials Tier)

```json
{
  "tier": "essentials",
  "name": "Quick Wins",
  "tagline": "Fix what's actively costing you customers",
  "included_fixes": ["f-001", "f-003", "f-005", "f-006"],
  "deliverables": [
    "Website speed optimization (target: 70+ mobile score)",
    "SSL certificate installation and redirect setup",
    "GBP profile completion (hours, photos, categories)",
    "Basic meta tag optimization (title, description, H1)"
  ],
  "timeline": "1–2 weeks",
  "price": 500,
  "price_model": "one_time"
}
```

---

## Claim Policy (Enforced at Every LLM Node)

<aside>
⚠️

**Zero tolerance for uncited claims.** Every factual statement in the proposal must reference a finding ID. The validation node enforces this mechanically. If the LLM generates a claim like "your competitors are outpacing you" without citing a specific finding, it is **rejected and re-generated** with explicit feedback.

</aside>

### What Counts as a Claim

- Any statement about the business's performance, ranking, or status
- Any comparison to competitors
- Any metric or data point
- Any assertion about what the business is "losing" or "missing"

### What Does NOT Need a Citation

- General industry knowledge ("most customers search on mobile")
- Descriptions of what a service tier includes
- Next steps and process descriptions
- Pricing and timeline information

## Golden Test Businesses (10 Categories)

Run a full audit on each of these before launch. Human-verify every finding.

| # | Industry | Test Business | City | Why This Business | Expected Challenges |
| --- | --- | --- | --- | --- | --- |
| 1 | Dentist | Pick a local dentist with 50+ reviews | Your city | Well-established, rich GBP data | May have strong website → fewer painkillers |
| 2 | Plumber | Small plumbing company, <20 reviews | Your city | Typical target customer profile | May lack website entirely |
| 3 | Restaurant | Local restaurant, not a chain | Your city | High review volume, competitive local pack | Multiple locations may confuse GBP lookup |
| 4 | Salon / Spa | Independent salon | Your city | Visual business → photo count matters | May use booking platform as "website" |
| 5 | HVAC | Local HVAC company | Your city | Service area business, seasonal | May not have physical location on GBP |
| 6 | Law Firm | Small law practice | Your city | Higher-value client → tests pricing logic | Multiple practice areas complicate categories |
| 7 | Auto Repair | Independent mechanic shop | Your city | High competition, review-dependent | Franchise vs. independent confusion |
| 8 | Real Estate | Independent agent or small brokerage | Your city | Tests agent vs. firm GBP distinction | Agent may not have business GBP |
| 9 | Fitness | Local gym or yoga studio | Your city | Class-based business, hours matter | May use branded platform (Mindbody) as site |
| 10 | Roofer | Local roofing company | Your city | Classic home services target | Seasonal, may have outdated website |

---

## Test Cases Per Module

### Website Module Tests

| Test ID | Scenario | Input | Expected Result | Pass/Fail |
| --- | --- | --- | --- | --- |
| W-01 | Fast website (≥90 score) | Well-optimized site URL | vitamin finding, impact ≤4 |  |
| W-02 | Slow website (<30 score) | Known slow site URL | painkiller finding, impact ≥9 |  |
| W-03 | No SSL | HTTP-only site | painkiller, impact 9 |  |
| W-04 | Missing meta description | Site without meta desc | vitamin, impact 5 |  |
| W-05 | Site is down (404/500) | Invalid or dead URL | painkiller, impact 10 |  |
| W-06 | JS-only SPA | React/Angular SPA URL | Reduced findings, disclaimer |  |
| W-07 | Redirect to different domain | URL that 301s elsewhere | Findings + redirect note |  |
| W-08 | Very long page load | Site with >10s load time | PageSpeed API timeout handling |  |

### GBP Module Tests

| Test ID | Scenario | Input | Expected Result | Pass/Fail |
| --- | --- | --- | --- | --- |
| G-01 | Complete GBP profile | Well-maintained listing | Mostly vitamin findings |  |
| G-02 | No GBP listing | Fictional business name | "No listing found" painkiller |  |
| G-03 | Low review count (<5) | Business with few reviews | painkiller, impact 9 |  |
| G-04 | No hours set | Business with 0 photos | vitamin, impact 6 |  |
| G-05 | No photos | Business with 0 photos | vitamin, impact 7 |  |
| G-06 | Wrong business resolved | Common name, ambiguous city | Fuzzy match rejection or disclaimer |  |
| G-07 | Multi-location business | Business with 2+ locations | Picks closest match, notes in evidence |  |

### Competitor Module Tests

| Test ID | Scenario | Input | Expected Result | Pass/Fail |
| --- | --- | --- | --- | --- |
| C-01 | In local pack top 3 | Well-ranked business | vitamin or low-impact finding |  |
| C-02 | Not in local pack | Poorly ranked business | painkiller, impact 8 |  |
| C-03 | Fewer reviews than competitors | Business with review gap | painkiller if delta >20 |  |
| C-04 | No competitors found | Niche industry, small city | `data_unavailable` finding |  |
| C-05 | All competitors weaker | Dominant local business | Positive findings (vitamin) |  |

---

## Proposal Quality Checklist (Handcrafted Feel)

Rate each proposal 1–10 on these criteria:

- [ ]  **Specificity (not generic):** Does the proposal reference THIS business by name, city, and specific metrics? Score <7 if it could apply to any business.
- [ ]  **Evidence-backed:** Does every claim cite a finding? Score 0 if any uncited factual claim.
- [ ]  **Painkiller-first ordering:** Are the most urgent issues presented first? Score <7 if vitamins appear before painkillers.
- [ ]  **Clear tiers:** Are the 3 tiers distinct and progressively valuable? Score <7 if tiers overlap significantly.
- [ ]  **Reasonable pricing:** Does pricing match the scope? Score <7 if prices feel too high or too low for the work described.
- [ ]  **Human tone:** Does it read like a person wrote it? Score <7 if it has LLM-typical hedging, bullet-point overload, or robotic phrasing.
- [ ]  **Actionable next steps:** Does the prospect know exactly what to do? Score <7 if CTAs are vague.
- [ ]  **No hallucinations:** Are all metrics and facts verifiable? Score 0 if any fabricated data.
- [ ]  **Visual hierarchy:** On the web page, is it scannable? Score <7 if it's a wall of text.
- [ ]  **Mobile readability:** Does it look good on a phone? Score <7 if layout breaks on mobile.

**Target: ≥8/10 average across all 10 criteria before sending to prospects.**

---

## Regression Strategy (LangSmith Eval Gate)

### Golden Dataset

1. Run 10 golden test audits (see table above)
2. Human-verify every finding (mark correct/incorrect)
3. Human-rate every proposal (10-point checklist above)
4. Store as LangSmith eval dataset: `golden-v1`

### Before Any Prompt Change

```
1. Run golden dataset through new prompts
2. Compare results against golden baseline:
   - Finding accuracy: must be ≥90% match
   - Cluster stability: ≥80% Jaccard overlap
   - Proposal quality: must not drop >0.5 points on any criterion
   - Validation pass rate: must not drop below 85%
3. If all pass → deploy new prompts
4. If any fail → reject change, iterate on prompts
```

### LangSmith Eval Configuration

```python
# eval_config.py
EVAL_DATASET = "golden-v1"
EVAL_METRICS = [
    "finding_accuracy",     # % of findings that match golden
    "cluster_stability",    # Jaccard overlap with golden clusters
    "citation_coverage",    # % of claims with citations
    "proposal_quality",     # Average of 10-point checklist
    "validation_pass_rate", # % passing on first attempt
]
THRESHOLDS = {
    "finding_accuracy": 0.90,
    "cluster_stability": 0.80,
    "citation_coverage": 1.00,
    "proposal_quality": 8.0,
    "validation_pass_rate": 0.85,
}
```

---

## Manual QA Process (Early Stage)

### For Every Audit (First 20 Audits)

1. **Run audit** on real business
2. **Review every finding:**
    - Is the metric accurate? (Cross-check manually)
    - Is the evidence pointer valid? (Click/verify)
    - Is the impact score reasonable?
    - Is the type (painkiller/vitamin) correct?
3. **Review the proposal:**
    - Run 10-point quality checklist
    - Check every citation in executive summary
    - Verify pricing makes sense for the industry
4. **Log issues** in a spreadsheet:
    - Finding ID, issue type, expected vs. actual, severity
5. **Fix and re-run** any audit scoring <7/10

### After 20 Audits

- Switch to sampling: review 1 in 5 audits manually
- Rely on LangSmith eval gates for automated quality checks
- Only do full manual review when adding new modules or changing prompts

## Phase 1: Internal Pilot (Audits 1–10)

**Goal:** Validate audit quality, find bugs, measure real costs. You are the only user.

### Process

1. Select 10 businesses from the QA Plan golden list (across 5+ industries)
2. Run full audit on each: input → findings → diagnosis → proposal → PDF
3. For each audit, log:
    - Total runtime (seconds)
    - API cost (cents) from `audits.api_cost_cents`
    - Number of findings per module
    - Validation pass rate (first-attempt %)
    - Proposal quality score (10-point checklist from QA Plan)
4. Review every finding manually against real business data
5. Flag and fix any:
    - Hallucinated metrics or claims
    - Wrong business resolved (GBP module)
    - Missing or broken evidence pointers
    - Proposal narratives that feel generic or robotic

### Pilot Scorecard

| Metric | Target | Actual | Pass? |
| --- | --- | --- | --- |
| Audits completed | 10/10 |  |  |
| Completion rate | ≥80% |  |  |
| Average runtime | <90s |  |  |
| Average cost/audit | <$1.00 |  |  |
| Hallucination count | 0 |  |  |
| Avg proposal quality | ≥8/10 |  |  |
| Validation first-pass rate | ≥85% |  |  |

---

## Phase 2: Warm Outreach (Audits 11–20)

**Goal:** Send proposals to real prospects, get first feedback.

### Prospect Selection

- Pick 10 local businesses you already have some connection to (friends, family referrals, businesses you frequent)
- Prioritize businesses with obvious online issues (low reviews, slow websites, no GBP)
- Avoid chains, franchises, or businesses with corporate marketing teams

### Outreach Process

1. Run audit on each prospect
2. Review proposal for quality (≥8/10 or don't send)
3. Send personalized email with proposal web link:

```
Subject: Quick analysis of {business_name}'s online presence

Hi {name},

I put together a quick analysis of {business_name}'s online 
presence. Found a few things that might be costing you customers.

Here's the full report: {proposal_link}

No obligation — just thought it might be useful. Happy to walk 
through it if you have 10 minutes this week.

Best,
{your name}
```

1. Track in Sales Pipeline database:
    - Sent date
    - Viewed date (from `proposals.viewed_at`)
    - Response (none / interested / booked call / closed)

### Feedback Collection

For every response (positive or negative), ask:

- "What was the most useful part of this report?"
- "Was anything confusing or wrong?"
- "Would you pay for this kind of analysis? How much?"
- "What would make this more valuable to you?"

Log all responses in a simple spreadsheet or Notion database.

---

## Phase 3: Cold Outreach (Audits 21–50)

**Goal:** Validate demand beyond warm network. Close first paying deal.

### Cold Outreach Process

1. Research local businesses with obvious gaps (Google Maps → filter by low reviews, no website)
2. Run audit → generate proposal
3. QA check (sampling: 1 in 3 for full review)
4. Send email with proposal link
5. Follow up once after 3 days if viewed but no response
6. Follow up once after 7 days if not viewed

### Volume Targets

- **Week 1:** 10 cold audits + proposals sent
- **Week 2:** 15 cold audits + proposals sent
- **Week 3:** 25 cold audits + proposals sent
- **Total by end of Phase 3:** ~50 proposals sent

---

## What to Measure

| Metric | What It Tells You | Target | How to Track |
| --- | --- | --- | --- |
| **Time saved per proposal** | Is automation faster than manual? | <5 min (vs. 2–4 hrs manual) | Time from input to "ready" status |
| **Open rate** | Are proposals getting viewed? | ≥40% of sent proposals | `proposals.viewed_at` IS NOT NULL |
| **Response rate** | Are prospects engaging? | ≥10% of sent proposals | Email replies or call bookings |
| **Close rate** | Do proposals convert to revenue? | ≥5% of sent proposals | `proposals.status = 'accepted'` |
| **Average deal size** | Revenue per closed deal | $500–1,500 | Stripe or manual tracking |
| **Objections** | Why prospects don't buy | Categorize top 5 reasons | Notes from responses and calls |
| **Audit cost** | Unit economics work? | <$0.50 average | `audits.api_cost_cents` |

---

## Weekly Iteration Loop

Every Friday, review the week's data and make one change:

### Week N Review Template

1. **Audits run this week:** ___
2. **Proposals sent:** ___
3. **Proposals viewed:** ___
4. **Responses received:** ___
5. **Deals closed:** ___
6. **Top quality issue:** ___
7. **Top bug/failure:** ___
8. **Change for next week:** ___

### Decision Rules

- If close rate <2% after 30 proposals → the proposal content needs work, not the volume
- If open rate <20% → the email subject/body needs work, not the proposal
- If response rate >15% but close rate <5% → pricing or CTA needs adjustment
- If average quality <7/10 → stop sending, fix prompts first

---

## Pricing Test Plan

### Strategy: Start High, Negotiate Down

**Phase 2 (Warm outreach):** Don't mention pricing in the email. If they ask:

- "We typically start at $500 for the essentials package. Want me to walk you through what's included?"
- Note their reaction. Adjust based on feedback.

**Phase 3 (Cold outreach):** Include pricing in the proposal web page. Test two approaches:

**Test A (first 25 proposals):** Show all 3 tiers with pricing

- Essentials: $500 | Growth: $1,100 | Premium: $2,200

**Test B (next 25 proposals):** Show tiers without pricing, CTA = "Book a call to discuss"

**Compare:** Which approach gets more responses and closes?

### Pricing Signals to Watch

- If 80%+ choose Essentials → Growth and Premium are too expensive or not compelling
- If 30%+ choose Premium → you're underpricing
- If nobody responds → price isn't the issue, it's perceived value
- If people ask for custom → your tiers don't match their needs

## Risk Assessment & Mitigation

| # | Risk | Category | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Scraping breaks due to Google layout changes** | Data | High | High | Use official APIs (Places, PageSpeed) instead of scraping wherever possible. Only scrape as last resort with selectors that degrade gracefully. | Danish |
| 2 | **LLM hallucinates metrics or business details** | Quality | High | Critical | Validation node rejects any uncited claim. All metrics come from APIs, not LLM generation. LLM only narrates and classifies — never invents data. | Danish |
| 3 | **Wrong business resolved from name+city** | Data | Medium | High | Fuzzy name matching (≥70% threshold). Show resolved business to operator before proceeding. Add "Is this the right business?" confirmation in UI. | Danish |
| 4 | **Google Places API quota exceeded** | Infrastructure | Low | High | $200/month free credit covers ~4,000 audits. Cache Place Details for 24 hours. Apply for elevated quota before hitting limits. | Danish |
| 5 | **LLM cost spikes from retries or long prompts** | Economics | Medium | Medium | Hard cost ceiling: $1.00/audit circuit breaker. Use GPT-3.5 for classification, GPT-4 only for narrative. Cache identical inputs. Monitor via LangSmith. | Danish |
| 6 | **Scraping violates Google/Yelp ToS** | Legal | Medium | High | Avoid scraping entirely — use only official APIs. Check robots.txt programmatically. Get legal review ($500–1K) before scale-up. | Danish |
| 7 | **Proposals feel generic, not handcrafted** | Quality | High | High | Force every claim to cite specific metrics. Use business name, city, and industry throughout. A/B test prompts. Manual QA on first 20 proposals. | Danish |
| 8 | **PageSpeed API returns inconsistent scores** | Data | Medium | Medium | Run PageSpeed API twice and average. Note variance in evidence. Flag findings with >10-point variance between runs. | Danish |
| 9 | **PDF generation fails or looks broken** | Technical | Medium | Medium | Use Puppeteer with fixed viewport (1200x800). Test PDF output for 10 different proposal lengths. Have web page as fallback (PDF is nice-to-have). | Danish |
| 10 | **Temporal Cloud setup takes longer than expected** | Technical | Medium | Medium | Start signup on Day 1. Have BullMQ fallback ready for Week 1. Temporal is ideal but not blocking — a simple queue works for MVP. | Danish |
| 11 | **Cluster stability too low (<60% Jaccard)** | Quality | Medium | High | Use rule-based pre-clustering before LLM. Set temperature=0 for clustering LLM calls. Test stability across 5 runs early in Week 3. | Danish |
| 12 | **Prospects don't open proposal links** | Business | Medium | High | Test email subject lines. Include 1 compelling finding in the email body to hook interest. Consider attaching PDF instead of link. | Danish |
| 13 | **Prospects see the proposal but don't respond** | Business | High | High | Add clear CTA ("Reply to this email" or "Book a 10-min call"). Follow up once at 3 days, once at 7 days. Test pricing on/off in proposals. | Danish |
| 14 | **Business has no website (WebsiteModule returns nothing)** | Data | Medium | Medium | This IS a finding: "No website found — you're invisible to customers searching online." Painkiller, impact 9. Degraded mode works fine here. | Danish |
| 15 | **SerpAPI free tier runs out** | Economics | Medium | Low | Budget $50/month for SerpAPI. Switch to ValueSERP ($25/month) if cheaper. Can also use Google Custom Search API as backup. | Danish |
| 16 | **LangGraph Python service adds complexity** | Technical | Medium | Medium | Keep it simple: FastAPI with 2 endpoints (/diagnose, /propose). Docker container on Cloud Run. If too complex, use LangGraph.js instead. | Danish |
| 17 | **Proposal pricing doesn't match market expectations** | Business | High | Medium | Start with industry-based lookup table. Adjust weekly based on prospect feedback. Run pricing A/B test (see Launch Plan). | Danish |
| 18 | **Competitor module returns wrong industry competitors** | Data | Medium | Medium | Use GBP primary category for industry inference. Validate competitor names are real businesses (not ads). Let operator override industry before audit. | Danish |
| 19 | **Scope creep — adding features before validating demand** | Process | High | High | Every feature request goes through: "Does this help close the next deal?" If no, add to backlog. Ship vertical slice first, then harden. | Danish |
| 20 | **Single point of failure — solo founder burnout** | Process | Medium | Critical | Automate everything possible. Keep the stack simple (3 core tools). Set working hours. Don't optimize what you haven't validated. Revenue first, polish later. | Danish |

---

## Risk Matrix (Visual)

```
               IMPACT
         Low    Med    High   Critical
       ┌──────┬──────┬──────┬───────┐
  High  │      │ #8   │ #7,13│ #2     │
       ├──────┼──────┼──────┼───────┤
L Med   │ #15  │#9,16 │#3,6  │ #20    │
I      ├──────┼──────┼──────┼───────┤
K Low   │      │      │ #4   │        │
E      └──────┴──────┴──────┴───────┘
```

---

## Top 5 Priority Risks (Address First)

1. **#2 — Hallucination** → Build validation node in Week 3, test relentlessly
2. **#7 — Generic proposals** → Force citations, tune prompts, QA every proposal in pilot
3. **#19 — Scope creep** → Stick to 6-week plan, no new features until Week 6 pilot is done
4. **#13 — No response** → Test email templates, follow-up cadence, pricing on/off
5. **#20 — Burnout** → Keep stack simple, automate early, don't gold-plate

## Overview

```
Day 1–30:  MVP → Ship → Pilot (you are here)
Day 31–60: Harden → Revenue → 5 paying clients
Day 61–90: Scale → Agency SaaS → $3K MRR
```

---

## Day 1–30: Ship MVP + Close First Deal

*Covered by the 6-week build plan. Summary of post-MVP work:*

### Exit Criteria (Must Be True at Day 30)

- [ ]  ≥10 real audits completed on real businesses
- [ ]  ≥5 proposals sent to prospects
- [ ]  ≥1 deal closed (any amount)
- [ ]  Cost per audit measured and <$1.00
- [ ]  Golden eval dataset in LangSmith (10 audits)
- [ ]  0 hallucinated claims in the last 5 proposals

---

## Day 31–60: V1 Reliability + Revenue

### V1 Reliability Upgrades

| Upgrade | Why | Effort | Priority |
| --- | --- | --- | --- |
| **Add 2 more audit modules** (Reputation + Social) | More findings = richer proposals = higher perceived value | 3–4 days each | P1 |
| **Hybrid clustering** (rule-based + LLM) | Improve cluster stability from ~80% to ~90%+ | 2 days | P1 |
| **Evidence verification activity** | HTTP HEAD on all URL evidence pointers, flag broken links | 1 day | P1 |
| **`data_unavailable` finding type** | Honest gaps instead of guesses when data is missing | 1 day | P1 |
| **Structured JSON logging** | Debug production issues without guessing | 1 day | P2 |
| **Unit tests for scoring + validation** | Prevent regressions when tuning prompts | 2 days | P2 |
| **Cost tracking per audit** | Populate `api_cost_cents` with real data from day 1 | 1 day | P2 |

### Revenue Milestones

- [ ]  **Close 4 more deals** (total: 5 paying clients)
- [ ]  **Total revenue:** ≥$2,500
- [ ]  **Repeat customer:** ≥1 client who comes back for a second project
- [ ]  **Set up Stripe** for one-time project payments

### New Features

- [ ]  **Basic agency dashboard** — List audits, view proposals, track status
- [ ]  **Auth via Clerk/Auth0** — Login for operator (you), no multi-tenant yet
- [ ]  **PDF export polish** — Clean template, your agency branding
- [ ]  **Email delivery** — Send proposal link directly from the system

### Day 60 Checkpoint

| Metric | Target | Kill Criteria |
| --- | --- | --- |
| Paying clients | ≥5 | <2 = product-market fit problem |
| Total revenue | ≥$2,500 | <$500 = pricing or conversion problem |
| Repeat client | ≥1 | 0 = retention problem |
| Cluster stability | ≥85% | <65% = clustering unreliable |
| Hallucination rate | <3% | >10% = anti-hallucination failing |

---

## Day 61–90: Agency SaaS Launch

### White-Label Readiness Steps

| Step | What | Effort | Depends On |
| --- | --- | --- | --- |
| 1 | **Add `tenant_id` to all tables** (schema already designed) | 1 day | Nothing |
| 2 | **Create default tenant** for your internal agency data | 0.5 day | Step 1 |
| 3 | **Enable RLS policies** on audits, findings, proposals | 1 day | Step 2 |
| 4 | **Build tenant creation flow** (signup → create tenant → configure) | 2 days | Step 3 |
| 5 | **Feature flags by plan tier** (audit limits, module access) | 1 day | Step 4 |
| 6 | **Branding config** (logo, colors, company name per tenant) | 2 days | Step 4 |
| 7 | **Test RLS isolation** with 2 test tenants | 1 day | Step 6 |

### Multi-Tenant Architecture Plan

The database schema already supports multi-tenancy (see Data Model & Contracts). The migration path:

```
Current: Single-tenant (your agency)
  ↓ Add tenant_id + backfill existing data
  ↓ Enable RLS
  ↓ Build tenant CRUD
  ↓ Build tenant-scoped auth
  ↓ Build branding config UI
Target: Multi-tenant with RLS isolation
```

### SaaS Pricing Tiers

| Tier | Price | Audits/Mo | Seats | Features |
| --- | --- | --- | --- | --- |
| **Starter** | $199/mo | 10 | 1 | Core 3 modules, web proposals |
| **Growth** | $499/mo | 50 | 3 | 5 modules, PDF export, priority |
| **Agency Pro** | $999/mo | Unlimited | 10 | All modules, API, batch, custom branding |

### Launch Activities

- [ ]  **Implement Stripe subscriptions** ($199/$499/$999)
- [ ]  **Add usage tracking** (audits/month, seats, API calls)
- [ ]  **Build agency onboarding** (signup → Stripe → tenant → first audit)
- [ ]  **Launch publicly** (Product Hunt, agency forums, cold outreach)
- [ ]  **Onboard 3 agency customers** with white-glove support

### B2C Prerequisites (Do NOT Build Yet)

Things that must be true before starting B2C:

- [ ]  ≥$5K MRR from agency customers
- [ ]  ≥90% audit completion rate
- [ ]  <3% hallucination rate across 500+ audits
- [ ]  Self-serve onboarding tested with 3+ agencies
- [ ]  Support load manageable (no more than 2 hrs/day)

B2C adds complexity (self-serve, lower ARPU, higher volume, more support). Don't start until agency model is proven and profitable.

### Day 90 Checkpoint

| Metric | Target | Kill Criteria |
| --- | --- | --- |
| Agency SaaS subscribers | ≥3 | <1 = SaaS model not working |
| MRR | ≥$3,000 | <$1,000 = pricing or acquisition problem |
| Total audits (all tenants) | ≥100 | <30 = low usage/engagement |
| Agency churn (30-day) | 0 | ≥2 churned = value delivery problem |
| System uptime | ≥99% | <95% = reliability crisis |

---

## What to NOT Do in 90 Days

- ❌ **Dify** — Cut entirely. No value for MVP or V1.
- ❌ **n8n delivery automation** — Send proposals manually via email.
- ❌ **B2C self-serve** — Defer until $5K MRR from agency.
- ❌ **Custom domains** — Defer until white-label phase.
- ❌ **Mobile app** — Web-only for 6+ months.
- ❌ **AI chat/copilot** — Focus on core audit → proposal loop.
- ❌ **More than 5 audit modules** — 5 is plenty.

---

## Decision Framework (Apply to Every Feature Request)

1. **Does this help close the next deal?** If no → defer.
2. **Can I do this manually for now?** If yes → defer the automation.
3. **Does this affect audit quality?** If no → not P0.
4. **Am I building for a customer request or a guess?** If guess → defer.
5. **Can I ship this in <1 day?** If no → break it down or simplify.
