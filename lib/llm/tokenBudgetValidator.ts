/**
 * Token Budget Validator
 * 
 * Validates whether an LLM generation request fits within the remaining
 * context window and budget constraints before dispatching the remote API call,
 * preventing wasted execution time and API errors.
 * 
 * Requirement: 2B (Cost Control & Engine Limits)
 */

import { LLMCallOptions } from './provider';

// Model context configurations
const MODEL_LIMITS: Record<string, { maxContext: number; maxOutput: number }> = {
    'gemini-3.1-pro': { maxContext: 2000000, maxOutput: 8192 },
    'gemini-3.1-flash': { maxContext: 1000000, maxOutput: 8192 },
    'gemini-2.5-flash': { maxContext: 1000000, maxOutput: 8192 },
    'gemini-2.0-pro': { maxContext: 2000000, maxOutput: 8192 },
};

/**
 * Heuristically estimates the token count of an input string
 * (Roughly 4 characters per token for Gemini models)
 */
function estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Validates if the requested options, thinking budget, and input size
 * fall within the model's physical and configured constraints.
 * 
 * @param opts Options passed to the generator
 * @param modelTarget The resolved model string (e.g. 'gemini-3.1-pro')
 * @returns { valid: boolean, reason?: string, estimatedTokens?: number }
 */
export function validateTokenBudget(opts: LLMCallOptions, modelTarget: string): { valid: boolean; reason?: string; estimatedTokens?: number } {
    const limits = MODEL_LIMITS[modelTarget] || MODEL_LIMITS['gemini-3.1-flash']; // Fallback

    // 1. Calculate thinking budget 
    const thinkingBudget = opts.thinkingBudget || 0;
    if (thinkingBudget > 0 && modelTarget.includes('flash')) {
        // Note: Gemini 3.1 Flash does not natively support thinking budget natively yet,
        // we just ignore it in the provider. But here we flag it for logging/debugging context.
    }

    // 2. Estimate input token count
    let estimatedInputTokens = 0;
    if (typeof opts.input === 'string') {
        estimatedInputTokens = estimateTokenCount(opts.input);
    } else {
        // Array of MultimodalContent
        for (const part of opts.input) {
            if (part.type === 'text' && typeof part.data === 'string') {
                estimatedInputTokens += estimateTokenCount(part.data);
            } else if (part.type === 'image') {
                // Flat estimate: 258 tokens per standard image for Gemini
                estimatedInputTokens += 258;
            } else if (part.type === 'pdf') {
                // Flat estimate: ~1000 tokens per PDF page, guessing 5 pages avg for validation
                estimatedInputTokens += 5000;
            }
        }
    }

    // 3. Prevent requests that exceed the model's total context limit
    const expectedOutput = opts.maxOutputTokens || 2048;
    const totalExpected = estimatedInputTokens + expectedOutput + thinkingBudget;

    if (totalExpected > limits.maxContext) {
        return {
            valid: false,
            reason: `Estimated total tokens (${totalExpected}) exceeds maximum context window (${limits.maxContext}) for model ${modelTarget}`,
            estimatedTokens: totalExpected
        };
    }

    // 4. Ensure requested maxOutputTokens doesn't exceed physical limitations
    if (expectedOutput > limits.maxOutput) {
        return {
            valid: false,
            reason: `Requested max output tokens (${expectedOutput}) exceeds model limitation (${limits.maxOutput})`,
            estimatedTokens: totalExpected
        };
    }

    // 5. Ensure thinking budget leaves room for the actual output
    if (thinkingBudget > 0 && expectedOutput <= thinkingBudget + 10) {
        return {
            valid: false,
            reason: `Thinking budget (${thinkingBudget}) consumes all requested output tokens (${expectedOutput}). Leaving no room for response.`,
            estimatedTokens: totalExpected
        };
    }

    return {
        valid: true,
        estimatedTokens: totalExpected
    };
}
