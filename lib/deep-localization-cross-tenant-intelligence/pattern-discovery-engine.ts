/**
 * PatternDiscoveryEngine: Auto-discovers recurring patterns across audits.
 *
 * Provides:
 * - analyzeAudit()       - extract patterns from audit findings and update frequency
 * - promotePattern()     - move pattern from 'pending' to 'active' when frequency >= 10
 * - queryPatterns()      - filter patterns by platform, plugin, industry, locale, minFrequency
 * - getPatternStats()    - return total patterns, locales supported, pending/approved counts
 * - trackPatternTrend()  - update trend (increasing/stable/decreasing) from recent frequency changes
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { Pattern, PatternQuery, PatternStats, TimeRange, TrendData } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Minimum number of observations before a pattern is promoted to active. */
export const PATTERN_PROMOTION_THRESHOLD = 10;

/**
 * Compute confidence score from frequency.
 * Grows toward 1 as frequency increases, reaching ~0.5 at threshold and ~0.9 at 10x threshold.
 * Formula: 1 - 1 / (1 + frequency / PATTERN_PROMOTION_THRESHOLD)
 */
function computeConfidenceScore(frequency: number): number {
  if (frequency <= 0) return 0;
  return 1 - 1 / (1 + frequency / PATTERN_PROMOTION_THRESHOLD);
}

// ============================================================================
// Internal storage types
// ============================================================================

/** Internal pattern record with status tracking. */
interface StoredPattern extends Pattern {
  id: string;
  status: 'pending' | 'active';
  /** Frequency snapshots keyed by ISO date string (YYYY-MM-DD) for trend tracking. */
  frequencyHistory: Array<{ date: Date; frequency: number }>;
}

/** A finding extracted from an audit, expected to have these fields. */
export interface AuditFinding {
  platform?: string;
  plugin?: string;
  issueType?: string;
  description?: string;
  industry?: string;
  locale?: string;
  recommendedFix?: string;
}

// ============================================================================
// PatternDiscoveryEngine
// ============================================================================

export class PatternDiscoveryEngine {
  /** All patterns keyed by their id. */
  private patterns: Map<string, StoredPattern> = new Map();

  /**
   * Counter to generate deterministic ids in tests.
   * In production this would be a UUID generator.
   */
  private idCounter = 0;

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Analyze findings from a completed audit and update the pattern library.
   *
   * For each finding:
   * - Extracts a pattern key from (platform, plugin, issueType)
   * - Increments frequency for existing patterns
   * - Creates new patterns when not seen before
   * - Calls promotePattern() when frequency reaches PATTERN_PROMOTION_THRESHOLD
   *
   * Returns the list of patterns that were updated or created.
   *
   * Requirements: 9.1, 9.2, 9.3
   */
  async analyzeAudit(
    auditId: string,
    findings: AuditFinding[],
    industry: string,
    locale: string,
  ): Promise<Pattern[]> {
    const updatedPatterns: StoredPattern[] = [];

    for (const finding of findings) {
      const platform = finding.platform ?? 'unknown';
      const plugin = finding.plugin;
      const issueType = finding.issueType ?? 'unknown';
      const description = finding.description ?? `${issueType} issue on ${platform}`;
      const recommendedFix = finding.recommendedFix ?? '';

      const patternKey = this.buildPatternKey(platform, plugin, issueType);
      let stored = this.findByKey(patternKey);

      if (stored) {
        // Update existing pattern
        stored.frequency += 1;
        stored.lastObservedAt = new Date();
        stored.confidenceScore = computeConfidenceScore(stored.frequency);

        // Merge industry and locale if not already tracked
        if (!stored.industries.includes(industry)) {
          stored.industries.push(industry);
        }
        if (!stored.locales.includes(locale)) {
          stored.locales.push(locale);
        }

        // Merge recommended fix
        if (recommendedFix && !stored.recommendedFixes.includes(recommendedFix)) {
          stored.recommendedFixes.push(recommendedFix);
        }

        // Record frequency snapshot for trend tracking
        stored.frequencyHistory.push({ date: new Date(), frequency: stored.frequency });
      } else {
        // Create new pattern
        const id = this.generateId();
        stored = {
          id,
          description,
          affectedPlatforms: [platform],
          affectedPlugins: plugin ? [plugin] : [],
          frequency: 1,
          industries: [industry],
          locales: [locale],
          recommendedFixes: recommendedFix ? [recommendedFix] : [],
          confidenceScore: computeConfidenceScore(1),
          discoveredAt: new Date(),
          lastObservedAt: new Date(),
          trend: 'stable',
          status: 'pending',
          frequencyHistory: [{ date: new Date(), frequency: 1 }],
          // Store the pattern key as a tag in description for lookup
          _patternKey: patternKey,
        } as StoredPattern & { _patternKey: string };

        this.patterns.set(id, stored);
      }

      updatedPatterns.push(stored);

      // Promote if threshold reached
      if (stored.frequency >= PATTERN_PROMOTION_THRESHOLD && stored.status === 'pending') {
        await this.promotePattern(stored.id);
      }
    }

    return updatedPatterns.map((p) => this.toPublicPattern(p));
  }

