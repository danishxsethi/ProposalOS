import { FindingType, EffortLevel } from '@prisma/client';
import { createEvidence } from './types';
import type { CoreWebVitalsFull } from './coreWebVitals';
import type { SchemaAnalysis } from './schemaAnalysis';
import type { SchemaMarkupResult } from './schemaMarkup';
import type { AccessibilityResult } from './accessibility';
import type { SecurityResult } from './security';
import { computeGbpCompleteness, type GbpCompletenessResult, type CompetitorGbpData } from '@/lib/analysis/gbpCompleteness';
import type { ConversionDetectionResult } from '@/lib/analysis/conversionDetector';
import type { ConversionResult } from '@/lib/modules/conversion';

const PSI_POINTER = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const PLACES_POINTER = 'https://places.googleapis.com';
const SERPAPI_POINTER = 'https://serpapi.com';
const GOOGLE_REVIEWS_POINTER = 'https://maps.googleapis.com/maps/api/place/details';

export interface Finding {
    module: string;
    category: string;
    type: FindingType;
    title: string;
    description?: string;
    evidence: any[];
    metrics: any;
    impactScore: number;
    confidenceScore: number;
    effortEstimate?: EffortLevel;
    recommendedFix: any[];
}

/** Google's Core Web Vitals thresholds (ms or score) */
const CWV_THRESHOLDS = {
    lcp: { good: 2500, poor: 4000 },
    fcp: { good: 1800, poor: 3000 },
    cls: { good: 0.1, poor: 0.25 },
    tbt: { good: 200, poor: 600 },
};

/**
 * Generate schema findings from SchemaAnalysis (used when data comes from legacy path).
 */
function generateSchemaFindingsFromAnalysis(schema: SchemaAnalysis, pointer: string): Finding[] {
    const findings: Finding[] = [];
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
                module: 'website',
                category: 'visibility',
                type: 'VITAMIN',
                title: titles[check.id] || `Missing ${check.id} schema`,
                description: check.recommendation,
                evidence: [createEvidence({ pointer, source: 'schema_analysis', type: 'text', value: 'Missing', label: check.id })],
                metrics: { schemaCheck: check.id, present: false },
                impactScore: impactByCheck[check.id] ?? 5,
                confidenceScore: 95,
                effortEstimate: 'MEDIUM',
                recommendedFix: example ? [check.recommendation, example] : [check.recommendation],
            });
        }
    }
    return findings;
}

/**
 * Generate CWV findings from CoreWebVitalsFull (richer descriptions and metrics).
 */
function generateCwvFindingsFromFull(cwvFull: CoreWebVitalsFull, pointer: string): Finding[] {
    const findings: Finding[] = [];
    const cwvMetrics = {
        lcp_ms: cwvFull.lcp ? cwvFull.lcp.value * 1000 : null,
        fcp_ms: cwvFull.fcp ? cwvFull.fcp.value * 1000 : null,
        cls_score: cwvFull.cls?.value ?? null,
        tbt_ms: cwvFull.tbt?.value ?? null,
        inp_ms: cwvFull.inp?.value ?? null,
        ttfb_ms: cwvFull.ttfb ? cwvFull.ttfb.value * 1000 : null,
    };

    const addCwv = (
        title: string,
        desc: string,
        value: string | number,
        label: string,
        fix: string[],
        impact: number,
        type: 'PAINKILLER' | 'VITAMIN'
    ) => {
        findings.push({
            module: 'website',
            category: 'performance',
            type,
            title,
            description: desc,
            evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value, label })],
            metrics: { ...cwvMetrics },
            impactScore: impact,
            confidenceScore: 95,
            effortEstimate: type === 'PAINKILLER' ? 'HIGH' : 'MEDIUM',
            recommendedFix: fix,
        });
    };

    if (cwvFull.lcp && cwvFull.lcp.rating !== 'good') {
        const lcpSec = cwvFull.lcp.value;
        if (cwvFull.lcp.rating === 'poor') {
            addCwv(
                `LCP is ${(lcpSec * 1000).toFixed(0)}ms (Poor)`,
                `Your LCP is ${lcpSec.toFixed(1)}s — visitors see a blank or loading screen for over ${Math.ceil(lcpSec)} seconds before main content appears. This loses conversions and hurts SEO.`,
                Math.round(lcpSec * 1000),
                'LCP (ms)',
                ['Optimize server response time', 'Preload LCP image', 'Remove render-blocking resources', 'Use a CDN'],
                8,
                'PAINKILLER'
            );
        } else {
            addCwv(
                `LCP is ${(lcpSec * 1000).toFixed(0)}ms (Needs Improvement)`,
                `LCP of ${lcpSec.toFixed(1)}s is above Google's "Good" threshold (2.5s). Optimizing can improve user experience and rankings.`,
                Math.round(lcpSec * 1000),
                'LCP (ms)',
                ['Preload critical resources', 'Reduce JavaScript execution time', 'Optimize images'],
                5,
                'VITAMIN'
            );
        }
    }
    if (cwvFull.fcp && cwvFull.fcp.rating !== 'good') {
        const fcpSec = cwvFull.fcp.value;
        if (cwvFull.fcp.rating === 'poor') {
            addCwv(
                `FCP is ${(fcpSec * 1000).toFixed(0)}ms (Poor)`,
                `Your FCP is ${fcpSec.toFixed(1)}s — visitors wait over ${Math.ceil(fcpSec)} seconds before seeing any content. Pages feel broken.`,
                Math.round(fcpSec * 1000),
                'FCP (ms)',
                ['Eliminate render-blocking resources', 'Reduce server response time', 'Minimize critical request depth'],
                7,
                'PAINKILLER'
            );
        } else {
            addCwv(
                `FCP is ${(fcpSec * 1000).toFixed(0)}ms (Needs Improvement)`,
                `FCP of ${fcpSec.toFixed(1)}s could be improved. Target under 1.8s for best experience.`,
                Math.round(fcpSec * 1000),
                'FCP (ms)',
                ['Optimize critical rendering path', 'Use browser caching', 'Reduce unused CSS'],
                4,
                'VITAMIN'
            );
        }
    }
    if (cwvFull.cls && cwvFull.cls.rating !== 'good') {
        const cls = cwvFull.cls.value;
        addCwv(
            `CLS is ${cls.toFixed(2)} (${cwvFull.cls.rating === 'poor' ? 'Poor' : 'Needs Improvement'})`,
            cwvFull.cls.rating === 'poor'
                ? `CLS of ${cls.toFixed(2)} causes visible layout jumps. Users may click the wrong button or lose their place.`
                : `CLS of ${cls.toFixed(2)} is above the "Good" threshold (0.1). Reducing layout shifts improves perceived quality.`,
            cls.toFixed(2),
            'CLS',
            ['Add size attributes to images and embeds', 'Reserve space for dynamic content', 'Avoid inserting content above existing content'],
            cwvFull.cls.rating === 'poor' ? 7 : 4,
            cwvFull.cls.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN'
        );
    }
    if (cwvFull.inp && cwvFull.inp.rating !== 'good') {
        const inpMs = cwvFull.inp.value;
        addCwv(
            `INP is ${Math.round(inpMs)}ms (${cwvFull.inp.rating === 'poor' ? 'Poor' : 'Needs Improvement'})`,
            cwvFull.inp.rating === 'poor'
                ? `INP of ${Math.round(inpMs)}ms means clicks and taps feel sluggish. Users may think the site is broken.`
                : `INP of ${Math.round(inpMs)}ms could be improved. Target under 200ms for responsive feel.`,
            Math.round(inpMs),
            'INP (ms)',
            cwvFull.inp.rating === 'poor'
                ? ['Reduce JavaScript execution time', 'Break up long tasks', 'Optimize event handlers']
                : ['Code-split and lazy-load non-critical JS', 'Minimize third-party scripts'],
            cwvFull.inp.rating === 'poor' ? 6 : 4,
            cwvFull.inp.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN'
        );
    }
    if (cwvFull.ttfb && cwvFull.ttfb.rating !== 'good') {
        const ttfbSec = cwvFull.ttfb.value;
        if (cwvFull.ttfb.rating === 'poor') {
            addCwv(
                `TTFB is ${ttfbSec.toFixed(2)}s (Poor)`,
                `TTFB of ${ttfbSec.toFixed(2)}s means the server is slow to respond. All other loading depends on this.`,
                ttfbSec.toFixed(2),
                'TTFB (s)',
                ['Optimize server response', 'Use a CDN', 'Enable HTTP/2', 'Reduce server-side processing'],
                7,
                'PAINKILLER'
            );
        } else {
            addCwv(
                `TTFB is ${ttfbSec.toFixed(2)}s (Needs Improvement)`,
                `TTFB of ${ttfbSec.toFixed(2)}s could be improved. Target under 800ms for best experience.`,
                ttfbSec.toFixed(2),
                'TTFB (s)',
                ['Use a CDN', 'Enable HTTP/2', 'Optimize server-side rendering'],
                4,
                'VITAMIN'
            );
        }
    }
    if (cwvFull.tbt && cwvFull.tbt.rating !== 'good') {
        const tbtMs = cwvFull.tbt.value;
        addCwv(
            `TBT is ${Math.round(tbtMs)}ms (${cwvFull.tbt.rating === 'poor' ? 'Poor' : 'Needs Improvement'})`,
            cwvFull.tbt.rating === 'poor'
                ? `TBT of ${Math.round(tbtMs)}ms indicates heavy main-thread work. Pages feel unresponsive.`
                : `TBT of ${Math.round(tbtMs)}ms could be reduced. Target under 200ms for responsive feel.`,
            Math.round(tbtMs),
            'TBT (ms)',
            ['Split and defer JavaScript', 'Reduce JavaScript execution time', 'Code-split and lazy-load non-critical JS'],
            cwvFull.tbt.rating === 'poor' ? 6 : 4,
            cwvFull.tbt.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN'
        );
    }
    if (cwvFull.totalPageWeightMB != null && cwvFull.totalPageWeightMB > 3) {
        findings.push({
            module: 'website',
            category: 'performance',
            type: 'VITAMIN',
            title: `Total page weight is ${cwvFull.totalPageWeightMB.toFixed(2)} MB`,
            description: `Page loads ${cwvFull.totalPageWeightMB.toFixed(2)} MB of data. Large payloads slow load times, especially on mobile.`,
            evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cwvFull.totalPageWeightMB.toFixed(2), label: 'Page Weight (MB)' })],
            metrics: { ...cwvMetrics, totalPageWeightMB: cwvFull.totalPageWeightMB },
            impactScore: 5,
            confidenceScore: 90,
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Compress images (WebP)', 'Minify CSS/JS', 'Enable GZIP/Brotli', 'Lazy-load below-fold content'],
        });
    }
    if (cwvFull.renderBlockingCount != null && cwvFull.renderBlockingCount > 5) {
        findings.push({
            module: 'website',
            category: 'performance',
            type: 'VITAMIN',
            title: `${cwvFull.renderBlockingCount} render-blocking resources`,
            description: `Render-blocking CSS/JS delays first paint. Consider inlining critical CSS and deferring non-critical scripts.`,
            evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cwvFull.renderBlockingCount, label: 'Render-blocking count' })],
            metrics: { ...cwvMetrics, renderBlockingCount: cwvFull.renderBlockingCount },
            impactScore: 5,
            confidenceScore: 85,
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Inline critical CSS', 'Defer non-critical JavaScript', 'Use async/defer on script tags'],
        });
    }
    return findings;
}

