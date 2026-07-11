/**
 * Scheduled Audit Runner
 *
 * Executes scheduled re-audits based on AuditSchedule configuration
 * and generates comparison reports.
 *
 * SINGLE OWNER (P1-22 / P1-23 / P0-23): this is now the one implementation of
 * scheduled-audit processing, used by BOTH cron entry points that used to duplicate
 * (and race against) this work:
 *   - app/api/cron/scheduled-audits/route.ts (registered in cron.yaml, daily 7am)
 *   - lib/graph/retention-graph.ts's run_scheduled_audits node (via the `retention`
 *     cron entry, daily 6am)
 *
 * Previously these were two independent implementations against the same
 * AuditSchedule table: the retention-graph path used to run this function
 * (createScheduledAudit) which was a self-documented STUB that created an Audit row
 * and NEVER triggered execution — while also advancing AuditSchedule.nextRunAt an
 * hour before the (better, but AuditOrchestrator-based) scheduled-audits cron got a
 * chance to run, so the "real" implementation never actually saw a due schedule.
 * 100% of scheduled/recurring audits were silently non-functional as a result.
 *
 * Fixed by making this the one shared implementation, always dispatching through the
 * durable AuditJob queue (canonical 27-module engine, not AuditOrchestrator's ~15).
 * Both cron entry points now call processScheduledAudits() — whichever fires first for
 * a given tick does the (idempotent) work; the other finds nothing due. No split-brain,
 * no stub, and scheduled re-audits get full canonical-engine coverage.
 */

import { dispatchAuditExecution } from '@/lib/audit/dispatch';
import { logger } from '@/lib/logger';
import { sendWebhook } from '@/lib/notifications/webhook';
import { prisma } from '@/lib/prisma';
import { detectCompetitorImprovement, triggerUpsellProposal } from '@/lib/retention/upsellTrigger';

/** Max due schedules kicked off per invocation, to stay well inside cron timeouts. */
const MAX_SCHEDULES_PER_RUN = 5;

/**
 * Process all due scheduled audits: finalize any previously-kicked-off runs that have
 * now reached a terminal state (comparison + upsell-trigger + webhook), then kick off
 * newly-due schedules via the durable queue.
 */
export async function processScheduledAudits(): Promise<{
  auditsRun: number;
  comparisonsGenerated: number;
  errors: string[];
}> {
  const finalized = await finalizeCompletedScheduledRuns();
  const kickedOff = await kickoffDueSchedules();

  return {
    auditsRun: kickedOff.auditsRun,
    comparisonsGenerated: finalized.comparisonsGenerated,
    errors: [...finalized.errors, ...kickedOff.errors],
  };
}

const TERMINAL_AUDIT_STATUSES = ['COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED'];

/**
 * Find ScheduledAuditRun rows still in 'queued' whose underlying Audit has reached a
 * terminal state, and finalize them: generate the before/after comparison report,
 * check for an upsell trigger, send the completion webhook, and mark the run
 * 'completed'/'failed' so it is never reprocessed (idempotent).
 */
async function finalizeCompletedScheduledRuns(): Promise<{
  comparisonsGenerated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let comparisonsGenerated = 0;

  const pendingRuns = await prisma.scheduledAuditRun.findMany({
    where: { status: 'queued' },
    take: MAX_SCHEDULES_PER_RUN * 2, // finalize pass is cheap; allow a bit more headroom
    orderBy: { createdAt: 'asc' },
  });

  if (pendingRuns.length === 0) {
    return { comparisonsGenerated: 0, errors: [] };
  }

  const auditIds = pendingRuns.map((r) => r.auditId);
  const audits = await prisma.audit.findMany({
    where: { id: { in: auditIds } },
    select: { id: true, status: true, businessName: true, tenantId: true },
  });
  const auditById = new Map(audits.map((a) => [a.id, a]));

  for (const run of pendingRuns) {
    const audit = auditById.get(run.auditId);
    if (!audit || !TERMINAL_AUDIT_STATUSES.includes(audit.status)) {
      continue; // still QUEUED/RUNNING — check again next tick
    }

    const isSuccess = audit.status === 'COMPLETE' || audit.status === 'PARTIAL';

    try {
      if (isSuccess && run.previousAuditId) {
        const comparison = await generateComparisonReport(
          run.previousAuditId,
          run.auditId,
          run.tenantId
        );

        if (comparison) {
          comparisonsGenerated++;

          const matchingProposals = await prisma.proposal.findMany({
            where: { auditId: run.previousAuditId },
            select: { id: true },
          });
          const proposalIds = matchingProposals.map((p) => p.id);

          if (proposalIds.length > 0) {
            await prisma.deliveryTask.updateMany({
              where: { proposalId: { in: proposalIds } },
              data: { beforeAfterComparison: comparison as any },
            });
          }

          try {
            const { triggered, reason } = await detectCompetitorImprovement(
              run.previousAuditId,
              run.auditId
            );
            if (triggered) {
              await triggerUpsellProposal(run.tenantId, run.auditId, reason);
              logger.info(
                {
                  event: 'scheduled_audits.upsell_triggered',
                  auditId: run.auditId,
                  scheduleId: run.scheduleId,
                  reason,
                },
                'Upsell proposal auto-generated from competitor improvement'
              );
            }
          } catch (upsellErr) {
            logger.error({ err: upsellErr, auditId: run.auditId }, 'Upsell trigger check failed');
          }
        }
      }

      // generateComparisonReport already marks the run 'completed' via its own
      // updateMany when a comparison was generated; cover the remaining cases here
      // (success-without-comparison, or terminal failure) so every run reaches a
      // terminal ScheduledAuditRun status exactly once.
      await prisma.scheduledAuditRun.updateMany({
        where: { id: run.id, status: 'queued' },
        data: {
          status: isSuccess ? 'completed' : 'failed',
          completedAt: new Date(),
        },
      });

      await sendWebhook(isSuccess ? 'audit.completed' : 'audit.failed', {
        auditId: run.auditId,
        scheduleId: run.scheduleId,
        status: audit.status,
        businessName: audit.businessName,
        source: 'scheduled',
      });
    } catch (error: any) {
      errors.push(`Failed to finalize scheduled run ${run.id}: ${error.message}`);
      logger.error({ err: error, runId: run.id }, 'Failed to finalize scheduled audit run');
    }
  }

  return { comparisonsGenerated, errors };
}

