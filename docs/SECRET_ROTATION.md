# Secret Rotation Policy & Procedures

**Document Version:** 1.0  
**Last Updated:** 2026-03-21  
**Owner:** Security Team  
**Classification:** Internal Use Only

---

## 1. Policy Overview

### 1.1 Purpose

This document defines the mandatory secret rotation schedule and procedures for ProposalOS. Regular rotation of credentials minimizes the impact of undetected compromises and maintains compliance with security best practices.

### 1.2 Scope

This policy applies to ALL secrets used by ProposalOS, including:

- Database credentials
- API keys (Google, Stripe, Resend, SerpAPI, etc.)
- Authentication secrets (NextAuth, API keys, admin secrets)
- Cloud infrastructure credentials (GCP service accounts)
- Third-party service tokens

### 1.3 Rotation Schedule

| Secret Type                | Rotation Frequency | Priority | Owner          |
| -------------------------- | ------------------ | -------- | -------------- |
| **Database Credentials**   | 90 days            | P0       | DevOps         |
| **API Keys (External)**    | 90 days            | P0       | DevOps         |
| **Stripe Keys**            | 90 days            | P0       | Finance/DevOps |
| **Authentication Secrets** | 90 days            | P0       | Security       |
| **GCP Service Accounts**   | 90 days            | P0       | DevOps         |
| **Webhook Secrets**        | 90 days            | P1       | DevOps         |
| **Cron Secrets**           | 90 days            | P1       | DevOps         |
| **Email Service Keys**     | 90 days            | P1       | DevOps         |

---

## 2. Pre-Rotation Checklist

Before rotating any secret:

- [ ] Notify affected teams (engineering, ops)
- [ ] Schedule maintenance window if required
- [ ] Prepare rollback plan
- [ ] Test new credentials in staging environment
- [ ] Document current secret expiration date
- [ ] Verify backup systems are current

---

## 3. Rotation Procedures

### 3.1 Database Credentials (PostgreSQL/Cloud SQL)

```bash
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update Cloud SQL user password
gcloud sql users set-password postgres \
  --instance=proposal-487522:us-central1:proposal-db \
  --password="$NEW_PASSWORD"

# 3. Update Secret Manager
echo -n "postgresql://postgres:$NEW_PASSWORD@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE" | \
  gcloud secrets versions add DATABASE_URL --data-file=-

# 4. Redeploy Cloud Run to pick up new secret
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=DATABASE_URL=DATABASE_URL:latest

# 5. Verify deployment
gcloud run services describe proposal-engine --region=us-central1

# 6. Test database connectivity
curl -H "Authorization: Bearer $API_KEY" https://YOUR_APP_URL/api/health
```

### 3.2 Google API Keys (PageSpeed, Places, Gemini)

```bash
# 1. Generate new API key in Google Cloud Console:
#    https://console.cloud.google.com/apis/credentials

# 2. Apply restrictions (API restrictions, HTTP referrers)

# 3. Update Secret Manager
echo -n "NEW_API_KEY" | gcloud secrets versions add GOOGLE_PAGESPEED_API_KEY --data-file=-
echo -n "NEW_API_KEY" | gcloud secrets versions add GOOGLE_PLACES_API_KEY --data-file=-
echo -n "NEW_API_KEY" | gcloud secrets versions add GOOGLE_AI_API_KEY --data-file=-

# 4. Redeploy Cloud Run
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=GOOGLE_PAGESPEED_API_KEY=GOOGLE_PAGESPEED_API_KEY:latest,\
GOOGLE_PLACES_API_KEY=GOOGLE_PLACES_API_KEY:latest,\
GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest

# 5. Test audit generation
curl -X POST https://YOUR_APP_URL/api/audit \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### 3.3 Stripe API Keys

```bash
# 1. Generate new keys in Stripe Dashboard:
#    https://dashboard.stripe.com/apikeys

# 2. Update Secret Manager
echo -n "sk_live_NEW_SECRET_KEY" | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-

# 3. Update webhook endpoint in Stripe Dashboard with new signing secret
echo -n "whsec_NEW_WEBHOOK_SECRET" | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=-

# 4. Redeploy Cloud Run
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,\
STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest

# 5. Test webhook endpoint
curl -X POST https://YOUR_APP_URL/api/stripe/webhook \
  -H "Stripe-Signature: test_signature" \
  -d '{"type": "checkout.session.completed"}'
```

### 3.4 NextAuth Secret

```bash
# 1. Generate new secret (32+ characters)
NEW_SECRET=$(openssl rand -base64 32)

# 2. Update Secret Manager
echo -n "$NEW_SECRET" | gcloud secrets versions add NEXTAUTH_SECRET --data-file=-

# 3. Redeploy Cloud Run
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest

# 4. Note: All existing sessions will be invalidated
#    Users will need to re-authenticate
```

### 3.5 API Key (Application)

```bash
# 1. Generate new API key
NEW_API_KEY=$(openssl rand -hex 32)
echo "New API Key: $NEW_API_KEY"

# 2. Update Secret Manager
echo -n "$NEW_API_KEY" | gcloud secrets versions add API_KEY --data-file=-

# 3. Redeploy Cloud Run
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=API_KEY=API_KEY:latest

# 4. Update all API consumers with new key
# 5. Revoke old API key after confirmation
```

### 3.6 Resend API Key

```bash
# 1. Generate new key in Resend Dashboard:
#    https://resend.com/api-keys

