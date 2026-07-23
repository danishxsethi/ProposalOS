/**
 * IntelligenceAPI: Internal API for querying cross-tenant intelligence.
 *
 * Provides:
 * - queryBenchmarks()    - GET /intelligence/benchmarks?industry=X&locale=Y&size=Z
 * - queryPatterns()      - GET /intelligence/patterns?platform=X&plugin=Y
 * - queryEffectiveness() - GET /intelligence/effectiveness?recommendation_type=X&industry=Y
 * - getAuditLog()        - retrieve all audit log entries
 * - isRateLimited()      - check if a requester has exceeded the rate limit
 *
 * Rate limiting: 1000 requests per hour per service account (requesterId).
 * Audit logging: all requests logged in-memory (intelligence_api_audit_log).
 * Privacy: responses never contain client-identifying information.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.4
 */

import { BenchmarkEngine } from './benchmark-engine';
import { PatternDiscoveryEngine } from './pattern-discovery-engine';
import { RecommendationEffectivenessTracker } from './recommendation-effectiveness-tracker';
import {
  IntelligenceResponse,
  APIAuditLog,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum requests per hour per service account. */
export const RATE_LIMIT_PER_HOUR = 1000;

/** Privacy notice included in every response. */
const PRIVACY_NOTICE =
  'This data is anonymized and aggregated. No individual client information is included. ' +
  'All data meets k-anonymity (k ≥ 10) and differential privacy requirements.';

// ============================================================================
// Internal types
// ============================================================================

interface RateLimitEntry {
  /** Timestamps (ms) of requests in the current window. */
  timestamps: number[];
}

// ============================================================================
// IntelligenceAPI
// ============================================================================

export class IntelligenceAPI {
  private benchmarkEngine: BenchmarkEngine;
  private patternEngine: PatternDiscoveryEngine;
  private effectivenessTracker: RecommendationEffectivenessTracker;

  /** In-memory audit log (replaces intelligence_api_audit_log table). */
  private auditLog: APIAuditLog[] = [];

  /** Per-requester rate limit tracking. */
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();

  private idCounter = 0;

  constructor(
    benchmarkEngine: BenchmarkEngine,
    patternEngine: PatternDiscoveryEngine,
    effectivenessTracker: RecommendationEffectivenessTracker,
  ) {
    this.benchmarkEngine = benchmarkEngine;
    this.patternEngine = patternEngine;
    this.effectivenessTracker = effectivenessTracker;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Query benchmark data for a given industry, locale, and optional business size.
   *
   * GET /intelligence/benchmarks?industry=X&locale=Y&size=Z
   *
   * Requirements: 11.1
   */
  async queryBenchmarks(
    params: { industry: string; locale: string; size?: string },
    requesterId: string,
  ): Promise<IntelligenceResponse> {
    this.checkRateLimit(requesterId);

    // Parameter validation
    if (!params.industry || params.industry.trim() === '') {
      throw new Error('industry parameter is required');
    }
    if (!params.locale || params.locale.trim() === '') {
      throw new Error('locale parameter is required');
    }

    const cohort = await this.benchmarkEngine.queryBenchmarks({
      industry: params.industry,
      locale: params.locale,
      businessSize: params.size as any,
    });

    const sampleSize = cohort.recordCount;
    const kAnonymity = cohort.kAnonymity;
    const confidence = sampleSize > 0 ? Math.min(sampleSize / 10, 1) : 0;

    // Convert metrics Map to plain object for serialization
    const metricsObj: Record<string, any> = {};
    for (const [key, metric] of cohort.metrics) {
      metricsObj[key] = {
        name: metric.name,
        mean: metric.mean,
        median: metric.median,
        p25: metric.p25,
        p75: metric.p75,
        p95: metric.p95,
        sampleSize: metric.sampleSize,
      };
    }

    const response: IntelligenceResponse = {
      data: {
        industry: cohort.industry,
        businessSize: cohort.businessSize,
        locale: cohort.locale,
        metrics: metricsObj,
      },
      metadata: {
        sampleSize,
        confidence,
        kAnonymity,
        lastUpdated: cohort.lastUpdated,
      },
      privacyNotice: PRIVACY_NOTICE,
    };

    this.logRequest('benchmarks', params, requesterId, response);
    return response;
  }

  /**
   * Query pattern data filtered by platform and/or plugin.
   *
   * GET /intelligence/patterns?platform=X&plugin=Y
   *
   * Requirements: 11.2
   */
  async queryPatterns(
    params: { platform?: string; plugin?: string },
    requesterId: string,
  ): Promise<IntelligenceResponse> {
    this.checkRateLimit(requesterId);

    const patterns = await this.patternEngine.queryPatterns({
      platform: params.platform,
      plugin: params.plugin,
    });

    const sampleSize = patterns.length;

    const response: IntelligenceResponse = {
      data: patterns.map((p) => ({
        id: p.id,
        description: p.description,
        affectedPlatforms: p.affectedPlatforms,
        affectedPlugins: p.affectedPlugins,
        frequency: p.frequency,
        industries: p.industries,
        locales: p.locales,
        recommendedFixes: p.recommendedFixes,
        confidenceScore: p.confidenceScore,
        trend: p.trend,
        discoveredAt: p.discoveredAt,
        lastObservedAt: p.lastObservedAt,
      })),
      metadata: {
        sampleSize,
        confidence: sampleSize > 0 ? Math.min(sampleSize / 10, 1) : 0,
        kAnonymity: 0, // patterns are not subject to k-anonymity
        lastUpdated: new Date(),
      },
      privacyNotice: PRIVACY_NOTICE,
    };

    this.logRequest('patterns', params, requesterId, response);
    return response;
  }

  /**
   * Query effectiveness data for a recommendation type and optional industry.
   *
   * GET /intelligence/effectiveness?recommendation_type=X&industry=Y
   *
   * Requirements: 11.3
   */
  async queryEffectiveness(
    params: { recommendation_type?: string; industry?: string },
    requesterId: string,
  ): Promise<IntelligenceResponse> {
    this.checkRateLimit(requesterId);

    const stats = await this.effectivenessTracker.getEffectivenessStats({
      recommendationType: params.recommendation_type,
      industry: params.industry,
    });

    const sampleSize = stats.reduce((sum, s) => sum + s.sampleSize, 0);

    const response: IntelligenceResponse = {
      data: stats.map((s) => ({
        recommendationType: s.recommendationType,
        industry: s.industry,
        locale: s.locale,
        sampleSize: s.sampleSize,
        averageAccuracy: s.averageAccuracy,
        averageActualImpact: s.averageActualImpact,
        confidenceInterval: s.confidenceInterval,
      })),
      metadata: {
        sampleSize,
        confidence: sampleSize > 0 ? Math.min(sampleSize / 10, 1) : 0,
        kAnonymity: 0, // effectiveness stats are already aggregated
        lastUpdated: new Date(),
      },
      privacyNotice: PRIVACY_NOTICE,
    };

    this.logRequest('effectiveness', params, requesterId, response);
    return response;
  }

  /**
   * Return all audit log entries.
   *
   * Requirements: 11.5, 12.4
   */
  getAuditLog(): APIAuditLog[] {
    return [...this.auditLog];
  }

  /**
   * Check whether a requester has exceeded the rate limit.
   * Returns true if the requester is currently rate-limited.
   *
   * Requirements: 11.4
   */
  isRateLimited(requesterId: string): boolean {
    return this.countRequestsInWindow(requesterId) >= RATE_LIMIT_PER_HOUR;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Enforce rate limiting. Throws if the requester has exceeded the limit.
   */
  private checkRateLimit(requesterId: string): void {
    if (this.isRateLimited(requesterId)) {
      throw new Error(
        `Rate limit exceeded for requester "${requesterId}". ` +
          `Maximum ${RATE_LIMIT_PER_HOUR} requests per hour.`,
      );
    }
    this.recordRequest(requesterId);
  }

  /**
   * Count requests made by a requester within the last hour.
   */
  private countRequestsInWindow(requesterId: string): number {
    const entry = this.rateLimitMap.get(requesterId);
    if (!entry) return 0;
    const windowStart = Date.now() - 60 * 60 * 1000;
    // Prune old timestamps
    entry.timestamps = entry.timestamps.filter((t) => t >= windowStart);
    return entry.timestamps.length;
  }

  /**
   * Record a new request timestamp for a requester.
   */
  private recordRequest(requesterId: string): void {
    if (!this.rateLimitMap.has(requesterId)) {
      this.rateLimitMap.set(requesterId, { timestamps: [] });
    }
    this.rateLimitMap.get(requesterId)!.timestamps.push(Date.now());
  }

  /**
   * Log a request to the in-memory audit log.
   */
  private logRequest(
    queryType: string,
    filters: Record<string, any>,
    requesterId: string,
    response: IntelligenceResponse,
  ): void {
    const entry: APIAuditLog = {
      id: `audit-${++this.idCounter}-${Date.now()}`,
      queryType,
      filters,
      requesterId,
      responseSampleSize: response.metadata.sampleSize,
      responseKAnonymity: response.metadata.kAnonymity,
      timestamp: new Date(),
    };
    this.auditLog.push(entry);
  }

  /**
   * Generate a simple unique id.
   */
  private generateId(): string {
    return `${++this.idCounter}-${Date.now()}`;
  }
}
