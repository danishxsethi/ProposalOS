import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/notifications/email';

export interface HallucinationEvent {
  tenantId: string;
  auditId?: string;
  proposalId?: string;
  category: 'data_fabrication' | 'metric_inflation' | 'false_competitor_claim' | 'unsupported_recommendation';
  flaggedText: string;
  location: string;
  timestamp: Date;
}

export interface WeeklyHallucinationReport {
  weekStart: Date;
  totalClaims: number;
  caughtHallucinations: number;
  rate: number;
  byCategory: Record<string, number>;
}

/**
 * Log a hallucination event
 */
export async function logHallucination(event: HallucinationEvent): Promise<void> {
  const weekStart = getMonday(event.timestamp);

  await prisma.hallucinationLog.create({
    data: {
      tenantId: event.tenantId,
      auditId: event.auditId,
      proposalId: event.proposalId,
      category: event.category,
      flaggedText: event.flaggedText,
      location: event.location,
      weekStart,
      createdAt: event.timestamp,
    },
  });
}

/**
 * Compute weekly hallucination rate
 */
export async function computeWeeklyRate(
  tenantId: string,
  weekStart: Date
): Promise<WeeklyHallucinationReport> {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Count hallucinations caught this week
  const caughtHallucinations = await prisma.hallucinationLog.count({
    where: {
      tenantId,
      weekStart,
    },
  });

  // Estimate total claims processed (based on proposals and audits)
  // For now, we'll use a simple heuristic: assume ~50 claims per proposal
  const proposalsThisWeek = await prisma.proposal.count({
    where: {
      tenantId,
      createdAt: {
        gte: weekStart,
        lt: weekEnd,
      },
    },
  });

  const totalClaims = Math.max(proposalsThisWeek * 50, 1); // Avoid division by zero
  const rate = caughtHallucinations / totalClaims;

  // Group by category
  const byCategory: Record<string, number> = {};
  const logs = await prisma.hallucinationLog.findMany({
    where: {
      tenantId,
      weekStart,
    },
  });

  for (const log of logs) {
    byCategory[log.category] = (byCategory[log.category] || 0) + 1;
  }

  return {
    weekStart,
    totalClaims,
    caughtHallucinations,
    rate,
    byCategory,
  };
}

/**
 * Check if hallucination rate exceeds threshold
 */
export async function checkRateAlert(tenantId: string): Promise<boolean> {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const hallucinations = await prisma.hallucinationLog.count({
    where: {
      tenantId,
      createdAt: {
        gte: sevenDaysAgo,
        lte: today,
      },
    },
  });

  // Estimate total claims (same heuristic as above)
  const proposals = await prisma.proposal.count({
    where: {
      tenantId,
      createdAt: {
        gte: sevenDaysAgo,
        lte: today,
      },
    },
  });

  const totalClaims = Math.max(proposals * 50, 1);
  const rate = hallucinations / totalClaims;

  // Alert threshold: 5% (0.05)
  return rate > 0.05;
}

/**
 * Send alert email if rate exceeds threshold
 */
export async function sendRateAlert(tenantId: string): Promise<void> {
  const shouldAlert = await checkRateAlert(tenantId);

  if (!shouldAlert) {
    return;
  }

  // Get tenant admin email
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        where: { role: 'owner' },
        take: 1,
      },
    },
  });

  if (!tenant || !tenant.users[0]) {
    return;
  }

  const adminEmail = tenant.users[0].email;

  // Compute rate for email
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const hallucinations = await prisma.hallucinationLog.count({
    where: {
      tenantId,
      createdAt: {
        gte: sevenDaysAgo,
        lte: today,
      },
    },
  });

  const proposals = await prisma.proposal.count({
    where: {
      tenantId,
      createdAt: {
        gte: sevenDaysAgo,
        lte: today,
      },
    },
  });

  const totalClaims = Math.max(proposals * 50, 1);
  const rate = (hallucinations / totalClaims * 100).toFixed(2);

  const subject = `⚠️ High Hallucination Rate Alert - ${tenant.name}`;
  const body = `
Your tenant "${tenant.name}" has exceeded the hallucination rate threshold.

7-Day Hallucination Rate: ${rate}%
Caught Hallucinations: ${hallucinations}
Estimated Total Claims: ${totalClaims}

This may indicate a quality issue with your audit or proposal generation. Please review recent audits and proposals.

Recommended Actions:
1. Review recent proposals for accuracy
2. Check audit module outputs
3. Consider adjusting confidence thresholds

For more details, visit your dashboard.
  `.trim();

  await sendEmail({
    to: adminEmail,
    subject,
    body,
  });
}

/**
 * Get Monday of the week for a given date
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}
