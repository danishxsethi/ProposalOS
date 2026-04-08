# Single Points of Failure (SPOF) Matrix

**Project:** ProposalOS  
**Created:** March 28, 2026  
**Owner:** Platform Engineering  
**Review Cadence:** Quarterly

---

## Overview

This document catalogs all identified single points of failure in the ProposalOS platform, their detection mechanisms, recovery procedures, user impact, and mitigation strategies.

---

## SPOF Summary

| #   | Component               | Severity | Status       | Mitigation                 |
| --- | ----------------------- | -------- | ------------ | -------------------------- |
| 1   | Cloud Run (us-central1) | P0       | ⚠️ Partial   | Multi-region pending       |
| 2   | Cloud SQL Primary       | P0       | ✅ Mitigated | HA replica configured      |
| 3   | Gemini API              | P0       | ✅ Mitigated | Fallback providers + cache |
| 4   | Lighthouse API          | P1       | ✅ Mitigated | Graceful degradation       |
| 5   | Resend Email            | P1       | ✅ Mitigated | Retry + queue              |
| 6   | Stripe Webhooks         | P1       | ✅ Mitigated | DLQ + retry service        |
| 7   | VPC Connector           | P0       | ✅ Mitigated | Auto-recovery              |
| 8   | Secret Manager          | P0       | ✅ Mitigated | Application caching        |
| 9   | GCS Buckets             | P1       | ✅ Mitigated | Multi-regional storage     |
| 10  | Cloud Load Balancer     | P0       | ✅ Mitigated | Google-managed HA          |

---

## Detailed SPOF Analysis

### 1. Cloud Run Service (Primary Region)

| Attribute       | Details                                                               |
| --------------- | --------------------------------------------------------------------- |
| **Component**   | Cloud Run API Service                                                 |
| **Location**    | `us-central1`                                                         |
| **Severity**    | P0 - Critical                                                         |
| **Detection**   | Health checks, Cloud Monitoring uptime checks, `api_error_rate` alert |
| **Recovery**    | Auto-restart (30s), rollback to previous revision                     |
| **User Impact** | Complete service outage (5-30 min during recovery)                    |
| **Mitigation**  | Multi-region deployment (PENDING), Cloud Load Balancing failover      |

**Runbook:** `docs/RUNBOOKS.md#runbook-5-cloud-run-crash`

**Current Gaps:**

- [ ] No secondary region deployment
- [ ] Manual failover required for regional outage

**Action Items:**

- [ ] Deploy to `us-east1` as secondary (Target: 90 days)
- [ ] Configure Cloud Load Balancing with health-based failover

---

### 2. Cloud SQL Primary Instance

| Attribute       | Details                                                               |
| --------------- | --------------------------------------------------------------------- |
| **Component**   | PostgreSQL on Cloud SQL                                               |
| **Location**    | `us-central1`                                                         |
| **Severity**    | P0 - Critical                                                         |
| **Detection**   | Connection errors, `database_connections_high` alert, health endpoint |
| **Recovery**    | PgBouncer connection pooling, GCP automatic failover to HA replica    |
| **User Impact** | All database operations blocked; audit pipeline halted                |
| **Mitigation**  | High Availability replica, PgBouncer connection pooling               |

**Runbook:** `docs/RUNBOOKS.md#runbook-11-database-connection-exhaustion`

**Configuration:**

```hcl
# terraform/cloud_sql.tf
high_availability {
  enabled              = true
  standby_node_prefix  = "${var.region}-b"
}
```

**Current Status:** ✅ HA enabled with standby in different zone

---

### 3. Gemini API (Vertex AI)

| Attribute       | Details                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| **Component**   | Google Gemini LLM API                                                           |
| **Location**    | External (Google Cloud)                                                         |
| **Severity**    | P0 - Critical                                                                   |
| **Detection**   | 429/5xx errors, `llm_latency_avg` spike, `audit_failure_rate` increase          |
| **Recovery**    | Circuit breaker opens, fallback to cached responses, switch to Anthropic/OpenAI |
| **User Impact** | Audit generation delayed; deterministic-only mode                               |
| **Mitigation**  | Multi-provider support, request caching, circuit breaker                        |

**Implementation:** `lib/llm/provider.ts`

**Fallback Chain:**

1. Primary: Gemini 2.0 Flash
2. Fallback 1: Cached response (stale allowed)
3. Fallback 2: Anthropic Claude
4. Fallback 3: OpenAI GPT

**Current Status:** ✅ Fully mitigated with graceful degradation

---

### 4. Lighthouse API (PageSpeed Insights)

| Attribute       | Details                                                   |
| --------------- | --------------------------------------------------------- |
| **Component**   | Google PageSpeed Insights API                             |
| **Location**    | External (Google)                                         |
| **Severity**    | P1 - High                                                 |
| **Detection**   | Timeout errors in `lib/modules/website.ts`                |
| **Recovery**    | Skip performance module, continue with other audit checks |
| **User Impact** | Missing performance scores in audit report                |
| **Mitigation**  | Graceful degradation, retry with backoff                  |

**Implementation:** `lib/modules/website.ts`

**Current Status:** ✅ Graceful degradation implemented

---

### 5. Resend Email Provider

| Attribute       | Details                                                     |
| --------------- | ----------------------------------------------------------- |
| **Component**   | Resend.com Email Service                                    |
| **Location**    | External (Resend)                                           |
| **Severity**    | P1 - High                                                   |
| **Detection**   | Bounce errors, API failures, `email_bounce_rate_high` alert |
| **Recovery**    | Queue for retry (3 attempts with exponential backoff)       |
| **User Impact** | Delayed email notifications; proposal delivery delayed      |
| **Mitigation**  | Retry wrapper, circuit breaker, DLQ for permanent failures  |