# 2. Update Secret Manager
echo -n "re_NEW_API_KEY" | gcloud secrets versions add RESEND_API_KEY --data-file=-

# 3. Redeploy Cloud Run
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=RESEND_API_KEY=RESEND_API_KEY:latest

# 4. Test email sending
curl -X POST https://YOUR_APP_URL/api/test-email \
  -H "Authorization: Bearer $API_KEY"
```

### 3.7 SerpAPI Key

```bash
# 1. Generate new key in SerpAPI Dashboard:
#    https://serpapi.com/manage-api-key

# 2. Update Secret Manager
echo -n "NEW_SERPAPI_KEY" | gcloud secrets versions add SERP_API_KEY --data-file=-

# 3. Redeploy Cloud Run
gcloud run services update proposal-engine \
  --region=us-central1 \
  --update-secrets=SERP_API_KEY=SERP_API_KEY:latest

# 4. Test competitor module
curl -X POST https://YOUR_APP_URL/api/audit \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

## 4. Post-Rotation Verification

After rotating any secret:

### 4.1 Immediate Verification

```bash
# Check deployment status
gcloud run services describe proposal-engine --region=us-central1

# Check logs for errors
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=proposal-engine" \
  --limit=50 --format="table(timestamp,textPayload)"
```

### 4.2 Functional Tests

| Test                | Endpoint                   | Expected Result |
| ------------------- | -------------------------- | --------------- |
| Health Check        | `GET /api/health`          | 200 OK          |
| Database            | `GET /api/health`          | DB connected    |
| Audit Generation    | `POST /api/audit`          | 202 Accepted    |
| Email (if rotated)  | `POST /api/test-email`     | 200 OK          |
| Stripe (if rotated) | `POST /api/stripe/webhook` | 200 OK          |

### 4.3 Monitoring

Monitor for 24 hours post-rotation:

- Error rate in Cloud Logging
- Failed audit generations
- Email delivery failures
- Payment processing errors

---

## 5. Emergency Rotation

### 5.1 When to Perform Emergency Rotation

- Confirmed credential leak
- Suspected unauthorized access
- Employee departure with credential access
- Third-party service breach notification

### 5.2 Emergency Procedure

1. **IMMEDIATELY** rotate the compromised credential using steps above
2. **REVOKE** the old credential at the source (Google Cloud, Stripe, etc.)
3. **AUDIT** access logs for unauthorized usage
4. **NOTIFY** security team and affected stakeholders
5. **DOCUMENT** the incident in the security log

---

## 6. Automation

### 6.1 Rotation Reminder Script

Create a cron job to check rotation compliance:

```bash
#!/bin/bash
# scripts/check-rotation-compliance.sh

THRESHOLD_DAYS=90

# Check Secret Manager for old versions
for SECRET in DATABASE_URL API_KEY NEXTAUTH_SECRET STRIPE_SECRET_KEY; do
  CREATE_TIME=$(gcloud secrets versions describe latest --secret=$SECRET --format="value(createTime)")
  DAYS_OLD=$(( ($(date +%s) - $(date -d "$CREATE_TIME" +%s)) / 86400 ))

  if [ $DAYS_OLD -gt $THRESHOLD_DAYS ]; then
    echo "⚠️  WARNING: $SECRET is $DAYS_OLD days old (threshold: $THRESHOLD_DAYS)"
  fi
done
```

### 6.2 Calendar Reminders

Set recurring calendar events:

- **Day 75:** Rotation reminder email
- **Day 85:** Escalation to team lead
- **Day 90:** Critical alert, rotation required

---

## 7. Audit Trail

All rotations must be documented:

| Date       | Secret Type | Rotated By | Reason           | Verified By |
| ---------- | ----------- | ---------- | ---------------- | ----------- |
| YYYY-MM-DD | Database    | @username  | Scheduled 90-day | @username   |
| YYYY-MM-DD | Stripe      | @username  | Scheduled 90-day | @username   |

---

## 8. Compliance

### 8.1 Metrics

- **Target:** 100% of secrets rotated within 90 days
- **Measurement:** Weekly audit of Secret Manager version timestamps
- **Reporting:** Monthly security report to leadership

### 8.2 Exceptions

Exceptions to the 90-day rotation policy must be:

1. Documented in writing
2. Approved by Security Team
3. Include compensating controls
4. Reviewed quarterly

---

## 9. Related Documents

- [GCP Secret Manager Setup](./gcp-secret-manager.md)
- [Incident Response Plan](./incident-response.md)
- [Access Control Policy](./access-control.md)
- [Cloud Run Deployment Guide](./cloud-run-deploy.md)

---

## 10. Quick Reference

### Secret Manager Commands

```bash
# List all secrets
gcloud secrets list

# View secret versions
gcloud secrets versions list --secret=SECRET_NAME

# Add new version
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-

# Destroy old versions (keep last 3)
gcloud secrets versions list --secret=SECRET_NAME --format="value(name)" | \
  tail -n +4 | xargs -I {} gcloud secrets versions destroy {} --secret=SECRET_NAME
```

### Redeploy Cloud Run

```bash
gcloud run services update proposal-engine --region=us-central1 \
  --update-secrets=SECRET1=SECRET1:latest,SECRET2=SECRET2:latest
```
