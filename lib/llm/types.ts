/**
 * LLM Provider Interface and Types
 *
 * Defines the abstraction layer for multiple LLM providers.
 * Enables provider switching and fallback chains.
 */

import { MultimodalContent } from './provider';

/**
 * Supported LLM providers
 */
export enum LLMProvider {
  GOOGLE_AI = 'google-ai',
  GOOGLE_VERTEX = 'google-vertex',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

/**
 * Provider-specific model mappings
 */
export interface ProviderModel {
  provider: LLMProvider;
  modelName: string;
  contextWindow: number;
  inputCostPer1k: number; // USD
  outputCostPer1k: number; // USD
}

/**
 * Standardized LLM call options across all providers
 */
export interface ProviderCallOptions {
  provider: LLMProvider;
  model: string;
  input: string | MultimodalContent[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  responseModality?: 'text' | 'json' | 'multimodal';
  tools?: any[];
  toolConfig?: any;
  metadata?: {
    node?: string;
    auditId?: string;
    qaScore?: number;
    experimentId?: string;
    variantId?: string;
    tenantId?: string;
    userId?: string;
    timeoutMs?: number;
    useCache?: boolean;
    skipValidation?: boolean;
  };
}

/**
 * Standardized LLM response across all providers
 */
export interface ProviderResponse {
  text: string;
  functionCalls?: any[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  provider: LLMProvider;
  model: string;
  cached?: boolean;
}

/**
 * Provider interface that all implementations must follow
 */
export interface LLMProviderInterface {
  /**
   * Generate content using the provider's API
   */
  generateContent(options: ProviderCallOptions): Promise<ProviderResponse>;

  /**
   * Generate streaming content
   */
  generateContentStream?(options: ProviderCallOptions): AsyncGenerator<string, void, unknown>;

  /**
   * Check if provider is available/healthy
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get provider-specific model info
   */
  getModelInfo(modelName: string): ProviderModel;
}

/**
 * Provider registry entry
 */
export interface ProviderEntry {
  provider: LLMProvider;
  instance: LLMProviderInterface;
  priority: number; // Lower = higher priority
  enabled: boolean;
}

/**
 * Error types for error classification
 */
export enum ErrorType {
  TRANSIENT = 'transient', // Retry recommended (rate limit, timeout, network)
  PERMANENT = 'permanent', // Do not retry (auth error, invalid request, quota exceeded)
  UNKNOWN = 'unknown',
}

/**
 * Classified error with metadata
 */
export interface ClassifiedError {
  type: ErrorType;
  error: Error;
  retryable: boolean;
  retryAfterMs?: number;
  shouldFallback: boolean;
}

/**
 * Fallback chain result
 */
export interface FallbackResult {
  success: boolean;
  response?: ProviderResponse;
  error?: ClassifiedError;
  attemptsMade: {
    provider: LLMProvider;
    model: string;
    error?: string;
  }[];
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  provider: LLMProvider;
  healthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  latencyMs?: number;
}
