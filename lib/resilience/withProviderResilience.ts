/**
 * lib/resilience/withProviderResilience.ts
 *
 * Core Resilience Wrapper Coordinating Rate Limiting, Circuit Breakers,
 * Timeouts, Exponential Backoff Retries with Jitter, and Graceful Degradation.
 */

import { logger } from '@/lib/logger';

import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from './circuitBreaker';
import { getProviderPolicy } from './providerPolicy';
import { checkProviderRateLimit } from './rateLimiter';
import {
  CircuitBreakerOpenError,
  ProviderName,
  ProviderPolicy,
  ProviderRateLimitError,
  ProviderResilienceError,
  ProviderTimeoutError,
  ResilienceOptions,
} from './types';

// ─── Secret Redaction Utility ────────────────────────────────────────────────

/**
 * Redacts sensitive tokens, keys, emails, and credentials from a string.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/(sk_[a-zA-Z0-9]{24,})/g, '[REDACTED_STRIPE_KEY]')
    .replace(/(re_[a-zA-Z0-9]{24,})/g, '[REDACTED_RESEND_KEY]')
    .replace(/(bearer\s+)[a-zA-Z0-9\-._~+/]+=*/gi, '$1[REDACTED_TOKEN]')
    .replace(/(api_?key=)[a-zA-Z0-9_\-]+/gi, '$1[REDACTED_API_KEY]')
    .replace(/(key=)[a-zA-Z0-9_\-]+/gi, '$1[REDACTED_KEY]')
    .replace(/(secret=)[a-zA-Z0-9_\-]+/gi, '$1[REDACTED_SECRET]')
    .replace(/("password"\s*:\s*")[^"]+/gi, '$1[REDACTED_PASSWORD]')
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[REDACTED_EMAIL]');
}

/**
 * Sanitizes an error's message, stack trace, and other properties.
 */
export function sanitizeError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error(redactSecrets(String(err)));
  }

  const sanitizedMessage = redactSecrets(err.message);
  const sanitizedError = new Error(sanitizedMessage);
  sanitizedError.name = err.name;

  if (err.stack) {
    sanitizedError.stack = redactSecrets(err.stack);
  }

  // Copy extra properties if they exist, sanitizing string values
  const rawErr = err as any;
  for (const key of Object.keys(rawErr)) {
    if (key !== 'message' && key !== 'stack' && key !== 'name') {
      const val = rawErr[key];
      if (typeof val === 'string') {
        (sanitizedError as any)[key] = redactSecrets(val);
      } else {
        (sanitizedError as any)[key] = val;
      }
    }
  }

  return sanitizedError;
}

// ─── Error Classification ────────────────────────────────────────────────────

/**
 * Helper to check if an HTTP status code is retryable.
 */
function isRetryableStatus(status: number, policy: ProviderPolicy): boolean {
  return policy.retryableStatusCodes.includes(status);
}

/**
 * Helper to check if an error object or network code is retryable.
 */
function isRetryableErrorKind(err: unknown, policy: ProviderPolicy): boolean {
  if (!err) return false;

  const errObj = err as any;
  const message = String(errObj.message || '').toLowerCase();
  const code = String(errObj.code || '').toLowerCase();

  return policy.retryableErrorKinds.some((kind) => message.includes(kind) || code.includes(kind));
}

// ─── Sleep Utility ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Resilience Orchestrator ─────────────────────────────────────────────────

export interface ExtendedResilienceOptions<T> extends ResilienceOptions {
  fallbackValue?: T;
  fallbackFn?: (err: Error) => T | Promise<T>;
}

