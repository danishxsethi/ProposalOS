import { Finding } from '../modules/types';

export type Industry =
    | 'dental'
    | 'restaurant'
    | 'plumber_hvac'
    | 'legal'
    | 'medical'
    | 'salon_spa'
    | 'automotive'
    | 'real_estate'
    | 'fitness'
    | 'default';

export interface IndustryBenchmarks {
    website: {
        avgPageSpeedScore: number;
        avgLoadTime: number; // seconds
        topQuartilePageSpeed: number;
    };
    gbp: {
        avgRating: number;
        avgReviewCount: number;
        topQuartileReviewCount: number;
        avgPhotosCount: number;
    };
    seo: {
        avgOrganicPosition: number; // For brand/primary keywords
        pctWithSchemaMarkup: number;
        pctWithSitemap: number;
    };
    social: {
        avgPlatforms: number;
        pctWithFacebook: number;
        pctWithInstagram: number;
    };
    conversion: {
        pctWithClickToCall: number;
        pctWithBookingWidget: number;
        pctWithLiveChat: number;
    };
    content: {
        avgHomepageWordCount: number;
        avgReadingLevel: number; // Grade level
    };
    citations: {
        avgDirectoryListings: number;
        pctWithYelp: number;
    };
    competitive: {
        avgCompetitorReviewGap: number; // How many fewer reviews than top competitor
    };
}

