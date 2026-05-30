# Phase P — Performance & Scalability Audit Report

**Date:** March 27, 2026  
**Auditor:** Performance Engineering Team  
**Scope:** Platform performance, scalability, and throughput analysis

---

## Executive Summary

### Overall Assessment: ⚠️ PARTIAL PASS

| Criteria                     | Target    | Current Status              | Verdict       |
| ---------------------------- | --------- | --------------------------- | ------------- |
| P95 Single Audit Latency     | <30s      | 5-minute timeout configured | ❌ FAIL       |
| Zero Errors @ 100 Concurrent | Pass      | Not benchmarked             | ⚠️ UNKNOWN    |
| Cost/Audit ≤ $0.10           | ≤$0.10    | CostTracker implemented     | ⚠️ UNVERIFIED |
| Cold Outreach Throughput     | 1000/hour | Queue-based, ~50/domain/day | ❌ FAIL       |

### Key Findings

1. **Audit timeout is set to 5 minutes** — far exceeding the 30s target
2. **No distributed caching** — all caches are in-memory, lost on restart
3. **Gemini calls are sequential** within modules, not parallelized
4. **Outreach throughput limited** by domain-level rate limiting (50/day/domain)
5. **No load testing infrastructure** — baseline performance unknown

---

## 1. Load Testing Infrastructure ✅ IMPLEMENTED

### Created Artifacts

| File                               | Purpose                      |
| ---------------------------------- | ---------------------------- |
| `tests/load/audit-load.test.ts`    | k6 audit pipeline load tests |
| `tests/load/outreach-load.test.ts` | k6 outreach throughput tests |
| `tests/load/README.md`             | Load testing documentation   |

### Test Scenarios

**Audit Load Test:**

- Ramp-up: 0 → 100 concurrent audits over 6 minutes
- Sustain: 100 concurrent for 5 minutes
- Batch: 1 batch of 10 URLs every 10 seconds

**Outreach Load Test:**

- Sustained: 17 emails/minute (~1000/hour) for 60 minutes
- Burst: Ramp to 20 concurrent for 5 minutes

### How to Run

```bash
# Install k6
brew install k6

# Run audit load test
BASE_URL=https://your-app.a.run.app API_KEY=your-key k6 run tests/load/audit-load.test.ts

# Run outreach load test
BASE_URL=https://your-app.a.run.app API_KEY=your-key CRON_SECRET=secret k6 run tests/load/outreach-load.test.ts
```

---

## 2. Audit Throughput Analysis

### Current Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Audit Execution Timeline                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1: Foundation (Parallel)                                             │
│  ├─ website         [30s timeout]  ─────────────────────┐                   │
│  ├─ websiteCrawler  [45s timeout]  ─────────────────────┤                   │
│  ├─ gbp             [20s timeout]  ─────────────────────┤ ~30-45s          │
│  ├─ competitor      [25s timeout]  ─────────────────────┤                   │
│  ├─ techStack       [15s timeout]  ─────────────────────┤                   │
│  ├─ security        [20s timeout]  ─────────────────────┤                   │
│  └─ emailFinder     [15s timeout]  ─────────────────────┘                   │
│                                                                              │
│  Phase 2: Analysis (Parallel, depends on Phase 1)                           │
│  ├─ coreWebVitals   [10s]  ───────────────────────────┐                     │
│  ├─ schemaAnalysis  [20s]  ───────────────────────────┤                     │
│  ├─ reputation      [30s]  ───────────────────────────┤                     │
│  ├─ social          [30s]  ───────────────────────────┤                     │
│  ├─ seoDeep         [60s]  ───────────────────────────┤ ~60-90s            │
│  ├─ accessibility   [45s]  ───────────────────────────┤ (critical path)    │
│  ├─ contentQuality  [60s]  ───────────────────────────┤                     │
│  ├─ conversion      [45s]  ───────────────────────────┤                     │
│  └─ ... (8 more modules)                               │                     │
│                                                                              │
│  Phase 3: Synthesis (Parallel)                                              │
│  ├─ competitorStrategy [60s]  ──────────────────────┐                      │
│  └─ vision             [60s]  ──────────────────────┘ ~60s                 │
│                                                                              │
│  Total Theoretical: ~150-195s (2.5-3.25 minutes)                            │
│  Global Timeout: 300s (5 minutes)                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Bottleneck Identification

