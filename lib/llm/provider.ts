/**
 * Enhanced LLM Provider with Reliability Features
 *
 * Features:
 * - Retry with exponential backoff
 * - Configurable timeouts
 * - Rate limit handling (429)
 * - Circuit breaker pattern
 * - Request caching
 * - Audit logging
 * - Token budget enforcement
 * - Graceful degradation
 */

import crypto from 'crypto';

import { logger } from '@/lib/logger';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { PiiScrubber } from '@/lib/security/piiScrubber';
import { PromptPerformanceTracker } from '@/lib/self-evolving-prompts/PromptPerformanceTracker';

import { llmAuditLogger } from './audit-logger';
import { llmCache } from './cache';
import { isFixtureLlmSelected } from './mode';
import { validateAndFilter } from './output-validator';
import { bedrockProvider } from './providers/bedrock';
import { fixtureProvider } from './providers/fixture';
import { LLMProvider } from './types';

/**
 * Task 1 (Pipeline 16): Token budget enforcement errors.
 */
export class BudgetExceededError extends Error {
  constructor(
    public estimatedTokens: number,
    public contextWindow: number,
    public model: string
  ) {
    super(
      `[BudgetExceededError] ${model}: estimated ${estimatedTokens} tokens exceeds context window of ${contextWindow}`
    );
    this.name = 'BudgetExceededError';
  }
}

/**
 * Rate limit error with retry-after information
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter?: number,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for LLM calls
 */
class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeoutMs: number;

  constructor(
    failureThreshold: number = 5,
    successThreshold: number = 2,
    timeoutMs: number = 60000
  ) {
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.timeoutMs = timeoutMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailureTime || 0) > this.timeoutMs) {
        this.state = 'half-open';
        logger.warn({ state: 'half-open' }, 'Circuit breaker transitioning to half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    if (this.state === 'half-open' && this.successCount >= this.successThreshold) {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.warn({ failureCount: this.failureCount }, 'Circuit breaker opened');
    }
  }

  private reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    logger.info('Circuit breaker reset to closed');
  }

  getState(): CircuitState {
    return this.state;
  }
}

/** Context windows for the Bedrock models used by ProposalOS (tokens). */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'us.amazon.nova-micro-v1:0': 128_000,
  'us.amazon.nova-2-lite-v1:0': 1_000_000,
  'amazon.nova-lite-v1:0': 300_000,
  default: 1_000_000,
};

function getContextWindow(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (key !== 'default' && limit !== undefined && model.includes(key)) return limit;
  }
  return MODEL_CONTEXT_WINDOWS.default ?? 1_000_000;
}

const performanceTracker = new PromptPerformanceTracker();

export interface MultimodalContent {
  type: 'text' | 'image' | 'pdf';
  data: string | Buffer; // text content or binary
  mimeType?: string;
}

export interface LLMCallOptions {
  model: string; // from env var, not hardcoded
  input: string | MultimodalContent[];
  thinkingBudget?: number; // tokens for reasoning (0 = disabled)
  maxOutputTokens?: number;
  temperature?: number;
  stream?: boolean; // enable streaming
  signal?: AbortSignal;
  responseModality?: 'text' | 'json' | 'multimodal';
  tools?: any[];
  toolConfig?: any;
  metadata?: {
    node?: string; // which pipeline node is calling
    auditId?: string; // for cost tracking
    qaScore?: number; // downstream QA gate score (0–1), overrides quality heuristic
    experimentId?: string; // A/B experiment name
    variantId?: string; // 'control' | 'variant'
    tenantId?: string; // for multi-tenant isolation
    userId?: string; // for audit logging
    timeoutMs?: number; // per-request timeout override
    useCache?: boolean; // enable/disable caching for this request
    skipValidation?: boolean; // skip output validation
  };
}

