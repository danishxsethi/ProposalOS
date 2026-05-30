import { Finding } from '@prisma/client';

import { ProposalResult } from './types';
import { PainCluster } from '../diagnosis/types';
import { logger } from '../logger';

export interface CacheKeyParams {
  businessName: string;
  businessIndustry?: string;
  clusterHash: string;
  findingsHash: string;
  sectionType: string;
}

export interface CacheEntry {
  content: any;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
}

export class ProposalCachingManager {
  private cache: Map<string, CacheEntry>;
  private readonly defaultTTL: number = 3600000; // 1 hour in ms
  private readonly maxSize: number = 1000; // Max cache entries

  constructor() {
    this.cache = new Map();
  }

  /**
   * Generate cache key from parameters
   */
  generateCacheKey(params: CacheKeyParams): string {
    const key = `${params.businessName}:${params.businessIndustry || 'unknown'}:${params.clusterHash}:${params.findingsHash}:${params.sectionType}`;
    return this.hashString(key);
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate hash from clusters for cache key
   */
  generateClusterHash(clusters: PainCluster[]): string {
    const clusterData = clusters
      .map((cluster) => ({
        rootCause: cluster.rootCause,
        severity: cluster.severity,
        findingIds: cluster.findingIds.sort(),
      }))
      .sort((a, b) => a.rootCause.localeCompare(b.rootCause));

    return this.hashString(JSON.stringify(clusterData));
  }

  /**
   * Generate hash from findings for cache key
   */
  generateFindingsHash(findings: Finding[]): string {
    const findingsData = findings
      .map((finding) => ({
        id: finding.id,
        title: finding.title,
        impactScore: finding.impactScore,
        type: finding.type,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return this.hashString(JSON.stringify(findingsData));
  }

  /**
   * Get cached content
   */
  getCached(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      logger.debug(`Cache entry expired and removed: ${key}`);
      return null;
    }

    // Update access stats
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.cache.set(key, entry);

    logger.debug(`Cache hit for key: ${key}`);
    return entry.content;
  }

  /**
   * Set cached content
   */
  setCached(key: string, content: any, ttl: number = this.defaultTTL): void {
    // Evict oldest entries if cache is too large
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      ttl,
      hits: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    logger.debug(`Cache set for key: ${key}`);
  }

  /**
   * Delete cached content
   */
  deleteCached(key: string): void {
    this.cache.delete(key);
    logger.debug(`Cache deleted for key: ${key}`);
  }

  /**
   * Evict oldest entries to manage cache size
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Cache evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    totalHits: number;
    hitRate: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, entry) => sum + entry.hits, 0);
    const totalAccesses = entries.length + totalHits; // misses + hits
    const hitRate = totalAccesses > 0 ? totalHits / totalAccesses : 0;

    return {
      size: this.cache.size,
      totalHits,
      hitRate,
    };
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    let cleared = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleared++;
      }
    }

    logger.debug(`Cleared ${cleared} expired cache entries`);
    return cleared;
  }

  /**
   * Cache wrapper for expensive operations
   */
  async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.getCached(key);
    if (cached !== null) {
      return cached;
    }

    // Execute operation and cache result
    const result = await operation();
    this.setCached(key, result, ttl);
    return result;
  }

  /**
   * Cache proposal section generation
   */
  async cacheSectionGeneration(
    businessName: string,
    businessIndustry: string | undefined,
    clusters: PainCluster[],
    findings: Finding[],
    sectionType: string,
    generator: () => Promise<any>,
    ttl: number = this.defaultTTL
  ): Promise<any> {
    const clusterHash = this.generateClusterHash(clusters);
    const findingsHash = this.generateFindingsHash(findings);

    const cacheParams: CacheKeyParams = {
      businessName,
      businessIndustry,
      clusterHash,
      findingsHash,
      sectionType,
    };

    const cacheKey = this.generateCacheKey(cacheParams);

    return this.withCache(cacheKey, generator, ttl);
  }

  /**
   * Invalidate cache for specific business
   */
  invalidateBusinessCache(businessName: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(businessName)) {
        this.cache.delete(key);
      }
    }
    logger.debug(`Invalidated cache for business: ${businessName}`);
  }

  /**
   * Invalidate cache for specific clusters/findings
   */
  invalidateRelatedCache(clusters: PainCluster[], findings: Finding[]): void {
    const clusterHash = this.generateClusterHash(clusters);
    const findingsHash = this.generateFindingsHash(findings);

    for (const [key] of this.cache.entries()) {
      if (key.includes(clusterHash) || key.includes(findingsHash)) {
        this.cache.delete(key);
      }
    }
    logger.debug(`Invalidated cache for clusters and findings`);
  }
}

// Global caching manager instance
export const proposalCache = new ProposalCachingManager();
