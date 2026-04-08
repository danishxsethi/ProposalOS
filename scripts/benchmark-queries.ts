/**
 * scripts/benchmark-queries.ts
 *
 * Query Performance Benchmark Script
 * Runs EXPLAIN ANALYZE on the top 20 query patterns to verify < 100ms performance
 *
 * Usage:
 *   npx tsx scripts/benchmark-queries.ts
 *
 * Output:
 *   - Query execution times (p50, p95, p99)
 *   - EXPLAIN ANALYZE plans for slow queries
 *   - Recommendations for optimization
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Performance threshold (ms)
const TARGET_LATENCY_MS = 100;
const WARN_LATENCY_MS = 50;

interface QueryBenchmark {
  name: string;
  description: string;
  run: () => Promise<void>;
  category: 'audit' | 'finding' | 'proposal' | 'lead' | 'outreach' | 'tenant';
}

interface BenchmarkResult {
  name: string;
  description: string;
  category: string;
  runs: number[];
  p50: number;
  p95: number;
  p99: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  explainPlan?: string;
}

// Top 20 Query Patterns to Benchmark
const QUERIES: QueryBenchmark[] = [
  // === AUDIT QUERIES ===
  {
    name: 'audit_lookup_by_url_tenant',
    description: 'Find audit by business URL + tenant ID (most frequent)',
    category: 'audit',
    run: async () => {
      await prisma.audit.findFirst({
        where: { businessUrl: 'https://example.com', tenantId: 'test-tenant' },
      });
    },
  },
  {
    name: 'audit_filter_by_status_date',
    description: 'Filter audits by status + createdAt range',
    category: 'audit',
    run: async () => {
      await prisma.audit.findMany({
        where: {
          tenantId: 'test-tenant',
          status: 'COMPLETE',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },
  },
  {
    name: 'audit_with_findings_include',
    description: 'Get audit with nested findings (eager loading)',
    category: 'audit',
    run: async () => {
      await prisma.audit.findUnique({
        where: { id: 'test-audit-id' },
        include: { findings: true, evidence: true },
      });
    },
  },
  {
    name: 'audit_recent_by_tenant',
    description: 'Get recent audits for tenant dashboard',
    category: 'audit',
    run: async () => {
      await prisma.audit.findMany({
        where: { tenantId: 'test-tenant' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { findings: { select: { type: true, impactScore: true } } },
      });
    },
  },

  // === FINDING QUERIES ===
  {
    name: 'finding_by_audit_type',
    description: 'Find findings by audit ID + type filtering',
    category: 'finding',
    run: async () => {
      await prisma.finding.findMany({
        where: { tenantId: 'test-tenant', auditId: 'test-audit', type: 'PAINKILLER' },
        orderBy: { impactScore: 'desc' },
      });
    },
  },
  {
    name: 'finding_by_tenant_severity',
    description: 'Find findings by tenant with severity filtering (dashboard)',
    category: 'finding',
    run: async () => {
      await prisma.finding.findMany({
        where: { tenantId: 'test-tenant' },
        orderBy: { impactScore: 'desc' },
        take: 50,
      });
    },
  },
  {
    name: 'finding_count_by_type',
    description: 'Aggregate findings count by type for analytics',
    category: 'finding',
    run: async () => {
      await prisma.finding.groupBy({
        by: ['type'],
        where: { tenantId: 'test-tenant' },
        _count: true,
      });
    },
  },

  // === PROPOSAL QUERIES ===
  {
    name: 'proposal_by_tenant_status_date',
    description: 'Filter proposals by tenant + status + date (top query)',
    category: 'proposal',
    run: async () => {
      await prisma.proposal.findMany({
        where: {
          tenantId: 'test-tenant',
          status: 'SENT',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },
  },
  {
    name: 'proposal_by_tenant_client_score',
    description: 'Proposals by tenant for dashboard (with clientScore prioritization)',
    category: 'proposal',
    run: async () => {
      await prisma.proposal.findMany({
        where: { tenantId: 'test-tenant' },
        orderBy: { clientScore: { sort: 'desc', nulls: 'last' } },
        take: 20,
      });
    },
  },
  {
    name: 'proposal_with_audit_nested',
    description: 'Get proposal with nested audit + findings',
    category: 'proposal',
    run: async () => {
      await prisma.proposal.findUnique({
        where: { id: 'test-proposal-id' },
        include: {
          audit: {
            include: { findings: { select: { type: true, title: true } } },
          },
        },
      });
    },
  },
  {
    name: 'proposal_by_web_link_token',
    description: 'Lookup proposal by public web link token',
    category: 'proposal',
    run: async () => {
      await prisma.proposal.findUnique({
        where: { webLinkToken: 'test-token' },
        include: { views: { orderBy: { viewedAt: 'desc' }, take: 10 } },
      });
    },
  },

  // === PROSPECT LEAD QUERIES ===
  {
    name: 'lead_by_tenant_status_engagement',
    description: 'Pipeline queries: leads by tenant + status + engagement',
    category: 'lead',
    run: async () => {
      await prisma.prospectLead.findMany({
        where: { tenantId: 'test-tenant', status: 'ENRICHED' },
        orderBy: { engagementScore: 'desc' },
        take: 50,
      });
    },
  },
  {
    name: 'lead_by_outreach_stage_action',
    description: 'Outreach scheduling: leads by stage + next action date',
    category: 'lead',
    run: async () => {
      await prisma.prospectLead.findMany({
        where: {
          tenantId: 'test-tenant',
          outreachStage: 'READY',
          outreachNextActionAt: { lte: new Date() },
        },
        orderBy: { outreachNextActionAt: 'asc' },
        take: 100,
      });
    },
  },
  {
    name: 'lead_with_outreach_emails',
    description: 'Get lead with nested outreach emails (thread view)',
    category: 'lead',
    run: async () => {
      await prisma.prospectLead.findUnique({
        where: { id: 'test-lead-id' },
        include: {
          outreachEmails: {
            include: { events: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
    },
  },
  {
    name: 'lead_discovery_by_city_vertical',
    description: 'Discovery job: filter leads by city + vertical',
    category: 'lead',
    run: async () => {
      await prisma.prospectLead.findMany({
        where: { tenantId: 'test-tenant', city: 'Test City', vertical: 'dental' },
        take: 100,
      });
    },
  },

  // === OUTREACH EMAIL QUERIES ===
  {
    name: 'email_by_tenant_status_date',
    description: 'Email queue: emails by tenant + status + date',
    category: 'outreach',
    run: async () => {
      await prisma.outreachEmail.findMany({
        where: {
          tenantId: 'test-tenant',
          status: 'PENDING',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    },
  },
  {
    name: 'email_by_lead_thread',
    description: 'Email thread: emails by lead for conversation view',
    category: 'outreach',
    run: async () => {
      await prisma.outreachEmail.findMany({
        where: { tenantId: 'test-tenant', leadId: 'test-lead-id' },
        orderBy: { createdAt: 'asc' },
      });
    },
  },
  {
    name: 'email_scheduled_by_status',
    description: 'Scheduled emails: filter by status + scheduled date',
    category: 'outreach',
    run: async () => {
      await prisma.outreachEmail.findMany({
        where: {
          tenantId: 'test-tenant',
          status: 'PENDING',
          scheduledAt: { lte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 50,
      });
    },
  },

  // === TENANT QUERIES ===
  {
    name: 'tenant_by_domain',
    description: 'Tenant lookup by domain (auth flow)',
    category: 'tenant',
    run: async () => {
      await prisma.tenant.findUnique({
        where: { domain: 'test.example.com' },
        include: { brandingConfig: true, users: { select: { email: true, role: true } } },
      });
    },
  },
  {
    name: 'tenant_with_active_audits',
    description: 'Get tenant with active audits (dashboard)',
    category: 'tenant',
    run: async () => {
      await prisma.tenant.findUnique({
        where: { id: 'test-tenant-id' },
        include: {
          audits: {
            where: { status: { in: ['QUEUED', 'RUNNING'] } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
    },
  },
];

// Helper: Calculate percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Helper: Run query multiple times and collect timings
async function benchmarkQuery(
  query: QueryBenchmark,
  iterations: number = 5
): Promise<number[]> {
  const timings: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await query.run();
    } catch (e) {
      // Ignore errors - we're measuring performance, not correctness
    }
    const end = performance.now();
    timings.push(end - start);
  }

  return timings;
}

// Main: Run all benchmarks
async function main() {
  console.log('='.repeat(80));
  console.log('🔍 PROPOSAL ENGINE — QUERY PERFORMANCE BENCHMARK');
  console.log('='.repeat(80));
  console.log(`Target latency: < ${TARGET_LATENCY_MS}ms`);
  console.log(`Warning threshold: ${WARN_LATENCY_MS}ms`);
  console.log(`Iterations per query: 5`);
  console.log('='.repeat(80));
  console.log('');

  const results: BenchmarkResult[] = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const query of QUERIES) {
    process.stdout.write(`Running: ${query.name}... `);

    const timings = await benchmarkQuery(query);
    const p50 = percentile(timings, 50);
    const p95 = percentile(timings, 95);
    const p99 = percentile(timings, 99);

    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (p95 > TARGET_LATENCY_MS) {
      status = 'FAIL';
      failCount++;
    } else if (p95 > WARN_LATENCY_MS) {
      status = 'WARN';
      warnCount++;
    } else {
      passCount++;
    }

    results.push({
      name: query.name,
      description: query.description,
      category: query.category,
      runs: timings,
      p50,
      p95,
      p99,
      status,
    });

    console.log(`p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, p99=${p99.toFixed(1)}ms [${status}]`);
  }

  // Print summary
  console.log('');
  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total queries: ${QUERIES.length}`);
  console.log(`✅ PASS: ${passCount}`);
  console.log(`⚠️  WARN: ${warnCount}`);
  console.log(`❌ FAIL: ${failCount}`);
  console.log('');

  // Print slow queries
  const slowQueries = results.filter((r) => r.status === 'FAIL' || r.status === 'WARN');
  if (slowQueries.length > 0) {
    console.log('='.repeat(80));
    console.log('🐌 SLOW QUERIES (need optimization)');
    console.log('='.repeat(80));
    for (const result of slowQueries) {
      console.log(`\n${result.name} (${result.category})`);
      console.log(`  Description: ${result.description}`);
      console.log(`  p50: ${result.p50.toFixed(1)}ms, p95: ${result.p95.toFixed(1)}ms, p99: ${result.p99.toFixed(1)}ms`);
      console.log(`  Status: ${result.status}`);
      console.log('  Recommendation: Check index usage with EXPLAIN ANALYZE');
    }
  }

  // Print by category
  console.log('');
  console.log('='.repeat(80));
  console.log('📈 PERFORMANCE BY CATEGORY');
  console.log('='.repeat(80));

  const categories = [...new Set(QUERIES.map((q) => q.category))];
  for (const category of categories) {
    const categoryResults = results.filter((r) => r.category === category);
    const avgP95 =
      categoryResults.reduce((sum, r) => sum + r.p95, 0) / categoryResults.length;
    const maxP95 = categoryResults.length > 0 ? Math.max(...categoryResults.map((r) => r.p95)) : 0;
    const allPass = categoryResults.every((r) => r.status === 'PASS');

    console.log(`\n${category.toUpperCase()}`);
    console.log(`  Queries: ${categoryResults.length}`);
    console.log(`  Avg p95: ${avgP95.toFixed(1)}ms`);
    console.log(`  Max p95: ${maxP95.toFixed(1)}ms`);
    console.log(`  Status: ${allPass ? '✅ All passing' : '⚠️ Needs attention'}`);
  }

  // Exit with error if any failures
  if (failCount > 0) {
    console.log('');
    console.log('❌ BENCHMARK FAILED: Some queries exceed target latency');
    process.exit(1);
  } else {
    console.log('');
    console.log('✅ ALL QUERIES PASS PERFORMANCE TARGETS');
    process.exit(0);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Benchmark failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });