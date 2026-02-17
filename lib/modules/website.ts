import { AuditModuleResult, WebsiteModuleInput, Finding, createEvidence } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import { runWebsiteCrawlerModule } from './websiteCrawlerModule';
import { logger } from '@/lib/logger';
import { extractCoreWebVitalsFromAudits, type CoreWebVitalsFull } from './coreWebVitals';
import { analyzeSchemaMarkup } from './schemaAnalysis';
import { detectConversionElements } from '@/lib/analysis/conversionDetector';

const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runWebsiteModule(input: WebsiteModuleInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[WebsiteModule] Starting comprehensive website analysis');

    try {
        // Run comprehensive website crawler (up to 20 pages)
        const crawlerResult = await runWebsiteCrawlerModule({
            url: input.url,
            businessName: input.businessName || 'Website'
        });

        // Run PageSpeed on homepage for Core Web Vitals
        tracker?.addApiCall('PAGESPEED');
        const psiResult = await getPageSpeedFindings(input.url);

        // Fetch homepage HTML for schema analysis and conversion detection
        let schemaAnalysis = null;
        let conversionAnalysis = null;
        try {
            const htmlRes = await fetch(input.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(45000),
            });
            const html = await htmlRes.text();
            schemaAnalysis = analyzeSchemaMarkup(html);
            const schemaFindings = generateSchemaFindings(schemaAnalysis, input.url);
            psiResult.findings.push(...schemaFindings);

            conversionAnalysis = detectConversionElements(html, input.url);
            const conversionFindings = generateConversionFindings(conversionAnalysis, input.url);
            psiResult.findings.push(...conversionFindings);
        } catch (schemaErr) {
            logger.warn({ error: schemaErr }, '[WebsiteModule] Schema/conversion analysis failed, skipping');
        }

        const allFindings = [
            ...crawlerResult.findings,
            ...psiResult.findings
        ];

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
            data: {
                scores: psiResult.scores,
                coreWebVitals: psiResult.coreWebVitals,
                schemaAnalysis: schemaAnalysis ?? undefined,
                conversionAnalysis: conversionAnalysis ?? undefined,
                finalUrl: psiResult.finalUrl,
            },
        };

    } catch (error) {
        logger.error({ error }, '[WebsiteModule] Analysis failed');

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
                data: {
                    scores: psiResult.scores,
                    coreWebVitals: psiResult.coreWebVitals,
                    finalUrl: psiResult.finalUrl,
                },
            };
        } catch (fallbackError) {
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
                data: { scores: {}, coreWebVitals: {}, finalUrl: input.url },
            };
        }
    }
}

/** Legacy CoreWebVitals for backward compatibility */
export interface CoreWebVitals {
    fcp: number | null;
    lcp: number | null;
    cls: number | null;
    tbt: number | null;
    speedIndex?: number | null;
    inp?: number | null;
    ttfb?: number | null;
}

interface PageSpeedResult {
    findings: Finding[];
    coreWebVitals: CoreWebVitals & { full?: CoreWebVitalsFull; schemaAnalysis?: ReturnType<typeof analyzeSchemaMarkup> };
    scores: { performance: number; accessibility: number; bestPractices: number; seo: number };
    finalUrl: string;
    rawResponse: unknown;
}

