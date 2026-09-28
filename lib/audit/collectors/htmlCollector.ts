/**
 * lib/audit/collectors/htmlCollector.ts
 *
 * Shared HTML collector (first slice of the collector/analyzer split from the
 * advancement design). Fetches a page's HTML once per audit and lets every
 * HTML-consuming module (crawler homepage, techStack, social, schemaMarkup,
 * emailFinder, contentQuality) reuse it instead of each re-fetching with its
 * own headers and its own failure mode.
 *
 * Strategy, measured live against real customer sites:
 *   1. safeFetch with the honest auditor UA — 200 on most sites, including
 *      WAF-fronted ones that 403 any `Mozilla/5.0` UA from a non-browser stack.
 *   2. If the site still blocks non-browser clients (403/challenge), fall back
 *      to the shared headless Chromium (which reliably gets 200) and take the
 *      rendered document. This is disclosed in provenance as `via: 'browser'`.
 *
 * Never fabricates: a page that cannot be fetched either way is returned as
 * `{ ok:false, status, blocked:true }` so callers report UNAVAILABLE honestly.
 */
import type { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { acquireSharedBrowser, releaseSharedBrowser } from '@/lib/security/browserLauncher';
import { safePageGoto } from '@/lib/security/safeBrowser';
import { safeFetch, validateForBrowserNavigation } from '@/lib/security/safeFetch';


export interface CollectedHtml {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  headers: Record<string, string>;
  via: 'fetch' | 'browser';
  blocked: boolean;
  collectedAt: string;
  durationMs: number;
}

interface CollectOptions {
  auditId?: string;
  signal?: AbortSignal;
  tracker?: CostTracker;
  timeoutMs?: number;
  allowBrowserFallback?: boolean;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<CollectedHtml> }>();

function cacheKey(auditId: string | undefined, url: string): string {
  return `${auditId ?? 'solo'}::${url}`;
}

function headersToRecord(h: Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (h && typeof (h as Headers).forEach === 'function') {
    h.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
  }
  return out;
}

/** Heuristic: 403/429/503 or a tiny challenge page body means "blocked for non-browsers". */
export function looksBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  if (status !== 200) return false;
  const lower = html.slice(0, 20_000).toLowerCase();
  const title = /<title[^>]*>([^<]*)<\/title>/.exec(lower)?.[1] ?? '';
  return (
    html.length < 6_000 &&
    (title.includes('just a moment') ||
      title.includes('attention required') ||
      title.includes('access denied') ||
      lower.includes('cf-challenge') ||
      lower.includes('challenge-platform') ||
      lower.includes('verify you are human'))
  );
}

async function viaFetch(url: string, opts: CollectOptions): Promise<CollectedHtml> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('html collect timeout', 'AbortError')), opts.timeoutMs ?? 20_000);
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await safeFetch(url, { signal: controller.signal });
    opts.tracker?.addApiCall('WEBSITE_FETCH');
    const html = typeof res.text === 'function' ? await res.text() : '';
    const status = typeof res.status === 'number' ? res.status : res.ok ? 200 : 0;
    return {
      url,
      finalUrl: res.url || url,
      status,
      ok: res.ok ?? (status >= 200 && status < 300),
      html,
      headers: headersToRecord(res.headers),
      via: 'fetch',
      blocked: looksBlocked(status, html),
      collectedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function viaBrowser(url: string, opts: CollectOptions): Promise<CollectedHtml> {
  const t0 = Date.now();
  await validateForBrowserNavigation(url);
  const { browser, key } = await acquireSharedBrowser(opts.auditId);
  const page = await browser.newPage();
  try {
    const response = await safePageGoto(page, url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs ?? 20_000 }, opts.signal);
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 4_000 }).catch(() => undefined);
    const html = await page.content();
    const status = response?.status() ?? 0;
    const headers = response ? Object.fromEntries(Object.entries(response.headers()).map(([k, v]) => [k.toLowerCase(), String(v)])) : {};
    opts.tracker?.addApiCall('WEBSITE_FETCH');
    return {
      url,
      finalUrl: page.url() || url,
      status,
      ok: status >= 200 && status < 400,
      html,
      headers,
      via: 'browser',
      blocked: looksBlocked(status, html),
      collectedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
  } finally {
    await page.close().catch(() => undefined);
    await releaseSharedBrowser(key).catch(() => undefined);
  }
}

/**
 * Collect a page's HTML once per audit (memoized 10 min), with headless-browser
 * fallback when a plain fetch is blocked. Rejects only on SSRF validation or
 * caller abort; network/HTTP failures are returned as `ok:false`.
 */
export async function collectHtml(url: string, opts: CollectOptions = {}): Promise<CollectedHtml> {
  // Memoization is a per-audit dedupe (crawler + techStack + social + schema +
  // email all want the same homepage during one audit). Without an auditId
  // there is nothing to dedupe against, so never cache.
  const key = opts.auditId ? cacheKey(opts.auditId, url) : null;
  const hit = key ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = (async () => {
    let first: CollectedHtml;
    try {
      first = await viaFetch(url, opts);
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      first = {
        url,
        finalUrl: url,
        status: 0,
        ok: false,
        html: '',
        headers: {},
        via: 'fetch',
        blocked: false,
        collectedAt: new Date().toISOString(),
        durationMs: 0,
      };
      logger.warn({ url, error: error instanceof Error ? error.message : String(error) }, '[htmlCollector] fetch failed');
    }
    if (first.ok && !first.blocked) return first;
    if (opts.allowBrowserFallback === false || !first.blocked) return first;

    try {
      const second = await viaBrowser(url, opts);
      logger.info({ url, fetchStatus: first.status, browserStatus: second.status, blocked: second.blocked }, '[htmlCollector] browser fallback used');
      return second.ok && !second.blocked ? second : { ...second, blocked: true };
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      logger.warn({ url, error: error instanceof Error ? error.message : String(error) }, '[htmlCollector] browser fallback failed');
      return { ...first, blocked: true };
    }
  })();

  if (key) {
    cache.set(key, { at: Date.now(), value });
    value.catch(() => cache.delete(key));
  }
  return value;
}

/** Test/ops hook. */
export function clearHtmlCollectorCache(): void {
  cache.clear();
}
