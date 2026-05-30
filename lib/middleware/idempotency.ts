/**
 * lib/middleware/idempotency.ts
 *
 * Distributed Idempotency Middleware
 *
 * Ensures that duplicate requests (same Idempotency-Key header) return the
 * original stored response without re-processing, across all Cloud Run
 * instances.
 *
 * Uses lib/store/shared.ts as the backing store.  In production REDIS_URL
 * must be set so that idempotency records are shared.
 *
 * The deprecated withIdempotencyMemory function is kept for backward
 * compatibility but now delegates to the same distributed implementation.
 * It will be removed in a future cleanup pass.
 *
 * Key semantics:
 *   - First request with a key: executes the handler and caches the result.
 *   - Duplicate request with same key + same body hash: returns cached result.
 *   - Duplicate request with same key + different body hash: returns 409.
 *   - Request in progress (another instance holds the lock): returns 409.
 *   - Cached results expire after ttlSeconds (default 24 h).
 *   - Failed transient 5xx responses are NOT cached (safe retry behaviour).
 */

import { NextResponse } from 'next/server';

import { IdempotencyConflictError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { hashSensitive } from '@/lib/security/abuseDefense/policies';
import { getSharedStore } from '@/lib/store/shared';
import { getTenantId } from '@/lib/tenant/context';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const IN_PROGRESS_TTL_SECONDS = 60; // lock expires after 60 s if handler crashes

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdempotencyOptions {
  generateKey?: (req: Request) => string;
  ttlSeconds?: number;
  skip?: (req: Request) => boolean;
  /** Include a hash of the request body in key-conflict detection. */
  includeBody?: boolean;
  /** Custom tenant ID or resolver function to override default getTenantId() */
  tenantId?: string | ((req: Request) => Promise<string | null> | string | null);
  /** Whether to fallback to a server-derived request fingerprint if no client idempotency key is provided */
  useFingerprintFallback?: boolean;
}

interface CachedResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  bodyHash?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function extractIdempotencyKey(req: Request): string | null {
  return (
    req.headers.get('idempotency-key') ||
    req.headers.get('x-idempotency-key') ||
    req.headers.get('Idempotency-Key') ||
    null
  );
}

async function hashBody(req: Request): Promise<string> {
  try {
    const body = await req.clone().text();
    return body ? Buffer.from(body).toString('base64url').substring(0, 20) : 'empty';
  } catch {
    return 'unknown';
  }
}

function buildStoreKey(tenantId: string, idempotencyKey: string): string {
  return `idempotency:${tenantId}:${idempotencyKey}`;
}

function buildLockKey(tenantId: string, idempotencyKey: string): string {
  return `idempotency-lock:${tenantId}:${idempotencyKey}`;
}

// ─── Core middleware ──────────────────────────────────────────────────────────

async function generateFingerprint(req: Request, tenantId: string): Promise<string> {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() ?? realIp?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = hashSensitive(ip);

  const bodyHash = await hashBody(req);
  const url = new URL(req.url);
  const path = url.pathname;

  // Combine components into a stable fingerprint
  const rawFingerprint = `${req.method}:${path}:${tenantId}:${bodyHash}:${ipHash}`;
  return `fingerprint:${hashSensitive(rawFingerprint)}`;
}

/**
 * Wrap a handler with distributed idempotency.
 *
 * Requires a valid tenant context (getTenantId() or options.tenantId). When no tenant is resolved
 * the handler runs without idempotency (safe degradation).
 */
export function withIdempotency<T extends Response | NextResponse>(
  handler: (req: Request, ...args: any[]) => Promise<T>,
  options: IdempotencyOptions = {}
) {
  return async function idempotentHandler(req: Request, ...args: any[]): Promise<T | NextResponse> {
    if (options.skip?.(req)) return handler(req, ...args);

    let tenantId: string | null = null;
    if (options.tenantId) {
      if (typeof options.tenantId === 'function') {
        tenantId = await options.tenantId(req);
      } else {
        tenantId = options.tenantId;
      }
    } else {
      tenantId = await getTenantId();
    }

    if (!tenantId) {
      // No tenant context — run without idempotency rather than blocking.
      logger.warn({ path: req.url }, 'Idempotency: No tenant context — skipping');
      return handler(req, ...args);
    }

    let rawKey = options.generateKey?.(req) ?? extractIdempotencyKey(req);
    if (!rawKey) {
      if (options.useFingerprintFallback) {
        rawKey = await generateFingerprint(req, tenantId);
      } else {
        logger.debug({ path: req.url }, 'Idempotency: No key provided — skipping');
        return handler(req, ...args);
      }
    }

    const bodyHash = options.includeBody ? await hashBody(req) : undefined;
    const idempotencyKey = bodyHash ? `${rawKey}:${bodyHash}` : rawKey;
    const storeKey = buildStoreKey(tenantId, idempotencyKey);
    const lockKey = buildLockKey(tenantId, idempotencyKey);
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    const store = await getSharedStore();

    // ── Check for existing result ──────────────────────────────────────────
    const existing = await store.get(storeKey);
    if (existing) {
      try {
        const cached = JSON.parse(existing) as CachedResponse;

        // Body-hash conflict: same key, different payload
        if (bodyHash && cached.bodyHash && cached.bodyHash !== bodyHash) {
          logger.warn(
            { idempotencyKey: rawKey, tenantId },
            'Idempotency: Key reused with different request body'
          );
          const conflict = new IdempotencyConflictError(
            'Idempotency key already used with a different request body'
          );
          return NextResponse.json(conflict.toEnvelope(req.url), {
            status: conflict.statusCode,
          });
        }

        logger.info({ idempotencyKey: rawKey, tenantId }, 'Idempotency: Returning cached result');
        return new NextResponse(cached.body, {
          status: cached.status,
          headers: {
            ...cached.headers,
            'X-Idempotency-Cache': 'true',
            'X-Idempotency-Key': rawKey,
          },
        });
      } catch {
        // Corrupted cache entry — fall through and re-execute
        await store.del(storeKey);
      }
    }

    // ── Acquire in-progress lock ───────────────────────────────────────────
    const locked = await store.setIfNotExists(lockKey, '1', IN_PROGRESS_TTL_SECONDS);
    if (!locked) {
      logger.warn({ idempotencyKey: rawKey, tenantId }, 'Idempotency: Request already in progress');
      const conflict = new IdempotencyConflictError(
        'A request with this idempotency key is already being processed'
      );
      return NextResponse.json(conflict.toEnvelope(req.url), {
        status: conflict.statusCode,
      });
    }

    // ── Execute handler ────────────────────────────────────────────────────
    let response: T;
    try {
      response = await handler(req, ...args);
    } catch (err) {
      // Release lock; do not cache errors
      await store.del(lockKey);
      throw err;
    }

    // ── Cache successful non-5xx responses ─────────────────────────────────
    if (response.status < 500) {
      try {
        const body = await response.clone().text();
        const headersObj: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headersObj[k] = v;
        });

        const cached: CachedResponse = {
          status: response.status,
          body,
          headers: headersObj,
          bodyHash,
        };

        await store.set(storeKey, JSON.stringify(cached), ttlSeconds);
        response.headers.set('X-Idempotency-Key', rawKey);
      } catch (cacheErr) {
        logger.error(
          { err: cacheErr, idempotencyKey: rawKey },
          'Idempotency: Failed to cache response'
        );
      }
    }

    await store.del(lockKey);
    return response;
  };
}