  /**
   * Promote a pattern from 'pending' to 'active' status.
   *
   * Active patterns are used to accelerate diagnosis in future audits.
   *
   * Requirements: 9.2, 9.3
   */
  async promotePattern(patternId: string): Promise<void> {
    const stored = this.patterns.get(patternId);
    if (!stored) {
      throw new Error(`Pattern not found: ${patternId}`);
    }
    stored.status = 'active';
  }

  /**
   * Query patterns with optional filters.
   *
   * Filters:
   * - platform: match if affectedPlatforms includes the value (case-insensitive)
   * - plugin: match if affectedPlugins includes the value (case-insensitive)
   * - industry: match if industries includes the value (case-insensitive)
   * - locale: match if locales includes the value
   * - minFrequency: match if frequency >= minFrequency
   *
   * Requirements: 9.4
   */
  async queryPatterns(query: PatternQuery): Promise<Pattern[]> {
    const results: Pattern[] = [];

    for (const stored of this.patterns.values()) {
      if (!this.matchesQuery(stored, query)) continue;
      results.push(this.toPublicPattern(stored));
    }

    // Sort by frequency descending for consistent ordering
    results.sort((a, b) => b.frequency - a.frequency);
    return results;
  }

  /**
   * Return statistics about the pattern library.
   *
   * - totalPatterns: all patterns (pending + active)
   * - localesSupported: unique locales across all patterns
   * - pendingApprovals: patterns with status 'pending'
   * - approvedVariants: patterns with status 'active'
   *
   * Requirements: 9.4, 9.5
   */
  async getPatternStats(): Promise<PatternStats> {
    const allPatterns = Array.from(this.patterns.values());
    const localesSet = new Set<string>();

    for (const p of allPatterns) {
      for (const locale of p.locales) {
        localesSet.add(locale);
      }
    }

    return {
      totalPatterns: allPatterns.length,
      localesSupported: Array.from(localesSet),
      pendingApprovals: allPatterns.filter((p) => p.status === 'pending').length,
      approvedVariants: allPatterns.filter((p) => p.status === 'active').length,
    };
  }

  /**
   * Update the trend for a pattern based on recent frequency changes.
   *
   * Compares frequency in the last 30 days vs the previous 30 days:
   * - increasing: last 30 days count > previous 30 days count by > 10%
   * - decreasing: last 30 days count < previous 30 days count by > 10%
   * - stable: otherwise
   *
   * Requirements: 9.5
   */
  async trackPatternTrend(patternId: string): Promise<void> {
    const stored = this.patterns.get(patternId);
    if (!stored) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recentCount = stored.frequencyHistory.filter(
      (h) => h.date >= thirtyDaysAgo,
    ).length;

    const previousCount = stored.frequencyHistory.filter(
      (h) => h.date >= sixtyDaysAgo && h.date < thirtyDaysAgo,
    ).length;

    stored.trend = this.computeTrend(recentCount, previousCount);
  }

