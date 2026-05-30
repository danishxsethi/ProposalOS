/**
 * LLM Request Caching Layer
 *
 * Caches LLM responses to reduce costs and improve latency for repeated prompts.
 * Uses LRU eviction with TTL (time-to-live) for cache entries.
 *
 * Features:
 * - LRU cache with configurable max size
 * - TTL-based expiration (default: 1 hour)
 * - Cache key based on prompt hash + model + parameters
 * - Memory-efficient storage with automatic cleanup
 */

import crypto from 'crypto';

import { logger } from '@/lib/logger';

export interface CacheEntry<T = string> {
  value: T;
  createdAt: number;
  lastAccessed: number;
  ttl: number;
  metadata?: {
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    model?: string;
  };
}

export interface CacheOptions {
  maxSize?: number; // Max entries before LRU eviction
  defaultTtl?: number; // Default TTL in milliseconds (1 hour)
  enabled?: boolean; // Enable/disable caching
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  maxSize: 1000,
  defaultTtl: 60 * 60 * 1000, // 1 hour
  enabled: true,
};

class LlmCache {
  private cache = new Map<string, CacheEntry>();
  private options: Required<CacheOptions>;
  private hits = 0;
  private misses = 0;

  constructor(options: CacheOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Periodic cleanup of expired entries
    if (this.options.enabled) {
      this.startCleanupInterval();
    }
  }

  /**
   * Generate cache key from request parameters
   */
  generateCacheKey(params: {
    prompt: string;
    model: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseModality?: string;
  }): string {
    const keyString = JSON.stringify({
      prompt: params.prompt,
      model: params.model,
      temperature: params.temperature ?? 0.4,
      maxOutputTokens: params.maxOutputTokens ?? 2048,
      responseModality: params.responseModality ?? 'text',
    });
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Get cached response
   */
  get<T = string>(key: string): T | null {
    if (!this.options.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update last accessed for LRU
    entry.lastAccessed = Date.now();
    this.hits++;

    logger.debug({ key, hit: true }, 'Cache lookup');
    return entry.value as T;
  }

  /**
   * Set cached response
   */
  set<T = string>(
    key: string,
    value: T,
    options?: { ttl?: number; metadata?: CacheEntry['metadata'] }
  ): void {
    if (!this.options.enabled) return;

    // Evict if at capacity
    if (this.cache.size >= this.options.maxSize) {
      this.evictLru();
    }

    const entry: CacheEntry = {
      value: value as unknown as string,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttl: options?.ttl ?? this.options.defaultTtl,
      metadata: options?.metadata,
    };

    this.cache.set(key, entry);
    logger.debug({ key, size: this.cache.size }, 'Cache set');
  }

  /**
   * Delete cached entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    maxSize: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      maxSize: this.options.maxSize,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLru(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug({ key: oldestKey }, 'Cache eviction (LRU)');
    }
  }

  /**
   * Periodic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    const cleanupInterval = 5 * 60 * 1000;

    setInterval(() => {
      const now = Date.now();
      let deleted = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.createdAt > entry.ttl) {
          this.cache.delete(key);
          deleted++;
        }
      }

      if (deleted > 0) {
        logger.debug({ deleted, size: this.cache.size }, 'Cache cleanup');
      }
    }, cleanupInterval);
  }

  /**
   * Disable caching
   */
  disable(): void {
    this.options.enabled = false;
  }

  /**
   * Enable caching
   */
  enable(): void {
    this.options.enabled = true;
  }
}

// Singleton instance
export const llmCache = new LlmCache({
  maxSize: parseInt(process.env.LLM_CACHE_MAX_SIZE || '1000'),
  defaultTtl: parseInt(process.env.LLM_CACHE_TTL_MS || '3600000'),
  enabled: process.env.LLM_CACHE_ENABLED !== 'false',
});

export default llmCache;