/**
 * Generate findings for Website Module
 */
export function generateWebsiteFindings(data: any): Finding[] {
    const findings: Finding[] = [];
    if (!data || typeof data !== 'object') return findings;

    // Normalize: support both { scores, coreWebVitals, finalUrl } and raw lighthouse format
    let scores = data.scores ?? {};
    let coreWebVitals = data.coreWebVitals ?? {};
    let finalUrl = data.finalUrl ?? data.loadingExperience?.origin_fallback ?? '';

    if (data.lighthouseResult && (!scores.performance || Object.keys(coreWebVitals).length === 0)) {
        const lh = data.lighthouseResult;
        const audits = lh?.audits ?? {};
        scores = scores.performance != null ? scores : {
            performance: lh?.categories?.performance?.score ?? 0,
            accessibility: lh?.categories?.accessibility?.score ?? 0,
            bestPractices: lh?.categories?.['best-practices']?.score ?? 0,
            seo: lh?.categories?.seo?.score ?? 0,
        };
        coreWebVitals = coreWebVitals.lcp != null ? coreWebVitals : {
            lcp: audits['largest-contentful-paint']?.numericValue ?? null,
            fcp: audits['first-contentful-paint']?.numericValue ?? null,
            cls: audits['cumulative-layout-shift']?.numericValue ?? null,
            tbt: audits['total-blocking-time']?.numericValue ?? null,
        };
    }

    const pointer = finalUrl || PSI_POINTER;

    // Build cwvMetrics for score findings (from full or legacy)
    const cwvFull = coreWebVitals?.full as CoreWebVitalsFull | undefined;
    const cwvMetrics = cwvFull
        ? {
            lcp_ms: cwvFull.lcp ? cwvFull.lcp.value * 1000 : null,
            fcp_ms: cwvFull.fcp ? cwvFull.fcp.value * 1000 : null,
            cls_score: cwvFull.cls?.value ?? null,
            tbt_ms: cwvFull.tbt?.value ?? null,
            inp_ms: cwvFull.inp?.value ?? null,
            ttfb_ms: cwvFull.ttfb ? cwvFull.ttfb.value * 1000 : null,
        }
        : {
            lcp_ms: coreWebVitals.lcp ?? null,
            fcp_ms: coreWebVitals.fcp ?? null,
            cls_score: coreWebVitals.cls ?? null,
            tbt_ms: coreWebVitals.tbt ?? null,
        };

    // Use coreWebVitals.full when present (richer CWV + resource findings)
    if (cwvFull) {
        findings.push(...generateCwvFindingsFromFull(cwvFull, pointer));
    } else {
        // Legacy CWV format (ms values)
        if (coreWebVitals.lcp != null) {
            const lcpMs = coreWebVitals.lcp;
            if (lcpMs > CWV_THRESHOLDS.lcp.poor) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'PAINKILLER',
                    title: `LCP is ${Math.round(lcpMs)}ms (Poor)`,
                    description: `Largest Contentful Paint exceeds Google's "Poor" threshold. Users perceive your site as slow.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(lcpMs), label: 'LCP (ms)', raw: { lcp_ms: lcpMs } })],
                    metrics: cwvMetrics,
                    impactScore: 8,
                    confidenceScore: 95,
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Optimize server response', 'Preload LCP image', 'Remove render-blocking resources'],
                });
            } else if (lcpMs > CWV_THRESHOLDS.lcp.good) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'VITAMIN',
                    title: `LCP is ${Math.round(lcpMs)}ms (Needs Improvement)`,
                    description: `LCP could be improved. Target under 2500ms.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(lcpMs), label: 'LCP (ms)', raw: { lcp_ms: lcpMs } })],
                    metrics: cwvMetrics,
                    impactScore: 5,
                    confidenceScore: 90,
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Preload critical resources', 'Reduce JavaScript execution time'],
                });
            }
        }
        if (coreWebVitals.fcp != null) {
            const fcpMs = coreWebVitals.fcp;
            if (fcpMs > CWV_THRESHOLDS.fcp.poor) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'PAINKILLER',
                    title: `FCP is ${Math.round(fcpMs)}ms (Poor)`,
                    description: `First Contentful Paint exceeds 3000ms. Pages take too long to show content.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(fcpMs), label: 'FCP (ms)', raw: { fcp_ms: fcpMs } })],
                    metrics: cwvMetrics,
                    impactScore: 7,
                    confidenceScore: 95,
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Eliminate render-blocking resources', 'Reduce server response time'],
                });
            } else if (fcpMs > CWV_THRESHOLDS.fcp.good) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'VITAMIN',
                    title: `FCP is ${Math.round(fcpMs)}ms (Needs Improvement)`,
                    description: `Target FCP under 1800ms.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(fcpMs), label: 'FCP (ms)', raw: { fcp_ms: fcpMs } })],
                    metrics: cwvMetrics,
                    impactScore: 4,
                    confidenceScore: 90,
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Optimize critical rendering path', 'Use browser caching'],
                });
            }
        }
        if (coreWebVitals.cls != null) {
            const cls = coreWebVitals.cls;
            if (cls > CWV_THRESHOLDS.cls.poor) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'PAINKILLER',
                    title: `CLS is ${cls.toFixed(2)} (Poor)`,
                    description: `Layout shifts frustrate users and hurt conversions.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cls.toFixed(2), label: 'CLS', raw: { cls_score: cls } })],
                    metrics: cwvMetrics,
                    impactScore: 7,
                    confidenceScore: 95,
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Add size attributes to images', 'Reserve space for dynamic content'],
                });
            } else if (cls > CWV_THRESHOLDS.cls.good) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'VITAMIN',
                    title: `CLS is ${cls.toFixed(2)} (Needs Improvement)`,
                    description: `Target CLS under 0.1.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: cls.toFixed(2), label: 'CLS', raw: { cls_score: cls } })],
                    metrics: cwvMetrics,
                    impactScore: 4,
                    confidenceScore: 90,
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Set explicit dimensions on media', 'Prefer transform animations'],
                });
            }
        }
        if (coreWebVitals.tbt != null) {
            const tbtMs = coreWebVitals.tbt;
            if (tbtMs > CWV_THRESHOLDS.tbt.poor) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'PAINKILLER',
                    title: `TBT is ${Math.round(tbtMs)}ms (Poor)`,
                    description: `Total Blocking Time indicates heavy main-thread work. Pages feel unresponsive.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(tbtMs), label: 'TBT (ms)', raw: { tbt_ms: tbtMs } })],
                    metrics: cwvMetrics,
                    impactScore: 6,
                    confidenceScore: 90,
                    effortEstimate: 'HIGH',
                    recommendedFix: ['Split and defer JavaScript', 'Reduce JavaScript execution time'],
                });
            } else if (tbtMs > CWV_THRESHOLDS.tbt.good) {
                findings.push({
                    module: 'website',
                    category: 'performance',
                    type: 'VITAMIN',
                    title: `TBT is ${Math.round(tbtMs)}ms (Needs Improvement)`,
                    description: `Target TBT under 200ms.`,
                    evidence: [createEvidence({ pointer, source: 'pagespeed_v5', type: 'metric', value: Math.round(tbtMs), label: 'TBT (ms)', raw: { tbt_ms: tbtMs } })],
                    metrics: cwvMetrics,
                    impactScore: 4,
                    confidenceScore: 85,
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Code-split and lazy-load non-critical JS'],
                });
            }
        }
    }

    // Schema findings (when schemaAnalysis is present)
    const schemaAnalysis = data.schemaAnalysis as SchemaAnalysis | undefined;
    if (schemaAnalysis) {
        findings.push(...generateSchemaFindingsFromAnalysis(schemaAnalysis, pointer));
    }

    // Conversion findings (when conversionAnalysis is present)
    const conversionAnalysis = data.conversionAnalysis as ConversionDetectionResult | undefined;
    if (conversionAnalysis) {
        findings.push(...generateConversionFindingsFromAnalysis(conversionAnalysis, pointer));
    }

    // Finding 1: Performance Score
    const perfScore = Math.round((scores.performance ?? 0) * 100);
    if (perfScore < 90 && perfScore > 0) {
        findings.push({
            module: 'website',
            category: 'performance',
            type: perfScore < 50 ? 'PAINKILLER' : 'VITAMIN',
            title: `Page speed score is ${perfScore}/100 on mobile`,
            description: perfScore < 50
                ? 'Poor page speed is actively losing you visitors and revenue. Most users abandon slow sites.'
                : 'Page speed could be improved to enhance user experience and SEO rankings.',
            evidence: [createEvidence({ pointer: finalUrl || PSI_POINTER, source: 'pagespeed_v5', type: 'score', value: perfScore, label: 'Performance Score', raw: { score: perfScore } })],
            metrics: { performanceScore: perfScore, ...cwvMetrics },
            impactScore: perfScore < 30 ? 10 : perfScore < 50 ? 8 : perfScore < 70 ? 6 : 4,
            confidenceScore: 10,
            effortEstimate: perfScore < 50 ? 'MEDIUM' : 'LOW',
            recommendedFix: [
                'Optimize images (compress, use WebP)',
                'Minimize CSS and JavaScript',
                'Enable browser caching',
                'Use a CDN for static assets'
            ],
        });
    }

    // Finding 2: SEO Score
    const seoScore = Math.round((scores.seo ?? 0) * 100);
    if (seoScore < 90) {
        findings.push({
            module: 'website',
            category: 'visibility',
            type: 'VITAMIN',
            title: `SEO score is ${seoScore}/100`,
            description: 'Search engines may not be indexing your site optimally.',
            evidence: [createEvidence({ pointer: finalUrl || PSI_POINTER, source: 'pagespeed_v5', type: 'score', value: seoScore, label: 'SEO Score', raw: { score: seoScore } })],
            metrics: { seoScore },
            impactScore: seoScore < 50 ? 7 : 5,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add missing meta descriptions',
                'Ensure all images have alt text',
                'Fix broken links',
                'Improve heading structure'
            ],
        });
    }

    // Finding 3: Accessibility Score
    const a11yScore = Math.round((scores.accessibility ?? 0) * 100);
    if (a11yScore < 90) {
        findings.push({
            module: 'website',
            category: 'trust',
            type: 'VITAMIN',
            title: `Accessibility score is ${a11yScore}/100`,
            description: 'Your site may be difficult to use for people with disabilities, limiting your audience.',
            evidence: [createEvidence({ pointer: finalUrl || PSI_POINTER, source: 'pagespeed_v5', type: 'score', value: a11yScore, label: 'Accessibility Score', raw: { score: a11yScore } })],
            metrics: { accessibilityScore: a11yScore },
            impactScore: 4,
            confidenceScore: 9,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add ARIA labels to interactive elements',
                'Ensure sufficient color contrast',
                'Make site keyboard-navigable'
            ],
        });
    }

    return findings;
}

/**
 * Generate conversion findings from ConversionDetectionResult (legacy path).
 */
function generateConversionFindingsFromAnalysis(
    conversion: ConversionDetectionResult,
    pointer: string
): Finding[] {
    const findings: Finding[] = [];

    if (conversion.score < 70) {
        const criticalCount = conversion.criticalMissing.length;
        const desc = criticalCount > 0
            ? `Conversion readiness score: ${conversion.score}/100. ${conversion.criticalMissing[0]} — ${conversion.recommendations[0] || 'Add key conversion elements.'}`
            : `Conversion readiness score: ${conversion.score}/100. Several conversion elements are missing or below the fold.`;

        findings.push({
            module: 'website',
            category: 'conversion',
            type: criticalCount >= 2 ? 'PAINKILLER' : 'VITAMIN',
            title: `Conversion readiness: ${conversion.score}/100`,
            description: desc,
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
            impactScore: criticalCount >= 2 ? 8 : 6,
            confidenceScore: 90,
            effortEstimate: 'MEDIUM',
            recommendedFix: conversion.recommendations.slice(0, 5),
        });
    }

    if (conversion.criticalMissing.includes('Click-to-call phone number')) {
        findings.push({
            module: 'website',
            category: 'conversion',
            type: 'PAINKILLER',
            title: 'No click-to-call phone number',
            description: 'Mobile visitors can\'t contact you with one tap — that\'s your highest-intent traffic. Add a tel: link in your header or hero.',
            evidence: [createEvidence({ pointer, source: 'conversion_detector', type: 'text', value: 'Missing', label: 'tel: link' })],
            metrics: { element: 'phone' },
            impactScore: 8,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: ['Add <a href="tel:+1234567890">Call Now</a> in header/hero', 'Ensure phone is visible above the fold on mobile'],
        });
    }

    return findings;
}

/** Competitor data shape from competitor module */
interface CompetitorDataForConversion {
    topCompetitors?: Array<{ name: string; website?: string }>;
}

/**
 * Generate conversion findings from ConversionResult (Puppeteer-based module).
 * Frames missing elements as lost revenue. Uses competitor names when available.
 */
export function generateConversionFindings(
    data: ConversionResult['data'],
    pointer: string,
    competitorData?: CompetitorDataForConversion
): Finding[] {
    const findings: Finding[] = [];
    if (!data || typeof data !== 'object') return findings;

    const { score, elements, missing, recommendations } = data;

    if (score < 70) {
        const primaryMissing = missing[0];
        const primaryRec = recommendations[0];
        const desc = primaryMissing && primaryRec
            ? `Conversion readiness: ${score}/100. ${primaryMissing} — ${primaryRec}`
            : `Conversion readiness: ${score}/100. Several conversion elements are missing or below the fold.`;

        findings.push({
            module: 'conversion',
            category: 'conversion',
            type: missing.length >= 2 ? 'PAINKILLER' : 'VITAMIN',
            title: `Conversion readiness: ${score}/100`,
            description: desc,
            evidence: [createEvidence({
                pointer,
                source: 'conversion_module',
                type: 'metric',
                value: score,
                label: 'Conversion Score',
                raw: { score, missing, elements },
            })],
            metrics: {
                conversionScore: score,
                missing,
                ctasAboveFold: elements.ctas.aboveFold,
                hasClickToCall: elements.phone.clickToCall,
                hasContactForm: elements.contactForm.present,
                hasChat: elements.chat.present,
                hasBooking: elements.booking.present,
            },
            impactScore: missing.length >= 2 ? 8 : 6,
            confidenceScore: 90,
            effortEstimate: 'MEDIUM',
            recommendedFix: recommendations.slice(0, 5),
        });
    }

    if (missing.includes('Click-to-call phone link') || (!elements.phone.clickToCall && elements.phone.present)) {
        findings.push({
            module: 'conversion',
            category: 'conversion',
            type: 'PAINKILLER',
            title: 'No click-to-call phone link',
            description: 'Without a click-to-call button, mobile visitors (60% of traffic) can\'t easily reach you. Wrap your phone number in a tel: link.',
            evidence: [createEvidence({ pointer, source: 'conversion_module', type: 'text', value: 'Missing', label: 'tel: link' })],
            metrics: { element: 'phone' },
            impactScore: 8,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add <a href="tel:+1234567890">Call Now</a> in header or hero',
                'Ensure phone is visible above the fold on mobile',
            ],
        });
    }

    if (missing.includes('CTA above the fold') && elements.ctas.count > 0) {
        findings.push({
            module: 'conversion',
            category: 'conversion',
            type: 'VITAMIN',
            title: 'CTA not above the fold',
            description: 'Visitors need a clear next step before they scroll. Move your primary CTA (Book Now, Get Quote, Call) above the fold.',
            evidence: [createEvidence({
                pointer,
                source: 'conversion_module',
                type: 'text',
                value: `${elements.ctas.count} CTAs found, 0 above fold`,
                label: 'CTA placement',
            })],
            metrics: { ctasCount: elements.ctas.count, aboveFold: elements.ctas.aboveFold },
            impactScore: 5,
            confidenceScore: 90,
            effortEstimate: 'LOW',
            recommendedFix: ['Move primary CTA to hero/header', 'Use contrasting button color for visibility'],
        });
    }

    if (missing.includes('Booking/scheduling')) {
        const firstCompetitor = competitorData?.topCompetitors?.[0]?.name;
        const competitorHint = firstCompetitor
            ? `Your competitor ${firstCompetitor} likely has a booking widget — visitors can schedule an appointment in 30 seconds.`
            : '67% of customers prefer to book online vs calling — visitors can schedule an appointment in 30 seconds with a booking widget.';
        findings.push({
            module: 'conversion',
            category: 'conversion',
            type: 'PAINKILLER',
            title: 'No online booking widget',
            description: competitorHint,
            evidence: [createEvidence({ pointer, source: 'conversion_module', type: 'text', value: 'Missing', label: 'booking widget' })],
            metrics: { element: 'booking' },
            impactScore: 7,
            confidenceScore: 90,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add Calendly, Acuity, Square Appointments, or similar',
                'Embed on homepage or /book page',
            ],
        });
    }

    return findings;
}

/**
 * Generate findings from Schema Markup Module result.
 * Schema findings appear in proposals with specific recommendations.
 */
export function generateSchemaMarkupFindings(
    data: SchemaMarkupResult['data'] | { schemasFound?: unknown[]; schemasMissing?: string[]; score?: number; recommendations?: string[] },
    pointer: string
): Finding[] {
    const findings: Finding[] = [];
    if (!data || typeof data !== 'object') return findings;

    const schemasMissing = (data as SchemaMarkupResult['data']).schemasMissing ?? [];
    const score = (data as SchemaMarkupResult['data']).score ?? 0;
    const recommendations = (data as SchemaMarkupResult['data']).recommendations ?? [];
    const schemasFound = (data as SchemaMarkupResult['data']).schemasFound ?? [];

    if (score < 70) {
        const primaryRec = recommendations[0] ?? 'Add structured data (JSON-LD) to help Google understand your business and show rich results.';
        findings.push({
            module: 'schemaMarkup',
            category: 'visibility',
            type: score < 40 ? 'PAINKILLER' : 'VITAMIN',
            title: `Schema markup score: ${score}/100`,
            description: primaryRec,
            evidence: [createEvidence({
                pointer,
                source: 'schema_markup',
                type: 'metric',
                value: score,
                label: 'Schema Score',
                raw: { score, schemasMissing, schemasFound },
            })],
            metrics: {
                schemaMarkupScore: score,
                schemasMissing,
                schemasFoundCount: schemasFound.length,
            },
            impactScore: score < 40 ? 8 : 6,
            confidenceScore: 95,
            effortEstimate: 'MEDIUM',
            recommendedFix: recommendations.length > 0 ? recommendations : [
                'Add LocalBusiness schema with your address, phone, and hours to appear in Google\'s local pack.',
                'Add WebSite schema for sitelinks and search features.',
                'Add BreadcrumbList schema for breadcrumb display in search.',
            ],
        });
    }

    if (schemasMissing.includes('LocalBusiness') && schemasMissing.includes('Organization')) {
        findings.push({
            module: 'schemaMarkup',
            category: 'visibility',
            type: 'PAINKILLER',
            title: 'No LocalBusiness or Organization schema',
            description: "Add LocalBusiness schema with your address, phone, and hours to appear in Google's local pack."
                + " Without it, Google cannot show your business in local search results.",
            evidence: [createEvidence({ pointer, source: 'schema_markup', type: 'text', value: 'Missing', label: 'LocalBusiness/Organization' })],
            metrics: { schemaType: 'LocalBusiness', present: false },
            impactScore: 8,
            confidenceScore: 95,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add JSON-LD to your homepage with @context, @type LocalBusiness, name, url, address (PostalAddress), telephone, openingHours.',
            ],
        });
    }

    if (schemasMissing.includes('WebSite')) {
        findings.push({
            module: 'schemaMarkup',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'No WebSite schema',
            description: 'Add WebSite schema with your site URL and name for sitelinks and search features in Google.',
            evidence: [createEvidence({ pointer, source: 'schema_markup', type: 'text', value: 'Missing', label: 'WebSite' })],
            metrics: { schemaType: 'WebSite', present: false },
            impactScore: 5,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add WebSite JSON-LD with @context, @type WebSite, name, and url.',
            ],
        });
    }

    if (schemasMissing.includes('BreadcrumbList')) {
        findings.push({
            module: 'schemaMarkup',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'No BreadcrumbList schema',
            description: 'Add BreadcrumbList schema to help Google understand your site structure and show breadcrumbs in search.',
            evidence: [createEvidence({ pointer, source: 'schema_markup', type: 'text', value: 'Missing', label: 'BreadcrumbList' })],
            metrics: { schemaType: 'BreadcrumbList', present: false },
            impactScore: 4,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add BreadcrumbList JSON-LD to each page with itemListElement pointing to each breadcrumb level.',
            ],
        });
    }

    const incompleteSchemas = schemasFound.filter(
        (s: { completeness?: number; missingProperties?: string[] }) => (s.completeness ?? 100) < 100 && (s.missingProperties?.length ?? 0) > 0
    );
    for (const s of incompleteSchemas.slice(0, 2)) {
        const schema = s as { type: string; completeness: number; missingProperties: string[] };
        if (schema.missingProperties?.length > 0) {
            findings.push({
                module: 'schemaMarkup',
                category: 'visibility',
                type: 'VITAMIN',
                title: `Incomplete ${schema.type} schema (${schema.completeness}%)`,
                description: `Your ${schema.type} schema is missing: ${schema.missingProperties.join(', ')}. Add these properties for full rich result eligibility.`,
                evidence: [createEvidence({
                    pointer,
                    source: 'schema_markup',
                    type: 'metric',
                    value: schema.completeness,
                    label: `${schema.type} completeness`,
                    raw: { missingProperties: schema.missingProperties },
                })],
                metrics: { schemaType: schema.type, completeness: schema.completeness, missingProperties: schema.missingProperties },
                impactScore: 4,
                confidenceScore: 9,
                effortEstimate: 'LOW',
                recommendedFix: schema.missingProperties.map((p) => `Add "${p}" property to your ${schema.type} schema.`),
            });
        }
    }

    return findings;
}

/**
 * Generate findings from Accessibility Module result.
 * Frame as: legal risk (ADA lawsuits), SEO benefit, UX improvement.
 */
export function generateAccessibilityFindings(
    data: AccessibilityResult['data'] | { score?: number; criticalIssues?: number; issuesByCategory?: unknown; topIssues?: unknown[]; recommendations?: string[] },
    pointer: string
): Finding[] {
    const findings: Finding[] = [];
    if (!data || typeof data !== 'object') return findings;

    const score = (data as AccessibilityResult['data']).score ?? 0;
    const criticalIssues = (data as AccessibilityResult['data']).criticalIssues ?? 0;
    const issuesByCategory = (data as AccessibilityResult['data']).issuesByCategory;
    const recommendations = (data as AccessibilityResult['data']).recommendations ?? [];

    if (score < 70 || criticalIssues > 0) {
        const isLegalRisk = criticalIssues > 0 || score < 50;
        findings.push({
            module: 'accessibility',
            category: 'trust',
            type: isLegalRisk ? 'PAINKILLER' : 'VITAMIN',
            title: `Accessibility score: ${score}/100${criticalIssues > 0 ? ` (${criticalIssues} critical issues)` : ''}`,
            description: isLegalRisk
                ? 'Your website has accessibility barriers that create legal risk under ADA Title III. Businesses face lawsuits of $10,000–$75,000 for inaccessible sites. Fixing these issues also improves SEO (Google rewards accessible sites) and user experience for all visitors.'
                : 'Accessibility issues hurt your SEO and user experience. Google rewards accessible sites. Improving accessibility reduces legal risk and helps users with disabilities.',
            evidence: [createEvidence({
                pointer,
                source: 'accessibility_scan',
                type: 'metric',
                value: score,
                label: 'Accessibility Score',
                raw: { score, criticalIssues, issuesByCategory },
            })],
            metrics: {
                accessibilityScore: score,
                criticalIssues,
                wcagLevel: (data as AccessibilityResult['data']).wcagLevel,
            },
            impactScore: isLegalRisk ? 9 : 6,
            confidenceScore: 95,
            effortEstimate: isLegalRisk ? 'HIGH' : 'MEDIUM',
            recommendedFix: recommendations.slice(0, 6),
        });
    }

    const altData = issuesByCategory?.altText as { percentage?: number; total?: number } | undefined;
    if (altData && (altData.percentage ?? 100) < 100 && (altData.total ?? 0) > 0) {
        const alt = altData as { total: number; withAlt: number; percentage: number };
        findings.push({
            module: 'accessibility',
            category: 'trust',
            type: alt.percentage < 50 ? 'PAINKILLER' : 'VITAMIN',
            title: `Only ${alt.percentage}% of images have alt text`,
            description: 'Screen readers cannot describe images without alt text. This creates an ADA compliance risk and hurts SEO (Google uses alt text for image search).',
            evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'metric', value: alt.percentage, label: 'Alt text coverage %', raw: alt })],
            metrics: { altTextCoverage: alt.percentage, totalImages: alt.total },
            impactScore: alt.percentage < 50 ? 8 : 5,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: ['Add descriptive alt text to every image', 'Use alt="" for decorative images'],
        });
    }

    const headingData = issuesByCategory?.headings as { h1Count?: number; skipLevels?: boolean } | undefined;
    if (headingData) {
        const h = headingData as { h1Count: number; skipLevels: boolean };
        if (h.h1Count !== 1 || h.skipLevels) {
            findings.push({
                module: 'accessibility',
                category: 'visibility',
                type: 'VITAMIN',
                title: h.h1Count !== 1
                    ? `Heading structure issue: ${h.h1Count} H1${h.h1Count === 0 ? ' (missing)' : 's (should be exactly 1)'}`
                    : 'Heading levels skip (e.g. H1 to H3 without H2)',
                description: 'Proper heading structure helps screen readers and improves SEO. Use one H1 per page and logical order (H1→H2→H3).',
                evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'text', value: JSON.stringify(h), label: 'Heading structure' })],
                metrics: { h1Count: h.h1Count, skipLevels: h.skipLevels },
                impactScore: 5,
                confidenceScore: 90,
                effortEstimate: 'LOW',
                recommendedFix: h.h1Count !== 1
                    ? ['Ensure exactly one H1 per page', 'Use H2 for main sections, H3 for subsections']
                    : ['Do not skip heading levels (H1→H2→H3)', 'Use logical hierarchy'],
            });
        }
    }

    const contrastData = issuesByCategory?.contrast as { failCount?: number; worstRatio?: number } | undefined;
    if (contrastData && (contrastData.failCount ?? 0) > 0) {
        const c = contrastData as { failCount: number; worstRatio: number };
        findings.push({
            module: 'accessibility',
            category: 'trust',
            type: c.failCount > 5 ? 'PAINKILLER' : 'VITAMIN',
            title: `${c.failCount} color contrast violations`,
            description: 'Insufficient contrast makes text unreadable for users with visual impairments. WCAG AA requires 4.5:1 for normal text, 3:1 for large text.',
            evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'metric', value: c.failCount, label: 'Contrast violations', raw: c })],
            metrics: { contrastFailCount: c.failCount, worstRatio: c.worstRatio },
            impactScore: c.failCount > 10 ? 7 : 5,
            confidenceScore: 95,
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Aim for 4.5:1 contrast (normal text)', 'Aim for 3:1 (large text)', 'Use a contrast checker tool'],
        });
    }

    const formData = issuesByCategory?.forms as { percentage?: number; totalInputs?: number } | undefined;
    if (formData && (formData.percentage ?? 100) < 100 && (formData.totalInputs ?? 0) > 0) {
        const f = formData as { totalInputs: number; labeled: number; percentage: number };
        findings.push({
            module: 'accessibility',
            category: 'trust',
            type: 'VITAMIN',
            title: `${f.totalInputs - f.labeled} form inputs without labels`,
            description: 'Screen reader users need labels to know what to type. Use <label for="id"> or aria-label.',
            evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'metric', value: f.percentage, label: 'Labeled inputs %' })],
            metrics: { formLabelCoverage: f.percentage },
            impactScore: 6,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: ['Add <label> for every input', 'Use aria-label if visual label is not possible'],
        });
    }

    const linkData = issuesByCategory?.links as { genericCount?: number; examples?: string[] } | undefined;
    if (linkData && (linkData.genericCount ?? 0) > 0) {
        const l = linkData as { genericCount: number; examples: string[] };
        findings.push({
            module: 'accessibility',
            category: 'visibility',
            type: 'VITAMIN',
            title: `${l.genericCount} links with generic text ("click here", "read more")`,
            description: 'Generic link text is unclear for screen reader users and hurts SEO. Use descriptive text that explains the destination.',
            evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'text', value: l.examples?.join(', ') || '', label: 'Examples' })],
            metrics: { genericLinkCount: l.genericCount },
            impactScore: 4,
            confidenceScore: 90,
            effortEstimate: 'LOW',
            recommendedFix: ['Replace "click here" with "Download the report"', 'Replace "read more" with the article title'],
        });
    }

    if (recommendations.some((r) => r.includes('lang='))) {
        findings.push({
            module: 'accessibility',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'Missing language attribute on <html>',
            description: 'Add lang="en" (or appropriate language) to help screen readers and search engines.',
            evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'text', value: 'Missing', label: 'html lang' })],
            metrics: {},
            impactScore: 4,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: ['Add lang="en" to the <html> tag'],
        });
    }
    if (recommendations.some((r) => r.includes('viewport'))) {
        findings.push({
            module: 'accessibility',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'Missing viewport meta tag',
            description: 'Required for mobile accessibility. Without it, pages may not scale properly on small screens.',
            evidence: [createEvidence({ pointer, source: 'accessibility_scan', type: 'text', value: 'Missing', label: 'viewport meta' })],
            metrics: {},
            impactScore: 4,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: ['Add <meta name="viewport" content="width=device-width, initial-scale=1">'],
        });
    }

    return findings;
}

/**
 * Generate findings from Security Module result.
 * Frame as trust signals: padlock, "Not Secure" warning, enterprise-grade headers.
 */
export function generateSecurityFindings(
    data: SecurityResult['data'] | { score?: number; grade?: string; https?: unknown; headers?: unknown[]; mixedContent?: boolean; serverExposed?: boolean; recommendations?: string[] },
    pointer: string
): Finding[] {
    const findings: Finding[] = [];
    if (!data || typeof data !== 'object') return findings;

    const score = (data as SecurityResult['data']).score ?? 0;
    const grade = (data as SecurityResult['data']).grade ?? 'F';
    const httpsData = (data as SecurityResult['data']).https;
    const recommendations = (data as SecurityResult['data']).recommendations ?? [];
    const mixedContent = (data as SecurityResult['data']).mixedContent ?? false;

    if (score < 75) {
        const isCritical = score < 50 || !httpsData?.enabled;
        findings.push({
            module: 'security',
            category: 'trust',
            type: isCritical ? 'PAINKILLER' : 'VITAMIN',
            title: `Security grade: ${grade} (${score}/100)`,
            description: isCritical
                ? "Your visitors see a 'Not Secure' warning or missing security headers. Customers won't enter credit card info on a site that shows 'Not Secure'. Enterprise-grade security headers protect your customers' data and build trust."
                : 'Missing security headers can expose your business to data breaches and legal liability. Visitors see a padlock icon when your site is properly secured.',
            evidence: [createEvidence({
                pointer,
                source: 'security_audit',
                type: 'metric',
                value: score,
                label: 'Security Score',
                raw: { score, grade, https: httpsData },
            })],
            metrics: { securityScore: score, securityGrade: grade },
            impactScore: isCritical ? 9 : 6,
            confidenceScore: 95,
            effortEstimate: isCritical ? 'HIGH' : 'MEDIUM',
            recommendedFix: recommendations.slice(0, 6),
        });
    }

    if (httpsData && !httpsData.enabled) {
        findings.push({
            module: 'security',
            category: 'trust',
            type: 'PAINKILLER',
            title: 'Site not served over HTTPS',
            description: "Your visitors see a 'Not Secure' warning in their browser. Customers won't enter payment or personal info on an unencrypted site.",
            evidence: [createEvidence({ pointer, source: 'security_audit', type: 'text', value: 'HTTP', label: 'Protocol' })],
            metrics: { httpsEnabled: false },
            impactScore: 9,
            confidenceScore: 95,
            effortEstimate: 'HIGH',
            recommendedFix: ['Enable HTTPS with an SSL certificate', 'Redirect all HTTP traffic to HTTPS'],
        });
    }

    if (httpsData?.certificate && !httpsData.certificate.valid && httpsData.enabled) {
        findings.push({
            module: 'security',
            category: 'trust',
            type: 'PAINKILLER',
            title: 'Invalid or expired SSL certificate',
            description: 'Browsers will show a security warning. Visitors may leave before entering your site.',
            evidence: [createEvidence({
                pointer,
                source: 'security_audit',
                type: 'text',
                value: httpsData.certificate.expiresAt || 'Invalid',
                label: 'Certificate status',
            })],
            metrics: { certificateValid: false },
            impactScore: 8,
            confidenceScore: 95,
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Renew your SSL certificate', 'Ensure certificate covers your domain'],
        });
    }

    const missingHeaders = (data as SecurityResult['data']).headers?.filter((h) => h.status === 'missing') ?? [];
    if (missingHeaders.length >= 3 && score < 85) {
        findings.push({
            module: 'security',
            category: 'trust',
            type: 'VITAMIN',
            title: `${missingHeaders.length} security headers missing`,
            description: 'Enterprise-grade security headers protect your customers\' data. Missing headers can expose your business to data breaches and legal liability.',
            evidence: [createEvidence({
                pointer,
                source: 'security_audit',
                type: 'text',
                value: missingHeaders.map((h) => h.name).join(', '),
                label: 'Missing headers',
            })],
            metrics: { missingHeaderCount: missingHeaders.length },
            impactScore: 5,
            confidenceScore: 90,
            effortEstimate: 'MEDIUM',
            recommendedFix: missingHeaders.slice(0, 3).map((h) => h.recommendation),
        });
    }

    if (mixedContent) {
        findings.push({
            module: 'security',
            category: 'trust',
            type: 'VITAMIN',
            title: 'Mixed content detected',
            description: 'Some resources load over HTTP on your HTTPS page. Browsers may block them, breaking your site. Fix for a seamless experience.',
            evidence: [createEvidence({ pointer, source: 'security_audit', type: 'text', value: 'Mixed content', label: 'Issue' })],
            metrics: { mixedContent: true },
            impactScore: 5,
            confidenceScore: 85,
            effortEstimate: 'LOW',
            recommendedFix: ['Update all resource URLs to use https://', 'Check images, scripts, and stylesheets'],
        });
    }

    return findings;
}

/**
 * Compute rough competitor completeness from limited data (photos, hours, reviews, etc.)
 */
function computeCompetitorCompletenessScore(comp: { photosCount?: number; reviewCount?: number; rating?: number; hasHours?: boolean; website?: string; websiteSpeed?: number }): number {
    let score = 0;
    if (comp.photosCount && comp.photosCount >= 10) score += 10;
    else if (comp.photosCount && comp.photosCount >= 5) score += 5;
    else if (comp.photosCount && comp.photosCount >= 1) score += 2;
    if (comp.reviewCount && comp.reviewCount >= 20) score += 10;
    else if (comp.reviewCount && comp.reviewCount >= 10) score += 5;
    else if (comp.reviewCount && comp.reviewCount >= 1) score += 2;
    if (comp.rating && comp.rating >= 4) score += 10;
    else if (comp.rating && comp.rating >= 3.5) score += 5;
    if (comp.hasHours) score += 10;
    if (comp.website || (comp.websiteSpeed != null && comp.websiteSpeed > 0)) score += 5;
    return Math.min(100, score * 2); // Scale to ~100
}

/**
 * Generate GBP completeness findings (free improvements framing).
 * Includes grade, competitor comparison, and actionable recommendations.
 */
export function generateGBPCompletenessFindings(
    completeness: GbpCompletenessResult,
    data: any,
    businessName: string
): Finding[] {
    const findings: Finding[] = [];
    const pointer = data.website || (data.placeId ? `https://www.google.com/maps/place/?q=place_id:${data.placeId}` : PLACES_POINTER);

    if (completeness.overallScore < 70) {
        const missingCount = completeness.breakdown.filter((b) => !b.present).length;
        const gradeText = `Grade: ${completeness.grade}`;
        const compText = completeness.competitorComparison?.length
            ? ` You: ${completeness.competitorComparison[0].you} | Competitor: ${completeness.competitorComparison[0].competitor}`
            : '';
        const quickWinsText = completeness.recommendations.length > 0
            ? ` ${completeness.recommendations[0]}`
            : completeness.quickWins.length > 0
                ? ` ${completeness.quickWins[0]}`
                : '';

        findings.push({
            module: 'gbp',
            category: 'visibility',
            type: completeness.overallScore < 50 ? 'PAINKILLER' : 'VITAMIN',
            title: `Google listing: ${completeness.overallScore}% complete (${gradeText})`,
            description: `Your Google Business Profile has ${missingCount} missing or incomplete sections.${compText}${quickWinsText}`,
            evidence: [createEvidence({
                pointer,
                source: 'gbp_completeness',
                type: 'metric',
                value: completeness.overallScore,
                label: 'GBP Completeness',
                raw: { completeness },
            })],
            metrics: {
                gbpCompletenessScore: completeness.overallScore,
                gbpGrade: completeness.grade,
                breakdown: completeness.breakdown,
                quickWins: completeness.quickWins,
                competitorAvgScore: completeness.competitorAvgScore,
                competitorComparison: completeness.competitorComparison,
            },
            impactScore: completeness.overallScore < 40 ? 8 : 6,
            confidenceScore: 95,
            effortEstimate: 'LOW',
            recommendedFix: completeness.recommendations.length > 0
                ? completeness.recommendations
                : completeness.quickWins.length > 0
                    ? completeness.quickWins
                    : completeness.breakdown.filter((b) => !b.present).slice(0, 5).map((b) => b.recommendation!).filter(Boolean),
        });
    }

    return findings;
}