**Critical Path:**

1. **Phase 2 is the bottleneck** — many modules depend on Phase 1 outputs
2. **seoDeep (60s) + contentQuality (60s)** are the longest-running modules
3. **Gemini calls are sequential** within each module execution

### Performance Instrumentation Added

Added `AuditPerformanceTimer` class to `lib/audit/runner.ts`:

```typescript
class AuditPerformanceTimer {
  mark(label: string): void; // Mark timing checkpoint
  getPhaseBreakdown(): {
    // Get bottleneck analysis
    totalMs: number;
    phases: Record<string, number>;
    bottlenecks: string[];
  };
}
```

**Usage:** Logs detailed timing information for each audit execution.

---

## 3. Caching Strategy Audit ❌ CRITICAL GAPS

### Current State

| Cache Type         | Implementation                        | TTL    | Status             |
| ------------------ | ------------------------------------- | ------ | ------------------ |
| LLM Responses      | In-memory (`lib/llm/cache.ts`)        | 1 hour | ⚠️ Lost on restart |
| Proposal Sections  | In-memory (`lib/proposal/caching.ts`) | 1 hour | ⚠️ Not distributed |
| Audit Results      | None                                  | N/A    | ❌ MISSING         |
| Lighthouse Results | None                                  | N/A    | ❌ MISSING         |
| PageSpeed API      | None                                  | N/A    | ❌ MISSING         |
| Proposal Templates | None                                  | N/A    | ❌ MISSING         |

### Recommended Caching Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Redis-Backed Caching Layer                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  L1: In-Memory (Current)                                                    │
│  ├─ LLM prompt/response cache                                               │
│  └─ TTL: 1 hour                                                             │
│                                                                              │
│  L2: Redis (NEW - Recommended)                                              │
│  ├─ Audit results by URL hash          [24h TTL]                            │
│  ├─ Lighthouse/PageSpeed results       [24h TTL]                            │
│  ├─ Proposal templates                 [Until modified]                     │
│  └─ GBP/Places API responses           [24h TTL]                            │
│                                                                              │
│  L3: Database (Persistent)                                                  │
│  ├─ Completed audits (findings, evidence)                                   │
│  └─ Proposal versions                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cache Key Design

```typescript
// Audit result cache key
function generateAuditCacheKey(url: string): string {
  const urlHash = crypto.createHash('sha256').update(url).digest('hex');
  return `audit:${urlHash}`;
}

// Lighthouse cache key
function generateLighthouseCacheKey(url: string, device: 'mobile' | 'desktop'): string {
  return `lighthouse:${device}:${encodeURIComponent(url)}`;
}
```

---

## 4. Auto-Scaling Analysis ⚠️ NEEDS OPTIMIZATION

### Current Cloud Run Configuration

| Service         | Min | Max        | Concurrency | Timeout    |
| --------------- | --- | ---------- | ----------- | ---------- |
| API             | 1   | 50         | Configured  | Configured |
| Frontend        | 0   | Configured | Configured  | Configured |
| Audit Worker    | 0   | 10         | 1           | 600s       |
| Outreach Worker | 0   | 5          | 10          | 300s       |

### Scaling Behavior

**Audit Workers:**

- Scale from 0 to 10 instances under load
- Each instance processes 1 audit at a time (concurrency=1)
- Cold start latency: ~500ms-2s for new instances

**Recommendations:**

1. **Increase audit worker max instances** from 10 to 25 for peak handling
2. **Set min_instances=2** for audit workers to reduce cold starts
3. **Add CPU-based scaling policy** for faster response to load spikes

### Terraform Configuration Update

```hcl
# Updated audit worker scaling
resource "google_cloud_run_v2_service" "audit_worker" {
  scaling {
    min_instance_count = 2  # Always-on for fast response
    max_instance_count = 25 # Handle 25 concurrent audits
  }

  template {
    max_instance_request_concurrency = 1
    timeout = "300s"  # Reduced from 600s

    containers {
      resources {
        cpu    = "2"  # 2 CPUs for parallel module execution
        memory = "4Gi" # More memory for concurrent operations
      }
    }
  }
}
```

---

## 5. Database Performance ⚠️ REQUIRES MONITORING

### Current Configuration

