// @vitest-environment node
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createExtendedPrismaClient } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const appUrl = process.env.PROPOSALOS_RLS_APP_URL || process.env.DATABASE_URL;
if (!directUrl || !appUrl) throw new Error('DIRECT_URL and RLS app DATABASE_URL are required');

const admin = new PrismaClient({ datasources: { db: { url: directUrl } } });
const app = createExtendedPrismaClient(new PrismaClient({ datasources: { db: { url: appUrl } } }));

describe('Tenant RLS isolation (PostgreSQL app_user role)', () => {
  let tenantA: string;
  let tenantB: string;
  let auditA: string;
  let auditB: string;
  let findingB: string;

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
});