// 1. Benchmark Dataset
export const INDUSTRY_BENCHMARKS: Record<Industry, IndustryBenchmarks> = {
    dental: {
        website: { avgPageSpeedScore: 55, avgLoadTime: 3.2, topQuartilePageSpeed: 75 },
        gbp: { avgRating: 4.6, avgReviewCount: 85, topQuartileReviewCount: 200, avgPhotosCount: 25 },
        seo: { avgOrganicPosition: 8, pctWithSchemaMarkup: 35, pctWithSitemap: 60 },
        social: { avgPlatforms: 3, pctWithFacebook: 85, pctWithInstagram: 65 },
        conversion: { pctWithClickToCall: 70, pctWithBookingWidget: 45, pctWithLiveChat: 20 },
        content: { avgHomepageWordCount: 800, avgReadingLevel: 8 },
        citations: { avgDirectoryListings: 5, pctWithYelp: 75 },
        competitive: { avgCompetitorReviewGap: 30 }
    },
    restaurant: {
        website: { avgPageSpeedScore: 45, avgLoadTime: 4.5, topQuartilePageSpeed: 65 },
        gbp: { avgRating: 4.4, avgReviewCount: 150, topQuartileReviewCount: 400, avgPhotosCount: 50 },
        seo: { avgOrganicPosition: 12, pctWithSchemaMarkup: 40, pctWithSitemap: 50 },
        social: { avgPlatforms: 4, pctWithFacebook: 90, pctWithInstagram: 85 },
        conversion: { pctWithClickToCall: 80, pctWithBookingWidget: 60, pctWithLiveChat: 5 },
        content: { avgHomepageWordCount: 400, avgReadingLevel: 7 },
        citations: { avgDirectoryListings: 8, pctWithYelp: 90 },
        competitive: { avgCompetitorReviewGap: 50 }
    },
    plumber_hvac: {
        website: { avgPageSpeedScore: 50, avgLoadTime: 3.8, topQuartilePageSpeed: 70 },
        gbp: { avgRating: 4.7, avgReviewCount: 60, topQuartileReviewCount: 150, avgPhotosCount: 15 },
        seo: { avgOrganicPosition: 15, pctWithSchemaMarkup: 25, pctWithSitemap: 55 },
        social: { avgPlatforms: 2, pctWithFacebook: 75, pctWithInstagram: 30 },
        conversion: { pctWithClickToCall: 85, pctWithBookingWidget: 30, pctWithLiveChat: 15 },
        content: { avgHomepageWordCount: 600, avgReadingLevel: 8 },
        citations: { avgDirectoryListings: 6, pctWithYelp: 80 },
        competitive: { avgCompetitorReviewGap: 40 }
    },
    legal: {
        website: { avgPageSpeedScore: 60, avgLoadTime: 2.8, topQuartilePageSpeed: 80 },
        gbp: { avgRating: 4.8, avgReviewCount: 45, topQuartileReviewCount: 100, avgPhotosCount: 10 },
        seo: { avgOrganicPosition: 6, pctWithSchemaMarkup: 50, pctWithSitemap: 80 },
        social: { avgPlatforms: 3, pctWithFacebook: 60, pctWithInstagram: 20 },
        conversion: { pctWithClickToCall: 75, pctWithBookingWidget: 20, pctWithLiveChat: 40 },
        content: { avgHomepageWordCount: 1200, avgReadingLevel: 10 },
        citations: { avgDirectoryListings: 10, pctWithYelp: 50 },
        competitive: { avgCompetitorReviewGap: 20 }
    },
    medical: {
        website: { avgPageSpeedScore: 58, avgLoadTime: 3.0, topQuartilePageSpeed: 78 },
        gbp: { avgRating: 4.5, avgReviewCount: 70, topQuartileReviewCount: 180, avgPhotosCount: 20 },
        seo: { avgOrganicPosition: 10, pctWithSchemaMarkup: 45, pctWithSitemap: 65 },
        social: { avgPlatforms: 2, pctWithFacebook: 70, pctWithInstagram: 40 },
        conversion: { pctWithClickToCall: 75, pctWithBookingWidget: 40, pctWithLiveChat: 25 },
        content: { avgHomepageWordCount: 900, avgReadingLevel: 9 },
        citations: { avgDirectoryListings: 8, pctWithYelp: 60 },
        competitive: { avgCompetitorReviewGap: 35 }
    },
    salon_spa: {
        website: { avgPageSpeedScore: 48, avgLoadTime: 4.2, topQuartilePageSpeed: 68 },
        gbp: { avgRating: 4.6, avgReviewCount: 120, topQuartileReviewCount: 300, avgPhotosCount: 60 },
        seo: { avgOrganicPosition: 14, pctWithSchemaMarkup: 30, pctWithSitemap: 45 },
        social: { avgPlatforms: 4, pctWithFacebook: 95, pctWithInstagram: 95 },
        conversion: { pctWithClickToCall: 80, pctWithBookingWidget: 80, pctWithLiveChat: 10 },
        content: { avgHomepageWordCount: 500, avgReadingLevel: 7 },
        citations: { avgDirectoryListings: 7, pctWithYelp: 95 },
        competitive: { avgCompetitorReviewGap: 45 }
    },
    automotive: {
        website: { avgPageSpeedScore: 52, avgLoadTime: 3.5, topQuartilePageSpeed: 72 },
        gbp: { avgRating: 4.3, avgReviewCount: 90, topQuartileReviewCount: 250, avgPhotosCount: 30 },
        seo: { avgOrganicPosition: 11, pctWithSchemaMarkup: 35, pctWithSitemap: 55 },
        social: { avgPlatforms: 2, pctWithFacebook: 80, pctWithInstagram: 40 },
        conversion: { pctWithClickToCall: 90, pctWithBookingWidget: 50, pctWithLiveChat: 15 },
        content: { avgHomepageWordCount: 600, avgReadingLevel: 8 },
        citations: { avgDirectoryListings: 9, pctWithYelp: 85 },
        competitive: { avgCompetitorReviewGap: 40 }
    },
    real_estate: {
        website: { avgPageSpeedScore: 50, avgLoadTime: 3.9, topQuartilePageSpeed: 70 },
        gbp: { avgRating: 4.8, avgReviewCount: 35, topQuartileReviewCount: 80, avgPhotosCount: 40 },
        seo: { avgOrganicPosition: 18, pctWithSchemaMarkup: 60, pctWithSitemap: 85 },
        social: { avgPlatforms: 4, pctWithFacebook: 90, pctWithInstagram: 80 },
        conversion: { pctWithClickToCall: 85, pctWithBookingWidget: 70, pctWithLiveChat: 35 },
        content: { avgHomepageWordCount: 1000, avgReadingLevel: 9 },
        citations: { avgDirectoryListings: 12, pctWithYelp: 65 },
        competitive: { avgCompetitorReviewGap: 25 }
    },
    fitness: {
        website: { avgPageSpeedScore: 56, avgLoadTime: 3.1, topQuartilePageSpeed: 76 },
        gbp: { avgRating: 4.7, avgReviewCount: 110, topQuartileReviewCount: 280, avgPhotosCount: 45 },
        seo: { avgOrganicPosition: 16, pctWithSchemaMarkup: 40, pctWithSitemap: 60 },
        social: { avgPlatforms: 4, pctWithFacebook: 95, pctWithInstagram: 90 },
        conversion: { pctWithClickToCall: 70, pctWithBookingWidget: 85, pctWithLiveChat: 15 },
        content: { avgHomepageWordCount: 700, avgReadingLevel: 7 },
        citations: { avgDirectoryListings: 6, pctWithYelp: 85 },
        competitive: { avgCompetitorReviewGap: 55 }
    },
    default: { // General local business average
        website: { avgPageSpeedScore: 53, avgLoadTime: 3.5, topQuartilePageSpeed: 73 },
        gbp: { avgRating: 4.5, avgReviewCount: 65, topQuartileReviewCount: 175, avgPhotosCount: 20 },
        seo: { avgOrganicPosition: 12, pctWithSchemaMarkup: 35, pctWithSitemap: 60 },
        social: { avgPlatforms: 3, pctWithFacebook: 80, pctWithInstagram: 50 },
        conversion: { pctWithClickToCall: 75, pctWithBookingWidget: 40, pctWithLiveChat: 15 },
        content: { avgHomepageWordCount: 650, avgReadingLevel: 8 },
        citations: { avgDirectoryListings: 7, pctWithYelp: 70 },
        competitive: { avgCompetitorReviewGap: 30 }
    }
};