export async function withProviderResilience<T>(
  options: ExtendedResilienceOptions<T>,
  fn: (context: { signal: AbortSignal }) => Promise<T>
): Promise<T> {
  const { provider, operation, tenantId } = options;
  const policy = { ...getProviderPolicy(provider), ...options.policy };

  // 1. Check Rate Limit
  const rateLimit = await checkProviderRateLimit(provider, tenantId, policy);
  if (!rateLimit.success) {
    const error = new ProviderRateLimitError(
      provider,
      operation,
      rateLimit.limit,
      rateLimit.resetMs
    );
    logger.warn(
      { provider, operation, tenantId, limit: rateLimit.limit, resetMs: rateLimit.resetMs },
      `Provider rate limit blocked: ${error.message}`
    );
    return handleFailure(error, options, policy);
  }

  // 2. Check Circuit Breaker
  try {
    await checkCircuitBreaker(provider, operation, tenantId, policy);
  } catch (err) {
    const sanitized = sanitizeError(err);
    return handleFailure(sanitized, options, policy);
  }

  let attempt = 0;
  let lastError: unknown = null;

  // 3. Retry Loop
  while (attempt < policy.maxAttempts) {
    attempt++;
    const controller = new AbortController();

    // Setup Timeout Timer
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, policy.timeoutMs);

    try {
      logger.debug(
        { provider, operation, tenantId, attempt, maxAttempts: policy.maxAttempts },
        `Executing provider call: ${provider}:${operation} (attempt ${attempt}/${policy.maxAttempts})`
      );

      const result = await fn({ signal: controller.signal });

      // Success! Clear timeout timer and record success in circuit breaker
      clearTimeout(timeoutTimer);
      await recordCircuitSuccess(provider, tenantId);

      if (attempt > 1) {
        logger.info(
          { provider, operation, tenantId, attempt },
          `Provider call ${provider}:${operation} succeeded after ${attempt} attempts.`
        );
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutTimer);

      const sanitizedErr = sanitizeError(err);
      lastError = sanitizedErr;

      // Check if aborted due to timeout
      const isTimeout =
        controller.signal.aborted ||
        sanitizedErr.name === 'AbortError' ||
        sanitizedErr.message.toLowerCase().includes('timeout') ||
        sanitizedErr.message.toLowerCase().includes('aborted');

      let finalError: Error = sanitizedErr;
      if (isTimeout) {
        finalError = new ProviderTimeoutError(provider, operation, policy.timeoutMs);
      }

      // Check if error is retryable
      const status = (err as any)?.status || (err as any)?.response?.status;
      const retryableByStatus = status ? isRetryableStatus(status, policy) : false;
      const retryableByKind = isRetryableErrorKind(err, policy);
      const isRetryable = retryableByStatus || retryableByKind || isTimeout;

      // Extract Retry-After if present
      let retryAfterMs = 0;
      const responseHeaders = (err as any)?.response?.headers;
      if (responseHeaders && typeof responseHeaders.get === 'function') {
        const retryAfterHeader = responseHeaders.get('Retry-After');
        if (retryAfterHeader) {
          let seconds = parseInt(retryAfterHeader, 10);
          if (isNaN(seconds)) {
            const date = Date.parse(retryAfterHeader);
            if (!isNaN(date)) {
              seconds = Math.max(0, Math.ceil((date - Date.now()) / 1000));
            }
          }
          if (!isNaN(seconds) && seconds > 0) {
            retryAfterMs = seconds * 1000;
          }
        }
      }

      logger.warn(
        {
          err: finalError,
          provider,
          operation,
          tenantId,
          attempt,
          isRetryable,
          status,
          retryAfterMs,
        },
        `Provider call failed on attempt ${attempt}/${policy.maxAttempts}: ${finalError.message}`
      );

      if (isRetryable && attempt < policy.maxAttempts) {
        // Calculate backoff delay with full jitter
        const baseBackoff = Math.min(
          policy.maxDelayMs,
          policy.baseDelayMs * Math.pow(2, attempt - 1)
        );
        const backoffWithJitter = policy.jitter ? Math.random() * baseBackoff : baseBackoff;
        const sleepMs = Math.max(retryAfterMs, backoffWithJitter);

        logger.info(
          { provider, operation, tenantId, sleepMs },
          `Retrying ${provider}:${operation} in ${sleepMs.toFixed(0)}ms...`
        );

        await sleep(sleepMs);
      } else {
        // Not retryable or exhausted all attempts
        await recordCircuitFailure(provider, tenantId, policy);
        return handleFailure(finalError, options, policy);
      }
    }
  }

  // Fallback / Throws should be handled by loop exit, but typescript safety:
  const finalError = lastError instanceof Error ? lastError : new Error(String(lastError));
  return handleFailure(finalError, options, policy);
}

/**
 * Handles error resolution - either applying fallback degradation or throwing a sanitized error.
 */
async function handleFailure<T>(
  error: Error,
  options: ExtendedResilienceOptions<T>,
  policy: ProviderPolicy
): Promise<T> {
  const { provider, operation, degrade } = options;
  const degradationAllowed =
    degrade !== false && (degrade === true || policy.degradationAllowed === true);

  if (degradationAllowed) {
    if (options.hasOwnProperty('fallbackValue')) {
      logger.warn(
        { provider, operation, err: error },
        `Graceful degradation applied for ${provider}:${operation}. Returning static fallback value.`
      );
      return options.fallbackValue as T;
    }

    if (options.fallbackFn) {
      logger.warn(
        { provider, operation, err: error },
        `Graceful degradation applied for ${provider}:${operation}. Executing fallback function.`
      );
      try {
        return await options.fallbackFn(error);
      } catch (fallbackErr) {
        const sanitizedFallbackErr = sanitizeError(fallbackErr);
        logger.error(
          { provider, operation, err: sanitizedFallbackErr },
          `Fallback function failed for ${provider}:${operation}`
        );
        throw sanitizedFallbackErr;
      }
    }
  }

  // Throw structured provider resilience error
  if (error instanceof ProviderResilienceError) {
    throw error;
  }

  throw new ProviderResilienceError(provider, operation, error.message, error);
}
