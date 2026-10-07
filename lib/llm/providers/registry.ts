/**
 * Provider registry for the Amazon Bedrock runtime.
 *
 * Keeps the shared provider interface and health tracking used by existing
 * callers. AWS task resilience handles Bedrock retries; no cross-provider
 * model fallback is configured.
 */

import { logger } from '@/lib/logger';

import {
  ClassifiedError,
  ErrorType,
  FallbackResult,
  LLMProvider,
  LLMProviderInterface,
  ProviderCallOptions,
  ProviderEntry,
  ProviderHealth,
  ProviderResponse,
} from '../types';
import { bedrockProvider } from './bedrock';

/**
 * Provider Registry - manages all available LLM providers
 */
export class ProviderRegistry {
  private providers: Map<LLMProvider, ProviderEntry> = new Map();
  private healthStatus: Map<LLMProvider, ProviderHealth> = new Map();
  private defaultPriority: LLMProvider[] = [];

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const requestedPrimary = process.env.LLM_PRIMARY_PROVIDER;
    if (requestedPrimary && requestedPrimary !== LLMProvider.BEDROCK) {
      throw new Error(
        `Unsupported LLM_PRIMARY_PROVIDER "${requestedPrimary}"; ProposalOS uses Amazon Bedrock`
      );
    }

    this.defaultPriority = [LLMProvider.BEDROCK];
    this.register(LLMProvider.BEDROCK, bedrockProvider, 0);
    this.setEnabled(LLMProvider.BEDROCK, process.env.BEDROCK_ENABLED === 'true');

    // Initialize health status for all providers
    for (const provider of this.defaultPriority) {
      this.healthStatus.set(provider, {
        provider,
        healthy: true,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Register a provider with the registry
   */
  register(provider: LLMProvider, instance: LLMProviderInterface, priority: number): void {
    this.providers.set(provider, {
      provider,
      instance,
      priority,
      enabled: true,
    });
    logger.info({ provider, priority }, 'Provider registered');
  }

  /**
   * Enable or disable a provider
   */
  setEnabled(provider: LLMProvider, enabled: boolean): void {
    const entry = this.providers.get(provider);
    if (entry) {
      entry.enabled = enabled;
      logger.info({ provider, enabled }, `Provider ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get provider by type
   */
  getProvider(provider: LLMProvider): LLMProviderInterface | null {
    const entry = this.providers.get(provider);
    return entry?.enabled ? entry.instance : null;
  }

  /**
   * Get available providers (enabled and healthy)
   */
  getAvailableProviders(): LLMProvider[] {
    const available: LLMProvider[] = [];
    for (const [provider, health] of this.healthStatus.entries()) {
      const entry = this.providers.get(provider);
      if (entry?.enabled && health.healthy) {
        available.push(provider);
      }
    }
    return available.sort((a, b) => {
      const aEntry = this.providers.get(a);
      const bEntry = this.providers.get(b);
      return (aEntry?.priority ?? 999) - (bEntry?.priority ?? 999);
    });
  }

  /**
   * Generate content with automatic fallback chain
   */
  async generateWithFallback(options: ProviderCallOptions): Promise<FallbackResult> {
    const attemptsMade: FallbackResult['attemptsMade'] = [];
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      return {
        success: false,
        error: {
          type: ErrorType.PERMANENT,
          error: new Error('No providers available'),
          retryable: false,
          shouldFallback: false,
        },
        attemptsMade,
      };
    }

    // Start with the requested provider or highest priority
    let providerOrder = availableProviders;
    if (options.provider && this.providers.get(options.provider)?.enabled) {
      const requestedIdx = providerOrder.indexOf(options.provider);
      if (requestedIdx > 0) {
        // Move requested provider to front
        providerOrder = [options.provider, ...providerOrder.filter((p) => p !== options.provider)];
      }
    }

    let lastError: ClassifiedError | undefined;

    for (const provider of providerOrder) {
      const instance = this.getProvider(provider);
      if (!instance) continue;

      const modelToUse = options.model || this.getDefaultModel(provider);

      try {
        logger.debug({ provider, model: modelToUse }, `Attempting provider: ${provider}`);

        const response = await instance.generateContent({
          ...options,
          provider,
          model: modelToUse,
        });

        // Success - update health status
        this.updateHealth(provider, true);

        return {
          success: true,
          response,
          attemptsMade: [...attemptsMade, { provider, model: modelToUse }],
        };
      } catch (error: any) {
        const classifiedError = this.classifyProviderError(error, provider);
        lastError = classifiedError;

        attemptsMade.push({
          provider,
          model: modelToUse,
          error: error.message,
        });

        this.updateHealth(provider, false);

        // If permanent error, don't try other providers unless shouldFallback
        if (classifiedError.type === ErrorType.PERMANENT && !classifiedError.shouldFallback) {
          logger.warn({ provider, error: error.message }, 'Permanent error, not falling back');
          break;
        }

        // If transient and has retry-after, wait before trying next provider
        if (classifiedError.type === ErrorType.TRANSIENT && classifiedError.retryAfterMs) {
          logger.info(
            { provider, retryAfterMs: classifiedError.retryAfterMs },
            'Waiting before fallback'
          );
          await this.sleep(Math.min(classifiedError.retryAfterMs, 5000)); // Cap at 5s
        }

        logger.info({ provider, error: error.message }, 'Provider failed, trying next');
      }
    }

    // All providers failed
    return {
      success: false,
      error: lastError,
      attemptsMade,
    };
  }

  /**
   * Update provider health status
   */
  private updateHealth(provider: LLMProvider, success: boolean): void {
    const current = this.healthStatus.get(provider) || {
      provider,
      healthy: true,
      lastChecked: new Date(),
      consecutiveFailures: 0,
    };

    if (success) {
      current.consecutiveFailures = 0;
      current.healthy = true;
    } else {
      current.consecutiveFailures++;
      // Mark unhealthy after 3 consecutive failures
      current.healthy = current.consecutiveFailures < 3;
    }

    current.lastChecked = new Date();
    this.healthStatus.set(provider, current);

    logger.debug(
      { provider, healthy: current.healthy, failures: current.consecutiveFailures },
      'Provider health updated'
    );
  }

  /**
   * Get health status for all providers
   */
  getHealthStatus(): ProviderHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Classify provider error
   */
  private classifyProviderError(error: any, provider: LLMProvider): ClassifiedError {
    const statusCode = error?.status || error?.response?.status || error?.$metadata?.httpStatusCode;
    const code = error?.code;

    // Rate limit - transient
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

    // Server errors - transient
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

    // Unknown
    return {
      type: ErrorType.UNKNOWN,
      error,
      retryable: false,
      shouldFallback: true,
    };
  }

  /**
   * Get default model for provider
   */
  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case LLMProvider.BEDROCK:
        return process.env.BEDROCK_FAST_MODEL_ID || 'us.amazon.nova-micro-v1:0';
      default:
        return process.env.BEDROCK_FAST_MODEL_ID || 'us.amazon.nova-micro-v1:0';
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

export default providerRegistry;
