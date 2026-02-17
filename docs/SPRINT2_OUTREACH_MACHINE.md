# Sprint 2 Outreach Machine

This implementation adds a queue-driven outreach pipeline:

1. Discovery jobs by `city + vertical`
2. Automated multi-signal qualification with a weighted Pain Score (0-100)
3. Enrichment waterfall only for qualified leads
4. Metrics API for throughput, cost-per-qualified-lead, and outcome tracking

## New Data Models

- `ProspectDiscoveryJob`
- `ProspectLead`
- `ProspectEnrichmentRun`

## API Endpoints

- `POST /api/outreach/jobs`
  - Queue jobs for specific cities/verticals or seed top 50 metros (`seedTop50: true`)
- `GET /api/outreach/jobs`
  - List outreach jobs (filter by `status`, `city`, `vertical`)
- `POST /api/outreach/worker`
  - Process due jobs (discovery -> qualification -> enrichment)
- `GET /api/outreach/leads`
  - List discovered/qualified/enriched leads with filters
- `GET /api/outreach/metrics`
  - Throughput, cost, city/vertical breakdown, and proposal outcome metrics

## Pain Score Weights

- Website speed: 20
- Mobile broken: 15
- GBP neglected: 15
- No SSL: 10
- Zero review responses: 10
- Social dead: 10
- Competitors outperforming: 10
- Accessibility violations: 10

Qualified leads are those with `painScore >= painThreshold` (default 60).

## Quick Start

1. Generate Prisma client (after schema changes):
   - `npx prisma generate`
2. Queue top 50 metros x default Sprint 2 verticals:
   - `npm run sprint2-seed-jobs`
3. Process queue:
   - `curl -X POST "$BASE_URL/api/outreach/worker" -H "Authorization: Bearer $API_KEY" -H "x-tenant-id: $DEFAULT_TENANT_ID"`
