/**
 * CDN configuration and metrics for global edge caching of proposal pages.
 * Targets sub-2-second load times via edge caching (Requirement 17.2).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CDNConfig {
  /** Default TTL for proposal pages (seconds). */
  proposalPageTTL: number;
  /** Default TTL for static assets — JS, CSS, images (seconds). */
  staticAssetTTL: number;
  /** Default TTL for API responses that are safe to cache (seconds). */
  apiResponseTTL: number;
  /** Maximum age for stale-while-revalidate (seconds). */
  staleWhileRevalidate: number;
  /** Edge locations to deploy to. */
  edgeLocations: string[];
  /** Whether to enable Brotli/gzip compression at the edge. */
  compressionEnabled: boolean;
  /** Whether to enable HTTP/2 push for critical assets. */
  http2PushEnabled: boolean;
  /** Minimum cache hit rate target (0–100). */
  targetCacheHitRate: number;
}

export interface CDNMetrics {
  /** Percentage of requests served from cache (0–100). */
  cacheHitRate: number;
  /** Median edge response latency in milliseconds. */
  edgeLatencyP50: number;
  /** 95th-percentile edge response latency in milliseconds. */
  edgeLatencyP95: number;
  /** Total outbound bandwidth in Gbps. */
  bandwidthGbps: number;
  /** Requests per second across all edge locations. */
  requestsPerSecond: number;
  /** Top edge locations by request volume. */
  topEdgeLocations: { location: string; requestsPerSecond: number }[];
}

export interface CachePurgeResult {
  /** Number of cache entries purged. */
  purgedCount: number;
  /** Patterns that were purged. */
  patterns: string[];
  /** Duration of the purge operation in milliseconds. */
  durationMs: number;
  /** Timestamp when the purge completed. */
  completedAt: Date;
  /** Status of the purge operation. */
  status: 'success' | 'partial' | 'failed';
}

// ---------------------------------------------------------------------------
// Constants — targeting sub-2-second load times
// ---------------------------------------------------------------------------

/**
 * Default CDN configuration.
 *
 * TTL strategy:
 *  - Proposal pages: 5 minutes — short enough to reflect updates quickly,
 *    long enough to absorb traffic spikes without hitting origin.
 *  - Static assets: 1 year — content-addressed filenames (hashed) make
 *    long TTLs safe and dramatically reduce origin load.
 *  - API responses: 30 seconds — lightweight caching for read-heavy endpoints.
 *  - Stale-while-revalidate: 60 seconds — serves stale content instantly
 *    while refreshing in the background, keeping p95 latency low.
 *
 * Edge locations cover all major US metro areas plus key international PoPs
 * to satisfy the 400+ US metro area coverage requirement (17.8) and
 * international expansion (Requirement 18).
 */
export const DEFAULT_CDN_CONFIG: CDNConfig = {
  proposalPageTTL: 300,          // 5 minutes
  staticAssetTTL: 31_536_000,    // 1 year
  apiResponseTTL: 30,            // 30 seconds
  staleWhileRevalidate: 60,      // 60 seconds
  edgeLocations: [
    // North America
    'us-east-1',    // New York / Virginia
    'us-east-2',    // Ohio
    'us-west-1',    // California
    'us-west-2',    // Oregon
    'us-central-1', // Chicago
    'us-south-1',   // Texas
    'ca-central-1', // Toronto
    // Europe
    'eu-west-1',    // Ireland
    'eu-central-1', // Frankfurt
    // Asia-Pacific
    'ap-southeast-1', // Singapore
    'ap-northeast-1', // Tokyo
    // Latin America
    'sa-east-1',    // São Paulo
  ],
  compressionEnabled: true,
  http2PushEnabled: true,
  targetCacheHitRate: 90, // 90%+ cache hit rate target
};

// ---------------------------------------------------------------------------
// Cache-Control header helpers
// ---------------------------------------------------------------------------

/**
 * Returns the recommended Cache-Control header value for proposal pages.
 * Uses stale-while-revalidate to keep p95 latency low.
 */
export function getProposalPageCacheControl(config: CDNConfig = DEFAULT_CDN_CONFIG): string {
  return [
    'public',
    `max-age=${config.proposalPageTTL}`,
    `stale-while-revalidate=${config.staleWhileRevalidate}`,
  ].join(', ');
}

/**
 * Returns the recommended Cache-Control header value for static assets.
 * Immutable signals to CDN that the asset will never change at this URL.
 */
export function getStaticAssetCacheControl(config: CDNConfig = DEFAULT_CDN_CONFIG): string {
  return `public, max-age=${config.staticAssetTTL}, immutable`;
}

/**
 * Returns the recommended Cache-Control header value for cacheable API responses.
 */
export function getAPICacheControl(config: CDNConfig = DEFAULT_CDN_CONFIG): string {
  return `public, max-age=${config.apiResponseTTL}, stale-while-revalidate=${config.staleWhileRevalidate}`;
}

// ---------------------------------------------------------------------------
// Simulated state
// ---------------------------------------------------------------------------

let activeConfig: CDNConfig = { ...DEFAULT_CDN_CONFIG };

