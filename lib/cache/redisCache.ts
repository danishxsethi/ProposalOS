/**
 * Redis-backed distributed caching layer
 * 
 * Provides caching for:
 * - Audit results (24h TTL per URL)
 * - Lighthouse/PageSpeed results (24h TTL)
 * - Proposal templates (until modified)
 * - GBP/Places API responses (24h TTL)
 * 
 * Phase Y: Includes cache hit rate metrics for ROI analysis
 */

import Redis, { Redis as RedisClient } from 'ioredis';

import { logger } from '@/lib/logger';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // in seconds
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix for namespacing
}

/**
 * Cache metrics for hit rate tracking
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  bytesSaved: number; // Estimated bytes saved from cache hits
}

export class RedisCache {
  private client: RedisClient | null = null;
  private isConnected = false;
  private readonly defaultTTL = 24 * 60 * 60; // 24 hours in seconds
  
  // P1: Cache hit rate metrics
  private metrics: Map<string, CacheMetrics> = new Map();
  private readonly metricsRetentionHours = 24; // Keep metrics for 24 hours

  private async init(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      logger.warn('[RedisCache] REDIS_URL not configured, caching disabled');
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 5,
        retryStrategy: (times: number) => {
          if (times > 5) {
            logger.error('[RedisCache] Max reconnection attempts reached');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      this.client.on('error', (err: Error) => {
        logger.error({ err: err.message }, '[RedisCache] Client error');
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('[RedisCache] Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('close', () => {
        logger.warn('[RedisCache] Connection closed');
        this.isConnected = false;
      });

      // Wait for ready
      await new Promise<void>((resolve, reject) => {
        if (this.client?.status === 'ready') {
          resolve();
        } else {
          this.client?.once('ready', resolve);
          this.client?.once('error', reject);
        }
      });
    } catch (error) {
      logger.error({ error }, '[RedisCache] Failed to initialize');
      this.isConnected = false;
    }
  }

  private generateKey(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }

  async get<T>(prefix: string, identifier: string, options?: {
    tenantId?: string;
    allowShared?: boolean;
  }): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const { tenantId, allowShared = true } = options || {};
      
      // P2: Try tenant-specific cache first
      let key = tenantId ? `${prefix}:tenant:${tenantId}:${identifier}` : this.generateKey(prefix, identifier);
      let data = await this.client.get(key);

      if (!data && allowShared) {
        // P2: Fall back to shared cache for common prefixes
        const sharedPrefixes = ['audit', 'lighthouse', 'pagespeed', 'gbp'];
        if (sharedPrefixes.includes(prefix)) {
          key = this.generateKey(`${prefix}:shared`, identifier);
          data = await this.client.get(key);
          if (data) {
            logger.debug({ key, prefix }, '[RedisCache] Cache hit (shared)');
          }
        }
      }

      if (!data) {
        // P1: Track cache miss
        this.recordMetric(prefix, 'miss');
        return null;
      }

      const entry = JSON.parse(data) as CacheEntry<T>;
      
      // Check if expired
      if (Date.now() > entry.timestamp + entry.ttl * 1000) {
        await this.delete(prefix, identifier, { tenantId });
        // P1: Track cache miss (expired)
        this.recordMetric(prefix, 'miss');
        return null;
      }

      // P1: Track cache hit
      this.recordMetric(prefix, 'hit', JSON.stringify(entry.data).length);
      logger.debug({ key, prefix, shared: !key.includes(`tenant:${tenantId}`) }, '[RedisCache] Cache hit');
      return entry.data;
    } catch (error) {
      logger.error({ error, prefix, identifier }, '[RedisCache] Get failed');
      return null;
    }
  }

  async set<T>(
    prefix: string,
    identifier: string,
    data: T,
    options?: CacheOptions & {
      tenantId?: string;
      shared?: boolean;
    }
  ): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const { tenantId, shared = false, ...cacheOptions } = options || {};
      const ttl = cacheOptions.ttl ?? this.defaultTTL;
      
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
      };

      const serialized = JSON.stringify(entry);
      
      // P2: Determine key based on shared vs tenant-specific
      let key: string;
      if (shared) {
        // Shared cache for all tenants
        key = this.generateKey(`${prefix}:shared`, identifier);
      } else if (tenantId) {
        // Tenant-specific cache
        key = `${prefix}:tenant:${tenantId}:${identifier}`;
      } else {
        key = this.generateKey(prefix, identifier);
      }
      
      // Use setex for atomic set with expiry
      await this.client.setex(key, ttl, serialized);

      // P1: Track cache set for metrics (internal tracking only)
      logger.debug({ key, prefix, ttl, size: serialized.length, shared }, '[RedisCache] Cache set');
      return true;
    } catch (error) {
      logger.error({ error, prefix, identifier }, '[RedisCache] Set failed');
      return false;
    }
  }

  async delete(prefix: string, identifier: string, options?: {
    tenantId?: string;
    alsoDeleteShared?: boolean;
  }): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const { tenantId, alsoDeleteShared = false } = options || {};
      const keys: string[] = [];
      
      // Delete tenant-specific key
      if (tenantId) {
        keys.push(`${prefix}:tenant:${tenantId}:${identifier}`);
      }
      
      // Always delete base key
      keys.push(this.generateKey(prefix, identifier));
      
      // Optionally delete shared key
      if (alsoDeleteShared) {
        keys.push(this.generateKey(`${prefix}:shared`, identifier));
      }

      // Remove duplicates and delete
      const uniqueKeys = [...new Set(keys)];
      await this.client.del(uniqueKeys);
      
      logger.debug({ keys: uniqueKeys, prefix }, '[RedisCache] Cache deleted');
      return true;
    } catch (error) {
      logger.error({ error, prefix, identifier }, '[RedisCache] Delete failed');
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isConnected || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(keys);
      logger.info({ count: keys.length, pattern }, '[RedisCache] Pattern invalidated');
      return keys.length;
    } catch (error) {
      logger.error({ error, pattern }, '[RedisCache] Invalidate pattern failed');
      return 0;
    }
  }

  getStatus(): { connected: boolean; client: string } {
    return {
      connected: this.isConnected,
      client: this.client ? 'initialized' : 'not initialized',
    };
  }

  // ============================================================================
  // P1: Cache Hit Rate Metrics
  // ============================================================================

  /**
   * Record a cache hit or miss for metrics tracking
   */
  private recordMetric(prefix: string, type: 'hit' | 'miss', bytesSaved?: number): void {
    let metrics = this.metrics.get(prefix);
    
    if (!metrics) {
      metrics = {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalRequests: 0,
        bytesSaved: 0,
      };
      this.metrics.set(prefix, metrics);
    }

    metrics.totalRequests++;
    
    if (type === 'hit') {
      metrics.hits++;
      if (bytesSaved) {
        metrics.bytesSaved += bytesSaved;
      }
    } else {
      metrics.misses++;
    }

    // Recalculate hit rate
    metrics.hitRate = metrics.totalRequests > 0 
      ? (metrics.hits / metrics.totalRequests) * 100 
      : 0;
  }

  /**
   * Get cache metrics for a specific prefix
   */
  getMetrics(prefix: string): CacheMetrics | null {
    return this.metrics.get(prefix) || null;
  }

  /**
   * Get aggregated cache metrics across all prefixes
   */
  getAggregateMetrics(): {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    totalRequests: number;
    totalBytesSaved: number;
    byPrefix: Record<string, CacheMetrics>;
  } {
    let totalHits = 0;
    let totalMisses = 0;
    let totalRequests = 0;
    let totalBytesSaved = 0;
    const byPrefix: Record<string, CacheMetrics> = {};

    for (const [prefix, metrics] of this.metrics.entries()) {
      totalHits += metrics.hits;
      totalMisses += metrics.misses;
      totalRequests += metrics.totalRequests;
      totalBytesSaved += metrics.bytesSaved;
      byPrefix[prefix] = { ...metrics };
    }

    const overallHitRate = totalRequests > 0 
      ? (totalHits / totalRequests) * 100 
      : 0;

    return {
      totalHits,
      totalMisses,
      overallHitRate,
      totalRequests,
      totalBytesSaved,
      byPrefix,
    };
  }

  /**
   * Get estimated cost savings from caching
   * Based on API call costs avoided
   */
  getEstimatedSavings(): {
    dailySavingsCents: number;
    monthlySavingsCents: number;
    breakdown: Record<string, { requests: number; savingsCents: number }>;
  } {
    const metrics = this.getAggregateMetrics();
    const breakdown: Record<string, { requests: number; savingsCents: number }> = {};
    
    // Estimated cost per API call avoided (in cents)
    const costPerCall: Record<string, number> = {
      audit: 5, // Average audit cost
      lighthouse: 0, // PageSpeed is free
      pagespeed: 0,
      gbp: 3, // Places API
      places: 3,
      serp: 1,
      competitor: 1,
    };

    let dailySavingsCents = 0;
    
    for (const [prefix, prefixMetrics] of Object.entries(metrics.byPrefix)) {
      const callsAvoided = prefixMetrics.hits;
      const costPerApiCall = costPerCall[prefix] || 0;
      const savingsCents = callsAvoided * costPerApiCall;
      
      breakdown[prefix] = {
        requests: callsAvoided,
        savingsCents,
      };
      
      dailySavingsCents += savingsCents;
    }

    return {
      dailySavingsCents,
      monthlySavingsCents: dailySavingsCents * 30,
      breakdown,
    };
  }

  /**
   * Clear metrics older than retention period
   */
  clearOldMetrics(): void {
    // For now, just clear all metrics
    // In production, you might want to persist metrics to a database
    // and only clear after they've been persisted
    this.metrics.clear();
    logger.info('[RedisCache] Cache metrics cleared');
  }

  /**
   * Reset metrics for a specific prefix
   */
  resetMetrics(prefix: string): void {
    this.metrics.delete(prefix);
    logger.info({ prefix }, '[RedisCache] Cache metrics reset for prefix');
  }
}

// Cache key generators
export const CacheKeys = {
  audit: (urlHash: string) => `audit:${urlHash}`,
  lighthouse: (url: string, device: 'mobile' | 'desktop') =>
    `lighthouse:${device}:${encodeURIComponent(url)}`,
  pagespeed: (url: string, strategy: 'desktop' | 'mobile') =>
    `pagespeed:${strategy}:${encodeURIComponent(url)}`,
  gbp: (placeId: string) => `gbp:${placeId}`,
  places: (query: string) => `places:${encodeURIComponent(query)}`,
  serp: (query: string) => `serp:${encodeURIComponent(query)}`,
  proposal: (templateId: string) => `proposal:template:${templateId}`,
  competitor: (keyword: string, location: string) =>
    `competitor:${encodeURIComponent(keyword)}:${encodeURIComponent(location)}`,
};

// Global cache instance
export const redisCache = new RedisCache();