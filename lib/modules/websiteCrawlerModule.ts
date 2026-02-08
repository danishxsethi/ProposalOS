import { AuditModuleResult, Finding, EvidenceItem } from './types';
import { crawlWebsite, CrawlResult } from './websiteCrawler';
import { logger } from '@/lib/logger';

interface WebsiteCrawlerModuleInput {
    url: string;
    businessName: string;
}

/**
 * Generate findings from crawl results
 */
function generateFindingsFromCrawl(crawlResult: CrawlResult, businessUrl: string): Finding[] {
    const findings: Finding[] = [];

    // 1. PAINKILLER: Broken links (404/5xx)
    if (crawlResult.brokenLinks.length > 0) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Technical SEO',
            title: `${crawlResult.brokenLinks.length} Broken Links Detected`,
            description: `Found ${crawlResult.brokenLinks.length} pages returning 4xx or 5xx errors. Broken links damage SEO rankings and user experience.`,
            impactScore: 8,
            confidenceScore: 95,
            evidence: crawlResult.brokenLinks.slice(0, 10).map(url => ({
                type: 'url' as const,
                value: url,
                label: 'Broken Link'
            })),
            metrics: {
                brokenLinkCount: crawlResult.brokenLinks.length,
                affectedUrls: crawlResult.brokenLinks
            },
            effortEstimate: 'MEDIUM' as const,
            recommendedFix: [
                'Fix or redirect all broken links',
                'Implement 301 redirects for moved pages',
                'Remove links to non-existent pages',
                'Set up automated broken link monitoring'
            ]
        });
    }

    // 2. PAINKILLER: Homepage thin content (<100 words)
    const homepage = crawlResult.crawledPages.find(p => p.url === businessUrl);
    if (homepage && homepage.wordCount < 100) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Content',
            title: 'Homepage Has Thin Content',
            description: `Homepage only has ${homepage.wordCount} words. Search engines may view this as low-quality content, harming SEO rankings.`,
            impactScore: 7,
            confidenceScore: 90,
            evidence: [{
                type: 'metric',
                value: homepage.wordCount,
                label: 'Homepage Word Count'
            }],
            metrics: {
                wordCount: homepage.wordCount,
                recommendedMinimum: 300
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add comprehensive description of services/products (300-500 words)',
                'Include unique value proposition',
                'Add customer testimonials or case studies',
                'Ensure content is engaging and keyword-optimized'
            ]
        });
    }

    // 3. PAINKILLER: >50% pages missing meta titles
    const missingTitlesPct = crawlResult.crawledPages.length > 0
        ? (crawlResult.pagesMissingTitles.length / crawlResult.crawledPages.length) * 100
        : 0;

    if (missingTitlesPct > 50) {
        findings.push({
            type: 'PAINKILLER',
            category: 'On-Page SEO',
            title: `${Math.round(missingTitlesPct)}% of Pages Missing Title Tags`,
            description: `${crawlResult.pagesMissingTitles.length} out of ${crawlResult.crawledPages.length} pages are missing title tags. This severely impacts SEO visibility.`,
            impactScore: 8,
            confidenceScore: 95,
            evidence: crawlResult.pagesMissingTitles.slice(0, 5).map(url => ({
                type: 'url',
                value: url,
                label: 'Page Missing Title'
            })),
            metrics: {
                pagesMissingTitles: crawlResult.pagesMissingTitles.length,
                totalPages: crawlResult.crawledPages.length,
                percentageMissing: Math.round(missingTitlesPct)
            },
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Add unique, descriptive title tags to all pages (50-60 characters)',
                'Include primary keywords in titles',
                'Follow format: "Primary Keyword | Secondary Keyword | Brand"',
                'Ensure titles match page content'
            ]
        });
    }

    // 4. VITAMIN: Duplicate title tags
    if (crawlResult.duplicateTitles.size > 0) {
        const duplicateCount = Array.from(crawlResult.duplicateTitles.values())
            .reduce((sum, urls) => sum + urls.length, 0);

        findings.push({
            type: 'VITAMIN',
            category: 'On-Page SEO',
            title: `${crawlResult.duplicateTitles.size} Duplicate Title Tags Found`,
            description: `${duplicateCount} pages share the same title tags. Each page should have a unique title for better SEO performance.`,
            impactScore: 5,
            confidenceScore: 90,
            evidence: Array.from(crawlResult.duplicateTitles.entries()).slice(0, 3).map(([title, urls]) => ({
                type: 'text',
                value: `"${title}" (${urls.length} pages)`,
                label: 'Duplicate Title'
            })),
            metrics: {
                duplicateTitleGroups: crawlResult.duplicateTitles.size,
                affectedPages: duplicateCount
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Create unique title tags for each page',
                'Tailor titles to page-specific content and keywords',
                'Avoid using site-wide templates without customization'
            ]
        });
    }

    // 5. VITAMIN: Average page size >3MB
    const avgPageSizeMB = crawlResult.crawledPages.length > 0
        ? crawlResult.crawledPages.reduce((sum, p) => sum + p.pageSizeKB, 0) / crawlResult.crawledPages.length / 1024
        : 0;

    if (avgPageSizeMB > 3) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'Pages Are Too Large',
            description: `Average page size is ${avgPageSizeMB.toFixed(2)}MB. Large pages slow down load times and hurt user experience, especially on mobile.`,
            impactScore: 5,
            confidenceScore: 85,
            evidence: [{
                type: 'metric',
                value: avgPageSizeMB.toFixed(2),
                label: 'Average Page Size (MB)'
            }],
            metrics: {
                avgPageSizeMB: parseFloat(avgPageSizeMB.toFixed(2)),
                recommendedMaxMB: 2.0
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Compress and optimize images (use WebP format)',
                'Minify CSS and JavaScript',
                'Enable GZIP/Brotli compression on server',
                'Implement lazy loading for images and videos',
                'Use a CDN for static assets'
            ]
        });
    }

    // 6. VITAMIN: No structured data on any page
    if (crawlResult.schemaOrgCoverage === 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Technical SEO',
            title: 'No Structured Data Detected',
            description: `None of the ${crawlResult.crawledPages.length} crawled pages have structured data (Schema.org). This limits rich snippet opportunities in search results.`,
            impactScore: 6,
            confidenceScore: 90,
            evidence: [{
                type: 'text',
                value: '0% schema coverage',
                label: 'Structured Data Coverage'
            }],
            metrics: {
                schemaOrgCoverage: 0,
                totalPages: crawlResult.crawledPages.length
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add JSON-LD structured data to homepage (Organization schema)',
                'Implement LocalBusiness schema if applicable',
                'Add Product/Service schema for offering pages',
                'Include BreadcrumbList schema for navigation',
                'Validate with Google\'s Rich Results Test'
            ]
        });
    }

    // 7. VITAMIN: >30% images missing alt text
    const totalImages = crawlResult.crawledPages.reduce((sum, p) => sum + p.imageCount, 0);
    const imagesWithAlt = crawlResult.crawledPages.reduce((sum, p) => sum + p.imagesWithAlt, 0);
    const missingAltPct = totalImages > 0 ? ((totalImages - imagesWithAlt) / totalImages) * 100 : 0;

    if (missingAltPct > 30 && totalImages > 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Accessibility',
            title: `${Math.round(missingAltPct)}% of Images Missing Alt Text`,
            description: `${totalImages - imagesWithAlt} out of ${totalImages} images lack alt text. This hurts accessibility and image SEO.`,
            impactScore: 4,
            confidenceScore: 90,
            evidence: [{
                type: 'metric',
                value: Math.round(missingAltPct),
                label: 'Images Missing Alt (%)'
            }],
            metrics: {
                totalImages,
                imagesWithAlt,
                imagesMissingAlt: totalImages - imagesWithAlt,
                percentageMissing: Math.round(missingAltPct)
            },
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Add descriptive alt text to all images',
                'Keep alt text concise (under 125 characters)',
                'Include keywords naturally where relevant',
                'Don\'t use "image of" or "picture of" - describe what\'s in the image',
                'Leave alt empty for purely decorative images'
            ]
        });
    }

    // 8. VITAMIN: <5 internal pages (thin site)
    if (crawlResult.totalPagesFound < 5) {
        findings.push({
            type: 'VITAMIN',
            category: 'Content',
            title: 'Website Has Very Few Pages',
            description: `Only ${crawlResult.totalPagesFound} pages found. Search engines favor sites with more comprehensive content.`,
            impactScore: 5,
            confidenceScore: 85,
            evidence: [{
                type: 'metric',
                value: crawlResult.totalPagesFound,
                label: 'Total Pages'
            }],
            metrics: {
                totalPages: crawlResult.totalPagesFound,
                recommendedMinimum: 10
            },
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Create dedicated pages for each service/product offering',
                'Add an About page and Contact page',
                'Start a blog with industry insights',
                'Create FAQ or Resources section',
                'Add location-specific pages if applicable'
            ]
        });
    }

    return findings;
}

