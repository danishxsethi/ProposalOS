import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = await verifyCronAuth(request);
  if (authError) return authError;

  const now = new Date();
  const ttlMinutes = 120; // exactly 2 hours (120 minutes)
  const ttlMs = ttlMinutes * 60 * 1000;
  const cutoffTime = new Date(now.getTime() - ttlMs);

  logger.info(
    { cutoffTime: cutoffTime.toISOString() },
    'Starting stale jobs and audits cleanup cron...'
  );

  try {
    const result = await runWithTenantBypass('cleanup-stale-audits', async () => {
      // 1. Identify stale running Audits
      const staleAudits = await prisma.audit.findMany({
        where: {
          status: 'RUNNING',
          startedAt: {
            lt: cutoffTime,
          },
        },
        select: {
          id: true,
          businessName: true,
          startedAt: true,
          tenantId: true,
        },
      });

      logger.info({ count: staleAudits.length }, 'Found stale RUNNING audits.');

      // 2. Identify stale QUEUED/RUNNING AuditJobs
      const staleJobs = await prisma.auditJob.findMany({
        where: {
          status: {
            in: ['QUEUED', 'RUNNING'],
          },
          createdAt: {
            lt: cutoffTime,
          },
        },
        select: {
          id: true,
          auditId: true,
          status: true,
          createdAt: true,
          tenantId: true,
        },
      });

      logger.info({ count: staleJobs.length }, 'Found stale QUEUED/RUNNING audit jobs.');

      let auditsUpdatedCount = 0;
      for (const audit of staleAudits) {
        await prisma.audit.update({
          where: { id: audit.id },
          data: {
            status: 'FAILED',
            completedAt: now,
            modulesFailed: JSON.stringify(['all_modules_timeout']),
          },
        });

        // Record tenant-scoped audit.failed event
        await recordAuditTrailEvent({
          eventType: 'audit.failed',
          tenantId: audit.tenantId,
          auditId: audit.id,
          payload: {
            reason: 'stale_job_maintenance_cleanup',
            startedAt: audit.startedAt.toISOString(),
            cleanupTime: now.toISOString(),
          },
        });

        auditsUpdatedCount++;
      }

      let jobsUpdatedCount = 0;
      for (const job of staleJobs) {
        await prisma.auditJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Job terminated due to maintenance cleanup (TTL exceeded).',
            completedAt: now,
          },
        });

        jobsUpdatedCount++;
      }

      // Record system-wide cleanup.completed event
      if (auditsUpdatedCount > 0 || jobsUpdatedCount > 0) {
        await recordAuditTrailEvent({
          eventType: 'cleanup.completed',
          tenantId: null, // System-scoped
          payload: {
            auditsCleanedUp: auditsUpdatedCount,
            jobsCleanedUp: jobsUpdatedCount,
            ttlMinutes,
            executedAt: now.toISOString(),
          },
        });
      }

      return {
        auditsCleanedUp: auditsUpdatedCount,
        jobsCleanedUp: jobsUpdatedCount,
      };
    });

    return NextResponse.json({
      success: true,
      auditsCleanedUp: result.auditsCleanedUp,
      jobsCleanedUp: result.jobsCleanedUp,
      ttlMinutes,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to clean up stale jobs and audits');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
