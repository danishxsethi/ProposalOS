/**
 * Dead Letter Queue (DLQ) Implementation
 *
 * Manages prospects that have failed repeatedly, providing:
 * - Automatic DLQ routing after N failures
 * - Retry mechanisms with exponential backoff
 * - DLQ inspection and management APIs
 * - Resolution tracking
 *
 * Requirements: DLQ for permanently failed prospects, retry mechanism
 */

import { logger } from '@/lib/logger';
import { sendAlert } from '@/lib/notifications/slack';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

import { ProspectStatus } from './types';

/**
 * DLQ entry for a failed prospect
 */
export interface DLQEntry {
  id: string;
  tenantId: string;
  prospectId: string;
  originalStatus: ProspectStatus;
  failureCount: number;
  lastError: string;
  lastErrorAt: Date;
  createdAt: Date;
  processedAt: Date | null;
  status: 'pending' | 'retrying' | 'resolved' | 'discarded';
}

/**
 * DLQ statistics
 */
export interface DLQStats {
  total: number;
  pending: number;
  retrying: number;
  resolved: number;
  discarded: number;
  avgFailureCount: number;
  oldestEntry: Date | null;
}

/**
 * Move a prospect to the dead letter queue
 */
export async function addToDLQ(
  tenantId: string,
  prospectId: string,
  originalStatus: ProspectStatus,
  error: Error
): Promise<DLQEntry> {
  const now = new Date();

  const entry = await runWithTenantAsync(tenantId, async () => {
    let currentEntry = await prisma.deadLetterQueue.findUnique({
      where: { prospectId },
    });

    if (currentEntry) {
      currentEntry = await prisma.deadLetterQueue.update({
        where: { prospectId },
        data: {
          failureCount: { increment: 1 },
          lastError: error.message,
          lastErrorAt: now,
          status: 'pending',
        },
      });
    } else {
      currentEntry = await prisma.deadLetterQueue.create({
        data: {
          tenantId,
          prospectId,
          originalStatus,
          failureCount: 1,
          lastError: error.message,
          lastErrorAt: now,
          status: 'pending',
        },
      });
    }

    return currentEntry;
  });

  logger.error(
    {
      event: 'dlq.added',
      tenantId,
      prospectId,
      originalStatus,
      failureCount: entry.failureCount,
      error: error.message,
    },
    `Prospect ${prospectId} added to DLQ`
  );

  // Alert if failure count is high
  if (entry.failureCount >= 5) {
    await sendAlert({
      tenantId,
      type: 'DLQ_HIGH_FAILURE_COUNT',
      title: `High DLQ Failure Count: ${entry.failureCount}`,
      message: `Prospect ${prospectId} has failed ${entry.failureCount} times and is in the dead letter queue.`,
      severity: 'high',
      metadata: {
        prospectId,
        failureCount: entry.failureCount,
        originalStatus,
      },
    });
  }

  return {
    id: entry.id,
    tenantId: entry.tenantId,
    prospectId: entry.prospectId,
    originalStatus: entry.originalStatus as ProspectStatus,
    failureCount: entry.failureCount,
    lastError: entry.lastError,
    lastErrorAt: entry.lastErrorAt,
    createdAt: entry.createdAt,
    processedAt: entry.processedAt,
    status: entry.status as DLQEntry['status'],
  };
}

/**
 * Get DLQ entries for a tenant with pagination
 */
