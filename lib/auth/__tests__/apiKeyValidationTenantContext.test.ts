// @vitest-environment node
/**
 * lib/auth/__tests__/apiKeyValidationTenantContext.test.ts
 *
 * Regression for a real RLS-transition defect found by the controlled joined
 * journey: `validateApiKey` queried `ApiKey` through the tenant-context-enforcing
 * extended Prisma client WITHOUT ambient tenant context, so every pe_live_* API
 * key request failed with MissingTenantError the moment the app ran under the
 * RLS-enforced role. Auth resolution legitimately crosses tenants (the key hash
 * identifies the tenant), so the lookup and its usage-accounting writes run under
 * an explicit runWithTenantBypass, and the handler the key authorizes still runs
 * strictly inside runWithTenantAsync(validation.tenantId).
 *
 * This test runs the real validateApiKey against a disposable migrated database
 * with NO ambient tenant context — exactly the auth-resolution situation.
 */
import { createHash, randomBytes } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { activateRealDb, type RealDbSession } from '../../../tests/helpers/realDb';

const session: RealDbSession = await activateRealDb('apikey-auth-ctx');

const { prisma } = await import('@/lib/prisma');
const { validateApiKey } = await import('@/lib/auth/apiKeys');
const { runWithTenantAsync } = await import('@/lib/tenant/context');

afterAll(async () => {
  await session.cleanup();
});

describe('validateApiKey without ambient tenant context (auth resolution)', () => {
  it('resolves a valid key with no ambient tenant context (RLS transition regression)', async () => {
    const tenantId = crypto.randomUUID();
    await session.admin.tenant.create({
      data: { id: tenantId, name: 'ApiKey Auth Context Tenant', updatedAt: new Date() },
    });

    const rawKey = `pe_live_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    await session.admin.apiKey.create({
      data: {
        tenantId,
        keyHash,
        keyPrefix: rawKey.slice(0, 12),
        name: 'ctx-regression',
        scopes: ['*'],
        isActive: true,
      },
    });

    // No runWithTenantAsync / bypass wrapper here on purpose: auth resolution
    // happens before any tenant context exists. Previously this threw
    // MissingTenantError: Tenant context required for ApiKey.findUnique.
    const validation = await validateApiKey(rawKey);

    expect(validation).not.toBeNull();
    expect(validation && !('error' in validation) ? validation.tenantId : null).toBe(tenantId);
  });

  it('rejects an unknown key without leaking tenant data', async () => {
    const unknown = `pe_live_${randomBytes(24).toString('hex')}`;
    const validation = await validateApiKey(unknown);
    expect(validation).toBeNull();
  });

  it('still scopes authorized handler work to the key tenant when called inside tenant context', async () => {
    const tenantId = crypto.randomUUID();
    await session.admin.tenant.create({
      data: { id: tenantId, name: 'ApiKey Scoped Tenant', updatedAt: new Date() },
    });
    const rawKey = `pe_live_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    await session.admin.apiKey.create({
      data: {
        tenantId,
        keyHash,
        keyPrefix: rawKey.slice(0, 12),
        name: 'ctx-scoped',
        scopes: ['audit:read'],
        isActive: true,
      },
    });

    // The auth middleware wraps the handler in the key's tenant; simulate that
    // here to prove validation inside tenant context also works.
    const validation = await runWithTenantAsync(tenantId, () => validateApiKey(rawKey));
    expect(validation && !('error' in validation) ? validation.tenantId : null).toBe(tenantId);
    expect(
      validation && !('error' in validation) ? validation.scopes.includes('audit:read') : false
    ).toBe(true);
  });
});
