/**
 * Anomaly Check Cron Endpoint
 * Runs every 5 minutes to detect and remediate pipeline anomalies.
 * Schedule: every 5 minutes
 * Reqs: 14.1, 14.2, 14.5
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  checkMetrics,
  triggerRemediation,
  escalate,
} from '@/lib/intelligence/anomalyDetection';
import { prisma } from '@/lib/prisma';

const MAX_REMEDIATION_ATTEMPTS = 3;

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    logger.info({ event: 'cron.anomaly_check.start' }, 'Starting anomaly check');

    // 1. Detect anomalies across all configured metrics
    const newAnomalies = await checkMetrics();

    // 2. Also fetch existing unresolved anomalies that need remediation
    const pendingAnomalies = await prisma.anomalyLog.findMany({
      where: {
        status: { in: ['detected', 'remediating'] },
        remediationAttempts: { lt: MAX_REMEDIATION_ATTEMPTS },
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'asc' }],
    });

    const remediationResults: Array<{
      anomalyId: string;
      metric: string;
      success: boolean;
      notes?: string;
    }> = [];

    // 3. Trigger remediation for each anomaly
    for (const anomaly of pendingAnomalies) {
      try {
        const result = await triggerRemediation(anomaly.id);
        remediationResults.push({
          anomalyId: anomaly.id,
          metric: anomaly.metric,
          success: result.success,
          notes: result.notes,
        });
      } catch (err) {
        logger.error(
          { event: 'cron.anomaly_check.remediation_error', anomalyId: anomaly.id, error: err },
          `Remediation error for anomaly ${anomaly.id}`
        );
        remediationResults.push({
          anomalyId: anomaly.id,
          metric: anomaly.metric,
          success: false,
          notes: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // 4. Escalate anomalies that have exceeded max retry count
    const escalationCandidates = await prisma.anomalyLog.findMany({
      where: {
        status: { in: ['detected', 'remediating'] },
        remediationAttempts: { gte: MAX_REMEDIATION_ATTEMPTS },
      },
    });

    const escalated: string[] = [];
    for (const anomaly of escalationCandidates) {
      await escalate(
        anomaly.id,
        `Exceeded max remediation attempts (${anomaly.remediationAttempts})`
      );
      escalated.push(anomaly.id);

      // Send admin notification for escalated anomalies
      await notifyAdmins(anomaly);
    }

    const durationMs = Date.now() - startedAt;

    logger.info(
      {
        event: 'cron.anomaly_check.complete',
        newAnomalies: newAnomalies.length,
        pendingRemediated: pendingAnomalies.length,
        escalated: escalated.length,
        durationMs,
      },
      'Anomaly check complete'
    );

    return NextResponse.json({
      success: true,
      newAnomalies: newAnomalies.length,
      remediationAttempts: remediationResults.length,
      remediationSuccesses: remediationResults.filter((r) => r.success).length,
      escalated: escalated.length,
      durationMs,
      results: remediationResults,
    });
  } catch (error) {
    logger.error(
      { event: 'cron.anomaly_check.error', error },
      'Anomaly check cron failed'
    );

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Send admin notification for escalated anomalies.
 * In production this would send email/Slack/PagerDuty alerts.
 */
async function notifyAdmins(anomaly: {
  id: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  deviation: number;
  severity: string;
  remediationAttempts: number;
}): Promise<void> {
  logger.warn(
    {
      event: 'anomaly.admin_notification',
      anomalyId: anomaly.id,
      metric: anomaly.metric,
      severity: anomaly.severity,
      currentValue: anomaly.currentValue,
      baselineValue: anomaly.baselineValue,
      deviation: anomaly.deviation.toFixed(2),
      remediationAttempts: anomaly.remediationAttempts,
    },
    `[ADMIN ALERT] Anomaly escalated: ${anomaly.metric} (${anomaly.severity}) — ${anomaly.remediationAttempts} failed remediation attempts`
  );

  // TODO: Integrate with email/Slack/PagerDuty for production alerts
}