export interface BenchmarkComparison {
    percentile: number; // 0-100
    label: 'well below' | 'below' | 'average' | 'above' | 'top quartile';
    benchmarkValue: number;
    gap: number;
    narrative: string;
    industry: Industry;
}

// 2. Comparison Logic
export function compareToBenchmark(
    metricName: string,
    value: number,
    industryKey: string
): BenchmarkComparison {
    const industry = (INDUSTRY_BENCHMARKS[industryKey as Industry] ? industryKey : 'default') as Industry;
    const benchmarks = INDUSTRY_BENCHMARKS[industry];

    let benchmarkValue = 0;
    let isHighBetter = true;

    // Map flat metric names to nested structure
    switch (metricName) {
        case 'pageSpeed':
            benchmarkValue = benchmarks.website.avgPageSpeedScore;
            break;
        case 'loadTime':
            benchmarkValue = benchmarks.website.avgLoadTime;
            isHighBetter = false;
            break;
        case 'reviewCount':
            benchmarkValue = benchmarks.gbp.avgReviewCount;
            break;
        case 'rating':
            benchmarkValue = benchmarks.gbp.avgRating;
            break;
        case 'wordCount':
            benchmarkValue = benchmarks.content.avgHomepageWordCount;
            break;
        default:
            benchmarkValue = 0; // Fallback
    }

    if (benchmarkValue === 0) {
        return {
            percentile: 50,
            label: 'average',
            benchmarkValue: 0,
            gap: 0,
            narrative: 'Benchmark data not available',
            industry
        };
    }

    // Calculate gap and percentile (simplified distribution model)
    const gap = isHighBetter ? value - benchmarkValue : benchmarkValue - value;
    const deviation = gap / benchmarkValue; // % deviation from mean

    // Approximate percentile based on deviation
    // -50% deviation ~ 10th percentile
    // 0% deviation ~ 50th percentile
    // +50% deviation ~ 90th percentile
    let percentile = 50 + (deviation * 80);
    percentile = Math.max(1, Math.min(99, Math.round(percentile)));

    let label: BenchmarkComparison['label'] = 'average';
    if (percentile >= 75) label = 'top quartile';
    else if (percentile >= 60) label = 'above';
    else if (percentile <= 25) label = 'well below';
    else if (percentile <= 40) label = 'below';

    // Industry display name
    const industryName = industry === 'plumber_hvac' ? 'plumbing & HVAC' :
        industry === 'salon_spa' ? 'salon & spa' :
            industry.replace('_', ' ');

    const comparisonText = isHighBetter
        ? (value < benchmarkValue ? 'below' : 'above')
        : (value > benchmarkValue ? 'slower than' : 'faster than');

    const narrative = `Your ${metricName} of ${value} is ${comparisonText} the ${industryName} industry average of ${benchmarkValue}. This places you in the ${label === 'top quartile' ? 'top 25%' : label === 'well below' ? 'bottom 25%' : 'middle tier'} of businesses in your sector.`;

    return {
        percentile,
        label,
        benchmarkValue,
        gap,
        narrative,
        industry
    };
}

