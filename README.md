# ProposalOS

> **Business name + city → 90-second audit → evidence-backed proposal with 3-tier pricing → close deals**

[![CI/CD Pipeline](https://github.com/danishxsethi/ProposalOS/actions/workflows/ci-cd-pipeline.yml/badge.svg)](https://github.com/danishxsethi/ProposalOS/actions/workflows/ci-cd-pipeline.yml)
[![License](https://img.shields.io/badge/license-Private-blue)]()

## Quick Start (30 Seconds)

```bash
# Clone and setup
git clone https://github.com/danishxsethi/ProposalOS.git
cd ProposalOS
make setup    # or: ./scripts/setup.sh

# Start development
make dev      # or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Demo credentials:**

- Email: `demo@acme.com`
- Password: `password123`

## What is ProposalOS?

ProposalOS is an AI-powered proposal generation engine that creates evidence-backed proposals with 3-tier pricing in under 90 seconds.

### Core Features

- 🚀 **90-Second Audits** - Automated website, GBP, and competitor analysis
- 📊 **Evidence-Based Findings** - LLM-powered diagnosis with confidence scores
- 💰 **3-Tier Pricing** - Starter, Growth, and Premium proposals
- 📄 **Professional PDFs** - Branded, client-ready proposal documents
- 🔄 **Automated Follow-up** - Email sequences and proposal tracking

### Audit Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Crawl   │───▶│ Analyze  │───▶│ Diagnose │───▶│ Compile  │───▶│ Deliver  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
   Data          Findings        Strategy        Proposal         Client
 Collection
```

See [Architecture](docs/ARCHITECTURE.md) for detailed system design.

## Tech Stack

| Category  | Technology                           |
| --------- | ------------------------------------ |
| Framework | Next.js 16 (App Router) + TypeScript |
| Database  | PostgreSQL + Prisma ORM              |
| AI        | Vertex AI (Gemini 2.0)               |
| Caching   | Redis                                |
| Hosting   | Google Cloud Run                     |
| Storage   | Google Cloud Storage                 |

## Prerequisites

- **Node.js** 18+ ([install](https://nodejs.org/))
- **Docker** ([install](https://docs.docker.com/get-docker/))
- **Git** ([install](https://git-scm.com/))

## Setup Options

### Option 1: One-Command Setup (Recommended)

```bash
make setup
```

This automatically:

1. Validates prerequisites
2. Installs npm dependencies
3. Creates `.env.local` from `.env.example`
4. Starts Docker services (PostgreSQL, Redis, Mailhog)
5. Runs database migrations
6. Seeds sample data
7. Validates the setup

### Option 2: Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env.local

# 3. Edit .env.local with your API keys
# Required: DATABASE_URL, API_KEY, GOOGLE_PLACES_API_KEY, etc.

# 4. Start Docker services
docker-compose up -d postgres redis

# 5. Run migrations
npx prisma migrate dev

# 6. Seed database
npx prisma db seed

# 7. Start dev server
npm run dev
```

### Option 3: Full Docker Setup

```bash
# Start all services including Next.js
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Core (required)
DATABASE_URL="postgresql://postgres:password@localhost:5435/proposal_engine"
API_KEY="your-api-key-here"
NEXTAUTH_SECRET="your-nextauth-secret-here-32chars-min"

# Google APIs (required for audits)
GOOGLE_PLACES_API_KEY="..."
GOOGLE_PAGESPEED_API_KEY="..."
GOOGLE_AI_API_KEY="..."
GCP_PROJECT_ID="..."

# External APIs (required)
SERP_API_KEY="..."

# Email (required for delivery)
RESEND_API_KEY="..."
```

See `.env.example` for all available options.

## Development

### Starting the Server

```bash
# Using make
make dev

# Or directly
npm run dev
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Format
npx prettier --write .
```

### Useful Commands

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `make setup`      | Full setup (deps, env, DB, seed)    |
| `make dev`        | Start development server            |
| `make test`       | Run test suite                      |
| `make test-audit` | Run sample audit to verify pipeline |
| `make stop`       | Stop Docker services                |
| `make clean`      | Remove build artifacts              |
| `make reset`      | Full reset (clean + DB volumes)     |

## Project Structure

```
ProposalOS/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── audit/         # Audit endpoints
│   │   ├── proposal/      # Proposal endpoints
│   │   └── cron/          # Scheduled jobs
│   ├── (dashboard)/       # Dashboard pages
│   └── (marketing)/       # Marketing pages
├── lib/                   # Core business logic
│   ├── audit/             # Audit orchestration
│   ├── pipeline/          # Pipeline stages
│   ├── proposal/          # Proposal generation
│   ├── modules/           # Data collection modules
│   ├── llm/               # LLM providers
│   └── observability/     # Logging, metrics, tracing
├── prisma/                # Database schema and migrations
├── scripts/               # Utility scripts
├── docs/                  # Documentation
└── docker/                # Docker configuration
```

## Key Documentation

| Document                                       | Description                     |
| ---------------------------------------------- | ------------------------------- |
| [Architecture](docs/ARCHITECTURE.md)           | System design and pipeline flow |
| [Contributing](CONTRIBUTING.md)                | How to contribute code          |
| [Branch Protection](docs/BRANCH_PROTECTION.md) | Git workflow                    |
| [Runbooks](docs/RUNBOOKS.md)                   | Operational procedures          |
| [Observability](docs/OBSERVABILITY_SETUP.md)   | Monitoring setup                |
| [Integrations](docs/INTEGRATIONS.md)           | External service integration    |

## API Quick Reference

### Create Audit

```bash
curl -X POST http://localhost:3000/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"name": "Joes Plumbing", "city": "Chicago"}'
```

### Get Audit Status

```bash
curl http://localhost:3000/api/audit/{id} \
  -H "x-api-key: your-api-key"
```

### View Proposal

```
GET /api/proposal/token/{token}
```

## Troubleshooting

### Database Connection Issues

```bash
# Check Docker is running
docker ps

# Restart database
docker-compose restart postgres

# Check connection
docker-compose exec postgres pg_isready
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Environment Validation Errors

```bash
# Run validation
npm run validate:env

# Check .env.local exists and has required values
cat .env.local | grep -E "^[A-Z_]+="
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Branch strategy
- PR process
- Testing expectations
- Audit module development guide

## License

Private - Not Open Source

---

**Built with ❤️ using Next.js, Prisma, and Gemini**
