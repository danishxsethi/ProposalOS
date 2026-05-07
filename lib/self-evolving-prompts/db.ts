/**
 * Database helpers for Self-Evolving Prompts raw SQL access.
 *
 * Contract:
 * - SQL text must stay static.
 * - Values must flow through $1-style parameters.
 * - Dynamic identifiers must be allowlisted by the caller before interpolation.
 */

import { Prisma } from '@prisma/client';

import { prisma as sharedPrisma } from '@/lib/prisma';
import {
  getTenantRuntimeContextFromStore,
  runWithPrismaTransactionContext,
} from '@/lib/tenant/context';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BYPASS_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';

export const prisma = sharedPrisma;

export interface RawExecutionOptions {
  operationName?: string;
  requireTenant?: boolean;
  tenantIdOverride?: string | null;
}

function assertTenantContext(operationName: string, tenantId: string | null): string {
  if (!tenantId) {
    throw new Error(`Tenant context required for ${operationName}: missing tenant context`);
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Tenant context required for ${operationName}: invalid tenant context`);
  }

  return tenantId;
}

export function buildParameterizedSql(query: string, params: readonly unknown[] = []): Prisma.Sql {
  const strings: string[] = [];
  const values: unknown[] = [];
  const placeholderPattern = /\$(\d+)/g;
  let lastIndex = 0;

  for (const match of query.matchAll(placeholderPattern)) {
    const placeholder = match[0];
    const matchedIndex = match.index;

    if (matchedIndex === undefined) {
      continue;
    }

    const parameterPosition = Number.parseInt(match[1] ?? '', 10);
    const parameterIndex = parameterPosition - 1;

    if (
      !Number.isInteger(parameterPosition) ||
      parameterIndex < 0 ||
      parameterIndex >= params.length
    ) {
      throw new Error(
        `Invalid SQL parameter placeholder ${placeholder} in self-evolving prompts query`
      );
    }

    strings.push(query.slice(lastIndex, matchedIndex));
    values.push(params[parameterIndex]);
    lastIndex = matchedIndex + placeholder.length;
  }

  strings.push(query.slice(lastIndex));
  return Prisma.sql(strings, ...values);
}

async function applyRawRlsContext(
  tx: Prisma.TransactionClient,
  operationName: string,
  requireTenant: boolean,
  tenantIdOverride?: string | null
) {
  const { tenantId, bypassRls } = getTenantRuntimeContextFromStore();

  if (bypassRls) {
    await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${BYPASS_TENANT_SENTINEL}, true)`;
    await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    return;
  }

  const effectiveTenantId = tenantIdOverride ?? tenantId;

  if (!requireTenant && !effectiveTenantId) {
    return;
  }

  const validatedTenantId = assertTenantContext(operationName, effectiveTenantId ?? null);

  await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'false', true)`;
  await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${validatedTenantId}, true)`;
}

async function withRawExecutor<T>(
  options: RawExecutionOptions,
  callback: (client: Prisma.TransactionClient | typeof prisma) => Promise<T>
): Promise<T> {
  const operationName = options.operationName ?? 'self-evolving-prompts.raw';
  const requireTenant = options.requireTenant ?? false;
  const { tenantId, bypassRls, currentTx } = getTenantRuntimeContextFromStore();
  const effectiveTenantId = options.tenantIdOverride ?? tenantId;
  const needsScopedTransaction = bypassRls || requireTenant || !!effectiveTenantId;

  if (currentTx) {
    await applyRawRlsContext(currentTx, operationName, requireTenant, options.tenantIdOverride);
    return callback(currentTx);
  }

  if (!needsScopedTransaction) {
    return callback(prisma);
  }

  return prisma.$transaction((tx) =>
    runWithPrismaTransactionContext(tx, async () => {
      await applyRawRlsContext(tx, operationName, requireTenant, options.tenantIdOverride);
      return callback(tx);
    })
  );
}

/**
 * Execute a parameterized raw SQL query.
 * Callers must keep the SQL text static and route values through params.
 */
export async function executeQuery<T = unknown>(
  query: string,
  params: unknown[] = [],
  options: RawExecutionOptions = {}
): Promise<T[]> {
  const sql = buildParameterizedSql(query, params);
  return withRawExecutor(options, (client) => client.$queryRaw<T[]>(sql));
}

/**
 * Execute a parameterized raw SQL command (INSERT, UPDATE, DELETE).
 */
export async function executeCommand(
  command: string,
  params: unknown[] = [],
  options: RawExecutionOptions = {}
): Promise<number> {
  const sql = buildParameterizedSql(command, params);
  return withRawExecutor(options, (client) => client.$executeRaw(sql));
}

/**
 * Execute multiple queries in a transaction.
 */
export async function executeTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(callback);
}

/**
 * Health check for database connection.
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}

/**
 * Close database connection.
 */
export async function closeConnection(): Promise<void> {
  await prisma.$disconnect();
}
