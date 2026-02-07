# ProposalOS QA Checklist

## Pre-Deployment Checklist

### Environment
- [ ] `.env.local` has all required variables
  - [ ] `DATABASE_URL` - Postgres connection string
  - [ ] `GCP_PROJECT_ID` - Your GCP project
  - [ ] `GCP_REGION` - e.g., us-central1
  - [ ] `GOOGLE_PAGESPEED_API_KEY` - PageSpeed Insights
  - [ ] `GOOGLE_PLACES_API_KEY` - Places API (New)
  - [ ] `SERP_API_KEY` - SerpAPI for competitor data
- [ ] Prisma schema is in sync: `npx prisma db push`
- [ ] Build succeeds: `npm run build`

### API Verification
- [ ] `GET /api/health` returns `{ status: 'ok' }`
- [ ] `POST /api/audit` creates audit and returns findings
- [ ] `POST /api/audit/[id]/diagnose` returns clusters
- [ ] `POST /api/audit/[id]/propose` returns proposal with pricing

---

## Manual QA Tests

### 1. Audit Input Form
- [ ] Form loads correctly with all fields
- [ ] Validation works (required fields)
- [ ] Submit button shows loading state
- [ ] Error messages display properly

### 2. Findings Dashboard
- [ ] All findings display after audit completes
- [ ] Painkillers show red border
- [ ] Vitamins show blue border
- [ ] Impact scores visible
- [ ] Stats cards show correct counts

### 3. Proposal Generation
- [ ] "Generate Proposal" button works
- [ ] Loading state shown during generation
- [ ] Executive summary is specific (not generic)
- [ ] 3 tier cards display with correct pricing
- [ ] Popular badge on Growth tier
- [ ] "Choose" buttons work

### 4. Edge Cases
- [ ] Empty website URL → Degraded mode works
- [ ] Non-existent business → Graceful error
- [ ] API timeout → Error message shown
- [ ] Very long business name → UI handles overflow

---

## First Real Audit Checklist

### Target Business Selection
- [ ] Business is real and still operating
- [ ] Has Google Business Profile listing
- [ ] Has a website (preferably)
- [ ] Industry matches our pricing table

### Pre-Audit
- [ ] Manually verify GBP listing exists
- [ ] Note current rating/review count
- [ ] Check website manually for obvious issues

### Run Audit
- [ ] Record start time
- [ ] Note any console errors
- [ ] Screenshot the results
- [ ] Record completion time

### Validate Results
- [ ] All findings are accurate (no hallucinations)
- [ ] Impact scores seem reasonable
- [ ] No duplicate findings
- [ ] Evidence references are valid URLs

### Proposal Quality
- [ ] Executive summary mentions specific metrics
- [ ] No generic/templated language
- [ ] Pricing aligns with industry
- [ ] All tiers have distinct value

---

## Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Audit completion rate | >90% | |
| Findings per audit | 5-12 | |
| Hallucination rate | <5% | |
| Cluster stability (Jaccard) | >60% | |
| Avg audit duration | <30s | |
| Avg proposal duration | <15s | |

---

## Known Issues / Workarounds

*Document any known issues here*

1. 
2. 
3. 
