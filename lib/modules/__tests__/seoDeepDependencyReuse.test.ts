/**
 * Wave 7 — seoDeep module hardening:
 * - P1-35: reuse the websiteCrawler dependency's already-crawled homepage instead
 *   of independently re-fetching/re-parsing the same page.
 * - P2-35: robots.txt/sitemap.xml/brand-ranking checks that could not be performed
 *   (network error, timeout, provider degrade) must report `unavailable`, never the
 *   same shape as a genuine, confirmed absence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    opts: { degrade?: boolean; fallbackValue?: unknown },
    fn: (ctx: Record<string, never>) => unknown
  ) => {
    try {
      return await fn({});
    } catch (err) {
      if (opts.degrade) return opts.fallbackValue;
      throw err;
    }
  },
}));

import { safeFetch } from '@/lib/security/safeFetch';

import { runSeoDeepModule } from '../seoDeep';

describe('seoDeep dependency reuse (P1-35)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses the crawler-provided homepage data and never calls safeFetch for the homepage HTML analysis', async () => {
    vi.mocked(safeFetch).mockImplementation(async (url: string) => {
      // Only robots.txt/sitemap HEAD checks should reach safeFetch; the homepage
      // GET fetch must never happen when homepageCrawlData is supplied.
      if (String(url).includes('robots.txt') || String(url).includes('sitemap.xml')) {
        return { status: 200, ok: true } as Response;
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const result = await runSeoDeepModule({
      url: 'https://acme.test',
      businessName: 'Acme Dental',
      homepageCrawlData: {
        status: 200,
        title: 'Acme Dental',
        metaDescription: 'Family dentistry',
        h1Count: 1,
        h1Contents: ['Welcome'],
        hasStructuredData: true,
        hasViewportMeta: true,
        internalLinks: 3,
        externalLinks: 1,
        imageCount: 4,
        imagesWithAlt: 4,
      },
    });

    const html = result.evidenceSnapshots[0].rawResponse as { metaTitle: string };
    expect(html.metaTitle).toBe('Acme Dental');
    // GET calls for the homepage HTML never happened — only the HEAD-based
    // robots.txt/sitemap.xml checks (which are not homepage HTML re-fetches).
    expect(vi.mocked(safeFetch).mock.calls.every(([, opts]) => opts?.method === 'HEAD')).toBe(true);
  });

  it('falls back to its own fetch when the crawler dependency never captured this homepage', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => '<html><head><title>Acme</title></head><body></body></html>',
    } as Response);

    const result = await runSeoDeepModule({
      url: 'https://acme.test',
      businessName: 'Acme Dental',
      homepageCrawlData: null,
    });

    expect(vi.mocked(safeFetch).mock.calls.some(([, opts]) => opts?.method !== 'HEAD')).toBe(true);
    const html = result.evidenceSnapshots[0].rawResponse as { metaTitle: string };
    expect(html.metaTitle).toBe('Acme');
  });
});

describe('seoDeep robots.txt/sitemap.xml unavailable vs genuinely absent (P2-35)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports a real 404 as genuinely absent (checked)', async () => {
    vi.mocked(safeFetch).mockResolvedValue({ status: 404, ok: false } as Response);

    const result = await runSeoDeepModule({
      url: 'https://acme.test',
      businessName: 'Acme Dental',
      homepageCrawlData: null,
    });
    // Homepage GET call also uses the same mock; give it a valid-looking body via a
    // second, more specific mock pass would be ideal, but the module tolerates a
    // non-ok homepage fetch by returning its own empty-html defaults, so this still
    // exercises the robots/sitemap distinction cleanly.
    const raw = result.evidenceSnapshots[0].rawResponse as { seoChecks: { robotsTxt: unknown } };
    expect(raw.seoChecks.robotsTxt).toBe(false);
  });

  it('reports unavailable (not "absent") when the check itself fails (network error)', async () => {
    vi.mocked(safeFetch).mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === 'HEAD') {
        throw new Error('network unreachable');
      }
      return {
        status: 200,
        ok: true,
        text: async () => '<html><head><title>Acme</title></head><body></body></html>',
      } as Response;
    });

    const result = await runSeoDeepModule({
      url: 'https://acme.test',
      businessName: 'Acme Dental',
      homepageCrawlData: null,
    });
    const raw = result.evidenceSnapshots[0].rawResponse as {
      seoChecks: { robotsTxt: unknown; sitemap: unknown };
    };
    expect(raw.seoChecks.robotsTxt).toBe('unavailable');
    expect(raw.seoChecks.sitemap).toBe('unavailable');
  });

  it('reports rankCheckStatus as not_configured (not the same shape as a real absence) when SERP_API_KEY is missing', async () => {
    delete process.env.SERP_API_KEY;
    vi.mocked(safeFetch).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => '<html><head><title>Acme</title></head><body></body></html>',
    } as Response);

    const result = await runSeoDeepModule({
      url: 'https://acme.test',
      businessName: 'Acme Dental',
      homepageCrawlData: null,
    });
    const raw = result.evidenceSnapshots[0].rawResponse as { seoChecks: { rankCheck: unknown } };
    expect(raw.seoChecks.rankCheck).toBe('not_configured');
  });
});
