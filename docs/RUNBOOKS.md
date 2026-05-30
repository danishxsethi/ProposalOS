# Incident Response Runbooks

**Project:** ProposalOS  
**Last Updated:** March 27, 2026  
**Owner:** Platform Engineering

This document contains incident response runbooks for the top 11 incident types. Each runbook includes symptoms, troubleshooting steps, and resolution procedures.

---

## Table of Contents

1. [API Error Rate > 1%](#runbook-1-api-error-rate--1)
2. [Audit Failure Rate > 5%](#runbook-2-audit-failure-rate--5)
3. [LLM Cost > $50/day](#runbook-3-llm-cost--50day)
4. [Email Bounce Rate > 5%](#runbook-4-email-bounce-rate--5)
5. [Cloud Run Crash](#runbook-5-cloud-run-crash)
6. [Gemini API Outage](#runbook-6-gemini-api-outage)
7. [Batch Queue Backup](#runbook-7-batch-queue-backup)
8. [Stripe Webhook Failure](#runbook-8-stripe-webhook-failure)
9. [Cold Outreach Bounce Spike](#runbook-9-cold-outreach-bounce-spike)
10. [Widget Embed Failure](#runbook-10-widget-embed-failure)
11. [Database Connection Exhaustion](#runbook-11-database-connection-exhaustion)

---

## Runbook 1: API Error Rate > 1%

**Severity:** P0  
**Response Time:** < 5 minutes  
**Alert:** `api_error_rate_high`

### Symptoms

- Increased 5xx errors in API responses
- Cloud Trace showing error patterns
- User complaints about failed audits

### Troubleshooting Steps

1. **Acknowledge** the alert in your incident management system

2. **Check** Cloud Trace for error patterns:

   ```bash
   # Filter for errors in the last 15 minutes
   gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=50
   ```

3. **Check** recent deployments:

   ```bash
   gcloud run services describe proposal-os --region=us-central1
   gcloud run revisions list --service=proposal-os --region=us-central1 --sort-by=~createTime
   ```

4. **Check** database connectivity:

   ```bash
   curl https://your-domain.com/api/health | jq .
   ```

5. **Rollback** if recent deployment caused issues:

   ```bash
   gcloud run services update-traffic proposal-os \
     --to-revisions=PREVIOUS_REVISION=100 \
     --region=us-central1
   ```

6. **Notify** the team in Slack #incidents

### Resolution

- If database issue: Check PgBouncer and connection pool
- If deployment issue: Rollback and investigate
- If external dependency: Enable fallback or circuit breaker

---

## Runbook 2: Audit Failure Rate > 5%

**Severity:** P0  
**Response Time:** < 5 minutes  
**Alert:** `audit_pipeline_broken`

### Symptoms

- Multiple audit jobs failing
- Increased DLQ depth
- Proposal generation blocked

### Troubleshooting Steps

1. **Check** failed audit traces:

   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND textPayload:*audit*FAILED*" --limit=50
   ```

2. **Check** LLM provider status:
   - Visit https://status.cloud.google.com/
   - Check Vertex AI status

3. **Check** queue backlog:

   ```sql
   SELECT COUNT(*) FROM "PipelineErrorLog"
   WHERE created_at > NOW() - INTERVAL '1 hour';
   ```

4. **Check** circuit breaker state:

   ```sql
   SELECT * FROM "CircuitBreakerState" WHERE state != 'CLOSED';
   ```

5. **If LLM issue**: Enable fallback provider in `lib/llm/provider.ts`

6. **Notify** affected customers if widespread

### Resolution

- If Gemini issue: Switch to Anthropic or OpenAI fallback
- If queue issue: Scale workers or clear stuck jobs
- If circuit breaker open: Investigate root cause before resetting

---

## Runbook 3: LLM Cost > $50/day

**Severity:** P1  
**Response Time:** < 15 minutes  
**Alert:** `llm_daily_cost_too_high`

### Symptoms

- Daily LLM spend exceeded threshold
- Unusual spike in token usage
- Cost anomaly detected

### Troubleshooting Steps

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
   - Large prompt sizes?

3. **Review** prompt performance:

   ```sql
   SELECT * FROM "PromptPerformanceLog"
   WHERE timestamp > NOW() - INTERVAL '24 hours'
   ORDER BY costUSD DESC LIMIT 10;
   ```

4. **Check** audit volume:
   ```sql
   SELECT COUNT(*) FROM "Audit"
   WHERE createdAt > NOW() - INTERVAL '24 hours';
   ```

### Resolution

- If volume spike: Verify it's legitimate traffic
- If prompt inefficiency: Optimize prompts
- If runaway process: Kill the process and investigate

---

## Runbook 4: Email Bounce Rate > 5%

**Severity:** P1  
**Response Time:** < 15 minutes  
**Alert:** `email_bounce_rate_high`

### Symptoms

- Increased email bounces
- Domain reputation warnings
- Spam complaints

### Troubleshooting Steps

1. **Check** bounce reasons:

   ```sql
   SELECT metadata->>'bounceReason', COUNT(*) as count
   FROM "OutreachEmailEvent"
   WHERE type = 'BOUNCE'
   AND occurred_at > NOW() - INTERVAL '24 hours'
   GROUP BY metadata->>'bounceReason';
   ```

2. **Check** domain reputation:
   - Visit Google Postmaster Tools
   - Check sender reputation score

3. **Pause** outreach if reputation damaged:

   ```sql
   UPDATE "PipelineConfig"
   SET "pausedStages" = '["outreach"]'
   WHERE "tenantId" = 'affected-tenant-id';
   ```

4. **Clean** email lists:
   ```sql
   UPDATE "ProspectLead"
   SET "doNotContact" = true, "doNotContactReason" = 'hard_bounce'
   WHERE id IN (
     SELECT "leadId" FROM "OutreachEmailEvent"
     WHERE type = 'BOUNCE' AND metadata->>'bounceType' = 'hard'
   );
   ```

### Resolution

- If hard bounces: Clean email lists
- If reputation damaged: Pause and warm up domain
- If spam complaints: Review email content

---

## Runbook 5: Cloud Run Crash

**Severity:** P0  
**Response Time:** < 5 minutes  
**Alert:** `service_down`

### Symptoms

- Health checks returning 503
- Cloud Run revision showing "CrashLoopBackOff"
- Increased error rate in Cloud Logging

### Troubleshooting Steps

1. **Check** Cloud Run revision status:

   ```bash
   gcloud run services describe proposal-os --region=us-central1
   ```

2. **Review** recent revisions:

   ```bash
   gcloud run revisions list --service=proposal-os --region=us-central1 --sort-by=~createTime
   ```

3. **Check** logs for crash reason:

   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=proposal-os" \
     --limit=50 --format="table(timestamp,textPayload)"
   ```

4. **Common crash causes:**
   - OOMKilled: Increase memory limit
   - Startup probe failure: Check health endpoint
   - Dependency failure: Check database connectivity

5. **Rollback** if needed:
   ```bash
   gcloud run services update-traffic proposal-os \
     --to-revisions=PREVIOUS_REVISION=100 \
     --region=us-central1
   ```

### Resolution

- If OOM: Increase memory from 512Mi to 1Gi
- If probe failure: Fix health endpoint
- If dependency: Check database and external services

---

## Runbook 6: Gemini API Outage

**Severity:** P0  
**Response Time:** < 5 minutes  
**Alert:** `gemini_api_key_expired`

### Symptoms

- Audit failures with LLM timeout errors
- `llm_latency_avg` spike
- `audit_failure_rate` increase

### Troubleshooting Steps

1. **Check** Gemini API status:
   - Visit https://status.cloud.google.com/
   - Check Vertex AI service status

2. **Review** error patterns:

   ```sql
   SELECT metadata->>'errorType', COUNT(*)
   FROM "PipelineErrorLog"
   WHERE stage = 'DIAGNOSIS'
   AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY metadata->>'errorType';
   ```

3. **Enable** fallback provider:

   ```typescript
   // In lib/llm/provider.ts, set fallback to Anthropic or OpenAI
   ```

4. **Check** rate limits:

   ```sql
   SELECT * FROM "LLMUsageLog"
   WHERE provider = 'gemini'
   AND timestamp > NOW() - INTERVAL '1 hour'
   ORDER BY timestamp DESC
   LIMIT 10;
   ```

5. **If quota exhausted:**
   - Request quota increase via GCP Console
   - Enable request queuing with backpressure

### Resolution

- If API down: Use fallback provider
- If quota exceeded: Request increase or throttle requests
- If key expired: Rotate API key

---

## Runbook 7: Batch Queue Backup

**Severity:** P1  
**Response Time:** < 15 minutes  
**Alert:** `queue_backlog_high`

### Symptoms

- `queue_backlog` metric > 100
- Increased audit latency
- DLQ depth increasing

### Troubleshooting Steps

1. **Check** queue depth:

   ```sql
   SELECT "pipelineStatus", COUNT(*) as count
   FROM "ProspectLead"
   WHERE "pipelineStatus" IN ('discovered', 'audited', 'QUALIFIED')
   GROUP BY "pipelineStatus";
   ```

2. **Check** for stuck jobs:

   ```sql
   SELECT id, "pipelineStatus", "updatedAt"
   FROM "ProspectLead"
   WHERE "pipelineStatus" = 'RUNNING'
   AND "updatedAt" < NOW() - INTERVAL '30 minutes'
   ORDER BY "updatedAt" ASC;
   ```

3. **Check** worker health:

   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND textPayload:*worker*" --limit=50
   ```

4. **Clear** stuck jobs:

   ```sql
   UPDATE "ProspectLead"
   SET "pipelineStatus" = 'discovered', "error" = NULL
   WHERE "pipelineStatus" = 'RUNNING'
   AND "updatedAt" < NOW() - INTERVAL '1 hour';
   ```

5. **Scale** workers if needed:
   ```bash
   gcloud run services update proposal-os-worker \
     --min-instances=2 --region=us-central1
   ```

### Resolution

- If stuck jobs: Clear and retry
- If worker issue: Scale up instances
- If DLQ full: Process dead letters

---

## Runbook 8: Stripe Webhook Failure

**Severity:** P1  
**Response Time:** < 15 minutes  
**Alert:** (Manual detection via Stripe dashboard)

### Symptoms

- Payment status not updating
- Stripe webhook delivery failures
- Customer complaints about access

### Troubleshooting Steps

1. **Check** Stripe webhook delivery:
   - Visit Stripe Dashboard > Developers > Webhooks
   - Review failed delivery attempts

2. **Check** webhook endpoint logs:

   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND textPayload:*stripe*webhook*" --limit=50
   ```

3. **Verify** webhook secret:

   ```bash
   # Check if STRIPE_WEBHOOK_SECRET is set correctly
   echo $STRIPE_WEBHOOK_SECRET
   ```

4. **Test** webhook endpoint:

   ```bash
   curl -X POST https://your-domain.com/api/stripe/webhook \
     -H "Content-Type: application/json" \
     -H "Stripe-Signature: test" \
     -d '{"type": "payment_intent.succeeded"}'
   ```

5. **Retry** failed webhooks:
   - Use Stripe CLI to replay events:
   ```bash
   stripe events resend evt_xxxxx
   ```

### Resolution

- If secret mismatch: Update webhook secret
- If endpoint down: Fix service and replay events
- If signature invalid: Check clock skew

---

## Runbook 9: Cold Outreach Bounce Spike

**Severity:** P1  
**Response Time:** < 15 minutes  
**Alert:** (Related to `email_bounce_rate_high`)

### Symptoms

- Sudden increase in bounce rate
- Domain reputation warnings
- Increased spam complaints

### Troubleshooting Steps

1. **Check** bounce reasons:

   ```sql
   SELECT metadata->>'bounceReason', COUNT(*) as count
   FROM "OutreachEmailEvent"
   WHERE type = 'BOUNCE'
   AND occurred_at > NOW() - INTERVAL '24 hours'
   GROUP BY metadata->>'bounceReason';
   ```

2. **Check** domain reputation:
   - Visit Google Postmaster Tools
   - Check sender reputation score

3. **Pause** outreach if reputation damaged:

   ```sql
   UPDATE "PipelineConfig"
   SET "pausedStages" = '["outreach"]'
   WHERE "tenantId" = 'affected-tenant-id';
   ```

4. **Clean** email lists:

   ```sql
   -- Mark invalid emails as do-not-contact
   UPDATE "ProspectLead"
   SET "doNotContact" = true, "doNotContactReason" = 'hard_bounce'
   WHERE id IN (
     SELECT "leadId" FROM "OutreachEmailEvent"
     WHERE type = 'BOUNCE' AND metadata->>'bounceType' = 'hard'
   );
   ```

5. **Warm up** domain before resuming:
   - Start with 10 emails/day
   - Gradually increase over 2 weeks

### Resolution

- If bad list: Clean and verify emails
- If reputation damaged: Pause and warm up
- If content issue: Review email templates

---

## Runbook 10: Widget Embed Failure

**Severity:** P1  
**Response Time:** < 15 minutes  
**Alert:** (Manual detection via customer reports)

### Symptoms

- Widget not loading on client sites
- CORS errors in browser console
- 404 on widget.js

### Troubleshooting Steps

1. **Check** widget.js availability:

   ```bash
   curl -I https://your-domain.com/widget.js
   ```

2. **Check** CDN/cache status:
   - Verify Cloudflare or GCP CDN cache
   - Purge cache if stale

3. **Check** CORS headers:

   ```bash
   curl -I -X OPTIONS https://your-domain.com/widget.js \
     -H "Origin: https://client-site.com" \
     -H "Access-Control-Request-Method: GET"
   ```

4. **Review** widget error logs:

   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND textPayload:*widget*" --limit=50
   ```

5. **Check** client integration:
   - Verify script tag is correct
   - Check for ad-blocker interference

### Resolution

- If 404: Restore widget.js file
- If CORS: Add proper headers
- If cache: Purge CDN cache

---

## Runbook 11: Database Connection Exhaustion

**Severity:** P0  
**Response Time:** < 5 minutes  
**Alert:** `database_connections_high`

### Symptoms

- Query timeouts
- "too many connections" errors
- Increased latency on database operations

### Troubleshooting Steps

1. **Check** connection count:

   ```sql
   SELECT count(*) as current_connections
   FROM pg_stat_activity;
   ```

2. **Check** connection limit:

   ```sql
   SHOW max_connections;
   ```

3. **Identify** connection-heavy queries:

   ```sql
   SELECT pid, usename, application_name, state, query_start, query
   FROM pg_stat_activity
   WHERE state = 'active'
   ORDER BY query_start ASC;
   ```

4. **Kill** idle connections:

   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND query_start < NOW() - INTERVAL '10 minutes';
   ```

5. **Enable** connection pooling (PgBouncer):

   ```bash
   # Check PgBouncer status
   docker-compose ps pgbouncer
   ```

6. **Scale** database if needed:
   ```bash
   gcloud sql instances patch proposal-os-db \
     --database-flags=max_connections=500
   ```

### Resolution

- If idle connections: Kill and investigate leak
- If pool exhausted: Scale PgBouncer
- If limit reached: Increase max_connections

---

## Post-Incident Procedures

After resolving any incident:

1. **Document** the incident in the incident log
2. **Conduct** a blameless post-mortem for P0 incidents
3. **Update** runbooks with new learnings
4. **Implement** preventive measures
5. **Notify** stakeholders of resolution

---

## Escalation Matrix

| Severity | Response Time | Escalation Path                  |
| -------- | ------------- | -------------------------------- |
| P0       | < 5 min       | On-call → Engineering Lead → CTO |
| P1       | < 15 min      | On-call → Engineering Lead       |
| P2       | Daily digest  | On-call (next business day)      |

---

## Contact Information

- **On-call Slack:** #incidents
- **Engineering Lead:** @eng-lead
- **CTO:** @cto
- **Status Page:** https://status.proposal-os.com