export async function getDLQEntries(
  tenantId: string,
  options: {
    status?: DLQEntry['status'];
    page?: number;
    pageSize?: number;
    sortBy?: 'createdAt' | 'failureCount' | 'lastErrorAt';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  items: DLQEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { status, page = 1, pageSize = 20, sortBy = 'lastErrorAt', sortOrder = 'desc' } = options;

  const where: any = { tenantId };
  if (status) {
    where.status = status;
  }

  const [total, entries] = await runWithTenantAsync(tenantId, () =>
    Promise.all([
      prisma.deadLetterQueue.count({ where }),
      prisma.deadLetterQueue.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
  );

  return {
    items: entries.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      prospectId: e.prospectId,
      originalStatus: e.originalStatus as ProspectStatus,
      failureCount: e.failureCount,
      lastError: e.lastError,
      lastErrorAt: e.lastErrorAt,
      createdAt: e.createdAt,
      processedAt: e.processedAt,
      status: e.status as DLQEntry['status'],
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get DLQ statistics for a tenant
 */
export async function getDLQStats(tenantId: string): Promise<DLQStats> {
  const [total, pending, retrying, resolved, discarded, oldest, avgResult] =
    await runWithTenantAsync(tenantId, () =>
      Promise.all([
        prisma.deadLetterQueue.count({ where: { tenantId } }),
        prisma.deadLetterQueue.count({ where: { tenantId, status: 'pending' } }),
        prisma.deadLetterQueue.count({ where: { tenantId, status: 'retrying' } }),
        prisma.deadLetterQueue.count({ where: { tenantId, status: 'resolved' } }),
        prisma.deadLetterQueue.count({ where: { tenantId, status: 'discarded' } }),
        prisma.deadLetterQueue.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        prisma.deadLetterQueue.aggregate({
          where: { tenantId },
          _avg: { failureCount: true },
        }),
      ])
    );

  return {
    total,
    pending,
    retrying,
    resolved,
    discarded,
    avgFailureCount: avgResult._avg.failureCount || 0,
    oldestEntry: oldest?.createdAt || null,
  };
}

/**
 * Retry a prospect from the DLQ
 */
export async function retryFromDLQ(
  tenantId: string,
  prospectId: string,
  operatorId: string
): Promise<void> {
  await runWithTenantAsync(tenantId, async () => {
    const entry = await prisma.deadLetterQueue.findUnique({
      where: { prospectId },
    });

    if (!entry) {
      throw new Error(`DLQ entry not found for prospect ${prospectId}`);
    }

    if (entry.status === 'discarded') {
      throw new Error(`Prospect ${prospectId} has been discarded and cannot be retried`);
    }

    await prisma.deadLetterQueue.update({
      where: { prospectId },
      data: {
        status: 'retrying',
      },
    });
  });

  logger.info(
    {
      event: 'dlq.retry',
      tenantId,
      prospectId,
      operatorId,
    },
    `Prospect ${prospectId} marked for retry from DLQ`
  );
}

/**
 * Mark a DLQ entry as resolved
 */
export async function resolveDLQEntry(
  tenantId: string,
  prospectId: string,
  operatorId: string,
  notes?: string
): Promise<void> {
  await runWithTenantAsync(tenantId, async () => {
    const entry = await prisma.deadLetterQueue.findUnique({
      where: { prospectId },
    });

    if (!entry) {
      throw new Error(`DLQ entry not found for prospect ${prospectId}`);
    }

    await prisma.deadLetterQueue.update({
      where: { prospectId },
      data: {
        status: 'resolved',
        processedAt: new Date(),
      },
    });
  });

  logger.info(
    {
      event: 'dlq.resolved',
      tenantId,
      prospectId,
      operatorId,
      notes,
    },
    `DLQ entry ${prospectId} marked as resolved`
  );
}

/**
 * Discard a DLQ entry (permanent removal from processing)
 */
export async function discardDLQEntry(
  tenantId: string,
  prospectId: string,
  operatorId: string,
  reason: string
): Promise<void> {
  await runWithTenantAsync(tenantId, async () => {
    const entry = await prisma.deadLetterQueue.findUnique({
      where: { prospectId },
    });

    if (!entry) {
      throw new Error(`DLQ entry not found for prospect ${prospectId}`);
    }

    await prisma.deadLetterQueue.update({
      where: { prospectId },
      data: {
        status: 'discarded',
        processedAt: new Date(),
        lastError: `${entry.lastError}\n[DISCARDED by ${operatorId}]: ${reason}`,
      },
    });
  });

  logger.warn(
    {
      event: 'dlq.discarded',
      tenantId,
      prospectId,
      operatorId,
      reason,
    },
    `DLQ entry ${prospectId} discarded`
  );
}

/**
 * Cron job to process DLQ entries with retry logic
 */
export async function processDLQ(): Promise<{
  processed: number;
  retried: number;
  discarded: number;
}> {
  // Cross-tenant enumeration is intentional here because the retry driver needs to
  // fan out across every active tenant before dropping back into tenant-local work.
  const allTenants = await runWithTenantBypass('dlq-cross-tenant-retry-driver', () =>
    prisma.tenant.findMany({
      where: { isActive: true },
    })
  );

  let processed = 0;
  let retried = 0;
  let discarded = 0;

  for (const tenant of allTenants) {
    await runWithTenantAsync(tenant.id, async () => {
      const config = await prisma.pipelineConfig.findUnique({
        where: { tenantId: tenant.id },
      });

      const maxFailureCount = config?.maxFailureCount || 3;

      // Keep the active tenant filter explicit even though the ALS context now scopes the client.
      const pendingEntries = await prisma.deadLetterQueue.findMany({
        where: {
          tenantId: tenant.id,
          status: 'pending',
        },
        take: 10, // Process up to 10 per tenant per run
      });

      for (const entry of pendingEntries) {
        processed++;

        if (entry.failureCount >= maxFailureCount * 2) {
          await prisma.deadLetterQueue.update({
            where: { prospectId: entry.prospectId },
            data: {
              status: 'discarded',
              processedAt: new Date(),
            },
          });
          discarded++;

          await sendAlert({
            tenantId: tenant.id,
            type: 'DLQ_AUTO_DISCARDED',
            title: `Auto-Discarded from DLQ: ${entry.prospectId}`,
            message: `Prospect was automatically discarded after ${entry.failureCount} failures.`,
            severity: 'medium',
            metadata: {
              prospectId: entry.prospectId,
              failureCount: entry.failureCount,
            },
          });
        } else {
          await prisma.deadLetterQueue.update({
            where: { prospectId: entry.prospectId },
            data: {
              status: 'retrying',
            },
          });
          retried++;
        }
      }
    });
  }

  return { processed, retried, discarded };
}

/**
 * Check if a prospect is in the DLQ
 */
export async function isInDLQ(tenantId: string, prospectId: string): Promise<boolean> {
  const entry = await runWithTenantAsync(tenantId, () =>
    prisma.deadLetterQueue.findUnique({
      where: { prospectId },
    })
  );
  return entry !== null;
}

/**
 * Get DLQ entry for a prospect
 */
export async function getDLQEntry(tenantId: string, prospectId: string): Promise<DLQEntry | null> {
  const entry = await runWithTenantAsync(tenantId, () =>
    prisma.deadLetterQueue.findUnique({
      where: { prospectId },
    })
  );

  if (!entry) return null;

  return {
    id: entry.id,
    tenantId: entry.tenantId,
    prospectId: entry.prospectId,
    originalStatus: entry.originalStatus as ProspectStatus,
    failureCount: entry.failureCount,
    lastError: entry.lastError,
    lastErrorAt: entry.lastErrorAt,
    createdAt: entry.createdAt,
    processedAt: entry.processedAt,
    status: entry.status as DLQEntry['status'],
  };
}
