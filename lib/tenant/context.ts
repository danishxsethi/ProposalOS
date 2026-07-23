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
 * Extended Prisma Client with Automatic Tenant Scoping (RLS Enforced)
 * Rather than just rewriting where clauses, this securely sets session variables
 * for PostgreSQL Row-Level Security policies.
 */
export function createScopedPrisma(tenantId: string | undefined) {
    if (!tenantId) {
        // If system-level bypass is needed (e.g. cron jobs), enable bypass
        return prisma.$extends({
            query: {
                $allModels: {
                    async $allOperations({ args, query }) {
                        const [, result] = await prisma.$transaction([
                            prisma.$executeRaw`SET LOCAL app.bypass_rls = 'on'`,
                            query(args),
                        ]);
                        return result;
                    },
                },
            },
        }) as unknown as typeof prisma;
    }

    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ args, query }) {
                    // Start a transaction that sets the session variable first, then runs the query
                    // This physically restricts Postgres rows matching the RLS policies
                    const [, result] = await prisma.$transaction([
                        prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`),
                        query(args),
                    ]);
                    return result;
                },
            },
        }
    }) as unknown as typeof prisma;
}
