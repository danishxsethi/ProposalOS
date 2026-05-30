/**
 * lib/widget/origin.ts
 *
 * Widget Origin Allow-List (Task #13)
 *
 * Public widget endpoints (e.g. POST /api/widget/quick-audit) must only
 * accept calls from origins that the tenant has explicitly allow-listed.
 *
 * Rules:
 *   - Exact-match only.  No wildcards, no subdomain matching, no path part.
 *   - Origins are normalized to scheme + host[:port], lower-case host.
 *   - The allow-list is read from TenantBranding.allowedWidgetOrigins.
 *   - Missing/empty allow-list → widget is disabled for that tenant.
 *   - Disallowed origins → no Access-Control-Allow-Origin header.
 *   - Never reflect arbitrary Origin header values.
 *
 * This module intentionally does NOT trust:
 *   - body-supplied tenantId/tenantDomain as proof of identity for CORS.
 *     CORS allow-list is checked AFTER tenant resolution; the origin must
 *     be in the resolved tenant's allow-list.
 *   - X-Widget-Origin or any other request-supplied header for CORS.
 *
 * Logged events use structured metadata only — no raw body content.
 */

import { logger } from '@/lib/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_METHODS = 'POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, Idempotency-Key, X-Trace-Id';
const PREFLIGHT_MAX_AGE = '600'; // 10 minutes — minimal value, deny is cheap

// ─── Types ────────────────────────────────────────────────────────────────────

export type OriginCheckResult =
  | { allowed: true; origin: string }
  | { allowed: false; reason: 'missing' | 'malformed' | 'not_allow_listed' };

// ─── Origin parsing & validation ──────────────────────────────────────────────

/**
 * Parse and normalize an Origin header value to scheme://host[:port].
 *
 * Returns null when the origin is missing, malformed, or uses an
 * unsupported scheme.  We deliberately reject:
 *   - empty / null Origin
 *   - file://, data:, blob:, javascript:
 *   - URLs with paths, query, or fragments (Origin should be host-only)
 */
export function normalizeOrigin(rawOrigin: string | null | undefined): string | null {
  if (!rawOrigin || typeof rawOrigin !== 'string') return null;

  const trimmed = rawOrigin.trim();
  if (trimmed === '' || trimmed === 'null') return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // Only http/https for widget traffic
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  // Origin headers must be path-less.  Reject anything carrying path/query/fragment.
  if (url.pathname && url.pathname !== '/' && url.pathname !== '') return null;
  if (url.search) return null;
  if (url.hash) return null;

  // Lower-case the host; preserve port only when explicit
  const host = url.hostname.toLowerCase();
  if (!host) return null;

  const port = url.port; // empty string when default
  return port ? `${url.protocol}//${host}:${port}` : `${url.protocol}//${host}`;
}

/**
 * Check a request origin against an allow-list.
 *
 * Returns { allowed: true, origin } only when the normalized request origin
 * exactly matches a normalized allow-list entry.  Allow-list entries are
 * normalized the same way as the request origin so casing/port differences
 * never cause silent mismatches.
 */
export function checkOriginAgainstAllowList(
  rawRequestOrigin: string | null | undefined,
  allowList: string[]
): OriginCheckResult {
  if (!rawRequestOrigin) {
    return { allowed: false, reason: 'missing' };
  }

  const normalized = normalizeOrigin(rawRequestOrigin);
  if (!normalized) {
    return { allowed: false, reason: 'malformed' };
  }

  if (!Array.isArray(allowList) || allowList.length === 0) {
    return { allowed: false, reason: 'not_allow_listed' };
  }

  const normalizedList = allowList
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => entry !== null);

  if (normalizedList.includes(normalized)) {
    return { allowed: true, origin: normalized };
  }

  return { allowed: false, reason: 'not_allow_listed' };
}

// ─── CORS header builders ─────────────────────────────────────────────────────

/**
 * Build CORS headers for an allowed origin.  Echoes the exact normalized
 * origin (no wildcard).  Includes Vary: Origin so caches don't poison
 * across origins.
 */
export function buildAllowedCorsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': PREFLIGHT_MAX_AGE,
    Vary: 'Origin',
  };
}

/**
 * Build response headers for a disallowed origin.  Sets Vary: Origin so
 * shared caches don't return a permissive response from a different
 * caller's prior request, but does NOT set Allow-Origin.
 */
export function buildDeniedCorsHeaders(): Record<string, string> {
  return {
    Vary: 'Origin',
  };
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

/**
 * Structured log for denied widget calls.  Includes only safe metadata:
 *   - the reason
 *   - normalized origin attempt (or null)
 *   - the route that was hit
 * Never logs body content, headers, or tenant secrets.
 */
export function logOriginDenied(opts: {
  reason: 'missing' | 'malformed' | 'not_allow_listed' | 'no_tenant_allow_list';
  rawOrigin: string | null | undefined;
  route: string;
  tenantId?: string | null;
}): void {
  const normalized = opts.rawOrigin ? normalizeOrigin(opts.rawOrigin) : null;
  logger.warn(
    {
      event: 'widget.origin_denied',
      reason: opts.reason,
      route: opts.route,
      origin: normalized,
      tenantId: opts.tenantId ?? null,
    },
    `Widget: origin denied (${opts.reason})`
  );
}
