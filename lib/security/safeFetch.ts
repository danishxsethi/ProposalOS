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
 * DNS rebinding protection:
 * - urlValidator resolves all A/AAAA records with the OS resolver, rejects any
 *   non-public address, and returns the approved set.
 * - Each request hop uses a dedicated Undici dispatcher that returns only that
 *   validated set to the connector. The URL hostname remains unchanged, keeping
 *   normal TLS SNI and certificate hostname verification enabled.
 * - Caller-supplied and global proxy dispatchers are not used.
 *
 * Browser navigation is separate: Chromium resolves names itself. Request
 * interception revalidates each URL but cannot pin Chromium's socket address;
 * arbitrary browser audits still require enforced network egress isolation.
 *
 * Fix for register #5 — SSRF urlValidator built but not wired. [#5]
 */

import { Agent } from 'undici';

import { logger } from '@/lib/logger';
import { type ResolvedAddress, validateUrl } from '@/lib/security/urlValidator';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Hosts explicitly allowed for response-derived URLs (e.g., Places API photo URLs) */
const RESPONSE_DERIVED_URL_ALLOWLIST = [
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
];

// ─── Error type ───────────────────────────────────────────────────────────────

export class SsrfBlockedError extends Error {
  public readonly blockedUrl: string;
  public readonly reason: string;

  constructor(url: string, reason: string) {
    const safeUrl = safeUrlForDiagnostics(url);
    super(`SSRF blocked: ${safeUrl} — ${reason}`);
    this.name = 'SsrfBlockedError';
    this.blockedUrl = safeUrl;
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
/**
 * Default request headers for audit fetches. Measured live against 7 real
 * customer sites: WAFs (nginx/Sucuri/Cloudflare rules) return 403 to any
 * `Mozilla/5.0 …` user agent sent from a non-browser TLS/HTTP stack (Node
 * undici) — including a perfect Chrome UA string — while an honest,
 * non-Mozilla auditor UA with normal Accept headers gets 200 on the same
 * sites. Identifying ourselves is also the correct crawler etiquette. Sites
 * that block *all* non-browser clients are handled by the headless-browser
 * fallback in lib/audit/collectors/htmlCollector.ts. Callers may override.
 */
export const AUDITOR_USER_AGENT =
  process.env.AUDIT_USER_AGENT ||
  'ProposalOS-Audit/1.0 (+https://proposalengine.app/bot; site audit requested by the business or its agency)';

export const BROWSER_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': AUDITOR_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function withBrowserHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(BROWSER_REQUEST_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return { ...init, headers };
}

export async function safeFetch(
  url: string,
  init?: RequestInit,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const allowHttp = options.allowHttp !== false; // default true for audit modules
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  const followRedirects = options.followRedirects !== false;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  let target = await validateAndThrow(url, allowHttp);
  let currentUrl = target.url;
  let redirectCount = 0;
  init = withBrowserHeaders(init);

  while (true) {
    const dispatcher = createPinnedDispatcher(currentUrl, target.resolvedAddresses);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        ...init,
        dispatcher,
        redirect: 'manual', // Intercept redirects for re-validation
        signal: options.signal ?? init?.signal,
      } as RequestInit & { dispatcher: Agent });
    } catch (error) {
      await dispatcher.destroy(error instanceof Error ? error : null).catch(() => undefined);
      throw error;
    }

    if (!isRedirect(response.status) || !followRedirects) {
      return limitResponseBody(response, maxResponseBytes, dispatcher);
    }

    // Redirect limit
    redirectCount++;
    if (redirectCount > maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      await closeDispatcher(dispatcher);
      throw new SsrfBlockedError(currentUrl, `Exceeded maximum redirect limit (${maxRedirects})`);
    }

    // Extract and validate the redirect target
    const location = response.headers.get('location');
    if (!location) {
      await response.body?.cancel().catch(() => undefined);
      await closeDispatcher(dispatcher);
      throw new SsrfBlockedError(currentUrl, 'Redirect with no Location header');
    }

    await response.body?.cancel().catch(() => undefined);
    await closeDispatcher(dispatcher);

    // Resolve relative redirect URLs against the current URL
    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new SsrfBlockedError(location, 'Invalid redirect Location URL');
    }

    // Re-validate the redirect target
    target = await validateAndThrow(nextUrl, allowHttp);
    nextUrl = target.url;

    logger.info(
      {
        event: 'ssrf.redirect_followed',
        fromHost: new URL(currentUrl).hostname,
        toHost: new URL(nextUrl).hostname,
        hop: redirectCount,
      },
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

interface ValidatedTarget {
  url: string;
  resolvedAddresses: ResolvedAddress[];
}

type PinnedLookup = (
  hostname: string,
  options: { all?: boolean; family?: number | 'IPv4' | 'IPv6' },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | Array<{ address: string; family: number }>,
    family?: number
  ) => void
) => void;