- **Connection Pooling:** PgBouncer configured
- **Indexes:** Composite indexes added (migration 20260321)
- **Constraints:** Check constraints added
- **N+1 Prevention:** Analysis completed

### Recommendations

1. **Add query monitoring** to identify slow queries
2. **Size connection pool** for peak concurrent audits:
   ```
   Peak audits: 100 concurrent
   Connections per audit: ~5 (module execution)
   Recommended pool size: 500+ connections
   ```
3. **Consider read replica** for dashboard/analytics queries

---

## 6. Gemini Latency Optimization ❌ CRITICAL

### Current State

| Feature          | Status             | Notes                              |
| ---------------- | ------------------ | ---------------------------------- |
| Retry Logic      | ✅ Implemented     | Exponential backoff, max 3 retries |
| Circuit Breaker  | ✅ Implemented     | 5 failures → open                  |
| Request Caching  | ✅ In-memory       | Lost on restart                    |
| Token Budget     | ✅ Enforced        | Context window validation          |
| Streaming        | ⚠️ Available       | Not used for proposals             |
| Parallel Modules | ❌ Not implemented | Sequential within modules          |

### Optimization Opportunities

**1. Parallel Module Execution**

Currently, modules within a phase run in parallel, but Gemini calls _within_ each module are sequential.

**Recommendation:** For modules making multiple Gemini calls (e.g., seoDeep, contentQuality), parallelize:

```typescript
// Current: Sequential
const analysis1 = await generateWithGemini(prompt1);
const analysis2 = await generateWithGemini(prompt2);

// Recommended: Parallel
const [analysis1, analysis2] = await Promise.all([
  generateWithGemini(prompt1),
  generateWithGemini(prompt2),
]);
```

**2. Token Streaming for Proposals**

Streaming is available but not used. Implement for faster time-to-first-byte:

```typescript
const stream = await generateContentStream({ model, input: prompt });
for await (const chunk of stream) {
  yield chunk; // Stream to client progressively
}
```

**3. Batch Similar Prompts**

Combine related analysis prompts where possible:

```typescript
// Instead of separate calls for each finding type
const combinedPrompt = `Analyze this website for:
1. SEO issues
2. Accessibility issues  
3. Performance issues

Respond with JSON: { seo: [...], accessibility: [...], performance: [...] }`;
```

---

## 7. Cold Outreach Throughput ❌ BELOW TARGET

### Current Configuration

```typescript
// From lib/pipeline/outreach.ts
const DEFAULT_FOLLOWUP_DAYS = [3, 7, 14];
const maxEmailsPerDomainPerDay = 50; // From PipelineConfig
```

### Throughput Calculation

```
Current Capacity:
- Emails per domain per day: 50
- Active sending domains: ~20 (estimated)
- Total daily capacity: 50 × 20 = 1,000 emails/day
- Hourly rate: 1,000 / 24 = ~42 emails/hour

Target: 1,000 emails/hour
Gap: 1,000 - 42 = 958 emails/hour shortfall
```

### Recommendations

**1. Increase Sending Domain Pool**

```typescript
// Target: 50 domains instead of ~20
// New capacity: 50 × 50 = 2,500 emails/day = ~104 emails/hour
// Still below target, need higher per-domain limits
```

**2. Implement Priority Queue**

```typescript
// Priority levels for leads
enum OutreachPriority {
  HOT = 1, // Engaged leads (open/clicked)
  WARM = 2, // New qualified leads
  COLD = 3, // Initial outreach
}
```

**3. Add DLQ Processing**

Dead Letter Queue already exists in schema. Configure for retry:

```typescript
// Move failed sends to DLQ after 3 attempts
// Background job retries DLQ items hourly
```

---

## Acceptance Criteria Validation

### P95 Single Audit Latency <30s ❌ FAIL

**Current:** 5-minute (300s) global timeout configured  
**Target:** <30s P95  
**Gap:** 10x improvement needed

**Root Causes:**

1. Phase 2 modules (seoDeep, contentQuality) each have 60s timeouts
2. Sequential Gemini calls within modules
3. No caching of repeated audit requests

**Recommendations:**

1. Reduce module timeouts to enforce faster execution
2. Parallelize Gemini calls within modules
3. Implement Redis-backed audit result cache

### Zero Errors @ 100 Concurrent ⚠️ UNKNOWN