/**
 * Generate findings for GBP Module
 * @param competitorData - Optional competitor module data for competitorAvgScore
 */
export function generateGBPFindings(data: any, businessName: string, competitorData?: { topCompetitors?: Array<{ photosCount?: number; reviewCount?: number; rating?: number; hasHours?: boolean; website?: string }> }): Finding[] {
    const findings: Finding[] = [];
    const { rating, reviewCount, website, photos, openingHours, placeId } = data;
    const gbpPointer = website || (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : PLACES_POINTER);

    // Finding 1: Low Rating or Review Count
    if (rating < 4.0 || reviewCount < 10) {
        const impact = rating < 3.5 ? 9 : rating < 4.0 ? 7 : reviewCount < 10 ? 7 : 5;
        findings.push({
            module: 'gbp',
            category: 'trust',
            type: 'PAINKILLER',
            title: `GBP rating is ${rating}/5 with ${reviewCount} reviews`,
            description: rating < 4.0
                ? 'Low ratings directly hurt customer trust. Most people won\'t call a business rated below 4.0.'
                : 'You need more reviews to build credibility. Competitors with 25+ reviews will outrank you.',
            evidence: [createEvidence({ pointer: gbpPointer, source: 'places_api_v1', type: 'metric', value: rating, label: 'Rating', raw: { rating, reviewCount } })],
            metrics: { rating, reviewCount },
            impactScore: impact,
            confidenceScore: 10,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Ask satisfied customers to leave reviews',
                'Respond to all existing reviews',
                'Address negative feedback professionally'
            ],
        });
    }

    // Finding 2: No Website Linked
    if (!website) {
        findings.push({
            module: 'gbp',
            category: 'conversion',
            type: 'PAINKILLER',
            title: 'No website linked in Google Business Profile',
            description: 'Customers searching for you on Google can\'t find your website, losing you potential business.',
            evidence: [createEvidence({ pointer: gbpPointer, source: 'places_api_v1', type: 'metric', value: 'none', label: 'Website', raw: { website: null } })],
            metrics: { hasWebsite: false },
            impactScore: 8,
            confidenceScore: 10,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add your website URL to your GBP listing',
                'If you don\'t have a website, create a simple one-page site'
            ],
        });
    }

    // Finding 3: Low Photo Count
    const photoCount = data.photoCount ?? photos?.length ?? 0;
    if (photoCount < 10) {
        findings.push({
            module: 'gbp',
            category: 'visibility',
            type: 'VITAMIN',
            title: `Only ${photoCount} photos on GBP (recommend 10+)`,
            description: 'Businesses with more photos get more clicks and calls from Google Search.',
            evidence: [createEvidence({ pointer: gbpPointer, source: 'places_api_v1', type: 'metric', value: photoCount, label: 'Photo Count', raw: { photoCount } })],
            metrics: { photoCount },
            impactScore: photoCount === 0 ? 7 : photoCount < 5 ? 5 : 3,
            confidenceScore: 8,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Upload high-quality photos of your business, products, and team',
                'Add photos monthly to keep your profile fresh'
            ],
        });
    }

    // Finding 4: Missing Hours
    if (!openingHours) {
        findings.push({
            module: 'gbp',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'Business hours not set on Google',
            description: 'Customers can\'t see when you\'re open, which may cause them to choose a competitor instead.',
            evidence: [createEvidence({ pointer: gbpPointer, source: 'places_api_v1', type: 'metric', value: 0, label: 'Opening Hours', raw: { hasHours: false } })],
            metrics: { hasHours: false },
            impactScore: 6,
            confidenceScore: 10,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Set your business hours in Google Business Profile',
                'Mark special hours for holidays'
            ],
        });
    }

    // GBP Completeness findings (free improvements)
    const competitorScores = competitorData?.topCompetitors
        ?.map((c) => computeCompetitorCompletenessScore(c))
        .filter((s) => s > 0);
    const competitorGbpData: CompetitorGbpData[] | undefined = competitorData?.topCompetitors?.map((c: any) => ({
        name: c.name,
        reviewCount: c.reviews ?? c.reviewCount,
        rating: c.rating,
        photosCount: c.photosCount,
        hasHours: c.hasHours,
    }));
    const completeness = computeGbpCompleteness(data, competitorScores, competitorGbpData);
    findings.push(...generateGBPCompletenessFindings(completeness, data, businessName));

    return findings;
}

