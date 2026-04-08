import { AsyncLocalStorage } from 'async_hooks';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

const tenantStorage = new AsyncLocalStorage<string>();

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
    return tenantStorage.run(tenantId, fn);
}

export async function runWithTenantAsync<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return tenantStorage.run(tenantId, fn);
}

/**
 * Synchronous accessor for the tenant ID stored in AsyncLocalStorage.
 * Used by lib/prisma.ts RLS middleware to inject SET LOCAL app.current_tenant_id
 * before every Prisma query. Must stay sync (no await) to be safe inside the
 * Prisma $extends query hook.
 */
export function getTenantIdFromStore(): string | null {
    return tenantStorage.getStore() ?? null;
}

export async function getTenantId(): Promise<string | null> {
    // 1. Check context set by API Key middleware (avoids Request clone issues)
    const stored = tenantStorage.getStore();
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
    } catch (err) {
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
        }
    });
}
