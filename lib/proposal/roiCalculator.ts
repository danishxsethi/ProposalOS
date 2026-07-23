import { Finding } from '@prisma/client';

/**
 * Industry benchmarks for ROI calculations
 * avgOrderValue: $ per conversion
 * conversionRate: 0-1 (e.g. 0.03 = 3%)
 * citation: Industry data source for defensible ROI claims
 */
export const INDUSTRY_ROI_BENCHMARKS: Record<string, {
    avgOrderValue: number;
    conversionRate: number;
    targetBounceRate: number; // Industry benchmark after optimization (0-1)
    citation: string;
    contextHint: string; // Business-context tie-in for ROI narrative
}> = {
    dentist: { avgOrderValue: 200, conversionRate: 0.03, targetBounceRate: 0.35, citation: 'Google/Deloitte 2023', contextHint: 'appointment bookings' },
    dental: { avgOrderValue: 200, conversionRate: 0.03, targetBounceRate: 0.35, citation: 'Google/Deloitte 2023', contextHint: 'appointment bookings' },
    restaurant: { avgOrderValue: 35, conversionRate: 0.05, targetBounceRate: 0.40, citation: 'Google 2022', contextHint: 'online orders and reservations' },
    hvac: { avgOrderValue: 350, conversionRate: 0.025, targetBounceRate: 0.38, citation: 'Think With Google 2023', contextHint: 'service call requests' },
    plumber: { avgOrderValue: 350, conversionRate: 0.025, targetBounceRate: 0.38, citation: 'Think With Google 2023', contextHint: 'emergency service calls' },
    plumbing: { avgOrderValue: 350, conversionRate: 0.025, targetBounceRate: 0.38, citation: 'Think With Google 2023', contextHint: 'emergency service calls' },
    lawyer: { avgOrderValue: 2000, conversionRate: 0.015, targetBounceRate: 0.45, citation: 'Clio 2023', contextHint: 'consultation requests' },
    legal: { avgOrderValue: 2000, conversionRate: 0.015, targetBounceRate: 0.45, citation: 'Clio 2023', contextHint: 'consultation requests' },
    real_estate: { avgOrderValue: 8000, conversionRate: 0.01, targetBounceRate: 0.50, citation: 'NAR 2023', contextHint: 'listing inquiries and showings' },
    salon: { avgOrderValue: 85, conversionRate: 0.04, targetBounceRate: 0.38, citation: 'Square 2023', contextHint: 'appointment bookings' },
    spa: { avgOrderValue: 85, conversionRate: 0.04, targetBounceRate: 0.38, citation: 'Square 2023', contextHint: 'appointment bookings' },
    gym: { avgOrderValue: 50, conversionRate: 0.03, targetBounceRate: 0.40, citation: 'Google 2022', contextHint: 'membership signups' },
    fitness: { avgOrderValue: 50, conversionRate: 0.03, targetBounceRate: 0.40, citation: 'Google 2022', contextHint: 'membership signups' },
    vet: { avgOrderValue: 150, conversionRate: 0.03, targetBounceRate: 0.35, citation: 'Google 2022', contextHint: 'appointment bookings' },
    contractor: { avgOrderValue: 5000, conversionRate: 0.015, targetBounceRate: 0.45, citation: 'HomeAdvisor 2023', contextHint: 'project quote requests' },
    construction: { avgOrderValue: 5000, conversionRate: 0.015, targetBounceRate: 0.45, citation: 'HomeAdvisor 2023', contextHint: 'project quote requests' },
    retail: { avgOrderValue: 45, conversionRate: 0.04, targetBounceRate: 0.40, citation: 'Google/Deloitte 2023', contextHint: 'online purchases' },
    default: { avgOrderValue: 150, conversionRate: 0.03, targetBounceRate: 0.40, citation: 'Google/Deloitte 2023', contextHint: 'online conversions' },
};

/**
 * Google's bounce rate data by load time (seconds)
 * 1-3s = 32% bounce, 3-5s = 90% increase, 5-10s = 123% increase
 */
function getBounceRateFromLoadTime(loadTimeSeconds: number): number {
    if (loadTimeSeconds <= 1) return 0.20;
    if (loadTimeSeconds <= 3) return 0.32;
    if (loadTimeSeconds <= 5) return 0.32 * 1.9; // 90% increase
    if (loadTimeSeconds <= 10) return 0.32 * 2.23; // 123% increase
    return 0.85; // 10s+ very high bounce
}

/**
 * Map PageSpeed score (0-100) to approximate load time in seconds
 */
function pageSpeedToLoadTime(score: number): number {
    if (score >= 90) return 1.5;
    if (score >= 70) return 2.5;
    if (score >= 50) return 3.5;
    if (score >= 30) return 6;
    if (score >= 10) return 8;
    return 10;
}

/**
 * Extract audit-level metrics from findings for ROI calculation
 */