async function validateAndThrow(url: string, allowHttp: boolean): Promise<ValidatedTarget> {
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
      { event: 'ssrf.blocked', url: safeUrlForDiagnostics(url), reason: 'dangerous_scheme' },
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
      { event: 'ssrf.blocked', url: safeUrlForDiagnostics(url), reason: validation.error },
      `SSRF blocked: ${validation.error}`
    );
    throw new SsrfBlockedError(url, validation.error ?? 'blocked by SSRF policy');
  }

  const resolvedAddresses = validation.resolvedAddresses;
  if (!resolvedAddresses?.length) {
    throw new SsrfBlockedError(url, 'DNS validation returned no connection addresses');
  }

  return { url: validation.sanitizedUrl ?? url, resolvedAddresses };
}

function createPinnedDispatcher(url: string, addresses: ResolvedAddress[]): Agent {
  const expectedHost = normalizeLookupHost(new URL(url).hostname);
  const lookup: PinnedLookup = (hostname, options, callback) => {
    if (normalizeLookupHost(hostname) !== expectedHost) {
      const error = Object.assign(new Error('Pinned DNS hostname mismatch'), { code: 'ENOTFOUND' });
      callback(error, options.all ? [] : '', 0);
      return;
    }

    const requestedFamily =
      options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family;
    const candidates = addresses.filter(
      (record) => !requestedFamily || record.family === requestedFamily
    );
    if (candidates.length === 0) {
      const error = Object.assign(new Error('No validated address matches the requested family'), {
        code: 'ENOTFOUND',
      });
      callback(error, options.all ? [] : '', 0);
      return;
    }

    if (options.all) callback(null, candidates);
    else {
      const first = candidates[0]!;
      callback(null, first.address, first.family);
    }
  };

  return new Agent({ connect: { lookup } });
}

function normalizeLookupHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function safeUrlForDiagnostics(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '<invalid-url>';
  }
}

async function closeDispatcher(dispatcher: Agent): Promise<void> {
  await dispatcher.close().catch(() => undefined);
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

async function limitResponseBody(
  response: Response,
  maxBytes: number,
  dispatcher: Agent
): Promise<Response> {
  if (!response.body) {
    await closeDispatcher(dispatcher);
    return response;
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (maxBytes > 0 && Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body.cancel().catch(() => undefined);
    await closeDispatcher(dispatcher);
    throw new SsrfBlockedError(
      response.url || 'response',
      `Response exceeds ${maxBytes} byte limit`
    );
  }

  let consumed = 0;
  const reader = response.body.getReader();
  let dispatcherClosed = false;
  const close = async () => {
    if (dispatcherClosed) return;
    dispatcherClosed = true;
    await closeDispatcher(dispatcher);
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await close();
          controller.close();
          return;
        }
        consumed += chunk.value.byteLength;
        if (maxBytes > 0 && consumed > maxBytes) {
          await reader.cancel();
          await close();
          controller.error(
            new SsrfBlockedError(
              response.url || 'response',
              `Response exceeds ${maxBytes} byte limit`
            )
          );
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        await close();
        controller.error(error);
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } finally {
        await close();
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
