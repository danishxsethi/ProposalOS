/**
 * Competitive Moat Metrics
 *
 * Tracks and reports on the five competitive moat dimensions:
 * data, speed, cost, network, and brand.
 *
 * Uses in-memory stores and simulated values — no direct Prisma/DB interaction.
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

import { computeLift } from '@/lib/intelligence/crossTenantLearning';
import { getCostAnalytics, getBenchmarks } from '@/lib/intelligence/modelOrchestration';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataMoat {
  /** Total audits completed across all tenants */
  totalAuditsCompleted: number;
  /** Unique outcome data points (won/lost/ghosted records) */
  uniqueOutcomeDataPoints: number;
  /** Week-over-week growth rate (0-1) */
  weekOverWeekGrowth: number;
}

export interface SpeedMoat {
  /** Average full audit time in milliseconds */
  averageAuditTimeMs: number;
  /** p95 audit latency in milliseconds */
  p95LatencyMs: number;
  /** Week-over-week improvement (positive = faster) */
  weekOverWeekImprovementMs: number;
}

export interface CostMoat {
  /** Cost per audit in cents */
  costPerAuditCents: number;
  /** Cost trend: 'decreasing' | 'stable' | 'increasing' */
  costTrend: 'decreasing' | 'stable' | 'increasing';
  /** Historical weekly cost per audit (most recent last) */
  weeklyHistory: number[];
}

export interface NetworkMoat {
  /** Number of agencies (tenants) on the platform */
  agenciesOnPlatform: number;
  /** Cross-tenant learning lift: win rate improvement from shared model */
  crossTenantLearningLift: number;
  /** Week-over-week agency growth */
  weekOverWeekAgencyGrowth: number;
}

export interface BrandMoat {
  /** Number of published case studies */
  caseStudiesPublished: number;
  /** Brand mentions (from manual input or external API) */
  brandMentions: number;
  /** Week-over-week mention growth */
  weekOverWeekMentionGrowth: number;
}

export interface MoatDimension<T> {
  /** The moat data */
  data: T;
  /** Week-over-week trend: 'improving' | 'stable' | 'declining' */
  weekOverWeekTrend: 'improving' | 'stable' | 'declining';
  /** Snapshot timestamp */
  snapshotAt: Date;
}

export interface MoatReport {
  data: MoatDimension<DataMoat>;
  speed: MoatDimension<SpeedMoat>;
  cost: MoatDimension<CostMoat>;
  network: MoatDimension<NetworkMoat>;
  brand: MoatDimension<BrandMoat>;
  generatedAt: Date;
}

export interface MoatSnapshot {
  report: MoatReport;
  recordedAt: Date;
}

// ─── In-memory stores ─────────────────────────────────────────────────────────

/** Weekly snapshots for trend calculation (most recent last) */
const snapshotHistory: MoatSnapshot[] = [];

/** Manual brand input store */
const brandStore = {
  caseStudiesPublished: 0,
  brandMentions: 0,
};

