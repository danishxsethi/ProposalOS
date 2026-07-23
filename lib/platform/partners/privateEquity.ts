/**
 * Private Equity Data Service
 *
 * Premium market intelligence API for private equity firms evaluating
 * SMB market opportunities. Provides aggregated, anonymized market data
 * derived from the platform's audit and outcome dataset.
 *
 * Requirements: 19.5, 19.6
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Market intelligence report for a specific vertical and optional region.
 * All data is aggregated and anonymized — no individual business records.
 */
export interface MarketIntelligenceReport {
  vertical: string;
  region: string | null;
  generatedAt: Date;
  /** Total number of businesses analyzed in this vertical/region. */
  marketSize: number;
  /** Average digital health score (0–100) across businesses in this segment. */
  averageDigitalHealthScore: number;
  /** Percentage of businesses with significant digital gaps (score < 50). */
  digitalGapRate: number;
  /** Most common improvement opportunities ranked by frequency. */
  topOpportunities: { opportunity: string; frequency: number; averageImpact: number }[];
  /** Revenue potential estimate based on platform pricing data (in cents). */
  estimatedRevenueOpportunity: number;
  /** Win rate for proposals in this vertical/region. */
  winRate: number;
  /** Average deal size in cents. */
  averageDealSize: number;
  /** Month-over-month growth in businesses entering this vertical. */
  growthRate: number;
}

/**
 * Aggregated risk score across multiple verticals for portfolio analysis.
 */
export interface PortfolioRiskScore {
  verticals: string[];
  overallRiskScore: number; // 0–100, higher = more risk
  riskByVertical: Record<string, number>;
  /** Concentration risk — how much of the portfolio is in a single vertical. */
  concentrationRisk: number; // 0–1
  /** Diversification score — higher is better. */
  diversificationScore: number; // 0–1
  computedAt: Date;
}

/** A single PE data service revenue event. */
export interface PERevenueEvent {
  id: string;
  firmId: string;
  amount: number; // in cents
  serviceType: string;
  recordedAt: Date;
}

// ─── In-Memory Stores ─────────────────────────────────────────────────────────

/**
 * Anonymized market data records contributed by the pipeline.
 * No tenant IDs, business names, or contact info.
 */
interface MarketDataRecord {
  vertical: string;
  region: string;
  digitalHealthScore: number;
  findingTypes: string[];
  outcome: 'won' | 'lost' | 'ghosted';
  dealSize: number; // in cents, 0 if not won
  recordedAt: Date;
}

