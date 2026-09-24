import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), auth: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';

describe('trusted tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({ get: (name: string) => name === 'x-tenant-id' ? 'attacker-tenant' : null });
    mocks.auth.mockResolvedValue(null);
  });

  it('ignores an unauthenticated x-tenant-id header', async () => {
    await expect(getTenantId()).resolves.toBeNull();
  });

  it('returns a tenant only from an already trusted server context', async () => {
    await runWithTenantAsync('trusted-tenant', async () => {
      await expect(getTenantId()).resolves.toBe('trusted-tenant');
    });
  });
});
