// @vitest-environment node
/**
 * Wave 0 — env API_KEY must not inherit tenant from caller-controlled header.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateApiKey: vi.fn(),
  runWithTenantAsync: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/apiKeys', () => ({ validateApiKey: mocks.validateApiKey }));
vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: mocks.runWithTenantAsync,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { withAuth } from '@/lib/middleware/auth';

describe('env API_KEY tenant binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.runWithTenantAsync.mockImplementation((_t: string, fn: () => unknown) => fn());
    process.env.API_KEY = 'server-env-secret-key';
    process.env.DEFAULT_TENANT_ID = '44444444-4444-4444-8444-444444444444';
  });

  it('binds to DEFAULT_TENANT_ID and ignores x-tenant-id', async () => {
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withAuth(handler);
    const res = await wrapped(
      new Request('http://localhost/api/audits', {
        headers: {
          Authorization: 'Bearer server-env-secret-key',
          'x-tenant-id': 'attacker-chosen-tenant-id',
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      expect.any(Function)
    );
  });

  it('rejects env key when DEFAULT_TENANT_ID is unset', async () => {
    delete process.env.DEFAULT_TENANT_ID;
    const handler = vi.fn(async () => new Response('ok'));
    const res = await withAuth(handler)(
      new Request('http://localhost/api/audits', {
        headers: {
          Authorization: 'Bearer server-env-secret-key',
          'x-tenant-id': 'attacker-chosen-tenant-id',
        },
      })
    );
    expect(res.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
});
