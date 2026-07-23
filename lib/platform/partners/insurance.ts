/**
 * Insurance Partnership Data Feed
 *
 * Exposes anonymized audit risk signals to cyber insurance underwriters.
 * All data is stripped of PII and tenant identifiers before export —
 * only aggregated, anonymized risk signals are shared.
 *
 * Requirements: 19.4, 19.6
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Raw audit data submitted by the pipeline. Contains business-level detail
 * that must be anonymized before being shared with insurance partners.
 */
export interface AuditData {
  /** Internal audit ID — stripped before export. */
  auditId: string;
  /** Vertical/industry of the audited business. */
  vertical: string;
  /** Geographic region (e.g. 'northeast', 'southwest') — coarse-grained, not city/state. */
  geoRegion: string;
  /** Audit scores per category (0–100). */
  scoresByCategory: Record<string, number>;
  /** List of finding types detected (e.g. 'missing_ssl', 'outdated_cms'). */
  findingTypes: string[];
  /** Whether the business had any security-related findings. */
  hasSecurityFindings: boolean;
  /** Number of critical findings. */
  criticalFindingCount: number;
  /** Timestamp of the audit. */
  auditedAt: Date;
}

/**
 * Anonymized risk signal derived from an audit. Contains no PII, no tenant
 * identifiers, no business names, and no contact information.
 */
export interface RiskSignal {
  id: string;
  vertical: string;
  geoRegion: string;
  /** Overall risk score (0–100, higher = more risk). */
  riskScore: number;
  /** Breakdown of risk by category. */
  riskByCategory: Record<string, number>;
  /** Anonymized finding types present. */
  findingTypes: string[];
  hasSecurityFindings: boolean;
  criticalFindingCount: number;
  generatedAt: Date;
}

/**
 * Aggregated risk feed exported to insurance partners.
 * Represents a statistical summary — not individual records.
 */
export interface RiskFeedExport {
  exportedAt: Date;
  dateRange: DateRange | null;
  totalSignals: number;
  averageRiskScore: number;
  riskDistribution: {
    low: number;   // 0–33
    medium: number; // 34–66
    high: number;  // 67–100
  };
  topFindingTypes: { findingType: string; frequency: number }[];
  riskByVertical: Record<string, { averageRiskScore: number; sampleSize: number }>;
  riskByRegion: Record<string, { averageRiskScore: number; sampleSize: number }>;
}

/** A single insurance partnership revenue event. */
export interface InsuranceRevenueEvent {
  id: string;
  partnerId: string;
  amount: number; // in cents
  revenueType: string;
  recordedAt: Date;
}

// ─── In-Memory Stores ─────────────────────────────────────────────────────────