  /**
   * Return trend data for a pattern over a time range.
   * Buckets observations by month.
   *
   * Requirements: 9.5
   */
  async getPatternTrendData(patternId: string, timeRange: TimeRange): Promise<TrendData> {
    const stored = this.patterns.get(patternId);
    if (!stored) {
      return { timestamps: [], values: [], trend: 'stable' };
    }

    const relevant = stored.frequencyHistory.filter(
      (h) => h.date >= timeRange.startDate && h.date <= timeRange.endDate,
    );

    if (relevant.length === 0) {
      return { timestamps: [], values: [], trend: 'stable' };
    }

    // Bucket by month
    const buckets = new Map<string, number>();
    for (const h of relevant) {
      const key = this.monthBucket(h.date);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const sortedKeys = Array.from(buckets.keys()).sort();
    const timestamps = sortedKeys.map((k) => new Date(`${k}-01T00:00:00Z`));
    const values = sortedKeys.map((k) => buckets.get(k)!);

    const trend = this.computeTrend(
      values[values.length - 1] ?? 0,
      values[0] ?? 0,
    );

    return { timestamps, values, trend };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Build a canonical pattern key from platform, plugin, and issueType.
   * Used to deduplicate patterns across audits.
   */
  private buildPatternKey(platform: string, plugin: string | undefined, issueType: string): string {
    const parts = [platform.toLowerCase(), issueType.toLowerCase()];
    if (plugin) parts.splice(1, 0, plugin.toLowerCase());
    return parts.join('::');
  }

  /**
   * Find a stored pattern by its pattern key.
   */
  private findByKey(patternKey: string): StoredPattern | undefined {
    for (const stored of this.patterns.values()) {
      if ((stored as any)._patternKey === patternKey) return stored;
    }
    return undefined;
  }

  /**
   * Check whether a stored pattern matches the given query filters.
   */
  private matchesQuery(stored: StoredPattern, query: PatternQuery): boolean {
    if (
      query.platform !== undefined &&
      !stored.affectedPlatforms.some(
        (p) => p.toLowerCase() === query.platform!.toLowerCase(),
      )
    ) {
      return false;
    }

    if (
      query.plugin !== undefined &&
      !(stored.affectedPlugins ?? []).some(
        (p) => p.toLowerCase() === query.plugin!.toLowerCase(),
      )
    ) {
      return false;
    }

    if (
      query.industry !== undefined &&
      !stored.industries.some(
        (i) => i.toLowerCase() === query.industry!.toLowerCase(),
      )
    ) {
      return false;
    }

    if (query.locale !== undefined && !stored.locales.includes(query.locale)) {
      return false;
    }

    if (query.minFrequency !== undefined && stored.frequency < query.minFrequency) {
      return false;
    }

    return true;
  }

  /**
   * Compute trend direction from two counts.
   * Uses a 10% threshold to distinguish increasing/decreasing from stable.
   */
  private computeTrend(
    recent: number,
    previous: number,
  ): 'increasing' | 'stable' | 'decreasing' {
    if (previous === 0 && recent === 0) return 'stable';
    if (previous === 0) return 'increasing';
    const delta = (recent - previous) / previous;
    if (delta > 0.1) return 'increasing';
    if (delta < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Convert a StoredPattern to the public Pattern interface.
   */
  private toPublicPattern(stored: StoredPattern): Pattern {
    return {
      id: stored.id,
      description: stored.description,
      affectedPlatforms: [...stored.affectedPlatforms],
      affectedPlugins: stored.affectedPlugins ? [...stored.affectedPlugins] : undefined,
      frequency: stored.frequency,
      industries: [...stored.industries],
      locales: [...stored.locales],
      recommendedFixes: [...stored.recommendedFixes],
      confidenceScore: stored.confidenceScore,
      discoveredAt: stored.discoveredAt,
      lastObservedAt: stored.lastObservedAt,
      trend: stored.trend,
    };
  }

  /**
   * Format a Date as a YYYY-MM bucket string.
   */
  private monthBucket(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * Generate a simple unique id.
   */
  private generateId(): string {
    return `pattern-${++this.idCounter}-${Date.now()}`;
  }
}
