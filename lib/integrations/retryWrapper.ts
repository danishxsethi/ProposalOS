/**
 * Retry Wrapper with Exponential Backoff and Jitter
 * 
 * A reusable utility for adding retry logic to any async function.
 * Implements exponential backoff with configurable jitter.
 */

import { logger } from '@/lib/logger';

import { calculateRetryDelay, isRetryableError, RETRY_CONFIG } from './config';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 (default: 0.3) */
  jitterFactor?: number;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: any) => boolean;
  /** Callback invoked on each retry attempt */
  onRetry?: (attempt: number, error: any, delayMs: number) => void;
  /** Operation name for logging */
  operationName?: string;
}

export interface RetryResult<T> {
  /** The result if successful */
  data?: T;
  /** Error if all retries failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Total time spent in ms */
  totalTimeMs: number;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry logic
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise with retry result
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchPageSpeed(url),
 *   { operationName: 'PageSpeed API call', maxRetries: 3 }
 * );
 * 
 * if (result.success) {
 *   console.log('Success:', result.data);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelayMs = RETRY_CONFIG.baseDelayMs,
    maxDelayMs = RETRY_CONFIG.maxDelayMs,
    jitterFactor = RETRY_CONFIG.jitterFactor,
    isRetryable: customIsRetryable,
    onRetry,
    operationName = 'Anonymous operation',
  } = options;

  const startTime = Date.now();
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      const totalTimeMs = Date.now() - startTime;

      if (attempt > 0) {
        logger.info(
          { operationName, attempts: attempt + 1, totalTimeMs },
          `${operationName} succeeded after ${attempt + 1} attempts`
        );
      }

      return {
        data: result,
        attempts: attempt + 1,
        success: true,
        totalTimeMs,
      };
    } catch (error: any) {
      lastError = error;
      const isRetryable = customIsRetryable 
        ? customIsRetryable(error)
        : isRetryableError(error);

      // Check if we should retry
      if (attempt < maxRetries && isRetryable) {
        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * jitterFactor * exponentialDelay;
        const delayMs = Math.min(exponentialDelay + jitter, maxDelayMs);

        // Invoke retry callback
        if (onRetry) {
          onRetry(attempt + 1, error, delayMs);
        }

        logger.warn(
          {
            operationName,
            attempt: attempt + 1,
            maxRetries,
            delayMs: Math.round(delayMs),
            error: error?.message || error?.toString(),
            isRetryable,
          },
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delayMs)}ms`
        );

        await sleep(delayMs);
      } else {
        // Not retryable or max retries reached
        if (!isRetryable) {
          logger.warn(
            { operationName, attempt: attempt + 1, error: error?.message },
            `${operationName} failed with non-retryable error`
          );
        } else {
          logger.error(
            { operationName, attempts: attempt + 1, error: error?.message },
            `${operationName} failed after ${attempt + 1} attempts`
          );
        }
        break;
      }
    }
  }

  const totalTimeMs = Date.now() - startTime;

  return {
    error: lastError instanceof Error ? lastError : new Error(String(lastError)),
    attempts: maxRetries + 1,
    success: false,
    totalTimeMs,
  };
}

/**
 * Execute an async function with a timeout
 * 
 * @param fn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name for logging
 * @returns Promise with result
 * 
 * @throws Error if timeout is exceeded
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'Anonymous operation'
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const promise = fn();
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Combine retry and timeout
 * 
 * @param fn - The async function to execute
 * @param timeoutMs - Timeout per attempt
 * @param retryOptions - Retry configuration
 * @returns Promise with retry result
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {}
): Promise<RetryResult<T>> {
  const operationName = retryOptions.operationName || 'Anonymous operation';

  return withRetry(
    () => withTimeout(fn, timeoutMs, operationName),
    {
      ...retryOptions,
      operationName,
    }
  );
}

/**
 * Create a retry wrapper with preset options
 * 
 * @param defaultOptions - Default retry options
 * @returns Wrapped function
 * 
 * @example
 * ```typescript
 * const retryFetch = createRetryWrapper({
 *   maxRetries: 3,
 *   operationName: 'API call',
 * });
 * 
 * const result = await retryFetch(() => fetch(url));
 * ```
 */
export function createRetryWrapper(defaultOptions: RetryOptions = {}) {
  return async function wrappedWithRetry<T>(
    fn: () => Promise<T>,
    overrideOptions: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    return withRetry(fn, { ...defaultOptions, ...overrideOptions });
  };
}

// Pre-configured wrappers for common use cases

/**
 * Aggressive retry: 5 attempts, longer delays
 * Use for critical operations that must succeed
 */
export const aggressiveRetry = createRetryWrapper({
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  operationName: 'Critical operation',
});

/**
 * Quick retry: 2 attempts, short delays
 * Use for fast-failing operations
 */
export const quickRetry = createRetryWrapper({
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 3000,
  operationName: 'Quick operation',
});

/**
 * Standard retry: 3 attempts, moderate delays
 * Default for most API calls
 */
export const standardRetry = createRetryWrapper({
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  operationName: 'API call',
});