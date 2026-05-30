/**
 * Idempotency Layer
 *
 * Prevents duplicate processing of prospects in pipeline stages.
 * Uses idempotency keys to detect and skip duplicate operations.
 *
 * Requirements: Idempotent stage handlers, duplicate detection
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

/**
 * Idempotency record structure
 */
export interface IdempotencyRecord {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  stage: string;
  prospectId: string;
  status: 'pending' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

/**
 * Generate an idempotency key for a prospect/stage combination
 */
export function generateIdempotencyKey(
  tenantId: string,
  prospectId: string,
  stage: string
): string {
  return `${tenantId}:${prospectId}:${stage}:${new Date().toISOString().split('T')[0]}`;
}

/**
 * Check if an operation is already in progress or completed
 *
 * @returns Object with isDuplicate flag and existing result if available
 */
export async function checkIdempotency(
  tenantId: string,
  idempotencyKey: string
): Promise<{
  isDuplicate: boolean;
  isProcessing: boolean;
  result?: unknown;
  record?: IdempotencyRecord;
}> {
  const record = await runWithTenantAsync(tenantId, () =>
    prisma.featureFlag
      .findFirst({
        where: { key: idempotencyKey },
      })
      .catch(() => null)
  );

  if (!record) {
    return {
      isDuplicate: false,
      isProcessing: false,
    };
  }

  // Check if this is a completed operation
  if (record.value.startsWith('completed:')) {
    return {
      isDuplicate: true,
      isProcessing: false,
      result: record.value.slice(10), // Remove 'completed:' prefix
    };
  }

  // Check if this is a pending operation (still processing)
  if (record.value.startsWith('pending:')) {
    return {
      isDuplicate: true,
      isProcessing: true,
    };
  }

  return {
    isDuplicate: false,
    isProcessing: false,
  };
}

/**
 * Mark an operation as started (pending)
 */
export async function markIdempotencyStarted(
  tenantId: string,
  idempotencyKey: string,
  stage: string,
  prospectId: string
): Promise<void> {
  await runWithTenantAsync(tenantId, () =>
    prisma.featureFlag.upsert({
      where: { key: idempotencyKey },
      create: {
        key: idempotencyKey,
        value: `pending:${stage}:${prospectId}`,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      update: {
        value: `pending:${stage}:${prospectId}`,
        updatedAt: new Date(),
      },
    })
  );

  logger.info(
    {
      event: 'idempotency.started',
      tenantId,
      idempotencyKey,
      stage,
      prospectId,
    },
    `Idempotency key marked as pending: ${idempotencyKey}`
  );
}

/**
 * Mark an operation as completed with result
 */
export async function markIdempotencyCompleted(
  tenantId: string,
  idempotencyKey: string,
  result: unknown
): Promise<void> {
  await runWithTenantAsync(tenantId, () =>
    prisma.featureFlag.update({
      where: { key: idempotencyKey },
      data: {
        value: `completed:${JSON.stringify(result)}`,
        updatedAt: new Date(),
      },
    })
  );

  logger.info(
    {
      event: 'idempotency.completed',
      tenantId,
      idempotencyKey,
    },
    `Idempotency key marked as completed: ${idempotencyKey}`
  );
}

/**
 * Mark an operation as failed
 */
export async function markIdempotencyFailed(
  tenantId: string,
  idempotencyKey: string,
  error: string
): Promise<void> {
  await runWithTenantAsync(tenantId, () =>
    prisma.featureFlag.update({
      where: { key: idempotencyKey },
      data: {
        value: `failed:${error}`,
        updatedAt: new Date(),
      },
    })
  );

  logger.warn(
    {
      event: 'idempotency.failed',
      tenantId,
      idempotencyKey,
      error,
    },
    `Idempotency key marked as failed: ${idempotencyKey}`
  );
}

/**
 * Wrap a stage handler with idempotency checking
 */
export async function withIdempotency<T>(
  tenantId: string,
  prospectId: string,
  stage: string,
  handler: () => Promise<T>
): Promise<{
  result: T;
  wasDuplicate: boolean;
  isProcessing: boolean;
}> {
  const idempotencyKey = generateIdempotencyKey(tenantId, prospectId, stage);

  // Check for existing operation
  const check = await checkIdempotency(tenantId, idempotencyKey);

  if (check.isDuplicate && !check.isProcessing) {
    // Return cached result
    logger.info(
      {
        event: 'idempotency.duplicate',
        tenantId,
        idempotencyKey,
        stage,
        prospectId,
      },
      `Returning cached result for duplicate request`
    );

    return {
      result: check.result as T,
      wasDuplicate: true,
      isProcessing: false,
    };
  }

  if (check.isProcessing) {
    // Another request is already processing this
    logger.warn(
      {
        event: 'idempotency.processing',
        tenantId,
        idempotencyKey,
        stage,
        prospectId,
      },
      `Operation already in progress`
    );

    throw new Error(`Operation already in progress for ${stage}:${prospectId}`);
  }

  // Mark as started
  await markIdempotencyStarted(tenantId, idempotencyKey, stage, prospectId);

  try {
    // Execute handler
    const result = await handler();

    // Mark as completed
    await markIdempotencyCompleted(tenantId, idempotencyKey, result);

    return {
      result,
      wasDuplicate: false,
      isProcessing: false,
    };
  } catch (error) {
    // Mark as failed
    await markIdempotencyFailed(
      tenantId,
      idempotencyKey,
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw error;
  }
}

/**
 * Clean up expired idempotency records
 * Should be run periodically via cron
 */
export async function cleanupExpiredIdempotency(): Promise<{
  cleaned: number;
}> {
  const now = new Date();

  const expiredKeys = await runWithTenantBypass('idempotency-cleanup-global-scan', () =>
    prisma.featureFlag.findMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { key: true },
    })
  );

  let cleaned = 0;

  for (const record of expiredKeys) {
    if (record.key.startsWith('pending:')) {
      await runWithTenantBypass('idempotency-cleanup-delete-expired-key', () =>
        prisma.featureFlag
          .delete({
            where: { key: record.key },
          })
          .catch(() => {})
      );
      cleaned++;
    }
  }

  return { cleaned };
}
