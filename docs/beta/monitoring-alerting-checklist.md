# Monitoring and Alerting Checklist — Paid Closed Beta

This document establishes the telemetry markers, health check vectors, and alerting thresholds for the ProposalOS Paid Closed Beta environment. All operators must configure monitoring systems to trace these metrics.

> [!TIP]
>
> - **Centralized Endpoint**: Trace `http://localhost:3001/api/health` as the primary uptime probe.
> - **Structured Logging**: Ensure Pino logger is active and console logger fallbacks are rejected to maintain clear, parseable metrics.

---

## 1. Uptime & API Health Metrics

### Primary Health Probe (`/api/health`)

- [ ] **Uptime Trace**: Set a synthetic probe to call `/api/health` every 60 seconds.
- [ ] **Component Checks**: Ensure the API returns `200 OK` and contains the following JSON structure:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-05-21T17:45:34Z",
    "components": {
      "db": "healthy",
      "queue": "healthy",
      "cron": "healthy"
    },
    "externalApis": {
      "resend": true,
      "stripe": true
    }
  }
  ```

---

## 2. Telemetry Parameters to Trace

Operators must configure dashboards (e.g. GCP Cloud Monitoring or Prometheus) to track:

### Core Pipeline Performance

- [ ] **Audit Success Rate**: Total completed audits / Total started audits over a 10-minute window.
- [ ] **Audit Latency (p50 / p95)**: Tracking thinking duration and page-rendering time.
- [ ] **Failed Audit Volume**: Counting events in the `PipelineErrorLog`.
- [ ] **Stuck `RUNNING` Audits**: Active crawls running for > 30 minutes.

### Queue & Infrastructure Status

- [ ] **Queue Depth**: Backlog size of unresolved audits in the database.
- [ ] **Dead Letter Queue (DLQ) Count**: Failed audit tasks retried 3+ times.
- [ ] **Database Connection Count**: Active PgBouncer pooled connections.

### Security & Compliance

- [ ] **RLS / Tenant Isolation Errors**: Any SQL exceptions involving tenant mismatches or cross-tenant query rejections.
- [ ] **Audit Trail Integrity**: Write failures or checksum mismatches in the non-repudiation log.
- [ ] **Authentication Failures**: Spike in NextAuth 401/403 responses.
- [ ] **Proposal Token Access Failures**: Unauthorized attempts to open proposals without active, cryptographically signed tokens.

### External Service Integration

- [ ] **Stripe Webhook Failures**: Duplicate webhook notifications or signature validation rejections.
- [ ] **Email Delivery Failures**: Resend API bounce/drop events.
- [ ] **Provider Circuit Breaker State**: Tracking any fallback occurrences from Gemini 2.0 to Anthropic or OpenAI.
- [ ] **Rate Limit Hits**: Spike in 429 requests rejected by the Redis sliding-window ratelimiter.
- [ ] **Cost Budget Threshold**: Cumulative vertex token cost exceeding target limits.

---

## 3. Alert Thresholds and Escalations

Configure alerts using these exact parameters:

| Metric                      |     Warning Threshold      |     Critical Threshold      | On-Call Action                                                                   |
| :-------------------------- | :------------------------: | :-------------------------: | :------------------------------------------------------------------------------- |
| **API Error Rate**          |  &gt; 1% errors in 5 min   |   &gt; 5% errors in 5 min   | **Critical**: Check Postgres & PgBouncer immediately.                            |
| **Audit Pipeline Failures** | &gt; 5% failures in 10 min | &gt; 15% failures in 10 min | **Warning**: Restart worker instance. **Critical**: Enable fallback provider.    |
| **p95 Audit Latency**       |      &gt; 60 seconds       |       &gt; 90 seconds       | **Warning**: Trace Puppeteer crawl times. **Critical**: Scale GCP resources.     |
| **Queue Backlog Size**      |   &gt; 50 audits queued    |   &gt; 100 audits queued    | **Warning**: Check worker concurrency. **Critical**: Spin up second instance.    |
| **DLQ Message Influx**      | &gt; 2 messages in 1 hour  |  &gt; 5 messages in 1 hour  | **Critical**: Extract stack traces from `PipelineErrorLog`.                      |
| **RLS Violation Event**     |            N/A             |   &gt; 0 violations (Any)   | **Instant Severity-0**: Freeze database, isolate tenant, trigger emergency stop. |
| **Stripe Webhook Failures** | &gt; 5% failures in 15 min | &gt; 10% failures in 15 min | **Warning**: Check signature keys. **Critical**: Manually trace transaction IDs. |
| **LLM Daily Budget**        |  &gt; $25.00 spend / day   |   &gt; $50.00 spend / day   | **Warning**: Slack alert. **Critical**: Throttle API quotas per tenant.          |
| **Audit Trail Failures**    |            N/A             |    &gt; 0 failures (Any)    | **Critical**: Hold all pending proposal completions immediately.                 |

---

## 4. Health Dashboards Verification

- [ ] **Uptime Probe Configured**: Synthetic ping setup pointing to `/api/health`.
- [ ] **Alert Route Verified**: Verify webhook triggers dispatch slack alerts to `#incidents` and `#beta-ops`.
- [ ] **Pino Metrics Verified**: Ensure Prometheus is successfully scraping node exporter endpoints.
