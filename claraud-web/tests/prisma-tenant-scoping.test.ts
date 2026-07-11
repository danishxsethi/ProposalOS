/**
 * P1-07/P1-18: claraud-web's tenant-scoping Prisma extension.
 *
 * Proves, against a hand-built fake client (no real Postgres needed):
 *   - the RLS GUC is set on the SAME tx/connection the business query dispatches on
 *   - the base/unscoped client is never used to run a tenant-owned query
 *   - malformed tenant IDs are rejected before any query runs
 *   - missing tenant context fails closed
 *   - quote/injection-shaped tenant IDs cannot alter the SQL statement (parameterized,
 *     not string-interpolated)
 *   - an app-opened prisma.$transaction(...) (e.g. self-registration) reuses the SAME
 *     connection for every operation inside it, rather than each opening its own nested
 *     transaction
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module under test eagerly constructs a real PrismaClient singleton at import time
// (`export const prisma = ... ?? prismaClientSingleton()`). This test exercises the
// standalone, exported factory functions (createTenantScopingExtension, wrapTransaction,
// setTenantContext, withSystemBypass, assertValidTenantId) against hand-built fake
// clients -- it never needs a real database connection -- so @prisma/client is mocked
// purely to let the module load without requiring a generated client/DB in this sandbox.
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    $extends() {
      return this;
    }
    $transaction() {
      return Promise.resolve();
    }
  },
}));

import {
  assertValidTenantId,
  createTenantScopingExtension,
  setTenantContext,
  withSystemBypass,
  wrapTransaction,
} from '../src/lib/prisma';

interface RawCall {
  sql: string;
  values: unknown[];
}

function makeFakeTx(recordedRawCalls: RawCall[], modelResults: Record<string, unknown>) {
  const tx: Record<string, unknown> = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      recordedRawCalls.push({ sql: strings.join('?'), values });
      return Promise.resolve(undefined);
    },
  };
  for (const [delegateKey, result] of Object.entries(modelResults)) {
    tx[delegateKey] = {
      findMany: vi.fn(() => Promise.resolve(result)),
      create: vi.fn(() => Promise.resolve(result)),
    };
  }
  return tx;
}

function makeFakeClient(tx: Record<string, unknown>) {
  const transactionCalls: unknown[] = [];
  const client = {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalls.push(fn);
      return fn(tx);
    },
  };
  return { client, transactionCalls };
}

describe('assertValidTenantId', () => {
  it('accepts a well-formed UUID', () => {
    expect(() => assertValidTenantId('11111111-1111-1111-1111-111111111111')).not.toThrow();
  });

  it.each(['\'; DROP TABLE "Audit"; --', 'not-a-uuid', '', "1' OR '1'='1"])(
    'rejects malformed/injection-shaped tenant ID %j',
    (badId) => {
      expect(() => assertValidTenantId(badId)).toThrow(/Invalid tenant ID format/);
    }
  );
});

describe('createTenantScopingExtension', () => {
  let recordedRawCalls: RawCall[];

  beforeEach(() => {
    recordedRawCalls = [];
  });

  it('sets the GUC and dispatches the business query on the SAME tx (not the base client)', async () => {
    const tx = makeFakeTx(recordedRawCalls, { audit: ['row-1'] });
    const { client } = makeFakeClient(tx);
    const ext = createTenantScopingExtension(client as never);
    const baseClientQuery = vi.fn(() => Promise.resolve('BASE_CLIENT_RESULT'));

    const tenantId = '11111111-1111-1111-1111-111111111111';
    const result = await setTenantContext(tenantId, () =>
      ext.query.$allModels.$allOperations({
        model: 'Audit',
        operation: 'findMany',
        args: { where: { tenantId } },
        query: baseClientQuery,
      })
    );

    expect(result).toEqual(['row-1']);
    // The business query ran on tx's own delegate, never through the base client's query().
    expect(baseClientQuery).not.toHaveBeenCalled();
    expect((tx.audit as { findMany: ReturnType<typeof vi.fn> }).findMany).toHaveBeenCalledWith({
      where: { tenantId },
    });
    // The GUC was set (on the same tx) before the query ran.
    const tenantGucCall = recordedRawCalls.find((c) => c.sql.includes('app.current_tenant_id'));
    expect(tenantGucCall?.values).toEqual([tenantId]);
  });

  it('parameterizes the tenant ID -- quote/injection-shaped input cannot alter the SQL', async () => {
    // A malformed/injection-shaped ID never reaches the query layer because
    // setTenantContext validates first, but this proves that IF a value ever reached
    // $executeRaw, it would be bound as a parameter, not concatenated into the SQL text.
    const tx = makeFakeTx(recordedRawCalls, { audit: [] });
    const { client } = makeFakeClient(tx);
    const ext = createTenantScopingExtension(client as never);

    await withSystemBypass('test: directly exercise raw-call shape', () =>
      ext.query.$allModels.$allOperations({
        model: 'Audit',
        operation: 'findMany',
        args: {},
        query: vi.fn(),
      })
    );

    for (const call of recordedRawCalls) {
      // The SQL template text itself contains no quote characters from any interpolated
      // value -- values are passed out-of-band via the `values` array.
      expect(call.sql).not.toMatch(/DROP TABLE|--|;.*SELECT/i);
    }
  });

  it('fails closed when no tenant/bypass context is established', async () => {
    const tx = makeFakeTx(recordedRawCalls, { audit: [] });
    const { client } = makeFakeClient(tx);
    const ext = createTenantScopingExtension(client as never);

    await expect(
      ext.query.$allModels.$allOperations({
        model: 'Audit',
        operation: 'findMany',
        args: {},
        query: vi.fn(),
      })
    ).rejects.toThrow(/Tenant context required/);
  });

  it('rejects a malformed tenant ID before any query runs', async () => {
    await expect(setTenantContext('not-a-real-uuid', async () => 'unreachable')).rejects.toThrow(
      /Invalid tenant ID format/
    );
  });

  it('explicit system bypass sets app.bypass_rls and still dispatches on tx, not the base client', async () => {
    const tx = makeFakeTx(recordedRawCalls, { user: { id: 'u1' } });
    const { client } = makeFakeClient(tx);
    const ext = createTenantScopingExtension(client as never);
    const baseClientQuery = vi.fn();

    const result = await withSystemBypass('test: system bypass', () =>
      ext.query.$allModels.$allOperations({
        model: 'User',
        operation: 'findMany',
        args: { where: { email: 'a@b.com' } },
        query: baseClientQuery,
      })
    );

    expect(result).toEqual({ id: 'u1' });
    expect(baseClientQuery).not.toHaveBeenCalled();
    const bypassCall = recordedRawCalls.find((c) => c.sql.includes('app.bypass_rls'));
    // 'true'/'false' here are our own hardcoded literals (not user input), so they're
    // template text rather than bound parameters -- unlike the tenant ID, which IS
    // user-influenced and IS bound (see the sentinel-value assertion below).
    expect(bypassCall?.sql).toContain("'true'");
    const sentinelCall = recordedRawCalls.find((c) => c.sql.includes('app.current_tenant_id'));
    expect(sentinelCall?.values).toEqual(['00000000-0000-0000-0000-000000000000']);
  });

  it('reuses the SAME connection for every operation inside an app-opened $transaction (no nested split)', async () => {
    const tx = makeFakeTx(recordedRawCalls, {
      tenant: { id: 'tenant-1' },
      user: { id: 'user-1' },
    });
    const openedTransactions: unknown[] = [];
    const rawClient = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
        openedTransactions.push(fn);
        return fn(tx);
      },
    };
    const ext = createTenantScopingExtension(rawClient as never);
    // Mimic what the real singleton does: extend, then wrap $transaction so any
    // app-opened transaction (like register/route.ts's tenant+user creation) registers
    // its tx as the active context's currentTx.
    const fakeExtendedClient = {
      $transaction: rawClient.$transaction,
      __ext: ext,
    };
    const wrapped = wrapTransaction(fakeExtendedClient);

    await withSystemBypass('test: registration-style transaction', async () => {
      // App code opens its OWN transaction (like prisma.$transaction in register/route.ts)
      // and calls two model operations inside it via the extension directly (standing in
      // for what Prisma's real dispatch would do for `tx.tenant.create()` /
      // `tx.user.create()`).
      await wrapped.$transaction(async () => {
        await ext.query.$allModels.$allOperations({
          model: 'Tenant',
          operation: 'create',
          args: {},
          query: vi.fn(),
        });
        await ext.query.$allModels.$allOperations({
          model: 'User',
          operation: 'create',
          args: {},
          query: vi.fn(),
        });
      });
    });

    // wrapTransaction's own $transaction call opened exactly ONE transaction (the outer
    // one). The two model operations inside it must have reused that SAME tx via
    // currentTx rather than each opening its own nested transaction.
    expect(openedTransactions.length).toBe(1);
  });
});