/**
 * Generate findings for Competitor Module
 */
export function generateCompetitorFindings(data: any, businessName: string): Finding[] {
    const findings: Finding[] = [];
    const { topCompetitors, keyword, location, comparisonMatrix } = data;

    const serpQuery = [keyword, location].filter(Boolean).join(' ');
    const serpPointer = serpQuery ? `https://serpapi.com/search?q=${encodeURIComponent(serpQuery)}` : SERPAPI_POINTER;

    if (!topCompetitors || topCompetitors.length === 0) {
        // No local pack results - this itself is a finding
        findings.push({
            module: 'competitor',
            category: 'visibility',
            type: 'PAINKILLER',
            title: `Not appearing in local search for "${keyword}"`,
            description: 'You don\'t show up when people search for your services in your area. Competitors are getting all the clicks.',
            evidence: [createEvidence({ pointer: serpPointer, source: 'serpapi_v1', type: 'metric', value: 'not_found', label: 'Local Pack', raw: { keyword, location, found: false } })],
            metrics: { inLocalPack: false },
            impactScore: 8,
            confidenceScore: 7,
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Optimize your Google Business Profile',
                'Get more reviews',
                'Add location keywords to your website'
            ],
        });
        return findings;
    }

    // New Logic using Comparison Matrix
    if (comparisonMatrix && comparisonMatrix.gaps) {
        const gaps = comparisonMatrix.gaps;

        // 1. Review Gap (PAINKILLER)
        const reviewGap = gaps.find((g: any) => g.metric === 'reviews');
        if (reviewGap && reviewGap.gap < -30) {
            findings.push({
                module: 'competitor',
                category: 'trust',
                type: 'PAINKILLER',
                title: `Competitors have ${Math.abs(reviewGap.gap)} more reviews on average`,
                description: `You have ${reviewGap.businessValue} reviews while top competitors average ${reviewGap.competitorAvg}. This social proof gap is costing you customers.`,
                metrics: { reviewGap: reviewGap.gap },
                impactScore: 8,
                confidenceScore: 9,
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Launch a systematic review request campaign',
                    'Automate review requests after service',
                    'Respond to all reviews to encourage more'
                ],
                evidence: [createEvidence({ pointer: SERPAPI_POINTER, source: 'serpapi_v1', type: 'metric', value: reviewGap.gap, label: 'Review Gap', raw: { gap: reviewGap.gap, competitorAvg: reviewGap.competitorAvg, matrix: comparisonMatrix } })],
            });
        }

        // 2. Rating Gap (PAINKILLER)
        const ratingGap = gaps.find((g: any) => g.metric === 'rating');
        if (ratingGap && ratingGap.gap <= -0.5) {
            // Only attach matrix to the first one if not already attached? 
            // Actually, attaching to all is fine, purely data.
            findings.push({
                module: 'competitor',
                category: 'trust',
                type: 'PAINKILLER',
                title: `Rated ${Math.abs(ratingGap.gap).toFixed(1)} stars lower than competitors`,
                description: `Your rating is ${ratingGap.businessValue} vs competitor average of ${ratingGap.competitorAvg}. Customers filter by highest rated.`,
                evidence: [createEvidence({ pointer: SERPAPI_POINTER, source: 'serpapi_v1', type: 'metric', value: ratingGap.gap, label: 'Rating Gap', raw: { gap: ratingGap.gap, competitorAvg: ratingGap.competitorAvg, matrix: comparisonMatrix } })],
                metrics: { ratingGap: ratingGap.gap },
                impactScore: 7,
                confidenceScore: 9,
                effortEstimate: 'HIGH',
                recommendedFix: [
                    'Address root causes of negative feedback',
                    'Improve service quality',
                    'Proactively ask happy customers for 5-star reviews'
                ]
            });
        }

        // 3. Website Speed Gap (VITAMIN)
        const speedGap = gaps.find((g: any) => g.metric === 'speed');
        if (speedGap && speedGap.gap < -10) { // arbitrary threshold, if we are >10 points slower
            findings.push({
                module: 'competitor',
                category: 'performance',
                type: 'VITAMIN',
                title: 'Website is slower than competitors',
                description: `Your mobile speed score is ${speedGap.businessValue} while competitors average ${speedGap.competitorAvg}. Speed impacts ranking and conversion.`,
                evidence: [createEvidence({ pointer: SERPAPI_POINTER, source: 'serpapi_v1', type: 'metric', value: speedGap.gap, label: 'Speed Gap', raw: { gap: speedGap.gap, competitorAvg: speedGap.competitorAvg } })],
                metrics: { speedGap: speedGap.gap },
                impactScore: 5,
                confidenceScore: 8,
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Optimize images',
                    'Minify code',
                    'Use better hosting'
                ]
            });
        }

        // 4. Photo Gap (VITAMIN)
        const photoGap = gaps.find((g: any) => g.metric === 'photos');
        if (photoGap && photoGap.gap < -5) {
            findings.push({
                module: 'competitor',
                category: 'visibility',
                type: 'VITAMIN',
                title: `Competitors have ${Math.abs(photoGap.gap)} more photos`,
                description: `Visuals sell. You have ${photoGap.businessValue} photos vs competitor average of ${photoGap.competitorAvg}.`,
                evidence: [createEvidence({ pointer: SERPAPI_POINTER, source: 'serpapi_v1', type: 'metric', value: photoGap.gap, label: 'Photo Gap', raw: { gap: photoGap.gap, competitorAvg: photoGap.competitorAvg } })],
                metrics: { photoGap: photoGap.gap },
                impactScore: 4,
                confidenceScore: 7,
                effortEstimate: 'LOW',
                recommendedFix: [
                    'Upload high-quality team and project photos',
                    'Add photos weekly'
                ]
            });
        }

        // ONE catch-all if no specific gaps found but we still want to show "Competitor Analysis"?
        // Usually we only show Findings (issues).
        // If we want to show a "Good Job" finding? Not for now.
    } else {
        // Fallback to legacy logic (Review Count only) if matrix fails
        const avgCompetitorReviews = topCompetitors.reduce((sum: number, c: any) => sum + (c.reviews || 0), 0) / topCompetitors.length;
        // ... (legacy check logic if needed, but the Loop above covers it if matrix exists)
        // If comparisonMatrix is missing, we can run simple review check
        findings.push({
            module: 'competitor',
            category: 'trust',
            type: 'PAINKILLER',
            title: `Top competitors average ${Math.round(avgCompetitorReviews)} reviews`,
            description: 'Your competitors have more social proof. To compete, you need to close the review gap.',
            evidence: topCompetitors.slice(0, 3).map((c: any) => createEvidence({
                pointer: c.website || c.link || SERPAPI_POINTER,
                source: 'serpapi_v1',
                type: 'metric',
                value: c.reviews ?? 0,
                label: c.name,
                raw: { name: c.name, reviews: c.reviews, rating: c.rating, position: c.position }
            })),
            metrics: { competitorAvgReviews: avgCompetitorReviews },
            impactScore: avgCompetitorReviews > 50 ? 8 : avgCompetitorReviews > 20 ? 6 : 4,
            confidenceScore: 8,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Launch a systematic review request campaign',
                'Follow up with every satisfied customer',
                'Make leaving a review as easy as possible (QR codes, links)'
            ],
        });
    }

    return findings;
}

