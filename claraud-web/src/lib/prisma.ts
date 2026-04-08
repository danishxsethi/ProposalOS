import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

const tenantStorage = new AsyncLocalStorage<{ tenantId: string }>();

export async function setTenantContext<T>(
    tenantId: string,
    fn: () => Promise<T>
): Promise<T> {
    return tenantStorage.run({ tenantId }, fn);
}

export function getCurrentTenantId(): string | null {
    return tenantStorage.getStore()?.tenantId ?? null;
}

const prismaClientSingleton = () => {
    const client = new PrismaClient();

    return client.$extends({
        query: {
            $allModels: {
                async $allOperations({ args, query }) {
                    const tenantId = tenantStorage.getStore()?.tenantId;
                    if (tenantId) {
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