export interface LLMCallResult {
  text: string;
  model?: string;
  provider?: LLMProvider;
  functionCalls?: any[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  cached?: boolean;
}

// Circuit breaker instance (shared across all calls)
const circuitBreaker = new CircuitBreaker(
  parseInt(process.env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
  parseInt(process.env.LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2'),
  parseInt(process.env.LLM_CIRCUIT_BREAKER_TIMEOUT_MS || '60000')
);

// Retry configuration
const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || '3');
const BASE_RETRY_DELAY_MS = parseInt(process.env.LLM_BASE_RETRY_DELAY_MS || '1000');
const MAX_RETRY_DELAY_MS = parseInt(process.env.LLM_MAX_RETRY_DELAY_MS || '10000');
const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_DEFAULT_TIMEOUT_MS || '30000');

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  const statusCode = error?.status || error?.response?.status || error?.$metadata?.httpStatusCode;
  // Retry on rate limit (429), server errors (5xx), and network errors
  return (
    statusCode === 429 ||
    (statusCode >= 500 && statusCode < 600) ||
    !!error?.$retryable ||
    error?.code === 'ECONNRESET' ||
    error?.code === 'ETIMEDOUT' ||
    error?.message?.includes('timeout') ||
    error?.message?.includes('network')
  );
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateWithLLM(
  optionsOrModelName: LLMCallOptions | string,
  prompt?: string,
  legacyOptions?: { temperature?: number; maxOutputTokens?: number }
): Promise<LLMCallResult> {
  let opts: LLMCallOptions;

  if (typeof optionsOrModelName === 'string') {
    // Legacy support
    opts = {
      model: optionsOrModelName,
      input: prompt || '',
      temperature: legacyOptions?.temperature,
      maxOutputTokens: legacyOptions?.maxOutputTokens,
      stream: false,
    };
  } else {
    opts = optionsOrModelName;
  }

  const configuredProvider = process.env.LLM_PRIMARY_PROVIDER;
  const fixtureMode = isFixtureLlmSelected();
  if (fixtureMode) {
    // Test-scoped deterministic provider (refuses in production — see mode.ts).
    logger.info(
      { event: 'llm.fixture_mode', node: opts.metadata?.node },
      'Fixture LLM mode active: responses are deterministic and explicitly not real inference'
    );
  } else {
    if (configuredProvider && configuredProvider !== LLMProvider.BEDROCK) {
      throw new Error(
        `Unsupported LLM_PRIMARY_PROVIDER "${configuredProvider}"; ProposalOS uses Amazon Bedrock`
      );
    }
    if (process.env.BEDROCK_ENABLED !== 'true') {
      throw new Error('Amazon Bedrock is disabled; set BEDROCK_ENABLED=true to enable it');
    }
  }

  let inputText = '';
  let estimatedInputTokens = 0;
  if (typeof opts.input === 'string') {
    inputText = opts.input;
  } else {
    for (const content of opts.input) {
      if (content.type === 'text') {
        inputText += content.data as string;
      }
    }
  }

  const activeProvider = fixtureMode ? fixtureProvider : bedrockProvider;
  const targetModel = activeProvider.resolveModelId(opts.model, opts.input);

  // Check cache before making API call
  const useCache = opts.metadata?.useCache !== false;
  const cacheKey = useCache
    ? llmCache.generateCacheKey({
        prompt: inputText,
        model: targetModel,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
        responseModality: opts.responseModality,
      })
    : null;

  if (cacheKey) {
    const cachedResult = llmCache.get<LLMCallResult>(cacheKey);
    if (cachedResult) {
      logger.info({ cacheKey, model: targetModel }, 'Cache hit');
      return { ...cachedResult, cached: true };
    }
  }

  // Audit logging
  const logId = llmAuditLogger.logRequest({
    model: targetModel,
    input: inputText,
    tenantId: opts.metadata?.tenantId,
    userId: opts.metadata?.userId,
    auditId: opts.metadata?.auditId,
    nodeId: opts.metadata?.node,
    experimentId: opts.metadata?.experimentId,
    variantId: opts.metadata?.variantId,
  });

  const timeoutMs = opts.metadata?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = performance.now();
  let lastError: any = null;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check circuit breaker
      if (circuitBreaker.getState() === 'open') {
        throw new Error('Circuit breaker is open - service temporarily unavailable');
      }

      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort('Request timeout');
      }, timeoutMs);

      if (opts.stream) {
        clearTimeout(timeoutId);
        throw new Error(
          'Streaming enabled: But please use streamToString or handle AsyncGenerator directly on the client. Not implemented in legacy return signature.'
        );
      }

      // ── Token Budget Validator ────────────────────────
      const inputLengthChars = Array.isArray(opts.input)
        ? opts.input.reduce(
            (acc, c) => acc + (typeof c.data === 'string' ? c.data.length : 1000),
            0
          )
        : (opts.input as string).length;
      estimatedInputTokens = Math.ceil(inputLengthChars / 4);
      const maxOutputTokens = opts.maxOutputTokens ?? 2048;
      const contextWindow = getContextWindow(targetModel);
      const totalEstimated = estimatedInputTokens + maxOutputTokens;

      if (totalEstimated > contextWindow) {
        clearTimeout(timeoutId);
        logger.error(
          { model: targetModel, estimatedInputTokens, maxOutputTokens, contextWindow },
          'Token budget hard limit exceeded — rejecting call'
        );
        throw new BudgetExceededError(totalEstimated, contextWindow, targetModel);
      }

      if (totalEstimated > contextWindow * 0.9) {
        // Soft limit at 90%: truncate input by 20% and warn
        const targetInputChars = Math.floor((contextWindow * 0.85 - maxOutputTokens) * 4);
        logger.warn(
          { model: targetModel, estimatedInputTokens, contextWindow },
          'Token budget at 90% — truncating input'
        );
        if (typeof opts.input === 'string' && opts.input.length > targetInputChars) {
          const truncatedInput =
            opts.input.slice(0, targetInputChars) +
            '\n[TRUNCATED: input exceeded 90% of context window]';
          opts = {
            ...opts,
            input: truncatedInput,
          };
          inputText = truncatedInput;
        }
      }
      // ── End Token Budget Validator ──────────────────

      // Execute with circuit breaker
      const result = await circuitBreaker.execute<any>(async () => {
        const providerResult = await activeProvider.generateContent({
          provider: fixtureMode ? LLMProvider.FIXTURE : LLMProvider.BEDROCK,
          model: targetModel,
          input: opts.input,
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          responseModality: opts.responseModality,
          tools: opts.tools,
          toolConfig: opts.toolConfig,
          signal: abortController.signal,
          metadata: opts.metadata,
        });
        const bedrockResult = providerResult;
        return {
          response: {
            candidates: [
              {
                content: {
                  parts: [
                    ...(bedrockResult.text ? [{ text: bedrockResult.text }] : []),
                    ...(bedrockResult.functionCalls || []).map((functionCall: any) => ({
                      functionCall,
                    })),
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: bedrockResult.usageMetadata?.promptTokenCount,
              candidatesTokenCount: bedrockResult.usageMetadata?.candidatesTokenCount,
            },
          },
        };
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const response = result.response;

      // Normalize the selected provider's response structure.
      let text = '';
      let functionCalls: any[] | undefined = undefined;

      if (response.candidates?.[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts;
        const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
        if (textParts.length > 0) text = textParts.join('\n');

        const fcs = parts.filter((p: any) => !!p.functionCall).map((p: any) => p.functionCall);
        if (fcs.length > 0) functionCalls = fcs;
      } else if (response.functionCalls && typeof response.functionCalls === 'function') {
        const fcs = response.functionCalls();
        if (fcs && fcs.length > 0) functionCalls = fcs;
        if (response.text && typeof response.text === 'function') {
          try {
            text = response.text();
          } catch (e) {}
        }
      } else if (response.text && typeof response.text === 'function') {
        try {
          text = response.text();
        } catch (e) {}
      }

      const usage = (result.response as any).usageMetadata;

      if (usage && usage.thoughtsTokenCount) {
        const thinkingDurationMs = (usage.thoughtsTokenCount / 50) * 1000;
        logger.info({ thinkingDurationMs, node: opts.metadata?.node }, 'Thinking mode executed');
      }

      // Compute token counts + cost
      const inputTokens = usage?.promptTokenCount || estimatedInputTokens;
      const outputTokens = usage?.candidatesTokenCount || 0;
      const costUSD = targetModel.includes('nova-2-lite')
        ? (inputTokens / 1000) * 0.0003 + (outputTokens / 1000) * 0.0025
        : targetModel.includes('nova-lite')
          ? (inputTokens / 1000) * 0.00006 + (outputTokens / 1000) * 0.00024
          : (inputTokens / 1000) * 0.000035 + (outputTokens / 1000) * 0.00014;

      // Compute quality heuristic
      const qaScore = opts.metadata?.qaScore as number | undefined;
      let outputQualityScore: number;
      if (typeof qaScore === 'number') {
        outputQualityScore = Math.max(0, 1 - qaScore);
      } else if (opts.responseModality === 'json') {
        try {
          JSON.parse(text);
          outputQualityScore = 0.9;
        } catch {
          outputQualityScore = 0.3;
        }
      } else {
        const inputLen = typeof opts.input === 'string' ? opts.input.length : 2000;
        const ratio = text.length / Math.max(1, inputLen);
        outputQualityScore = Math.min(1.0, Math.max(0.1, ratio * 2));
      }

      // Output validation (unless skipped)
      if (!opts.metadata?.skipValidation) {
        const validationResult = validateAndFilter(text, {
          checkOffensive: true,
          checkLegalRisk: true,
          checkPII: true,
          checkPromptLeak: true,
        });
        if (!validationResult.allowed) {
          logger.warn({ issues: validationResult.issues }, 'Output validation failed');
          text = validationResult.content;
        }
      }

      const experimentId = opts.metadata?.experimentId as string | undefined;
      const variantId = opts.metadata?.variantId as string | undefined;
      const promptVersionHash = variantId
        ? `${opts.metadata?.node || 'unknown'}:${variantId}`
        : opts.metadata?.auditId
          ? crypto
              .createHash('sha256')
              .update((opts.metadata?.node || 'unknown') + (opts.metadata?.auditId || ''))
              .digest('hex')
              .slice(0, 16)
          : 'default';

      performanceTracker
        .logPerformance({
          promptVersionHash,
          nodeId: opts.metadata?.node || 'unknown-node',
          qualityScore: outputQualityScore,
          downstreamImpact: 0,
          costUSD,
          latencyMs: endTime - startTime,
          inputTokens,
          outputTokens,
          experimentId: experimentId || undefined,
          variantId: variantId || undefined,
          metadata: {
            model: targetModel,
            budgetCheckPassed: true,
            heuristicType:
              qaScore !== undefined
                ? 'qa-gate'
                : opts.responseModality === 'json'
                  ? 'json-parse'
                  : 'length-ratio',
          },
        })
        .catch((err) => logger.error({ err }, 'Telemetry logging failed'));

      MetricsRecorder.llmCall(
        endTime - startTime,
        costUSD,
        targetModel,
        opts.metadata?.node || 'unknown-node'
      );

      // Cache the result
      if (cacheKey) {
        llmCache.set(
          cacheKey,
          {
            text,
            model: targetModel,
            provider: fixtureMode ? LLMProvider.FIXTURE : LLMProvider.BEDROCK,
            functionCalls,
            usageMetadata: usage
              ? {
                  promptTokenCount: usage.promptTokenCount,
                  candidatesTokenCount: usage.candidatesTokenCount,
                  thoughtsTokenCount: usage.thoughtsTokenCount,
                }
              : undefined,
          },
          {
            metadata: {
              inputTokens,
              outputTokens,
              cost: costUSD,
              model: targetModel,
            },
          }
        );
      }

      // Audit log response
      llmAuditLogger.logResponse({
        logId,
        model: targetModel,
        output: text,
        inputTokens,
        outputTokens,
        thoughtsTokens: usage?.thoughtsTokenCount,
        latencyMs: endTime - startTime,
        costUsd: costUSD,
        success: true,
        tenantId: opts.metadata?.tenantId,
        userId: opts.metadata?.userId,
        auditId: opts.metadata?.auditId,
        nodeId: opts.metadata?.node,
        experimentId: opts.metadata?.experimentId,
        variantId: opts.metadata?.variantId,
      });

      return {
        text,
        model: targetModel,
        provider: fixtureMode ? LLMProvider.FIXTURE : LLMProvider.BEDROCK,
        functionCalls,
        usageMetadata: usage
          ? {
              promptTokenCount: usage.promptTokenCount,
              candidatesTokenCount: usage.candidatesTokenCount,
              thoughtsTokenCount: usage.thoughtsTokenCount,
            }
          : undefined,
      };
    } catch (error: any) {
      lastError = error;
      const latencyMs = performance.now() - startTime;

      // Check if rate limited
      if (
        error?.status === 429 ||
        error?.$metadata?.httpStatusCode === 429 ||
        error?.message?.includes('429')
      ) {
        const retryAfter = error?.headers?.['retry-after']
          ? parseInt(error.headers['retry-after']) * 1000
          : undefined;

        llmAuditLogger.logRateLimit({
          model: targetModel,
          retryAfter,
          tenantId: opts.metadata?.tenantId,
          nodeId: opts.metadata?.node,
        });

        if (attempt < MAX_RETRIES) {
          const delay = retryAfter || calculateRetryDelay(attempt);
          llmAuditLogger.logRetry({
            attempt: attempt + 1,
            maxAttempts: MAX_RETRIES,
            delayMs: delay,
            reason: 'rate_limit',
            model: targetModel,
            tenantId: opts.metadata?.tenantId,
            nodeId: opts.metadata?.node,
          });
          await sleep(delay);
          continue;
        }
      }

      // Check if retryable error
      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        const delay = calculateRetryDelay(attempt);
        llmAuditLogger.logRetry({
          attempt: attempt + 1,
          maxAttempts: MAX_RETRIES,
          delayMs: delay,
          reason: error?.message || 'unknown',
          model: targetModel,
          tenantId: opts.metadata?.tenantId,
          nodeId: opts.metadata?.node,
        });
        await sleep(delay);
        continue;
      }

      // Log error and break retry loop
      llmAuditLogger.logResponse({
        logId,
        model: targetModel,
        inputTokens: estimatedInputTokens || 0,
        latencyMs,
        success: false,
        errorType: error?.name || 'UnknownError',
        errorMessage: error?.message || 'Unknown error',
        tenantId: opts.metadata?.tenantId,
        userId: opts.metadata?.userId,
        auditId: opts.metadata?.auditId,
        nodeId: opts.metadata?.node,
        experimentId: opts.metadata?.experimentId,
        variantId: opts.metadata?.variantId,
      });

      logger.error(
        {
          error: error?.message,
          model: targetModel,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
        },
        'LLM call failed after retries'
      );

      break;
    }
  }

  // All retries exhausted - throw error or return fallback
  const latencyMs = performance.now() - startTime;

  // Graceful degradation: return cached response if available
  if (cacheKey) {
    // Try to get any cached response (even stale)
    const staleCache = llmCache.get<LLMCallResult>(cacheKey);
    if (staleCache) {
      logger.warn({ cacheKey }, 'Returning stale cached response after failures');
      return { ...staleCache, cached: true };
    }
  }

  // Throw the last error
  throw lastError || new Error('LLM call failed after all retries');
}

// Generate an async stream from the active LLM provider.
export async function* generateContentStream(
  opts: LLMCallOptions
): AsyncGenerator<string, void, unknown> {
  const fixtureMode = isFixtureLlmSelected();
  if (!fixtureMode) {
    const configuredProvider = process.env.LLM_PRIMARY_PROVIDER;
    if (configuredProvider && configuredProvider !== LLMProvider.BEDROCK) {
      throw new Error(
        `Unsupported LLM_PRIMARY_PROVIDER "${configuredProvider}"; ProposalOS uses Amazon Bedrock`
      );
    }
    if (process.env.BEDROCK_ENABLED !== 'true') {
      throw new Error('Amazon Bedrock is disabled; set BEDROCK_ENABLED=true to enable it');
    }
  }

  yield* (fixtureMode ? fixtureProvider : bedrockProvider).generateContentStream({
    provider: fixtureMode ? LLMProvider.FIXTURE : LLMProvider.BEDROCK,
    model: opts.model,
    input: opts.input,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    responseModality: opts.responseModality,
    tools: opts.tools,
    toolConfig: opts.toolConfig,
    metadata: opts.metadata,
    signal: opts.signal,
  });
}

export async function streamToString(stream: AsyncGenerator<string>): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    result += chunk;
  }
  return result;
}

/**
 * Get circuit breaker status
 */
export function getCircuitBreakerStatus(): {
  state: CircuitState;
  failureCount: number;
} {
  return {
    state: circuitBreaker.getState(),
    failureCount: 0, // Internal to circuit breaker
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  return llmCache.getStats();
}
