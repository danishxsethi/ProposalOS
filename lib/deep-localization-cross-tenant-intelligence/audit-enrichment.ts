/**
 * AuditEnrichment: Enriches audit findings with cross-tenant intelligence.
 *
 * Integrates the Intelligence API into the audit pipeline to:
 * - Query benchmarks, patterns, and effectiveness data for completed audits
 * - Enrich each finding with benchmark percentile, pattern matches, and effectiveness data
 * - Provide messaging when insufficient data exists for enrichment
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { IntelligenceAPI } from './intelligence-api';

// ============================================================================
// Local Types
// ============================================================================

export interface Finding {
  id: string;
  type: string;
  platform?: string;
  plugin?: string;
  description: string;
  value?: number;
  metricType?: string;
}

export interface PatternMatch {
  patternId: string;
  description: string;
  frequency: number;
  confidence: number;
}

export interface EnrichedFinding extends Finding {
  benchmarkPercentile?: number;
  patternMatches?: PatternMatch[];
  effectivenessData?: any;
  insufficientDataMessage?: string;
}

export interface AuditResults {
  findings: Finding[];
  locale: string;
  industry: string;
  businessSize?: string;
}

export interface EnrichedAuditResults {
  findings: EnrichedFinding[];
  locale: string;
  industry: string;
  enrichedAt: Date;
  benchmarkMetadata?: any;
}

// ============================================================================
// Constants
// ============================================================================

const INSUFFICIENT_DATA_MESSAGE =
  'Enrichment data is limited for this cohort. Enrichment will improve as more data is collected.';

const REQUESTER_ID = 'audit-enrichment-service';

// ============================================================================
// AuditEnrichment
// ============================================================================

export class AuditEnrichment {
  private intelligenceAPI: IntelligenceAPI;

  constructor(intelligenceAPI: IntelligenceAPI) {
    this.intelligenceAPI = intelligenceAPI;
  }

  /**
   * Enrich audit results with benchmarks, patterns, and effectiveness data.
   *
   * Queries the Intelligence API for all three data types, then enriches each
   * finding. Returns enriched results with metadata.
   *
   * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
   */
  async enrichAudit(
    auditResults: AuditResults,
    locale: string,
    industry: string,
    size?: string,
  ): Promise<EnrichedAuditResults> {
    // Query Intelligence API for benchmarks, patterns, and effectiveness data
    const [benchmarkResponse, patternResponse, effectivenessResponse] =
      await Promise.allSettled([
        this.intelligenceAPI.queryBenchmarks(
          { industry, locale, size },
          REQUESTER_ID,
        ),
        this.intelligenceAPI.queryPatterns({}, REQUESTER_ID),
        this.intelligenceAPI.queryEffectiveness(
          { industry },
          REQUESTER_ID,
        ),
      ]);

    const benchmarks =
      benchmarkResponse.status === 'fulfilled' ? benchmarkResponse.value : null;
    const patterns =
      patternResponse.status === 'fulfilled'
        ? (patternResponse.value.data as any[])
        : [];
    const effectiveness =
      effectivenessResponse.status === 'fulfilled'
        ? effectivenessResponse.value.data
        : null;

    const benchmarkMetadata =
      benchmarks != null
        ? {
            sampleSize: benchmarks.metadata.sampleSize,
            confidence: benchmarks.metadata.confidence,
            kAnonymity: benchmarks.metadata.kAnonymity,
            lastUpdated: benchmarks.metadata.lastUpdated,
          }
        : undefined;

    const enrichedFindings = auditResults.findings.map((finding) =>
      this.enrichFinding(
        finding,
        benchmarks?.data ?? null,
        patterns,
        effectiveness,
      ),
    );

    return {
      findings: enrichedFindings,
      locale,
      industry,
      enrichedAt: new Date(),
      benchmarkMetadata,
    };
  }

  /**
   * Enrich a single finding with benchmark percentile, pattern matches, and
   * effectiveness data. Adds an insufficientDataMessage when no enrichment
   * data is available.
   *
   * Requirements: 14.2, 14.3, 14.4, 14.5
   */
  enrichFinding(
    finding: Finding,
    benchmarks: any,
    patterns: any[],
    effectiveness: any,
  ): EnrichedFinding {
    const enriched: EnrichedFinding = { ...finding };

    // Benchmark percentile
    let hasBenchmarkData = false;
    if (
      benchmarks != null &&
      finding.metricType != null &&
      finding.value != null
    ) {
      const benchmarkMetric = benchmarks.metrics?.[finding.metricType];
      if (benchmarkMetric != null) {
        enriched.benchmarkPercentile = this.calculateBenchmarkPercentile(
          finding.value,
          benchmarkMetric,
        );
        hasBenchmarkData = true;
      }
    }

    // Pattern matching
    const patternMatches = this.matchPatterns(finding, patterns);
    if (patternMatches.length > 0) {
      enriched.patternMatches = patternMatches;
    }

    // Effectiveness data
    let hasEffectivenessData = false;
    if (effectiveness != null) {
      const effectivenessArray = Array.isArray(effectiveness)
        ? effectiveness
        : [];
      const matchingEffectiveness = effectivenessArray.find(
        (e: any) => e.recommendationType === finding.type,
      );
      if (matchingEffectiveness != null && matchingEffectiveness.sampleSize > 0) {
        enriched.effectivenessData = matchingEffectiveness;
        hasEffectivenessData = true;
      }
    }

    // Insufficient data message when no enrichment data is available
    const hasAnyData =
      hasBenchmarkData || patternMatches.length > 0 || hasEffectivenessData;
    if (!hasAnyData) {
      enriched.insufficientDataMessage = INSUFFICIENT_DATA_MESSAGE;
    }

    return enriched;
  }

  /**
   * Calculate the percentile position of a value within a benchmark distribution.
   *
   * Uses the p25, median (p50), p75, and p95 percentile markers from the
   * benchmark metric to interpolate the percentile of the given value.
   *
   * Returns a value in [0, 100].
   */
  calculateBenchmarkPercentile(value: number, benchmarkMetric: any): number {
    const { p25, median, p75, p95, mean } = benchmarkMetric;

    // Use available percentile markers to interpolate
    const markers: Array<[number, number]> = [
      [0, p25 - (p75 - p25)],   // approximate p0 (below p25 by IQR)
      [25, p25],
      [50, median ?? mean],
      [75, p75],
      [95, p95],
      [100, p95 + (p95 - p75)], // approximate p100 (above p95 by p95-p75 gap)
    ];

    // Clamp to [0, 100]
    if (value <= markers[0][1]) return 0;
    if (value >= markers[markers.length - 1][1]) return 100;

    // Linear interpolation between adjacent markers
    for (let i = 0; i < markers.length - 1; i++) {
      const [pctLow, valLow] = markers[i];
      const [pctHigh, valHigh] = markers[i + 1];
      if (value >= valLow && value <= valHigh) {
        if (valHigh === valLow) return pctLow;
        const fraction = (value - valLow) / (valHigh - valLow);
        return Math.round(pctLow + fraction * (pctHigh - pctLow));
      }
    }

    return 50; // fallback
  }

  /**
   * Find patterns that match the given finding based on platform, plugin, and
   * description keywords.
   *
   * Returns an array of PatternMatch objects sorted by confidence descending.
   */
  matchPatterns(finding: Finding, patterns: any[]): PatternMatch[] {
    if (!patterns || patterns.length === 0) return [];

    const matches: PatternMatch[] = [];
    const descriptionLower = finding.description.toLowerCase();

    for (const pattern of patterns) {
      let matched = false;

      // Match by platform
      if (
        finding.platform != null &&
        Array.isArray(pattern.affectedPlatforms) &&
        pattern.affectedPlatforms.some(
          (p: string) =>
            p.toLowerCase() === finding.platform!.toLowerCase(),
        )
      ) {
        matched = true;
      }

      // Match by plugin
      if (
        !matched &&
        finding.plugin != null &&
        Array.isArray(pattern.affectedPlugins) &&
        pattern.affectedPlugins.some(
          (p: string) =>
            p.toLowerCase() === finding.plugin!.toLowerCase(),
        )
      ) {
        matched = true;
      }

      // Match by description keyword overlap
      if (!matched && pattern.description) {
        const patternDescLower = pattern.description.toLowerCase();
        const patternWords = patternDescLower
          .split(/\s+/)
          .filter((w: string) => w.length > 4);
        const overlap = patternWords.filter((w: string) =>
          descriptionLower.includes(w),
        );
        if (overlap.length >= 2) {
          matched = true;
        }
      }

      if (matched) {
        matches.push({
          patternId: pattern.id ?? '',
          description: pattern.description ?? '',
          frequency: pattern.frequency ?? 0,
          confidence: pattern.confidenceScore ?? 0,
        });
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }
}
