#!/usr/bin/env npx tsx
/**
 * Maintenance script to clean up stale 'RUNNING' audits and 'QUEUED' audit jobs
 * that have exceeded the TTL limit (default: 30 minutes).
 *
 * Usage:
 *   npx tsx scripts/maintenance/cleanup-stale-audits.ts          # Dry-run mode (default)
 *   npx tsx scripts/maintenance/cleanup-stale-audits.ts --apply  # Actually apply changes to database
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { logger } from '@/lib/logger';

// Parse command line arguments
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ttlMinutes = 30;
const ttlMs = ttlMinutes * 60 * 1000;

async function cleanupStaleAudits() {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - ttlMs);

  console.log(`\n🧹 Starting stale audit cleanup job...`);
  console.log(
    `Cutoff time for stale entries: ${cutoffTime.toISOString()} (older than ${ttlMinutes} minutes)`
  );
  console.log(
    `Execution Mode: ${apply ? '⚠️  APPLY / WRITE-BACK' : '🔍 DRY RUN (no database writes)'}\n`
  );

  // We wrap database operations in runWithTenantBypass to bypass multi-tenant RLS checks
  await runWithTenantBypass('cleanup-stale-audits', async () => {
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

    console.log(`Found ${staleAudits.length} stale RUNNING audits.`);
    for (const audit of staleAudits) {
      const elapsedMins = Math.round((now.getTime() - audit.startedAt.getTime()) / (60 * 1000));
      console.log(
        `  - Audit ID: ${audit.id} ("${audit.businessName}"), Tenant: ${audit.tenantId}, StartedAt: ${audit.startedAt.toISOString()} (${elapsedMins} mins ago)`
      );
    }

    // 2. Identify stale QUEUED AuditJobs
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

    console.log(`\nFound ${staleJobs.length} stale QUEUED/RUNNING audit jobs.`);
    for (const job of staleJobs) {
      const elapsedMins = Math.round((now.getTime() - job.createdAt.getTime()) / (60 * 1000));
      console.log(
        `  - Job ID: ${job.id}, Audit ID: ${job.auditId}, Status: ${job.status}, Tenant: ${job.tenantId}, CreatedAt: ${job.createdAt.toISOString()} (${elapsedMins} mins ago)`
      );
    }

    if (!apply) {
      console.log(
        `\n💡 Dry-run completed. Re-run with '--apply' to update these ${staleAudits.length} audits and ${staleJobs.length} jobs.`
      );
      return;
    }

    // --- Write back changes if apply is true ---
    console.log(`\nApplying updates to database...`);

    // Update stale Audits
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

    // Update stale AuditJobs
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

    console.log(`\n✅ SUCCESS: Successfully remediated database state!`);
    console.log(`  - Marked ${auditsUpdatedCount} stale audits as FAILED.`);
    console.log(`  - Marked ${jobsUpdatedCount} stale audit jobs as FAILED.`);
  });
}

cleanupStaleAudits()
  .then(() => {
    if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('\n❌ Fatal error in cleanup job:', err);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  });