/**
 * Kick off newly-due AuditSchedule rows: create the Audit + ScheduledAuditRun records
 * and enqueue durable execution via the canonical engine. Advances
 * AuditSchedule.nextRunAt immediately (matching prior behavior) so a schedule is never
 * claimed twice in the same tick, regardless of which cron entry point calls this.
 */
async function kickoffDueSchedules(): Promise<{ auditsRun: number; errors: string[] }> {
  const errors: string[] = [];
  let auditsRun = 0;
  const now = new Date();

  const dueSchedules = await prisma.auditSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    take: MAX_SCHEDULES_PER_RUN,
    orderBy: { nextRunAt: 'asc' },
  });

  for (const schedule of dueSchedules) {
    try {
      if (!schedule.businessUrl || !schedule.businessName || !schedule.businessCity) {
        logger.warn(
          {
            event: 'scheduled_audits.skip',
            scheduleId: schedule.id,
            reason: 'Missing required fields',
          },
          'Skipping schedule with incomplete data'
        );
        continue;
      }

      // Atomic claim (P1-22/P1-23 concurrency, Step 7 requirement 4/5): advance
      // nextRunAt in the SAME conditional update that re-checks nextRunAt <= now.
      // Both cron entry points (app/api/cron/scheduled-audits and the retention
      // `run_scheduled_audits` graph node) call this same function — whichever
      // invocation's tick reaches a given schedule first wins this updateMany
      // (count === 1); a concurrent/overlapping invocation sees count === 0 and
      // skips, so the same due occurrence is never dispatched twice.
      const claimed = await prisma.auditSchedule.updateMany({
        where: { id: schedule.id, nextRunAt: { lte: now } },
        data: {
          lastRunAt: now,
          nextRunAt: calculateNextRunDate(schedule.frequency, now),
        },
      });
      if (claimed.count === 0) {
        continue; // Lost the race to a concurrent invocation of this same function
      }

      const newAudit = await createScheduledAudit(schedule);
      if (newAudit) {
        auditsRun++;
        await prisma.auditSchedule.update({
          where: { id: schedule.id },
          data: { lastAuditId: newAudit.id },
        });
      }
    } catch (error: any) {
      errors.push(`Failed to process schedule ${schedule.id}: ${error.message}`);
      logger.error({ err: error, scheduleId: schedule.id }, 'Scheduled audit failed');
    }
  }

  return { auditsRun, errors };
}

/**
 * Create a new audit based on schedule configuration and enqueue it for durable
 * execution via the canonical engine (P0-23 — this used to be a stub that created the
 * Audit row and never triggered execution at all).
 */
async function createScheduledAudit(schedule: {
  id: string;
  tenantId: string;
  businessName: string;
  businessCity: string | null;
  businessUrl: string | null;
  industry: string | null;
  lastAuditId: string | null;
}) {
  const audit = await prisma.audit.create({
    data: {
      businessName: schedule.businessName,
      businessCity: schedule.businessCity,
      businessUrl: schedule.businessUrl,
      businessIndustry: schedule.industry,
      status: 'QUEUED',
      tenantId: schedule.tenantId,
      batchId: `scheduled-${schedule.id}`,
    },
  });

  await prisma.scheduledAuditRun.create({
    data: {
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
      auditId: audit.id,
      previousAuditId: schedule.lastAuditId,
      status: 'queued',
      startedAt: new Date(),
    },
  });

  try {
    await dispatchAuditExecution({ tenantId: schedule.tenantId, auditId: audit.id });
  } catch (error) {
    logger.error(
      { err: error, auditId: audit.id, scheduleId: schedule.id },
      'Failed to enqueue scheduled audit for execution'
    );
    await prisma.audit
      .update({ where: { id: audit.id }, data: { status: 'FAILED', completedAt: new Date() } })
      .catch(() => {});
    await prisma.scheduledAuditRun
      .updateMany({
        where: { auditId: audit.id },
        data: { status: 'failed', completedAt: new Date() },
      })
      .catch(() => {});
  }

  return audit;
}