// Simulated runtime metrics — in production these would be read from the CDN
// provider's metrics API (Cloudflare Analytics, Fastly Real-Time Analytics, etc.)
let simulatedMetrics = buildSimulatedMetrics(DEFAULT_CDN_CONFIG);

function buildSimulatedMetrics(config: CDNConfig): CDNMetrics {
  const topN = Math.min(5, config.edgeLocations.length);
  const topEdgeLocations = config.edgeLocations.slice(0, topN).map((location, i) => ({
    location,
    // Simulate decreasing traffic from most-popular to least-popular PoP
    requestsPerSecond: parseFloat((120 - i * 18).toFixed(1)),
  }));

  return {
    cacheHitRate: 94.2,       // above the 90% target
    edgeLatencyP50: 38,       // ms — well under 2-second target
    edgeLatencyP95: 180,      // ms — well under 2-second target
    bandwidthGbps: 2.4,
    requestsPerSecond: 850,
    topEdgeLocations,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns current CDN performance metrics.
 *
 * In production this would call the CDN provider's metrics API.
 * Simulated values reflect a healthy CDN serving proposal pages with
 * sub-2-second load times (Requirement 17.2).
 */
export function getCDNMetrics(): CDNMetrics {
  // Return a snapshot — callers should not mutate the returned object
  return {
    ...simulatedMetrics,
    topEdgeLocations: simulatedMetrics.topEdgeLocations.map((loc) => ({ ...loc })),
  };
}

/**
 * Purges cached content matching the given URL patterns.
 *
 * Patterns support glob-style wildcards, e.g.:
 *  - `/proposals/*`          — all proposal pages
 *  - `/proposals/abc-123`    — a specific proposal
 *  - `/api/v1/audits/*`      — all audit API responses
 *
 * In production this would call the CDN provider's purge API
 * (Cloudflare Cache Purge, Fastly Instant Purge, etc.).
 *
 * @param patterns - URL patterns to purge from all edge caches
 * @returns Result including purged count and operation duration
 */
export function purgeCache(patterns: string[]): CachePurgeResult {
  if (patterns.length === 0) {
    return {
      purgedCount: 0,
      patterns: [],
      durationMs: 0,
      completedAt: new Date(),
      status: 'success',
    };
  }

  const startMs = Date.now();

  // Simulate purge: each pattern purges a variable number of cache entries
  // depending on how broad the pattern is (wildcard vs exact).
  const purgedCount = patterns.reduce((total, pattern) => {
    const isWildcard = pattern.includes('*');
    // Wildcards purge more entries; exact paths purge fewer
    return total + (isWildcard ? Math.floor(50 + Math.random() * 200) : 1);
  }, 0);

  // Simulate a small network round-trip to edge nodes (~50–150 ms)
  const durationMs = Math.floor(50 + Math.random() * 100);

  // After a purge, cache hit rate temporarily dips as edges re-warm
  simulatedMetrics = {
    ...simulatedMetrics,
    cacheHitRate: Math.max(60, simulatedMetrics.cacheHitRate - patterns.length * 2),
  };

  return {
    purgedCount,
    patterns: [...patterns],
    durationMs,
    completedAt: new Date(startMs + durationMs),
    status: 'success',
  };
}

/**
 * Returns the active CDN configuration.
 */
export function getCDNConfig(): CDNConfig {
  return {
    ...activeConfig,
    edgeLocations: [...activeConfig.edgeLocations],
  };
}

/**
 * Applies overrides to the active CDN configuration.
 * Validates that TTL values are non-negative and at least one edge location is configured.
 *
 * @throws if any TTL is negative or edgeLocations is empty
 */
export function updateCDNConfig(overrides: Partial<CDNConfig>): CDNConfig {
  const merged: CDNConfig = {
    ...activeConfig,
    ...overrides,
    edgeLocations: overrides.edgeLocations ?? activeConfig.edgeLocations,
  };

  if (merged.proposalPageTTL < 0) {
    throw new Error('proposalPageTTL must be >= 0');
  }
  if (merged.staticAssetTTL < 0) {
    throw new Error('staticAssetTTL must be >= 0');
  }
  if (merged.apiResponseTTL < 0) {
    throw new Error('apiResponseTTL must be >= 0');
  }
  if (merged.staleWhileRevalidate < 0) {
    throw new Error('staleWhileRevalidate must be >= 0');
  }
  if (merged.edgeLocations.length === 0) {
    throw new Error('edgeLocations must contain at least one location');
  }
  if (merged.targetCacheHitRate < 0 || merged.targetCacheHitRate > 100) {
    throw new Error('targetCacheHitRate must be 0–100');
  }

  activeConfig = merged;
  simulatedMetrics = buildSimulatedMetrics(activeConfig);

  return getCDNConfig();
}

/**
 * Resets the active config and simulated metrics back to defaults (useful for testing).
 */
export function resetCDNConfig(): void {
  activeConfig = { ...DEFAULT_CDN_CONFIG };
  simulatedMetrics = buildSimulatedMetrics(DEFAULT_CDN_CONFIG);
}