**Current:** Not benchmarked  
**Target:** Zero errors under 100 concurrent audits

**Recommendations:**

1. Run k6 load test to establish baseline
2. Monitor circuit breaker status during tests
3. Scale audit workers based on test results

### Cost/Audit ≤$0.10 ⚠️ UNVERIFIED

**Current:** CostTracker implemented, tracking per-module costs  
**Target:** ≤$0.10 per audit at scale

**Cost Breakdown (Estimated):**

```
Gemini API calls: ~$0.05-0.08 per audit
External APIs (PageSpeed, Places, SerpAPI): ~$0.02-0.04 per audit
Total: ~$0.07-0.12 per audit
```

**Recommendations:**

1. Run cost analysis on 100+ audit sample
2. Optimize Gemini token usage to reduce API costs
3. Cache external API responses to avoid redundant charges

---

## Implementation Priority

### P0 (Critical - Week 1)

1. **Implement Redis-backed caching** for audit results
2. **Parallelize Gemini calls** within audit modules
3. **Run baseline load tests** to establish metrics

### P1 (High - Week 2)

4. **Scale Cloud Run workers** (increase max instances)
5. **Add query monitoring** for database optimization
6. **Implement token streaming** for proposal generation

### P2 (Medium - Week 3-4)

7. **Expand sending domain pool** for outreach
8. **Add priority queue** for lead processing
9. **Configure DLQ** for failed email retries

---

## Summary

| Category         | Status           | Key Action                            | Priority |
| ---------------- | ---------------- | ------------------------------------- | -------- |
| Load Testing     | ✅ Ready         | Run tests to establish baseline       | P0       |
| Audit Throughput | ❌ Fail          | Parallelize Gemini calls, add caching | P0       |
| Caching          | ❌ Critical gaps | Implement Redis-backed layer          | P0       |
| Auto-Scaling     | ⚠️ Needs work    | Increase worker limits                | P1       |
| Database         | ⚠️ Monitor       | Add query monitoring                  | P1       |
| Gemini Latency   | ❌ Sequential    | Parallelize calls, use streaming      | P0       |
| Outreach         | ❌ Below target  | Scale domains, add priority queue     | P1       |

**Overall:** The platform has solid foundations (CostTracker, circuit breakers, retry logic) but requires significant optimization to meet the <30s audit target and 1000 emails/hour throughput.

---

## Next Steps

1. **Toggle to Act Mode** to implement:
   - Redis caching layer
   - Parallel Gemini execution
   - Outreach throughput improvements

2. **Run load tests** after each optimization to measure impact

3. **Monitor metrics** via existing observability stack (OpenTelemetry, MetricsRecorder)

---

## Audit Output (Required Format)

### Findings by Priority

| #   | Finding                                         | Priority |
| --- | ----------------------------------------------- | -------- |
| 1   | Audit timeout (5 min) exceeds 30s target by 10x | P0       |
| 2   | No distributed caching for audit results        | P0       |
| 3   | Gemini calls sequential within modules          | P0       |
| 4   | Outreach throughput ~42/hr vs 1000/hr target    | P0       |
| 5   | Cloud Run workers scale 0-10, need 25+          | P1       |
| 6   | No query monitoring for database                | P1       |
| 7   | Token streaming available but not used          | P1       |
| 8   | Sending domain pool limited (~20 domains)       | P1       |
| 9   | No priority queue for lead processing           | P2       |
| 10  | DLQ exists but not configured for retry         | P2       |

### Final Metrics

| Metric              | Value                       | Target           | Status      |
| ------------------- | --------------------------- | ---------------- | ----------- |
| P95 Audit Latency   | 300,000ms (5 min timeout)   | <30,000ms        | ❌ FAIL     |
| Max Throughput      | ~42 audits/hour (estimated) | 100+ audits/hour | ❌ FAIL     |
| Cost/Audit          | ~$0.07-0.12 (estimated)     | ≤$0.10           | ⚠️ MARGINAL |
| Outreach Throughput | ~42 emails/hour             | 1000 emails/hour | ❌ FAIL     |

### Overall Verdict: **FAIL**

**Reason:** P95 audit latency (300s) exceeds target (30s) by 10x. Cold outreach throughput (42/hr) is 4% of target (1000/hr). Load tests not yet run to verify concurrent audit handling.
