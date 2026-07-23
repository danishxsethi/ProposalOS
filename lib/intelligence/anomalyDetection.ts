/**
 * Anomaly Detection System
 * Monitors key pipeline metrics, detects deviations, and triggers self-healing.
 * Requirements: 14.1, 14.2, 14.5, 14.6, 14.7, 14.8
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { selfHealing } from '@/lib/intelligence/selfHealing';
import type {
  AnomalyConfig,
  DetectedAnomaly,
  RemediationAction,
  RemediationAttempt,
  RemediationResult,
  RemediationFilters,
  SystemHealthReport,
} from './types';

// In-memory metric config store (keyed by metric name)
const metricConfigs = new Map<string, AnomalyConfig>();

// In-memory remediation effectiveness scores (keyed by action type)
const remediationEffectiveness = new Map<string, { successes: number; total: number }>();

const MAX_REMEDIATION_ATTEMPTS = 3;

/**
 * Compute severity based on deviation from baseline (in std devs)
 */
function computeSeverity(deviation: number): DetectedAnomaly['severity'] {
  const abs = Math.abs(deviation);
  if (abs >= 4) return 'critical';
  if (abs >= 3) return 'high';
  if (abs >= 2) return 'medium';
  return 'low';
}

/**
 * Store or update a metric monitoring configuration.
 * Requirements: 14.1
 */
export async function configureMetric(config: AnomalyConfig): Promise<void> {
  metricConfigs.set(config.metric, config);
  logger.info(
    { event: 'anomaly.metric_configured', metric: config.metric, threshold: config.threshold },
    `Configured anomaly monitoring for metric: ${config.metric}`
  );
}

/**
 * Get the current configuration for a metric (for testing/inspection).
 */
export function getMetricConfig(metric: string): AnomalyConfig | undefined {
  return metricConfigs.get(metric);
}

/**
 * Check all configured metrics against their baselines.
 * Returns anomalies for any metric deviating beyond its threshold.
 * Requirements: 14.1, 14.2
 */
export async function checkMetrics(): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  for (const [metric, config] of metricConfigs.entries()) {
    try {
      const currentValue = await getCurrentMetricValue(metric, config.windowMinutes);
      if (currentValue === null) continue;

      const deviation = computeDeviation(currentValue, config.baseline);

      if (Math.abs(deviation) > config.threshold) {
        const severity = computeSeverity(deviation);

        // Persist to DB
        const record = await prisma.anomalyLog.create({
          data: {
            metric,
            currentValue,
            baselineValue: config.baseline,
            deviation,
            severity,
            status: 'detected',
            remediationAction: config.remediationAction
              ? JSON.stringify(config.remediationAction)
              : null,
          },
        });

        const anomaly: DetectedAnomaly = {
          id: record.id,
          metric,
          currentValue,
          baselineValue: config.baseline,
          deviation,
          severity,
          status: 'detected',
          detectedAt: record.detectedAt,
          remediationAttempts: [],
        };

        anomalies.push(anomaly);

        logger.warn(
          {
            event: 'anomaly.detected',
            anomalyId: record.id,
            metric,
            currentValue,
            baseline: config.baseline,
            deviation,
            severity,
          },
          `Anomaly detected for metric: ${metric}`
        );
      }
    } catch (err) {
      logger.error(
        { event: 'anomaly.check_error', metric, error: err },
        `Error checking metric: ${metric}`
      );
    }
  }

  return anomalies;
}

/**
 * Trigger remediation for a detected anomaly.
 * Dispatches to the appropriate SelfHealingPipeline handler.
 * Requirements: 14.5
 */
