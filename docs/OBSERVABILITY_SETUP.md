# Observability Setup Guide

**Project:** ProposalOS  
**Last Updated:** March 27, 2026  
**Owner:** Platform Engineering

This document describes the complete observability stack for ProposalOS, including distributed tracing, metrics, alerting, and dashboard configurations.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Distributed Tracing](#distributed-tracing)
3. [Metrics Collection](#metrics-collection)
4. [Alerting](#alerting)
5. [Dashboard Configuration](#dashboard-configuration)
6. [Escalation Runbooks](#escalation-runbooks)
7. [Environment Variables](#environment-variables)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ProposalOS Observability                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Next.js    │    │  Background  │    │    LLM       │                  │
│  │   API Routes │───▶│   Workers    │───▶│  Providers   │                  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                    ┌────────▼────────┐                                      │
│                    │  OpenTelemetry  │                                      │
│                    │      SDK        │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                          │
│         │                   │                   │                           │
│  ┌──────▼───────┐  ┌────────▼────────┐  ┌──────▼───────┐                  │
│  │   GCP Cloud  │  │  Cloud Logging  │  │   Cloud      │                  │
│  │    Trace     │  │    (Logs)       │  │  Monitoring  │                  │
│  └──────────────┘  └─────────────────┘  └──────┬───────┘                  │
│                                                 │                           │
│                                          ┌──────▼───────┐                  │
│                                          │   Alerting   │                  │
│                                          │   Webhooks   │                  │
│                                          └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Distributed Tracing

### OpenTelemetry Configuration

The OpenTelemetry SDK is initialized in `lib/observability/otel.ts` and bootstrapped via `instrumentation.ts`.

**Auto-instrumented libraries:**

- HTTP/HTTPS (Next.js API routes)
- PostgreSQL (Prisma queries)
- LangSmith (LLM calls)

**Trace propagation:**

- W3C `traceparent` header format
- Correlation ID via `X-Correlation-Id` header
- Trace ID via `X-Trace-Id` header

### Trace Flow: Audit Request

```
1. HTTP Request → Middleware (injects traceparent)
2. API Route → runWithObservabilityContext()
3. Audit Worker → inherits parent trace
4. Web Crawl → child span
5. Gemini LLM → child span (LangSmith)
6. DB Query → child span (Prisma)
7. Response → trace completed
```

### Manual Instrumentation

```typescript
import { getObservabilityContext, runWithObservabilityContext } from '@/lib/observability/context';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';

// Run code with observability context
runWithObservabilityContext(
  {
    correlationId: '...',
    traceId: '...',
    auditId: '...',
    service: 'audit-worker',
  },
  () => {
    // All logs here include trace context
    logger.info('Processing audit...');
  }
);

// Record immutable audit trail
await recordAuditTrailEvent({
  eventType: 'audit.started',
  auditId: '...',
  targetUrl: 'https://client.com',
  modulesRun: ['seo', 'performance', 'accessibility'],
});
```

---

## Metrics Collection

### Technical Metrics

| Metric Name               | Type      | Labels                          | Description         |
| ------------------------- | --------- | ------------------------------- | ------------------- |
| `api_requests_total`      | Counter   | `route`, `method`, `statusCode` | Total API requests  |
| `api_request_duration_ms` | Histogram | `route`, `method`               | API latency         |
| `api_error_rate`          | Gauge     | `route`, `method`               | Error rate (0-1)    |
| `audit_runs_total`        | Counter   | `tenantId`                      | Audit executions    |
| `audit_failures_total`    | Counter   | `tenantId`, `reason`            | Audit failures      |
| `audit_duration_ms`       | Histogram | `tenantId`, `status`            | Audit latency       |
| `audit_cost_usd`          | Gauge     | `tenantId`                      | Cost per audit      |
| `llm_calls_total`         | Counter   | `model`, `node`                 | LLM invocations     |
| `llm_cost_total`          | Counter   | `model`                         | Cumulative LLM cost |
| `llm_latency_avg`         | Gauge     | `model`, `node`                 | LLM latency         |
| `queue_backlog`           | Gauge     | `queueName`                     | Queue depth         |
| `email_bounce_rate`       | Gauge     | `tenantId`                      | Email bounce rate   |

### Business Metrics

| Metric Name              | Type    | Labels               | Description         |
| ------------------------ | ------- | -------------------- | ------------------- |
| `proposals_total`        | Counter | `tenantId`, `status` | Proposals generated |
| `proposal_quality_score` | Gauge   | `tenantId`, `status` | QA score (0-100)    |
| `email_bounce_rate`      | Gauge   | `tenantId`           | Deliverability      |

### Recording Metrics

```typescript
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';

// Record API request
MetricsRecorder.requestCompleted('/api/audit', 'POST', 200, 1234);

// Record LLM call
MetricsRecorder.llmCall(
  2500, // latency ms
  0.05, // cost USD
  'gemini-2.0-flash',
  'diagnosis'
);

// Record audit lifecycle
MetricsRecorder.auditRun('tenant-123');
MetricsRecorder.auditCompleted('tenant-123', 'COMPLETE', 45000, 0.25);
```

---

## Alerting

### Alert Rules

Defined in `lib/observability/alerts.ts`:

| Rule Name                    | Metric                  | Threshold  | Condition | Description         |
| ---------------------------- | ----------------------- | ---------- | --------- | ------------------- |
| `api_error_rate_high`        | `api_error_rate`        | 0.01 (1%)  | gt        | API errors > 1%     |
| `audit_failure_rate_high`    | `audit_failure_rate`    | 0.05 (5%)  | gt        | Audit failures > 5% |
| `llm_daily_cost_too_high`    | `llm_cost_total`        | $50/day    | gt        | LLM spend > $50/day |
| `qa_hallucination_rate_high` | `qa_hallucination_rate` | 0.20 (20%) | gt        | Hallucination > 20% |
| `audit_failures_too_high`    | `audit_failures_total`  | 10/hour    | gt        | >10 failures/hour   |
| `queue_backlog_high`         | `queue_backlog`         | 100        | gt        | Queue backlog       |
| `email_bounce_rate_high`     | `email_bounce_rate`     | 0.05 (5%)  | gt        | Bounce rate > 5%    |

### Webhook Configuration

Set `ALERT_WEBHOOK_URL` to receive alert notifications:

```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Alert Payload:**

```json
{
  "alert": "api_error_rate_high",
  "description": "API error rate exceeded 1%",
  "metric": "api_error_rate",
  "threshold": 0.01,
  "observedValue": 0.025,
  "condition": "gt",
  "firedAt": "2026-03-27T17:00:00.000Z"
}
```

---

## Dashboard Configuration

### GCP Cloud Monitoring Dashboard

Import this JSON to create the ProposalOS dashboard:

```json
{
  "displayName": "ProposalOS Observability",
  "gridLayout": {
    "widgets": [
      {
        "title": "API Request Rate",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/api_requests_total\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "API Error Rate",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/api_error_rate\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Audit Throughput",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/audit_runs_total\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "LLM Token Usage",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/llm_calls_total\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "LLM Cost (USD)",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/llm_cost_total\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Proposal Quality Score",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/proposal_quality_score\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Queue Backlog",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/queue_backlog\""
                }
              }
            }
          ]
        }
      },
      {
        "title": "Email Bounce Rate",
        "xyChart": {
          "dataSets": [
            {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"custom.googleapis.com/proposal-os/email_bounce_rate\""
                }
              }
            }
          ]
        }
      }
    ]
  }
}
```

### Trace Dashboard (GCP Cloud Trace)

Navigate to **Cloud Trace > Trace Analysis** and create filters:

1. **Audit Latency**: `service="proposal-os" AND span.name="audit.*"`
2. **LLM Calls**: `service="proposal-os" AND span.name="*gemini*"`
3. **Database Queries**: `service="proposal-os" AND span.name="prisma.*"`

---

## Escalation Runbooks

### P0: API Error Rate > 1%

**Severity:** Critical  
**Response Time:** < 5 minutes

1. **Acknowledge** the alert in your incident management system
2. **Check** Cloud Trace for error patterns:
   - Filter: `service="proposal-os" AND status=ERROR`
   - Look for common error types
3. **Check** recent deployments:
   ```bash
   gcloud run services describe proposal-os --region=us-central1
   ```
4. **Check** database connectivity:
   ```bash
   kubectl logs -l app=proposal-os --tail=100 | grep -i "connection\|timeout"
   ```
5. **Rollback** if recent deployment:
   ```bash
   gcloud run services update-traffic proposal-os --to-revisions=PREVIOUS_REVISION=100
   ```
6. **Notify** the team in Slack #incidents

### P0: Audit Failure Rate > 5%

**Severity:** Critical  
**Response Time:** < 5 minutes

1. **Check** failed audit traces:
   - Filter: `service="proposal-os" AND audit.status=FAILED`
2. **Check** LLM provider status:
   - Visit https://status.googlecloud.com/
   - Check Vertex AI status
3. **Check** queue backlog:
   ```sql
   SELECT COUNT(*) FROM "PipelineErrorLog" WHERE created_at > NOW() - INTERVAL '1 hour';
   ```
4. **Check** circuit breaker state:
   ```sql
   SELECT * FROM "CircuitBreakerState" WHERE state != 'CLOSED';
   ```
5. **If LLM issue**: Enable fallback provider in `lib/llm/provider.ts`
6. **Notify** affected customers if widespread

### P1: LLM Cost > $50/day

**Severity:** High  
**Response Time:** < 30 minutes

1. **Check** cost breakdown:
   ```sql
   SELECT name, SUM(value) as total_cost
   FROM "Metric"
   WHERE name = 'llm_cost_total'
   AND timestamp > NOW() - INTERVAL '24 hours'
   GROUP BY labels->>'model';
   ```
2. **Check** for unusual patterns:
   - Spike in audit volume?
   - Infinite retry loop?
3. **Review** prompt performance:
   ```sql
   SELECT * FROM "PromptPerformanceLog"
   WHERE timestamp > NOW() - INTERVAL '24 hours'
   ORDER BY costUSD DESC LIMIT 10;
   ```
4. **Consider** rate limiting or quota adjustments

### P1: Email Bounce Rate > 5%

**Severity:** High  
**Response Time:** < 30 minutes

1. **Check** bounce reasons:
   ```sql
   SELECT metadata->>'bounceReason', COUNT(*)
   FROM "OutreachEmailEvent"
   WHERE type = 'BOUNCE'
   AND occurred_at > NOW() - INTERVAL '24 hours'
   GROUP BY metadata->>'bounceReason';
   ```
2. **Check** domain reputation:
   - Visit Google Postmaster Tools
   - Check sender reputation
3. **Pause** outreach if reputation damaged:
   ```sql
   UPDATE "PipelineConfig" SET pausedStages = '["outreach"]' WHERE tenantId = '...';
   ```
4. **Clean** email lists before resuming

---

## SLA Definitions

### API Availability SLA

**Target:** 99.9% uptime (43 minutes 50 seconds downtime allowed per month)

**Measurement:**

- Calculated from `/api/health` and `/healthz` endpoint availability
- Measured via external synthetic checks
- Excludes scheduled maintenance windows (announced 48 hours in advance)

**Current Baseline:** Track via Cloud Monitoring uptime checks

---

### Audit Completion SLA

**Target:**

- Single audit: < 30 seconds (p95)
- Batch of 10: < 5 minutes (p95)

**Measurement:**

- Tracked via `audit_duration_ms` metric
- Calculated from audit request received to proposal generation complete
- Includes: web crawl, module execution, Gemini diagnosis, proposal generation

**Current Baseline:** Track via MetricsRecorder data

---

### Proposal Delivery SLA

**Target:** < 5 seconds after audit completion

**Measurement:**

- Time from audit status = 'COMPLETE' to proposal accessible via `/api/proposal/[token]`
- Tracked via proposal generation timestamps
- Includes PDF generation and email notification

**Current Baseline:** Track via proposal generation logs

---

### Cold Outreach SLA

**Target:** Emails sent within 1 hour of trigger event

**Measurement:**

- Time from lead qualification (`pipelineStatus = 'QUALIFIED'`) to first outreach email
- Tracked via `OutreachEmailEvent` timestamps
- Excludes weekends and holidays (configurable per tenant)

**Current Baseline:** Track via outreach event logs

---

### Environment Variables

### Required for OpenTelemetry

```bash
# OpenTelemetry Configuration
OTEL_ENABLED=true                    # Enable/disable tracing
OTEL_SERVICE_NAME=proposal-os        # Service name in traces
OTEL_COLLECTOR_URL=otel-collector:4317  # OTLP gRPC endpoint
OTEL_EXPORTER_MODE=grpc              # grpc or http
OTEL_CONSOLE_EXPORT=false            # true for local dev

# GCP Integration (optional)
GCP_PROJECT_ID=your-gcp-project-id   # For Cloud Trace integration
```

### Required for Alerting

```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

### Local Development

For local development without external exporters:

```bash
OTEL_ENABLED=true
OTEL_CONSOLE_EXPORT=true
```

This will output traces to the console instead of sending to a collector.

---

## Troubleshooting

### Traces Not Appearing

1. Check if OpenTelemetry initialized:
   ```
   grep "OpenTelemetry SDK initialized" logs/
   ```
2. Verify collector connectivity:
   ```bash
   telnet $OTEL_COLLECTOR_URL 4317
   ```
3. Check service name matches dashboard filters

### Metrics Not Recording

1. Verify `MetricsRecorder` is being called
2. Check Prisma connectivity for metric writes
3. Review flush interval (default: 10 seconds)

### Alerts Not Firing

1. Verify `ALERT_WEBHOOK_URL` is set
2. Check webhook endpoint is reachable
3. Review alert rule thresholds in `lib/observability/alerts.ts`
