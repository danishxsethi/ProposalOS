/**
 * lib/security/safeFetch.ts
 *
 * SSRF-safe fetch wrapper — validates the target URL against the SSRF
 * blocklist before every HTTP request, and re-validates on every redirect hop.
 *
 * Usage:
 *   import { safeFetch } from '@/lib/security/safeFetch';
 *   const res = await safeFetch(url, options);   // throws SsrfBlockedError if blocked
 *
 * All fetch() calls that take a URL derived from user input (the audit target URL,
 * crawled links, or URLs discovered from user content) MUST use safeFetch.
 * System-constructed URLs to known API hosts (Google, SerpAPI) may use raw fetch()
 * only if listed in the arch-test allowlist with justification.
 *
 * Security properties:
 * - Validates initial URL (scheme, host, IP, port, credentials)
 * - Uses redirect: 'manual' to intercept every 3xx hop
 * - Re-validates each Location header before following
 * - Blocks file://, ftp://, and non-http(s) schemes
 * - Max 5 redirect hops (prevent infinite loops)
 * - Blocks cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 *
 * Known residual (TOCTOU / DNS rebinding):
 * - validateUrl resolves DNS at validation time; fetch() re-resolves at connect time.
 *   An attacker can return a public IP at validation, then a private IP at connect
 *   (DNS TTL = 0 rebinding). Proper mitigation requires pinning the resolved IP
 *   for the connection (e.g., custom DNS resolver or undici dispatcher). This is
 *   tracked as a Stage-1 residual — safeFetch reduces but does not eliminate the
 *   attack surface. The redirect-chain validation closes the most common SSRF
 *   bypass (open redirect to metadata).
 *
 * Fix for register #5 — SSRF urlValidator built but not wired. [#5]
 */

import { logger } from '@/lib/logger';
import { validateUrl } from '@/lib/security/urlValidator';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Hosts explicitly allowed for response-derived URLs (e.g., Places API photo URLs) */
const RESPONSE_DERIVED_URL_ALLOWLIST = [
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'places.googleapis.com',
  'maps.googleapis.com',
  'streetviewpixels-pa.googleapis.com',
];

// ─── Error type ───────────────────────────────────────────────────────────────

