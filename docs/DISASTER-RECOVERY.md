# Disaster Recovery Runbook

**Project:** ProposalOS  
**Created:** March 28, 2026  
**Owner:** Platform Engineering  
**Review Cadence:** Quarterly

---

## Quick Reference

| Metric                             | Target         | Current Status              |
| ---------------------------------- | -------------- | --------------------------- |
| **RTO (Recovery Time Objective)**  | < 4 hours      | ~1-2 hours (estimated)      |
| **RPO (Recovery Point Objective)** | < 1 hour       | < 15 minutes (PITR enabled) |
| **Last DR Drill**                  | Within 90 days | ⏳ Pending execution        |
| **Backup Retention**               | 7 days minimum | ✅ Configured               |

---

## Emergency Contacts

| Role             | Contact              | Escalation Time         |
| ---------------- | -------------------- | ----------------------- |
| On-call Engineer | oncall@company.com   | Immediate               |
| Database Admin   | dba@company.com      | After 30 min            |
| Platform Lead    | platform@company.com | After 1 hour            |
| CTO              | cto@company.com      | After 2 hours (P0 only) |

---

## Incident Severity Levels

| Severity | Description                        | Response Time     | Escalation          |
| -------- | ---------------------------------- | ----------------- | ------------------- |
| **P0**   | Complete service outage, data loss | < 5 min           | Immediate all-hands |
| **P1**   | Critical feature impaired          | < 15 min          | On-call + Lead      |
| **P2**   | Non-critical feature impaired      | < 1 hour          | On-call             |
| **P3**   | Minor inconvenience                | Next business day | On-call             |

---

## Disaster Scenarios

### Scenario 1: Complete Cloud SQL Instance Failure

**Trigger:** Cloud SQL instance unavailable, all database operations failing

**Detection:**

- Health endpoint returning 503
- `database_connections_high` alert
- Application logs showing connection timeouts

**Recovery Steps:**

1. **Assess the situation (2 minutes)**

   ```bash
   # Check instance status
   gcloud sql instances describe proposalos-instance --region=us-central1

   # Check recent backups
   gcloud sql backups list --instance proposalos-instance --limit 5
   ```

2. **Declare disaster (if instance unrecoverable)**
   - Notify team in #incidents Slack channel
   - Start incident timer

3. **Create restore instance from latest backup (15-30 minutes)**

   ```bash
   # Get latest successful backup ID
   BACKUP_ID=$(gcloud sql backups list --instance proposalos-instance \
     --format="value(id)" --filter="status=SUCCESSFUL" --limit 1)

   # Create new instance from backup
   gcloud sql instances clone proposalos-instance proposalos-restored-$(date +%Y%m%d-%H%M%S) \
     --backup-id $BACKUP_ID --region=us-central1
   ```

4. **Update connection strings (5 minutes)**

   ```bash
   # Get new instance IP
   NEW_IP=$(gcloud sql instances describe proposalos-restored-* \
     --format="value(ipAddresses.ipAddress)" --region=us-central1)

   # Update Secret Manager with new connection string
   gcloud secrets versions add DATABASE_URL \
     --data-file=new-connection-string.txt
   ```

5. **Restart Cloud Run services (2 minutes)**

   ```bash
   gcloud run services update proposal-os --region=us-central1 \
     --update-secrets=DATABASE_URL=DATABASE_URL:latest
   ```

6. **Verify recovery (5 minutes)**

   ```bash
   # Health check
   curl https://your-domain.com/api/health | jq .

   # Verify data integrity
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Audit\";"
   ```

**Total Estimated Time:** 30-45 minutes

---

### Scenario 2: Cloud Run Regional Outage

**Trigger:** All Cloud Run services in us-central1 unavailable

**Detection:**

- Cloud Monitoring uptime check failures
- Health endpoint returning 503
- `service_down` alert

**Recovery Steps:**

