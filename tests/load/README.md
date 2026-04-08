# Performance Load Testing

This directory contains k6 load testing scripts for the ProposalOS platform.

## Prerequisites

1. **Install k6**:

   ```bash
   # macOS
   brew install k6

   # Linux
   sudo apt-get install k6

   # Docker
   docker run --rm -i grafana/k6 run -
   ```

2. **Set up environment variables**:
   ```bash
   export BASE_URL="https://your-app.a.run.app"
   export API_KEY="your-api-key"
   export CRON_SECRET="your-cron-secret"
   ```

## Test Scenarios

### 1. Audit Load Test (`audit-load.test.ts`)

Tests the audit pipeline under various load conditions.

**Scenarios:**

- **Ramp-up**: 0 → 100 concurrent audits over 6 minutes, sustain for 5 minutes
- **Batch Audits**: 1 batch of 10 URLs every 10 seconds

**Targets:**

- P95 audit latency < 30 seconds
- Success rate > 99%
- Zero errors under 100 concurrent audits

**Run:**

```bash
# Local
k6 run tests/load/audit-load.test.ts

# With custom URL
BASE_URL=https://your-app.a.run.app API_KEY=your-key k6 run tests/load/audit-load.test.ts

# Docker
docker run --rm -v $(pwd):/src grafana/k6 run /src/tests/load/audit-load.test.ts
```

### 2. Outreach Load Test (`outreach-load.test.ts`)

Tests the cold outreach email pipeline.

**Scenarios:**

- **Sustained Load**: 17 emails/minute (~1000/hour) for 60 minutes
- **Burst Load**: Ramp to 20 concurrent for 5 minutes

**Targets:**

- Throughput ≥ 1000 emails/hour
- Success rate > 98%
- Bounce rate < 5%

**Run:**

```bash
k6 run tests/load/outreach-load.test.ts
```

## Results

Test results are automatically saved to `results/` directory:

- `results/load-test-{timestamp}.json` - Detailed JSON results
- `results/outreach-test-{timestamp}.json` - Outreach results

## Interpreting Results

### Key Metrics

| Metric                | Description                     | Target      |
| --------------------- | ------------------------------- | ----------- |
| `audit_success_rate`  | Percentage of successful audits | > 99%       |
| `audit_latency.p(95)` | 95th percentile latency         | < 30,000ms  |
| `audit_duration.avg`  | Average end-to-end audit time   | < 60,000ms  |
| `emails_sent_total`   | Total emails sent               | ≥ 1000/hour |
| `email_success_rate`  | Percentage of successful sends  | > 98%       |

### Example Output

```
═══════════════════════════════════════════════════════════
  AUDIT LOAD TEST RESULTS
═══════════════════════════════════════════════════════════

  Overall: ✅ PASS

  Thresholds:
    P95 Latency: 28543ms (target: <30000ms)
    Success Rate: 99.5% (target: >99%)

  Audit Metrics:
    Total Audits Completed: 847
    Total Errors: 3
    Avg Duration: 24521ms
    P95 Duration: 28543ms
    P99 Duration: 35210ms

═══════════════════════════════════════════════════════════
```

## Performance Benchmarks

### Single Audit (< 30s P95)

```
Phase          | Target    | Current
---------------|-----------|----------
URL Validation | < 500ms   | TBD
Crawl          | < 10s     | TBD
Lighthouse     | < 8s      | TBD
Gemini Modules | < 15s     | TBD
Diagnosis      | < 2s      | TBD
Proposal       | < 3s      | TBD
```

### Batch Processing

| Batch Size | Target   | Current |
| ---------- | -------- | ------- |
| 10 URLs    | < 5 min  | TBD     |
| 100 URLs   | < 30 min | TBD     |

### Cold Outreach

| Metric        | Target    | Current |
| ------------- | --------- | ------- |
| Throughput    | 1000/hour | TBD     |
| Delivery Rate | > 95%     | TBD     |
| Bounce Rate   | < 5%      | TBD     |

## Troubleshooting

### High Latency

1. Check Cloud Run concurrency settings
2. Verify database connection pool size
3. Review Gemini API rate limits
4. Check for N+1 queries in audit modules

### High Error Rate

1. Verify API keys are valid
2. Check database connectivity
3. Review circuit breaker status
4. Check rate limiting configuration

### Throughput Issues

1. Increase Cloud Run max instances
2. Scale outreach sending domains
3. Optimize email queue processing
4. Review database write throughput

## CI/CD Integration

Add load testing to your CI/CD pipeline:

```yaml
# .github/workflows/load-test.yml
name: Load Testing

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run k6 load test
        uses: grafana/k6-action@v0.2.0
        with:
          filename: tests/load/audit-load.test.ts
        env:
          BASE_URL: ${{ secrets.PROD_URL }}
          API_KEY: ${{ secrets.API_KEY }}
```

## Related Documentation

- [Architecture](../../docs/ARCHITECTURE.md)
- [Observability Setup](../../docs/OBSERVABILITY_SETUP.md)
- [Runbooks](../../docs/RUNBOOKS.md)