export class SsrfBlockedError extends Error {
  public readonly blockedUrl: string;
  public readonly reason: string;

  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${url} — ${reason}`);
    this.name = 'SsrfBlockedError';
    this.blockedUrl = url;
    this.reason = reason;
  }
}

// ─── Core wrapper ─────────────────────────────────────────────────────────────

export interface SafeFetchOptions {
  /** Allow http:// URLs (default: true — audit targets are often HTTP). */
  allowHttp?: boolean;
  /** Maximum redirects to follow (default: 5). */
  maxRedirects?: number;
  /** AbortSignal for timeout control. */
  signal?: AbortSignal;
  /** Follow redirects after validating each hop (default: true). */
  followRedirects?: boolean;
  /** Maximum response bytes exposed to the caller (default: 2 MiB). */
  maxResponseBytes?: number;
}

/**
 * Fetch a URL with SSRF validation on every hop.
 *
 * Validates the initial URL, then follows redirects manually — re-validating
 * each Location header against the SSRF blocklist before following.
 *
 * @param url     The URL to fetch. Must be http:// or https://.
 * @param init    Standard RequestInit options (redirect is overridden to 'manual').
 * @param options Extra options for the SSRF validator.
 * @throws {SsrfBlockedError} if any URL in the chain is blocked.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const allowHttp = options.allowHttp !== false; // default true for audit modules
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  const followRedirects = options.followRedirects !== false;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  let currentUrl = await validateAndThrow(url, allowHttp);
  let redirectCount = 0;

  while (true) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual', // Intercept redirects for re-validation
      signal: options.signal ?? init?.signal,
    });

    if (!isRedirect(response.status) || !followRedirects) {
      return limitResponseBody(response, maxResponseBytes);
    }

    // Redirect limit
    redirectCount++;
    if (redirectCount > maxRedirects) {
      throw new SsrfBlockedError(currentUrl, `Exceeded maximum redirect limit (${maxRedirects})`);
    }

    // Extract and validate the redirect target
    const location = response.headers.get('location');
    if (!location) {
      throw new SsrfBlockedError(currentUrl, 'Redirect with no Location header');
    }

    await response.body?.cancel().catch(() => undefined);

    // Resolve relative redirect URLs against the current URL
    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new SsrfBlockedError(location, 'Invalid redirect Location URL');
    }

    // Re-validate the redirect target
    nextUrl = await validateAndThrow(nextUrl, allowHttp);

    logger.info(
      { event: 'ssrf.redirect_followed', from: currentUrl, to: nextUrl, hop: redirectCount },
      `Following validated redirect (hop ${redirectCount})`
    );

    init = stripSensitiveRedirectHeaders(init, currentUrl, nextUrl);
    currentUrl = nextUrl;
  }
}

/**
 * Convenience: safeFetch with HTTPS-only enforcement.
 * Use for contexts where HTTP should never be accepted.
 */
export async function safeFetchHttpsOnly(
  url: string,
  init?: RequestInit,
  options: Omit<SafeFetchOptions, 'allowHttp'> = {}
): Promise<Response> {
  return safeFetch(url, init, { ...options, allowHttp: false });
}

/**
 * Validate a response-derived URL (e.g., photo URL from Places API response).
 *
 * Only allows URLs whose host is in the explicit allowlist.
 * Use this instead of raw fetch() when the URL came from an API response
 * rather than being constructed from a compile-time constant.
 */
export async function safeFetchResponseDerived(
  url: string,
  init?: RequestInit,
  options: SafeFetchOptions = {}
): Promise<Response> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SsrfBlockedError(url, 'Invalid URL format');
  }

  // Block non-http(s) schemes
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new SsrfBlockedError(url, `Blocked scheme: ${parsedUrl.protocol}`);
  }

  // Check against response-derived allowlist
  const host = parsedUrl.hostname.toLowerCase();
  const isAllowed = RESPONSE_DERIVED_URL_ALLOWLIST.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    throw new SsrfBlockedError(url, `Response-derived URL host '${host}' not in allowlist`);
  }

  // Use regular safeFetch for redirect protection
  return safeFetch(url, init, {
    ...options,
    maxResponseBytes: options.maxResponseBytes ?? 5 * 1024 * 1024,
  });
}

/**
 * Validate a URL before page.goto() (Puppeteer/Chromium).
 *
 * Call this before any headless browser navigation to user-influenced URLs.
 * Throws SsrfBlockedError if the URL would hit a private/metadata endpoint.
 *
 * @param url The URL to validate for browser navigation.
 * @param options.allowHttp Allow http:// (default: true).
 * @throws {SsrfBlockedError} if blocked.
 */
export async function validateForBrowserNavigation(
  url: string,
  options: { allowHttp?: boolean } = {}
): Promise<void> {
  const allowHttp = options.allowHttp !== false;
  await validateAndThrow(url, allowHttp);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

async function validateAndThrow(url: string, allowHttp: boolean): Promise<string> {
  // Block dangerous schemes before even trying to parse
  const lowerUrl = url.toLowerCase().trim();
  if (
    lowerUrl.startsWith('file:') ||
    lowerUrl.startsWith('ftp:') ||
    lowerUrl.startsWith('gopher:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('javascript:')
  ) {
    logger.warn(
      { event: 'ssrf.blocked', url, reason: 'dangerous_scheme' },
      `SSRF blocked: dangerous scheme`
    );
    throw new SsrfBlockedError(url, `Blocked scheme: ${lowerUrl.split(':')[0]}`);
  }

  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      throw new SsrfBlockedError(url, 'Credentialed URLs are not allowed');
    }
  } catch (error) {
    if (error instanceof SsrfBlockedError) throw error;
    throw new SsrfBlockedError(url, 'Invalid URL format');
  }

  const validation = await validateUrl(url, { allowHttp, requireHttps: !allowHttp });

  if (!validation.isValid) {
    logger.warn(
      { event: 'ssrf.blocked', url, reason: validation.error },
      `SSRF blocked: ${validation.error}`
    );
    throw new SsrfBlockedError(url, validation.error ?? 'blocked by SSRF policy');
  }

  return validation.sanitizedUrl ?? url;
}

function stripSensitiveRedirectHeaders(
  init: RequestInit | undefined,
  from: string,
  to: string
): RequestInit | undefined {
  if (!init || new URL(from).origin === new URL(to).origin) return init;

  const headers = new Headers(init.headers);
  for (const header of ['authorization', 'cookie', 'proxy-authorization', 'host']) {
    headers.delete(header);
  }
  return { ...init, headers };
}

function limitResponseBody(response: Response, maxBytes: number): Response {
  if (maxBytes <= 0) return response;
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    void response.body?.cancel();
    throw new SsrfBlockedError(
      response.url || 'response',
      `Response exceeds ${maxBytes} byte limit`
    );
  }
  if (!response.body) return response;

  let consumed = 0;
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        controller.close();
        return;
      }
      consumed += chunk.value.byteLength;
      if (consumed > maxBytes) {
        await reader.cancel();
        controller.error(
          new SsrfBlockedError(
            response.url || 'response',
            `Response exceeds ${maxBytes} byte limit`
          )
        );
        return;
      }
      controller.enqueue(chunk.value);
    },
    async cancel() {
      await reader.cancel();
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