1. **Assess the situation (2 minutes)**

   ```bash
   # Check service status
   gcloud run services describe proposal-os --region=us-central1

   # Check recent revisions
   gcloud run revisions list --service=proposal-os --region=us-central1 --limit 5
   ```

2. **If regional outage confirmed, failover to secondary (PENDING implementation)**
   - Currently: Single region only
   - Future: Automatic failover via Cloud Load Balancing

3. **Workaround: Redeploy to available region**

   ```bash
   # Deploy to alternate region
   gcloud run deploy proposal-os-temp \
     --image gcr.io/$PROJECT_ID/proposal-os:latest \
     --region=us-east1 \
     --allow-unauthenticated
   ```

4. **Update DNS to temporary deployment**
   - Update Cloud DNS or Cloudflare records
   - TTL should be set to 60 seconds for quick failover

**Total Estimated Time:** 15-30 minutes

**Current Gap:** No secondary region configured. See `terraform/cloud_run_multi_region.tf` (TODO).

---

### Scenario 3: Gemini API Outage

**Trigger:** Gemini API returning 5xx errors or rate limiting

**Detection:**

- `llm_latency_avg` spike
- `audit_failure_rate` increase
- `gemini_api_key_expired` alert

**Recovery Steps:**

1. **Verify Gemini status (1 minute)**
   - Check https://status.cloud.google.com/
   - Review error patterns in Cloud Logging

2. **Circuit breaker should auto-open (automatic)**
   - Verify in admin dashboard: `/admin/circuit-breaker`
   - If not opened, manually reset:

   ```bash
   # Via admin API
   curl -X POST https://your-domain.com/api/admin/circuit-breaker/reset \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **System degrades gracefully (automatic)**
   - Deterministic-only audit mode active
   - LLM-dependent features paused
   - Users see degraded mode banner

4. **Optional: Switch to fallback provider**
   ```bash
   # Update LLM provider via environment
   gcloud run services update proposal-os \
     --update-env-vars=LLM_FALLBACK_PROVIDER=anthropic
   ```

**Total Estimated Time:** Immediate (automatic degradation)

---

### Scenario 4: Stripe Webhook Failure

**Trigger:** Stripe webhooks not being processed, payment status not updating

**Detection:**

- Stripe dashboard showing failed deliveries
- `stripe_webhook_failure` alert
- Customer reports of access issues

**Recovery Steps:**

1. **Check webhook endpoint status (2 minutes)**

   ```bash
   # Check recent webhook logs
   gcloud logging read "textPayload:*stripe*webhook*" --limit 20
   ```

2. **Verify webhook secret**

   ```bash
   # Check if secret is current
   gcloud secrets versions access latest --secret=STRIPE_WEBHOOK_SECRET
   ```

3. **Retry failed webhooks**

   ```bash
   # Use Stripe CLI to replay events
   stripe events resend evt_xxxxx
   ```

4. **Run manual retry service**
   ```bash
   # Trigger webhook retry cron
   curl https://your-domain.com/api/cron/retry-webhooks \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

**Total Estimated Time:** 10-15 minutes

---

### Scenario 5: Data Corruption/Accidental Deletion

**Trigger:** User or system error causing data loss

**Detection:**

- User reports missing data
- Audit logs showing unusual delete operations
- Data integrity check failures

**Recovery Steps:**

1. **Stop all write operations (immediate)**

   ```bash
   # Enable maintenance mode
   gcloud run services update proposal-os \
     --update-env-vars=MAINTENANCE_MODE=true
   ```

2. **Assess damage (5-10 minutes)**
   - Identify affected tables/timeframe
   - Check audit trail for root cause

3. **Point-in-time recovery**

   ```bash
   # Restore to specific point before corruption
   gcloud sql instances clone proposalos-instance proposalos-pitr-restore \
     --point-in-time 2024-03-15T14:30:00Z --region=us-central1
   ```

4. **Extract and merge unaffected data**
   - Export data from PITR clone
   - Merge with current instance where safe