/**
 * Generate findings for Reputation Module
 */
export function generateReputationFindings(data: any): Finding[] {
    const findings: Finding[] = [];

    // Skip if module was skipped (no reviews)
    if (data.skipped) {
        return findings;
    }

    const { summary, reviews, negativeThemesSummary } = data;
    const { negativeRatio, responseRate, avgRating, reviewCount, commonThemes, oldestReviewMonths } = summary;

    // Finding 1: High negative review ratio (>30%)
    if (negativeRatio > 0.3) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'PAINKILLER',
            title: `${Math.round(negativeRatio * 100)}% of recent reviews are negative`,
            description: negativeThemesSummary || 'A high percentage of negative reviews is actively hurting your business reputation and driving away potential customers.',
            evidence: reviews.filter((r: any) => r.sentiment === 'negative').slice(0, 3).map((r: any) => createEvidence({
                pointer: GOOGLE_REVIEWS_POINTER,
                source: 'google_reviews',
                type: 'review',
                value: r.rating,
                label: r.text?.substring(0, 80) || 'Review',
                raw: { text: r.text, rating: r.rating }
            })),
            metrics: { negativeRatio, avgRating, reviewCount },
            impactScore: 8,
            confidenceScore: 9,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Address the root causes mentioned in negative reviews',
                'Respond professionally to every negative review',
                'Follow up with unhappy customers to resolve issues',
                'Implement service improvements based on feedback patterns',
            ],
        });
    }

    // Finding 2: No owner responses to reviews
    if (responseRate === 0 && reviewCount > 0) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'PAINKILLER',
            title: 'No owner responses to any Google reviews',
            description: 'Responding to reviews shows you care about customer feedback. Unanswered reviews make your business look unresponsive.',
            evidence: [createEvidence({ pointer: GOOGLE_REVIEWS_POINTER, source: 'google_reviews', type: 'metric', value: 0, label: 'Response Rate', raw: { responseRate: 0, reviewCount } })],
            metrics: { responseRate, reviewCount },
            impactScore: 7,
            confidenceScore: 10,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Respond to all existing reviews within the next week',
                'Thank positive reviewers and invite them back',
                'Address concerns raised in negative reviews professionally',
                'Set up notifications for new reviews',
            ],
        });
    }

    // Finding 3: Common complaint theme (appears in 3+ reviews)
    const negativeReviews = reviews.filter((r: any) => r.sentiment === 'negative');
    if (negativeReviews.length >= 3 && negativeThemesSummary) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'VITAMIN',
            title: `Recurring complaint pattern: ${negativeThemesSummary.substring(0, 50)}...`,
            description: 'Multiple customers are mentioning similar issues. This indicates a systemic problem that needs to be addressed.',
            evidence: negativeReviews.slice(0, 3).map((r: any) => createEvidence({
                pointer: GOOGLE_REVIEWS_POINTER,
                source: 'google_reviews',
                type: 'review',
                value: r.rating,
                label: negativeThemesSummary?.substring(0, 50) || 'Review',
                raw: { text: r.text, themes: r.themes }
            })),
            metrics: { commonThemes, negativeCount: negativeReviews.length },
            impactScore: 6,
            confidenceScore: 8,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Investigate the root cause of the recurring issue',
                'Implement process improvements',
                'Train staff if service-related',
                'Communicate changes to customers',
            ],
        });
    }

    // Finding 4: No recent reviews (oldest review >6 months suggests low activity)
    if (oldestReviewMonths >= 6 && reviewCount <= 5) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'VITAMIN',
            title: 'Low review activity in the past 6+ months',
            description: 'Fresh reviews signal an active business. Stale review profiles may make potential customers question if you\'re still operating.',
            evidence: [createEvidence({ pointer: GOOGLE_REVIEWS_POINTER, source: 'google_reviews', type: 'metric', value: oldestReviewMonths, label: 'Oldest Review (months)', raw: { oldestReviewMonths, reviewCount } })],
            metrics: { oldestReviewMonths, reviewCount },
            impactScore: 5,
            confidenceScore: 7,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Launch a review request campaign',
                'Ask recent customers to share their experience',
                'Add review request cards or QR codes to your service flow',
            ],
        });
    }

    // Finding 5: Low response rate to negative reviews (<50%)
    const negativeWithResponse = negativeReviews.filter((r: any) => r.hasOwnerResponse).length;
    const negativeResponseRate = negativeReviews.length > 0 ? negativeWithResponse / negativeReviews.length : 1;
    if (negativeReviews.length >= 2 && negativeResponseRate < 0.5) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'VITAMIN',
            title: `Only ${Math.round(negativeResponseRate * 100)}% of negative reviews have owner responses`,
            description: 'Responding to negative reviews is critical for reputation recovery. It shows potential customers you take feedback seriously.',
            evidence: negativeReviews.filter((r: any) => !r.hasOwnerResponse).slice(0, 2).map((r: any) => createEvidence({
                pointer: GOOGLE_REVIEWS_POINTER,
                source: 'google_reviews',
                type: 'review',
                value: r.rating,
                label: r.text?.substring(0, 80) || 'Review',
                raw: { text: r.text, rating: r.rating }
            })),
            metrics: { negativeResponseRate, negativeCount: negativeReviews.length },
            impactScore: 5,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Respond to all unanswered negative reviews',
                'Acknowledge the issue and offer to make it right',
                'Provide contact info for offline resolution',
            ],
        });
    }

    return findings;
}

