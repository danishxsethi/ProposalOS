/**
 * lib/resilience/types.ts
 *
 * Resilience Types and Interfaces
 */

export type ProviderName =
  | 'pagespeed'
  | 'google-places'
  | 'serpapi'
  | 'yelp'
  | 'gemini'
  | 'vertex'
  | 'resend'
  | 'stripe'
  | 'crawler'
  | 'generic';

export interface ProviderPolicy {
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryableStatusCodes: number[];
  retryableErrorKinds: string[];
  rateLimitWindowMs: number;
  rateLimitMaxCalls: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownMs: number;
  tenantScopingRequired?: boolean;
  degradationAllowed?: boolean;
}

export interface ResilienceOptions {
  provider: ProviderName;
  operation: string;
  tenantId?: string;
  policy?: Partial<ProviderPolicy>;
  degrade?: boolean;
}

// ─── Custom Resilience Errors ────────────────────────────────────────────────

export class ProviderResilienceError extends Error {
  constructor(
    public provider: ProviderName,
    public operation: string,
    message: string,
    public cause?: unknown
  ) {
    super(`[Resilience - ${provider}:${operation}] ${message}`);
    this.name = 'ProviderResilienceError';
  }
}

export class ProviderTimeoutError extends ProviderResilienceError {
  constructor(provider: ProviderName, operation: string, timeoutMs: number) {
    super(provider, operation, `Request timed out after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderRateLimitError extends ProviderResilienceError {
  constructor(
    provider: ProviderName,
    operation: string,
    public limit: number,
    public resetMs: number
  ) {
    super(provider, operation, `Rate limit exceeded. Limit: ${limit}/window. Reset in ${resetMs}ms`);
    this.name = 'ProviderRateLimitError';
  }
}

export class CircuitBreakerOpenError extends ProviderResilienceError {
  constructor(
    provider: ProviderName,
    operation: string,
    public cooldownRemainingMs: number
  ) {
    super(
      provider,
      operation,
      `Circuit breaker is OPEN. Cooldown remaining: ${cooldownRemainingMs}ms`
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