function generateSchemaFindings(schema: ReturnType<typeof analyzeSchemaMarkup>, url: string): Finding[] {
    const findings: Finding[] = [];
    const pointer = url;

    const checks = [
        schema.hasLocalBusinessOrOrganization,
        schema.hasIndustrySpecific,
        schema.hasBreadcrumb,
        schema.hasFaq,
        schema.hasReviewAggregateRating,
        schema.hasSitelinksSearchbox,
    ];

    const impactByCheck: Record<string, number> = {
        'local-business-organization': 8,
        'industry-specific': 6,
        'breadcrumb': 4,
        'faq': 4,
        'review-aggregate': 6,
        'sitelinks-searchbox': 3,
    };

    const titles: Record<string, string> = {
        'local-business-organization': 'No LocalBusiness or Organization schema',
        'industry-specific': 'No industry-specific schema',
        'breadcrumb': 'No breadcrumb schema',
        'faq': 'No FAQ schema',
        'review-aggregate': 'No review/aggregate rating schema',
        'sitelinks-searchbox': 'No sitelinks searchbox schema',
    };

    for (const check of checks) {
        if (!check.present && check.recommendation) {
            const example = check.id === 'local-business-organization'
                ? 'Add this JSON-LD to your homepage: {"@context":"https://schema.org","@type":"LocalBusiness","name":"Your Business","url":"https://yoursite.com","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"City","addressRegion":"ST"}}'
                : undefined;

            findings.push({
                type: 'VITAMIN',
                category: 'Technical SEO',
                title: titles[check.id] || `Missing ${check.id} schema`,
                description: check.recommendation,
                impactScore: impactByCheck[check.id] ?? 5,
                confidenceScore: 95,
                evidence: [createEvidence({ pointer, source: 'schema_analysis', type: 'text', value: 'Missing', label: check.id })],
                metrics: { schemaCheck: check.id, present: false },
                effortEstimate: 'MEDIUM',
                recommendedFix: example ? [check.recommendation, example] : [check.recommendation],
            });
        }
    }

    return findings;
}

function generateConversionFindings(
    conversion: ReturnType<typeof detectConversionElements>,
    url: string
): Finding[] {
    const findings: Finding[] = [];
    const pointer = url;

    if (conversion.score < 70) {
        const criticalCount = conversion.criticalMissing.length;
        const desc = criticalCount > 0
            ? `Conversion readiness score: ${conversion.score}/100. ${conversion.criticalMissing[0]} — ${conversion.recommendations[0] || 'Add key conversion elements.'}`
            : `Conversion readiness score: ${conversion.score}/100. Several conversion elements are missing or below the fold.`;

        findings.push({
            type: criticalCount >= 2 ? 'PAINKILLER' : 'VITAMIN',
            category: 'Conversion',
            title: `Conversion readiness: ${conversion.score}/100`,
            description: desc,
            impactScore: criticalCount >= 2 ? 8 : 6,
            confidenceScore: 90,
            evidence: [createEvidence({
                pointer,
                source: 'conversion_detector',
                type: 'metric',
                value: conversion.score,
                label: 'Conversion Score',
                raw: { score: conversion.score, criticalMissing: conversion.criticalMissing },
            })],
            metrics: {
                conversionScore: conversion.score,
                criticalMissing: conversion.criticalMissing,
                elementsDetected: conversion.elements.filter((e) => e.detected).length,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: conversion.recommendations.slice(0, 5),
        });
    }

    if (conversion.criticalMissing.includes('Click-to-call phone number')) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'No click-to-call phone number',
            description: 'Mobile visitors can\'t contact you with one tap — that\'s your highest-intent traffic. Add a tel: link in your header or hero.',
            impactScore: 8,
            confidenceScore: 95,
            evidence: [createEvidence({ pointer, source: 'conversion_detector', type: 'text', value: 'Missing', label: 'tel: link' })],
            metrics: { element: 'phone' },
            effortEstimate: 'LOW',
            recommendedFix: ['Add <a href="tel:+1234567890">Call Now</a> in header/hero', 'Ensure phone is visible above the fold on mobile'],
        });
    }

    return findings;
}

