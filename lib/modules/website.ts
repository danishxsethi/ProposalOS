import { AuditModuleResult, WebsiteModuleInput, Finding, createEvidence } from './types';
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
        const psiResult = await getPageSpeedFindings(input.url);

        // Combine findings from crawler + PageSpeed
        const allFindings = [
            ...crawlerResult.findings,
            ...psiResult.findings
        ];

        // Add PageSpeed/CWV evidence snapshot
        const psiSnapshot = {
            module: 'website',
            source: 'PageSpeed Insights API',
            rawResponse: psiResult.rawResponse,
        };

        logger.info({
            totalFindings: allFindings.length,
            crawlerFindings: crawlerResult.findings.length,
            pagespeedFindings: psiResult.findings.length,
            coreWebVitals: psiResult.coreWebVitals
        }, '[WebsiteModule] Analysis complete');

        return {
            findings: allFindings,
            evidenceSnapshots: [...crawlerResult.evidenceSnapshots, psiSnapshot],
        };

    } catch (error) {
        logger.error({ error }, '[WebsiteModule] Analysis failed');

        // Fallback to basic PageSpeed if crawler fails
        try {
            tracker?.addApiCall('PAGESPEED');
            const psiResult = await getPageSpeedFindings(input.url);

            return {
                findings: psiResult.findings,
                evidenceSnapshots: [{
                    module: 'website',
                    source: 'PageSpeed Insights API',
                    rawResponse: psiResult.rawResponse,
                }],
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
                    confidenceScore: 5,
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

/** Google's Core Web Vitals thresholds */
const CWV_THRESHOLDS = {
    lcp: { good: 2500, poor: 4000 },       // ms
    fcp: { good: 1800, poor: 3000 },       // ms
    cls: { good: 0.1, poor: 0.25 },       // score
    tbt: { good: 200, poor: 600 },         // ms
} as const;

export interface CoreWebVitals {
    fcp: number | null;
    lcp: number | null;
    cls: number | null;
    tbt: number | null;
    speedIndex?: number | null;
}

interface PageSpeedResult {
    findings: Finding[];
    coreWebVitals: CoreWebVitals;
    rawResponse: any;
}

/**
 * Get findings from PageSpeed Insights (Core Web Vitals + scores)
 */
async function getPageSpeedFindings(url: string): Promise<PageSpeedResult> {
    const pointer = url || PSI_API_URL;
    const empty: PageSpeedResult = { findings: [], coreWebVitals: { fcp: null, lcp: null, cls: null, tbt: null }, rawResponse: {} };

    if (!process.env.GOOGLE_PAGESPEED_API_KEY) {
        logger.warn('[WebsiteModule] GOOGLE_PAGESPEED_API_KEY missing, skipping PageSpeed');
        return empty;
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
        const audits = lighthouse?.audits ?? {};

        // Extract Core Web Vitals from audits
        const coreWebVitals: CoreWebVitals = {
            fcp: audits['first-contentful-paint']?.numericValue ?? null,
            lcp: audits['largest-contentful-paint']?.numericValue ?? null,
            cls: audits['cumulative-layout-shift']?.numericValue ?? null,
            tbt: audits['total-blocking-time']?.numericValue ?? null,
            speedIndex: audits['speed-index']?.numericValue ?? null,
        };

        const scores = {
            performance: lighthouse?.categories?.performance?.score ?? 0,
            accessibility: lighthouse?.categories?.accessibility?.score ?? 0,
            bestPractices: lighthouse?.categories?.['best-practices']?.score ?? 0,
            seo: lighthouse?.categories?.seo?.score ?? 0,
        };

        const findings: Finding[] = [];

        // CWV findings (Google thresholds: Good / Needs Improvement / Poor)
        const cwvMetrics = {
            lcp_ms: coreWebVitals.lcp,
            fcp_ms: coreWebVitals.fcp,
            cls_score: coreWebVitals.cls,
            tbt_ms: coreWebVitals.tbt,
        };

        // LCP: Good <2500ms, Needs Improvement 2500-4000ms, Poor >4000ms
        if (coreWebVitals.lcp != null) {
            const lcpMs = coreWebVitals.lcp;
            if (lcpMs > CWV_THRESHOLDS.lcp.poor) {
                findings.push({
                    type: 'PAINKILLER',
                    category: 'Performance',
                    title: `Largest Contentful Paint is ${Math.round(lcpMs)}ms (Poor)`,
                    description: `LCP of ${Math.round(lcpMs)}ms exceeds Google's "Poor" threshold (4000ms). Users perceive your site as slow, hurting conversions and SEO.`,
                    impactScore: 8,
                    confidenceScore: 95,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(lcpMs), label: 'LCP (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Optimize server response time', 'Preload LCP image', 'Remove render-blocking resources', 'Use a CDN'],
                });
            } else if (lcpMs > CWV_THRESHOLDS.lcp.good) {
                findings.push({
                    type: 'VITAMIN',
                    category: 'Performance',
                    title: `Largest Contentful Paint is ${Math.round(lcpMs)}ms (Needs Improvement)`,
                    description: `LCP of ${Math.round(lcpMs)}ms is above Google's "Good" threshold (2500ms). Optimizing can improve user experience and rankings.`,
                    impactScore: 5,
                    confidenceScore: 90,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(lcpMs), label: 'LCP (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Preload critical resources', 'Reduce JavaScript execution time', 'Optimize images'],
                });
            }
        }

        // FCP: Good <1800ms, Needs Improvement 1800-3000ms, Poor >3000ms
        if (coreWebVitals.fcp != null) {
            const fcpMs = coreWebVitals.fcp;
            if (fcpMs > CWV_THRESHOLDS.fcp.poor) {
                findings.push({
                    type: 'PAINKILLER',
                    category: 'Performance',
                    title: `First Contentful Paint is ${Math.round(fcpMs)}ms (Poor)`,
                    description: `FCP of ${Math.round(fcpMs)}ms exceeds Google's "Poor" threshold (3000ms). Pages take too long to show any content.`,
                    impactScore: 7,
                    confidenceScore: 95,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(fcpMs), label: 'FCP (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Eliminate render-blocking resources', 'Reduce server response time', 'Minimize critical request depth'],
                });
            } else if (fcpMs > CWV_THRESHOLDS.fcp.good) {
                findings.push({
                    type: 'VITAMIN',
                    category: 'Performance',
                    title: `First Contentful Paint is ${Math.round(fcpMs)}ms (Needs Improvement)`,
                    description: `FCP of ${Math.round(fcpMs)}ms could be improved. Target under 1800ms for best experience.`,
                    impactScore: 4,
                    confidenceScore: 90,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(fcpMs), label: 'FCP (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Optimize critical rendering path', 'Use browser caching', 'Reduce unused CSS'],
                });
            }
        }

        // CLS: Good <0.1, Needs Improvement 0.1-0.25, Poor >0.25
        if (coreWebVitals.cls != null) {
            const cls = coreWebVitals.cls;
            if (cls > CWV_THRESHOLDS.cls.poor) {
                findings.push({
                    type: 'PAINKILLER',
                    category: 'Performance',
                    title: `Cumulative Layout Shift is ${cls.toFixed(2)} (Poor)`,
                    description: `CLS of ${cls.toFixed(2)} exceeds Google's "Poor" threshold (0.25). Layout shifts frustrate users and hurt conversions.`,
                    impactScore: 7,
                    confidenceScore: 95,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cls.toFixed(2), label: 'CLS' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Add size attributes to images and embeds', 'Reserve space for dynamic content', 'Avoid inserting content above existing content'],
                });
            } else if (cls > CWV_THRESHOLDS.cls.good) {
                findings.push({
                    type: 'VITAMIN',
                    category: 'Performance',
                    title: `Cumulative Layout Shift is ${cls.toFixed(2)} (Needs Improvement)`,
                    description: `CLS of ${cls.toFixed(2)} is above the "Good" threshold (0.1). Reducing layout shifts improves perceived quality.`,
                    impactScore: 4,
                    confidenceScore: 90,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cls.toFixed(2), label: 'CLS' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Set explicit dimensions on media', 'Prefer transform animations over layout-triggering properties'],
                });
            }
        }

        // TBT: Good <200ms, Needs Improvement 200-600ms, Poor >600ms
        if (coreWebVitals.tbt != null) {
            const tbtMs = coreWebVitals.tbt;
            if (tbtMs > CWV_THRESHOLDS.tbt.poor) {
                findings.push({
                    type: 'PAINKILLER',
                    category: 'Performance',
                    title: `Total Blocking Time is ${Math.round(tbtMs)}ms (Poor)`,
                    description: `TBT of ${Math.round(tbtMs)}ms indicates heavy main-thread work. Pages feel unresponsive.`,
                    impactScore: 6,
                    confidenceScore: 90,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(tbtMs), label: 'TBT (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Split and defer JavaScript', 'Reduce JavaScript execution time', 'Use web workers for heavy tasks'],
                });
            } else if (tbtMs > CWV_THRESHOLDS.tbt.good) {
                findings.push({
                    type: 'VITAMIN',
                    category: 'Performance',
                    title: `Total Blocking Time is ${Math.round(tbtMs)}ms (Needs Improvement)`,
                    description: `TBT of ${Math.round(tbtMs)}ms could be reduced. Target under 200ms for responsive feel.`,
                    impactScore: 4,
                    confidenceScore: 85,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(tbtMs), label: 'TBT (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Code-split and lazy-load non-critical JS', 'Minimize third-party scripts'],
                });
            }
        }

        // Performance score finding (keep existing logic)
        if (scores.performance < 0.5) {
            findings.push({
                type: 'PAINKILLER',
                category: 'Performance',
                title: 'Poor Mobile Performance Score',
                description: `PageSpeed score is ${Math.round(scores.performance * 100)}/100. Slow sites lose visitors and rank lower in search.`,
                impactScore: 8,
                confidenceScore: 95,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(scores.performance * 100), label: 'Performance Score' })],
                metrics: { performanceScore: scores.performance, ...cwvMetrics },
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
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(scores.performance * 100), label: 'Performance Score' })],
                metrics: { performanceScore: scores.performance, ...cwvMetrics },
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
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(scores.accessibility * 100), label: 'Accessibility Score' })],
                metrics: { accessibilityScore: scores.accessibility, ...cwvMetrics },
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Add alt text to all images',
                    'Ensure proper heading hierarchy',
                    'Improve color contrast ratios',
                    'Add ARIA labels where needed'
                ]
            });
        }

        return {
            findings,
            coreWebVitals,
            rawResponse: {
                ...data,
                coreWebVitals,
                finalUrl: data.loadingExperience?.origin_fallback ?? url,
            },
        };
    } catch (error) {
        logger.warn({ error }, '[WebsiteModule] PageSpeed failed, skipping');
        return empty;
    }
}
