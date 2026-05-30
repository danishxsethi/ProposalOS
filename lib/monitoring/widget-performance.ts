import { logger } from '@/lib/logger';
/**
 * Widget Performance Monitoring
 *
 * Tracks widget embed performance across client sites globally.
 * Ensures P95 latency < 200ms for widget embed as per Phase N requirements.
 */

export interface WidgetPerformanceMetrics {
  /** Unique widget instance ID */
  instanceId: string;
  /** Tenant ID */
  tenantId: string;
  /** Client site URL where widget is embedded */
  clientUrl: string;
  /** Geographic region of the client */
  region: string;
  /** Country code */
  country: string;
  /** Widget load time in milliseconds */
  loadTimeMs: number;
  /** Time to first byte */
  ttfbMs: number;
  /** Time to interactive */
  ttiMs: number;
  /** Whether widget loaded from cache */
  fromCache: boolean;
  /** CDN edge location */
  edgeLocation: string;
  /** Timestamp */
  timestamp: Date;
  /** User agent */
  userAgent: string;
  /** Connection type (4g, 3g, 2g, slow-2g) */
  connectionType: string;
  /** Widget version */
  widgetVersion: string;
  /** Error message if any */
  error?: string;
}

/**
 * Performance thresholds for widget embed
 */
export const WIDGET_PERFORMANCE_THRESHOLDS = {
  /** P95 latency target */
  p95LatencyMs: 200,
  /** P99 latency target */
  p99LatencyMs: 500,
  /** Minimum cache hit ratio */
  minCacheHitRatio: 0.8,
  /** Maximum error rate */
  maxErrorRate: 0.01,
  /** Time to first byte target */
  ttfbTargetMs: 50,
  /** Time to interactive target */
  ttiTargetMs: 1000,
};

/**
 * Performance buckets for histogram
 */
export const LATENCY_BUCKETS = [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000];

/**
 * Store widget performance metrics
 */
export async function recordWidgetPerformance(
  metrics: Omit<WidgetPerformanceMetrics, 'timestamp'>
): Promise<void> {
  const record: WidgetPerformanceMetrics = {
    ...metrics,
    timestamp: new Date(),
  };

  try {
    // Send to analytics endpoint
    await fetch('/api/widget/performance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
      keepalive: true,
    });
  } catch (error) {
    // Silently fail - don't break widget functionality
    logger.error({ error }, '[Widget Performance] Failed to record metrics');
  }
}

/**
 * Calculate P95 latency from a set of measurements
 */
export function calculateP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;

  const sorted = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0;
}

/**
 * Calculate P99 latency from a set of measurements
 */
export function calculateP99(latencies: number[]): number {
  if (latencies.length === 0) return 0;

  const sorted = [...latencies].sort((a, b) => a - b);
  const p99Index = Math.ceil(sorted.length * 0.99) - 1;
  return sorted[p99Index] ?? sorted[sorted.length - 1] ?? 0;
}

/**
 * Calculate average latency
 */
export function calculateAverage(latencies: number[]): number {
  if (latencies.length === 0) return 0;

  const sum = latencies.reduce((acc, val) => acc + val, 0);
  return sum / latencies.length;
}

/**
 * Performance report structure
 */
export interface WidgetPerformanceReport {
  /** Time period start */
  periodStart: Date;
  /** Time period end */
  periodEnd: Date;
  /** Total measurements */
  totalMeasurements: number;
  /** P95 latency */
  p95LatencyMs: number;
  /** P99 latency */
  p99LatencyMs: number;
  /** Average latency */
  avgLatencyMs: number;
  /** Cache hit ratio */
  cacheHitRatio: number;
  /** Error rate */
  errorRate: number;
  /** Measurements by region */
  byRegion: Record<
    string,
    {
      count: number;
      p95LatencyMs: number;
      avgLatencyMs: number;
    }
  >;
  /** Measurements by country */
  byCountry: Record<
    string,
    {
      count: number;
      p95LatencyMs: number;
      avgLatencyMs: number;
    }
  >;
  /** Pass/fail against thresholds */
  passesThresholds: boolean;
  /** Failed threshold details */
  failedThresholds: string[];
}

/**
 * Generate performance report from metrics
 */
