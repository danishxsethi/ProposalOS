import { AsyncLocalStorage } from 'async_hooks';

import { PrismaClient } from '@prisma/client';

/**
 * P1-07/P1-18 baseline: tenant scoping is enforced two ways, and BOTH must hold for every
 * tenant-owned query:
 *   1. Every route filters `where: { tenantId }` explicitly (defense in depth, unchanged).
 *   2. This client sets the Postgres RLS GUC `app.current_tenant_id` via `SET LOCAL` inside
 *      a transaction, and the real query MUST run on that same transaction/connection --
 *      otherwise RLS never actually sees the tenant and (1) is the only protection left.
 *
 * Previously (2) was broken three ways, all fixed here:
 *   - The GUC was set on `tx` but the real query ran via `query(args)`, which executes on
 *     the base (pooled) client -- a different connection -- so the GUC was never visible
 *     to the actual query.
 *   - The GUC value was built via `$executeRawUnsafe` string interpolation (manual quote
 *     escaping only).
 *   - Nothing in the app ever called `setTenantContext()`, so the GUC-setting branch never
 *     ran at all in production; every route relied solely on (1).
 *
 * The bypass path mirrors the root app's established convention (lib/prisma.ts,
 * lib/db.ts::withSystemDbBypass): it sets `app.bypass_rls = 'true'` on the same tx the
 * dispatched query runs on, rather than silently running on the base client.
 *
 * If application code opens its own `prisma.$transaction(async (tx) => {...})` (e.g.
 * self-registration's atomic tenant+user creation), `wrapTransaction` below registers that
 * `tx` as the active context's `currentTx` so every model op dispatched inside reuses the
 * SAME connection instead of each opening its own nested transaction.
 */

type BaseContext = { tenantId: string } | { systemBypass: true; reason: string };
type StoredContext = BaseContext & { currentTx?: RawCapableClient };

const tenantStorage = new AsyncLocalStorage<StoredContext>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYPASS_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';

export function assertValidTenantId(tenantId: string): void {
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
    throw new Error(`Invalid tenant ID format: refusing to scope a query to "${tenantId}"`);
  }
}

/**
 * Run `fn` with every Prisma query inside it scoped (via the `app.current_tenant_id` RLS
 * GUC) to `tenantId`. Fails closed on a malformed tenant ID rather than silently running
 * unscoped.
 */
export async function setTenantContext<T>(tenantId: string, fn: () => T): Promise<T> {
  assertValidTenantId(tenantId);
  return tenantStorage.run({ tenantId }, fn);
}

/**
 * Explicit, named escape hatch for the small set of operations that must run before any
 * tenant is known or are inherently cross-tenant (self-registration's pre-tenant lookup and
 * tenant-creation transaction; API-key lookup by hash, which is how the tenant is discovered
 * in the first place; the credentials sign-in lookup by email). Every call site supplies a
 * `reason` so the bypass is auditable in the diff, not an implicit fallthrough -- mirrors the
 * root app's `withSystemDbBypass` (lib/db.ts) / `runWithAuthAdapterContext`
 * (lib/auth/adapterContext.ts).
 *
 * Do NOT reach for this for anything actually tenant-scoped -- prefer setTenantContext()
 * whenever a real tenantId is available.
 */
export async function withSystemBypass<T>(reason: string, fn: () => T): Promise<T> {
  return tenantStorage.run({ systemBypass: true, reason }, fn);
}

function toDelegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

type RawCapableClient = {
  $executeRaw: (...args: unknown[]) => Promise<unknown>;
};

type ModelDelegate = Record<string, (args: unknown) => Promise<unknown>>;

function dispatch(tx: RawCapableClient, model: string, operation: string, args: unknown) {
  const delegate = (tx as unknown as Record<string, ModelDelegate>)[toDelegateKey(model)];
  return delegate[operation](args);
}

type TransactionCapableClient = {
  $transaction: (
    fn: (tx: RawCapableClient) => Promise<unknown>,
    options?: unknown
  ) => Promise<unknown>;
};

