/**
 * OpenAI Provider Implementation
 *
 * Implements the LLM provider interface for OpenAI APIs.
 * Supports GPT-4, GPT-4 Turbo, GPT-3.5 Turbo models.
 */

import OpenAI from 'openai';

import { logger } from '@/lib/logger';

import {
  ClassifiedError,
  ErrorType,
  LLMProvider,
  LLMProviderInterface,
  ProviderCallOptions,
  ProviderModel,
  ProviderResponse,
} from '../types';

// OpenAI model configurations
const OPENAI_MODELS: Record<string, ProviderModel> = {
  'gpt-4': {
    provider: LLMProvider.OPENAI,
    modelName: 'gpt-4',
    contextWindow: 8192,
    inputCostPer1k: 0.03,
    outputCostPer1k: 0.06,
  },
  'gpt-4-turbo': {
    provider: LLMProvider.OPENAI,
    modelName: 'gpt-4-turbo',
    contextWindow: 128000,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
  },
  'gpt-4o': {
    provider: LLMProvider.OPENAI,
    modelName: 'gpt-4o',
    contextWindow: 128000,
    inputCostPer1k: 0.005,
    outputCostPer1k: 0.015,
  },
  'gpt-3.5-turbo': {
    provider: LLMProvider.OPENAI,
    modelName: 'gpt-3.5-turbo',
    contextWindow: 16385,
    inputCostPer1k: 0.0005,
    outputCostPer1k: 0.0015,
  },
};

export class OpenAIProvider implements LLMProviderInterface {
  private client: OpenAI | null = null;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
  }

  private getClient(): OpenAI {
    if (!this.client) {
      if (!this.apiKey) {
        throw new Error('OPENAI_API_KEY environment variable not set');
      }
      this.client = new OpenAI({
        apiKey: this.apiKey,
        timeout: 30000,
        maxRetries: 2,
      });
    }
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  getModelInfo(modelName: string): ProviderModel {
    return OPENAI_MODELS[modelName] ?? OPENAI_MODELS['gpt-3.5-turbo']!;
  }

  async generateContent(options: ProviderCallOptions): Promise<ProviderResponse> {
    const client = this.getClient();
    const modelInfo = this.getModelInfo(options.model);

    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (typeof options.input === 'string') {
      messages.push({ role: 'user', content: options.input });
    } else {
      // Handle multimodal content
      const content: (
        | OpenAI.Chat.Completions.ChatCompletionContentPartText
        | OpenAI.Chat.Completions.ChatCompletionContentPartImage
      )[] = [];
      for (const item of options.input) {
        if (item.type === 'text') {
          content.push({ type: 'text', text: item.data as string });
        } else if (item.type === 'image') {
          const base64Data = Buffer.isBuffer(item.data) ? item.data.toString('base64') : item.data;
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${item.mimeType || 'image/png'};base64,${base64Data}`,
            },
          });
        }
      }
      messages.push({ role: 'user', content });
    }

    // Build request
    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxOutputTokens ?? 2048,
    };

    if (options.responseModality === 'json') {
      request.response_format = { type: 'json_object' };
    }

    if (options.tools && options.tools.length > 0) {
      request.tools = options.tools;
    }

    const startTime = Date.now();

    try {
      const completion = await client.chat.completions.create(request);
      const endTime = Date.now();

      const message = completion.choices[0]?.message;
      const text = message?.content || '';
      const functionCalls = message?.tool_calls;

      const usage = completion.usage;

      logger.debug(
        {
          provider: LLMProvider.OPENAI,
          model: options.model,
          latencyMs: endTime - startTime,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
        },
        'OpenAI API call completed'
      );

      return {
        text,
        functionCalls,
        usageMetadata: {
          promptTokenCount: usage?.prompt_tokens,
          candidatesTokenCount: usage?.completion_tokens,
        },
        provider: LLMProvider.OPENAI,
        model: options.model,
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
      const retryAfter = error?.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
      return {
        type: ErrorType.TRANSIENT,
        error,
        retryable: true,
        retryAfterMs,
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

    // Authentication/Authorization errors - permanent
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

    // Unknown error
    return {
      type: ErrorType.UNKNOWN,
      error,
      retryable: false,
      shouldFallback: true,
    };
  }
}

// Singleton instance
export const openAIProvider = new OpenAIProvider();

export default openAIProvider;
