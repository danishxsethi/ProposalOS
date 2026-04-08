# Backup & Restore Procedures

## Overview

This document outlines the backup and restore procedures for the ProposalOS PostgreSQL database hosted on Cloud SQL. These procedures ensure data durability and business continuity with an RTO (Recovery Time Objective) of < 1 hour and RPO (Recovery Point Objective) of < 15 minutes.

## Cloud SQL Backup Configuration

### Automated Backups (Enabled by Default)

Cloud SQL automatically creates daily backups when automated backups are enabled.

**Configuration:**

| Setting                | Value            | Description                        |
| ---------------------- | ---------------- | ---------------------------------- |
| Backup window          | 02:00-06:00 UTC  | Daily backup window                |
| Retention period       | 7 days (default) | Configurable up to 365 days        |
| Point-in-time recovery | Enabled          | Continuous transaction log backups |

### Verify Backup Status

```bash
# Check backup configuration
gcloud sql instances describe proposalos-instance \
  --format="value(backupConfiguration)"

# List available backups
gcloud sql backups list --instance proposalos-instance
```

### Enable Automated Backups (if not already enabled)

```bash
gcloud sql instances patch proposalos-instance \
  --backup-start-time 02:00 \
  --retained-backups 7 \
  --transaction-log-retention-days 7
```

## Point-in-Time Recovery (PITR)

Cloud SQL maintains continuous transaction logs, allowing recovery to any point within the retention period.

### Restore to Specific Point in Time

```bash
# Restore to a specific timestamp
gcloud sql instances clone proposalos-instance proposalos-restore-20240315 \
  --point-in-time 2024-03-15T14:30:00Z
```

## Manual Backup Procedures

### Export Full Database

```bash
# Export to Cloud Storage
gcloud sql export sql proposalos-instance \
  gs://proposalos-backups/manual-backup-$(date +%Y%m%d-%H%M%S).sql.gz \
  --database=proposalos
```

### Export Schema Only

```bash
gcloud sql export sql proposalos-instance \
  gs://proposalos-backups/schema-$(date +%Y%m%d-%H%M%S).sql.gz \
  --database=proposalos \
  --skip-extended-insert
```

## Restore Procedures

### Restore from Automated Backup

1. **Identify the backup to restore:**

```bash
gcloud sql backups list --instance proposalos-instance --limit 10
```

2. **Create a new instance from backup:**

```bash
gcloud sql instances clone proposalos-instance proposalos-restored \
  --backup-id BACKUP_ID
```

3. **Verify restored data:**

```bash
# Connect to restored instance
psql "postgresql://user:pass@RESTORED_IP:5432/proposalos"

-- Verify row counts
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

### Restore from SQL Export

```bash
# Import SQL dump from Cloud Storage
gcloud sql import sql proposalos-instance \
  gs://proposalos-backups/manual-backup-20240315-120000.sql.gz \
  --database=proposalos
```

## Restore Testing Schedule

### Monthly Restore Test

**Status:** ⚠️ **REQUIRES EXECUTION WITHIN 30 DAYS**

Execute the following checklist monthly:

- [ ] Select a backup from 7+ days ago
- [ ] Clone to a test instance
- [ ] Verify data integrity (row counts, foreign key constraints)
- [ ] Run application smoke tests against restored data
- [ ] Document restore duration
- [ ] Delete test instance after verification

### Monthly Restore Test Script

Run the automated restore test:

```bash
# Execute restore test
npx tsx scripts/test-restore.ts --backup-age 7

