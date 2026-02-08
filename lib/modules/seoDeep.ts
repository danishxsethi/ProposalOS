
import { AuditModuleResult, Finding, FindingType, EffortLevel } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import * as cheerio from 'cheerio';
import { logger } from '@/lib/logger';

const SERP_API_BASE = 'https://serpapi.com/search';

interface SeoDeepInput {
    url: string;
    businessName: string;
    city?: string;
}

export async function runSeoDeepModule(input: SeoDeepInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[SeoDeepModule] Starting deep SEO analysis');

    if (!input.url) {
        return {
            findings: [],
            evidenceSnapshots: [],
            moduleId: 'seo-deep',
            status: 'skipped'
        };
    }

    try {
        // Parallel Data Collection
        const [htmlData, serpData, robotsStatus, sitemapStatus] = await Promise.all([
            fetchHtmlAnalysis(input.url),
            fetchOrganicRanking(input.businessName, input.city, input.url, tracker),
            checkEndpoint(input.url, '/robots.txt'),
            checkEndpoint(input.url, '/sitemap.xml')
        ]);

        const findings = generateSEOFindings({
            ...htmlData,
            ...serpData,
            hasRobotsTxt: robotsStatus === 200,
            hasSitemap: sitemapStatus === 200,
            url: input.url
        });

        // Evidence Snapshot
        const evidenceSnapshots = [{
            id: 'seo-html-metadata',
            auditId: 'current', // will be overwritten
            module: 'seo-deep',
            source: 'html-analysis',
            rawResponse: htmlData,
            collectedAt: new Date()
        }];

        return {
            findings,
            evidenceSnapshots,
            moduleId: 'seo-deep',
            status: 'success',
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        logger.error({ error }, '[SeoDeepModule] Failed');
        return {
            findings: [{
                type: 'VITAMIN',
                category: 'SEO',
                title: 'SEO Analysis Failed',
                description: 'Could not complete deep SEO analysis due to a technical error.',
                impactScore: 3,
                confidenceScore: 100,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Ensure website is accessible']
            }],
            evidenceSnapshots: [],
            moduleId: 'seo-deep',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Helper: Fetch and Analyze HTML
async function fetchHtmlAnalysis(url: string) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ProposalOS-Audit-Bot/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
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
        $('img').slice(0, 10).each((_, el) => {
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
            isHttps
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
            isHttps: url.startsWith('https')
        };
    }
}

// Helper: Check Robots/Sitemap
async function checkEndpoint(baseUrl: string, path: string) {
    try {
        const u = new URL(path, baseUrl).toString();
        const res = await fetch(u, { method: 'HEAD' });
        return res.status;
    } catch {
        return 404;
    }
}

// Helper: SerpAPI Organic Check
async function fetchOrganicRanking(businessName: string, city: string = '', url: string, tracker?: CostTracker) {
    if (!process.env.SERP_API_KEY) return { organicRank: null, inTop10: false };

    const query = `${businessName} ${city}`.trim();

    // Check cache first
    try {
        const cacheKey = `serp_organic_${query.replace(/\s/g, '_')}`;
        // We can reuse cachedFetch if we want, but logic is custom here for finding rank
        // Let's us cachedFetch to return the raw JSON

        if (tracker) tracker.addApiCall('SERP_API');

        const params = {
            engine: 'google',
            q: query,
            api_key: process.env.SERP_API_KEY,
            gl: 'us',
            hl: 'en'
        };

        const data = await cachedFetch(cacheKey, params, async () => {
            const p = new URLSearchParams(params as any);
            const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
            return await res.json();
        }, { ttlHours: 24 });

        if (data.organic_results) {
            // Find our URL in results
            // Normalize URLs for comparison (remove www, https, trailing slash)
            const normalize = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            const target = normalize(url);

            const match = data.organic_results.find((r: any) => normalize(r.link).includes(target));

            if (match) {
                return { organicRank: match.position, inTop10: match.position <= 10 };
            }
        }

        return { organicRank: null, inTop10: false };
    } catch (e) {
        logger.error({ error: e }, 'SerpAPI Organic failed');
        return { organicRank: null, inTop10: false };
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

// Placeholder to be replaced by import
import { generateSEOFindings } from './findingGenerator';