export function generatePerformanceReport(
  metrics: WidgetPerformanceMetrics[],
  periodStart: Date,
  periodEnd: Date
): WidgetPerformanceReport {
  const latencies = metrics.map((m) => m.loadTimeMs);
  const cachedCount = metrics.filter((m) => m.fromCache).length;
  const errorCount = metrics.filter((m) => m.error).length;

  // Group by region
  const byRegionMap = new Map<string, number[]>();
  metrics.forEach((m) => {
    const existing = byRegionMap.get(m.region) || [];
    existing.push(m.loadTimeMs);
    byRegionMap.set(m.region, existing);
  });

  // Group by country
  const byCountryMap = new Map<string, number[]>();
  metrics.forEach((m) => {
    const existing = byCountryMap.get(m.country) || [];
    existing.push(m.loadTimeMs);
    byCountryMap.set(m.country, existing);
  });

  const byRegion: Record<string, { count: number; p95LatencyMs: number; avgLatencyMs: number }> =
    {};
  byRegionMap.forEach((latencies, region) => {
    byRegion[region] = {
      count: latencies.length,
      p95LatencyMs: calculateP95(latencies),
      avgLatencyMs: calculateAverage(latencies),
    };
  });

  const byCountry: Record<string, { count: number; p95LatencyMs: number; avgLatencyMs: number }> =
    {};
  byCountryMap.forEach((latencies, country) => {
    byCountry[country] = {
      count: latencies.length,
      p95LatencyMs: calculateP95(latencies),
      avgLatencyMs: calculateAverage(latencies),
    };
  });

  const p95Latency = calculateP95(latencies);
  const p99Latency = calculateP99(latencies);
  const avgLatency = calculateAverage(latencies);
  const cacheHitRatio = cachedCount / metrics.length;
  const errorRate = errorCount / metrics.length;

  const failedThresholds: string[] = [];

  if (p95Latency > WIDGET_PERFORMANCE_THRESHOLDS.p95LatencyMs) {
    failedThresholds.push(
      `P95 latency ${p95Latency}ms > ${WIDGET_PERFORMANCE_THRESHOLDS.p95LatencyMs}ms`
    );
  }

  if (p99Latency > WIDGET_PERFORMANCE_THRESHOLDS.p99LatencyMs) {
    failedThresholds.push(
      `P99 latency ${p99Latency}ms > ${WIDGET_PERFORMANCE_THRESHOLDS.p99LatencyMs}ms`
    );
  }

  if (cacheHitRatio < WIDGET_PERFORMANCE_THRESHOLDS.minCacheHitRatio) {
    failedThresholds.push(
      `Cache hit ratio ${cacheHitRatio.toFixed(2)} < ${WIDGET_PERFORMANCE_THRESHOLDS.minCacheHitRatio}`
    );
  }

  if (errorRate > WIDGET_PERFORMANCE_THRESHOLDS.maxErrorRate) {
    failedThresholds.push(
      `Error rate ${errorRate.toFixed(4)} > ${WIDGET_PERFORMANCE_THRESHOLDS.maxErrorRate}`
    );
  }

  return {
    periodStart,
    periodEnd,
    totalMeasurements: metrics.length,
    p95LatencyMs: p95Latency,
    p99LatencyMs: p99Latency,
    avgLatencyMs: avgLatency,
    cacheHitRatio,
    errorRate,
    byRegion,
    byCountry,
    passesThresholds: failedThresholds.length === 0,
    failedThresholds,
  };
}

/**
 * Get navigation timing for widget load
 */
export function getWidgetLoadMetrics(): {
  loadTimeMs: number;
  ttfbMs: number;
  ttiMs: number;
  fromCache: boolean;
} {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const now = performance.now();

  return {
    loadTimeMs: Math.round(now),
    ttfbMs: Math.round(navigation.responseStart),
    ttiMs: Math.round(now),
    fromCache: navigation.transferSize === 0,
  };
}

/**
 * Get connection info
 */
export function getConnectionInfo(): {
  connectionType: string;
  downlink?: number;
  rtt?: number;
} {
  const conn = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
      };
    }
  ).connection;

  return {
    connectionType: conn?.effectiveType || 'unknown',
    downlink: conn?.downlink,
    rtt: conn?.rtt,
  };
}

/**
 * Get geographic info from CDN headers or IP geolocation
 */
export async function getGeoInfo(): Promise<{
  region: string;
  country: string;
  edgeLocation: string;
}> {
  try {
    // Try to get from CDN headers first
    const response = await fetch('/api/widget/geo', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Fall back to defaults
  }

  return {
    region: 'unknown',
    country: 'unknown',
    edgeLocation: 'unknown',
  };
}

/**
 * Performance observer for real-time monitoring
 */
export function startWidgetPerformanceObserver(
  tenantId: string,
  instanceId: string,
  clientUrl: string
): void {
  // Record initial load
  const { loadTimeMs, ttfbMs, ttiMs, fromCache } = getWidgetLoadMetrics();
  const { connectionType } = getConnectionInfo();

  getGeoInfo().then(({ region, country, edgeLocation }) => {
    recordWidgetPerformance({
      instanceId,
      tenantId,
      clientUrl,
      region,
      country,
      edgeLocation,
      loadTimeMs,
      ttfbMs,
      ttiMs,
      fromCache,
      userAgent: navigator.userAgent,
      connectionType,
      widgetVersion: '2.0',
    });
  });

  // Observe resource loads
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('widget.js')) {
        // Widget resource loaded
        logger.info(
          {
            name: entry.name,
            duration: entry.duration,
            transferSize: (entry as PerformanceResourceTiming).transferSize,
          },
          '[Widget Performance] Resource loaded'
        );
      }
    }
  });

  observer.observe({ entryTypes: ['resource'] });
}

/**
 * Send performance beacon on page unload
 */
export function sendWidgetPerformanceBeacon(
  tenantId: string,
  instanceId: string,
  clientUrl: string
): void {
  const { loadTimeMs, ttfbMs, ttiMs, fromCache } = getWidgetLoadMetrics();
  const { connectionType } = getConnectionInfo();

  const beaconData = {
    instanceId,
    tenantId,
    clientUrl,
    loadTimeMs,
    ttfbMs,
    ttiMs,
    fromCache,
    connectionType,
    widgetVersion: '2.0',
  };

  // Use sendBeacon for reliable delivery
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/widget/performance',
      new Blob([JSON.stringify(beaconData)], { type: 'application/json' })
    );
  }
}

export default {
  recordWidgetPerformance,
  calculateP95,
  calculateP99,
  calculateAverage,
  generatePerformanceReport,
  getWidgetLoadMetrics,
  getConnectionInfo,
  getGeoInfo,
  startWidgetPerformanceObserver,
  sendWidgetPerformanceBeacon,
  WIDGET_PERFORMANCE_THRESHOLDS,
  LATENCY_BUCKETS,
};
