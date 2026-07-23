# Manual Work Required - Autonomous Proposal Engine

This document outlines all remaining work that needs to be completed manually to finish the Autonomous Proposal Engine implementation.

## Current Status: 25/29 Tasks Complete (86%)

### ✅ Completed (Tasks 1-25)
- Core pipeline infrastructure (orchestrator, state machine, metrics)
- Discovery → Audit → Diagnose → Propose → Outreach → Close → Deliver → Learn loop
- All property-based tests and unit tests for completed components
- All cron endpoints for automated pipeline execution
- API endpoints for engagement tracking, chat, and learning
- Multi-tenant configuration with admin UI
- Human review queue and admin dashboard

### 🚧 Remaining Tasks (26-29)

---

## Task 26: Agency Partner Network

**Status:** Not Started  
**Priority:** Medium  
**Estimated Effort:** 8-12 hours

### 26.1 Implement Partner Portal (`lib/pipeline/partnerPortal.ts`)

**What to implement:**
```typescript
// Functions needed:
- onboardPartner(config: PartnerConfig): Promise<void>
- matchLeadsToPartner(partnerId: string): Promise<PackagedLead[]>
- deliverLead(partnerId: string, leadId: string): Promise<PackagedLead>
- updateLeadStatus(partnerId: string, leadId: string, status: string): Promise<void>
- getPartnerMetrics(partnerId: string): Promise<PartnerMetrics>
```

**Requirements:**
- Support per-lead ($200-$500) and subscription ($1K-$2K/month) pricing models
- Isolate partner data from direct pipeline and other partners
- Package complete lead data (audit, proposal, pain score, contact)

**Reference:** Requirements 16.1-16.6, Design document sections 14

### 26.2 Property Tests (`lib/pipeline/__tests__/partnerPortal.property.test.ts`)

**Property to test:**
- Property 38: Partner lead isolation

**Test that:**
- Partner queries only return leads delivered to that partner
- No cross-partner data leakage
- No direct pipeline data visible to partners

### 26.3 Unit Tests (`lib/pipeline/__tests__/partnerPortal.test.ts`)

**Test cases needed:**
- Lead matching logic (vertical, geography, volume limits)
- Lead packaging (includes all required data)
- Pricing model calculations (per-lead vs subscription)
- Partner metrics aggregation

### 26.4 API Endpoints

**Files to create:**
- `app/api/pipeline/partners/route.ts` - CRUD operations for partners
- `app/api/pipeline/partners/[id]/leads/route.ts` - Lead delivery and status updates

**Endpoints:**
- GET /api/pipeline/partners - List all partners
- POST /api/pipeline/partners - Create new partner
- PUT /api/pipeline/partners/[id] - Update partner config
- DELETE /api/pipeline/partners/[id] - Remove partner
- GET /api/pipeline/partners/[id]/leads - Get delivered leads
- POST /api/pipeline/partners/[id]/leads - Deliver new lead
- PUT /api/pipeline/partners/[id]/leads/[leadId] - Update lead status

### 26.5 Partner Dashboard UI (`app/(partner)/dashboard/page.tsx`)

**UI Components needed:**
- Delivered leads list with filtering
- Lead detail view with audit/proposal data
- Status update controls
- Partner metrics dashboard (conversion rate, revenue, etc.)

### 26.6 Cron Job (`app/api/cron/partner-matching/route.ts`)

**Functionality:**
- Run daily
- Match qualified leads to partners based on preferences
- Respect partner volume limits
- Track deliveries in PartnerDeliveredLead table

---

## Task 27: Cross-Tenant Intelligence

**Status:** Not Started  
**Priority:** Medium  
**Estimated Effort:** 10-14 hours

### 27.1 Implement Cross-Tenant Intelligence (`lib/pipeline/crossTenantIntelligence.ts`)

**What to implement:**
```typescript
// Functions needed:
- aggregatePatterns(tenantId: string, outcomes: WinLossData[]): Promise<void>
- predictCloseProb(prospect: ProspectData): Promise<PredictiveScore>
- getModelVersion(): string
- rollbackModel(version: string): Promise<void>
- ensureAnonymized(data: Record<string, unknown>): boolean
```

**Critical requirements:**
- Strip ALL tenant-identifiable data (business names, contacts, tenant IDs)
- Version models and support rollback
- Compute predictive close probability (0-100)
- Aggregate anonymized patterns (win rates, effective findings, pricing, email patterns)

**Reference:** Requirements 17.1-17.5, Design document sections 15

### 27.2 Property Tests (`lib/pipeline/__tests__/crossTenantIntelligence.property.test.ts`)

**Properties to test:**
- Property 39: Cross-tenant intelligence contains no PII
- Property 40: Predictive close probability is bounded (0-100)

**Test that:**
- No tenant-identifiable data in shared model
- Close probability always between 0-100
- Confidence score between 0-1
- Model version identifier present

### 27.3 Unit Tests (`lib/pipeline/__tests__/crossTenantIntelligence.test.ts`)

