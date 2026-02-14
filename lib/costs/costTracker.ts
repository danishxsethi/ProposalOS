/**
 * Cost tracking for external APIs and LLMs
 */
import { logger } from '@/lib/logger';

export const COSTS = {
    PAGESPEED_COST_CENTS: 0,
    PLACES_TEXT_SEARCH_CENTS: 3, // $0.032 -> 3 cents
    PLACES_DETAILS_CENTS: 2, // $0.017 -> 2 cents
    SERP_API_CENTS: 1, // $0.01 -> 1 cent
    GEMINI_FLASH_PER_1K_INPUT_CENTS: 0.01,
    GEMINI_FLASH_PER_1K_OUTPUT_CENTS: 0.03,
    GEMINI_PRO_PER_1K_INPUT_CENTS: 0.07,
    GEMINI_PRO_PER_1K_OUTPUT_CENTS: 0.21,
};

// User only specified input costs. I will stick to their request for input primarily
// but logic should support output if needed.
// "GEMINI_FLASH_PER_1K_INPUT_CENTS = 0.01 (essentially free)"
// "GEMINI_PRO_PER_1K_INPUT_CENTS = 0.07"

export type ApiType =
    | 'PAGESPEED'
    | 'PLACES_TEXT_SEARCH'
    | 'PLACES_DETAILS'
    | 'SERP_API'
    | 'SERP'
    | 'PLACES_DETAILS_DEEP'
    | 'GEMINI_FLASH'
    | 'GEMINI_PRO'
    | 'GEMINI'
    | 'GEMINI_STRATEGY'
    | 'GEMINI_KEYWORD_GEN'
    | 'GEMINI_PHOTO_ANALYSIS'
    | 'SERP_API_SEARCH'
    | 'CRAWLER_COMPETITOR'
    | 'GBP_COMPETITOR'
    | 'GEMINI_ACTION_PLAN'
    | 'GEMINI_REVIEW_RESPONSE';
export type LlmModel = 'GEMINI_FLASH' | 'GEMINI_PRO';

export class CostTracker {
    private totalCents: number = 0;
    private usage: Record<string, number> = {};

    constructor() { }

    /**
     * Add cost for standard API calls
     */
    addApiCall(api: ApiType, count: number = 1) {
        let costPerCall = 0;
        switch (api) {
            case 'PAGESPEED':
                costPerCall = COSTS.PAGESPEED_COST_CENTS;
                break;
            case 'PLACES_TEXT_SEARCH':
                costPerCall = COSTS.PLACES_TEXT_SEARCH_CENTS;
                break;
            case 'PLACES_DETAILS':
                costPerCall = COSTS.PLACES_DETAILS_CENTS;
                break;
            case 'SERP_API':
            case 'SERP':
                costPerCall = COSTS.SERP_API_CENTS;
                break;
        }

        const cost = costPerCall * count;
        this.totalCents += cost;
        this.usage[api] = (this.usage[api] || 0) + count;
    }

    /**
     * Add cost for LLM usage
     */
    addLlmCall(model: LlmModel, inputTokens: number, outputTokens: number = 0) {
        let inputCostPer1k = 0;
        let outputCostPer1k = 0;

        switch (model) {
            case 'GEMINI_FLASH':
                inputCostPer1k = COSTS.GEMINI_FLASH_PER_1K_INPUT_CENTS;
                outputCostPer1k = COSTS.GEMINI_FLASH_PER_1K_OUTPUT_CENTS;
                break;
            case 'GEMINI_PRO':
                inputCostPer1k = COSTS.GEMINI_PRO_PER_1K_INPUT_CENTS;
                outputCostPer1k = COSTS.GEMINI_PRO_PER_1K_OUTPUT_CENTS;
                break;
        }

        const inputCost = (inputTokens / 1000) * inputCostPer1k;
        const outputCost = (outputTokens / 1000) * outputCostPer1k;
        const cost = inputCost + outputCost;

        this.totalCents += cost;

        const key = `LLM_${model}`;
        this.usage[key] = (this.usage[key] || 0) + 1;
        this.usage[`${key}_INPUT_TOKENS`] = (this.usage[`${key}_INPUT_TOKENS`] || 0) + inputTokens;
        this.usage[`${key}_OUTPUT_TOKENS`] = (this.usage[`${key}_OUTPUT_TOKENS`] || 0) + outputTokens;

        logger.info({
            event: 'llm.call',
            model,
            inputTokens,
            outputTokens,
            inputCost_cents: inputCost,
            outputCost_cents: outputCost,
            total_cost_cents: cost
        }, 'LLM call tracked');
    }

    /**
     * Get total accumulated cost in cents (rounded to nearest integer)
     */
    getTotalCents(): number {
        return Math.ceil(this.totalCents);
    }

    /**
     * Get detailed usage report
     */
    getReport() {
        return {
            totalCents: this.getTotalCents(),
            usage: this.usage
        };
    }
}
