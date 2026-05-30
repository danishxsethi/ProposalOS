# ProposalOS Architecture

This document describes the system architecture of ProposalOS, including the audit pipeline, data flow, and deployment architecture.

## System Overview

ProposalOS is an AI-powered proposal generation engine that creates evidence-backed proposals with 3-tier pricing in under 90 seconds.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ProposalOS                                      │
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐│
│  │  Crawl   │───▶│ Analyze  │───▶│ Diagnose │───▶│  Compile │───▶│Deliver ││
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────┘│
│       │               │               │               │              │      │
│       ▼               ▼               ▼               ▼              ▼      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐│
│  │ Website  │    │ Findings │    │  Tiers   │    │ Proposal │    │ Email  ││
│  │   GBP    │    │ Clusters │    │ Pricing  │    │   PDF    │    │  PDF   ││
│  │Competitor│    │  Scores  │    │  LLM     │    │  Bundle  │    │ Portal ││
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Audit Pipeline Flow

The audit pipeline consists of 5 stages:

### Stage 1: Crawl (Data Collection)

**Purpose:** Collect raw data from multiple sources about the target business.

**Modules:**

- **Website Module**: Scrapes and analyzes the business website
  - Performance metrics (Lighthouse/PageSpeed)
  - SEO analysis (meta tags, structured data, content)
  - Accessibility audit (WCAG compliance)
  - Technology stack detection
- **Google Business Profile (GBP) Module**: Fetches GBP data
  - Business information completeness
  - Review analysis (count, rating, sentiment)
  - Photo count and quality
  - Posts and updates activity
- **Competitor Module**: Identifies and analyzes local competitors
  - SERP analysis for local keywords
  - Competitor website analysis
  - Market positioning insights

**Data Flow:**

```
Input: Business Name + City
    │
    ├─▶ Website Scraper ──▶ HTML, Performance Data
    ├─▶ Places API ───────▶ GBP Data, Reviews
    └─▶ SerpAPI ──────────▶ Competitor List
            │
            ▼
    Raw Data Store (JSON)
```

### Stage 2: Analyze (Data Processing)

**Purpose:** Process raw data into structured findings.

**Components:**

- **Finding Generator**: LLM-powered analysis that identifies issues
- **Scoring Engine**: Calculates impact and confidence scores
- **Clusterer**: Groups related findings into categories

**Finding Types:**

- **PAINKILLER**: Critical issues that must be fixed (high impact)
- **VITAMIN**: Nice-to-have improvements (lower priority)

**Data Flow:**

```
Raw Data
    │
    ▼
┌─────────────────┐
│ Finding Generator│──▶ LLM Analysis (Gemini)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   Scoring Engine │──▶ Impact Score (1-10)
│                  │──▶ Confidence Score (0-100%)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   Clusterer     │──▶ Category Grouping
└─────────────────┘
    │
    ▼
Structured Findings
```

### Stage 3: Diagnose (Proposal Strategy)

**Purpose:** Transform findings into a strategic diagnosis and tier recommendations.

**Components:**

- **Diagnosis Engine**: Creates executive summary and strategic recommendations
- **Tier Mapper**: Maps findings to 3 pricing tiers (Starter, Growth, Premium)
- **Playbook System**: Industry-specific proposal templates

**Tier Logic:**

```
┌──────────────────────────────────────────────────────────────┐
│                        Tier Mapping                           │
├──────────────┬────────────────────────────────────────────────┤
│   Starter    │ Critical painkillers only (1-3 fixes)          │
│   ($1500)    │ Quick wins, high-impact items                  │
├──────────────┼────────────────────────────────────────────────┤
│   Growth     │ All painkillers + key vitamins (4-8 fixes)     │
│   ($3000)    │ Comprehensive improvement plan                 │
├──────────────┼────────────────────────────────────────────────┤
│   Premium    │ Complete transformation (all findings)         │
│   ($5000)    │ Ongoing optimization, advanced features        │
└──────────────┴────────────────────────────────────────────────┘
```

### Stage 4: Compile (Proposal Generation)

**Purpose:** Generate the final proposal document with all sections.

**Components:**

- **LLM Orchestrator**: Coordinates multi-step LLM calls
- **Template System**: Applies branding and formatting
- **PDF Generator**: Creates professional PDF output

**Proposal Sections:**

