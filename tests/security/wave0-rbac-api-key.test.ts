// @vitest-environment node
/**
 * Wave 0 — P0-19 API-key RBAC + scope allowlist regression tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateApiKey: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/lib/auth/apiKeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/apiKeys')>();
  return {
    ...actual,
    validateApiKey: mocks.validateApiKey,
  };
});

vi.mock('@/lib/auth', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  apiKeySatisfiesPermission,
  apiKeySatisfiesRole,
  effectiveRoleFromScopes,
  withPermission,
  withRole,
} from '@/lib/auth/rbac';
import { sanitizeApiKeyScopes } from '@/lib/auth/apiKeys';

describe('P0-19: API-key RBAC (withRole / withPermission)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    delete process.env.API_KEY;
  });

  it('maps audit scopes to agency_member, not super_admin', () => {
    expect(effectiveRoleFromScopes(['audit:create'])).toBe('agency_member');
    expect(effectiveRoleFromScopes(['audit:*'])).toBe('agency_member');
    expect(effectiveRoleFromScopes(['*'])).toBe('agency_admin');
    expect(apiKeySatisfiesRole(['audit:create'], 'super_admin')).toBe(false);
    expect(apiKeySatisfiesRole(['*'], 'super_admin')).toBe(false);
    expect(apiKeySatisfiesRole(['audit:create'], 'agency_member')).toBe(true);
    expect(apiKeySatisfiesRole(['audit:create'], 'agency_admin')).toBe(false);
  });

  it('rejects pe_live_ key with audit:create on withRole(super_admin)', async () => {
    mocks.validateApiKey.mockResolvedValue({
      tenantId: 't1',
      scopes: ['audit:create'],
      planTier: 'pro',
      keyId: 'k1',
      keyName: 'routine',
    });

    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withRole('super_admin', handler);
    const res = await wrapped(
      new Request('http://localhost/api/admin/feature-flags', {
        headers: { Authorization: 'Bearer pe_live_testdummykey000000000000000000' },
      })
    );

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects pe_live_ key with * on withRole(super_admin)', async () => {
    mocks.validateApiKey.mockResolvedValue({
      tenantId: 't1',
      scopes: ['*'],
      planTier: 'pro',
      keyId: 'k1',
      keyName: 'full',
    });

    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withRole('super_admin', handler);
    const res = await wrapped(
      new Request('http://localhost/api/admin/feature-flags', {
        headers: { 'x-api-key': 'pe_live_testdummykey000000000000000000' },
      })
    );

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows pe_live_ key with audit:create on withRole(agency_member)', async () => {
    mocks.validateApiKey.mockResolvedValue({
      tenantId: 't1',
      scopes: ['audit:create'],
      planTier: 'pro',
      keyId: 'k1',
      keyName: 'routine',
    });

    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withRole('agency_member', handler);
    const res = await wrapped(
      new Request('http://localhost/api/audit', {
        headers: { Authorization: 'Bearer pe_live_testdummykey000000000000000000' },
      })
    );

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('withPermission does not treat audit:create as manage_api_keys', async () => {
    mocks.validateApiKey.mockResolvedValue({
      tenantId: 't1',
      scopes: ['audit:create'],
      planTier: 'pro',
      keyId: 'k1',
      keyName: 'routine',
    });

    expect(apiKeySatisfiesPermission(['audit:create'], 'manage_api_keys')).toBe(false);

    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withPermission('manage_api_keys', handler);
    const res = await wrapped(
      new Request('http://localhost/api/settings/api-keys', {
        headers: { Authorization: 'Bearer pe_live_testdummykey000000000000000000' },
      })
    );

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not use the fixed unrelated scope trio for withRole', async () => {
    // Previously: scopes includes('*') || 'audit:create' || 'audit:*' opened ANY withRole.
    mocks.validateApiKey.mockResolvedValue({
      tenantId: 't1',
      scopes: ['audit:*'],
      planTier: 'pro',
      keyId: 'k1',
      keyName: 'audit-all',
    });

    const handler = vi.fn(async () => new Response('ok'));
    const res = await withRole(
      'agency_admin',
      handler
    )(
      new Request('http://localhost/api/team/invite', {
        headers: { Authorization: 'Bearer pe_live_testdummykey000000000000000000' },
      })
    );

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('P0-19: API key scope allowlist at creation', () => {
  it('accepts known scopes and defaults when null', () => {
    expect(sanitizeApiKeyScopes(null)).toEqual({ scopes: ['audit:read'] });
    expect(sanitizeApiKeyScopes(['audit:create', 'proposal:read'])).toEqual({
      scopes: ['audit:create', 'proposal:read'],
    });
  });

  it('rejects client-invented scopes fail-closed', () => {
    expect(sanitizeApiKeyScopes(['super_admin'])).toEqual({
      error: 'unknown or disallowed scope: super_admin',
    });
    expect(sanitizeApiKeyScopes(['admin:all'])).toEqual({
      error: 'unknown or disallowed scope: admin:all',
    });
    expect(sanitizeApiKeyScopes([])).toEqual({ error: 'scopes must not be empty' });
    expect(sanitizeApiKeyScopes('audit:read' as unknown)).toEqual({
      error: 'scopes must be an array of strings',
    });
  });
});
