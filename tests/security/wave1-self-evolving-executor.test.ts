/**
 * P2-18 regression tests: self-evolving-prompts raw executor must fail closed by
 * default — omitting `requireTenant` must never let a tenant-owned raw query run
 * unscoped.
 */
import { describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockGetContext } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
    $queryRaw: vi.fn(async () => [{ ok: 1 }]),
  },
  mockGetContext: vi.fn(),
}));

const mockTx = {
  $queryRaw: vi.fn(async (_sql: unknown, ...vals: unknown[]) => {
    void vals;
    return [{ ok: 1 }];
  }),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/tenant/context', () => ({
  getTenantRuntimeContextFromStore: mockGetContext,
  runWithPrismaTransactionContext: async (_tx: unknown, fn: () => Promise<unknown>) => fn(),
}));

import { executeQuery } from '@/lib/self-evolving-prompts/db';

describe('P2-18: self-evolving executor fails closed by default', () => {
  it('throws when requireTenant is omitted and no tenant context/bypass is present', async () => {
    mockGetContext.mockReturnValue({ tenantId: null, bypassRls: false, currentTx: null });

    await expect(executeQuery('SELECT 1', [])).rejects.toThrow(/Tenant context required/);
  });

  it('succeeds when requireTenant is omitted but a real tenant context is present', async () => {
    mockGetContext.mockReturnValue({
      tenantId: '11111111-1111-4111-8111-111111111111',
      bypassRls: false,
      currentTx: null,
    });

    await expect(executeQuery('SELECT 1', [])).resolves.toEqual([{ ok: 1 }]);
  });

  it('runs unscoped only when the caller explicitly passes requireTenant: false', async () => {
    mockGetContext.mockReturnValue({ tenantId: null, bypassRls: false, currentTx: null });

    await expect(executeQuery('SELECT 1', [], { requireTenant: false })).resolves.toBeDefined();
  });

  it('an explicit bypass (bypassRls) still works with the default', async () => {
    mockGetContext.mockReturnValue({ tenantId: null, bypassRls: true, currentTx: null });

    await expect(executeQuery('SELECT 1', [])).resolves.toBeDefined();
  });
});
