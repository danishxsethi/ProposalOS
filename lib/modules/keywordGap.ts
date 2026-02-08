import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cachedFetch } from '@/lib/cache/apiCache';

export interface KeywordGapInput {
    businessName: string;
    industry: string;
    city: string;
    websiteUrl: string;
}

interface Keyword {
    term: string;
    category: 'primary' | 'near_me' | 'problem' | 'comparison' | 'long_tail';
    volumeLabel: 'low' | 'medium' | 'high';
    estimatedVolume?: number; // Numeric approximation for calculations
}

interface RankingCheck {
    keyword: string;
    rank: number | null; // null if not found in top 20
    url?: string;
    inLocalPack: boolean;
    competitors: string[]; // URLs ranking above
}

interface KeywordGapAnalysis {
    keywords: Keyword[];
    rankings: RankingCheck[];
    summary: {
        defending: number; // Rank 1-20
        gaps: number; // Not ranking
        invisibleCount: number; // Count of 'High'/'Medium' volume gaps
        estimatedLostClicks: number; // Rough estimate
    };
}

/**
 * Run Keyword Gap Module
 */
export async function runKeywordGapModule(
    input: KeywordGapInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ businessName: input.businessName }, '[KeywordGap] Starting analysis');

    if (!process.env.GOOGLE_AI_API_KEY || !process.env.SERP_API_KEY) {
        throw new Error('Missing API keys for Keyword Gap module');
    }

    try {
        // 1. Generate Target Keywords (Gemini)
        const keywords = await generateKeywordList(input, tracker);

        // 2. Check Rankings (SerpAPI) - Top 10 only to manage costs
        const topKeywords = keywords.slice(0, 10);
        const rankings = await checkRankings(topKeywords, input, tracker);

        // 3. Analyze Gaps
        const analysis = analyzeGaps(keywords, rankings);

        // 4. Generate Findings
        const findings = generateKeywordFindings(analysis, input);

        const evidenceSnapshot = {
            module: 'keyword_gap',
            source: 'serp_api_combinator',
            rawResponse: analysis,
            collectedAt: new Date(),
        };

        logger.info({
            businessName: input.businessName,
            defending: analysis.summary.defending,
            gaps: analysis.summary.gaps
        }, '[KeywordGap] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, businessName: input.businessName }, '[KeywordGap] Analysis failed');
        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Visibility',
                title: 'Keyword Analysis Unavailable',
                description: 'Unable to perform deep keyword gap analysis at this time.',
                impactScore: 1,
                confidenceScore: 0,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: []
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Generate keyword list using Gemini Flash
 */
async function generateKeywordList(input: KeywordGapInput, tracker?: CostTracker): Promise<Keyword[]> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    tracker?.addApiCall('GEMINI_KEYWORD_GEN');

    const prompt = `For a ${input.industry} business in ${input.city}, list the top 20 keywords a potential customer would search for.
    Include a mix of:
    - Primary service keywords (e.g., 'emergency plumber ${input.city}')
    - Near me keywords (e.g., 'plumber near me')
    - Problem-based keywords (e.g., 'burst pipe repair')
    - Comparison keywords (e.g., 'best plumber ${input.city}')
    - Long-tail keywords (e.g., 'how much does a plumber cost in ${input.city}')

    Return ONLY a JSON array with objects: { "term": string, "category": string, "volumeLabel": "low"|"medium"|"high" }`;

    const result = await cachedFetch(
        'keyword_gen_gemini',
        { industry: input.industry, city: input.city },
        async () => {
            const res = await model.generateContent(prompt);
            return res.response.text();
        },
        { ttlHours: 24 * 30 } // Cache keyword lists for a month per industry/city combo
    );

    try {
        const cleanJson = result.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        logger.error({ error: e, result }, '[KeywordGap] Failed to parse keyword JSON');
        return [];
    }
}

/**
 * Check rankings using SerpAPI
 */
async function checkRankings(
    keywords: Keyword[],
    input: KeywordGapInput,
    tracker?: CostTracker
): Promise<RankingCheck[]> {
    const results: RankingCheck[] = [];
    const normalizedDomain = new URL(input.websiteUrl).hostname.replace('www.', '');

    // limit concurrency to avoid rate limits if any, though SerpAPI is robust.
    // Sequential for safety and cost control/debugging.
    for (const kw of keywords) {
        tracker?.addApiCall('SERP_API_SEARCH');

        try {
            const data = await cachedFetch(
                'serp_ranking_check',
                { keyword: kw.term, city: input.city }, // Cache by keyword+city
                async () => {
                    const params = new URLSearchParams({
                        engine: 'google',
                        q: kw.term,
                        location: input.city, // SerpAPI location parameter
                        num: '20', // Top 20 results
                        api_key: process.env.SERP_API_KEY!
                    });
                    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
                    return res.json();
                },
                { ttlHours: 24 * 7 }
            );

            let rank: number | null = null;
            let url: string | undefined = undefined;
            let inLocalPack = false;
            const competitors: string[] = [];

            // Check Organic Results
            if (data.organic_results) {
                for (const res of data.organic_results) {
                    if (res.link.includes(normalizedDomain)) {
                        rank = res.position;
                        url = res.link;
                        break;
                    } else if (rank === null) {
                        // Collect competitors ranking above us
                        competitors.push(res.domain || new URL(res.link).hostname);
                    }
                }
            }

            // Check Local Pack
            if (data.local_results) {
                for (const res of data.local_results) {
                    // Title match often used if website link hidden/complex in SerpAPI local pack
                    if (res.title.toLowerCase().includes(input.businessName.toLowerCase())) {
                        inLocalPack = true;
                    }
                }
            }

            results.push({
                keyword: kw.term,
                rank,
                url,
                inLocalPack,
                competitors: competitors.slice(0, 3) // Top 3 competitors
            });

        } catch (error) {
            logger.warn({ error, keyword: kw.term }, '[KeywordGap] Ranking check failed');
        }
    }

    return results;
}

/**
 * Analyze Gaps
 */
function analyzeGaps(keywords: Keyword[], rankings: RankingCheck[]): KeywordGapAnalysis {
    let defending = 0;
    let gaps = 0;

    rankings.forEach(r => {
        if (r.rank !== null || r.inLocalPack) {
            defending++;
        } else {
            gaps++;
        }
    });

    // Simple estimation: High volume gap = 100 missed clicks, Medium = 20
    const invisibleCount = rankings.filter(r =>
        r.rank === null && !r.inLocalPack &&
        keywords.find(k => k.term === r.keyword)?.volumeLabel !== 'low'
    ).length;

    // Rough calc for impact
    const estimatedLostClicks = invisibleCount * 50;

    return {
        keywords,
        rankings,
        summary: {
            defending,
            gaps,
            invisibleCount,
            estimatedLostClicks
        }
    };
}

/**
 * Generate Findings
 */
function generateKeywordFindings(analysis: KeywordGapAnalysis, input: KeywordGapInput): Finding[] {
    const findings: Finding[] = [];
    const { rankings, summary, keywords } = analysis;

    // PAINKILLER: Invisible for Primary Keyword
    // Find a 'primary' keyword where rank is null
    const primaryGap = rankings.find(r =>
        r.rank === null && !r.inLocalPack &&
        keywords.find(k => k.term === r.keyword)?.category === 'primary'
    );

    if (primaryGap) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: `Invisible for Primary Keyword: "${primaryGap.keyword}"`,
            description: `You do not appear in the top 20 results for '${primaryGap.keyword}'. This is a high-intent search term where local customers are looking for exactly what you sell right now.`,
            impactScore: 8,
            confidenceScore: 100,
            evidence: [{ type: 'text', value: 'Not in Top 20', label: 'Rank Status' }],
            metrics: { keyword: primaryGap.keyword },
            effortEstimate: 'HIGH',
            recommendedFix: ['Create a dedicated service page for this keyword', 'Optimize GMB for this service']
        });
    }

    // PAINKILLER: Mass Visibility Loss
    if (summary.gaps > 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: `Invisible for ${summary.gaps} Target Keywords`,
            description: `Competitors are ranking for ${summary.gaps} major keywords that you are missing entirely. You are effectively invisible to a large segment of your market.`,
            impactScore: 7,
            confidenceScore: 100,
            evidence: rankings.filter(r => r.rank === null).slice(0, 3).map(r => ({
                type: 'text',
                value: r.keyword,
                label: 'Missed Keyword'
            })),
            metrics: { gapCount: summary.gaps },
            effortEstimate: 'HIGH',
            recommendedFix: ['Launch SEO content campaign targeting these gaps']
        });
    }

    // VITAMIN: Missing "Near Me"
    const nearMeGap = rankings.find(r =>
        r.rank === null && !r.inLocalPack &&
        r.keyword.includes('near me')
    );

    if (nearMeGap) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Missed "Near Me" Opportunities',
            description: `You aren't ranking for '${nearMeGap.keyword}'. "Near me" searches have grown 900% in recent years and usually signal immediate intent to buy.`,
            impactScore: 6,
            confidenceScore: 90,
            evidence: [],
            metrics: {},
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Ensure specific location/city is mentioned in titles', 'Check NAP consistency']
        });
    }

    // VITAMIN: Long Tail Gaps
    const longTailGaps = rankings.filter(r =>
        r.rank === null &&
        keywords.find(k => k.term === r.keyword)?.category === 'long_tail'
    );

    if (longTailGaps.length > 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Missing Long-Tail Search Intent',
            description: `Potential customers asking questions like "${longTailGaps[0].keyword}" are finding your competitors, not you. These searches translate to high conversion rates.`,
            impactScore: 4,
            confidenceScore: 80,
            evidence: [{ type: 'text', value: longTailGaps[0].keyword, label: 'Example Question' }],
            metrics: {},
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Publish FAQ or Blog content answering these specific questions']
        });
    }

    // POSITIVE: Defending Core Terms
    const topRanks = rankings.filter(r => r.rank !== null && r.rank <= 3);
    if (topRanks.length > 0) {
        findings.push({
            type: 'POSITIVE',
            category: 'Visibility',
            title: 'Top Ranking for Key Terms',
            description: `Excellent work! You are ranking in the top 3 for ${topRanks.length} priority keywords.`,
            impactScore: 3,
            confidenceScore: 100,
            evidence: topRanks.slice(0, 3).map(r => ({
                type: 'metric',
                value: `#${r.rank}`,
                label: r.keyword
            })),
            metrics: { topRankCount: topRanks.length },
            effortEstimate: 'LOW',
            recommendedFix: ['Monitor these rankings to prevent slipping']
        });
    }

    return findings;
}
