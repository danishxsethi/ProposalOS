# PgBouncer Configuration for Cloud Run

## Overview

This document describes how to configure PgBouncer as a connection pooler between Cloud Run and Cloud SQL PostgreSQL. This is critical for production deployments where Cloud Run's auto-scaling can exhaust database connections.

## Architecture

```
Cloud Run Instances → PgBouncer Pool → Cloud SQL PostgreSQL
     (100s)              (25-50)            (max 100-500)
```

## Problem Statement

Without connection pooling:

- Cloud Run can scale to 100+ instances
- Each instance opens 5-10 connections
- Default Cloud SQL max_connections: 100-500
- **Result:** Connection exhaustion within minutes under load

## Solution: PgBouncer in Transaction Mode

Transaction mode allows connection multiplexing - many client connections share fewer server connections.

## Local Development Setup

### 1. Start PgBouncer with Docker

```bash
docker-compose -f docker-compose.pgbouncer.yml up -d
```

### 2. Connection Strings

Use these connection strings in your `.env`:

```bash
# Direct connection (bypass pooler - for admin only)
DATABASE_URL_DIRECT=postgresql://user:pass@127.0.0.1:5432/proposalos

# Pooled connection (for application)
DATABASE_URL=postgresql://user:pass@127.0.0.1:6432/proposalos
```

## Cloud Run Deployment

### Option A: Cloud Run + Cloud SQL Proxy + PgBouncer Sidecar

```yaml
# Cloud Run service with sidecar
containers:
  - name: app
    image: gcr.io/project/proposalos:latest
    ports:
      - containerPort: 8080
    env:
      - name: DATABASE_URL
        value: 'postgresql://user:pass@localhost:6432/proposalos'

  - name: pgbouncer
    image: bitnami/pgbouncer:latest
    ports:
      - containerPort: 6432
    env:
      - name: POSTGRESQL_HOST
        value: '/cloudsql/project:region:instance'
      - name: POSTGRESQL_PORT
        value: '5432'
      - name: POSTGRESQL_USERNAME
        valueFrom:
          secretKeyRef:
            name: db-credentials
            key: username
      - name: POSTGRESQL_PASSWORD
        valueFrom:
          secretKeyRef:
            name: db-credentials
            key: password
      - name: PGBOUNCER_POOL_MODE
        value: 'transaction'
      - name: PGBOUNCER_MAX_CLIENT_CONN
        value: '250'
      - name: PGBOUNCER_DEFAULT_POOL_SIZE
        value: '25'
```

### Option B: Separate PgBouncer on GCE/Cloud Run

Deploy PgBouncer as a separate service:

```yaml
# pgbouncer-config.json
{
  'databases':
    {
      'proposalos':
        {
          'host': '/cloudsql/project:region:instance',
          'port': 5432,
          'dbname': 'proposalos',
          'pool_size': 25,
          'pool_mode': 'transaction',
        },
    },
  'pgbouncer':
    {
      'listen_port': 6432,
      'listen_addr': '0.0.0.0',
      'auth_type': 'scram-sha-256',
      'auth_file': '/etc/pgbouncer/userlist.txt',
      'pool_mode': 'transaction',
      'max_client_conn': 250,
      'default_pool_size': 25,
      'min_pool_size': 5,
      'reserve_pool_size': 5,
      'reserve_pool_timeout': 3,
      'server_lifetime': 3600,
      'server_idle_timeout': 600,
      'server_connect_timeout': 15,
      'server_login_retry': 5,
      'query_timeout': 300,
      'query_wait_timeout': 120,
      'client_idle_timeout': 0,
      'client_login_timeout': 60,
      'idle_client_timeout': 3600,
      'dns_max_ttl': 300,
      'dns_zone_check_period': 0,
      'dns_nxdomain_ttl': 300,
    },
}
```

## Configuration Reference

### Recommended Settings for Cloud Run

| Parameter                | Value         | Description                               |
| ------------------------ | ------------- | ----------------------------------------- |
| `pool_mode`              | `transaction` | Best multiplexing, shortest transactions  |
| `max_client_conn`        | `250`         | Max client connections per pooler         |
| `default_pool_size`      | `25`          | Server connections per database/user      |
| `min_pool_size`          | `5`           | Minimum idle server connections           |
| `server_lifetime`        | `3600`        | Close server connection after 1 hour      |
| `server_idle_timeout`    | `600`         | Close idle server connection after 10 min |
| `server_connect_timeout` | `15`          | Timeout for connecting to PostgreSQL      |
| `query_timeout`          | `300`         | Kill queries running longer than 5 min    |
| `query_wait_timeout`     | `120`         | Timeout waiting for query slot            |

### Connection String Format

```
# Transaction mode (recommended)
postgresql://user:password@pgbouncer-host:6432/database?sslmode=require

# With connection pooler hints
postgresql://user:password@pgbouncer-host:6432/database?sslmode=require&connection_limit=25
```

## Monitoring

### Key Metrics to Track

```sql
-- Current client connections
SHOW STATS;

-- Server connection usage
SHOW POOLS;

-- Client activity
SHOW CLIENTS;
```

### Cloud Monitoring Alerts

Set up alerts for:

- `pgbouncer_client_connections` > 200 (80% of max)
- `pgbouncer_server_connections` > 22 (88% of pool)
- `pgbouncer_query_wait_time` p99 > 1000ms
- `pgbouncer_errors_per_minute` > 10

## Troubleshooting

### "Too Many Clients" Error

```
FATAL: PgBouncer cannot connect to server
```

**Fix:** Increase `default_pool_size` or reduce Cloud Run concurrency.

### "Query Wait Timeout"

```
FATAL: query wait timeout
```

**Fix:** Increase `query_wait_timeout` or optimize slow queries.

### Connection Leaks

Monitor for connections not being released:

```sql
-- Check for long-running transactions
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;
```

## Testing

### Load Test Script

```bash
# Install k6
brew install k6

# Run load test
k6 run -e CONNECTIONS=50 -e DURATION=2m scripts/loadtest-pgbouncer.js
```

### Expected Results

| Metric               | Target  |
| -------------------- | ------- |
| p50 latency          | < 50ms  |
| p95 latency          | < 200ms |
| p99 latency          | < 500ms |
| Error rate           | < 0.1%  |
| Max connections used | < 25    |

## Security Considerations

1. **Authentication:** Use `scram-sha-256` auth type
2. **TLS:** Require SSL for all connections
3. **Network:** Restrict PgBouncer access to VPC only
4. **Secrets:** Store credentials in Secret Manager
5. **Audit:** Enable query logging for compliance

## Migration Checklist

- [ ] Deploy PgBouncer to staging
- [ ] Update connection strings in staging
- [ ] Load test with 2x expected traffic
- [ ] Monitor for 48 hours
- [ ] Deploy to production
- [ ] Update DATABASE_URL in production
- [ ] Verify application connectivity
- [ ] Monitor connection counts
- [ ] Document rollback procedure