1. Executive Summary
2. Current State Analysis
3. Key Findings (clustered by category)
4. Recommended Tiers with Pricing
5. Implementation Timeline
6. Next Steps / CTA

### Stage 5: Deliver (Distribution)

**Purpose:** Deliver the proposal to the client and track engagement.

**Components:**

- **Email Scheduler**: Sends proposal via email
- **Tracking System**: Monitors opens, clicks, views
- **Client Portal**: Web-based proposal viewing
- **Follow-up Automation**: Drip sequence for non-responders

**Delivery Flow:**

```
Proposal Ready
    │
    ├─▶ Generate Shareable Link
    ├─▶ Send Email with Tracking
    ├─▶ Track Opens/Clicks
    └─▶ Trigger Follow-up Sequence
```

## Data Architecture

### Database Schema (Simplified)

```
┌─────────────┐       ┌─────────────┐
│   Tenant    │◄──────│    User     │
└─────────────┘       └─────────────┘
       │
       │ 1:N
       ▼
┌─────────────┐       ┌─────────────┐
│    Audit    │◄──────│   Finding   │
└─────────────┘       └─────────────┘
       │
       │ 1:1
       ▼
┌─────────────┐       ┌─────────────┐
│  Proposal   │       │  Playbook   │
└─────────────┘       └─────────────┘
```

### Key Models

- **Tenant**: Multi-tenant organization
- **Audit**: Single audit session with business info
- **Finding**: Individual issue/opportunity identified
- **Proposal**: Generated proposal with tiers
- **Playbook**: Industry-specific configuration

### Caching Strategy

```
┌─────────────────────────────────────────────────────┐
│                  Cache Layers                        │
├─────────────────────────────────────────────────────┤
│  L1: In-Memory (LLM Cache)                          │
│      - Prompt responses                              │
│      - TTL: 1 hour                                   │
├─────────────────────────────────────────────────────┤
│  L2: Redis (API Responses)                          │
│      - PageSpeed results                            │
│      - Places API responses                         │
│      - SerpAPI results                              │
│      - TTL: 24 hours                                │
├─────────────────────────────────────────────────────┤
│  L3: File System (Fallback)                         │
│      - Used when Redis unavailable                  │
│      - Persistent across restarts                   │
└─────────────────────────────────────────────────────┘
```

## Deployment Architecture

### Production (Google Cloud Platform)

```
┌─────────────────────────────────────────────────────────────────┐
│                         GCP Architecture                         │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Cloud CDN     │───▶│         Cloud Load Balancer         │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│      │  Cloud Run   │ │  Cloud Run   │ │  Cloud Run   │        │
│      │  (Next.js)   │ │  (API)       │ │  (Workers)   │        │
│      └──────────────┘ └──────────────┘ └──────────────┘        │
│              │               │               │                  │
│              └───────────────┼───────────────┘                  │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │   Cloud SQL     │                          │
│                    │  (PostgreSQL)   │                          │
│                    └─────────────────┘                          │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│      │   Vertex AI  │ │  Cloud Storage│ │    Redis     │        │
│      │  (Gemini)    │ │   (PDFs)      │ │   (Cache)    │        │
│      └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                                  │
│      ┌──────────────┐ ┌──────────────┐                         │
│      │Cloud Workflows│ │  Cloud Run   │                        │
│      │ (Orchestration)│ │   (Cron)    │                         │
│      └──────────────┘ └──────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### Local Development

```
┌─────────────────────────────────────────────────────┐
│              Local Development Stack                 │
│                                                      │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │  npm run dev    │    │   Docker Compose        │ │
│  │  (Next.js)      │    │                         │ │
│  │  localhost:3000 │    │  ┌──────────────────┐  │ │
│  └─────────────────┘    │  │   PostgreSQL     │  │ │
│                         │  │   localhost:5435 │  │ │
│                         │  └──────────────────┘  │ │
│                         │  ┌──────────────────┐  │ │
│                         │  │   Redis          │  │ │
│                         │  │   localhost:6379 │  │ │
│                         │  └──────────────────┘  │ │
│                         │  ┌──────────────────┐  │ │
│                         │  │   Mailhog        │  │ │
│                         │  │   localhost:8025 │  │ │
│                         │  └──────────────────┘  │ │
│                         └─────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Component Directory

