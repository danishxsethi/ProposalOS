/**
 * Core Web Vitals types and extraction — Google's thresholds and ratings.
 */
export type CwvRating = 'good' | 'needs-improvement' | 'poor';

export interface CwvMetric<T = number> {
    value: T;
    rating: CwvRating;
    thresholdGood: number;
    thresholdPoor: number;
    unit: 'seconds' | 'milliseconds' | 'decimal';
}

/** Google's Core Web Vitals thresholds */
export const CWV_THRESHOLDS = {
    lcp: { good: 2500, poor: 4000 },       // ms
    fcp: { good: 1800, poor: 3000 },       // ms
    cls: { good: 0.1, poor: 0.25 },        // score
    inp: { good: 200, poor: 500 },         // ms
    tbt: { good: 200, poor: 600 },         // ms
    ttfb: { good: 800, poor: 1800 },       // ms
    speedIndex: { good: 3400, poor: 5800 }, // ms (approximate)
} as const;

function rateMetric(value: number, good: number, poor: number): CwvRating {
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
}

export function rateLcp(ms: number): CwvRating {
    return rateMetric(ms, CWV_THRESHOLDS.lcp.good, CWV_THRESHOLDS.lcp.poor);
}
export function rateFcp(ms: number): CwvRating {
    return rateMetric(ms, CWV_THRESHOLDS.fcp.good, CWV_THRESHOLDS.fcp.poor);
}
export function rateCls(score: number): CwvRating {
    return rateMetric(score, CWV_THRESHOLDS.cls.good, CWV_THRESHOLDS.cls.poor);
}
export function rateInp(ms: number): CwvRating {
    return rateMetric(ms, CWV_THRESHOLDS.inp.good, CWV_THRESHOLDS.inp.poor);
}
export function rateTbt(ms: number): CwvRating {
    return rateMetric(ms, CWV_THRESHOLDS.tbt.good, CWV_THRESHOLDS.tbt.poor);
}
export function rateTtfb(ms: number): CwvRating {
    return rateMetric(ms, CWV_THRESHOLDS.ttfb.good, CWV_THRESHOLDS.ttfb.poor);
}
export function rateSpeedIndex(ms: number): CwvRating {
    return rateMetric(ms, CWV_THRESHOLDS.speedIndex.good, CWV_THRESHOLDS.speedIndex.poor);
}

export interface CoreWebVitalsFull {
    fcp: CwvMetric<number> | null;         // seconds (converted from ms)
    lcp: CwvMetric<number> | null;          // seconds
    cls: CwvMetric<number> | null;          // decimal
    inp: CwvMetric<number> | null;          // milliseconds
    tbt: CwvMetric<number> | null;          // milliseconds
    ttfb: CwvMetric<number> | null;        // seconds
    speedIndex: CwvMetric<number> | null;   // seconds
    totalPageWeightMB: number | null;
    numRequests: number | null;
    largestResource: { url: string; sizeBytes: number } | null;
    renderBlockingCount: number | null;
}

/**
 * Extract Core Web Vitals and resource data from Lighthouse audits.
 */
export function extractCoreWebVitalsFromAudits(audits: Record<string, { numericValue?: number; details?: { items?: Array<{ url?: string; totalBytes?: number; transferSize?: number; resourceSize?: number }> } }>): CoreWebVitalsFull {
    const get = (id: string) => audits[id]?.numericValue ?? null;

    const fcpMs = get('first-contentful-paint');
    const lcpMs = get('largest-contentful-paint');
    const clsVal = get('cumulative-layout-shift');
    const inpMs = get('interaction-to-next-paint');
    const tbtMs = get('total-blocking-time');
    const ttfbMs = get('server-response-time');
    const siMs = get('speed-index');

    const buildMetric = (
        value: number | null,
        good: number,
        poor: number,
        rateFn: (v: number) => CwvRating,
        unit: CwvMetric['unit']
    ): CwvMetric<number> | null => {
        if (value == null) return null;
        return {
            value: unit === 'seconds' ? value / 1000 : value,
            rating: rateFn(value),
            thresholdGood: unit === 'seconds' ? good / 1000 : good,
            thresholdPoor: unit === 'seconds' ? poor / 1000 : poor,
            unit,
        };
    };

    // Resource summary — total-byte-weight has numericValue in bytes
    let totalPageWeightMB: number | null = null;
    let numRequests: number | null = null;
    const totalByteWeight = audits['total-byte-weight']?.numericValue;
    if (totalByteWeight != null) {
        totalPageWeightMB = totalByteWeight / (1024 * 1024);
    }
    const resSummary = audits['resource-summary']?.details as { items?: Array<Record<string, unknown>> } | undefined;
    if (resSummary?.items) {
        numRequests = resSummary.items.reduce((sum, row) => {
            const count = row.requestCount ?? row.Requests ?? row.requests;
            return sum + (typeof count === 'number' ? count : 0);
        }, 0);
    }
    const netReq = audits['network-requests']?.details as { items?: unknown[] } | undefined;
    if (numRequests == null && netReq?.items) {
        numRequests = netReq.items.length;
    }

    // Largest resource from network-requests or total-byte-weight details
    let largestResource: { url: string; sizeBytes: number } | null = null;
    const networkRequests = audits['network-requests']?.details as { items?: Array<{ url?: string; transferSize?: number; resourceSize?: number }> } | undefined;
    if (networkRequests?.items?.length) {
        const sorted = [...networkRequests.items].sort(
            (a, b) => (b.transferSize ?? b.resourceSize ?? 0) - (a.transferSize ?? a.resourceSize ?? 0)
        );
        const top = sorted[0];
        if (top) {
            const size = top.transferSize ?? top.resourceSize ?? 0;
            largestResource = { url: top.url || 'unknown', sizeBytes: size };
        }
    }

    // Render-blocking count
    let renderBlockingCount: number | null = null;
    const rbr = audits['render-blocking-resources'] ?? audits['render-blocking-resource'];
    if (rbr?.details) {
        const items = (rbr.details as { items?: unknown[] }).items;
        renderBlockingCount = items?.length ?? null;
    }

    return {
        fcp: buildMetric(fcpMs, CWV_THRESHOLDS.fcp.good, CWV_THRESHOLDS.fcp.poor, rateFcp, 'seconds'),
        lcp: buildMetric(lcpMs, CWV_THRESHOLDS.lcp.good, CWV_THRESHOLDS.lcp.poor, rateLcp, 'seconds'),
        cls: clsVal != null
            ? {
                value: clsVal,
                rating: rateCls(clsVal),
                thresholdGood: CWV_THRESHOLDS.cls.good,
                thresholdPoor: CWV_THRESHOLDS.cls.poor,
                unit: 'decimal',
            }
            : null,
        inp: buildMetric(inpMs, CWV_THRESHOLDS.inp.good, CWV_THRESHOLDS.inp.poor, rateInp, 'milliseconds'),
        tbt: buildMetric(tbtMs, CWV_THRESHOLDS.tbt.good, CWV_THRESHOLDS.tbt.poor, rateTbt, 'milliseconds'),
        ttfb: buildMetric(ttfbMs, CWV_THRESHOLDS.ttfb.good, CWV_THRESHOLDS.ttfb.poor, rateTtfb, 'seconds'),
        speedIndex: buildMetric(siMs, CWV_THRESHOLDS.speedIndex.good, CWV_THRESHOLDS.speedIndex.poor, rateSpeedIndex, 'seconds'),
        totalPageWeightMB,
        numRequests,
        largestResource,
        renderBlockingCount,
    };
}
