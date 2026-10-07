/**
 * P1-06 regression tests: fail-fast detection of an unsafe (superuser/BYPASSRLS)
 * database role in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertSafeDbRole } from '@/lib/config/dbRoleGuard';

function mockClient(row: { rolname: string; rolsuper: boolean; rolbypassrls: boolean }) {
  return { $queryRaw: vi.fn(async () => [row]) };
}

describe('P1-06: assertSafeDbRole', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('reports safe for a restricted, non-superuser, non-bypassrls role', async () => {
    const client = mockClient({ rolname: 'app_user', rolsuper: false, rolbypassrls: false });
    const result = await assertSafeDbRole(client);
    expect(result.safe).toBe(true);
  });

  it('throws in production when the role is superuser', async () => {
    (process.env as any).NODE_ENV = 'production';
    const client = mockClient({ rolname: 'postgres', rolsuper: true, rolbypassrls: false });
    await expect(assertSafeDbRole(client)).rejects.toThrow(/unsafe database role in production/);
  });

  it('throws in production when the role has BYPASSRLS', async () => {
    (process.env as any).NODE_ENV = 'production';
    const client = mockClient({ rolname: 'admin_svc', rolsuper: false, rolbypassrls: true });
    await expect(assertSafeDbRole(client)).rejects.toThrow(/unsafe database role in production/);
  });

  it('warns but does not throw outside production for an unsafe role', async () => {
    (process.env as any).NODE_ENV = 'development';
    const client = mockClient({ rolname: 'postgres', rolsuper: true, rolbypassrls: false });
    const result = await assertSafeDbRole(client);
    expect(result.safe).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('never includes a connection string/credential in its output', async () => {
    (process.env as any).NODE_ENV = 'production';
    const client = mockClient({ rolname: 'postgres', rolsuper: true, rolbypassrls: false });
    try {
      await assertSafeDbRole(client);
    } catch (e) {
      expect(String(e)).not.toMatch(/postgres:\/\//);
    }
  });
});
