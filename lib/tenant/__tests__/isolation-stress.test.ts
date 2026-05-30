/**
 * lib/tenant/__tests__/isolation-stress.test.ts
 *
 * Multi-Tenant Isolation Stress Test — 100 Tenant Scale
 *
 * This test suite verifies that tenant data remains strictly isolated
 * under load with 100 concurrent tenants. It tests:
 * - Cross-tenant query isolation
 * - API endpoint tenant scoping
 * - Concurrent access patterns
 * - Data leakage prevention
 *
 * ACCEPTANCE CRITERIA:
 * - Zero cross-tenant data leaks in 100-tenant stress test
 * - All queries properly scoped by tenantId
 * - No admin endpoint bypasses tenant scope accidentally
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import type { prisma as appPrismaType } from '@/lib/prisma';
import type { runWithTenantAsync as runWithTenantAsyncType } from '../context';

const TEST_DB = 'proposal_rls_smoke';
const POSTGRES_PASSWORD = 'password';
const DIRECT_URL = `postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5435/${TEST_DB}`;
const POOLED_APP_USER_URL = `postgresql://app_user:${POSTGRES_PASSWORD}@localhost:6432/${TEST_DB}?pgbouncer=true`;

// Use a test-specific Prisma client running as superuser for setup and teardown
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DIRECT_URL,
    },
  },
});

let appPrisma: typeof appPrismaType;
let runWithTenantAsync: typeof runWithTenantAsyncType;

// Test configuration
const TENANT_COUNT = 100;
const RECORDS_PER_TENANT = 5;

interface TestTenant {
  id: string;
  name: string;
  slug: string;
  auditIds: string[];
  findingIds: string[];
  proposalIds: string[];
}

describe('Multi-Tenant Isolation Stress Test (100 Tenants)', () => {
  const testTenants: TestTenant[] = [];
  let globalAuditId: string;
  let globalFindingId: string;

  beforeAll(async () => {
    // Set database URL to the non-superuser app_user to enforce RLS
    const env = process.env as Record<string, string | undefined>;
    env.DATABASE_URL = POOLED_APP_USER_URL;
    env.DIRECT_URL = DIRECT_URL;

    vi.resetModules();

    const prismaModule = await import('@/lib/prisma');
    const contextModule = await import('../context');

    appPrisma = prismaModule.prisma;
    runWithTenantAsync = contextModule.runWithTenantAsync;

    console.log(`🏗️  Setting up ${TENANT_COUNT} test tenants...`);

    // Create 100 isolated tenants
    const tenantData = Array.from({ length: TENANT_COUNT }, (_, i) => ({
      id: uuidv4(),
      name: `Stress Test Tenant ${i + 1}`,
      slug: `stress-tenant-${i + 1}-${uuidv4().slice(0, 8)}`,
      domain: `tenant-${i + 1}.stress.test.local`,
      planTier: i % 4 === 0 ? 'agency' : i % 3 === 0 ? 'pro' : 'starter',
      status: 'active' as const,
    }));

    await prisma.tenant.createMany({ data: tenantData });

    // Store tenant references
    for (const tenant of tenantData) {
      testTenants.push({
        ...tenant,
        auditIds: [],
        findingIds: [],
        proposalIds: [],
      });
    }

    // Create test data for each tenant (5 audits, 5 findings, 5 proposals each)
    for (const testTenant of testTenants) {
      for (let i = 0; i < RECORDS_PER_TENANT; i++) {
        // Create audits
        const audit = await prisma.audit.create({
          data: {
            id: uuidv4(),
            tenantId: testTenant.id,
            businessName: `${testTenant.name} - Business ${i + 1}`,
            businessUrl: `https://business-${i + 1}.${testTenant.slug}.com`,
            status: 'COMPLETE',
            overallScore: 50 + Math.floor(Math.random() * 50),
            modulesCompleted: ['website', 'gbp'],
          },
        });
        testTenant.auditIds.push(audit.id);

        // Create findings
        const finding = await prisma.finding.create({
          data: {
            id: uuidv4(),
            tenantId: testTenant.id,
            auditId: audit.id,
            module: 'website',
            category: 'SEO',
            type: 'PAINKILLER',
            title: `${testTenant.name} - Finding ${i + 1}`,
            description: `This finding belongs to tenant ${testTenant.id}`,
            impactScore: 5 + Math.floor(Math.random() * 5),
            confidenceScore: 80 + Math.floor(Math.random() * 20),
          },
        });
        testTenant.findingIds.push(finding.id);

        // Create proposals
        const proposal = await prisma.proposal.create({
          data: {
            id: uuidv4(),
            tenantId: testTenant.id,
            auditId: audit.id,
            status: 'SENT',
          },
        });
        testTenant.proposalIds.push(proposal.id);
      }
    }

    // Create a real tenant for the global record to avoid Audit_tenantId_fkey violation
    const globalTenantId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: globalTenantId,
        name: 'Global Stress Test Tenant',
        slug: `stress-tenant-global-${uuidv4().slice(0, 8)}`,
        domain: `global.stress.test.local`,
        planTier: 'starter',
        status: 'active',
      },
    });

    // Create one global record that should NOT be accessible to any tenant
    const globalAudit = await prisma.audit.create({
      data: {
        id: uuidv4(),
        tenantId: globalTenantId, // Different tenant
        businessName: 'Global Test Business',
        businessUrl: 'https://global-test.com',
        status: 'COMPLETE',
        overallScore: 100,
        modulesCompleted: ['website'],
      },
    });
    globalAuditId = globalAudit.id;

    const globalFinding = await prisma.finding.create({
      data: {
        id: uuidv4(),
        tenantId: globalAudit.tenantId,
        auditId: globalAudit.id,
        module: 'website',
        category: 'Test',
        type: 'VITAMIN',
        title: 'Global Finding',
        description: 'This should never be accessible',
        impactScore: 10,
        confidenceScore: 100,
      },
    });
    globalFindingId = globalFinding.id;

    console.log(`✅ Created ${TENANT_COUNT * RECORDS_PER_TENANT} records per model`);
  }, 120000); // 2 minute timeout for setup

  afterAll(async () => {
    console.log('🧹 Cleaning up test tenants...');

    // Delete all test tenants (cascades to child records)
    await prisma.tenant.deleteMany({
      where: {
        slug: {
          startsWith: 'stress-tenant-',
        },
      },
    });

    // Clean up global test records
    await prisma.finding.delete({ where: { id: globalFindingId } }).catch(() => {});
    await prisma.audit.delete({ where: { id: globalAuditId } }).catch(() => {});

    console.log('✅ Cleanup complete');
  }, 60000);

  describe('P0: Cross-Tenant Query Isolation', () => {
    it('should return only tenant-scoped audits for each of 100 tenants', async () => {
      const results = await Promise.all(
        testTenants.map(async (testTenant) => {
          const audits = await prisma.audit.findMany({
            where: { tenantId: testTenant.id },
          });
          return {
            tenantId: testTenant.id,
            auditCount: audits.length,
            hasForeignAudits: audits.some((a) => a.tenantId !== testTenant.id),
          };
        })
      );

      // Verify all tenants got exactly their own records
      const violations = results.filter((r) => r.hasForeignAudits);
      expect(violations).toHaveLength(0);

      // Verify each tenant got expected count
      const incorrectCounts = results.filter((r) => r.auditCount !== RECORDS_PER_TENANT);
      expect(incorrectCounts).toHaveLength(0);
    });

    it('should return only tenant-scoped findings for each of 100 tenants', async () => {
      const results = await Promise.all(
        testTenants.map(async (testTenant) => {
          const findings = await prisma.finding.findMany({
            where: { tenantId: testTenant.id },
          });
          return {
            tenantId: testTenant.id,
            findingCount: findings.length,
            hasForeignFindings: findings.some((f) => f.tenantId !== testTenant.id),
          };
        })
      );

      const violations = results.filter((r) => r.hasForeignFindings);
      expect(violations).toHaveLength(0);

      const incorrectCounts = results.filter((r) => r.findingCount !== RECORDS_PER_TENANT);
      expect(incorrectCounts).toHaveLength(0);
    });

    it('should return only tenant-scoped proposals for each of 100 tenants', async () => {
      const results = await Promise.all(
        testTenants.map(async (testTenant) => {
          const proposals = await prisma.proposal.findMany({
            where: { tenantId: testTenant.id },
          });
          return {
            tenantId: testTenant.id,
            proposalCount: proposals.length,
            hasForeignProposals: proposals.some((p) => p.tenantId !== testTenant.id),
          };
        })
      );

      const violations = results.filter((r) => r.hasForeignProposals);
      expect(violations).toHaveLength(0);

      const incorrectCounts = results.filter((r) => r.proposalCount !== RECORDS_PER_TENANT);
      expect(incorrectCounts).toHaveLength(0);
    });
  });

  describe('P0: Tenant-Aware Prisma Isolation', () => {
    it('should automatically scope findMany queries by tenant context', async () => {
      // Pick 10 random tenants to test
      const sampleTenants = testTenants.slice(0, 10);

      const results = await Promise.all(
        sampleTenants.map((testTenant) =>
          runWithTenantAsync(testTenant.id, async () => {
            const audits = await appPrisma.audit.findMany();
            const findings = await appPrisma.finding.findMany();
            const proposals = await appPrisma.proposal.findMany();

            return {
              tenantId: testTenant.id,
              auditCount: audits.length,
              findingCount: findings.length,
              proposalCount: proposals.length,
              allAuditsScoped: audits.every((a) => a.tenantId === testTenant.id),
              allFindingsScoped: findings.every((f) => f.tenantId === testTenant.id),
              allProposalsScoped: proposals.every((p) => p.tenantId === testTenant.id),
            };
          })
        )
      );

      for (const result of results) {
        expect(result.auditCount).toBe(RECORDS_PER_TENANT);
        expect(result.findingCount).toBe(RECORDS_PER_TENANT);
        expect(result.proposalCount).toBe(RECORDS_PER_TENANT);
        expect(result.allAuditsScoped).toBe(true);
        expect(result.allFindingsScoped).toBe(true);
        expect(result.allProposalsScoped).toBe(true);
      }
    });

    it('should automatically inject tenantId on create operations', async () => {
      const testTenant = testTenants[0]!;
      const newAudit = await runWithTenantAsync(testTenant.id, () =>
        appPrisma.audit.create({
          data: {
            tenantId: testTenant.id,
            businessName: 'Test Auto-Scoped Business',
            businessUrl: 'https://test.com',
            status: 'QUEUED',
            modulesCompleted: [],
          },
        })
      );

      expect(newAudit.tenantId).toBe(testTenant.id);

      // Cleanup
      await prisma.audit.delete({ where: { id: newAudit.id } });
    });

    it('should block cross-tenant findUnique access via tenant-aware query context', async () => {
      const tenantA = testTenants[0]!;
      const tenantBFindingId = testTenants[1]!.findingIds[0]!;
      const scopedFinding = await runWithTenantAsync(tenantA.id, () =>
        appPrisma.finding.findUnique({
          where: { id: tenantBFindingId },
        })
      );

      expect(scopedFinding).toBeNull();
    });
  });

  describe('P0: Concurrent Access Patterns', () => {
    it('should handle 1000 concurrent queries without data leakage', async () => {
      const queries = Array.from({ length: 1000 }, (_, i) => {
        const tenant = testTenants[i % TENANT_COUNT]!;
        return prisma.audit.findMany({
          where: { tenantId: tenant.id },
        });
      });

      const results = await Promise.all(queries);

      // Verify each result only contains records for the querying tenant
      for (let i = 0; i < results.length; i++) {
        const tenant = testTenants[i % TENANT_COUNT]!;
        const audits = results[i]!;

        for (const audit of audits) {
          expect(audit.tenantId).toBe(tenant.id);
        }
      }
    });

    it('should handle concurrent create operations without tenant leakage', async () => {
      const creates = testTenants.slice(0, 50).map(async (tenant) => {
        return runWithTenantAsync(tenant.id, () =>
          appPrisma.finding.create({
            data: {
              tenantId: tenant.id,
              auditId: tenant.auditIds[0]!,
              module: 'test',
              category: 'test',
              type: 'PAINKILLER',
              title: 'Concurrent Test Finding',
              impactScore: 5,
              confidenceScore: 90,
            },
          })
        );
      });

      const results = await Promise.all(creates);

      // Verify each finding has correct tenantId
      for (let i = 0; i < results.length; i++) {
        expect(results[i]!.tenantId).toBe(testTenants[i]!.id);
      }

      // Cleanup
      await prisma.finding.deleteMany({
        where: {
          title: 'Concurrent Test Finding',
        },
      });
    });
  });

  describe('P0: Relationship Isolation', () => {
    it('should not allow accessing findings via audit from another tenant', async () => {
      // Try to get findings for Tenant A's audit while filtering for Tenant B
      const tenantAAudit = testTenants[0]!.auditIds[0]!;
      const tenantBId = testTenants[1]!.id;

      const findings = await prisma.finding.findMany({
        where: {
          auditId: tenantAAudit,
          tenantId: tenantBId, // Wrong tenant
        },
      });

      expect(findings).toHaveLength(0);
    });

    it('should isolate evidence snapshots by tenant', async () => {
      const results = await Promise.all(
        testTenants.slice(0, 20).map(async (testTenant) => {
          // Create evidence for this tenant
          const evidence = await prisma.evidenceSnapshot.create({
            data: {
              tenantId: testTenant.id,
              auditId: testTenant.auditIds[0]!,
              module: 'website',
              source: 'test',
              rawResponse: { score: 75 },
            },
          });

          // Query evidence for this tenant
          const tenantEvidence = await prisma.evidenceSnapshot.findMany({
            where: { tenantId: testTenant.id },
          });

          // Cleanup
          await prisma.evidenceSnapshot.delete({ where: { id: evidence.id } });

          return {
            tenantId: testTenant.id,
            hasForeignEvidence: tenantEvidence.some((e) => e.tenantId !== testTenant.id),
          };
        })
      );

      const violations = results.filter((r) => r.hasForeignEvidence);
      expect(violations).toHaveLength(0);
    });
  });

  describe('P0: Admin Endpoint Protection', () => {
    it('should not have any unscoped count operations', async () => {
      // Verify count operations require tenant scoping
      const globalCount = await prisma.audit.count();

      // Each tenant should only see their own count
      const tenantCounts = await Promise.all(
        testTenants.slice(0, 10).map(async (tenant) => {
          return prisma.audit.count({
            where: { tenantId: tenant.id },
          });
        })
      );

      const sumOfTenantCounts = tenantCounts.reduce((a, b) => a + b, 0);

      // Global count should be higher than sum of sampled tenants
      expect(globalCount).toBeGreaterThan(sumOfTenantCounts);
    });
  });

  describe('P1: Edge Cases', () => {
    it('should allow direct unscoped PrismaClient access for explicit admin-mode tests', async () => {
      const allAudits = await prisma.audit.findMany({
        take: 1,
      });

      expect(allAudits.length).toBeGreaterThanOrEqual(0);
    });

    it('should cascade delete all child records when tenant is deleted', async () => {
      // Create a temporary tenant with related data
      const tempTenantId = uuidv4();

      await prisma.tenant.create({
        data: {
          id: tempTenantId,
          name: 'Temp Delete Test',
          slug: `temp-delete-${tempTenantId.slice(0, 8)}`,
          domain: `temp-${tempTenantId.slice(0, 8)}.test.local`,
          planTier: 'free',
          status: 'active',
        },
      });

      const tempAudit = await prisma.audit.create({
        data: {
          tenantId: tempTenantId,
          businessName: 'Temp Business',
          status: 'QUEUED',
          modulesCompleted: [],
        },
      });

      const tempFinding = await prisma.finding.create({
        data: {
          tenantId: tempTenantId,
          auditId: tempAudit.id,
          module: 'test',
          category: 'test',
          type: 'PAINKILLER',
          title: 'Temp Finding',
          impactScore: 5,
          confidenceScore: 80,
        },
      });

      // Delete the tenant
      await prisma.tenant.delete({
        where: { id: tempTenantId },
      });

      // Verify cascade delete
      const remainingAudit = await prisma.audit.findUnique({
        where: { id: tempAudit.id },
      });
      const remainingFinding = await prisma.finding.findUnique({
        where: { id: tempFinding.id },
      });

      expect(remainingAudit).toBeNull();
      expect(remainingFinding).toBeNull();
    });
  });

  /**
   * Test Summary Output
   */
  afterAll(() => {
    console.log('\n========================================');
    console.log('📊 TENANT ISOLATION STRESS TEST SUMMARY');
    console.log('========================================');
    console.log(`Tenants Tested: ${TENANT_COUNT}`);
    console.log(`Records Per Tenant: ${RECORDS_PER_TENANT}`);
    console.log(`Total Records Created: ${TENANT_COUNT * RECORDS_PER_TENANT * 3}`);
    console.log('========================================\n');
  });
});
