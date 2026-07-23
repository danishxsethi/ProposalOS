/**
 * Moat Reporting and Alerting
 *
 * Detects negative trends in competitive moat metrics, sends alerts to
 * platform administrators, estimates competitor catch-up time, and
 * generates weekly moat reports.
 *
 * Requirements: 20.6, 20.7, 20.8
 */

import {
  getMoatReport,
  getSnapshotHistory,
  recordMoatSnapshot,
  type MoatReport,
} from '@/lib/platform/metrics/moatMetrics';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The five moat dimension keys */
export type MoatMetricKey = 'data' | 'speed' | 'cost' | 'network' | 'brand';

/**
 * A metric that has been declining for 2+ consecutive weeks.
 */
export interface NegativeTrend {
  /** Which moat dimension is declining */
  metric: MoatMetricKey;
  /** Number of consecutive declining weeks detected */
  consecutiveWeeks: number;
  /** Human-readable description of the trend */
  description: string;
}

/**
 * A recorded alert for a declining moat metric.
 */
export interface AlertRecord {
  /** ISO timestamp when the alert was created */
  timestamp: string;
  /** Which moat dimension triggered the alert */
  metric: MoatMetricKey;
  /** Description of the trend that triggered the alert */
  trendDescription: string;
  /** Unique alert ID */
  id: string;
}

/**
 * Competitor baseline for catch-up time estimation.
 */
export interface CompetitorBaseline {
  /**
   * The competitor's current value for the metric.
   * For speed/cost moats (lower-is-better), this is their current value.
   * For data/network/brand moats (higher-is-better), this is their current value.
   */
  currentValue: number;
  /**
   * The competitor's weekly growth rate as a fraction (e.g. 0.05 = 5%/week).
   * For lower-is-better metrics, a positive rate means they are improving
   * (i.e. their value is decreasing by this fraction each week).
   */
  weeklyGrowthRate: number;
}

/**
 * Result of `generateWeeklyMoatReport()`.
 */
export interface WeeklyMoatReportResult {
  /** The full moat report generated this week */
  report: MoatReport;
  /** Any alerts that were sent due to negative trends */
  alertsSent: AlertRecord[];
  /** All negative trends detected in this report */
  negativeTrends: NegativeTrend[];
}

// ─── In-memory alert log ──────────────────────────────────────────────────────

const alertLog: AlertRecord[] = [];
let alertCounter = 0;

/**
 * Retrieve all recorded alerts (for testing and admin inspection).
 */
export function getAlertLog(): AlertRecord[] {
  return [...alertLog];
}

/**
 * Clear the alert log (for testing).
 */
