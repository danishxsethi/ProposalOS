// @vitest-environment node
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createExtendedPrismaClient } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

const rlsTestDatabase = process.env.PROPOSALOS_RLS_TEST_DB || 'proposal_rls_smoke';
const directUrl =
  process.env.PROPOSALOS_RLS_DIRECT_URL ||
  `postgresql://postgres:password@localhost:5435/${rlsTestDatabase}`;
const appUrl =
  process.env.PROPOSALOS_RLS_APP_URL ||
  `postgresql://app_user:password@localhost:6432/${rlsTestDatabase}?pgbouncer=true`;

const admin = new PrismaClient({ datasources: { db: { url: directUrl } } });
const app = createExtendedPrismaClient(new PrismaClient({ datasources: { db: { url: appUrl } } }));

describe('Tenant RLS isolation (PostgreSQL app_user role)', () => {
  let tenantA: string;
  let tenantB: string;
  let auditA: string;
  let auditB: string;
  let findingB: string;
  let proposalB: string;
  let evidenceB: string;

  beforeAll(async () => {
    tenantA = randomUUID();
    tenantB = randomUUID();
    await runWithTenantBypass('test-fixture:create-tenants', () => admin.tenant.createMany({ data: [
      { id: tenantA, name: 'RLS Tenant A', slug: `rls-a-${tenantA}` },
      { id: tenantB, name: 'RLS Tenant B', slug: `rls-b-${tenantB}` },
    ] }));
    const rows = await runWithTenantBypass('test-fixture:create-audits', () => admin.audit.createManyAndReturn({ data: [
      { tenantId: tenantA, businessName: 'RLS A', status: 'COMPLETE' },
      { tenantId: tenantB, businessName: 'RLS B', status: 'COMPLETE' },
    ] }));
    auditA = rows.find((row) => row.tenantId === tenantA)!.id;
    auditB = rows.find((row) => row.tenantId === tenantB)!.id;
    const finding = await runWithTenantBypass('test-fixture:create-finding', () => admin.finding.create({ data: {
      tenantId: tenantB, auditId: auditB, module: 'website', category: 'SEO', type: 'PAINKILLER',
      title: 'RLS Tenant B finding', impactScore: 8, confidenceScore: 9,
    } }));
    findingB = finding.id;
    const evidence = await runWithTenantBypass('test-fixture:create-evidence', () =>
      admin.evidenceSnapshot.create({
        data: {
          auditId: auditB,
          tenantId: tenantB,
          module: 'seo',
          source: 'rls-test',
          rawResponse: {},
        },
      })
    );
    evidenceB = evidence.id;
    const proposal = await runWithTenantBypass('test-fixture:create-proposal', () =>
      admin.proposal.create({
        data: { auditId: auditB, tenantId: tenantB, status: 'READY' },
      })
    );
    proposalB = proposal.id;
  });

  afterAll(async () => {
    await runWithTenantBypass('test-fixture:delete-tenants', () => admin.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }));
    await Promise.all([admin.$disconnect(), app.$disconnect()]);
  });

  it('tenant A sees only its own audit', async () => {
    const rows = await runWithTenantAsync(tenantA, () => app.audit.findMany());
    expect(rows.map((row) => row.id)).toContain(auditA);
    expect(rows.some((row) => row.id === auditB)).toBe(false);
  });

  it('tenant A cannot address tenant B audit by globally unique id', async () => {
    const row = await runWithTenantAsync(tenantA, () => app.audit.findUnique({ where: { id: auditB } }));
    expect(row).toBeNull();
  });

  it('tenant A cannot read tenant B finding by globally unique id or forged tenant filter', async () => {
    const byId = await runWithTenantAsync(tenantA, () => app.finding.findUnique({ where: { id: findingB } }));
    const byForgedFilter = await runWithTenantAsync(tenantA, () => app.finding.findMany({ where: { tenantId: tenantB } }));
    expect(byId).toBeNull();
    expect(byForgedFilter).toEqual([]);
  });

  it('tenant A cannot resolve tenant B evidence or proposal records', async () => {
    const [evidence, proposal] = await runWithTenantAsync(tenantA, async () => Promise.all([
      app.evidenceSnapshot.findUnique({ where: { id: evidenceB } }),
      app.proposal.findUnique({ where: { id: proposalB } }),
    ]));

    expect(evidence).toBeNull();
    expect(proposal).toBeNull();
  });

  it('does not leak tenant context across pooled app_user requests', async () => {
    const tenantAResult = await runWithTenantAsync(tenantA, () => app.audit.findMany());
    const tenantBResult = await runWithTenantAsync(tenantB, () => app.audit.findMany());
    const noContextResult = await app.audit.findMany().catch((error: unknown) => error);

    expect(tenantAResult.map((row) => row.tenantId)).toContain(tenantA);
    expect(tenantAResult.some((row) => row.tenantId === tenantB)).toBe(false);
    expect(tenantBResult.map((row) => row.tenantId)).toContain(tenantB);
    expect(tenantBResult.some((row) => row.tenantId === tenantA)).toBe(false);
    expect(noContextResult).toBeInstanceOf(Error);
  });
});
