import { logger } from '@/lib/logger';
import { cachedFetch } from '@/lib/cache/apiCache';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';

interface PageMetrics {
    url: string;
    status: number;
    title: string | null;
    metaDescription: string | null;
    h1Count: number;
    h1Contents: string[];
    wordCount: number;
    imageCount: number;
    imagesWithAlt: number;
    internalLinks: number;
    externalLinks: number;
    hasStructuredData: boolean;
    loadTimeMs: number;
    pageSizeKB: number;
    error?: string;
}

export interface CrawlResult {
    crawledPages: PageMetrics[];
    totalPagesFound: number;
    brokenLinks: string[];
    orphanPages: string[];
    pagesMissingTitles: string[];
    pagesMissingDescriptions: string[];
    avgLoadTimeMs: number;
    avgWordCount: number;
    schemaOrgCoverage: number;
    duplicateTitles: Map<string, string[]>;
}

interface WebsiteCrawlerInput {
    url: string;
    businessName: string;
}

const MAX_PAGES = 20;
const MAX_DEPTH = 3;
const PAGE_TIMEOUT_MS = 45000;
const TOTAL_TIMEOUT_MS = 45000;

/**
 * Normalize URL for comparison and deduplication
 */
function normalizeUrl(url: string, baseUrl: URL): string | null {
    try {
        const parsed = new URL(url, baseUrl.toString());

        // Remove hash fragments
        parsed.hash = '';

        // Remove trailing slash for consistency
        let normalized = parsed.toString();
        if (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }

        return normalized;
    } catch {
        return null;
    }
}

/**
 * Check if URL is internal (same domain)
 */
function isInternalUrl(url: string, baseDomain: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.hostname === baseDomain || parsed.hostname === `www.${baseDomain}` || `www.${parsed.hostname}` === baseDomain;
    } catch {
        return false;
    }
}

/**
 * Fetch robots.txt and check if URL is allowed
 */
async function isAllowedByRobots(url: string, baseUrl: URL): Promise<boolean> {
    try {
        const robotsUrl = `${baseUrl.protocol}//${baseUrl.hostname}/robots.txt`;
        const robotsTxt = await cachedFetch(
            'robots_txt',
            { url: robotsUrl },
            async () => {
                const res = await fetch(robotsUrl, {
                    signal: AbortSignal.timeout(3000)
                });
                if (!res.ok) return ''; // No robots.txt means allow all
                return await res.text();
            },
            { ttlHours: 24 }
        );

        if (!robotsTxt) return true;

        const robots = robotsParser(robotsUrl, robotsTxt);
        return robots.isAllowed(url, 'ProposalOSBot') ?? true;
    } catch (error) {
        logger.warn({ error }, 'Failed to fetch robots.txt, allowing crawl');
        return true; // If we can't fetch robots.txt, allow crawling
    }
}

/**
 * Fetch and analyze a single page
 */
async function analyzePage(url: string): Promise<PageMetrics> {
    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        clearTimeout(timeout);

        const loadTimeMs = Date.now() - startTime;
        const html = await response.text();
        const pageSizeKB = Math.round(Buffer.byteLength(html, 'utf8') / 1024);

        const $ = cheerio.load(html);

        // Extract page metrics
        const title = $('title').first().text().trim() || null;
        const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;

        const h1Elements = $('h1');
        const h1Count = h1Elements.length;
        const h1Contents = h1Elements.map((_, el) => $(el).text().trim()).get();

        // Word count (visible text only)
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.split(/\s+/).length;

        // Image analysis
        const images = $('img');
        const imageCount = images.length;
        const imagesWithAlt = images.filter((_, el) => !!$(el).attr('alt')?.trim()).length;

        // Link analysis
        const links = $('a[href]');
        const baseUrlObj = new URL(url);
        let internalLinks = 0;
        let externalLinks = 0;

        links.each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            const absoluteUrl = normalizeUrl(href, baseUrlObj);
            if (!absoluteUrl) return;

            if (isInternalUrl(absoluteUrl, baseUrlObj.hostname)) {
                internalLinks++;
            } else {
                externalLinks++;
            }
        });

        // Structured data detection
        const hasStructuredData =
            $('script[type="application/ld+json"]').length > 0 ||
            $('[itemscope]').length > 0;

        return {
            url,
            status: response.status,
            title,
            metaDescription,
            h1Count,
            h1Contents,
            wordCount,
            imageCount,
            imagesWithAlt,
            internalLinks,
            externalLinks,
            hasStructuredData,
            loadTimeMs,
            pageSizeKB,
        };

    } catch (error) {
        const loadTimeMs = Date.now() - startTime;
        return {
            url,
            status: error instanceof Error && error.name === 'AbortError' ? 408 : 500,
            title: null,
            metaDescription: null,
            h1Count: 0,
            h1Contents: [],
            wordCount: 0,
            imageCount: 0,
            imagesWithAlt: 0,
            internalLinks: 0,
            externalLinks: 0,
            hasStructuredData: false,
            loadTimeMs,
            pageSizeKB: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Extract all internal links from HTML
 */
function extractInternalLinks(html: string, baseUrl: URL): string[] {
    const $ = cheerio.load(html);
    const links = new Set<string>();

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        const normalized = normalizeUrl(href, baseUrl);
        if (normalized && isInternalUrl(normalized, baseUrl.hostname)) {
            links.add(normalized);
        }
    });

    return Array.from(links);
}