**Implementation:** `lib/outreach/emailSender.ts`, `lib/integrations/retryWrapper.ts`

**Retry Configuration:**

- Max retries: 3
- Base delay: 1000ms
- Max delay: 10000ms
- Jitter: 0.3

**Current Status:** ✅ Fully mitigated

---

### 6. Stripe Webhooks

| Attribute       | Details                                                  |
| --------------- | -------------------------------------------------------- |
| **Component**   | Stripe Payment Webhooks                                  |
| **Location**    | External (Stripe)                                        |
| **Severity**    | P1 - High                                                |
| **Detection**   | Signature verification failures, processing errors       |
| **Recovery**    | Store in `failed_webhook_events`, retry up to 5 times    |
| **User Impact** | Payment status not updating; subscription access delayed |
| **Mitigation**  | WebhookRetryService, idempotency keys, grace period      |

**Implementation:** `lib/stripe/webhookRetryService.ts`

**Current Status:** ✅ Mitigated (grace period PENDING)

**Pending:**

- [ ] Implement 7-day grace period for payment failures

---

### 7. Serverless VPC Connector

| Attribute       | Details                                            |
| --------------- | -------------------------------------------------- |
| **Component**   | VPC Access Connector                               |
| **Location**    | `us-central1`                                      |
| **Severity**    | P0 - Critical                                      |
| **Detection**   | Connection timeouts to Cloud SQL, Redis            |
| **Recovery**    | Auto-recovery by GCP, manual recreation if needed  |
| **User Impact** | Database and cache connectivity lost               |
| **Mitigation**  | Configured with min/max instances for auto-scaling |

**Configuration:**

```hcl
resource "google_vpc_access_connector" "cloud_run" {
  min_instances = 2
  max_instances = 10
}
```

**Current Status:** ✅ GCP-managed with redundancy

---

### 8. Secret Manager

| Attribute       | Details                                                              |
| --------------- | -------------------------------------------------------------------- |
| **Component**   | GCP Secret Manager                                                   |
| **Location**    | `us-central1`                                                        |
| **Severity**    | P0 - Critical                                                        |
| **Detection**   | Secret access failures on startup                                    |
| **Recovery**    | Application-level caching of secrets, environment variable fallbacks |
| **User Impact** | Service startup failure if secrets unavailable                       |
| **Mitigation**  | Secret caching, rotation scripts, environment backups                |

**Implementation:** `lib/config/security.ts`, `docs/SECRET_ROTATION.md`

**Current Status:** ✅ Mitigated with caching

---

### 9. GCS Buckets (Proposals & Exports)

| Attribute       | Details                                          |
| --------------- | ------------------------------------------------ |
| **Component**   | Google Cloud Storage                             |
| **Location**    | Multi-regional                                   |
| **Severity**    | P1 - High                                        |
| **Detection**   | Upload/download failures, 4xx/5xx errors         |
| **Recovery**    | Retry with backoff, CDN cache for reads          |
| **User Impact** | Proposal PDF generation/delivery delayed         |
| **Mitigation**  | Multi-regional bucket configuration, CDN caching |

**Current Status:** ✅ Multi-regional storage enabled

---

### 10. Cloud Load Balancer

| Attribute       | Details                               |
| --------------- | ------------------------------------- |
| **Component**   | Google Cloud Load Balancing           |
| **Location**    | Global                                |
| **Severity**    | P0 - Critical                         |
| **Detection**   | Health check failures, 502/503 errors |
| **Recovery**    | Google-managed automatic failover     |
| **User Impact** | Complete service outage if LB fails   |
| **Mitigation**  | Google-managed global HA service      |

**Current Status:** ✅ Google-managed HA (99.99% SLA)

---

## Mitigation Status Summary

| Status                 | Count | Components                                                           |
| ---------------------- | ----- | -------------------------------------------------------------------- |
| ✅ Fully Mitigated     | 7     | Cloud SQL, Gemini, Lighthouse, Resend, Stripe, VPC, GCS, Secrets, LB |
| ⚠️ Partially Mitigated | 1     | Cloud Run (multi-region pending)                                     |
| ❌ Not Mitigated       | 0     | -                                                                    |

---

## Risk Assessment Matrix

| Component                 | Likelihood | Impact   | Risk Score | Priority |
| ------------------------- | ---------- | -------- | ---------- | -------- |
| Cloud Run Regional Outage | Low        | Critical | Medium     | P2       |
| Cloud SQL Failover        | Very Low   | Critical | Low        | P1       |
| Gemini API Outage         | Medium     | High     | Medium     | P1       |
| Lighthouse API Outage     | Medium     | Medium   | Low        | P2       |
| Email Provider Outage     | Low        | Medium   | Low        | P2       |
| Stripe Webhook Failure    | Low        | Medium   | Low        | P2       |

**Risk Score Calculation:** Likelihood × Impact

- Likelihood: Very Low (1), Low (2), Medium (3), High (4)
- Impact: Low (1), Medium (2), High (3), Critical (4)

---

## Review History

| Date       | Reviewer  | Changes          | Status      |
| ---------- | --------- | ---------------- | ----------- |
| 2026-03-28 | SRE Audit | Initial creation | ✅ Complete |

---

## Next Review Date

**Scheduled:** June 28, 2026 (Quarterly)

**Reminders:**

- [ ] Verify multi-region deployment status
- [ ] Update risk scores based on incident history
- [ ] Review new components added in last quarter
