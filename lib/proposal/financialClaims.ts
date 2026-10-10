/**
 * lib/proposal/financialClaims.ts
 *
 * Customer-facing financial-claim gate.
 *
 * A definitive revenue-loss claim ("you are losing $X/mo") requires OBSERVED
 * revenue/traffic/conversion inputs. Heuristic models — visitors inferred from
 * review counts, industry-benchmark conversion rates and order values — are
 * modeling ASSUMPTIONS, not observed business facts. The current audit
 * pipeline collects no traffic, conversion, order-value, or revenue inputs, so
 * every present-day audit fails this gate and customer-facing monetary claims
 * derived from those models are SUPPRESSED. Observed evidence (review counts,
 * performance measurements, accessibility violations, competitor gaps) is
 * always allowed — it is what the audit actually measured.
 *
 * When observed inputs exist in the future, the estimate may be shown but must
 * be labeled as an estimate and carry its documented inputs and assumptions.
 */

export interface RevenueImpactSourceInputs {
  /** Analytics-observed monthly visitor count (e.g. from a connected profile). */
  observedMonthlyVisitors?: number | null;
  /** Observed (analytics/customer-provided) site conversion rate, 0–1. */
  observedConversionRate?: number | null;
  /** Observed average order/deal value in whole currency units. */
  observedAverageOrderValue?: number | null;
  /** Customer-stated monthly revenue for the business. */
  customerStatedMonthlyRevenue?: number | null;
}

export interface RevenueImpactAssessment {
  /** True only when a defensible dollar estimate can be made from OBSERVED inputs. */
  supported: boolean;
  /** Documented observed inputs the estimate is grounded in (shown with estimates). */
  observedInputs: string[];
  /**
   * Modeling assumptions that any displayed estimate relies on (shown with
   * estimates; also documents what unsupported heuristics were suppressed).
   */
  assumptions: string[];
}

function numericOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Extract the observed revenue-impact inputs from an audit record.
 *
 * The accessors below define the ONLY fields this gate honors. The current
 * Audit schema and every collection module produce none of them — which is
 * why assessments today are honestly `supported: false`. When a real analytics
 * or customer-provided input lands (e.g. a `business_context` intake field or
 * an analytics integration), wire it here and the gate opens automatically.
 */
export function extractRevenueImpactInputs(
  audit: Record<string, unknown>
): RevenueImpactSourceInputs {
  return {
    observedMonthlyVisitors: numericOrNull(audit.observedMonthlyVisitors),
    observedConversionRate: numericOrNull(audit.observedConversionRate),
    observedAverageOrderValue: numericOrNull(audit.observedAverageOrderValue),
    customerStatedMonthlyRevenue: numericOrNull(audit.customerStatedMonthlyRevenue),
  };
}

/**
 * Assess whether a customer-facing dollar estimate is defensible for this audit.
 *
 * Minimum defensible basis: observed traffic AND (observed conversion rate OR
 * customer-stated revenue) AND (observed order value OR customer-stated
 * revenue). Anything less is suppressed in customer-facing copy.
 */
export function assessRevenueImpact(audit: Record<string, unknown>): RevenueImpactAssessment {
  const inputs = extractRevenueImpactInputs(audit);

  const observedInputs: string[] = [];
  if (inputs.observedMonthlyVisitors != null) {
    observedInputs.push(`Observed monthly traffic: ${inputs.observedMonthlyVisitors}`);
  }
  if (inputs.observedConversionRate != null) {
    observedInputs.push(`Observed conversion rate: ${inputs.observedConversionRate}`);
  }
  if (inputs.observedAverageOrderValue != null) {
    observedInputs.push(`Observed average order value: ${inputs.observedAverageOrderValue}`);
  }
  if (inputs.customerStatedMonthlyRevenue != null) {
    observedInputs.push(`Customer-stated monthly revenue: ${inputs.customerStatedMonthlyRevenue}`);
  }

  const supported =
    inputs.observedMonthlyVisitors != null &&
    (inputs.observedConversionRate != null || inputs.customerStatedMonthlyRevenue != null) &&
    (inputs.observedAverageOrderValue != null || inputs.customerStatedMonthlyRevenue != null);

  return {
    supported,
    observedInputs,
    // Always disclosed: these are the heuristics the internal prioritization
    // model uses. They are why an unsupported audit shows NO dollar claims.
    assumptions: [
      'Internal prioritization models visitor volume from observed review counts and industry benchmarks; it is not observed traffic.',
      'Industry-benchmark conversion rates and order values are used for ranking only unless observed values are provided.',
    ],
  };
}