/**
 * Run website crawler module
 */
export async function runWebsiteCrawlerModule(input: WebsiteCrawlerModuleInput): Promise<AuditModuleResult> {
    logger.info({ businessName: input.businessName, url: input.url }, '[WebsiteCrawler] Starting crawl');

    try {
        // Run the crawl
        const crawlResult = await crawlWebsite(input);

        // Generate findings
        const findings = generateFindingsFromCrawl(crawlResult, input.url);

        // Store full crawl data as evidence
        const evidenceSnapshot = {
            module: 'website_crawler',
            source: 'internal_crawl',
            rawResponse: {
                crawlSummary: {
                    totalPagesFound: crawlResult.totalPagesFound,
                    pagesCrawled: crawlResult.crawledPages.length,
                    avgLoadTimeMs: crawlResult.avgLoadTimeMs,
                    avgWordCount: crawlResult.avgWordCount,
                    schemaOrgCoverage: crawlResult.schemaOrgCoverage,
                },
                crawledPages: crawlResult.crawledPages,
                brokenLinks: crawlResult.brokenLinks,
                duplicateTitles: Array.from(crawlResult.duplicateTitles.entries()),
                pagesMissingTitles: crawlResult.pagesMissingTitles,
                pagesMissingDescriptions: crawlResult.pagesMissingDescriptions,
            },
            collectedAt: new Date()
        };

        logger.info({
            businessName: input.businessName,
            findingsCount: findings.length,
            pagesCrawled: crawlResult.crawledPages.length,
        }, '[WebsiteCrawler] Crawl complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, businessName: input.businessName }, '[WebsiteCrawler] Crawl failed');

        // Return error as a finding
        return {
            findings: [{
                type: 'PAINKILLER',
                category: 'Technical SEO',
                title: 'Website Crawl Failed',
                description: `Unable to crawl website: ${error instanceof Error ? error.message : 'Unknown error'}`,
                impactScore: 3,
                confidenceScore: 50,
                evidence: [{
                    type: 'text',
                    value: error instanceof Error ? error.message : 'Unknown error',
                    label: 'Error'
                }],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: [
                    'Verify website URL is accessible',
                    'Check if site is blocking crawlers',
                    'Ensure no server firewall issues'
                ]
            }],
            evidenceSnapshots: [],
        };
    }
}