export function extractAuditMetrics(findings: Finding[]): {
    performanceScore: number | null;
    lcpMs: number | null;
    reviewCount: number | null;
    rating: number | null;
} {
    let performanceScore: number | null = null;
    let lcpMs: number | null = null;
    let reviewCount: number | null = null;
    let rating: number | null = null;

    for (const f of findings) {
        const m = f.metrics as Record<string, unknown> | null;
        if (!m || typeof m !== 'object') continue;

        if (typeof m.performanceScore === 'number') performanceScore = m.performanceScore;
        if (typeof m.lcp_ms === 'number') lcpMs = m.lcp_ms;
        if (typeof m.reviewCount === 'number') reviewCount = m.reviewCount;
        if (typeof m.rating === 'number') rating = m.rating;
    }

    return { performanceScore, lcpMs, reviewCount, rating };
}

/**
 * Estimate monthly visitors using review count or industry baseline
 * Formula: review_count * 150 for local businesses (rough baseline)
 */
export function estimateMonthlyVisitors(
    findings: Finding[],
    industry: string = 'default'
): { visitors: number; source: string } {
    const { reviewCount } = extractAuditMetrics(findings);

    if (reviewCount != null && reviewCount > 0) {
        const visitors = Math.round(reviewCount * 150);
        return { visitors: Math.max(visitors, 100), source: `review_count * 150 (${reviewCount} reviews)` };
    }

    // Fallback: industry averages (conservative)
    const industryBaselines: Record<string, number> = {
        dentist: 450, restaurant: 750, hvac: 300, plumber: 300, lawyer: 225,
        real_estate: 525, salon: 600, gym: 550, vet: 450, contractor: 225, retail: 900,
    };
    const normalized = industry.toLowerCase().replace(/\s+/g, '_');
    const visitors = industryBaselines[normalized] || 300;
    return { visitors, source: `industry baseline (${industry || 'general'})` };
}

/**
 * Calculate bounce-rate-based lost revenue
 */
export function calculateBounceRateImpact(
    findings: Finding[],
    industry: string = 'default'
): {
    estimatedMonthlyVisitors: number;
    currentBounceRate: number;
    targetBounceRate: number;
    lostVisitors: number;
    lostConversions: number;
    lostRevenueMonthly: number;
    methodology: string;
} {
    const { performanceScore, lcpMs } = extractAuditMetrics(findings);
    const benchmarks = INDUSTRY_ROI_BENCHMARKS[industry?.toLowerCase()] || INDUSTRY_ROI_BENCHMARKS.default;
    const { visitors, source } = estimateMonthlyVisitors(findings, industry);

    // Derive load time: prefer LCP (ms->s), else PageSpeed score
    let loadTimeSeconds: number;
    if (lcpMs != null && lcpMs > 0) {
        loadTimeSeconds = lcpMs / 1000;
    } else if (performanceScore != null) {
        loadTimeSeconds = pageSpeedToLoadTime(performanceScore);
    } else {
        loadTimeSeconds = 5; // Conservative default
    }

    const currentBounceRate = getBounceRateFromLoadTime(loadTimeSeconds);
    const targetBounceRate = benchmarks.targetBounceRate;
    const bounceReduction = Math.max(0, currentBounceRate - targetBounceRate);
    const lostVisitors = Math.round(visitors * bounceReduction);
    const lostConversions = Math.round(lostVisitors * benchmarks.conversionRate);
    const lostRevenueMonthly = Math.round(lostConversions * benchmarks.avgOrderValue);

    const methodology = `Improving mobile speed from ${loadTimeSeconds.toFixed(1)}s to <2s typically increases conversions by 15-20% (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}. Traffic: ${source}. Load ~${loadTimeSeconds.toFixed(1)}s (${lcpMs ? `LCP ${lcpMs}ms` : `PageSpeed ${performanceScore}`}). Bounce: ${(currentBounceRate * 100).toFixed(0)}% current vs ${(targetBounceRate * 100).toFixed(0)}% target.`;

    return {
        estimatedMonthlyVisitors: visitors,
        currentBounceRate,
        targetBounceRate,
        lostVisitors,
        lostConversions,
        lostRevenueMonthly,
        methodology,
    };
}

export interface RoiEstimation {
    monthlyValue: number;
    confidence: 'high' | 'medium' | 'low';
    methodology: string;
}

/**
 * Calculate the estimated monthly dollar value of fixing a specific finding.
 * Uses traffic estimation, bounce rate impact, and industry benchmarks.
 */
