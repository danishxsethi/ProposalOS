import { LegacyAuditModuleResult } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { VertexAI } from '@google-cloud/vertexai';
import { traceLlmCall } from '@/lib/tracing';
import { RunTree } from 'langsmith';

function getVertexAI() {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_REGION || 'us-central1';
    if (!projectId) {
        throw new Error('GCP_PROJECT_ID not found in environment variables');
    }
    return new VertexAI({ project: projectId, location });
}

export interface ReputationModuleInput {
    reviews: any[]; // Reviews from GBP module
    businessName: string;
}

interface ReviewAnalysis {
    text: string;
    rating: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    themes: string[];
    hasOwnerResponse: boolean;
    relativePublishTime?: string;
}

interface ReputationAnalysisResult {
    reviews: ReviewAnalysis[];
    summary: {
        negativeRatio: number;
        responseRate: number;
        avgRating: number;
        reviewCount: number;
        commonThemes: string[];
        oldestReviewMonths: number;
    };
}

/**
 * Reputation & Reviews Module
 * Analyzes Google reviews using Gemini to extract sentiment, themes, and response patterns
 */
export async function runReputationModule(
    input: ReputationModuleInput,
    tracker?: CostTracker,
    parentTrace?: RunTree
): Promise<LegacyAuditModuleResult> {
    console.log(`[ReputationModule] Analyzing reviews for ${input.businessName}...`);

    // Gracefully skip if no reviews
    if (!input.reviews || input.reviews.length === 0) {
        console.log('[ReputationModule] No reviews available, skipping...');
        return {
            moduleId: 'reputation-analysis',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                skipped: true,
                reason: 'No reviews available',
            },
        };
    }

    try {
        tracker?.addLlmCall('GEMINI_FLASH', 500, 200); // Estimate ~500 input, 200 output tokens

        const vertexAI = getVertexAI();
        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.0-flash', // Match diagnosis pipeline (llmCluster)
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
            },
        });

        // Extract review text for analysis
        const reviewsForAnalysis = input.reviews.slice(0, 5).map((r: any) => ({
            text: r.text?.text || r.originalText?.text || '',
            rating: r.rating || 0,
            authorName: r.authorAttribution?.displayName || 'Anonymous',
            relativePublishTime: r.relativePublishTimeDescription || '',
            hasOwnerResponse: Boolean(r.ownerResponse),
        }));

        const prompt = `Analyze these business reviews. For each review, classify sentiment (positive/neutral/negative), extract key themes (service, price, wait time, quality, staff, cleanliness, communication, professionalism), and note if the owner responded.

Reviews:
${JSON.stringify(reviewsForAnalysis, null, 2)}

Return JSON in this exact format:
{
  "reviews": [
    {
      "sentiment": "positive" | "neutral" | "negative",
      "themes": ["theme1", "theme2"],
      "hasOwnerResponse": true | false
    }
  ],
  "commonThemes": ["most frequent theme 1", "most frequent theme 2"],
  "negativeThemesSummary": "SPECIFIC summary for negative reviews only. Must include: (1) exact theme/category (e.g. 'wait time', 'staff rudeness'), (2) count (e.g. '3 of 5 negative reviews mention X'), (3) one concrete recommended action. Example: 'Wait time mentioned in 3 of 5 negative reviews — consider adding estimated wait times or a queue system.' Or null if no negative reviews."
}`;

        // Create wrapper for the LLM call
        return traceLlmCall({
            name: "reputation_analysis",
            run_type: "llm",
            inputs: {
                businessName: input.businessName,
                reviewCount: reviewsForAnalysis.length,
                reviews: reviewsForAnalysis
            },
            tags: ["reputation", "gemini-flash"],
            parent: parentTrace
        }, async () => {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const analysis = JSON.parse(responseText);

            // Calculate metrics
            const negativeCount = analysis.reviews.filter(
                (r: any) => r.sentiment === 'negative'
            ).length;
            const responseCount = reviewsForAnalysis.filter((r) => r.hasOwnerResponse).length;
            const avgRating =
                reviewsForAnalysis.reduce((sum, r) => sum + r.rating, 0) / reviewsForAnalysis.length;

            // Estimate oldest review age
            let oldestMonths = 0;
            for (const r of reviewsForAnalysis) {
                const timeStr = r.relativePublishTime?.toLowerCase() || '';
                if (timeStr.includes('year')) {
                    const years = parseInt(timeStr) || 1;
                    oldestMonths = Math.max(oldestMonths, years * 12);
                } else if (timeStr.includes('month')) {
                    const months = parseInt(timeStr) || 1;
                    oldestMonths = Math.max(oldestMonths, months);
                }
            }

            const reputationData: ReputationAnalysisResult = {
                reviews: reviewsForAnalysis.map((r, i) => ({
                    text: r.text.substring(0, 200),
                    rating: r.rating,
                    sentiment: analysis.reviews[i]?.sentiment || 'neutral',
                    themes: analysis.reviews[i]?.themes || [],
                    hasOwnerResponse: r.hasOwnerResponse,
                    relativePublishTime: r.relativePublishTime,
                })),
                summary: {
                    negativeRatio: negativeCount / reviewsForAnalysis.length,
                    responseRate: responseCount / reviewsForAnalysis.length,
                    avgRating: Math.round(avgRating * 10) / 10,
                    reviewCount: reviewsForAnalysis.length,
                    commonThemes: analysis.commonThemes || [],
                    oldestReviewMonths: oldestMonths,
                },
            };

            return {
                moduleId: 'reputation-analysis',
                status: 'success',
                timestamp: new Date().toISOString(),
                data: {
                    ...reputationData,
                    negativeThemesSummary: analysis.negativeThemesSummary,
                },
            };
        }, (result) => {
            // Callback for token usage if we could get it, but we need the raw response object
            // which is internal to the closure.
            // For now, simple return 0s or we'd need to change return type of wrapper.
            // But we can just rely on the side-effect tracker we already have!
            // Wait, I removed the tracker logic in previous file, but here I should keep it?
            // Yes, I should keep the tracker logic inside the wrapper.
            // And tracing logic handles the rest.
            return { prompt: 0, completion: 0, model: 'gemini-2.0-flash' };
        });
    } catch (error) {
        console.error('[ReputationModule] Error:', error);
        return {
            moduleId: 'reputation-analysis',
            status: 'failed',
            timestamp: new Date().toISOString(),
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
