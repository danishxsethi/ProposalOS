import { RunTree } from 'langsmith';

import { GEMINI_FLASH, GEMINI_PRO } from '@/lib/config/models';
import { CostTracker } from '@/lib/costs/costTracker';
import { generateWithGemini } from '@/lib/llm/provider';
import { logger } from '@/lib/logger';
import { traceLlmCall } from '@/lib/tracing';

import { LegacyAuditModuleResult } from './types';


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
  logger.info({ businessName: input.businessName }, '[ReputationModule] Analyzing reviews');

  // Gracefully skip if no reviews
  if (!input.reviews || input.reviews.length === 0) {
    logger.info('[ReputationModule] No reviews available, skipping');
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
    // Routed through the canonical LLM façade: API-key or Vertex auth, retry,
    // circuit breaker, output validation and real token-based cost accounting.
    // (Previously hardcoded to the Vertex SDK → failed with "GCP_PROJECT_ID not
    // found" on every API-key deployment.)

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
    return traceLlmCall(
      {
        name: 'reputation_analysis',
        run_type: 'llm',
        inputs: {
          businessName: input.businessName,
          reviewCount: reviewsForAnalysis.length,
          reviews: reviewsForAnalysis,
        },
        tags: ['reputation', 'gemini-flash'],
        parent: parentTrace,
      },
      async () => {
        const llm = await generateWithGemini({
          model: GEMINI_FLASH,
          input: prompt,
          temperature: 0,
          maxOutputTokens: 4096,
          responseModality: 'json',
          node: 'reputation.review_analysis',
        } as Parameters<typeof generateWithGemini>[0]);
        const promptTokens = llm.usageMetadata?.promptTokenCount ?? 500;
        const completionTokens = llm.usageMetadata?.candidatesTokenCount ?? 200;
        tracker?.addLlmCall('GEMINI_FLASH', promptTokens, completionTokens);
        const responseText = String(llm.text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        const analysis = JSON.parse(responseText);
        if (!Array.isArray(analysis?.reviews)) throw new Error('Reputation analysis returned no reviews array');

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
      },
      (result) => {
        // Token usage isn't available here — it requires the raw model response,
        // which is internal to the `traceLlmCall` closure above. Cost is already
        // tracked via `tracker?.addLlmCall(...)` (fixed estimate) at call start;
        // this callback only supplies the tracing metadata `traceLlmCall` expects.
        return { prompt: 0, completion: 0, model: GEMINI_FLASH };
      }
    );
  } catch (error) {
    logger.error({ error }, '[ReputationModule] Error');
    return {
      moduleId: 'reputation-analysis',
      status: 'failed',
      timestamp: new Date().toISOString(),
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
