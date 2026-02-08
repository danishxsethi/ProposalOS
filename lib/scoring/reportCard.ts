import { Finding } from '../modules/types';
import { Industry } from '../benchmarks/industryBenchmarks';

export interface CategoryScores {
    performance: number;
    visibility: number;
    trust: number;
    conversion: number;
    content: number;
    competitive: number;
}

export interface ReportCard {
    overallScore: number;
    letterGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    categoryScores: CategoryScores;
    radarData: {
        labels: string[];
        businessData: number[];
        industryData: number[];
    };
    gradingNarrative: string;
}

/**
 * Calculate comprehensive report card scores
 */
export function calculateReportCard(
    findings: Finding[],
    industry: Industry
): ReportCard {
    // 1. Calculate Category Scores
    const categoryScores = calculateCategoryScores(findings);

    // 2. Calculate Overall Score (Weighted)
    const overallScore = calculateOverallScore(categoryScores);

    // 3. Assign Letter Grade
    const letterGrade = getLetterGrade(overallScore);

    // 4. Generate Radar Data
    const radarData = {
        labels: ['Performance', 'Visibility', 'Trust', 'Conversion', 'Content', 'Competitive'],
        businessData: [
            categoryScores.performance,
            categoryScores.visibility,
            categoryScores.trust,
            categoryScores.conversion,
            categoryScores.content,
            categoryScores.competitive
        ],
        industryData: getIndustryAverages(industry)
    };

    // 5. Generate Narrative
    const gradingNarrative = generateGradingNarrative(overallScore, letterGrade, categoryScores);

    return {
        overallScore,
        letterGrade,
        categoryScores,
        radarData,
        gradingNarrative
    };
}

/**
 * Calculate individual category scores (0-100)
 */
function calculateCategoryScores(findings: Finding[]): CategoryScores {
    // Initialize scores
    let scores = {
        performance: 40,
        visibility: 30,
        trust: 30,
        conversion: 20,
        content: 30,
        competitive: 40
    };

    // Helper to find metric value
    const getMetric = (key: string): number | null => {
        for (const f of findings) {
            if (f.metrics && f.metrics[key]) {
                const val = f.metrics[key];
                return typeof val === 'object' ? val.value : val;
            }
        }
        return null;
    };

    // PERFORMANCE: PageSpeed, Mobile Score, Load Time
    const pageSpeed = getMetric('speedIndex') || getMetric('mobileScore') || 0;
    const loadTime = getMetric('loadTime') || 5;
    const performanceBase = pageSpeed;
    // Load time penalty: -10 pts for every second over 2s
    const loadPenalty = Math.max(0, (loadTime - 2) * 10);
    scores.performance = Math.max(10, Math.min(100, performanceBase - loadPenalty));

    // VISIBILITY: SEO checks, Organic Rank
    const organicPos = getMetric('organicPosition') || 20;
    // Rank 1 = 100, Rank 3 = 90, Rank 10 = 60, Rank 20+ = 20
    let rankScore = 20;
    if (organicPos <= 1) rankScore = 100;
    else if (organicPos <= 3) rankScore = 90;
    else if (organicPos <= 10) rankScore = 60;
    scores.visibility = rankScore;

    // TRUST: Ratings, Review Count vs Benchmark
    const rating = getMetric('rating') || 0;
    const reviewCount = getMetric('reviewCount') || 0;
    // Rating score: 5.0=100, 4.0=70, 3.0=40
    const ratingScore = rating > 0 ? (rating - 3) * 50 : 0;
    // Review count bonus (logarithmic)
    const reviewBonus = Math.min(50, Math.log10(Math.max(1, reviewCount)) * 20);
    scores.trust = Math.max(10, Math.min(100, ratingScore / 2 + reviewBonus + 20));

    // CONVERSION: CTA, Contact Methods
    const hasClickToCall = findings.some(f => f.category === 'Conversion' && f.title.includes('Call'));
    const hasBooking = findings.some(f => f.category === 'Conversion' && f.title.includes('Booking'));
    scores.conversion = 20 + (hasClickToCall ? 30 : 0) + (hasBooking ? 30 : 0);

    // CONTENT: Quality Score, Word Count
    const clarityScore = getMetric('clarityScore') || 5;
    const wordCount = getMetric('wordCount') || 500;
    // Clarity 1-10 -> 10-100
    const contentBase = clarityScore * 10;
    const wordCountBonus = Math.min(20, wordCount / 50); // +1 point per 50 words up to 20
    scores.content = Math.max(10, Math.min(100, contentBase + wordCountBonus));

    // COMPETITIVE: Gaps
    const reviewGap = getMetric('reviewGap') || 0;
    // 0 gap = 80 score, 100 gap = 20 score
    scores.competitive = Math.max(20, 80 - (reviewGap / 5));

    return scores;
}

/**
 * Calculate overall weighted score
 */
function calculateOverallScore(scores: CategoryScores): number {
    const weights = {
        performance: 0.15,
        visibility: 0.20,
        trust: 0.20,
        conversion: 0.20,
        content: 0.15,
        competitive: 0.10
    };

    const weightedScore =
        scores.performance * weights.performance +
        scores.visibility * weights.visibility +
        scores.trust * weights.trust +
        scores.conversion * weights.conversion +
        scores.content * weights.content +
        scores.competitive * weights.competitive;

    return Math.round(weightedScore);
}

/**
 * Get letter grade from score
 */
function getLetterGrade(score: number): ReportCard['letterGrade'] {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

/**
 * Get industry average scores for radar chart
 */
function getIndustryAverages(industry: Industry): number[] {
    // Simplified averages mapping - usually 60-70 range
    // Performance, Visibility, Trust, Conversion, Content, Competitive
    const baseAverages = [65, 60, 70, 55, 60, 65];

    // Adjust based on industry
    if (industry === 'dental' || industry === 'medical') {
        return [70, 65, 75, 60, 65, 70]; // Higher standards
    }
    if (industry === 'restaurant') {
        return [60, 70, 80, 50, 55, 75]; // High trust/visibility, lower on others
    }

    return baseAverages;
}

/**
 * Generate narrative explaining the grade
 */
function generateGradingNarrative(
    score: number,
    grade: string,
    scores: CategoryScores
): string {
    const lowestCategory = Object.entries(scores)
        .sort(([, a], [, b]) => a - b)[0][0];

    let narrative = `Your Digital Presence Score is ${score}/100, giving you a grade of ${grade}. `;

    if (grade === 'A') {
        narrative += "You are performing exceptionally well across the board, outpacing most competitors.";
    } else if (grade === 'B') {
        narrative += "You have a solid foundation but are missing some key opportunities to dominate your market.";
    } else if (grade === 'C') {
        narrative += "You are effectively average. You're invisible to many potential customers and losing leads to top competitors.";
    } else if (grade === 'D') {
        narrative += "Your digital presence is actively hurting your business. You are visible but failing to convert, or simply not being found.";
    } else {
        narrative += "Your digital presence is non-existent or critical broken. Immediate attention is required to stop leaking revenue.";
    }

    narrative += ` Your biggest opportunity for immediate improvement is in ${lowestCategory}, where you scored ${scores[lowestCategory as keyof CategoryScores]}/100.`;

    return narrative;
}