// 3. Finding Enhancer
export function threadBenchmarksThroughFindings(
    findings: Finding[],
    industry: string
): Finding[] {
    return findings.map(finding => {
        // Enhance metrics if they exist
        if (finding.metrics) {
            const enhancedMetrics: Record<string, any> = { ...finding.metrics };

            // Explicitly mapping common metrics to benchmark keys
            const metricMappings: Record<string, string> = {
                'speedIndex': 'pageSpeed', // approximates page speed score
                'loadTime': 'loadTime',
                'reviewCount': 'reviewCount',
                'rating': 'rating',
                'wordCount': 'wordCount'
            };

            Object.entries(finding.metrics).forEach(([key, value]) => {
                if (typeof value === 'number' && metricMappings[key]) {
                    const comparison = compareToBenchmark(metricMappings[key], value, industry);
                    enhancedMetrics[`${key}_benchmark`] = {
                        value: comparison.benchmarkValue,
                        percentile: comparison.percentile,
                        label: comparison.label,
                        industry: comparison.industry
                    };

                    // Add context to description if it's a significant deviation
                    if (comparison.label === 'well below' || comparison.label === 'below') {
                        finding.description += ` (Benchmark: Bottom ${comparison.percentile}% of ${comparison.industry} businesses)`;
                    }
                }
            });

            finding.metrics = enhancedMetrics;
        }
        return finding;
    });
}

// 4. Radar Chart Data Generator
export function generateBenchmarkRadarData(
    findings: Finding[],
    industryKey: string
) {
    const industry = (INDUSTRY_BENCHMARKS[industryKey as Industry] ? industryKey : 'default') as Industry;

    // Default low scores
    const scores = {
        Website: 30,
        SEO: 30,
        Reviews: 30,
        Social: 30,
        Conversion: 30,
        Content: 30,
        Citations: 30,
        Mobile: 30
    };

    // Extract real scores from findings/metrics (simplified logic)
    // In a real app, you'd aggregate scores from specific modules
    findings.forEach(f => {
        if (f.category === 'Performance' && f.type === 'VITAMIN') scores.Website += 10;
        if (f.category === 'SEO' && f.type === 'VITAMIN') scores.SEO += 10;
        // ... more logic to build actual scores
    });

    // Normalize to 0-100
    Object.keys(scores).forEach(k => {
        scores[k as keyof typeof scores] = Math.min(100, Math.max(0, scores[k as keyof typeof scores]));
    });

    return {
        labels: Object.keys(scores),
        businessData: Object.values(scores),
        industryData: [70, 65, 75, 60, 50, 65, 70, 60], // Average "good" profile
        industry
    };
}