async function setRlsGuc(tx: RawCapableClient, ctx: BaseContext): Promise<void> {
  if ('systemBypass' in ctx) {
    // Explicit bypass -- still sets an RLS GUC (app.bypass_rls) rather than silently
    // running with no GUC at all, matching the root app's tenant_bypass RLS policy
    // convention.
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${BYPASS_TENANT_SENTINEL}, true)`;
    return;
  }
  // Parameterized -- Prisma's tagged-template $executeRaw placeholders are bound as query
  // parameters, not string-interpolated, so quote/comment/injection-shaped tenantId input
  // cannot alter the statement (replaces the prior $executeRawUnsafe manual-quote-escaping).
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'false', true)`;
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`;
}

/**
 * Builds the tenant-scoping query extension. Extracted as a standalone factory (rather than
 * inlined in the singleton below) so it can be exercised in tests against a hand-built fake
 * client, without needing a real Postgres connection.
 */
export function createTenantScopingExtension(client: TransactionCapableClient) {
  return {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          const ctx = tenantStorage.getStore();

          if (!ctx) {
            // Fail closed: every call site must go through setTenantContext() or the
            // explicit withSystemBypass() escape hatch. No more silent unscoped fallthrough.
            throw new Error(
              `Tenant context required for ${model ?? 'raw'}.${operation}() -- call ` +
                `setTenantContext() or withSystemBypass() explicitly before querying.`
            );
          }

          if (!model) {
            // No top-level $queryRaw/$executeRaw call site currently runs under tenant
            // scope. If one is added, it must set the GUC itself on the same connection.
            throw new Error(
              'Tenant-scoped raw query with no model is not supported by this extension.'
            );
          }

          if (ctx.currentTx) {
            // Already inside an app-opened `prisma.$transaction(...)` (e.g. self-
            // registration's atomic tenant+user creation) -- reuse that SAME connection
            // instead of opening a nested transaction, which would silently split the
            // operations across two different connections/transactions and break the
            // atomicity the caller asked for.
            const tx = ctx.currentTx;
            await setRlsGuc(tx, ctx);
            return dispatch(tx, model, operation, args);
          }

          return client.$transaction(async (tx) => {
            await setRlsGuc(tx, ctx);
            // Run the SAME logical operation on the SAME tx/connection the GUC was just
            // set on (replaces the prior `return query(args)`, which ran on the base
            // client -- a different connection than the one carrying the SET LOCAL).
            return dispatch(tx, model, operation, args);
          });
        },
      },
    },
  };
}

/**
 * Wraps `client.$transaction` so that any interactive transaction opened by application
 * code (not just by this module's own dispatch above) registers its `tx` as the active
 * context's `currentTx` for the duration of the callback. Without this, application code
 * calling `prisma.$transaction(async (tx) => { tx.a.create(...); tx.b.create(...) })` would
 * have each of those two operations open its OWN separate nested transaction via the
 * dispatch logic above, breaking the atomicity the caller asked for.
 */
export function wrapTransaction<T>(client: T): T {
  const wrapped = client as unknown as TransactionCapableClient;
  const original = wrapped.$transaction.bind(wrapped);
  wrapped.$transaction = (fn: unknown, options?: unknown) => {
    if (typeof fn !== 'function') {
      return original(fn as never, options);
    }
    return original((tx: RawCapableClient) => {
      const current = tenantStorage.getStore();
      if (!current) {
        // No tenant/bypass context established at all -- run uncontextualized; any
        // model op dispatched inside will fail closed via $allOperations above, same
        // as calling a bare model method with no context.
        return (fn as (tx: RawCapableClient) => Promise<unknown>)(tx);
      }
      return tenantStorage.run({ ...current, currentTx: tx }, () =>
        (fn as (tx: RawCapableClient) => Promise<unknown>)(tx)
      );
    }, options);
  };
  return client;
}

const prismaClientSingleton = () => {
  const client = new PrismaClient();
  const extended = client.$extends(
    createTenantScopingExtension(client as unknown as TransactionCapableClient)
  );
  return wrapTransaction(extended);
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
