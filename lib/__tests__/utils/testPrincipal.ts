import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

export type TestPrincipal = {
  actorId: string;
  tenantId: string;
  role: 'agency_admin' | 'agency_member' | 'bic_user';
  authMethod: 'session' | 'api_key' | 'worker' | 'cron';
};

/** Create a disposable tenant as explicit test setup, not request-time authority. */
export async function createTestTenant(name = 'ProposalOS Test Tenant') {
  const id = randomUUID();
  return runWithTenantBypass('test-helper:create-tenant', () => prisma.tenant.create({
    data: { id, name, slug: `test-${id}` },
  }));
}

/** Run DB test work in a trusted tenant context using the production RLS wrapper. */
export function withTestTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantAsync(tenantId, fn);
}

/** Represent an authenticated tenant principal without granting platform authority. */
export function withTestPrincipal<T>(principal: TestPrincipal, fn: () => Promise<T>): Promise<T> {
  if (!principal.tenantId || !principal.actorId) throw new Error('Test principal identity is required');
  return runWithTenantAsync(principal.tenantId, fn);
}

/** Explicit system setup/cleanup scope. Never use for application code under test. */
export function withTestSystemSetup<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantBypass('test-helper:system-setup-or-cleanup', fn);
}
