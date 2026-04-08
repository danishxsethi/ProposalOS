/**
 * Google Provider Implementation
 *
 * Implements the LLM provider interface for Google AI/Vertex APIs.
 * Wraps the existing generateWithGemini function for provider abstraction.
 */

import { logger } from '@/lib/logger';

import { MultimodalContent, generateWithGemini as originalGenerateWithGemini } from '../provider';
import {
  ClassifiedError,
  ErrorType,
  LLMProvider,
  LLMProviderInterface,
  ProviderCallOptions,
  ProviderModel,
  ProviderResponse,
} from '../types';

// Google model configurations
const GOOGLE_MODELS: Record<string, ProviderModel> = {
  'gemini-2.0-flash': {
    provider: LLMProvider.GOOGLE_AI,
    modelName: 'gemini-2.0-flash',
    contextWindow: 1000000,
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0003,
  },
  'gemini-2.0-pro': {
    provider: LLMProvider.GOOGLE_AI,
    modelName: 'gemini-2.0-pro',
    contextWindow: 1000000,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.00375,
  },
  'gemini-1.5-pro': {
    provider: LLMProvider.GOOGLE_AI,
    modelName: 'gemini-1.5-pro',
    contextWindow: 1000000,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.00375,
  },
  'gemini-1.5-flash': {
    provider: LLMProvider.GOOGLE_AI,
    modelName: 'gemini-1.5-flash',
    contextWindow: 1000000,
    inputCostPer1k: 0.000075,
    outputCostPer1k: 0.0003,
  },
};

export class GoogleProvider implements LLMProviderInterface {
  async isAvailable(): Promise<boolean> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const hasVertex = !!process.env.GCP_PROJECT_ID && !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return !!apiKey || hasVertex;
  }

  getModelInfo(modelName: string): ProviderModel {
    return GOOGLE_MODELS[modelName] || GOOGLE_MODELS['gemini-2.0-flash'];
  }

  async generateContent(options: ProviderCallOptions): Promise<ProviderResponse> {
    const startTime = Date.now();

    try {
      // Convert our types to the existing provider.ts types
      const result = await originalGenerateWithGemini({
        model: options.model,
        input: options.input,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        thinkingBudget: options.thinkingBudget,
        responseModality: options.responseModality,
        tools: options.tools,
        toolConfig: options.toolConfig,
        metadata: options.metadata,
      });

      const endTime = Date.now();

      logger.debug(
        {
          provider: LLMProvider.GOOGLE_AI,
          model: options.model,
          latencyMs: endTime - startTime,
          inputTokens: result.usageMetadata?.promptTokenCount,
          outputTokens: result.usageMetadata?.candidatesTokenCount,
        },
        'Google AI API call completed'
      );

      return {
        text: result.text,
        functionCalls: result.functionCalls,
        usageMetadata: {
          promptTokenCount: result.usageMetadata?.promptTokenCount,
          candidatesTokenCount: result.usageMetadata?.candidatesTokenCount,
          thoughtsTokenCount: result.usageMetadata?.thoughtsTokenCount,
        },
        provider: LLMProvider.GOOGLE_AI,
        model: options.model,
        cached: result.cached,
      };
    } catch (error: any) {
      throw this.classifyError(error);
    }
  }

  classifyError(error: any): ClassifiedError {
    const statusCode = error?.status || error?.response?.status;
    const code = error?.code;

    // Rate limit
    if (statusCode === 429) {
      return {
        type: ErrorType.TRANSIENT,
        error,
        retryable: true,
        retryAfterMs: error?.headers?.['retry-after']
          ? parseInt(error.headers['retry-after']) * 1000
          : 60000,
        shouldFallback: true,
      };
    }

    // Server errors
    if (statusCode >= 500 && statusCode < 600) {
      return {
        type: ErrorType.TRANSIENT,
        error,
        retryable: true,
        shouldFallback: true,
      };
    }

    // Auth errors - permanent
    if (statusCode === 401 || statusCode === 403) {
      return {
        type: ErrorType.PERMANENT,
        error,
        retryable: false,
        shouldFallback: true,
      };
    }

    // Invalid request - permanent
    if (statusCode === 400) {
      return {
        type: ErrorType.PERMANENT,
        error,
        retryable: false,
        shouldFallback: false,
      };
    }

    // Network errors - transient
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
      return {
        type: ErrorType.TRANSIENT,
        error,
        retryable: true,
        shouldFallback: true,
      };
    }

    // Budget exceeded - permanent (don't retry, but do fallback)
    if (error?.name === 'BudgetExceededError') {
      return {
        type: ErrorType.PERMANENT,
        error,
        retryable: false,
        shouldFallback: true,
      };
    }

    // Unknown
    return {
      type: ErrorType.UNKNOWN,
      error,
      retryable: false,
      shouldFallback: true,
    };
  }
}

// Wrapper function to match provider interface
async function generateWithGemini(options: ProviderCallOptions): Promise<{
  text: string;
  functionCalls?: any[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  cached?: boolean;
}> {
  return originalGenerateWithGemini({
    model: options.model,
    input: options.input,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    thinkingBudget: options.thinkingBudget,
    responseModality: options.responseModality,
    tools: options.tools,
    toolConfig: options.toolConfig,
    metadata: options.metadata,
  });
}

// Singleton instance
export const googleProvider = new GoogleProvider();

export default googleProvider;
