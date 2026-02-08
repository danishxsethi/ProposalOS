import { AuditModuleResult, WebsiteModuleInput, Finding } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import { runWebsiteCrawlerModule } from './websiteCrawlerModule';
import { logger } from '@/lib/logger';

const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runWebsiteModule(input: WebsiteModuleInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[WebsiteModule] Starting comprehensive website analysis');

    try {
        // Run comprehensive website crawler (up to 20 pages)
        const crawlerResult = await runWebsiteCrawlerModule({
            url: input.url,
            businessName: input.businessName || 'Website'
        });

        // Also run PageSpeed on homepage for Core Web Vitals
        tracker?.addApiCall('PAGESPEED');
        const pagespeedFindings = await getPageSpeedFindings(input.url);

        // Combine findings from crawler + PageSpeed
        const allFindings = [
            ...crawlerResult.findings,
            ...pagespeedFindings
        ];

        logger.info({
            totalFindings: allFindings.length,
            crawlerFindings: crawlerResult.findings.length,
            pagespeedFindings: pagespeedFindings.length
        }, '[WebsiteModule] Analysis complete');

        return {
            findings: allFindings,
            evidenceSnapshots: crawlerResult.evidenceSnapshots,
        };

    } catch (error) {
        logger.error({ error }, '[WebsiteModule] Analysis failed');

        // Fallback to basic PageSpeed if crawler fails
        try {
            tracker?.addApiCall('PAGESPEED');
            const pagespeedFindings = await getPageSpeedFindings(input.url);

            return {
                findings: pagespeedFindings,
                evidenceSnapshots: [],
            };
        } catch (fallbackError) {
            // Return error finding
            return {
                findings: [{
                    type: 'PAINKILLER',
                    category: 'Technical SEO',
                    title: 'Website Analysis Failed',
                    description: `Unable to analyze website: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    impactScore: 3,
                    confidenceScore: 50,
                    evidence: [],
                    metrics: {},
                    effortEstimate: 'LOW',
                    recommendedFix: ['Verify website is accessible and not blocking automated tools']
                }],
                evidenceSnapshots: [],
            };
        }
    }
}

/**
 * Get findings from PageSpeed Insights (Core Web Vitals)
 */
async function getPageSpeedFindings(url: string): Promise<Finding[]> {
    if (!process.env.GOOGLE_PAGESPEED_API_KEY) {
        logger.warn('[WebsiteModule] GOOGLE_PAGESPEED_API_KEY missing, skipping PageSpeed');
        return [];
    }

    try {
        const categories = ['performance', 'accessibility', 'best-practices', 'seo'];

        const params = new URLSearchParams();
        params.append('url', url);
        params.append('key', process.env.GOOGLE_PAGESPEED_API_KEY);
        params.append('strategy', 'mobile');
        categories.forEach(c => params.append('category', c));

        const data = await cachedFetch('pagespeed', { url }, async () => {
            const res = await fetch(`${PSI_API_URL}?${params.toString()}`);
            if (!res.ok) {
                throw new Error(`PSI API failed: ${res.status}`);
            }
            return await res.json();
        }, { ttlHours: 24 });

        const lighthouse = data.lighthouseResult;
        const scores = {
            performance: lighthouse.categories.performance?.score || 0,
            accessibility: lighthouse.categories.accessibility?.score || 0,
            bestPractices: lighthouse.categories['best-practices']?.score || 0,
            seo: lighthouse.categories.seo?.score || 0,
        };

        const findings: Finding[] = [];

        // Performance finding
        if (scores.performance < 0.5) {
            findings.push({
                type: 'PAINKILLER',
                category: 'Performance',
                title: 'Poor Mobile Performance Score',
                description: `PageSpeed score is ${Math.round(scores.performance * 100)}/100. Slow sites lose visitors and rank lower in search.`,
                impactScore: 8,
                confidenceScore: 95,
                evidence: [{
                    type: 'metric',
                    value: Math.round(scores.performance * 100),
                    label: 'Performance Score'
                }],
                metrics: { performanceScore: scores.performance },
                effortEstimate: 'HIGH',
                recommendedFix: [
                    'Optimize images (compress, use WebP)',
                    'Minimize JavaScript and CSS',
                    'Enable browser caching',
                    'Use a CDN for static assets'
                ]
            });
        } else if (scores.performance < 0.9) {
            findings.push({
                type: 'VITAMIN',
                category: 'Performance',
                title: 'Performance Could Be Improved',
                description: `PageSpeed score is ${Math.round(scores.performance * 100)}/100. Room for optimization.`,
                impactScore: 4,
                confidenceScore: 90,
                evidence: [{
                    type: 'metric',
                    value: Math.round(scores.performance * 100),
                    label: 'Performance Score'
                }],
                metrics: { performanceScore: scores.performance },
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Further optimize images and assets',
                    'Implement lazy loading',
                    'Consider code splitting'
                ]
            });
        }

        // Accessibility finding
        if (scores.accessibility < 0.8) {
            findings.push({
                type: scores.accessibility < 0.5 ? 'PAINKILLER' : 'VITAMIN',
                category: 'Accessibility',
                title: 'Accessibility Issues Detected',
                description: `Accessibility score is ${Math.round(scores.accessibility * 100)}/100. Affects users with disabilities and potential legal compliance.`,
                impactScore: scores.accessibility < 0.5 ? 7 : 5,
                confidenceScore: 90,
                evidence: [{
                    type: 'metric',
                    value: Math.round(scores.accessibility * 100),
                    label: 'Accessibility Score'
                }],
                metrics: { accessibilityScore: scores.accessibility },
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Add alt text to all images',
                    'Ensure proper heading hierarchy',
                    'Improve color contrast ratios',
                    'Add ARIA labels where needed'
                ]
            });
        }

        return findings;

    } catch (error) {
        logger.warn({ error }, '[WebsiteModule] PageSpeed failed, skipping');
        return [];
    }
}