**Test cases needed:**
- PII detection and removal (business names, emails, phone numbers, addresses)
- Pattern aggregation from multiple tenants
- Predictive scoring with various inputs
- Model versioning and rollback
- Anonymization validation

### 27.4 Cron Job (`app/api/cron/intelligence-aggregation/route.ts`)

**Functionality:**
- Run weekly
- Aggregate patterns from recent outcomes (last 7 days)
- Ensure anonymization before aggregation
- Version the model with timestamp
- Store in SharedIntelligenceModel table

### 27.5 Integration with Pipeline Orchestrator

**Files to modify:**
- `lib/pipeline/orchestrator.ts`

**Changes needed:**
- Compute close probability for each prospect
- Prioritize higher probability prospects in processing queue
- Use predictive score in hot lead routing decisions

---

## Task 28: Country-Specific Configuration

**Status:** Not Started  
**Priority:** Low  
**Estimated Effort:** 6-8 hours

### 28.1 Implement Country Config (`lib/pipeline/countryConfig.ts`)

**What to implement:**
```typescript
// Functions needed:
- getCountryConfig(country: string): CountryConfig
- applyCountryConfig(prospect: ProspectLead): void
- convertCurrency(amount: number, from: string, to: string): number
- getLanguageTemplate(templateId: string, language: string): string
- getDataProviders(country: string): DataProviderConfig[]
```

**Countries to support:**
- US (English, USD)
- UK (English-GB, GBP)
- Canada (English-CA, CAD)

**Reference:** Requirements 11.2, Design document Property 31

### 28.2 Property Tests (`lib/pipeline/__tests__/countryConfig.property.test.ts`)

**Property to test:**
- Property 31: Country-specific configuration application

**Test that:**
- Correct language applied based on country
- Correct currency used in pricing
- Correct data providers selected

### 28.3 Unit Tests (`lib/pipeline/__tests__/countryConfig.test.ts`)

**Test cases needed:**
- Configuration selection by country
- Language template selection
- Currency conversion (USD ↔ GBP ↔ CAD)
- Data provider selection

### 28.4 Update Pipeline Stages

**Files to modify:**
- `lib/pipeline/discovery.ts` - Detect prospect country
- `lib/pipeline/outreach.ts` - Use country-specific templates
- `lib/pipeline/stages/diagnosisProposalStage.ts` - Apply country config to pricing

**Changes needed:**
- Detect country from discovery data (address, phone, business registration)
- Apply country config throughout pipeline
- Use language-specific email templates
- Convert pricing to local currency

---

## Task 29: Final Checkpoint

**Status:** Not Started  
**Priority:** High  
**Estimated Effort:** 4-6 hours

### What to do:
1. Run full test suite: `npm test -- lib/pipeline`
2. Run property tests: `npm test -- lib/pipeline --grep "Property"`
3. Check test coverage: `npm test -- --coverage lib/pipeline`
4. Fix any failing tests
5. Verify all cron jobs are configured
6. Test end-to-end pipeline flow
7. Update documentation

---

## Additional Manual Work

### 1. Database Migrations

**Status:** Partially Complete  
**Action Required:**

The Prisma schema has been updated with all required models, but you need to:

```bash
# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name autonomous-pipeline-complete

# Verify migration
npx prisma migrate status
```

**Models added:**
- ProspectStateTransition ✅
- DeliveryTask ✅
- PipelineConfig ✅
- PipelineErrorLog ✅
- OutreachTemplatePerformance ✅
- WinLossRecord ✅
- PreWarmingAction ✅
- DetectedSignal ✅
- ChatConversation ✅
- AgencyPartner ⚠️ (verify)
- PartnerDeliveredLead ⚠️ (verify)
- SharedIntelligenceModel ⚠️ (verify)

### 2. Environment Variables

**File:** `.env` or `.env.local`

**Required variables:**
```bash
# Existing (verify these are set)
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# New for pipeline
CRON_SECRET="your-secure-cron-secret"

# External API keys (for discovery and enrichment)
GOOGLE_MAPS_API_KEY="..."
YELP_API_KEY="..."
APOLLO_API_KEY="..."
HUNTER_API_KEY="..."
PROXYCURL_API_KEY="..."
CLEARBIT_API_KEY="..."

# Email sending (if not already configured)
RESEND_API_KEY="..."
SENDGRID_API_KEY="..."

# Stripe (if not already configured)
STRIPE_SECRET_KEY="..."
STRIPE_WEBHOOK_SECRET="..."
```

### 3. Cron Job Configuration

**Platform:** Vercel (or your hosting platform)

