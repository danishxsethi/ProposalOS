import { Prisma, PrismaClient } from '@prisma/client';

import {
  getTenantRuntimeContextFromStore,
  runWithPrismaTransactionContext,
} from '@/lib/tenant/context';

type ExtendedPrismaClient = PrismaClient & Record<string, unknown>;

type TransactionCapableClient = Prisma.TransactionClient | ExtendedPrismaClient;

type ModelDelegate = {
  [operation: string]: (args: unknown) => Prisma.PrismaPromise<unknown>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MissingTenantError extends Error {
  readonly operationName: string;
  readonly tenantId: string | null;
  readonly reason: 'missing' | 'invalid';

  constructor(operationName: string, reason: 'missing' | 'invalid', tenantId: string | null) {
    const reasonMessage =
      reason === 'missing' ? 'missing tenant context' : `invalid tenant context: "${tenantId}"`;
    super(`Tenant context required for ${operationName}: ${reasonMessage}`);
    this.name = 'MissingTenantError';
    this.operationName = operationName;
    this.tenantId = tenantId;
    this.reason = reason;
  }
}

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function getOperationName(model: string | undefined, operation: string): string {
  return model ? `${model}.${operation}` : operation;
}

function assertTenantContext(operationName: string, tenantId: string | null): string {
  if (!tenantId) {
    throw new MissingTenantError(operationName, 'missing', tenantId);
  }

  if (!isValidUuid(tenantId)) {
    throw new MissingTenantError(operationName, 'invalid', tenantId);
  }

  return tenantId;
}

function findDelegateKey(
  tx: TransactionCapableClient,
  model: string,
  operationName: string
): string {
  const delegateKey = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
  const delegate = Reflect.get(tx as Record<string, unknown>, delegateKey);

  if (!delegate) {
    throw new Error(`No Prisma delegate found for ${model} while dispatching ${operationName}`);
  }

  return delegateKey;
}

export function dispatchOnTx(
  tx: TransactionCapableClient,
  model: string,
  operation: string,
  args: unknown
): Prisma.PrismaPromise<unknown> {
  const operationName = getOperationName(model, operation);
  const delegateKey = findDelegateKey(tx, model, operationName);
  const delegate = (tx as Record<string, unknown>)[delegateKey] as ModelDelegate | undefined;
  const method = delegate?.[operation];

  if (typeof method !== 'function') {
    throw new Error(
      `Operation ${operationName} is not dispatchable on the Prisma transaction client`
    );
  }

  return method.call(delegate, args);
}

async function applyRlsContext(
  tx: TransactionCapableClient,
  operationName: string,
  bypassRls: boolean,
  tenantId: string | null
): Promise<void> {
  if (bypassRls) {
    await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    return;
  }

  const validatedTenantId = assertTenantContext(operationName, tenantId);
  await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${validatedTenantId}, true)`;
}

type TransactionInput = Parameters<PrismaClient['$transaction']>[0];
type TransactionOptions = Parameters<PrismaClient['$transaction']>[1];

function wrapTransactionMethod(client: ExtendedPrismaClient): ExtendedPrismaClient {
  const originalTransaction = client.$transaction.bind(client) as PrismaClient['$transaction'];

  client.$transaction = ((input: TransactionInput, options?: TransactionOptions) => {
    if (typeof input !== 'function') {
      return originalTransaction(input as never, options as never);
    }

    const callback = input as (tx: Prisma.TransactionClient) => Promise<unknown>;
    return originalTransaction(
      (tx: Prisma.TransactionClient) => runWithPrismaTransactionContext(tx, () => callback(tx)),
      options as never
    );
  }) as PrismaClient['$transaction'];

  return client;
}

function createExtendedPrismaClient(): ExtendedPrismaClient {
  const baseClient = new PrismaClient();
  const wrappedClientRef: { current?: ExtendedPrismaClient } = {};

  const extendedClient = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, model, operation, query }): Promise<unknown> {
          const operationName = getOperationName(model, operation);
          const { tenantId, bypassRls, currentTx } = getTenantRuntimeContextFromStore();
          const runQuery = query as (queryArgs: typeof args) => Promise<unknown>;

          if (!model) {
            return runQuery(args);
          }

          // LIMITATION: Prisma model query extensions do not cover $queryRaw/$executeRaw.
          // Phase 2.6 will migrate or wrap the raw-query callsites separately.
          if (currentTx) {
            await applyRlsContext(currentTx, operationName, bypassRls, tenantId);
            return runQuery(args);
          }

          if (!bypassRls) {
            assertTenantContext(operationName, tenantId);
          }

          return wrappedClientRef.current!.$transaction(async (tx: Prisma.TransactionClient) =>
            runWithPrismaTransactionContext(tx, () => dispatchOnTx(tx, model, operation, args))
          );
        },
      },
    },
  }) as unknown as ExtendedPrismaClient;

  wrappedClientRef.current = wrapTransactionMethod(extendedClient);
  return wrappedClientRef.current;
}

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createExtendedPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