const signalStore: RiskSignal[] = [];
const revenueStore = new Map<string, InsuranceRevenueEvent[]>();
let counter = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Date.now().toString(36)}`;
}

/**
 * Compute a risk score (0–100) from audit data.
 * Higher scores indicate greater cyber risk.
 */
function computeRiskScore(data: AuditData): number {
  // Base risk from average audit score (inverted — lower audit score = higher risk)
  const scores = Object.values(data.scoresByCategory);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;
  const baseRisk = 100 - avgScore;

  // Boost for security findings
  const securityBoost = data.hasSecurityFindings ? 15 : 0;

  // Boost for critical findings (capped at 20)
  const criticalBoost = Math.min(data.criticalFindingCount * 5, 20);

  return Math.min(100, Math.max(0, baseRisk + securityBoost + criticalBoost));
}

/**
 * Compute per-category risk scores (inverted from audit scores).
 */
function computeRiskByCategory(scoresByCategory: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [category, score] of Object.entries(scoresByCategory)) {
    result[category] = Math.max(0, 100 - score);
  }
  return result;
}

function signalsInRange(signals: RiskSignal[], dateRange?: DateRange): RiskSignal[] {
  if (!dateRange) return signals;
  return signals.filter(
    (s) => s.generatedAt >= dateRange.start && s.generatedAt <= dateRange.end,
  );
}

// ─── Risk Signal Generation ───────────────────────────────────────────────────

/**
 * Generate an anonymized risk signal from raw audit data.
 * All PII and tenant/business identifiers are stripped — only statistical
 * risk indicators are retained.
 *
 * @param auditData Raw audit data from the pipeline
 * @returns Anonymized RiskSignal safe for insurance partner consumption
 */
export function generateRiskSignals(auditData: AuditData): RiskSignal {
  if (!auditData) throw new Error('auditData is required');
  if (!auditData.vertical) throw new Error('auditData.vertical is required');
  if (!auditData.geoRegion) throw new Error('auditData.geoRegion is required');

  const signal: RiskSignal = {
    id: generateId('sig'),
    vertical: auditData.vertical,
    geoRegion: auditData.geoRegion,
    riskScore: computeRiskScore(auditData),
    riskByCategory: computeRiskByCategory(auditData.scoresByCategory),
    findingTypes: [...auditData.findingTypes],
    hasSecurityFindings: auditData.hasSecurityFindings,
    criticalFindingCount: auditData.criticalFindingCount,
    generatedAt: new Date(),
  };

  signalStore.push(signal);
  return signal;
}

// ─── Risk Feed Export ─────────────────────────────────────────────────────────

/**
 * Export an aggregated risk feed for insurance partners.
 * Returns statistical summaries only — no individual business records.
 *
 * @param dateRange Optional date range to filter signals
 * @returns Aggregated RiskFeedExport safe for insurance underwriting
 */
export function exportRiskFeed(dateRange?: DateRange): RiskFeedExport {
  const signals = signalsInRange(signalStore, dateRange);

  const totalSignals = signals.length;
  const averageRiskScore =
    totalSignals > 0
      ? signals.reduce((sum, s) => sum + s.riskScore, 0) / totalSignals
      : 0;

  // Risk distribution buckets
  const riskDistribution = { low: 0, medium: 0, high: 0 };
  for (const s of signals) {
    if (s.riskScore <= 33) riskDistribution.low += 1;
    else if (s.riskScore <= 66) riskDistribution.medium += 1;
    else riskDistribution.high += 1;
  }

  // Top finding types by frequency
  const findingFrequency: Record<string, number> = {};
  for (const s of signals) {
    for (const ft of s.findingTypes) {
      findingFrequency[ft] = (findingFrequency[ft] ?? 0) + 1;
    }
  }
  const topFindingTypes = Object.entries(findingFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([findingType, frequency]) => ({ findingType, frequency }));

  // Risk by vertical
  const verticalMap: Record<string, { sum: number; count: number }> = {};
  for (const s of signals) {
    if (!verticalMap[s.vertical]) verticalMap[s.vertical] = { sum: 0, count: 0 };
    verticalMap[s.vertical].sum += s.riskScore;
    verticalMap[s.vertical].count += 1;
  }
  const riskByVertical: Record<string, { averageRiskScore: number; sampleSize: number }> = {};
  for (const [v, { sum, count }] of Object.entries(verticalMap)) {
    riskByVertical[v] = { averageRiskScore: sum / count, sampleSize: count };
  }

  // Risk by region
  const regionMap: Record<string, { sum: number; count: number }> = {};
  for (const s of signals) {
    if (!regionMap[s.geoRegion]) regionMap[s.geoRegion] = { sum: 0, count: 0 };
    regionMap[s.geoRegion].sum += s.riskScore;
    regionMap[s.geoRegion].count += 1;
  }
  const riskByRegion: Record<string, { averageRiskScore: number; sampleSize: number }> = {};
  for (const [r, { sum, count }] of Object.entries(regionMap)) {
    riskByRegion[r] = { averageRiskScore: sum / count, sampleSize: count };
  }

  return {
    exportedAt: new Date(),
    dateRange: dateRange ?? null,
    totalSignals,
    averageRiskScore,
    riskDistribution,
    topFindingTypes,
    riskByVertical,
    riskByRegion,
  };
}

// ─── Revenue Tracking ─────────────────────────────────────────────────────────

/**
 * Record a revenue event from an insurance partnership.
 *
 * @param partnerId   The insurance partner's ID
 * @param amount      Revenue amount in cents
 * @param revenueType Type of revenue (e.g. 'data_feed', 'api_access', 'underwriting_fee')
 * @returns The recorded InsuranceRevenueEvent
 */
export function trackInsuranceRevenue(
  partnerId: string,
  amount: number,
  revenueType: string = 'data_feed',
): InsuranceRevenueEvent {
  if (!partnerId) throw new Error('partnerId is required');
  if (amount < 0) throw new Error('amount must be non-negative');

  const event: InsuranceRevenueEvent = {
    id: generateId('ins'),
    partnerId,
    amount,
    revenueType,
    recordedAt: new Date(),
  };

  const existing = revenueStore.get(partnerId) ?? [];
  existing.push(event);
  revenueStore.set(partnerId, existing);

  return event;
}

/**
 * Retrieve all revenue events for a specific insurance partner.
 */
export function getInsuranceRevenueEvents(partnerId: string): InsuranceRevenueEvent[] {
  return [...(revenueStore.get(partnerId) ?? [])];
}

/**
 * Get total insurance partnership revenue, optionally filtered by date range.
 */
export function getTotalInsuranceRevenue(dateRange?: DateRange): number {
  let total = 0;
  for (const events of revenueStore.values()) {
    for (const event of events) {
      if (
        !dateRange ||
        (event.recordedAt >= dateRange.start && event.recordedAt <= dateRange.end)
      ) {
        total += event.amount;
      }
    }
  }
  return total;
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Clear all stored data (intended for test isolation only).
 */
export function _clearStore(): void {
  signalStore.length = 0;
  revenueStore.clear();
  counter = 0;
}