/**
 * Generate comparison report between two audits
 */
export async function generateComparisonReport(
  beforeAuditId: string,
  afterAuditId: string,
  tenantId: string
): Promise<{
  scoreChange: number;
  findingsResolved: number;
  newFindings: number;
  improvements: Array<{ category: string; change: string }>;
} | null> {
  const [beforeAudit, afterAudit] = await Promise.all([
    prisma.audit.findUnique({
      where: { id: beforeAuditId },
      include: { findings: true },
    }),
    prisma.audit.findUnique({
      where: { id: afterAuditId },
      include: { findings: true },
    }),
  ]);

  if (!beforeAudit || !afterAudit) {
    return null;
  }

  const beforeScore = beforeAudit.overallScore || 0;
  const afterScore = afterAudit.overallScore || 0;
  const scoreChange = afterScore - beforeScore;

  // Find resolved findings (in before but not in after)
  const beforeFindingIds = new Set(beforeAudit.findings.map((f) => f.id));
  const afterFindingIds = new Set(afterAudit.findings.map((f) => f.id));

  const resolvedCount = beforeAudit.findings.filter((f) => !afterFindingIds.has(f.id)).length;

  // Find new findings (in after but not in before)
  const newCount = afterAudit.findings.filter((f) => !beforeFindingIds.has(f.id)).length;

  // Categorize improvements
  const improvements: Array<{ category: string; change: string }> = [];

  // Compare scores by category
  const beforeByCategory = groupFindingsByCategory(beforeAudit.findings);
  const afterByCategory = groupFindingsByCategory(afterAudit.findings);

  const allCategories = new Set([
    ...Object.keys(beforeByCategory),
    ...Object.keys(afterByCategory),
  ]);

  for (const category of allCategories) {
    const beforeAvg = beforeByCategory[category]?.avgScore || 0;
    const afterAvg = afterByCategory[category]?.avgScore || 0;
    const change = afterAvg - beforeAvg;

    if (Math.abs(change) > 0) {
      improvements.push({
        category,
        change: change > 0 ? `+${change} points` : `${change} points`,
      });
    }
  }

  // Update the scheduled audit run with comparison
  await prisma.scheduledAuditRun.updateMany({
    where: {
      auditId: afterAuditId,
      previousAuditId: beforeAuditId,
    },
    data: {
      status: 'completed',
      comparisonReport: {
        scoreChange,
        findingsResolved: resolvedCount,
        newFindings: newCount,
        improvements,
      } as any,
      completedAt: new Date(),
    },
  });

  return {
    scoreChange,
    findingsResolved: resolvedCount,
    newFindings: newCount,
    improvements,
  };
}

/**
 * Group findings by category and calculate average scores
 */
function groupFindingsByCategory(
  findings: any[]
): Record<string, { avgScore: number; count: number }> {
  const grouped: Record<string, { total: number; count: number }> = {};

  for (const finding of findings) {
    const category = finding.category || 'uncategorized';
    if (!grouped[category]) {
      grouped[category] = { total: 0, count: 0 };
    }
    grouped[category].total += finding.impactScore || 0;
    grouped[category].count++;
  }

  const result: Record<string, { avgScore: number; count: number }> = {};
  for (const [category, data] of Object.entries(grouped)) {
    result[category] = {
      avgScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
      count: data.count,
    };
  }

  return result;
}

/**
 * Calculate next run date based on frequency
 */
function calculateNextRunDate(frequency: string, fromDate: Date): Date {
  const next = new Date(fromDate);

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    default:
      next.setMonth(next.getMonth() + 1); // Default to monthly
  }

  return next;
}

/**
 * Create a new audit schedule
 */
export async function createAuditSchedule(
  tenantId: string,
  config: {
    businessName: string;
    businessUrl: string;
    businessCity?: string;
    industry: string;
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
    createdBy?: string;
  }
) {
  const nextRunAt = calculateNextRunDate(config.frequency, new Date());

  return await prisma.auditSchedule.create({
    data: {
      tenantId,
      businessName: config.businessName,
      businessUrl: config.businessUrl,
      businessCity: config.businessCity,
      industry: config.industry,
      frequency: config.frequency,
      nextRunAt,
      isActive: true,
      createdBy: config.createdBy,
    },
  });
}

/**
 * Get upcoming scheduled audits
 */
export async function getUpcomingScheduledAudits(tenantId: string, daysAhead: number = 7) {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return await prisma.auditSchedule.findMany({
    where: {
      tenantId,
      isActive: true,
      nextRunAt: {
        gte: now,
        lte: future,
      },
    },
    orderBy: { nextRunAt: 'asc' },
  });
}
