
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

// ─── Tenant Context Store ─────────────────────────────────────────────────────
// Holds the current tenantId for the duration of an async request.
// SET by API middleware / server actions via setTenantContext().
// READ by the Prisma $extends middleware to inject RLS session variable.

const tenantStorage = new AsyncLocalStorage<{ tenantId: string }>();

/**
 * Sets the PostgreSQL session variable `app.current_tenant_id` for the
 * duration of the async context. Call this at the top of every API route
 * handler or server action that should be tenant-scoped.
 *
 * @example
 *   await setTenantContext(tenantId, async () => {
 *     const audits = await prisma.audit.findMany();  // automatically RLS-filtered
 *   });
 */
export async function setTenantContext<T>(
    tenantId: string,
    fn: () => Promise<T>
): Promise<T> {
    return tenantStorage.run({ tenantId }, fn);
}

/**
 * Returns the current tenantId from AsyncLocalStorage, or null if not set.
 */
export function getCurrentTenantId(): string | null {
    return tenantStorage.getStore()?.tenantId ?? null;
}

// ─── Prisma Singleton with RLS Middleware ────────────────────────────────────

const prismaClientSingleton = () => {
    const client = new PrismaClient();

    // $extends query middleware: inject SET app.current_tenant_id before every query
    // when a tenant context is active. This ensures the PostgreSQL RLS policy
    // `current_setting('app.current_tenant_id', true)` receives the correct value.
    return client.$extends({
        query: {
            $allModels: {
                async $allOperations({ args, query }) {
                    const tenantId = tenantStorage.getStore()?.tenantId;
                    if (tenantId) {
                        // Use an interactive transaction to set the session variable
                        // before the actual query executes in the same connection.
                        return client.$transaction(async (tx) => {
                            await tx.$executeRawUnsafe(
                                `SET LOCAL app.current_tenant_id = '${tenantId.replace(/'/g, "''")}'`
                            );
                            return query(args);
                        });
                    }
                    return query(args);
                },
            },
        },
    });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