/** Simulated platform-level counters */
const platformCounters = {
  totalAuditsCompleted: 500_000,
  uniqueOutcomeDataPoints: 420_000,
  agenciesOnPlatform: 87,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trendFromDelta(
  current: number,
  previous: number,
  higherIsBetter = true
): 'improving' | 'stable' | 'declining' {
  if (previous === 0) return 'stable';
  const delta = (current - previous) / Math.abs(previous);
  const threshold = 0.02; // 2% change threshold
  if (Math.abs(delta) < threshold) return 'stable';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'improving' : 'declining';
}

function lastSnapshot(): MoatReport | null {
  if (snapshotHistory.length === 0) return null;
  return snapshotHistory[snapshotHistory.length - 1].report;
}

// ─── Moat getters ─────────────────────────────────────────────────────────────

/**
 * Get data moat metrics: total audits completed and unique outcome data points.
 * Requirements: 20.1
 */
export async function getDataMoat(): Promise<DataMoat> {
  // In production these would come from DB aggregation.
  // Here we use the in-memory counter with a small simulated increment.
  const totalAuditsCompleted = platformCounters.totalAuditsCompleted;
  const uniqueOutcomeDataPoints = platformCounters.uniqueOutcomeDataPoints;

  const prev = lastSnapshot()?.data.data;
  const weekOverWeekGrowth =
    prev && prev.totalAuditsCompleted > 0
      ? (totalAuditsCompleted - prev.totalAuditsCompleted) / prev.totalAuditsCompleted
      : 0;

  return { totalAuditsCompleted, uniqueOutcomeDataPoints, weekOverWeekGrowth };
}

/**
 * Get speed moat metrics: average audit time and p95 latency from pipeline metrics.
 * Requirements: 20.2
 */
export async function getSpeedMoat(): Promise<SpeedMoat> {
  // Pull p95 latency from model benchmarks across all task types
  const benchmarks = await getBenchmarks();

  let p95Sum = 0;
  let p50Sum = 0;
  let count = 0;

  for (const b of benchmarks) {
    p95Sum += b.metrics.latencyP95;
    p50Sum += b.metrics.latencyP50;
    count++;
  }

  // Fallback to target values when no benchmark data exists
  const averageAuditTimeMs = count > 0 ? p50Sum / count : 3_200;
  const p95LatencyMs = count > 0 ? p95Sum / count : 4_800;

  const prev = lastSnapshot()?.speed.data;
  const weekOverWeekImprovementMs = prev
    ? prev.averageAuditTimeMs - averageAuditTimeMs
    : 0;

  return { averageAuditTimeMs, p95LatencyMs, weekOverWeekImprovementMs };
}

/**
 * Get cost moat metrics: cost per audit and cost trend from ModelBenchmark data.
 * Requirements: 20.3
 */
export async function getCostMoat(): Promise<CostMoat> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const analytics = await getCostAnalytics({ start: thirtyDaysAgo, end: now });

  const costPerAuditCents = analytics.averageCostPerAuditCents;

  // Build weekly history from snapshots
  const weeklyHistory = snapshotHistory
    .slice(-8) // last 8 weeks
    .map((s) => s.report.cost.data.costPerAuditCents);

  // Add current value
  weeklyHistory.push(costPerAuditCents);

  const costTrend: CostMoat['costTrend'] =
    analytics.trend === 'increasing'
      ? 'increasing'
      : analytics.trend === 'decreasing'
      ? 'decreasing'
      : 'stable';

  return { costPerAuditCents, costTrend, weeklyHistory };
}

/**
 * Get network moat metrics: agencies on platform and cross-tenant learning lift.
 * Requirements: 20.4
 */
export async function getNetworkMoat(): Promise<NetworkMoat> {
  const agenciesOnPlatform = platformCounters.agenciesOnPlatform;

  // Use a representative tenant ID for lift calculation.
  // In production this would aggregate lift across all tenants.
  let crossTenantLearningLift = 0;
  try {
    const lift = await computeLift('platform-aggregate');
    crossTenantLearningLift = lift.liftPercent;
  } catch {
    // No data yet — lift stays 0
    crossTenantLearningLift = 0;
  }

  const prev = lastSnapshot()?.network.data;
  const weekOverWeekAgencyGrowth =
    prev && prev.agenciesOnPlatform > 0
      ? (agenciesOnPlatform - prev.agenciesOnPlatform) / prev.agenciesOnPlatform
      : 0;

  return { agenciesOnPlatform, crossTenantLearningLift, weekOverWeekAgencyGrowth };
}

/**
 * Get brand moat metrics: case studies published and brand mentions.
 * Requirements: 20.5
 */
