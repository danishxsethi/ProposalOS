import { AsyncLocalStorage } from 'async_hooks';

import { headers } from 'next/headers';

import { logger } from '@/lib/logger';

import type { Prisma } from '@prisma/client';

export interface TenantRuntimeContext {
  tenantId: string | null;
  bypassRls: boolean;
  currentTx: Prisma.TransactionClient | null;
  isDispatching?: boolean;
}

type Awaitable<T> = T | PromiseLike<T>;

const globalForTenantStorage = globalThis as unknown as {
  tenantStorage: AsyncLocalStorage<TenantRuntimeContext> | undefined;
};

const tenantStorage =
  globalForTenantStorage.tenantStorage ?? new AsyncLocalStorage<TenantRuntimeContext>();

if (process.env.NODE_ENV !== 'production') {
  globalForTenantStorage.tenantStorage = tenantStorage;
}

function getDefaultTenantRuntimeContext(): TenantRuntimeContext {
  return {
    tenantId: null,
    bypassRls: false,
    currentTx: null,
    isDispatching: false,
  };
}

export function withTenantRuntimeContext<T>(
  overrides: Partial<TenantRuntimeContext>,
  fn: () => T
): T {
  const current = tenantStorage.getStore() ?? getDefaultTenantRuntimeContext();
  return tenantStorage.run({ ...current, ...overrides }, fn);
}

export function runWithDispatch<T>(fn: () => T): T {
  return withTenantRuntimeContext({ isDispatching: true }, fn);
}

function assertBypassReason(reason: unknown): string {
  if (typeof reason !== 'string') {
    throw new Error('runWithTenantBypass requires a non-empty reason');
  }

  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    throw new Error('runWithTenantBypass requires a non-empty reason');
  }

  return normalizedReason;
}

function getBypassCaller(): string | null {
  const stackLines = new Error().stack
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    stackLines?.find(
      (line) =>
        !line.includes('runWithTenantBypass') &&
        !line.includes('getBypassCaller') &&
        !line.includes('lib/tenant/context')
    ) ?? null
  );
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return withTenantRuntimeContext({ tenantId, bypassRls: false }, fn);
}

export async function runWithTenantAsync<T>(
  tenantId: string,
  fn: () => Awaitable<T>
): Promise<Awaited<T>> {
  return withTenantRuntimeContext(
    { tenantId, bypassRls: false },
    async () => await fn()
  ) as Promise<Awaited<T>>;
}

export async function runWithTenantBypass<T>(
  reason: string,
  fn: () => Awaitable<T>
): Promise<Awaited<T>> {
  const normalizedReason = assertBypassReason(reason);

  logger.warn(
    {
      event: 'rls_bypass',
      reason: normalizedReason,
      caller: getBypassCaller(),
      timestamp: new Date().toISOString(),
    },
    'RLS bypass invoked'
  );

  return withTenantRuntimeContext({ bypassRls: true }, async () => await fn()) as Promise<
    Awaited<T>
  >;
}

export async function runWithPrismaTransactionContext<T>(
  tx: Prisma.TransactionClient,
  fn: () => Awaitable<T>
): Promise<Awaited<T>> {
  return withTenantRuntimeContext({ currentTx: tx }, async () => await fn()) as Promise<Awaited<T>>;
}

/**
 * Synchronous accessor for the tenant ID stored in AsyncLocalStorage.
 * Used by lib/prisma.ts RLS middleware to inject SET LOCAL app.current_tenant_id
 * before every Prisma query. Must stay sync (no await) to be safe inside the
 * Prisma $extends query hook.
 */
export function getTenantIdFromStore(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}

export function getTenantRuntimeContextFromStore(): TenantRuntimeContext {
  return tenantStorage.getStore() ?? getDefaultTenantRuntimeContext();
}

export async function getTenantId(): Promise<string | null> {
  // 1. Check context set by API Key middleware (avoids Request clone issues)
  const stored = tenantStorage.getStore()?.tenantId;
  if (stored) return stored;

  const headerList = await headers();
  const apiKeyTenant = headerList.get('x-tenant-id');
  if (apiKeyTenant) return apiKeyTenant;

  // 2. Check Session (Dynamic import to break circular dependency with lib/prisma)
  try {
    const { auth } = await import('@/lib/auth');
    const session = await auth();
    if (session?.user && 'tenantId' in session.user) {
      return (session.user as unknown as { tenantId: string }).tenantId;
    }
  } catch {
    // Ignore auth import errors during build
  }

  return null;
}
