import { Finding } from '@prisma/client';

// Industry-specific average metrics
export const INDUSTRY_METRICS: Record<string, {
    avgMonthlyVisitors: number;
    avgCustomerValue: number;
    avgConversionRate: number;
}> = {
    restaurant: { avgMonthlyVisitors: 500, avgCustomerValue: 35, avgConversionRate: 0.03 },
    dental: { avgMonthlyVisitors: 300, avgCustomerValue: 250, avgConversionRate: 0.03 },
    plumber: { avgMonthlyVisitors: 200, avgCustomerValue: 400, avgConversionRate: 0.05 },
    lawyer: { avgMonthlyVisitors: 150, avgCustomerValue: 1500, avgConversionRate: 0.02 },
    real_estate: { avgMonthlyVisitors: 400, avgCustomerValue: 3000, avgConversionRate: 0.01 },
    ecommerce: { avgMonthlyVisitors: 1000, avgCustomerValue: 60, avgConversionRate: 0.02 },
    default: { avgMonthlyVisitors: 300, avgCustomerValue: 100, avgConversionRate: 0.03 },
};

export interface RoiEstimation {
    monthlyValue: number;
    confidence: 'high' | 'medium' | 'low';
    methodology: string;
}

/**
 * Calculate the estimated monthly dollar value of fixing a specific finding.
 */
export function calculateFindingROI(
    finding: Finding,
    industry: string = 'default'
): RoiEstimation {
    const metrics = INDUSTRY_METRICS[industry.toLowerCase()] || INDUSTRY_METRICS['default'];
    const { avgMonthlyVisitors, avgCustomerValue, avgConversionRate } = metrics;
    const type = finding.type; // PAINKILLER or VITAMIN
    // We can also look at finding.category or tags if available, but for now we parse text or ID.
    // Since we don't have structured "category" in Finding schema easily, we'll try to guess based on ID or content.
    // Actually, finding.category exists in the Prisma schema if we added it, but let's assume we depend on finding description keywords.

    // Default conservative estimate
    let monthlyValue = 0;
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let methodology = 'Based on general industry improvements.';

    const description = (finding.description || '').toLowerCase();
    const title = finding.title?.toLowerCase() || '';

    // 1. Page Speed / Core Web Vitals
    if (title.includes('speed') || description.includes('speed') || description.includes('load time') || title.includes('lcp') || title.includes('cls')) {
        // Rule: Speed < 50 -> 70 est 15% more visitors
        // Value = Visitors * 15% * ConvRate * CustomerValue
        const visitorIncrease = 0.15;
        monthlyValue = avgMonthlyVisitors * visitorIncrease * avgConversionRate * avgCustomerValue;
        confidence = 'high';
        methodology = 'Improving site speed is estimated to increase traffic by 15%.';
    }
    // 2. GBP / Local SEO
    else if (title.includes('business profile') || description.includes('gbp') || description.includes('map') || title.includes('local listing')) {
        // Rule: 10% more discovery
        const discoveryIncrease = 0.10;
        monthlyValue = avgMonthlyVisitors * discoveryIncrease * avgConversionRate * avgCustomerValue;
        confidence = 'medium';
        methodology = 'Optimizing Google Business Profile is estimated to increase local discovery by 10%.';
    }
    // 3. Reviews / Reputation
    else if (title.includes('review') || description.includes('reputation') || title.includes('rating')) {
        // Rule: 0.5 star increase -> ~7% more clicks (avg of 5-9%)
        const clickIncrease = 0.07;
        monthlyValue = avgMonthlyVisitors * clickIncrease * avgConversionRate * avgCustomerValue;
        confidence = 'medium';
        methodology = 'Improving rating by 0.5 stars is estimated to increase click-throughs by ~7%.';
    }
    // 4. Missing Content / SEO / Keywords
    else if (title.includes('seo') || description.includes('keyword') || description.includes('content') || title.includes('meta')) {
        // Conservative: 5% organic traffic increase
        const trafficIncrease = 0.05;
        monthlyValue = avgMonthlyVisitors * trafficIncrease * avgConversionRate * avgCustomerValue;
        confidence = 'low';
        methodology = 'Basic SEO improvements are estimated to increase organic traffic by 5%.';
    }
    // 5. Mobile / Responsiveness
    else if (title.includes('mobile') || description.includes('responsive')) {
        // Mobile traffic is ~50%. If bad mobile, losing half. Fixing it captures that. 
        // Conservative: 10% traffic recovery.
        const recovery = 0.10;
        monthlyValue = avgMonthlyVisitors * recovery * avgConversionRate * avgCustomerValue;
        confidence = 'high';
        methodology = 'Fixing mobile issues recovers an estimated 10% of lost mobile traffic.';
    }
    // 6. Conversion / UX (broken links, bad buttons)
    else if (title.includes('broken') || description.includes('link') || title.includes('button') || title.includes('form')) {
        // Direct conversion impact. 0.5% conversion rate increase.
        const convIncrease = 0.005; // +0.5% absolute
        monthlyValue = avgMonthlyVisitors * convIncrease * avgCustomerValue;
        confidence = 'medium';
        methodology = 'Fixing strict UX issues is estimated to improve conversion rate by 0.5%.';
    }
    else {
        // Generic fallback for "Painkiller" vs "Vitamin"
        if (type === 'PAINKILLER') {
            monthlyValue = 50; // Minimal baseline for fixing a problem
            confidence = 'low';
            methodology = 'General operational improvement estimate.';
        } else {
            monthlyValue = 20; // Minimal baseline for an enhancement
            confidence = 'low';
            methodology = 'General enhancement value estimate.';
        }
    }

    // Round to nearest dollar
    return {
        monthlyValue: Math.round(monthlyValue),
        confidence,
        methodology
    };
}

/**
 * Aggregate ROI for a list of findings (e.g. for a Tier).
 */
export function calculateTierROI(
    findings: Finding[],
    tierPrice: number,
    industry: string = 'default'
): { totalMonthlyValue: number; ratio: number } {
    let totalMonthlyValue = 0;

    for (const finding of findings) {
        const roi = calculateFindingROI(finding, industry);
        totalMonthlyValue += roi.monthlyValue;
    }

    const ratio = tierPrice > 0 ? Number((totalMonthlyValue / tierPrice).toFixed(1)) : 0;

    return {
        totalMonthlyValue,
        ratio
    };
}