5. **Resume operations**
   ```bash
   gcloud run services update proposal-os \
     --update-env-vars=MAINTENANCE_MODE=false
   ```

**Total Estimated Time:** 1-2 hours (depends on data volume)

---

## Post-Incident Procedures

### Immediate (Within 1 hour of resolution)

- [ ] Verify all services healthy
- [ ] Confirm data integrity
- [ ] Notify stakeholders of resolution
- [ ] Update status page

### Short-term (Within 24 hours)

- [ ] Conduct blameless post-mortem for P0/P1 incidents
- [ ] Document timeline of events
- [ ] Identify root cause
- [ ] Create action items for prevention

### Long-term (Within 1 week)

- [ ] Complete post-mortem document
- [ ] Implement preventive measures
- [ ] Update runbooks with lessons learned
- [ ] Schedule follow-up review

---

## DR Drill Schedule

### Monthly Restore Test

**When:** First Tuesday of each month

**Checklist:**

- [ ] Run `npx tsx scripts/test-restore.ts --backup-age 7`
- [ ] Verify restore completed within RTO (< 1 hour)
- [ ] Verify data integrity (tables, constraints, RLS policies)
- [ ] Document results in `docs/backup-restore.md`
- [ ] Clean up test instance

### Quarterly Full DR Test

**When:** First week of each quarter

**Checklist:**

- [ ] Simulate complete instance failure
- [ ] Execute full recovery procedure
- [ ] Test failover to secondary region (when implemented)
- [ ] Verify all critical functions work
- [ ] Test communication channels
- [ ] Document lessons learned
- [ ] Update runbooks

---

## Communication Templates

### Initial Incident Notification

```
🚨 INCIDENT ALERT 🚨

Severity: P0/P1/P2
Service: ProposalOS
Issue: [Brief description]
Impact: [What users are experiencing]
Started: [Time]
On-call: [Name]

Updates will be posted in this channel every 15 minutes.
Status page: https://status.proposal-os.com
```

### Resolution Notification

```
✅ INCIDENT RESOLVED ✅

Service: ProposalOS
Issue: [Brief description]
Duration: [X hours Y minutes]
Root cause: [Brief summary]
Resolution: [What was done]

Post-mortem will be shared within 48 hours.
```

---

## Appendix: Useful Commands

### Cloud SQL Operations

```bash
# List instances
gcloud sql instances list

# Describe instance
gcloud sql instances describe proposalos-instance

# List backups
gcloud sql backups list --instance proposalos-instance

# Create instance from backup
gcloud sql instances clone source-instance target-instance --backup-id BACKUP_ID

# Point-in-time restore
gcloud sql instances clone source-instance target-instance \
  --point-in-time 2024-03-15T14:30:00Z
```

### Cloud Run Operations

```bash
# List services
gcloud run services list

# Describe service
gcloud run services describe proposal-os --region=us-central1

# List revisions
gcloud run revisions list --service=proposal-os --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic proposal-os \
  --to-revisions=PREVIOUS_REVISION=100 --region=us-central1

# Update environment variables
gcloud run services update proposal-os \
  --update-env-vars=KEY=value --region=us-central1
```

### Logging Queries

```bash
# Recent errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=50 --format="table(timestamp,textPayload)"

# Database connection errors
gcloud logging read "textPayload:*database*connection*" --limit=50

# LLM errors
gcloud logging read "textPayload:*llm*error*" --limit=50
```

---

## Document History

| Date       | Version | Author    | Changes          |
| ---------- | ------- | --------- | ---------------- |
| 2026-03-28 | 1.0     | SRE Audit | Initial creation |

---

## Next Review Date

**Scheduled:** June 28, 2026 (Quarterly)

**Reminders:**

- [ ] Verify all contact information is current
- [ ] Test all recovery procedures
- [ ] Update commands for any tooling changes
- [ ] Review and update RTO/RPO based on actual metrics