# Expected output:
# ✅ Backup selected: backup-20240315-020000
# ✅ Clone created: proposalos-restore-test-abc123
# ✅ Data integrity verified (58 tables, 0 orphaned rows)
# ✅ RLS policies verified (38 tables with policies active)
# ✅ Restore duration: 4m 32s (target: < 1 hour)
# ✅ Test instance cleaned up
```

### Quarterly Full DR Test

- [ ] Simulate complete instance failure
- [ ] Restore from backup to new instance
- [ ] Update application connection strings
- [ ] Verify all critical functions work
- [ ] Document lessons learned

### Restore Test Log

| Date       | Backup Used | Duration | Verified By | Status     |
| ---------- | ----------- | -------- | ----------- | ---------- |
| 2026-03-28 | backup-TBD  | TBD      | SRE Audit   | ⏳ Pending |

_Update this log after each monthly test._

### How to Log a DR Drill

1. Run the restore test script:

   ```bash
   npx tsx scripts/test-restore.ts --backup-age 7
   ```

2. Copy the output and update the log above with:
   - **Date**: Current date (YYYY-MM-DD)
   - **Backup Used**: Backup ID from script output
   - **Duration**: Total restore time
   - **Verified By**: Your username/GitHub handle
   - **Status**: ✅ PASS or ❌ FAIL

3. If the test fails, create an incident ticket and schedule a re-test.

## Backup Monitoring & Alerts

### Cloud Monitoring Alerts

Create alerts for:

```yaml
# Backup failure alert
- name: "SQL Backup Failed"
  condition: sql_instance_backup_failed
  threshold: >= 1
  notification: PagerDuty/Email

# Backup age alert (no backup in 25 hours)
- name: "SQL Backup Too Old"
  condition: sql_backup_age > 90000 seconds
  threshold: > 25 hours
```

### Backup Verification Script

```bash
#!/bin/bash
# scripts/verify-backup.sh

INSTANCE="proposalos-instance"
MAX_AGE_HOURS=25

# Get latest backup timestamp
LATEST_BACKUP=$(gcloud sql backups list --instance $INSTANCE \
  --format="value(startTime)" --limit 1)

# Convert to epoch and check age
BACKUP_EPOCH=$(date -d "$LATEST_BACKUP" +%s)
NOW_EPOCH=$(date +%s)
AGE_HOURS=$(( (NOW_EPOCH - BACKUP_EPOCH) / 3600 ))

if [ $AGE_HOURS -gt $MAX_AGE_HOURS ]; then
  echo "CRITICAL: Latest backup is $AGE_HOURS hours old (max: $MAX_AGE_HOURS)"
  exit 1
fi

echo "OK: Latest backup is $AGE_HOURS hours old"
exit 0
```

## RTO/RPO Targets

| Metric                         | Target         | Measurement                           |
| ------------------------------ | -------------- | ------------------------------------- |
| RTO (Recovery Time Objective)  | < 1 hour       | Time from failure to restored service |
| RPO (Recovery Point Objective) | < 15 minutes   | Maximum data loss in case of failure  |
| Backup retention               | 7 days minimum | Automated backups                     |
| PITR window                    | 7 days         | Point-in-time recovery                |

## Emergency Contacts

| Role             | Contact              | Escalation   |
| ---------------- | -------------------- | ------------ |
| On-call Engineer | oncall@company.com   | PagerDuty    |
| Database Admin   | dba@company.com      | After 30 min |
| Platform Lead    | platform@company.com | After 1 hour |

## Rollback Procedure

If a restore causes issues:

1. **Stop all application instances** to prevent data corruption
2. **Identify last known good backup** before the problematic restore
3. **Restore to previous state** using PITR or backup clone
4. **Verify data integrity** on restored instance
5. **Gradually restore application traffic**

## Post-Restore Checklist

After any restore operation:

- [ ] Verify database connectivity
- [ ] Check all tables exist and have expected row counts
- [ ] Verify foreign key constraints are intact
- [ ] Test critical application queries
- [ ] Verify RLS (Row Level Security) policies are active
- [ ] Check application logs for database errors
- [ ] Confirm backup schedule is still active on restored instance

## Security Considerations

- All backups are encrypted at rest using Cloud SQL encryption
- Backup access restricted to IAM roles: `cloudsql.admin`, `cloudsql.viewer`
- Export files in Cloud Storage use bucket-level encryption
- Enable VPC Service Controls to prevent data exfiltration
- Audit logging enabled for all backup/restore operations

## Cost Management

Estimated monthly backup costs (GCP pricing):

| Component                   | Estimated Cost  |
| --------------------------- | --------------- |
| Automated backups (7 days)  | Included        |
| PITR storage (7 days logs)  | ~$10-20/month   |
| Manual backups (additional) | $0.026/GB/month |
| Export storage              | $0.020/GB/month |

## Related Documentation

- [PgBouncer Setup](./pgbouncer-setup.md)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs/postgres/backup-recovery/backing-up)
- [Disaster Recovery Runbook](./disaster-recovery.md)
