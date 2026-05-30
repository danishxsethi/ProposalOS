/**
 * lib/cache/moduleCache.ts
 *
 * Multi-instance-safe Module Cache
 *
 * Wraps the SharedStore (Redis in prod, in-memory in dev/test) to provide a
 * versioned, fingerprinted cache for expensive deterministic audit modules.
 *
 * This is the production-safe replacement for the file-system fallback in
 * `lib/cache/apiCache.ts` (which is unsafe for multi-instance Cloud Run).
 *
 * Cache key shape:
 *   module-cache:{module}:v{version}:{sha256(JSON.stringify(input))}
 *
 *   - module:    name of the producing module (places-text-search, lighthouse, …)
 *   - version:   integer schema version — bump to invalidate old entries
 *   - input:     deterministic JSON of the inputs (URL, locale, config flags)
 *
 * Hit/miss is logged with safe metadata only (no raw URLs, no body content).
 * Values are stored as JSON; callers MUST NOT cache secrets, raw LLM
 * prompts, or raw LLM responses that could contain customer-private data.
 */

import { createHash } from 'crypto';

import { logger } from '@/lib/logger';
import { getSharedStore } from '@/lib/store/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModuleCacheKey {
  /** Module name — drives the key namespace and metrics labels */
  module: string;
  /** Integer schema version for this module's cache.  Bump to invalidate. */
  version: number;
  /** Deterministic input fingerprint material — keys are sorted before hashing */
  input: Record<string, unknown>;
}

export interface ModuleCacheOptions {
  /** TTL in seconds.  Required — no implicit default to prevent indefinite cache */
  ttlSeconds: number;
}

export interface CacheLookupResult<T> {
  hit: boolean;
  value: T | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_PREFIX = 'module-cache';

// Per-module recommended TTL in seconds (keep public so callers reference these)
export const MODULE_CACHE_TTL = {
  /** Lighthouse / PageSpeed — 24h (deterministic for same URL) */
  LIGHTHOUSE: 24 * 60 * 60,
  /** Google Places text search — 24h (place IDs are stable) */
  PLACES_TEXT_SEARCH: 24 * 60 * 60,
  /** Google Places details — 24h */
  PLACES_DETAILS: 24 * 60 * 60,
  /** SerpAPI / search results — 6h (rankings shift faster) */
  SERP: 6 * 60 * 60,
  /** Generic short — for less stable data */
  SHORT: 1 * 60 * 60,
} as const;

// ─── Key generation ───────────────────────────────────────────────────────────

function fingerprintInput(input: Record<string, unknown>): string {
  const sortedKeys = Object.keys(input).sort();
  const canonical = JSON.stringify(input, sortedKeys);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function buildCacheKey(key: ModuleCacheKey): string {
  return `${KEY_PREFIX}:${key.module}:v${key.version}:${fingerprintInput(key.input)}`;
}

// ─── Lookup / Store ───────────────────────────────────────────────────────────

/**
 * Look up a cached value.  Returns { hit: false, value: null } on miss or
 * any cache error (errors do NOT block the caller — they fall through to
 * the live module call).
 */
export async function getCached<T>(key: ModuleCacheKey): Promise<CacheLookupResult<T>> {
  const fullKey = buildCacheKey(key);
  try {
    const store = await getSharedStore();
    const raw = await store.get(fullKey);
    if (!raw) {
      logger.debug(
        { event: 'module_cache.miss', module: key.module, version: key.version },
        'ModuleCache: miss'
      );
      return { hit: false, value: null };
    }

    try {
      const value = JSON.parse(raw) as T;
      logger.info(
        { event: 'module_cache.hit', module: key.module, version: key.version },
        'ModuleCache: hit'
      );
      return { hit: true, value };
    } catch (parseErr) {
      // Corrupted entry — purge and return miss
      logger.warn(
        { event: 'module_cache.corrupt_entry', module: key.module, err: parseErr },
        'ModuleCache: corrupt entry — purging'
      );
      await store.del(fullKey).catch(() => undefined);
      return { hit: false, value: null };
    }
  } catch (err) {
    logger.warn(
      { event: 'module_cache.lookup_error', module: key.module, err },
      'ModuleCache: lookup error'
    );
    return { hit: false, value: null };
  }
}

/**
 * Store a value.  Errors are logged and swallowed — caching never blocks
 * the caller.
 */
export async function setCached<T>(
  key: ModuleCacheKey,
  value: T,
  options: ModuleCacheOptions
): Promise<void> {
  const fullKey = buildCacheKey(key);
  try {
    const store = await getSharedStore();
    await store.set(fullKey, JSON.stringify(value), options.ttlSeconds);
    logger.debug(
      {
        event: 'module_cache.set',
        module: key.module,
        version: key.version,
        ttlSeconds: options.ttlSeconds,
      },
      'ModuleCache: stored'
    );
  } catch (err) {
    logger.warn(
      { event: 'module_cache.set_error', module: key.module, err },
      'ModuleCache: set error'
    );
  }
}

/**
 * Convenience wrapper: try cache, fall through to fresh fetch on miss, store
 * fresh result.  This is the recommended call-site shape for module callers.
 *
 * @example
 *   const data = await withModuleCache(
 *     { module: 'places-text-search', version: 1, input: { name, city } },
 *     { ttlSeconds: MODULE_CACHE_TTL.PLACES_TEXT_SEARCH },
 *     () => fetchPlacesTextSearch(name, city)
 *   );
 */
export async function withModuleCache<T>(
  key: ModuleCacheKey,
  options: ModuleCacheOptions,
  fetchFn: () => Promise<T>
): Promise<T> {
  const lookup = await getCached<T>(key);
  if (lookup.hit && lookup.value !== null) return lookup.value;

  const fresh = await fetchFn();
  // Store best-effort — never block the caller on cache writes
  void setCached(key, fresh, options);
  return fresh;
}

/**
 * Delete a single cache entry.  Used by tests and admin invalidation.
 */
export async function invalidateCache(key: ModuleCacheKey): Promise<void> {
  const fullKey = buildCacheKey(key);
  try {
    const store = await getSharedStore();
    await store.del(fullKey);
    logger.info(
      { event: 'module_cache.invalidate', module: key.module, version: key.version },
      'ModuleCache: invalidated'
    );
  } catch (err) {
    logger.warn(
      { event: 'module_cache.invalidate_error', module: key.module, err },
      'ModuleCache: invalidate error'
    );
  }
}
