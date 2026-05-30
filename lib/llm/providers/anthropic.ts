/**
 * Anthropic Provider Implementation
 *
 * Implements the LLM provider interface for Anthropic APIs.
 * Supports Claude 3 Opus, Sonnet, and Haiku models.
 */

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

// Anthropic model configurations
const ANTHROPIC_MODELS: Record<string, ProviderModel> = {
  'claude-3-opus-20240229': {
    provider: LLMProvider.ANTHROPIC,
    modelName: 'claude-3-opus-20240229',
    contextWindow: 200000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
  },
  'claude-3-sonnet-20240229': {
    provider: LLMProvider.ANTHROPIC,
    modelName: 'claude-3-sonnet-20240229',
    contextWindow: 200000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
  },
  'claude-3-haiku-20240307': {
    provider: LLMProvider.ANTHROPIC,
    modelName: 'claude-3-haiku-20240307',
    contextWindow: 200000,
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
  },
  'claude-3-5-sonnet-20241022': {
    provider: LLMProvider.ANTHROPIC,
    modelName: 'claude-3-5-sonnet-20241022',
    contextWindow: 200000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
  },
};

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    data: string;
    media_type: string;
  };
}

export class AnthropicProvider implements LLMProviderInterface {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  getModelInfo(modelName: string): ProviderModel {
    return ANTHROPIC_MODELS[modelName] ?? ANTHROPIC_MODELS['claude-3-haiku-20240307']!;
  }

  async generateContent(options: ProviderCallOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }

    const modelInfo = this.getModelInfo(options.model);

    // Build messages
    let content: string | AnthropicContentBlock[];
    if (typeof options.input === 'string') {
      content = options.input;
    } else {
      content = options.input.map((item) => {
        if (item.type === 'text') {
          return { type: 'text', text: item.data as string };
        } else if (item.type === 'image') {
          const base64Data = Buffer.isBuffer(item.data) ? item.data.toString('base64') : item.data;
          return {
            type: 'image',
            source: {
              type: 'base64',
              data: base64Data,
              media_type: item.mimeType || 'image/png',
            },
          };
        }
        return { type: 'text', text: '' };
      });
    }

    const messages: AnthropicMessage[] = [{ role: 'user', content }];

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxOutputTokens ?? 2048,
          messages,
        }),
      });

      const endTime = Date.now();

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorBody}`);
      }

      const data = await response.json();

      const text = data.content?.[0]?.text || '';
      const usage = data.usage;

      logger.debug(
        {
          provider: LLMProvider.ANTHROPIC,
          model: options.model,
          latencyMs: endTime - startTime,
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
        },
        'Anthropic API call completed'
      );

      return {
        text,
        functionCalls: undefined, // Anthropic tool calls would be in content array
        usageMetadata: {
          promptTokenCount: usage?.input_tokens,
          candidatesTokenCount: usage?.output_tokens,
        },
        provider: LLMProvider.ANTHROPIC,
        model: options.model,
      };
    } catch (error: any) {
      throw this.classifyError(error);
    }
  }

  classifyError(error: any): ClassifiedError {
    const statusCode = error?.status || error?.response?.status;

    // Rate limit
    if (statusCode === 429) {
      return {
        type: ErrorType.TRANSIENT,
        error,
        retryable: true,
        retryAfterMs: 60000, // Anthropic typically suggests 60s retry
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
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
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
export const anthropicProvider = new AnthropicProvider();

export default anthropicProvider;