**Cron jobs to configure:**

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/discovery` | Every 6 hours | Discover new prospects |
| `/api/cron/pipeline-audit` | Every 2 hours | Process discovered prospects |
| `/api/cron/pipeline-outreach` | Every hour | Send outreach emails |
| `/api/cron/signal-detection` | Daily at 2am | Detect business signals |
| `/api/cron/pipeline-closing` | Every 4 hours | Process hot leads |
| `/api/cron/pipeline-delivery` | Daily at 8am | Process delivery tasks |
| `/api/cron/partner-matching` | Daily at 10am | Match leads to partners |
| `/api/cron/intelligence-aggregation` | Weekly (Sunday 3am) | Aggregate patterns |

**Vercel configuration:**
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/discovery",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/pipeline-audit",
      "schedule": "0 */2 * * *"
    },
    {
      "path": "/api/cron/pipeline-outreach",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/signal-detection",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/pipeline-closing",
      "schedule": "0 */4 * * *"
    },
    {
      "path": "/api/cron/pipeline-delivery",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/partner-matching",
      "schedule": "0 10 * * *"
    },
    {
      "path": "/api/cron/intelligence-aggregation",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

### 4. Authentication & Authorization

**Files to check:**
- `lib/auth.ts` - Verify NextAuth configuration
- Middleware for admin routes

**Required roles:**
- ADMIN - Full access to pipeline dashboard and configuration
- OWNER - Full access to pipeline dashboard and configuration
- PARTNER - Access to partner portal only
- USER - No pipeline access

**Routes to protect:**
- `/admin/pipeline/*` - ADMIN/OWNER only
- `/admin/pipeline/config` - ADMIN/OWNER only
- `/api/pipeline/config/*` - ADMIN/OWNER only
- `/api/pipeline/review` - ADMIN/OWNER only
- `/(partner)/*` - PARTNER role only

### 5. Monitoring & Alerting

**Setup required:**

1. **Error tracking** (Sentry, LogRocket, etc.)
   - Track pipeline errors
   - Alert on high error rates
   - Monitor circuit breaker trips

2. **Performance monitoring**
   - Track cron job execution times
   - Monitor API response times
   - Track database query performance

3. **Business metrics**
   - Dashboard for pipeline metrics
   - Email alerts for circuit breaker trips
   - Slack/Discord notifications for high-value prospects

### 6. Testing Before Production

**Checklist:**

- [ ] Run all tests: `npm test`
- [ ] Check test coverage: `npm test -- --coverage`
- [ ] Test discovery flow with real API keys (use test mode)
- [ ] Test audit pipeline with sample prospects
- [ ] Test outreach email generation and QA scoring
- [ ] Test human review queue
- [ ] Test admin dashboard
- [ ] Test pipeline configuration UI
- [ ] Verify all cron jobs execute successfully
- [ ] Test spending limit enforcement
- [ ] Test circuit breaker activation
- [ ] Load test with 100+ prospects

### 7. Documentation Updates

**Files to update:**

1. **README.md** - Add pipeline documentation section
2. **API documentation** - Document all new endpoints
3. **Deployment guide** - Update with pipeline-specific steps
4. **User guide** - Add admin dashboard usage guide

### 8. Missing API Endpoints

**Status:** ✅ COMPLETE - All endpoints created

1. ✅ `app/api/pipeline/metrics/route.ts` - GET pipeline metrics
2. ✅ `app/api/pipeline/prospects/[id]/route.ts` - GET prospect details
3. ✅ `app/api/pipeline/prospects/[id]/override/route.ts` - POST status override

### 9. UI Polish

**Components that may need styling updates:**

- Admin dashboard charts (consider adding Chart.js or Recharts)
- Review queue table (add sorting, filtering UI)
- Prospect detail view (add tabs for audit/proposal/engagement)
- Pipeline config form (add validation feedback)

### 10. Performance Optimization

**Areas to optimize:**

1. **Database queries**
   - Add indexes for frequently queried fields
   - Optimize review queue query (currently does post-query filtering)
   - Add database connection pooling

2. **Caching**
   - Cache pipeline metrics (Redis)
   - Cache tenant configurations
   - Cache country configurations

3. **Batch processing**
   - Tune batch sizes based on load
   - Implement queue depth monitoring
   - Add backpressure mechanisms

---

## Priority Order for Completion

### High Priority (Complete First)
1. ✅ Task 23: Multi-Tenant Configuration - COMPLETE
2. ✅ Task 25: Human Review Queue - COMPLETE
3. ✅ Missing API endpoints - COMPLETE
4. Database migrations
5. Environment variables setup
6. Cron job configuration

### Medium Priority (Complete Second)
7. Task 26: Agency Partner Network
8. Task 27: Cross-Tenant Intelligence
9. Authentication & authorization
10. Monitoring & alerting setup

### Low Priority (Complete Last)
11. Task 28: Country-Specific Configuration
12. UI polish and enhancements
13. Performance optimization
14. Documentation updates

---

## Estimated Total Remaining Effort

- **Tasks 26-29:** 28-40 hours
- **Infrastructure setup:** 4-6 hours
- **Testing & QA:** 6-8 hours
- **Documentation:** 2-4 hours

**Total:** 40-58 hours (5-7 working days)

---

## Getting Help

If you encounter issues:

1. Check the design document for component interfaces
2. Review existing implementations for patterns
3. Check property tests for correctness requirements
4. Refer to Prisma schema for data models
5. Review requirements document for acceptance criteria

## Notes

- All completed code includes comprehensive tests
- Property tests validate correctness properties
- Unit tests cover edge cases and specific scenarios
- API endpoints follow existing patterns
- UI components use Tailwind CSS (already configured)
- All database operations use Prisma ORM