async function getPageSpeedFindings(url: string): Promise<PageSpeedResult> {
    const pointer = url || PSI_API_URL;
    const emptyLegacy: CoreWebVitals = { fcp: null, lcp: null, cls: null, tbt: null };
    const empty: PageSpeedResult = {
        findings: [],
        coreWebVitals: emptyLegacy,
        scores: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
        finalUrl: url,
        rawResponse: {},
    };

    if (!process.env.GOOGLE_PAGESPEED_API_KEY) {
        logger.warn('[WebsiteModule] GOOGLE_PAGESPEED_API_KEY missing, skipping PageSpeed');
        return empty;
    }

    try {
        const params = new URLSearchParams();
        params.append('url', url);
        params.append('key', process.env.GOOGLE_PAGESPEED_API_KEY);
        params.append('strategy', 'mobile');
        ['performance', 'accessibility', 'best-practices', 'seo'].forEach(c => params.append('category', c));

        const data = await cachedFetch('pagespeed', { url }, async () => {
            const res = await fetch(`${PSI_API_URL}?${params.toString()}`);
            if (!res.ok) throw new Error(`PSI API failed: ${res.status}`);
            return await res.json();
        }, { ttlHours: 24 });

        const lighthouse = data.lighthouseResult;
        const audits = lighthouse?.audits ?? {};

        const cwvFull = extractCoreWebVitalsFromAudits(audits as Parameters<typeof extractCoreWebVitalsFromAudits>[0]);

        const legacy: CoreWebVitals = {
            fcp: cwvFull.fcp ? cwvFull.fcp.value * 1000 : null,
            lcp: cwvFull.lcp ? cwvFull.lcp.value * 1000 : null,
            cls: cwvFull.cls?.value ?? null,
            tbt: cwvFull.tbt?.value ?? null,
            speedIndex: cwvFull.speedIndex ? cwvFull.speedIndex.value * 1000 : null,
            inp: cwvFull.inp?.value ?? null,
            ttfb: cwvFull.ttfb ? cwvFull.ttfb.value * 1000 : null,
        };

        const scores = {
            performance: lighthouse?.categories?.performance?.score ?? 0,
            accessibility: lighthouse?.categories?.accessibility?.score ?? 0,
            bestPractices: lighthouse?.categories?.['best-practices']?.score ?? 0,
            seo: lighthouse?.categories?.seo?.score ?? 0,
        };

        const findings: Finding[] = [];
        const cwvMetrics = {
            lcp_ms: legacy.lcp,
            fcp_ms: legacy.fcp,
            cls_score: legacy.cls,
            tbt_ms: legacy.tbt,
            inp_ms: legacy.inp,
            ttfb_ms: legacy.ttfb,
            performanceScore: Math.round((scores.performance ?? 0) * 100),
        };

        const addCwvFinding = (
            metric: keyof typeof legacy,
            value: number,
            unit: 'ms' | 's' | '',
            poorThreshold: number,
            desc: string,
            fix: string[],
            impact: number,
            type: 'PAINKILLER' | 'VITAMIN'
        ) => {
            const display = unit === 's' ? `${value.toFixed(1)}s` : `${Math.round(value)}${unit}`;
            findings.push({
                type,
                category: 'Performance',
                title: `${metric.toUpperCase()} is ${display} (${type === 'PAINKILLER' ? 'Poor' : 'Needs Improvement'})`,
                description: desc,
                impactScore: impact,
                confidenceScore: 95,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: display, label: metric })],
                metrics: { ...cwvMetrics },
                effortEstimate: type === 'PAINKILLER' ? 'HIGH' : 'MEDIUM',
                recommendedFix: fix,
            });
        };

        if (cwvFull.lcp && cwvFull.lcp.rating !== 'good') {
            const lcpSec = cwvFull.lcp.value;
            if (cwvFull.lcp.rating === 'poor') {
                addCwvFinding(
                    'lcp',
                    lcpSec * 1000,
                    'ms',
                    4000,
                    `Your LCP is ${lcpSec.toFixed(1)}s — visitors see a blank or loading screen for over ${Math.ceil(lcpSec)} seconds before main content appears. This loses conversions and hurts SEO.`,
                    ['Optimize server response time', 'Preload LCP image', 'Remove render-blocking resources', 'Use a CDN'],
                    8,
                    'PAINKILLER'
                );
            } else {
                addCwvFinding(
                    'lcp',
                    lcpSec * 1000,
                    'ms',
                    2500,
                    `LCP of ${lcpSec.toFixed(1)}s is above Google's "Good" threshold (2.5s). Optimizing can improve user experience and rankings.`,
                    ['Preload critical resources', 'Reduce JavaScript execution time', 'Optimize images'],
                    5,
                    'VITAMIN'
                );
            }
        }

        if (cwvFull.fcp && cwvFull.fcp.rating !== 'good') {
            const fcpSec = cwvFull.fcp.value;
            if (cwvFull.fcp.rating === 'poor') {
                addCwvFinding(
                    'fcp',
                    fcpSec * 1000,
                    'ms',
                    3000,
                    `Your FCP is ${fcpSec.toFixed(1)}s — visitors wait over ${Math.ceil(fcpSec)} seconds before seeing any content. Pages feel broken.`,
                    ['Eliminate render-blocking resources', 'Reduce server response time', 'Minimize critical request depth'],
                    7,
                    'PAINKILLER'
                );
            } else {
                addCwvFinding(
                    'fcp',
                    fcpSec * 1000,
                    'ms',
                    1800,
                    `FCP of ${fcpSec.toFixed(1)}s could be improved. Target under 1.8s for best experience.`,
                    ['Optimize critical rendering path', 'Use browser caching', 'Reduce unused CSS'],
                    4,
                    'VITAMIN'
                );
            }
        }

        if (cwvFull.cls && cwvFull.cls.rating !== 'good') {
            const cls = cwvFull.cls.value;
            findings.push({
                type: cwvFull.cls.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN',
                category: 'Performance',
                title: `Cumulative Layout Shift is ${cls.toFixed(2)} (${cwvFull.cls.rating === 'poor' ? 'Poor' : 'Needs Improvement'})`,
                description: cwvFull.cls.rating === 'poor'
                    ? `CLS of ${cls.toFixed(2)} causes visible layout jumps. Users may click the wrong button or lose their place.`
                    : `CLS of ${cls.toFixed(2)} is above the "Good" threshold (0.1). Reducing layout shifts improves perceived quality.`,
                impactScore: cwvFull.cls.rating === 'poor' ? 7 : 4,
                confidenceScore: 95,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cls.toFixed(2), label: 'CLS' })],
                metrics: { ...cwvMetrics },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Add size attributes to images and embeds', 'Reserve space for dynamic content', 'Avoid inserting content above existing content'],
            });
        }

        if (cwvFull.inp && cwvFull.inp.rating !== 'good') {
            const inpMs = cwvFull.inp.value;
            if (cwvFull.inp.rating === 'poor') {
                findings.push({
                    type: 'PAINKILLER',
                    category: 'Performance',
                    title: `Interaction to Next Paint is ${Math.round(inpMs)}ms (Poor)`,
                    description: `INP of ${Math.round(inpMs)}ms means clicks and taps feel sluggish. Users may think the site is broken.`,
                    impactScore: 6,
                    confidenceScore: 90,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(inpMs), label: 'INP (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Reduce JavaScript execution time', 'Break up long tasks', 'Optimize event handlers'],
                });
            } else {
                findings.push({
                    type: 'VITAMIN',
                    category: 'Performance',
                    title: `Interaction to Next Paint is ${Math.round(inpMs)}ms (Needs Improvement)`,
                    description: `INP of ${Math.round(inpMs)}ms could be improved. Target under 200ms for responsive feel.`,
                    impactScore: 4,
                    confidenceScore: 85,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(inpMs), label: 'INP (ms)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Code-split and lazy-load non-critical JS', 'Minimize third-party scripts'],
                });
            }
        }

        if (cwvFull.ttfb && cwvFull.ttfb.rating !== 'good') {
            const ttfbSec = cwvFull.ttfb.value;
            if (cwvFull.ttfb.rating === 'poor') {
                findings.push({
                    type: 'PAINKILLER',
                    category: 'Performance',
                    title: `Time to First Byte is ${ttfbSec.toFixed(2)}s (Poor)`,
                    description: `TTFB of ${ttfbSec.toFixed(2)}s means the server is slow to respond. All other loading depends on this.`,
                    impactScore: 7,
                    confidenceScore: 95,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: ttfbSec.toFixed(2), label: 'TTFB (s)' })],
                    metrics: { ...cwvMetrics },
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Optimize server response', 'Use a CDN', 'Enable HTTP/2', 'Reduce server-side processing'],
                });
            }
        }

        if (cwvFull.tbt && cwvFull.tbt.rating !== 'good') {
            const tbtMs = cwvFull.tbt.value;
            if (cwvFull.tbt.rating === 'poor') {
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
            } else {
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

        if (cwvFull.totalPageWeightMB != null && cwvFull.totalPageWeightMB > 3) {
            findings.push({
                type: 'VITAMIN',
                category: 'Performance',
                title: `Total page weight is ${cwvFull.totalPageWeightMB.toFixed(2)} MB`,
                description: `Page loads ${cwvFull.totalPageWeightMB.toFixed(2)} MB of data. Large payloads slow load times, especially on mobile.`,
                impactScore: 5,
                confidenceScore: 90,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cwvFull.totalPageWeightMB.toFixed(2), label: 'Page Weight (MB)' })],
                metrics: { ...cwvMetrics, totalPageWeightMB: cwvFull.totalPageWeightMB },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Compress images (WebP)', 'Minify CSS/JS', 'Enable GZIP/Brotli', 'Lazy-load below-fold content'],
            });
        }

        if (cwvFull.renderBlockingCount != null && cwvFull.renderBlockingCount > 5) {
            findings.push({
                type: 'VITAMIN',
                category: 'Performance',
                title: `${cwvFull.renderBlockingCount} render-blocking resources`,
                description: `Render-blocking CSS/JS delays first paint. Consider inlining critical CSS and deferring non-critical scripts.`,
                impactScore: 5,
                confidenceScore: 85,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cwvFull.renderBlockingCount, label: 'Render-blocking count' })],
                metrics: { ...cwvMetrics, renderBlockingCount: cwvFull.renderBlockingCount },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Inline critical CSS', 'Defer non-critical JavaScript', 'Use async/defer on script tags'],
            });
        }

        if (scores.performance < 0.5) {
            findings.push({
                type: 'PAINKILLER',
                category: 'Performance',
                title: 'Poor Mobile Performance Score',
                description: `PageSpeed score is ${Math.round(scores.performance * 100)}/100. Slow sites lose visitors and rank lower in search.`,
                impactScore: 8,
                confidenceScore: 95,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(scores.performance * 100), label: 'Performance Score' })],
                metrics: { ...cwvMetrics },
                effortEstimate: 'HIGH',
                recommendedFix: ['Optimize images (compress, use WebP)', 'Minimize JavaScript and CSS', 'Enable browser caching', 'Use a CDN for static assets']
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
                metrics: { ...cwvMetrics },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Further optimize images and assets', 'Implement lazy loading', 'Consider code splitting']
            });
        }

        if (scores.accessibility < 0.8) {
            findings.push({
                type: scores.accessibility < 0.5 ? 'PAINKILLER' : 'VITAMIN',
                category: 'Accessibility',
                title: 'Accessibility Issues Detected',
                description: `Accessibility score is ${Math.round(scores.accessibility * 100)}/100. Affects users with disabilities and potential legal compliance.`,
                impactScore: scores.accessibility < 0.5 ? 7 : 5,
                confidenceScore: 90,
                evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(scores.accessibility * 100), label: 'Accessibility Score' })],
                metrics: { ...cwvMetrics },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Add alt text to all images', 'Ensure proper heading hierarchy', 'Improve color contrast ratios', 'Add ARIA labels where needed']
            });
        }

        const finalUrl = data.loadingExperience?.origin_fallback ?? url;
        return {
            findings,
            coreWebVitals: { ...legacy, full: cwvFull },
            scores,
            finalUrl,
            rawResponse: { ...data, coreWebVitals: { ...legacy, full: cwvFull }, finalUrl },
        };
    } catch (error) {
        logger.warn({ error }, '[WebsiteModule] PageSpeed failed, skipping');
        return empty;
    }
}
