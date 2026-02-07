# Proposal Engine MVP

> **MVP Promise:** Business name + city → 90-second audit → evidence-backed proposal with 3-tier pricing → close deals

## Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Database:** Cloud SQL for PostgreSQL + Prisma ORM
- **AI:** Vertex AI (Gemini 1.5 Pro & Flash)
- **Orchestration:** Cloud Workflows + Cloud Run Jobs
- **Hosting:** Google Cloud Run
- **Storage:** Google Cloud Storage

## Quick Start

### Prerequisites

1. Node.js 18+ installed
2. GCP Project with APIs enabled:
   - Cloud SQL Admin API
   - Cloud Run API
   - Vertex AI API
   - Cloud Workflows API
   - Places API
   - PageSpeed Insights API

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.local` and fill in your values:
   ```bash
   DATABASE_URL=postgresql://...
   GCP_PROJECT_ID=your-project-id
   GOOGLE_PLACES_API_KEY=...
   API_KEY=your-secret-key
   ```

3. **Start Cloud SQL Auth Proxy** (for local dev):
   ```bash
   cloud-sql-proxy your-instance-connection-name
   ```

4. **Run database migrations:**
   ```bash
   npx prisma migrate dev
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## API Endpoints

### Health Check
```bash
GET /api/health
```

### Create Audit
```bash
POST /api/audit
Headers: x-api-key: your-api-key
Body: {
  "name": "Joe's Plumbing",
  "city": "Saskatoon"
}
```

### Get Audit
```bash
GET /api/audit/{id}
```

## Project Structure

```
/Users/danishsethi/ProposalOS/
├── app/
│   ├── api/
│   │   ├── health/route.ts       # Health check
│   │   └── audit/
│   │       ├── route.ts           # Create audit (POST)
│   │       └── [id]/route.ts      # Get audit (GET)
│   ├── page.tsx                   # Homepage
│   └── layout.tsx                 # Root layout
├── lib/
│   └── db.ts                      # Prisma client singleton
├── prisma/
│   └── schema.prisma              # Database schema
└── workflows/                     # Cloud Workflows definitions (TBD)
```

## Development Roadmap

- [x] **Week 1: Foundation** - Next.js, Prisma, API routes
- [ ] **Week 2: Data Collection** - Website, GBP, Competitor modules
- [ ] **Week 3: Diagnosis** - Vertex AI integration, clustering
- [ ] **Week 4: Proposal** - Tier mapping, PDF generation
- [ ] **Week 5: Orchestration** - Cloud Workflows, end-to-end
- [ ] **Week 6: Pilot** - Real audits, QA, launch

## License

Private - Not Open Source
