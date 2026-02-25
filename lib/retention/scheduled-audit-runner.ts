/**
 * Scheduled Audit Runner
 * 
 * Executes scheduled re-audits based on AuditSchedule configuration
 * and generates comparison reports.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Import the audit runner when available
// import { runAudit } from '@/lib/audit/runner';

/**
 * Process all due scheduled audits
 */
export async function processScheduledAudits(): Promise<{
  auditsRun: number;
  comparisonsGenerated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let auditsRun = 0;
  let comparisonsGenerated = 0;

  const now = new Date();

  // Get all due audit schedules
  const dueSchedules = await prisma.auditSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now }
    },
    include: {
      tenant: true
    }
  });

  for (const schedule of dueSchedules) {
    try {
      // Create/run the new audit
      const newAudit = await createScheduledAudit(schedule);

      if (newAudit) {
        auditsRun++;

        // If there's a previous audit, generate comparison
        if (schedule.lastAuditId) {
          const comparison = await generateComparisonReport(
            schedule.lastAuditId,
            newAudit.id,
            schedule.tenantId
          );

          if (comparison) {
            comparisonsGenerated++;

            // Update DeliveryTask with comparison if applicable
            await prisma.deliveryTask.updateMany({
              where: {
                proposal: {
                  auditId: schedule.lastAuditId
                }
              },
              data: {
                beforeAfterComparison: comparison as any
              }
            });
          }
        }

        // Update schedule with new audit info
        await prisma.auditSchedule.update({
          where: { id: schedule.id },
          data: {
            lastAuditId: newAudit.id,
            lastRunAt: now,
            nextRunAt: calculateNextRunDate(schedule.frequency, now)
          }
        });
      }

    } catch (error: any) {
      errors.push(`Failed to process schedule ${schedule.id}: ${error.message}`);
      logger.error({ err: error, scheduleId: schedule.id }, 'Scheduled audit failed');
    }
  }

  return {
    auditsRun,
    comparisonsGenerated,
    errors
  };
}

/**
 * Create a new audit based on schedule configuration
 */
async function createScheduledAudit(schedule: any) {
  // In a real implementation, this would call the audit runner
  // For now, we'll create the audit record
  
  const audit = await prisma.audit.create({
    data: {
      businessName: schedule.businessName,
      businessCity: schedule.businessCity,
      businessUrl: schedule.businessUrl,
      businessIndustry: schedule.industry,
      status: 'QUEUED',
      tenantId: schedule.tenantId,
      // The actual audit execution would be triggered separately
    }
  });

  // Log the scheduled audit run
  await prisma.scheduledAuditRun.create({
    data: {
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
      auditId: audit.id,
      previousAuditId: schedule.lastAuditId,
      status: 'queued',
      startedAt: new Date()
    }
  });

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
      include: { findings: true }
    }),
    prisma.audit.findUnique({
      where: { id: afterAuditId },
      include: { findings: true }
    })
  ]);

  if (!beforeAudit || !afterAudit) {
    return null;
  }

  const beforeScore = beforeAudit.overallScore || 0;
  const afterScore = afterAudit.overallScore || 0;
  const scoreChange = afterScore - beforeScore;

  // Find resolved findings (in before but not in after)
  const beforeFindingIds = new Set(beforeAudit.findings.map(f => f.id));
  const afterFindingIds = new Set(afterAudit.findings.map(f => f.id));
  
  const resolvedCount = beforeAudit.findings.filter(
    f => !afterFindingIds.has(f.id)
  ).length;

  // Find new findings (in after but not in before)
  const newCount = afterAudit.findings.filter(
    f => !beforeFindingIds.has(f.id)
  ).length;

  // Categorize improvements
  const improvements: Array<{ category: string; change: string }> = [];

  // Compare scores by category
  const beforeByCategory = groupFindingsByCategory(beforeAudit.findings);
  const afterByCategory = groupFindingsByCategory(afterAudit.findings);

  const allCategories = new Set([
    ...Object.keys(beforeByCategory),
    ...Object.keys(afterByCategory)
  ]);

  for (const category of allCategories) {
    const beforeAvg = beforeByCategory[category]?.avgScore || 0;
    const afterAvg = afterByCategory[category]?.avgScore || 0;
    const change = afterAvg - beforeAvg;

    if (Math.abs(change) > 0) {
      improvements.push({
        category,
        change: change > 0 ? `+${change} points` : `${change} points`
      });
    }
  }

  // Update the scheduled audit run with comparison
  await prisma.scheduledAuditRun.updateMany({
    where: {
      auditId: afterAuditId,
      previousAuditId: beforeAuditId
    },
    data: {
      status: 'completed',
      comparisonReport: {
        scoreChange,
        findingsResolved: resolvedCount,
        newFindings: newCount,
        improvements
      } as any,
      completedAt: new Date()
    }
  });

  return {
    scoreChange,
    findingsResolved: resolvedCount,
    newFindings: newCount,
    improvements
  };
}

/**
 * Group findings by category and calculate average scores
 */
function groupFindingsByCategory(findings: any[]): Record<string, { avgScore: number; count: number }> {
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
      count: data.count
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
      createdBy: config.createdBy
    }
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
        lte: future
      }
    },
    orderBy: { nextRunAt: 'asc' }
  });
}
