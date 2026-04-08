/**
 * External Integration Configuration
 * 
 * Centralized configuration for all third-party integrations with:
 * - Pinned model versions
 * - Fallback chains
 * - Timeout budgets
 * - Retry configuration
 * - Circuit breaker settings
 */

/**
 * Model version pinning - prevents breaking changes from upstream
 */
export const MODEL_VERSIONS = {
  // Gemini models - pinned to specific versions for stability
  GEMINI_FLASH: 'gemini-2.0-flash-001',
  GEMINI_PRO: 'gemini-2.0-pro-exp-02-05',
  GEMINI_15_PRO: 'gemini-1.5-pro-002',
  GEMINI_15_FLASH: 'gemini-1.5-flash-002',
  // Fallback chain: Pro → 1.5 Pro → Flash → 1.5 Flash
} as const;

/**
 * Fallback chain for LLM requests
 * Used when primary model fails or is rate limited
 */
export const LLM_FALLBACK_CHAIN = [
  MODEL_VERSIONS.GEMINI_PRO,
  MODEL_VERSIONS.GEMINI_15_PRO,
  MODEL_VERSIONS.GEMINI_FLASH,
  MODEL_VERSIONS.GEMINI_15_FLASH,
] as const;

/**
 * Integration configurations with SLA, timeouts, and fallback behavior
 */
export interface IntegrationConfig {
  name: string;
  purpose: string;
  sla: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerEnabled: boolean;
  fallback?: string;
  cacheEnabled: boolean;
  cacheTtlHours: number;
}

export const INTEGRATIONS: Record<string, IntegrationConfig> = {
  // LLM / Vertex AI
  GEMINI: {
    name: 'Google Vertex AI / Gemini',
    purpose: 'Audit analysis, proposal generation, content creation',
    sla: '99.9%',
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    circuitBreakerEnabled: true,
    fallback: 'cached_response',
    cacheEnabled: true,
    cacheTtlHours: 24,
  },
  
  // PageSpeed Insights
  PAGESPEED: {
    name: 'Google PageSpeed Insights API',
    purpose: 'Website performance audits',
    sla: '99%',
    timeoutMs: 30000,
    maxRetries: 2,
    retryDelayMs: 500,
    circuitBreakerEnabled: true,
    fallback: 'none',
    cacheEnabled: true,
    cacheTtlHours: 24,
  },
  
  // Google Places API
  PLACES: {
    name: 'Google Places API',
    purpose: 'GBP data, reviews, business information',
    sla: '99.9%',
    timeoutMs: 15000,
    maxRetries: 3,
    retryDelayMs: 500,
    circuitBreakerEnabled: true,
    fallback: 'none',
    cacheEnabled: true,
    cacheTtlHours: 1,
  },
  
  // Resend Email
  RESEND: {
    name: 'Resend Email API',
    purpose: 'Transactional and outreach emails',
    sla: '99.9%',
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    circuitBreakerEnabled: true,
    fallback: 'queue_for_retry',
    cacheEnabled: false,
    cacheTtlHours: 0,
  },
  
  // Stripe
  STRIPE: {
    name: 'Stripe Payments',
    purpose: 'Payment processing, subscriptions',
    sla: '99.99%',
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    circuitBreakerEnabled: true,
    fallback: 'manual_review',
    cacheEnabled: false,
    cacheTtlHours: 0,
  },
  
  // Internal Website Crawler
  WEBSITE_CRAWLER: {
    name: 'Internal Website Crawler',
    purpose: 'Site structure and content analysis',
    sla: 'N/A (internal)',
    timeoutMs: 45000,
    maxRetries: 1,
    retryDelayMs: 500,
    circuitBreakerEnabled: false,
    fallback: 'skip_crawl',
    cacheEnabled: false,
    cacheTtlHours: 0,
  },
  
  // Slack Alerts
  SLACK: {
    name: 'Slack Webhook',
    purpose: 'Admin notifications and alerts',
    sla: '99.9%',
    timeoutMs: 10000,
    maxRetries: 2,
    retryDelayMs: 500,
    circuitBreakerEnabled: true,
    fallback: 'log_only',
    cacheEnabled: false,
    cacheTtlHours: 0,
  },
};

/**
 * Retry configuration with exponential backoff parameters
 */
export const RETRY_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterFactor: 0.3, // 30% random jitter
  maxRetries: 3,
  // Errors that should trigger retry
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrorPatterns: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'timeout',
    'network',
    'rate limit',
  ],
};

/**
 * Circuit breaker configuration
 */
export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // failures before opening
  successThreshold: 2, // successes to close from half-open
  timeoutMs: 60000, // time in open state before half-open
  errorRateThreshold: 0.5, // 50% error rate triggers circuit
  windowMs: 5 * 60 * 1000, // 5 minute window for error rate
};

/**
 * Cost tracking configuration
 */
export const COST_CONFIG = {
  hardCapCents: 200, // $2.00 hard cap per audit
  softAlertPercent: 80, // Alert at 80% of cap
};

/**
 * Get the next model in the fallback chain
 */
export function getNextFallbackModel(currentModel: string): string | null {
  const currentIndex = LLM_FALLBACK_CHAIN.indexOf(currentModel as any);
  if (currentIndex === -1 || currentIndex >= LLM_FALLBACK_CHAIN.length - 1) {
    return null;
  }
  const nextModel = LLM_FALLBACK_CHAIN[currentIndex + 1];
  return nextModel ?? null;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  const statusCode = error?.status || error?.response?.status;
  const errorCode = error?.code;
  const errorMessage = error?.message?.toLowerCase() || '';
  
  // Check status code
  if (statusCode && RETRY_CONFIG.retryableStatusCodes.includes(statusCode)) {
    return true;
  }
  
  // Check error code
  if (errorCode && RETRY_CONFIG.retryableErrorPatterns.some(
    pattern => errorCode.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return true;
  }
  
  // Check error message
  if (errorMessage && RETRY_CONFIG.retryableErrorPatterns.some(
    pattern => errorMessage.includes(pattern.toLowerCase())
  )) {
    return true;
  }
  
  return false;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(attempt: number): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = RETRY_CONFIG;
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * jitterFactor * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

export default INTEGRATIONS;