/**
 * BFS Website Crawler
 */
export async function crawlWebsite(input: WebsiteCrawlerInput): Promise<CrawlResult> {
    const startTime = Date.now();
    const baseUrl = new URL(input.url);

    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [{ url: input.url, depth: 0 }];
    const crawledPages: PageMetrics[] = [];
    const allFoundUrls = new Set<string>([input.url]);

    logger.info({ businessName: input.businessName, url: input.url }, 'Starting website crawl');

    while (queue.length > 0 && crawledPages.length < MAX_PAGES) {
        // Check total timeout
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
            logger.warn('Website crawl timeout reached, stopping');
            break;
        }

        const current = queue.shift()!;
        const { url, depth } = current;

        // Skip if already visited or too deep
        if (visited.has(url) || depth > MAX_DEPTH) {
            continue;
        }

        // Check robots.txt
        const allowed = await isAllowedByRobots(url, baseUrl);
        if (!allowed) {
            logger.info({ url }, 'URL disallowed by robots.txt, skipping');
            visited.add(url);
            continue;
        }

        // Crawl the page
        visited.add(url);
        const metrics = await analyzePage(url);
        crawledPages.push(metrics);

        logger.info({
            url,
            status: metrics.status,
            depth,
            progress: `${crawledPages.length}/${MAX_PAGES}`
        }, 'Page crawled');

        // Extract links only from successful pages
        if (metrics.status === 200 && depth < MAX_DEPTH) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                });
                clearTimeout(timeout);
                const html = await response.text();
                const links = extractInternalLinks(html, baseUrl);

                for (const link of links) {
                    allFoundUrls.add(link);
                    if (!visited.has(link) && crawledPages.length < MAX_PAGES) {
                        queue.push({ url: link, depth: depth + 1 });
                    }
                }
            } catch (error) {
                logger.warn({ url, error }, 'Failed to extract links from page');
            }
        }
    }

    // Aggregate metrics
    const brokenLinks = crawledPages
        .filter(p => p.status >= 400)
        .map(p => p.url);

    const crawledUrls = new Set(crawledPages.map(p => p.url));
    const orphanPages = crawledPages
        .filter(p => {
            // A page is orphaned if no other page links to it (except homepage)
            if (p.url === input.url) return false;

            return !crawledPages.some(other =>
                other.url !== p.url &&
                // This is a simplified check; proper implementation would track actual links
                other.internalLinks > 0
            );
        })
        .map(p => p.url);

    const pagesMissingTitles = crawledPages
        .filter(p => !p.title || p.title.length === 0)
        .map(p => p.url);

    const pagesMissingDescriptions = crawledPages
        .filter(p => !p.metaDescription || p.metaDescription.length === 0)
        .map(p => p.url);

    const successfulPages = crawledPages.filter(p => p.status === 200);
    const avgLoadTimeMs = successfulPages.length > 0
        ? Math.round(successfulPages.reduce((sum, p) => sum + p.loadTimeMs, 0) / successfulPages.length)
        : 0;

    const avgWordCount = successfulPages.length > 0
        ? Math.round(successfulPages.reduce((sum, p) => sum + p.wordCount, 0) / successfulPages.length)
        : 0;

    const pagesWithSchema = crawledPages.filter(p => p.hasStructuredData).length;
    const schemaOrgCoverage = crawledPages.length > 0
        ? Math.round((pagesWithSchema / crawledPages.length) * 100)
        : 0;

    // Find duplicate titles
    const titleMap = new Map<string, string[]>();
    crawledPages.forEach(p => {
        if (p.title) {
            const urls = titleMap.get(p.title) || [];
            urls.push(p.url);
            titleMap.set(p.title, urls);
        }
    });

    const duplicateTitles = new Map<string, string[]>();
    titleMap.forEach((urls, title) => {
        if (urls.length > 1) {
            duplicateTitles.set(title, urls);
        }
    });

    logger.info({
        totalCrawled: crawledPages.length,
        totalFound: allFoundUrls.size,
        brokenLinks: brokenLinks.length,
        avgLoadTimeMs,
        durationMs: Date.now() - startTime,
    }, 'Website crawl complete');

    return {
        crawledPages,
        totalPagesFound: allFoundUrls.size,
        brokenLinks,
        orphanPages,
        pagesMissingTitles,
        pagesMissingDescriptions,
        avgLoadTimeMs,
        avgWordCount,
        schemaOrgCoverage,
        duplicateTitles,
    };
}