/**
 * Generate findings for SEO Deep Module
 */
export function generateSEOFindings(data: any): Finding[] {
    const findings: Finding[] = [];
    const { url, metaTitle, metaDesc, h1Count, hasSchema, hasMobileViewport, imagesMissingAlt, hasRobotsTxt, hasSitemap, organicRank, inTop10 } = data;
    const pointer = url || 'https://';

    if (!metaTitle || metaTitle.length < 30) {
        findings.push({
            module: 'seo',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'Missing or short meta title',
            description: 'Meta titles under 30 characters may be truncated in search results.',
            evidence: [createEvidence({ pointer, source: 'seo_deep', type: 'metric', value: metaTitle?.length || 0, label: 'Title length', raw: { metaTitle } })],
            metrics: { metaTitleLength: metaTitle?.length || 0 },
            impactScore: 5,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: ['Add a descriptive meta title between 30-60 characters'],
        });
    }
    if (!metaDesc || metaDesc.length < 120) {
        findings.push({
            module: 'seo',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'Missing or short meta description',
            description: 'Meta descriptions help search engines and users understand your page.',
            evidence: [createEvidence({ pointer, source: 'seo_deep', type: 'metric', value: metaDesc?.length || 0, label: 'Desc length', raw: { metaDesc } })],
            metrics: { metaDescLength: metaDesc?.length || 0 },
            impactScore: 4,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: ['Add a meta description between 120-160 characters'],
        });
    }
    if (organicRank != null && organicRank > 10) {
        findings.push({
            module: 'seo',
            category: 'visibility',
            type: 'PAINKILLER',
            title: `Ranking #${organicRank} for brand search`,
            description: 'Your site is not in the top 10 for your brand name.',
            evidence: [createEvidence({ pointer, source: 'serpapi_v1', type: 'metric', value: organicRank, label: 'Rank', raw: { organicRank } })],
            metrics: { organicRank },
            impactScore: 7,
            confidenceScore: 8,
            effortEstimate: 'HIGH',
            recommendedFix: ['Improve on-page SEO', 'Build local citations', 'Optimize GBP'],
        });
    }
    if (imagesMissingAlt > 0) {
        findings.push({
            module: 'seo',
            category: 'visibility',
            type: 'VITAMIN',
            title: `${imagesMissingAlt} images missing alt text`,
            description: 'Alt text helps search engines and accessibility.',
            evidence: [createEvidence({ pointer, source: 'seo_deep', type: 'metric', value: imagesMissingAlt, label: 'Images missing alt', raw: { imagesMissingAlt } })],
            metrics: { imagesMissingAlt },
            impactScore: 3,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: ['Add descriptive alt text to all images'],
        });
    }
    return findings;
}