```
lib/
├── audit/              # Audit orchestration
├── pipeline/           # Pipeline stages and agents
│   ├── stages/         # Individual stage implementations
│   ├── agents/         # AI agents for each stage
│   └── saga.ts         # Orchestration with rollback
├── diagnosis/          # Diagnosis and tier mapping
├── proposal/           # Proposal generation
│   ├── llm-orchestrator.ts
│   ├── template-system.ts
│   └── pricing.ts
├── delivery/           # Proposal delivery
│   ├── bundler.ts      # PDF bundling
│   └── packager.ts     # Artifact packaging
├── modules/            # Data collection modules
│   ├── website.ts      # Website analysis
│   ├── gbp.ts          # Google Business Profile
│   └── competitor.ts   # Competitor analysis
├── graph/              # Graph-based analysis
├── llm/                # LLM providers and utilities
├── prisma/             # Database client and migrations
└── observability/      # Logging, metrics, tracing
```

## API Endpoints

### Core APIs

| Endpoint                            | Method | Description              |
| ----------------------------------- | ------ | ------------------------ |
| `/api/audit`                        | POST   | Create new audit         |
| `/api/audit/[id]`                   | GET    | Get audit status/results |
| `/api/audit/[id]/diagnose`          | POST   | Trigger diagnosis stage  |
| `/api/audit/[id]/propose`           | POST   | Generate proposal        |
| `/api/proposal/token/[token]`       | GET    | View proposal (public)   |
| `/api/delivery/[proposalId]/bundle` | GET    | Download proposal bundle |

### Cron Jobs

| Endpoint                      | Schedule | Description                 |
| ----------------------------- | -------- | --------------------------- |
| `/api/cron/discovery`         | Daily    | Discover new prospects      |
| `/api/cron/pipeline-audit`    | Hourly   | Process pending audits      |
| `/api/cron/pipeline-outreach` | Daily    | Send outreach emails        |
| `/api/cron/pipeline-delivery` | Daily    | Deliver completed proposals |
| `/api/cron/follow-ups`        | Hourly   | Send follow-up sequences    |
| `/api/cron/retention`         | Weekly   | Run retention campaigns     |

## Security Architecture

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│  NextAuth   │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Session   │
                    │   (JWT)     │
                    └─────────────┘
```

### API Security

- **API Keys**: Required for programmatic access
- **Rate Limiting**: Upstash Redis-based rate limiting
- **Tenant Isolation**: Row-level security in PostgreSQL
- **PII Scrubbing**: Automatic PII removal from logs

## Observability

### Logging Stack

- **Pino**: Structured JSON logging
- **Log Levels**: debug, info, warn, error
- **Context**: Request ID, tenant ID, user ID included

### Metrics

- **OpenTelemetry**: Distributed tracing
- **Custom Metrics**: Audit duration, LLM costs, success rates
- **Alerts**: Slack webhooks for critical failures

### Tracing

```
Request ──▶ Trace ID Generated
    │
    ├─▶ Span: API Route
    │   └─▶ Span: Audit Orchestrator
    │       ├─▶ Span: Website Module
    │       ├─▶ Span: GBP Module
    │       └─▶ Span: LLM Call (Gemini)
    └─▶ Span: Database Query
```

## Performance Considerations

### Latency Targets

| Operation           | Target  | P95   |
| ------------------- | ------- | ----- |
| Audit Creation      | < 90s   | 120s  |
| Proposal Generation | < 30s   | 45s   |
| API Response        | < 200ms | 500ms |
| Page Load           | < 2s    | 3s    |

### Optimization Strategies

1. **Parallel Processing**: Run independent modules concurrently
2. **Streaming**: Stream LLM responses where possible
3. **Caching**: Aggressive caching of API responses
4. **Batching**: Batch database operations
5. **Circuit Breakers**: Fail fast on downstream failures

## Disaster Recovery

### Backup Strategy

- **Database**: Daily automated backups via Cloud SQL
- **PDFs**: Stored in GCS with versioning
- **Configuration**: Infrastructure as Code (Terraform)

### Recovery Procedures

See [docs/backup-restore.md](backup-restore.md) for detailed procedures.

## Related Documentation

- [Branch Protection](BRANCH_PROTECTION.md)
- [Observability Setup](OBSERVABILITY_SETUP.md)
- [Runbooks](RUNBOOKS.md)
- [Secret Rotation](SECRET_ROTATION.md)
- [Integrations](INTEGRATIONS.md)