export async function getBrandMoat(): Promise<BrandMoat> {
  const { caseStudiesPublished, brandMentions } = brandStore;

  const prev = lastSnapshot()?.brand.data;
  const weekOverWeekMentionGrowth =
    prev && prev.brandMentions > 0
      ? (brandMentions - prev.brandMentions) / prev.brandMentions
      : 0;

  return { caseStudiesPublished, brandMentions, weekOverWeekMentionGrowth };
}

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * Generate a full moat report with all five dimensions and week-over-week trends.
 * Requirements: 20.1–20.5, 20.6
 */
export async function getMoatReport(): Promise<MoatReport> {
  const [dataMoat, speedMoat, costMoat, networkMoat, brandMoat] = await Promise.all([
    getDataMoat(),
    getSpeedMoat(),
    getCostMoat(),
    getNetworkMoat(),
    getBrandMoat(),
  ]);

  const prev = lastSnapshot();
  const now = new Date();

  const report: MoatReport = {
    data: {
      data: dataMoat,
      weekOverWeekTrend: prev
        ? trendFromDelta(dataMoat.totalAuditsCompleted, prev.data.data.totalAuditsCompleted, true)
        : 'stable',
      snapshotAt: now,
    },
    speed: {
      data: speedMoat,
      weekOverWeekTrend: prev
        ? trendFromDelta(speedMoat.averageAuditTimeMs, prev.speed.data.averageAuditTimeMs, false)
        : 'stable',
      snapshotAt: now,
    },
    cost: {
      data: costMoat,
      weekOverWeekTrend: prev
        ? trendFromDelta(costMoat.costPerAuditCents, prev.cost.data.costPerAuditCents, false)
        : 'stable',
      snapshotAt: now,
    },
    network: {
      data: networkMoat,
      weekOverWeekTrend: prev
        ? trendFromDelta(networkMoat.agenciesOnPlatform, prev.network.data.agenciesOnPlatform, true)
        : 'stable',
      snapshotAt: now,
    },
    brand: {
      data: brandMoat,
      weekOverWeekTrend: prev
        ? trendFromDelta(brandMoat.brandMentions, prev.brand.data.brandMentions, true)
        : 'stable',
      snapshotAt: now,
    },
    generatedAt: now,
  };

  return report;
}

// ─── Snapshot management ──────────────────────────────────────────────────────

/**
 * Record a weekly moat snapshot for trend calculation.
 * Call this once per week (e.g., from the moat-report cron job).
 */
export function recordMoatSnapshot(report: MoatReport): void {
  snapshotHistory.push({ report, recordedAt: new Date() });

  // Keep at most 52 weeks of history
  if (snapshotHistory.length > 52) {
    snapshotHistory.shift();
  }
}

/**
 * Get all recorded snapshots (for testing and reporting).
 */
export function getSnapshotHistory(): MoatSnapshot[] {
  return [...snapshotHistory];
}

// ─── Manual brand input ───────────────────────────────────────────────────────

/**
 * Update brand moat inputs manually (or from an external API integration).
 */
export function updateBrandMetrics(updates: {
  caseStudiesPublished?: number;
  brandMentions?: number;
}): void {
  if (updates.caseStudiesPublished !== undefined) {
    brandStore.caseStudiesPublished = updates.caseStudiesPublished;
  }
  if (updates.brandMentions !== undefined) {
    brandStore.brandMentions = updates.brandMentions;
  }
}

/**
 * Update platform-level counters (called by pipeline cron jobs).
 */
export function updatePlatformCounters(updates: {
  totalAuditsCompleted?: number;
  uniqueOutcomeDataPoints?: number;
  agenciesOnPlatform?: number;
}): void {
  if (updates.totalAuditsCompleted !== undefined) {
    platformCounters.totalAuditsCompleted = updates.totalAuditsCompleted;
  }
  if (updates.uniqueOutcomeDataPoints !== undefined) {
    platformCounters.uniqueOutcomeDataPoints = updates.uniqueOutcomeDataPoints;
  }
  if (updates.agenciesOnPlatform !== undefined) {
    platformCounters.agenciesOnPlatform = updates.agenciesOnPlatform;
  }
}