/**
 * Generate findings for Social Media Module
 */
export function generateSocialFindings(data: any): Finding[] {
    const findings: Finding[] = [];

    // Skip if module was skipped (no URL or fetch failed)
    if (data.skipped) {
        return findings;
    }

    const { platformsFound, platformsMissing, totalCount, websiteUrl } = data;
    const socialPointer = websiteUrl || 'https://';

    // Finding 1: No social media links found (PAINKILLER)
    if (totalCount === 0) {
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'PAINKILLER',
            title: 'No social media links found on website',
            description: 'Your website has no links to social media profiles. Customers expect to find you on social platforms to see reviews, photos, and updates.',
            evidence: [createEvidence({ pointer: socialPointer, source: 'website_html', type: 'metric', value: 0, label: 'Platforms Found', raw: { platformsFound: 0 } })],
            metrics: { platforms_found: [], platforms_missing: platformsMissing, total_count: 0 },
            impactScore: 7,
            confidenceScore: 7,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Create business profiles on Facebook and Instagram (minimum)',
                'Add social media icons/links to your website footer',
                'Post regularly to build an active presence',
            ],
        });
        return findings;
    }

    // Finding 2: Missing major platform (no Facebook OR no Instagram) - VITAMIN
    const hasFacebook = platformsFound.includes('facebook');
    const hasInstagram = platformsFound.includes('instagram');

    if (!hasFacebook || !hasInstagram) {
        const missingPlatform = !hasFacebook ? 'Facebook' : 'Instagram';
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'VITAMIN',
            title: `Missing ${missingPlatform} presence`,
            description: `${missingPlatform} is one of the most-used platforms for local businesses. Your competitors are likely active there.`,
            evidence: [createEvidence({ pointer: socialPointer, source: 'website_html', type: 'metric', value: totalCount, label: 'Platforms', raw: { platformsFound, platformsMissing } })],
            metrics: { platforms_found: platformsFound, platforms_missing: platformsMissing, total_count: totalCount },
            impactScore: 5,
            confidenceScore: 7,
            effortEstimate: 'LOW',
            recommendedFix: [
                `Create a ${missingPlatform} business page`,
                'Cross-promote your existing social profiles',
                'Add the new profile link to your website',
            ],
        });
    }

    // Finding 3: Has social links but fewer than 3 platforms - VITAMIN
    if (totalCount > 0 && totalCount < 3) {
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'VITAMIN',
            title: `Only ${totalCount} social platform${totalCount === 1 ? '' : 's'} linked`,
            description: 'Most successful local businesses maintain 3-4 active social profiles (Facebook, Instagram, LinkedIn, Google).',
            evidence: [createEvidence({ pointer: socialPointer, source: 'website_html', type: 'metric', value: totalCount, label: 'Platforms', raw: { platformsFound } })],
            metrics: { platforms_found: platformsFound, platforms_missing: platformsMissing, total_count: totalCount },
            impactScore: 4,
            confidenceScore: 7,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Identify which platforms your target customers use',
                'Create profiles on 1-2 additional platforms',
                'Focus on consistency over quantity (post regularly on a few rather than sporadically on many)',
            ],
        });
    }

    // Finding 4: Has social links (3+) - VITAMIN (positive finding, low impact)
    if (totalCount >= 3) {
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'VITAMIN',
            title: `${totalCount} social platforms linked on website`,
            description: 'Good social presence foundation. Make sure these profiles are active with regular posts and engagement.',
            evidence: [createEvidence({ pointer: socialPointer, source: 'website_html', type: 'metric', value: totalCount, label: 'Platforms', raw: { platformsFound } })],
            metrics: { platforms_found: platformsFound, platforms_missing: platformsMissing, total_count: totalCount },
            impactScore: 2,
            confidenceScore: 6,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Ensure all linked profiles are active (posted in last 30 days)',
                'Respond to comments and messages promptly',
                'Cross-post content to maximize reach',
            ],
        });
    }

    return findings;
}