export function calculateFindingROI(
    finding: Finding,
    industry: string = 'default',
    auditContext?: { findings: Finding[] }
): RoiEstimation {
    const benchmarks = INDUSTRY_ROI_BENCHMARKS[industry?.toLowerCase()] || INDUSTRY_ROI_BENCHMARKS.default;
    const { avgOrderValue, conversionRate } = benchmarks;

    let monthlyValue = 0;
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let methodology = 'Based on general industry improvements.';

    const description = (finding.description || '').toLowerCase();
    const title = finding.title?.toLowerCase() || '';
    const metrics = finding.metrics as Record<string, unknown> | null;

    // 1. Page Speed / Core Web Vitals — use bounce-rate model
    if (
        title.includes('speed') || description.includes('speed') || description.includes('load time') ||
        title.includes('lcp') || title.includes('cls') || title.includes('fcp') || title.includes('tbt') ||
        (metrics && (metrics.performanceScore != null || metrics.lcp_ms != null))
    ) {
        if (auditContext) {
            const impact = calculateBounceRateImpact(auditContext.findings, industry);
            // Attribute a portion of lost revenue to speed fixes (conservative: 60%)
            monthlyValue = Math.round(impact.lostRevenueMonthly * 0.6);
            confidence = 'high';
            methodology = impact.methodology + ` Speed fixes could recover ~60% of lost visitors.`;
        } else {
            const { visitors } = estimateMonthlyVisitors([finding], industry);
            monthlyValue = Math.round(visitors * 0.15 * conversionRate * avgOrderValue);
            confidence = 'medium';
            methodology = `Improving mobile speed typically increases conversions by 15-20% (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}.`;
        }
    }
    // 2. GBP / Local SEO
    else if (title.includes('business profile') || description.includes('gbp') || description.includes('map') || title.includes('local listing')) {
        const { visitors } = estimateMonthlyVisitors(auditContext?.findings || [finding], industry);
        monthlyValue = Math.round(visitors * 0.10 * conversionRate * avgOrderValue);
        confidence = 'medium';
        methodology = `Optimizing Google Business Profile typically increases local discovery by 10% (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}.`;
    }
    // 3. Reviews / Reputation
    else if (title.includes('review') || description.includes('reputation') || title.includes('rating')) {
        const { visitors } = estimateMonthlyVisitors(auditContext?.findings || [finding], industry);
        monthlyValue = Math.round(visitors * 0.07 * conversionRate * avgOrderValue);
        confidence = 'medium';
        methodology = `Improving rating by 0.5 stars typically increases click-throughs by ~7% (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}.`;
    }
    // 4. SEO / Keywords / Meta
    else if (title.includes('seo') || description.includes('keyword') || description.includes('content') || title.includes('meta')) {
        const { visitors } = estimateMonthlyVisitors(auditContext?.findings || [finding], industry);
        monthlyValue = Math.round(visitors * 0.05 * conversionRate * avgOrderValue);
        confidence = 'low';
        methodology = `Basic SEO improvements typically increase organic traffic by 5% (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}.`;
    }
    // 5. Mobile / Responsiveness
    else if (title.includes('mobile') || description.includes('responsive')) {
        const { visitors } = estimateMonthlyVisitors(auditContext?.findings || [finding], industry);
        monthlyValue = Math.round(visitors * 0.10 * conversionRate * avgOrderValue);
        confidence = 'high';
        methodology = `Fixing mobile issues typically recovers 10% of lost mobile traffic (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}.`;
    }
    // 6. Conversion / UX
    else if (title.includes('broken') || description.includes('link') || title.includes('button') || title.includes('form')) {
        const { visitors } = estimateMonthlyVisitors(auditContext?.findings || [finding], industry);
        monthlyValue = Math.round(visitors * 0.005 * avgOrderValue);
        confidence = 'medium';
        methodology = `Fixing UX issues typically improves conversion rate by 0.5% (${benchmarks.citation}). For ${industry || 'your business'}, that means more ${benchmarks.contextHint}.`;
    }
    else {
        if (finding.type === 'PAINKILLER') {
            monthlyValue = 75;
            methodology = `General operational improvement estimate (${benchmarks.citation}).`;
        } else {
            monthlyValue = 25;
            methodology = `General enhancement value estimate (${benchmarks.citation}).`;
        }
    }

    return {
        monthlyValue: Math.round(monthlyValue),
        confidence,
        methodology,
    };
}

/**
 * Aggregate ROI for a list of findings (e.g. for a Tier).
 * Pass allFindings to improve speed-related ROI (uses full audit metrics).
 */
export function calculateTierROI(
    findings: Finding[],
    tierPrice: number,
    industry: string = 'default',
    allFindings?: Finding[]
): { totalMonthlyValue: number; ratio: number; bounceImpact?: ReturnType<typeof calculateBounceRateImpact> } {
    const auditContext = allFindings ? { findings: allFindings } : undefined;
    let totalMonthlyValue = 0;

    for (const finding of findings) {
        const roi = calculateFindingROI(finding, industry, auditContext);
        totalMonthlyValue += roi.monthlyValue;
    }

    const ratio = tierPrice > 0 ? Number((totalMonthlyValue / tierPrice).toFixed(1)) : 0;

    // Include bounce impact if we have speed-related findings
    const findingsForBounce = allFindings || findings;
    const hasSpeedFindings = findings.some(f => {
        const t = (f.title || '').toLowerCase();
        const d = (f.description || '').toLowerCase();
        return t.includes('speed') || t.includes('lcp') || d.includes('speed') || d.includes('load');
    });
    const bounceImpact = hasSpeedFindings ? calculateBounceRateImpact(findingsForBounce, industry) : undefined;

    return {
        totalMonthlyValue,
        ratio,
        bounceImpact,
    };
}