const marketDataStore: MarketDataRecord[] = [];
const revenueStore = new Map<string, PERevenueEvent[]>();
let counter = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Date.now().toString(36)}`;
}

/**
 * Compute a risk score for a vertical based on market data.
 * Higher digital gap rates and lower win rates indicate higher risk.
 */
function computeVerticalRisk(records: MarketDataRecord[]): number {
  if (records.length === 0) return 50; // neutral default

  const avgHealth =
    records.reduce((sum, r) => sum + r.digitalHealthScore, 0) / records.length;
  const wonRecords = records.filter((r) => r.outcome === 'won');
  const winRate = wonRecords.length / records.length;

  // Low health + low win rate = high risk
  const healthRisk = 100 - avgHealth;
  const winRateRisk = (1 - winRate) * 50;

  return Math.min(100, Math.max(0, healthRisk * 0.6 + winRateRisk * 0.4));
}

// ─── Market Intelligence ──────────────────────────────────────────────────────

/**
 * Generate a market intelligence report for a vertical, optionally scoped
 * to a specific geographic region.
 *
 * @param vertical The industry vertical to analyze (e.g. 'restaurant', 'dental')
 * @param region   Optional geographic region filter (e.g. 'northeast', 'southwest')
 * @returns MarketIntelligenceReport with aggregated, anonymized market data
 */
export function generateMarketIntelligence(
  vertical: string,
  region?: string,
): MarketIntelligenceReport {
  if (!vertical) throw new Error('vertical is required');

  let records = marketDataStore.filter((r) => r.vertical === vertical);
  if (region) {
    records = records.filter((r) => r.region === region);
  }

  const marketSize = records.length;

  const averageDigitalHealthScore =
    marketSize > 0
      ? records.reduce((sum, r) => sum + r.digitalHealthScore, 0) / marketSize
      : 0;

  const digitalGapRate =
    marketSize > 0
      ? records.filter((r) => r.digitalHealthScore < 50).length / marketSize
      : 0;

  // Top opportunities by finding type frequency
  const findingFrequency: Record<string, { count: number; totalImpact: number }> = {};
  for (const r of records) {
    for (const ft of r.findingTypes) {
      if (!findingFrequency[ft]) findingFrequency[ft] = { count: 0, totalImpact: 0 };
      findingFrequency[ft].count += 1;
      // Impact proxy: inverse of digital health score
      findingFrequency[ft].totalImpact += 100 - r.digitalHealthScore;
    }
  }
  const topOpportunities = Object.entries(findingFrequency)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([opportunity, { count, totalImpact }]) => ({
      opportunity,
      frequency: count,
      averageImpact: count > 0 ? totalImpact / count : 0,
    }));

  // Win rate and deal size
  const wonRecords = records.filter((r) => r.outcome === 'won');
  const winRate = marketSize > 0 ? wonRecords.length / marketSize : 0;
  const totalDealValue = wonRecords.reduce((sum, r) => sum + r.dealSize, 0);
  const averageDealSize = wonRecords.length > 0 ? totalDealValue / wonRecords.length : 0;

  // Revenue opportunity estimate: digital gap businesses × average deal size
  const estimatedRevenueOpportunity = Math.round(digitalGapRate * marketSize * averageDealSize);

  // Growth rate: compare last 30 days vs prior 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const recentCount = records.filter((r) => r.recordedAt >= thirtyDaysAgo).length;
  const priorCount = records.filter(
    (r) => r.recordedAt >= sixtyDaysAgo && r.recordedAt < thirtyDaysAgo,
  ).length;
  const growthRate = priorCount > 0 ? (recentCount - priorCount) / priorCount : 0;

  return {
    vertical,
    region: region ?? null,
    generatedAt: new Date(),
    marketSize,
    averageDigitalHealthScore,
    digitalGapRate,
    topOpportunities,
    estimatedRevenueOpportunity,
    winRate,
    averageDealSize,
    growthRate,
  };
}

// ─── Portfolio Risk Scoring ───────────────────────────────────────────────────

/**
 * Compute an aggregated portfolio risk score across multiple verticals.
 * Useful for PE firms evaluating diversification and concentration risk.
 *
 * @param verticals Array of vertical names to include in the portfolio
 * @returns PortfolioRiskScore with per-vertical and aggregate risk metrics
 */
export function getPortfolioRiskScore(verticals: string[]): PortfolioRiskScore {
  if (!verticals || verticals.length === 0) {
    throw new Error('verticals must be a non-empty array');
  }

  const riskByVertical: Record<string, number> = {};
  const verticalSizes: Record<string, number> = {};

  for (const vertical of verticals) {
    const records = marketDataStore.filter((r) => r.vertical === vertical);
    riskByVertical[vertical] = computeVerticalRisk(records);
    verticalSizes[vertical] = records.length;
  }

  // Overall risk: weighted average by market size
  const totalSize = Object.values(verticalSizes).reduce((a, b) => a + b, 0);
  let overallRiskScore: number;
  if (totalSize === 0) {
    // No data — simple average
    const riskValues = Object.values(riskByVertical);
    overallRiskScore = riskValues.reduce((a, b) => a + b, 0) / riskValues.length;
  } else {
    overallRiskScore = verticals.reduce((sum, v) => {
      const weight = (verticalSizes[v] ?? 0) / totalSize;
      return sum + (riskByVertical[v] ?? 50) * weight;
    }, 0);
  }

  // Concentration risk: Herfindahl-Hirschman Index (0–1)
  const concentrationRisk =
    totalSize > 0
      ? verticals.reduce((sum, v) => {
          const share = (verticalSizes[v] ?? 0) / totalSize;
          return sum + share * share;
        }, 0)
      : 1 / verticals.length;

  // Diversification score: inverse of concentration, normalized
  const maxConcentration = 1; // single vertical
  const minConcentration = 1 / verticals.length; // perfectly even
  const diversificationScore =
    verticals.length === 1
      ? 0
      : (maxConcentration - concentrationRisk) / (maxConcentration - minConcentration);

  return {
    verticals: [...verticals],
    overallRiskScore: Math.min(100, Math.max(0, overallRiskScore)),
    riskByVertical,
    concentrationRisk: Math.min(1, Math.max(0, concentrationRisk)),
    diversificationScore: Math.min(1, Math.max(0, diversificationScore)),
    computedAt: new Date(),
  };
}

// ─── Revenue Tracking ─────────────────────────────────────────────────────────

/**
 * Record a revenue event from a PE data service subscription or query.
 *
 * @param firmId      The PE firm's ID
 * @param amount      Revenue amount in cents
 * @param serviceType Type of service (e.g. 'market_intelligence', 'portfolio_risk', 'api_subscription')
 * @returns The recorded PERevenueEvent
 */
export function trackPERevenue(
  firmId: string,
  amount: number,
  serviceType: string = 'market_intelligence',
): PERevenueEvent {
  if (!firmId) throw new Error('firmId is required');
  if (amount < 0) throw new Error('amount must be non-negative');

  const event: PERevenueEvent = {
    id: generateId('pe'),
    firmId,
    amount,
    serviceType,
    recordedAt: new Date(),
  };

  const existing = revenueStore.get(firmId) ?? [];
  existing.push(event);
  revenueStore.set(firmId, existing);

  return event;
}

/**
 * Retrieve all revenue events for a specific PE firm.
 */
export function getPERevenueEvents(firmId: string): PERevenueEvent[] {
  return [...(revenueStore.get(firmId) ?? [])];
}

/**
 * Get total PE data service revenue, optionally filtered by date range.
 */
export function getTotalPERevenue(dateRange?: DateRange): number {
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

// ─── Seed / Test Helpers ──────────────────────────────────────────────────────

/**
 * Add an anonymized market data record to the store.
 * Called by the pipeline to contribute data to the PE intelligence dataset.
 * Records must be pre-anonymized — no PII, no tenant identifiers.
 */
export function addMarketDataRecord(record: {
  vertical: string;
  region: string;
  digitalHealthScore: number;
  findingTypes: string[];
  outcome: 'won' | 'lost' | 'ghosted';
  dealSize: number;
  recordedAt: Date;
}): void {
  marketDataStore.push({ ...record });
}

/**
 * Clear all stored data (intended for test isolation only).
 */
export function _clearStore(): void {
  marketDataStore.length = 0;
  revenueStore.clear();
  counter = 0;
}
