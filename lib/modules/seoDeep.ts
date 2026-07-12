import * as cheerio from 'cheerio';

import { withModuleCache } from '@/lib/cache/moduleCache';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safeFetch } from '@/lib/security/safeFetch';

import { generateSEOFindings, normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, EffortLevel, Finding, FindingType } from './types';

const SERP_API_BASE = 'https://serpapi.com/search';

interface SeoDeepInput {
  url: string;
  businessName: string;
  city?: string;
  /**
   * P1-35 (Wave 7): the homepage's real, already-crawled page metrics from the
   * canonical `websiteCrawler` dependency (lib/audit/runner.ts's seoDeepAdapter).
   * When present and the homepage was crawled successfully, this module reuses it
   * instead of independently re-fetching/re-parsing the same homepage.
   */
  homepageCrawlData?: {
    status: number;
    title: string | null;
    metaDescription: string | null;
    h1Count: number;
    h1Contents: string[];
    hasStructuredData: boolean;
    hasViewportMeta: boolean;
    internalLinks: number;
    externalLinks: number;
    imageCount: number;
    imagesWithAlt: number;
  } | null;
}

export async function runSeoDeepModule(
  input: SeoDeepInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ url: input.url }, '[SeoDeepModule] Starting deep SEO analysis');

  if (!input.url) {
    return {
      findings: [],
      evidenceSnapshots: [],
    };
  }

  try {
    // Parallel Data Collection
    const [htmlData, serpData, robotsCheck, sitemapCheck] = await Promise.all([
      fetchHtmlAnalysis(input.url, input.homepageCrawlData),
      fetchOrganicRanking(input.businessName, input.city, input.url, tracker),
      checkEndpoint(input.url, '/robots.txt'),
      checkEndpoint(input.url, '/sitemap.xml'),
    ]);

    // P2-35 (Wave 7): a real HTTP 200/404 response is a genuine present/absent
    // observation; a network error, timeout, or provider degrade is "we could not
    // check" and must never be presented as the same "absent" signal.
    const hasRobotsTxt = !robotsCheck.checked ? 'unavailable' : robotsCheck.status === 200;
    const hasSitemap = !sitemapCheck.checked ? 'unavailable' : sitemapCheck.status === 200;

    const findings = generateSEOFindings({
      ...htmlData,
      ...serpData,
      hasRobotsTxt,
      hasSitemap,
      url: input.url,
    }) as Finding[];

    // Evidence Snapshot
    const evidenceSnapshots = [
      {
        id: 'seo-html-metadata',
        auditId: 'current', // will be overwritten
        module: 'seo-deep',
        source: 'html-analysis',
        rawResponse: {
          ...htmlData,
          // P2-35 (Wave 7): the real checked/unavailable distinction for
          // robots.txt/sitemap.xml/brand-ranking, now recorded honestly rather than
          // collapsed into a single ambiguous boolean/null shape.
          seoChecks: {
            robotsTxt: hasRobotsTxt,
            sitemap: hasSitemap,
            rankCheck: serpData.rankCheckStatus,
          },
        },
        collectedAt: new Date(),
      },
    ];

    return {
      findings,
      evidenceSnapshots,
    };
  } catch (error) {
    logger.error({ error }, '[SeoDeepModule] Failed');
    return {
      findings: [
        {
          type: 'VITAMIN',
          category: 'SEO',
          title: 'SEO Analysis Failed',
          description: 'Could not complete deep SEO analysis due to a technical error.',
          impactScore: 3,
          confidenceScore: normalizeConfidence(100, '0-100'),
          evidence: [],
          metrics: {},
          effortEstimate: 'LOW',
          recommendedFix: ['Ensure website is accessible'],
        },
      ],
      evidenceSnapshots: [],
    };
  }
}

