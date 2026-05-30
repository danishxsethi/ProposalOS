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

import { GoogleGenerativeAI } from '@google/generative-ai';

import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { logger } from '@/lib/logger';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { PiiScrubber } from '@/lib/security/piiScrubber';
import { PromptPerformanceTracker } from '@/lib/self-evolving-prompts/PromptPerformanceTracker';

import { llmAuditLogger } from './audit-logger';
import { llmCache } from './cache';
import { validateAndFilter } from './output-validator';

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

/** Context windows for supported models (tokens). */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  default: 1_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.0-pro': 1_000_000,
  'gemini-2.0-pro-exp-01-21': 1_000_000,
  'gemini-1.5-pro': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-3.1-pro': 1_000_000,
};

function getContextWindow(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (limit !== undefined && (model.includes(key) || key === 'default')) return limit;
  }
  return MODEL_CONTEXT_WINDOWS.default ?? 1_000_000;
}

const performanceTracker = new PromptPerformanceTracker();

let _vertexAvailable: boolean | null = null;

function isVertexAvailable(): boolean {
  if (_vertexAvailable !== null) return _vertexAvailable;
  const projectId = process.env.GCP_PROJECT_ID;
  const hasCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  _vertexAvailable = !!(projectId && hasCreds);
  return _vertexAvailable;
}

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
  const statusCode = error?.status || error?.response?.status;
  // Retry on rate limit (429), server errors (5xx), and network errors
  return (
    statusCode === 429 ||
    (statusCode >= 500 && statusCode < 600) ||
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

export async function generateWithGemini(
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

  const generationConfig: any = {
    temperature: opts.temperature ?? 0.4,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  if (opts.responseModality === 'json') {
    generationConfig.responseMimeType = 'application/json';
  }

  if (opts.thinkingBudget && opts.thinkingBudget > 0 && !opts.model.includes('flash')) {
    generationConfig.thinkingConfig = {
      thinkingBudget: opts.thinkingBudget,
    };
  }

  // Format input parts for multimodal
  let contents: any[] = [];
  let inputText = '';
  let estimatedInputTokens = 0;
  if (typeof opts.input === 'string') {
    inputText = opts.input;
    contents = [{ role: 'user', parts: [{ text: opts.input }] }];
  } else {
    const parts = opts.input.map((content) => {
      if (content.type === 'text') {
        inputText += content.data as string;
        return { text: content.data as string };
      } else {
        const base64Data = Buffer.isBuffer(content.data)
          ? content.data.toString('base64')
          : content.data;

        return {
          inlineData: {
            data: base64Data,
            mimeType: content.mimeType || 'image/png',
          },
        };
      }
    });
    contents = [{ role: 'user', parts }];
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey && !isVertexAvailable()) {
    throw new Error(
      'GOOGLE_AI_API_KEY or GCP_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS required'
    );
  }

  let targetModel = opts.model;

  // Model Config Override for 3.1 Pro
  if (
    opts.metadata?.auditId &&
    FEATURE_FLAGS.GEMINI_31_PRO_ENABLED &&
    FEATURE_FLAGS.GEMINI_31_PRO_TRAFFIC_PCT > 0
  ) {
    const hashBuffer = crypto.createHash('sha256').update(opts.metadata.auditId).digest();
    const hashInt = hashBuffer.readUInt32BE(0);
    const bucket = hashInt % 100;

    if (bucket < FEATURE_FLAGS.GEMINI_31_PRO_TRAFFIC_PCT) {
      targetModel = 'gemini-3.1-pro';
    }
  }

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

      let model: any;

      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
          model: targetModel,
          generationConfig,
          tools: opts.tools,
          toolConfig: opts.toolConfig,
        });
      } else {
        const { VertexAI } = require('@google-cloud/vertexai');
        const projectId = process.env.GCP_PROJECT_ID!;
        const location = process.env.GCP_REGION || 'us-central1';
        const vertexAI = new VertexAI({ project: projectId, location });
        model = vertexAI.getGenerativeModel({
          model: targetModel,
          generationConfig,
          tools: opts.tools,
          toolConfig: opts.toolConfig,
        });
      }

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
          opts = {
            ...opts,
            input:
              opts.input.slice(0, targetInputChars) +
              '\n[TRUNCATED: input exceeded 90% of context window]',
          };
        }
        // Re-format contents after truncation
        if (typeof opts.input === 'string') {
          contents = [{ role: 'user', parts: [{ text: opts.input }] }];
        }
      }
      // ── End Token Budget Validator ──────────────────

      // Execute with circuit breaker
      const result = await circuitBreaker.execute(async () => {
        return await model.generateContent({ contents }, { signal: abortController.signal });
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const response = result.response;

      // Try to safely extract text from Gemini response structure
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
      const costUSD = (inputTokens / 1000000) * 1.25 + (outputTokens / 1000000) * 3.75;

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
      if (error?.status === 429 || error?.message?.includes('429')) {
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

// Generate Async Generator
export async function* generateContentStream(
  opts: LLMCallOptions
): AsyncGenerator<string, void, unknown> {
  const generationConfig: any = {
    temperature: opts.temperature ?? 0.4,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  if (opts.thinkingBudget && opts.thinkingBudget > 0 && !opts.model.includes('flash')) {
    generationConfig.thinkingConfig = {
      thinkingBudget: opts.thinkingBudget,
    };
  }

  let contents = [];
  if (typeof opts.input === 'string') {
    contents = [{ role: 'user', parts: [{ text: opts.input }] }];
  } else {
    const parts = opts.input.map((content) => {
      if (content.type === 'text') {
        return { text: content.data as string };
      } else {
        const base64Data = Buffer.isBuffer(content.data)
          ? content.data.toString('base64')
          : content.data;

        return {
          inlineData: {
            data: base64Data,
            mimeType: content.mimeType || 'image/png',
          },
        };
      }
    });
    contents = [{ role: 'user', parts }];
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  let model;

  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: opts.model, generationConfig });
  } else {
    const { VertexAI } = require('@google-cloud/vertexai');
    const projectId = process.env.GCP_PROJECT_ID!;
    const location = process.env.GCP_REGION || 'us-central1';
    const vertexAI = new VertexAI({ project: projectId, location });
    model = vertexAI.getGenerativeModel({ model: opts.model, generationConfig });
  }

  const resultStream = await model.generateContentStream({ contents });
  for await (const chunk of resultStream.stream) {
    yield chunk.text();
  }
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
