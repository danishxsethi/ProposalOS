/**
 * Idempotency Middleware for API Endpoints
 *
 * Extracts Idempotency-Key from request headers and ensures
 * duplicate requests return the same response without re-processing.
 *
 * Usage: Wrap handlers with withIdempotency() for critical mutating operations.
 */

import { NextResponse } from 'next/server';

import { IdempotencyConflictError, InternalError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { withIdempotency as pipelineWithIdempotency } from '@/lib/pipeline/idempotency';
import { getTenantId } from '@/lib/tenant/context';

export interface IdempotencyOptions {
  /** Custom key generator if not using header */
  generateKey?: (req: Request) => string;
  /** TTL for idempotency records (default: 24 hours) */
  ttlMs?: number;
  /** Skip idempotency check conditionally */
  skip?: (req: Request) => boolean;
  /** Include request body in key hash for partial matching */
  includeBody?: boolean;
}

/**
 * Extract idempotency key from request headers
 */
export function extractIdempotencyKey(req: Request): string | null {
  return (
    req.headers.get('idempotency-key') ||
    req.headers.get('x-idempotency-key') ||
    req.headers.get('X-Idempotency-Key')
  );
}

/**
 * Create a hash of request body for additional uniqueness
 */
async function hashBody(req: Request): Promise<string> {
  try {
    const clone = req.clone();
    const body = await clone.text();
    return body ? Buffer.from(body).toString('base64url').substring(0, 16) : 'empty';
  } catch {
    return 'unknown';
  }
}

/**
 * Wrap a handler with idempotency checking
 *
 * @example
 * export const POST = withIdempotency(async (req) => {
 *   // Your handler logic here
 *   return NextResponse.json({ success: true });
 * }, { includeBody: true });
 */
export function withIdempotency<T extends Response | NextResponse>(
  handler: (req: Request) => Promise<T>,
  options: IdempotencyOptions = {}
) {
  return async function idempotentHandler(req: Request): Promise<T | NextResponse> {
    // Check if we should skip idempotency
    if (options.skip?.(req)) {
      return handler(req);
    }

    // Extract or generate idempotency key
    let idempotencyKey = options.generateKey?.(req) || extractIdempotencyKey(req);

    // Include body hash if requested
    if (options.includeBody && idempotencyKey) {
      const bodyHash = await hashBody(req);
      idempotencyKey = `${idempotencyKey}:${bodyHash}`;
    }

    // If no idempotency key, proceed without idempotency
    if (!idempotencyKey) {
      logger.warn({ path: req.url }, 'Idempotency: No key provided');
      return handler(req);
    }

    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        logger.error({ path: req.url }, 'Idempotency: No tenant context');
        return handler(req);
      }

      // Use pipeline idempotency wrapper
      // We use a generic prospectId since this is for general API operations
      const result = await pipelineWithIdempotency(
        tenantId,
        idempotencyKey, // Use key as prospectId for general operations
        'api_operation',
        async () => {
          const response = await handler(req);
          return {
            status: response.status,
            body: await response.clone().text(),
            headers: Object.fromEntries(response.headers.entries()),
          };
        }
      );

      // Return cached result if duplicate
      if (result.wasDuplicate) {
        logger.info({ idempotencyKey, tenantId }, 'Idempotency: Returning cached result');

        const cachedData = result.result as {
          status?: number;
          body?: string;
          headers?: Record<string, string>;
        };
        return new NextResponse(cachedData.body, {
          status: cachedData.status || 200,
          headers: {
            ...cachedData.headers,
            'X-Idempotency-Cache': 'true',
          },
        });
      }

      // Add idempotency header to new response
      const response = await handler(req);
      response.headers.set('X-Idempotency-Key', idempotencyKey);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.includes('already in progress')) {
        const conflictError = new IdempotencyConflictError(
          'A request with this idempotency key is already being processed'
        );
        return NextResponse.json(conflictError.toEnvelope(req.url), {
          status: conflictError.statusCode,
        });
      }

      // Re-throw other errors
      throw error;
    }
  };
}

/**
 * Simple in-memory idempotency check (for development/testing)
 * Falls back when database is not available
 */
const memoryCache = new Map<string, { result: unknown; timestamp: number }>();

export async function checkIdempotencyMemory(
  key: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<{ isDuplicate: boolean; result?: unknown }> {
  const now = Date.now();
  const cached = memoryCache.get(key);

  if (!cached) {
    return { isDuplicate: false };
  }

  if (now - cached.timestamp > ttlMs) {
    memoryCache.delete(key);
    return { isDuplicate: false };
  }

  return {
    isDuplicate: true,
    result: cached.result,
  };
}

export async function setIdempotencyMemory(key: string, result: unknown): Promise<void> {
  memoryCache.set(key, {
    result,
    timestamp: Date.now(),
  });
}

/**
 * Lightweight idempotency wrapper using memory cache
 * Useful for non-critical operations or development
 */
export function withIdempotencyMemory<T extends Response | NextResponse>(
  handler: (req: Request) => Promise<T>,
  options: IdempotencyOptions & { ttlMs?: number } = {}
) {
  return async function idempotentHandler(req: Request): Promise<T | NextResponse> {
    const idempotencyKey = extractIdempotencyKey(req);

    if (!idempotencyKey) {
      return handler(req);
    }

    const { isDuplicate, result } = await checkIdempotencyMemory(idempotencyKey, options.ttlMs);

    if (isDuplicate) {
      const cached = result as { status?: number; body?: string };
      return new NextResponse(cached.body, {
        status: cached.status || 200,
        headers: { 'X-Idempotency-Cache': 'true' },
      });
    }

    const response = await handler(req);

    // Cache the response
    const body = await response.clone().text();
    await setIdempotencyMemory(idempotencyKey, {
      status: response.status,
      body,
    });

    response.headers.set('X-Idempotency-Key', idempotencyKey);
    return response;
  };
}
