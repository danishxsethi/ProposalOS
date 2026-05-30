# Query Performance Monitoring

## Overview

This document describes the query performance monitoring setup for the ProposalOS database. Monitoring helps identify slow queries, index usage issues, and optimization opportunities.

## Performance Targets

| Metric      | Target  | Alert Threshold |
| ----------- | ------- | --------------- |
| p50 latency | < 50ms  | > 75ms          |
| p95 latency | < 100ms | > 150ms         |
| p99 latency | < 200ms | > 300ms         |
| Error rate  | < 0.1%  | > 1%            |

## Monitoring Tools

### 1. pg_stat_statements (PostgreSQL Extension)

Enable the extension:

```sql
-- Connect to database as superuser
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

View top slow queries:

```sql
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

Reset statistics:

```sql
SELECT pg_stat_statements_reset();
```

### 2. Cloud SQL Insights

Enable Cloud SQL Insights for real-time query monitoring:

```bash
gcloud sql instances patch proposalos-instance \
  --database-flags=cloudsql.QUERY_INSIGHTS_ENABLED=on
```

### 3. Prisma Query Logging

Enable query logging in development:

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'stdout', level: 'query' },
    { emit: 'stdout', level: 'error' },
  ],
});
```

## Alerting Rules

### Cloud Monitoring Alerts

Create the following alerts:

```yaml
# Slow query alert
- name: 'PostgreSQL Slow Query p95'
  resource: cloudsql_database
  metric: cloudsql.googleapis.com/database/latencies
  filter: metric.percentile = 95
    metric.unit = "ms"
  threshold:
    value: 150
    duration: 5m
  notification: PagerDuty

# Connection pool exhaustion
- name: 'PgBouncer Connection Pool High'
  resource: cloud_run_revision
  metric: custom.googleapis.com/pgbouncer/pool_usage
  threshold:
    value: 0.8 # 80% usage
    duration: 2m
  notification: PagerDuty

# Query error rate
- name: 'PostgreSQL Error Rate'
  resource: cloudsql_database
  metric: cloudsql.googleapis.com/database/network_errors
  threshold:
    value: 10 # errors per minute
    duration: 5m
  notification: PagerDuty
```

## Monitoring Dashboard

### Key Metrics to Track

| Metric                        | Source    | Description               |
| ----------------------------- | --------- | ------------------------- |
| Query latency (p50, p95, p99) | Cloud SQL | Response time percentiles |
| Query count                   | Cloud SQL | Queries per second        |
| Connection count              | PgBouncer | Active connections        |
| Cache hit ratio               | pg_stat   | Buffer cache efficiency   |
| Lock wait time                | pg_stat   | Time waiting for locks    |
| Temp file usage               | pg_stat   | Disk spill indicator      |

### Dashboard Configuration

Import the pre-built dashboard:

```bash
gcloud monitoring dashboards create \
  --config-from-file=terraform/monitoring/dashboard-query-performance.json
```

## Slow Query Investigation

### Step 1: Identify the Query

```sql
-- Find queries with high mean execution time
SELECT
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;
```

### Step 2: Analyze Query Plan

```sql
-- Get detailed execution plan
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM "Audit"
WHERE "tenantId" = 'test-tenant'
  AND "status" = 'COMPLETE'
ORDER BY "createdAt" DESC;
```

### Step 3: Check Index Usage

```sql
-- Check if indexes are being used
SELECT
  schemaname,
  relname,
  seq_scan,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
ORDER BY seq_scan DESC;
```

## Benchmark Script

Run the benchmark script to verify query performance:

```bash
# Run benchmarks
npx tsx scripts/benchmark-queries.ts

# Output shows p50, p95, p99 for top 20 queries
# Target: All queries < 100ms p95
```

## Monthly Review Checklist

- [ ] Review top 10 slow queries from pg_stat_statements
- [ ] Check for missing indexes on frequently queried columns
- [ ] Verify cache hit ratio > 95%
- [ ] Review connection pool utilization
- [ ] Update benchmark script with new query patterns
- [ ] Document any optimizations made

## Related Documentation

- [Backup & Restore](./backup-restore.md)
- [PgBouncer Setup](./pgbouncer-setup.md)
- [N+1 Analysis](./n-plus-one-analysis.md)
