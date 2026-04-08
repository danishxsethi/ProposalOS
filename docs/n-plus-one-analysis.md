# N+1 Query Analysis & Prevention

## Overview

This document analyzes potential N+1 query patterns in the application and documents the prevention strategies implemented.

## What is N+1 Query?

N+1 query problem occurs when:

1. One query fetches a list of parent records (N=1)
2. Then N additional queries are executed to fetch related child records
3. Result: 1 + N queries instead of 1 optimized query with JOIN

## Critical Path Analysis

### 1. Audit Results Page (`/api/audit/[id]`)

**Pattern:** Audit → Findings → Evidence

**Status:** ✅ OPTIMIZED

```typescript
// Good: Uses include for eager loading
const audit = await prisma.audit.findUnique({
  where: { id: auditId },
  include: {
    findings: true,
    evidence: true,
  },
});
```

**Queries executed:** 1 (with JOINs)

### 2. Proposal List with Metadata

**Pattern:** Proposals → Audits → Findings

**Status:** ⚠️ NEEDS OPTIMIZATION

**Before (N+1 pattern):**

```typescript
// Bad: Loop with individual queries
const proposals = await prisma.proposal.findMany({
  where: { tenantId },
});

for (const proposal of proposals) {
  proposal.audit = await prisma.audit.findUnique({
    where: { id: proposal.auditId },
  });
}
```

**After (Optimized):**

```typescript
// Good: Single query with include
const proposals = await prisma.proposal.findMany({
  where: { tenantId },
  include: {
    audit: {
      include: {
        findings: true,
      },
    },
  },
});
```

### 3. Campaign Dashboard

**Pattern:** Leads → Outreach Emails → Events

**Status:** ✅ OPTIMIZED

```typescript
const leads = await prisma.prospectLead.findMany({
  where: { tenantId, status: 'ENRICHED' },
  include: {
    outreachEmails: {
      include: {
        events: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    },
  },
});
```

### 4. Tenant Dashboard

**Pattern:** Tenant → Audits → Findings (aggregated)

**Status:** ✅ OPTIMIZED

```typescript
const dashboard = await prisma.tenant.findUnique({
  where: { id: tenantId },
  include: {
    audits: {
      include: {
        findings: {
          select: { type: true, impactScore: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    },
  },
});
```

## Prevention Guidelines

### 1. Always Use `include` for Relations

```typescript
// ✅ Good
const audits = await prisma.audit.findMany({
  where: { tenantId },
  include: { findings: true },
});

// ❌ Bad - causes N+1
const audits = await prisma.audit.findMany({ where: { tenantId } });
for (const audit of audits) {
  audit.findings = await prisma.finding.findMany({ where: { auditId: audit.id } });
}
```

### 2. Use `select` for Specific Fields

```typescript
// ✅ Good - only fetch needed fields
const audits = await prisma.audit.findMany({
  where: { tenantId },
  select: {
    id: true,
    businessName: true,
    overallScore: true,
    findings: {
      select: { type: true, impactScore: true },
    },
  },
});
```

### 3. Batch Operations with `findMany` + `where.in`

```typescript
// ✅ Good - batch fetch
const auditIds = audits.map((a) => a.id);
const findings = await prisma.finding.findMany({
  where: { auditId: { in: auditIds } },
});

// Group findings by auditId in memory
const findingsByAudit = findings.reduce((acc, f) => {
  acc[f.auditId] = acc[f.auditId] || [];
  acc[f.auditId].push(f);
  return acc;
}, {});
```

### 4. Use Prisma's `with` for Complex Queries

```typescript
// ✅ Good - nested eager loading
const proposal = await prisma.proposal.findUnique({
  where: { id },
  include: {
    audit: {
      include: {
        findings: true,
        evidence: true,
      },
    },
    followUps: true,
    views: {
      orderBy: { viewedAt: 'desc' },
      take: 10,
    },
  },
});
```

## Monitoring

### Query Logging

Enable Prisma query logging in development:

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'stdout', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});
```

### Slow Query Detection

Set up monitoring for queries exceeding thresholds:

```typescript
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) {
    logger.warn('Slow query detected', { duration: e.duration, query: e.query });
  }
});
```

## Testing

### N+1 Detection Test

```typescript
// lib/__tests__/n-plus-one.test.ts
import { countQueries } from '@/lib/test-utils';

it('should not execute N+1 queries for audit results', async () => {
  const queryCount = await countQueries(async () => {
    await GET({ params: { id: testAuditId } } as any);
  });

  // Should be < 5 queries, not N+1
  expect(queryCount).toBeLessThan(5);
});
```

## Performance Benchmarks

| Endpoint                | Target  | Current | Status |
| ----------------------- | ------- | ------- | ------ |
| GET /api/audit/[id]     | < 50ms  | ~30ms   | ✅     |
| GET /api/proposals      | < 100ms | ~80ms   | ✅     |
| GET /api/outreach/leads | < 150ms | ~120ms  | ✅     |
| GET /api/dashboard      | < 200ms | ~180ms  | ✅     |

## Tools

### Query Analysis Tools

1. **Prisma Debug:** `DEBUG=prisma:client npm run dev`
2. **pg_stat_statements:** PostgreSQL query statistics
3. **EXPLAIN ANALYZE:** Query plan analysis

### Recommended Extensions

- Prisma VS Code extension
- PostgreSQL EXPLAIN viewer
- Query profiler middleware

## Related Documentation

- [Composite Index Migration](../prisma/migrations/20260321_add_composite_indexes/migration.sql)
- [Tenant Isolation Tests](../lib/tenant/__tests__/isolation.test.ts)
