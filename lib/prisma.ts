import { PrismaClient } from '@prisma/client';

import { getTenantIdFromStore } from '@/lib/tenant/context';

// ─── Prisma Singleton with RLS Middleware ────────────────────────────────────
//
// P0-A Fix: The old prisma.ts maintained its OWN AsyncLocalStorage<{ tenantId: string }>
// which was never populated by withAuth() (which sets lib/tenant/context.ts store instead).
// This caused SET LOCAL app.current_tenant_id to never execute — silently bypassing RLS.
//
// Fix: Read tenant ID from the canonical lib/tenant/context.ts store via getTenantIdFromStore().
// Flow after fix:
//   withAuth() → runWithTenantAsync(tenantId, handler) → sets context.ts tenantStorage
//   any Prisma query → $extends reads via getTenantIdFromStore() → SET LOCAL executed → RLS enforced ✅
//
// NOTE: setTenantContext() and getCurrentTenantId() have been removed from this file.
// The canonical equivalents are runWithTenantAsync() and getTenantIdFromStore() in lib/tenant/context.ts.

const prismaClientSingleton = () => {
  const client = new PrismaClient();

  // $extends query middleware: inject SET app.current_tenant_id before every query
  // when a tenant context is active. This ensures the PostgreSQL RLS policy
  // `current_setting('app.current_tenant_id', true)` receives the correct value.
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const tenantId = getTenantIdFromStore();
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
