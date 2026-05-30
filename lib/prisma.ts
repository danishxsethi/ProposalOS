import { Prisma, PrismaClient } from '@prisma/client';

import {
  getTenantRuntimeContextFromStore,
  runWithDispatch,
  runWithPrismaTransactionContext,
} from '@/lib/tenant/context';

export type ExtendedPrismaClient = PrismaClient & Record<string, unknown>;

type TransactionCapableClient = Prisma.TransactionClient | ExtendedPrismaClient;

type ModelDelegate = {
  [operation: string]: (args: unknown) => Prisma.PrismaPromise<unknown>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BYPASS_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';

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
  return UUID_PATTERN.test(value) || value === BYPASS_TENANT_SENTINEL;
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
    // Keep tenant-scoped policy casts valid even when bypass policy wins.
    await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${BYPASS_TENANT_SENTINEL}, true)`;
    await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    return;
  }

  const validatedTenantId = assertTenantContext(operationName, tenantId);
  await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'false', true)`;
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

export function createExtendedPrismaClient(baseClient: PrismaClient = new PrismaClient()): ExtendedPrismaClient {
  const wrappedClientRef: { current?: ExtendedPrismaClient } = {};

  const extendedClient = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, model, operation, query }): Promise<unknown> {
          const operationName = getOperationName(model, operation);
          const { tenantId, bypassRls, currentTx, isDispatching } = getTenantRuntimeContextFromStore();
          const runQuery = query as (queryArgs: typeof args) => Promise<unknown>;

          if (!model) {
            return runQuery(args);
          }

          if (isDispatching) {
            return runQuery(args);
          }

          if (currentTx) {
            return runWithDispatch(async () => {
              await applyRlsContext(currentTx, operationName, bypassRls, tenantId);
              return dispatchOnTx(currentTx, model, operation, args);
            });
          }

          if (!bypassRls) {
            assertTenantContext(operationName, tenantId);
          }

          return wrappedClientRef.current!.$transaction(async (tx: Prisma.TransactionClient) =>
            runWithPrismaTransactionContext(tx, async () => {
              return runWithDispatch(async () => {
                await applyRlsContext(tx, operationName, bypassRls, tenantId);
                return dispatchOnTx(tx, model, operation, args);
              });
            })
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