export async function triggerRemediation(anomalyId: string): Promise<RemediationResult> {
  const record = await prisma.anomalyLog.findUnique({ where: { id: anomalyId } });
  if (!record) {
    throw new Error(`Anomaly not found: ${anomalyId}`);
  }

  if (record.remediationAttempts >= MAX_REMEDIATION_ATTEMPTS) {
    await escalate(anomalyId, `Max remediation attempts (${MAX_REMEDIATION_ATTEMPTS}) reached`);
    return {
      success: false,
      action: { type: 'alert_only', config: { channels: ['admin'] } },
      notes: 'Max retries reached, escalated to human review',
      completedAt: new Date(),
    };
  }

  const action: RemediationAction = record.remediationAction
    ? (JSON.parse(record.remediationAction) as RemediationAction)
    : { type: 'alert_only', config: { channels: ['admin'] } };

  // Update status to remediating
  await prisma.anomalyLog.update({
    where: { id: anomalyId },
    data: {
      status: 'remediating',
      remediationAttempts: { increment: 1 },
    },
  });

  let result: RemediationResult;
  try {
    result = await selfHealing.dispatch(action, record);

    await prisma.anomalyLog.update({
      where: { id: anomalyId },
      data: {
        status: result.success ? 'resolved' : 'detected',
        resolvedAt: result.success ? new Date() : null,
        remediationResult: result as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    logger.info(
      {
        event: result.success ? 'anomaly.remediated' : 'anomaly.remediation_failed',
        anomalyId,
        action: action.type,
        success: result.success,
      },
      `Remediation ${result.success ? 'succeeded' : 'failed'} for anomaly ${anomalyId}`
    );
  } catch (err) {
    result = {
      success: false,
      action,
      notes: err instanceof Error ? err.message : 'Unknown error',
      completedAt: new Date(),
    };

    await prisma.anomalyLog.update({
      where: { id: anomalyId },
      data: { status: 'detected' },
    });

    logger.error(
      { event: 'anomaly.remediation_error', anomalyId, error: err },
      `Remediation error for anomaly ${anomalyId}`
    );
  }

  return result;
}

/**
 * Update remediation effectiveness scores based on outcome.
 * Requirements: 14.8
 */
export async function learnFromRemediation(
  attemptId: string,
  outcome: 'success' | 'failure'
): Promise<void> {
  // attemptId here is the anomalyId for simplicity (we track by action type)
  const record = await prisma.anomalyLog.findUnique({ where: { id: attemptId } });
  if (!record || !record.remediationAction) return;

  const action = JSON.parse(record.remediationAction) as RemediationAction;
  const key = action.type;
  const current = remediationEffectiveness.get(key) ?? { successes: 0, total: 0 };

  remediationEffectiveness.set(key, {
    successes: current.successes + (outcome === 'success' ? 1 : 0),
    total: current.total + 1,
  });

  logger.info(
    {
      event: 'anomaly.learn_remediation',
      actionType: key,
      outcome,
      effectiveness: remediationEffectiveness.get(key),
    },
    `Updated remediation effectiveness for action: ${key}`
  );
}

/**
 * Escalate an anomaly to human review.
 * Requirements: 14.6
 */
export async function escalate(anomalyId: string, reason: string): Promise<void> {
  await prisma.anomalyLog.update({
    where: { id: anomalyId },
    data: {
      status: 'escalated',
      escalatedAt: new Date(),
    },
  });

  logger.warn(
    { event: 'anomaly.escalated', anomalyId, reason },
    `Anomaly ${anomalyId} escalated: ${reason}`
  );
}

/**
 * Get overall system health report.
 * Requirements: 14.7
 */
export async function getSystemHealth(): Promise<SystemHealthReport> {
  const activeAnomalyRecords = await prisma.anomalyLog.findMany({
    where: {
      status: { in: ['detected', 'remediating', 'escalated'] },
    },
    orderBy: { detectedAt: 'desc' },
    take: 50,
  });

  const activeAnomalies: DetectedAnomaly[] = activeAnomalyRecords.map((r) => ({
    id: r.id,
    metric: r.metric,
    currentValue: r.currentValue,
    baselineValue: r.baselineValue,
    deviation: r.deviation,
    severity: r.severity as DetectedAnomaly['severity'],
    status: r.status as DetectedAnomaly['status'],
    detectedAt: r.detectedAt,
    remediationAttempts: [],
  }));

  const hasCritical = activeAnomalies.some((a) => a.severity === 'critical');
  const hasHigh = activeAnomalies.some((a) => a.severity === 'high');
  const overallStatus: SystemHealthReport['overallStatus'] = hasCritical
    ? 'critical'
    : hasHigh
    ? 'degraded'
    : 'healthy';

  const metrics = Array.from(metricConfigs.entries()).map(([name, config]) => {
    const anomaly = activeAnomalies.find((a) => a.metric === name);
    return {
      name,
      value: anomaly?.currentValue ?? config.baseline,
      baseline: config.baseline,
      status: anomaly
        ? anomaly.severity === 'critical' || anomaly.severity === 'high'
          ? ('critical' as const)
          : ('warning' as const)
        : ('normal' as const),
    };
  });

  return {
    overallStatus,
    metrics,
    activeAnomalies,
    generatedAt: new Date(),
  };
}

/**
 * Get remediation history with optional filters.
 * Requirements: 14.7
 */
export async function getRemediationHistory(
  filters: RemediationFilters = {}
): Promise<RemediationAttempt[]> {
  const where: Record<string, unknown> = {};
  if (filters.metric) where.metric = filters.metric;
  if (filters.dateRange) {
    where.detectedAt = {
      gte: filters.dateRange.start,
      lte: filters.dateRange.end,
    };
  }

  const records = await prisma.anomalyLog.findMany({
    where: {
      ...where,
      status: { in: ['resolved', 'escalated'] },
    },
    orderBy: { detectedAt: 'desc' },
    take: 100,
  });

  return records.map((r) => ({
    id: r.id,
    anomalyId: r.id,
    action: r.remediationAction
      ? (JSON.parse(r.remediationAction) as RemediationAction)
      : { type: 'alert_only' as const, config: { channels: [] } },
    outcome: r.status === 'resolved' ? ('success' as const) : ('failure' as const),
    attemptedAt: r.detectedAt,
    completedAt: r.resolvedAt ?? undefined,
  }));
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Compute deviation in standard deviations.
 * Uses a simple z-score: (current - baseline) / (baseline * 0.1) as a proxy std dev.
 */
function computeDeviation(current: number, baseline: number): number {
  if (baseline === 0) return current === 0 ? 0 : Infinity;
  // Approximate std dev as 10% of baseline
  const stdDev = Math.max(baseline * 0.1, 0.001);
  return (current - baseline) / stdDev;
}

/**
 * Get the current value for a metric.
 * In production this would query real-time metrics; here we check the DB for recent data.
 */
async function getCurrentMetricValue(
  metric: string,
  windowMinutes: number
): Promise<number | null> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Check if there's a recent anomaly record with a current value for this metric
  // In a real system, this would query a metrics store (e.g., Prometheus, Datadog)
  // For now, we return null to indicate no current data (no false positives)
  const recent = await prisma.anomalyLog.findFirst({
    where: {
      metric,
      detectedAt: { gte: since },
      status: { not: 'resolved' },
    },
    orderBy: { detectedAt: 'desc' },
  });

  // If there's already a detected anomaly, return its current value
  if (recent) return recent.currentValue;

  return null;
}

/**
 * Directly record a metric value and check for anomaly.
 * This is the primary entry point for external metric reporters.
 * Requirements: 14.1, 14.2
 */
export async function recordMetricValue(
  metric: string,
  value: number
): Promise<DetectedAnomaly | null> {
  const config = metricConfigs.get(metric);
  if (!config) return null;

  const deviation = computeDeviation(value, config.baseline);

  if (Math.abs(deviation) <= config.threshold) return null;

  const severity = computeSeverity(deviation);

  const record = await prisma.anomalyLog.create({
    data: {
      metric,
      currentValue: value,
      baselineValue: config.baseline,
      deviation,
      severity,
      status: 'detected',
      remediationAction: config.remediationAction
        ? JSON.stringify(config.remediationAction)
        : null,
    },
  });

  const anomaly: DetectedAnomaly = {
    id: record.id,
    metric,
    currentValue: value,
    baselineValue: config.baseline,
    deviation,
    severity,
    status: 'detected',
    detectedAt: record.detectedAt,
    remediationAttempts: [],
  };

  logger.warn(
    { event: 'anomaly.detected', anomalyId: record.id, metric, value, deviation, severity },
    `Anomaly detected: ${metric} = ${value} (${deviation.toFixed(2)} std devs from baseline)`
  );

  return anomaly;
}

/**
 * Get remediation effectiveness scores (for reporting).
 * Requirements: 14.7
 */
export function getRemediationEffectiveness(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, stats] of remediationEffectiveness.entries()) {
    result[key] = stats.total > 0 ? stats.successes / stats.total : 0;
  }
  return result;
}