// Helper: Fetch and Analyze HTML
async function fetchHtmlAnalysis(
  url: string,
  homepageCrawlData?: SeoDeepInput['homepageCrawlData']
) {
  // P1-35 (Wave 7): reuse the websiteCrawler dependency's already-fetched/parsed
  // homepage instead of independently re-fetching the same page. Only trusted when
  // the crawler itself successfully retrieved the homepage (status 200); otherwise
  // fall back to this module's own independent fetch so it keeps working standalone
  // (e.g. crawler dependency unavailable, failed, or blocked by robots.txt).
  if (homepageCrawlData && homepageCrawlData.status === 200) {
    return {
      metaTitle: homepageCrawlData.title || '',
      metaDesc: homepageCrawlData.metaDescription || '',
      h1Count: homepageCrawlData.h1Count,
      h1Text: homepageCrawlData.h1Contents[0] || '',
      hasSchema: homepageCrawlData.hasStructuredData,
      hasMobileViewport: homepageCrawlData.hasViewportMeta,
      internalLinks: homepageCrawlData.internalLinks,
      externalLinks: homepageCrawlData.externalLinks,
      imagesChecked: homepageCrawlData.imageCount,
      imagesMissingAlt: homepageCrawlData.imageCount - homepageCrawlData.imagesWithAlt,
      isHttps: url.startsWith('https'),
    };
  }

  try {
    const html = await withProviderResilience<string>(
      {
        provider: 'crawler',
        operation: 'seoDeep:fetchHtmlAnalysis',
        degrade: false,
      },
      async () => {
        const res = await safeFetch(url, { headers: { 'User-Agent': 'ProposalOS-Audit-Bot/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      }
    );
    const $ = cheerio.load(html);

    const metaTitle = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';
    const h1Count = $('h1').length;
    const h1Text = $('h1').first().text().trim();

    let hasSchema = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      const content = $(el).html();
      if (content && (content.includes('LocalBusiness') || content.includes('Organization'))) {
        hasSchema = true;
      }
    });

    const hasMobileViewport = !!$('meta[name="viewport"]').attr('content');

    // Link Stats
    const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;
    const externalLinks = $('a[href^="http"]').not(`[href*="${url}"]`).length;

    // Image Stats
    let imagesChecked = 0;
    let imagesMissingAlt = 0;
    $('img')
      .slice(0, 10)
      .each((_, el) => {
        imagesChecked++;
        if (!$(el).attr('alt')) imagesMissingAlt++;
      });

    const isHttps = url.startsWith('https');

    return {
      metaTitle,
      metaDesc,
      h1Count,
      h1Text,
      hasSchema,
      hasMobileViewport,
      internalLinks,
      externalLinks,
      imagesChecked,
      imagesMissingAlt,
      isHttps,
    };
  } catch (e) {
    logger.warn({ error: e, url }, 'HTML Fetch failed');
    return {
      metaTitle: '',
      metaDesc: '',
      h1Count: 0,
      h1Text: '',
      hasSchema: false,
      hasMobileViewport: false,
      internalLinks: 0,
      externalLinks: 0,
      imagesChecked: 0,
      imagesMissingAlt: 0,
      isHttps: url.startsWith('https'),
    };
  }
}

// Helper: Check Robots/Sitemap
async function checkEndpoint(
  baseUrl: string,
  path: string
): Promise<{ status: number; checked: boolean }> {
  try {
    const u = new URL(path, baseUrl).toString();
    let checked = true;
    const status = await withProviderResilience<number>(
      {
        provider: 'crawler',
        operation: 'seoDeep:checkEndpoint',
        degrade: true,
        // P2-35 (Wave 7): the degrade fallback is a real network/provider failure,
        // never a confirmed 404 — `checked` stays false so the caller does not
        // treat "could not check" the same as "genuinely absent".
        fallbackValue: -1,
      },
      async () => {
        const res = await safeFetch(u, { method: 'HEAD' });
        return res.status;
      }
    );
    if (status === -1) checked = false;
    return { status, checked };
  } catch {
    return { status: -1, checked: false };
  }
}

// Helper: SerpAPI Organic Check
async function fetchOrganicRanking(
  businessName: string,
  city: string = '',
  url: string,
  tracker?: CostTracker
): Promise<{ organicRank: number | null; inTop10: boolean; rankCheckStatus: string }> {
  if (!process.env.SERP_API_KEY)
    return { organicRank: null, inTop10: false, rankCheckStatus: 'not_configured' };

  const query = `${businessName} ${city}`.trim();

  // Check cache first
  try {
    if (tracker) tracker.addApiCall('SERP_API');

    const params = {
      engine: 'google',
      q: query,
      api_key: process.env.SERP_API_KEY,
      gl: 'us',
      hl: 'en',
    };

    const data = await withModuleCache<any>(
      {
        module: 'seo_deep',
        version: 1,
        input: { type: 'organic_ranking', query },
      },
      { ttlSeconds: 24 * 60 * 60 },
      async () => {
        const p = new URLSearchParams(params as any);
        const serpUrl = `${SERP_API_BASE}?${p.toString()}`;
        // P2-35 (Wave 7): no silent degrade/fallback here — a provider failure must
        // surface to the outer catch and report `rankCheckStatus: 'unavailable'`,
        // never collapse into the identical shape as "checked, not found".
        return withProviderResilience<any>(
          {
            provider: 'serpapi',
            operation: 'seoDeep:fetchOrganicRanking',
            degrade: false,
          },
          async () => {
            const res = await fetch(serpUrl);
            if (!res.ok) {
              throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
            }
            return await res.json();
          }
        );
      }
    );

    if (data.organic_results) {
      // Find our URL in results
      // Normalize URLs for comparison (remove www, https, trailing slash)
      const normalize = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      const target = normalize(url);

      const match = data.organic_results.find((r: any) => normalize(r.link).includes(target));

      if (match) {
        return {
          organicRank: match.position,
          inTop10: match.position <= 10,
          rankCheckStatus: 'checked',
        };
      }
    }

    // Genuinely checked, real results returned, site not found in them — a real
    // (if inconclusive) observation, distinct from "could not check".
    return { organicRank: null, inTop10: false, rankCheckStatus: 'checked' };
  } catch (e) {
    logger.error({ error: e }, 'SerpAPI Organic failed');
    return { organicRank: null, inTop10: false, rankCheckStatus: 'unavailable' };
  }
}

// Generating Findings locally (implied requirement "Implement generateSEOFindings", could be imported but keeping module self-contained is cleaner architecture unless strict separation required)
// The user prompt asked to create `lib/modules/findingGenerator.ts` for this?
// Actually "Implement generateSEOFindings in lib/modules/findingGenerator.ts".
// Okay, I will put the logic there and call it. But I'll define the interface here first.

export interface SeoDeepData {
  url: string;
  metaTitle: string;
  metaDesc: string;
  h1Count: number;
  h1Text: string;
  hasSchema: boolean;
  hasMobileViewport: boolean;
  internalLinks: number;
  externalLinks: number;
  imagesChecked: number;
  imagesMissingAlt: number;
  isHttps: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  organicRank: number | null;
  inTop10: boolean;
}
