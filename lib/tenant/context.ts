import { AsyncLocalStorage } from 'async_hooks';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const tenantStorage = new AsyncLocalStorage<string>();

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
    return tenantStorage.run(tenantId, fn);
}

export async function runWithTenantAsync<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return tenantStorage.run(tenantId, fn);
}

export async function getTenantId(): Promise<string | null> {
    // 1. Check context set by API Key middleware (avoids Request clone issues)
    const stored = tenantStorage.getStore();
    if (stored) return stored;

    const headerList = await headers();
    const apiKeyTenant = headerList.get('x-tenant-id');
    if (apiKeyTenant) return apiKeyTenant;

    // 2. Check Session
    const session = await auth();
    if (session?.user && 'tenantId' in session.user) {
        return (session.user as any).tenantId;
    }

    return null;
}


/**
 * Extended Prisma Client with Automatic Tenant Scoping
 */
export function createScopedPrisma(tenantId: string | undefined) {
    if (!tenantId) return prisma; // Return unscoped if no tenant (e.g. admin or system tasks)

    return prisma.$extends({
        query: {
            audit: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findFirst({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findUnique({ args, query }) {
                    // Note: findUnique usually requires ID. 
                    // Technically we can't inject where clause cleanly into findUnique unless we change to findFirst
                    // But for security, we should ideally verify result.tenantId === tenantId after fetch
                    // Or transform to findFirst({ where: { id: ..., tenantId } })

                    // Transformation:
                    if (args.where.id) {
                        return (prisma as any).audit.findFirst({
                            where: { ...args.where, tenantId }
                        });
                    }
                    return query(args);
                },
                async create({ args, query }) {
                    args.data = { ...(args.data as any), tenantId };
                    return query(args);
                }
            },
            // We can extend for other models too: Finding, Proposal, etc.
            finding: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async create({ args, query }) {
                    args.data = { ...(args.data as any), tenantId }; // Auto-set tenantId
                    return query(args);
                }
            },
            proposal: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async create({ args, query }) {
                    args.data = { ...(args.data as any), tenantId };
                    return query(args);
                }
            }
        }
    });
}