export function clearAlertLog(): void {
  alertLog.length = 0;
  alertCounter = 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the primary numeric value for a moat dimension from a report.
 * Used to compare values across snapshots.
 *
 * For higher-is-better metrics (data, network, brand) a larger value is better.
 * For lower-is-better metrics (speed, cost) a smaller value is better.
 */
function getPrimaryValue(report: MoatReport, metric: MoatMetricKey): number {
  switch (metric) {
    case 'data':
      return report.data.data.totalAuditsCompleted;
    case 'speed':
      // Lower is better — use average audit time
      return report.speed.data.averageAuditTimeMs;
    case 'cost':
      // Lower is better — use cost per audit
      return report.cost.data.costPerAuditCents;
    case 'network':
      return report.network.data.agenciesOnPlatform;
    case 'brand':
      return report.brand.data.brandMentions;
  }
}

/**
 * Returns true if `current` is worse than `previous` for the given metric.
 * "Worse" means lower for higher-is-better metrics and higher for lower-is-better.
 */
function isWorseThan(
  current: number,
  previous: number,
  metric: MoatMetricKey
): boolean {
  const lowerIsBetter = metric === 'speed' || metric === 'cost';
  if (lowerIsBetter) {
    // Worse = current is higher than previous (by more than 2% to avoid noise)
    return current > previous * 1.02;
  } else {
    // Worse = current is lower than previous (by more than 2%)
    return current < previous * 0.98;
  }
}

function metricDescription(metric: MoatMetricKey): string {
  switch (metric) {
    case 'data':
      return 'Data moat (total audits completed)';
    case 'speed':
      return 'Speed moat (average audit time)';
    case 'cost':
      return 'Cost moat (cost per audit)';
    case 'network':
      return 'Network moat (agencies on platform)';
    case 'brand':
      return 'Brand moat (brand mentions)';
  }
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Check the current report against the last 2 snapshots in history.
 * Returns an array of `NegativeTrend` objects for any metric that has been
 * declining for 2+ consecutive weeks.
 *
 * A metric is "declining" if its value is worse than the previous week's value
 * for 2+ consecutive weeks.
 *
 * Requirements: 20.7
 */
export function checkNegativeTrends(report: MoatReport): NegativeTrend[] {
  const history = getSnapshotHistory();

  // We need at least 2 prior snapshots to detect 2 consecutive declining weeks
  if (history.length < 2) {
    return [];
  }

  const metrics: MoatMetricKey[] = ['data', 'speed', 'cost', 'network', 'brand'];
  const trends: NegativeTrend[] = [];

  // The two most recent snapshots (oldest first)
  const olderSnapshot = history[history.length - 2].report;
  const recentSnapshot = history[history.length - 1].report;

  for (const metric of metrics) {
    const olderValue = getPrimaryValue(olderSnapshot, metric);
    const recentValue = getPrimaryValue(recentSnapshot, metric);
    const currentValue = getPrimaryValue(report, metric);

    // Week 1 decline: recentSnapshot worse than olderSnapshot
    const week1Declining = isWorseThan(recentValue, olderValue, metric);
    // Week 2 decline: current report worse than recentSnapshot
    const week2Declining = isWorseThan(currentValue, recentValue, metric);

    if (week1Declining && week2Declining) {
      // Count total consecutive declining weeks (look further back if available)
      let consecutiveWeeks = 2;
      for (let i = history.length - 3; i >= 0; i--) {
        const evenOlderValue = getPrimaryValue(history[i].report, metric);
        const nextValue = getPrimaryValue(history[i + 1].report, metric);
        if (isWorseThan(nextValue, evenOlderValue, metric)) {
          consecutiveWeeks++;
        } else {
          break;
        }
      }

      trends.push({
        metric,
        consecutiveWeeks,
        description: `${metricDescription(metric)} has been declining for ${consecutiveWeeks} consecutive weeks`,
      });
    }
  }

  return trends;
}

/**
 * Record an alert in the in-memory alert log and return the `AlertRecord`.
 * No actual email sending — just records the alert for administrator review.
 *
 * Requirements: 20.7
 */
export function sendMoatAlert(metric: MoatMetricKey, trend: NegativeTrend): AlertRecord {
  alertCounter += 1;
  const record: AlertRecord = {
    id: `moat-alert-${alertCounter}`,
    timestamp: new Date().toISOString(),
    metric,
    trendDescription: trend.description,
  };

  alertLog.push(record);

  // In production this would dispatch to an email/Slack/PagerDuty integration.
  // For now we log to console so operators can see it in server logs.
  console.warn(
    `[MoatAlert] ${record.timestamp} | ${record.id} | ${record.metric} | ${record.trendDescription}`
  );

  return record;
}

/**
 * Estimate how many weeks it would take a competitor to catch up to our moat
 * position, given their current value and weekly growth rate.
 *
 * Returns `Infinity` if:
 * - Our moat is growing faster than the competitor is closing the gap, OR
 * - The competitor has already surpassed us, OR
 * - The growth rate is zero or negative (competitor not improving)
 *
 * Requirements: 20.8
 */
export function estimateCatchUpTime(
  metric: MoatMetricKey,
  competitorBaseline: CompetitorBaseline,
  currentReport: MoatReport
): number {
  const ourValue = getPrimaryValue(currentReport, metric);
  const { currentValue: theirValue, weeklyGrowthRate } = competitorBaseline;

  const lowerIsBetter = metric === 'speed' || metric === 'cost';

  if (lowerIsBetter) {
    // For lower-is-better metrics (speed, cost):
    // We have the moat if our value < their value.
    // Competitor catches up when their value reaches our value.
    // Their value decreases by weeklyGrowthRate each week.

    if (theirValue <= ourValue) {
      // Competitor already at or better than us — no moat
      return 0;
    }

    if (weeklyGrowthRate <= 0) {
      // Competitor not improving — moat is safe indefinitely
      return Infinity;
    }

    // Our weekly improvement rate (from weekOverWeekImprovementMs / costTrend)
    // We approximate our improvement from the snapshot history
    const ourWeeklyImprovement = getOurWeeklyImprovementRate(metric, currentReport);

    // Gap = theirValue - ourValue (positive means we have a moat)
    const gap = theirValue - ourValue;

    // Each week: their value decreases by theirValue * weeklyGrowthRate
    // Our value decreases by ourValue * ourWeeklyImprovement
    // Net gap change per week = -(theirValue * weeklyGrowthRate) + (ourValue * ourWeeklyImprovement)
    // If net gap change >= 0, our moat is growing or stable → Infinity
    const theirWeeklyImprovement = theirValue * weeklyGrowthRate;
    const ourWeeklyImprovementAbs = ourValue * ourWeeklyImprovement;
    const netGapChangePerWeek = ourWeeklyImprovementAbs - theirWeeklyImprovement;

    if (netGapChangePerWeek >= 0) {
      // Our moat is growing at least as fast as competitor is closing it
      return Infinity;
    }

    // Weeks until gap closes: gap / |netGapChangePerWeek|
    return Math.ceil(gap / Math.abs(netGapChangePerWeek));
  } else {
    // For higher-is-better metrics (data, network, brand):
    // We have the moat if our value > their value.
    // Competitor catches up when their value reaches our value.

    if (theirValue >= ourValue) {
      // Competitor already at or ahead of us — no moat
      return 0;
    }

    if (weeklyGrowthRate <= 0) {
      // Competitor not growing — moat is safe indefinitely
      return Infinity;
    }

    const ourWeeklyGrowthRate = getOurWeeklyImprovementRate(metric, currentReport);

    // Gap = ourValue - theirValue (positive means we have a moat)
    const gap = ourValue - theirValue;

    // Each week: their value increases by theirValue * weeklyGrowthRate
    // Our value increases by ourValue * ourWeeklyGrowthRate
    // Net gap change per week = (ourValue * ourWeeklyGrowthRate) - (theirValue * weeklyGrowthRate)
    const theirWeeklyGain = theirValue * weeklyGrowthRate;
    const ourWeeklyGain = ourValue * ourWeeklyGrowthRate;
    const netGapChangePerWeek = ourWeeklyGain - theirWeeklyGain;

    if (netGapChangePerWeek >= 0) {
      // Our moat is growing at least as fast as competitor is closing it
      return Infinity;
    }

    // Weeks until gap closes
    return Math.ceil(gap / Math.abs(netGapChangePerWeek));
  }
}

/**
 * Derive our approximate weekly improvement rate for a metric from snapshot history.
 * Returns a fraction (e.g. 0.02 = 2% per week improvement).
 * Falls back to 0 if insufficient history.
 */
function getOurWeeklyImprovementRate(
  metric: MoatMetricKey,
  currentReport: MoatReport
): number {
  const history = getSnapshotHistory();
  if (history.length === 0) return 0;

  const prevValue = getPrimaryValue(history[history.length - 1].report, metric);
  const currentValue = getPrimaryValue(currentReport, metric);

  if (prevValue === 0) return 0;

  const lowerIsBetter = metric === 'speed' || metric === 'cost';
  if (lowerIsBetter) {
    // Improvement = how much we reduced the value (positive = improving)
    return Math.max(0, (prevValue - currentValue) / prevValue);
  } else {
    // Improvement = how much we grew the value (positive = improving)
    return Math.max(0, (currentValue - prevValue) / prevValue);
  }
}

/**
 * Generate the weekly moat report:
 * 1. Fetch the current moat report
 * 2. Check for negative trends against the last 2 snapshots
 * 3. Send alerts for any declining metrics
 * 4. Record the snapshot for future trend detection
 * 5. Return the full result
 *
 * Requirements: 20.6, 20.7, 20.8
 */
export async function generateWeeklyMoatReport(): Promise<WeeklyMoatReportResult> {
  const report = await getMoatReport();

  const negativeTrends = checkNegativeTrends(report);

  const alertsSent: AlertRecord[] = [];
  for (const trend of negativeTrends) {
    const alert = sendMoatAlert(trend.metric, trend);
    alertsSent.push(alert);
  }

  // Record the snapshot so future calls can detect trends against this week
  recordMoatSnapshot(report);

  return {
    report,
    alertsSent,
    negativeTrends,
  };
}
