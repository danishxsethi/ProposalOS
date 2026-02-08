import { GoogleGenerativeAI } from '@google/generative-ai';
import { traceable } from 'langsmith/traceable';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';

export interface Review {
    authorName: string;
    rating: number; // 1-5
    text: string;
    publishTime: string;
    response?: string; // If already responded
}

export interface ReviewResponse {
    review: Review;
    draftResponse: string;
    tone: 'Professional' | 'Empathetic' | 'Grateful';
}

export interface ReviewResponseInput {
    businessName: string;
    industry: string;
    city: string;
    reviews: Review[];
}

/**
 * Generate drafts for unanswered reviews
 */
export async function generateReviewResponses(
    input: ReviewResponseInput,
    tracker?: CostTracker
): Promise<ReviewResponse[]> {
    logger.info({ businessName: input.businessName }, '[ReviewResponses] Generating drafts');

    if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error('GOOGLE_AI_API_KEY is missing');
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // Pro for high quality writing

    // Filter for unanswered reviews (or those with empty responses)
    // Limit to top 5 most relevant (recent/long) to save costs and focus on impact
    const unansweredReviews = input.reviews
        .filter(r => !r.response)
        .sort((a, b) => b.text.length - a.text.length) // Prioritize longer reviews
        .slice(0, 5);

    if (unansweredReviews.length === 0) {
        logger.info('[ReviewResponses] No unanswered reviews found');
        return [];
    }

    const responses: ReviewResponse[] = [];

    // Parallel generation
    const promises = unansweredReviews.map(async (review) => {
        tracker?.addApiCall('GEMINI_REVIEW_RESPONSE');
        try {
            const draft = await generateSingleResponse(model, review, input);
            return {
                review,
                draftResponse: draft,
                tone: review.rating >= 4 ? 'Grateful' : 'Empathetic'
            };
        } catch (error) {
            logger.warn({ error, reviewAuth: review.authorName }, '[ReviewResponses] Failed to draft response');
            return null;
        }
    });

    const results = await Promise.all(promises);

    // Filter out failed generations
    return results.filter((r): r is ReviewResponse => r !== null);
}

/**
 * Generate single response using Gemini
 */
const generateSingleResponse = traceable(
    async (model: any, review: Review, context: ReviewResponseInput): Promise<string> => {
        const isPositive = review.rating >= 4;

        const instructions = isPositive
            ? `POSITIVE REVIEW STRATEGY:
               - Thank them by name (if valid name)
               - Reference specific details they mentioned
               - Reinforce our strengths
               - Warm, genuine tone (not corporate)
               - Invite them back`
            : `NEGATIVE REVIEW STRATEGY:
               - Acknowledge frustration
               - Apologize without admitting legal fault
               - Take conversation offline ("Please call us at...")
               - Professional, empathetic, solution-oriented tone
               - NEVER argue or blame`;

        const prompt = `You are the owner of ${context.businessName}, a ${context.industry} in ${context.city}.
        Write a response to this Google review.

        REVIEWER: ${review.authorName}
        RATING: ${review.rating} stars
        TEXT: "${review.text}"

        ${instructions}

        RULES:
        - Max 3 sentences
        - No emojis
        - No placeholders like "[Phone Number]" (just say "call our office")
        - Genuine human voice
        
        DRAFT RESPONSE:`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    },
    { name: 'generate_review_response', run_type: 'llm' }
);
