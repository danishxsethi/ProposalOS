import { AsyncLocalStorage } from 'async_hooks';

import { headers } from 'next/headers';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import type { Prisma } from '@prisma/client';

export interface TenantRuntimeContext {
  tenantId: string | null;
  bypassRls: boolean;
  currentTx: Prisma.TransactionClient | null;
}

type Awaitable<T> = T | PromiseLike<T>;

const tenantStorage = new AsyncLocalStorage<TenantRuntimeContext>();

function getDefaultTenantRuntimeContext(): TenantRuntimeContext {
  return {
    tenantId: null,
    bypassRls: false,
    currentTx: null,
  };
}

function withTenantRuntimeContext<T>(overrides: Partial<TenantRuntimeContext>, fn: () => T): T {
  const current = tenantStorage.getStore() ?? getDefaultTenantRuntimeContext();
  return tenantStorage.run({ ...current, ...overrides }, fn);
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

/**
 * Post-query tenant verification — used in findUnique handlers where we
 * cannot inject tenantId into the WHERE clause (findUnique requires unique fields only).
 *
 * If the returned record belongs to a different tenant, we block access and return null
 * instead of exposing cross-tenant data.
 */
function verifyTenant(result: any, tenantId: string): any {
  if (result && result.tenantId && result.tenantId !== tenantId) {
    console.error(
      `[TENANT VIOLATION] findUnique returned record for tenant "${result.tenantId}", expected "${tenantId}". Access blocked.`
    );
    return null; // Block cross-tenant access
  }
  return result;
}

/**
 * Extended Prisma Client with Automatic Tenant Scoping
 *
 * P1-4 Fix: findUnique handlers now use post-query tenant verification.
 *   Previously they passed query(args) unmodified — any tenant's record could be returned.
 *
 * P1-5 Fix: Added 7 missing tenant-scoped models:
 *   proposalFollowUp, contactRequest, prospectEnrichmentRun,
 *   outreachSendingDomain, outreachDomainDailyStat, tenantBranding, invitation
 *
 * @deprecated Phase 2.3 repairs tenant scoping in lib/prisma.ts. Keep this
 * helper only for compatibility during the Phase 2.6 cleanup pass.
 */
export function createScopedPrisma(tenantId: string | undefined) {
  if (!tenantId) return prisma; // Return unscoped if no tenant (e.g. admin or system tasks)

  return prisma.$extends({
    query: {
      // ─── Existing models (P1-4: findUnique hardened) ─────────────────────────
      audit: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          // P1-4: Post-query tenant verification (cannot inject tenantId into findUnique where)
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...(args.data as Record<string, unknown>), tenantId } as typeof args.data;
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      finding: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      proposal: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      evidenceSnapshot: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      prospectLead: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      prospectDiscoveryJob: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      outreachEmail: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      outreachEmailEvent: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      auditSchedule: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      apiKey: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },

      // ─── P1-5: Previously missing tenant-scoped models ───────────────────────
      proposalFollowUp: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      contactRequest: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      prospectEnrichmentRun: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      outreachSendingDomain: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      outreachDomainDailyStat: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      tenantBranding: {
        // tenantId @unique — one branding record per tenant
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      invitation: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },

      // ─── Newly tenant-scoped models (from audit fix) ─────────────────────
      proposalAcceptance: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      proposalView: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      auditTarget: {
        async findMany({ args, query }: any) {
          // Allow system-wide targets (tenantId IS NULL)
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          if (result && result.tenantId && result.tenantId !== tenantId) {
            return null;
          }
          return result;
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
      },
      outreachTemplatePerformance: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      proposalOutreach: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      followUpEmailSend: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      failedWebhookEvent: {
        async findMany({ args, query }: any) {
          // Allow system-level webhooks (tenantId IS NULL)
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          if (result && result.tenantId && result.tenantId !== tenantId) {
            return null;
          }
          return result;
        },
        async create({ args, query }: any) {
          // tenantId is optional for system webhooks
          if (tenantId) {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId: { in: [tenantId, null] } };
          return query(args);
        },
      },
      cartAbandonmentEvent: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
      partnerDeliveredLead: {
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          const result = await query(args);
          return verifyTenant(result, tenantId);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
    },
  });
}