/**
 * @deprecated  withIdempotencyMemory now delegates to the distributed
 * withIdempotency.  The name is kept for backward compatibility; it will be
 * removed in a future cleanup.  Callers should migrate to withIdempotency.
 */
export function withIdempotencyMemory<T extends Response | NextResponse>(
  handler: (req: Request) => Promise<T>,
  options: IdempotencyOptions & { ttlMs?: number } = {}
) {
  // Convert ttlMs → ttlSeconds for the shared-store implementation
  const ttlSeconds = options.ttlMs ? Math.ceil(options.ttlMs / 1000) : DEFAULT_TTL_SECONDS;
  return withIdempotency(handler, { ...options, ttlSeconds });
}

// ─── Low-level helpers (kept for external callers that import them) ───────────

/** @deprecated Use withIdempotency directly */
export async function checkIdempotencyMemory(
  key: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<{ isDuplicate: boolean; result?: unknown }> {
  const store = await getSharedStore();
  const raw = await store.get(`idempotency-compat:${key}`);
  if (!raw) return { isDuplicate: false };
  try {
    return { isDuplicate: true, result: JSON.parse(raw) };
  } catch {
    return { isDuplicate: false };
  }
}

/** @deprecated Use withIdempotency directly */
export async function setIdempotencyMemory(key: string, result: unknown): Promise<void> {
  const store = await getSharedStore();
  await store.set(`idempotency-compat:${key}`, JSON.stringify(result), DEFAULT_TTL_SECONDS);
}
