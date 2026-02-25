import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { crawlWebsite } from './websiteCrawler';
import { runGbpDeepModule } from './gbpDeep';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cachedFetch } from '@/lib/cache/apiCache';

export interface CompetitorStrategyInput {
    businessName: string;
    industry: string;
    city: string;
    websiteUrl: string;
    competitorName: string;
    competitorWebsite: string;
    competitorPlaceId?: string;
}

interface CompetitorInsight {
    category: 'Website' | 'Reputation' | 'Content' | 'Strategy';
    observation: string;
    advantage: 'Competitor' | 'Us' | 'Neutral';
    recommendation: string;
}

interface StrategicAnalysis {
    competitorStrengths: string[];
    competitorWeaknesses: string[];
    quickWins: string[]; // Easy copy-cat moves
    overtakeStrategy: string[]; // Long term moves
    ourAdvantages: string[];
    insights: CompetitorInsight[];
}

/**
 * Run Competitor Strategy Module
 */
export async function runCompetitorStrategyModule(
    input: CompetitorStrategyInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ businessName: input.businessName, competitor: input.competitorName }, '[CompetitorStrategy] Starting deep analysis');

    if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error('GOOGLE_AI_API_KEY is missing');
    }

    try {
        // 1. Mini-Audit Target Business (if not already known, but usually we iterate this)
        // For efficiency, we assume we might leverage existing audit data, but here we run a fresh lightweight check or expect inputs.
        // To be self-contained, we'll scan the competitor using our existing tools.

        // A. Crawl Competitor (5 pages)
        tracker?.addApiCall('CRAWLER_COMPETITOR');
        const competitorCrawl = await crawlWebsite({
            url: input.competitorWebsite,
            businessName: input.competitorName
        });

        // B. Analyze Competitor GBP
        let competitorGbp = null;
        if (input.competitorPlaceId || input.competitorName) {
            tracker?.addApiCall('GBP_COMPETITOR');
            // We reuse the GBP module logic but just for data fetching
            competitorGbp = await runGbpDeepModule({
                businessName: input.competitorName,
                city: input.city,
                placeId: input.competitorPlaceId, // Optional
                websiteUrl: input.competitorWebsite
            }, tracker);
        }

        // 2. Prepare Data for AI
        const competitorData = {
            name: input.competitorName,
            website: {
                title: competitorCrawl.crawledPages[0]?.title,
                wordCount: competitorCrawl.avgWordCount,
                loadTime: competitorCrawl.avgLoadTimeMs,
                pages: competitorCrawl.totalPagesFound,
                tech: 'Unknown' // Could run tech stack but keep it simple
            },
            gbp: competitorGbp ? {
                rating: competitorGbp.evidenceSnapshots[0].rawResponse.reviews.rating,
                reviewCount: competitorGbp.evidenceSnapshots[0].rawResponse.reviews.totalCount,
                velocity: competitorGbp.evidenceSnapshots[0].rawResponse.reviews.velocity,
                completeness: competitorGbp.evidenceSnapshots[0].rawResponse.completeness.score
            } : 'Not found'
        };

        const ourData = { // We assume the main audit runs elsewhere and we might need to pass this or just focus on "What they do"
            // For this module, the comparison is often qualitative based on what the competitor HAS.
            // We'll ask AI to infer "standard" vs "competitor" or pass minimal knowns.
            name: input.businessName,
            websiteUrl: input.websiteUrl
        };

        // 3. AI Strategic Analysis
        const analysis = await generateStrategicAnalysis(ourData, competitorData, input, tracker);

        // 4. Generate Findings
        const findings = generateStrategyFindings(analysis, input);

        const evidenceSnapshot = {
            module: 'competitor_strategy',
            source: 'gemini_comparative',
            rawResponse: analysis,
            collectedAt: new Date(),
        };

        logger.info({
            businessName: input.businessName,
            competitor: input.competitorName
        }, '[CompetitorStrategy] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, businessName: input.businessName }, '[CompetitorStrategy] Analysis failed');
        // Return VITAMIN error finding
        return {
            findings: [],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Generate Comparative Analysis with Gemini
 */
async function generateStrategicAnalysis(
    me: any,
    them: any,
    context: CompetitorStrategyInput,
    tracker?: CostTracker
): Promise<StrategicAnalysis> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    tracker?.addApiCall('GEMINI_STRATEGY');

    const prompt = `Compare these two local businesses in ${context.industry}:

    BUSINESS A (Audited Client): ${JSON.stringify(me)}
    BUSINESS B (Top Competitor): ${JSON.stringify(them)}

    Analyze what Business B is doing to win.
    
    1. What is Business B doing better? List 5 specific things (e.g., "Online booking", "Video testimonials", "Faster site").
    2. What is Business B's apparent strategy? (e.g., 'review-focused', 'content-heavy').
    3. What can Business A copy immediately? (Quick Wins).
    4. What would it take for Business A to overtake Business B?
    5. Where does Business A actually have an advantage (or potential)?

    Return JSON:
    {
        "competitorStrengths": ["string"],
        "competitorWeaknesses": ["string"],
        "quickWins": ["string"],
        "overtakeStrategy": ["string"],
        "ourAdvantages": ["string"],
        "insights": [
             { "category": "Website"|"Reputation"|"Content", "observation": "They have X", "advantage": "Competitor", "recommendation": "Do Y" }
        ]
    }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanJson = text.replace(/```json|```/g, '').trim();

    return JSON.parse(cleanJson);
}

/**
 * Generate Findings
 */
function generateStrategyFindings(analysis: StrategicAnalysis, input: CompetitorStrategyInput): Finding[] {
    const findings: Finding[] = [];

    // VITAMIN: Specific Competitor Advantages
    analysis.insights.filter(i => i.advantage === 'Competitor').slice(0, 3).forEach(insight => {
        findings.push({
            type: 'VITAMIN',
            category: 'Competitive',
            title: `Competitor Strategy: ${insight.observation}`,
            description: `${input.competitorName} is using this to win customers. ${insight.recommendation}`,
            impactScore: 6,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{ type: 'text', value: insight.observation, label: 'Competitor Tactic' }],
            metrics: {},
            effortEstimate: 'MEDIUM',
            recommendedFix: [insight.recommendation]
        });
    });

    // POSITIVE: Our Advantages
    if (analysis.ourAdvantages.length > 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Competitive',
            title: 'Your Competitive Advantage',
            description: `You have an edge over ${input.competitorName} in these areas: ${analysis.ourAdvantages.join(', ')}.`,
            impactScore: 3,
            confidenceScore: normalizeConfidence(80, '0-100'),
            evidence: [],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Double down on these strengths']
        });
    }

    return findings;
}
