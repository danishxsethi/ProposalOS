# External Integrations Documentation

> **Phase I Integration Audit Complete** — All third-party integrations are now reliable, monitored, and gracefully degrading.

## Overview

This document provides comprehensive documentation for all external integrations used by ProposalOS, including fallback behaviors, retry logic, and circuit breaker configurations.

## Integration Summary

| Integration                       | Purpose                                      | SLA    | Retry         | Circuit Breaker | Fallback        |
| --------------------------------- | -------------------------------------------- | ------ | ------------- | --------------- | --------------- |
| **Google Vertex AI / Gemini**     | LLM for audit analysis & proposal generation | 99.9%  | ✅ 3 attempts | ✅ Yes          | Cached response |
| **Google PageSpeed Insights API** | Website performance audits                   | 99%    | ✅ 2 attempts | ✅ Yes          | None (free API) |
| **Google Places API**             | GBP data, reviews, business info             | 99.9%  | ✅ 3 attempts | ✅ Yes          | None            |
| **Resend Email API**              | Transactional and outreach emails            | 99.9%  | ✅ 3 attempts | ✅ Yes          | Queue for retry |
| **Stripe**                        | Payments & subscriptions                     | 99.99% | ✅ 3 attempts | ✅ Yes          | Manual review   |
| **Internal Website Crawler**      | Site structure and content analysis          | N/A    | ✅ 1 attempt  | ❌ No           | Skip crawl      |
| **Slack Webhook**                 | Admin notifications and alerts               | 99.9%  | ✅ 2 attempts | ✅ Yes          | Log only        |

---

## Configuration

### Model Version Pinning

All LLM models are pinned to specific versions to prevent breaking changes:

```typescript
// lib/integrations/config.ts
export const MODEL_VERSIONS = {
  GEMINI_FLASH: 'gemini-2.0-flash-001',
  GEMINI_PRO: 'gemini-2.0-pro-exp-02-05',
  GEMINI_15_PRO: 'gemini-1.5-pro-002',
  GEMINI_15_FLASH: 'gemini-1.5-flash-002',
};
```

### LLM Fallback Chain

When the primary model fails, requests automatically fall back through the chain:

```
Gemini Pro → Gemini 1.5 Pro → Gemini Flash → Gemini 1.5 Flash → Cached Response
```

### Retry Configuration

```typescript
// lib/integrations/config.ts
export const RETRY_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterFactor: 0.3, // 30% random jitter
  maxRetries: 3,
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
```

### Circuit Breaker Configuration

```typescript
// lib/integrations/config.ts
export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // failures before opening
  successThreshold: 2, // successes to close from half-open
  timeoutMs: 60000, // time in open state before half-open
  errorRateThreshold: 0.5, // 50% error rate triggers circuit
  windowMs: 5 * 60 * 1000, // 5 minute window for error rate
};
```

---

## Usage Examples

### Using Retry Wrapper

```typescript
import { withRetry, standardRetry, quickRetry } from '@/lib/integrations';

// Basic usage
const result = await withRetry(() => fetchPageSpeed(url), {
  operationName: 'PageSpeed API call',
  maxRetries: 3,
});

if (result.success) {
  console.log('Success:', result.data);
} else {
  console.error('Failed after', result.attempts, 'attempts:', result.error);
}

// Using pre-configured wrappers
const standardResult = await standardRetry(() => apiCall());
const quickResult = await quickRetry(() => fastApiCall());
```

### Using Circuit Breaker

```typescript
import {
  getCircuitBreaker,
  canMakeIntegrationCall,
  recordIntegrationSuccess,
  recordIntegrationFailure,
} from '@/lib/integrations';

// Check if call is allowed
const { allowed, state, retryAfterMs } = canMakeIntegrationCall('GEMINI');
if (!allowed) {
  throw new Error(`Circuit breaker OPEN. Retry after ${retryAfterMs}ms`);
}

// Or use the circuit breaker directly
const breaker = getCircuitBreaker('GEMINI');
try {
  const result = await breaker.execute(() => callGemini());
  // Success is automatically recorded
} catch (error) {
  // Failure is automatically recorded
  throw error;
}
```

### Combining Retry and Circuit Breaker

```typescript
import { withRetry, getCircuitBreaker } from '@/lib/integrations';

async function resilientApiCall() {
  const breaker = getCircuitBreaker('PAGESPEED');

  return await withRetry(() => breaker.execute(() => fetchPageSpeed(url)), {
    operationName: 'PageSpeed API',
    maxRetries: 3,
  });
}
```

---

## Integration Details

### Google Vertex AI / Gemini

**Configuration:**

- **Timeout:** 30s
- **Max Retries:** 3
- **Circuit Breaker:** Enabled
- **Fallback:** Cached response

**Features:**

- Token budget enforcement (context window validation)
- Cost tracking per tenant with hard cap ($2.00) and soft alert (80%)
- Request caching with 24h TTL
- Automatic model fallback chain
- Rate limit handling with retry-after support

**Failure Modes:**

- 429 Rate Limit: Retries with exponential backoff
- 5xx Server Error: Retries with exponential backoff
- Network Error: Retries with exponential backoff
- Budget Exceeded: Returns error (no retry, triggers fallback)

### Google PageSpeed Insights API

**Configuration:**

- **Timeout:** 30s
- **Max Retries:** 2
- **Circuit Breaker:** Enabled
- **Fallback:** None (free API)

**Features:**

- Result caching with 24h TTL
- Cost tracking (free: 0 cents)

**Failure Modes:**

- 429 Rate Limit: Retries with backoff
- 5xx Server Error: Retries with backoff
- Timeout: Retries with backoff

### Google Places API

**Configuration:**

- **Timeout:** 15s
- **Max Retries:** 3
- **Circuit Breaker:** Enabled
- **Fallback:** None

**Features:**

- Result caching with 1h TTL
- Cost tracking ($0.03 per call)

**Failure Modes:**

- 429 Rate Limit: Retries with backoff
- 5xx Server Error: Retries with backoff

### Resend Email API

**Configuration:**

- **Timeout:** 30s
- **Max Retries:** 3
- **Circuit Breaker:** Enabled
- **Fallback:** Queue for retry

**Features:**

- Blocklist checking before send
- Transaction-based database updates
- Retry on transient failures

**Failure Modes:**

- 429 Rate Limit: Retries with backoff
- 5xx Server Error: Retries with backoff
- Network Error: Retries with backoff

### Stripe

**Configuration:**

- **Timeout:** 30s
- **Max Retries:** 3
- **Circuit Breaker:** Enabled
- **Fallback:** Manual review

**Features:**

- Webhook signature verification
- Idempotency via `processedWebhookEvent` tracking
- Failed webhook tracking for retry
- Transaction-based updates

**Failure Modes:**

- Signature Verification Failed: Returns 400 (no retry)
- Processing Error: Logged to `failedWebhookEvent` for retry

### Internal Website Crawler

**Configuration:**

- **Timeout:** 45s total, 10s per page
- **Max Retries:** 1
- **Circuit Breaker:** Disabled
- **Fallback:** Skip crawl

**Features:**

- robots.txt compliance
- Custom User-Agent: `ProposalOSBot`
- Rate limiting per domain
- Max pages configurable (default: 20)
- Max depth: 3 levels

**Failure Modes:**

- robots.txt Block: Skips URL
- Timeout: Records error, continues crawl
- 4xx/5xx: Records as broken link

### Slack Webhook

**Configuration:**

- **Timeout:** 10s
- **Max Retries:** 2
- **Circuit Breaker:** Enabled
- **Fallback:** Log only

**Features:**

- Alert deduplication
- Severity levels

**Failure Modes:**

- 429 Rate Limit: Retries with backoff
- 5xx Server Error: Retries with backoff
- Failure logged if all retries exhausted

---

## Monitoring

### Getting Circuit Breaker Status

```typescript
import { getAllCircuitBreakersStatus } from '@/lib/integrations';

const status = getAllCircuitBreakersStatus();
console.log(status);
// Output:
// {
//   GEMINI: { state: 'CLOSED', failureCount: 0, ... },
//   PAGESPEED: { state: 'OPEN', failureCount: 5, ... },
// }
```

### Resetting Circuit Breakers

```typescript
import { resetCircuitBreaker, resetAllCircuitBreakers } from '@/lib/integrations';

// Reset specific integration
resetCircuitBreaker('GEMINI');

// Reset all
resetAllCircuitBreakers();
```

### Cost Tracking

```typescript
import { CostTracker } from '@/lib/costs/costTracker';

const tracker = new CostTracker({ capCents: 200, auditId: 'audit-123' });

// Track API calls
tracker.addApiCall('PAGESPEED');
tracker.addApiCall('PLACES_DETAILS');

// Track LLM usage
tracker.addLlmCall('GEMINI_PRO', inputTokens, outputTokens);

// Get report
const report = tracker.getReport();
console.log(`Total cost: $${(report.totalCents / 100).toFixed(2)}`);
```

---

## Error Handling

### Retryable Errors

The following errors trigger automatic retry:

- HTTP 408 (Request Timeout)
- HTTP 429 (Rate Limit)
- HTTP 500-504 (Server Errors)
- Network errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, ECONNREFUSED
- Errors containing "timeout" or "network" or "rate limit"

### Non-Retryable Errors

The following errors do NOT trigger retry:

- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized)
- HTTP 403 (Forbidden)
- HTTP 404 (Not Found)
- Budget exceeded errors

---

## Testing

### Unit Test Example

```typescript
import { withRetry } from '@/lib/integrations';

describe('Retry Wrapper', () => {
  it('should succeed on first attempt', async () => {
    const result = await withRetry(() => Promise.resolve('success'), { operationName: 'Test' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(1);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 3) return Promise.reject(new Error('fail'));
        return Promise.resolve('success');
      },
      { operationName: 'Test', maxRetries: 3, baseDelayMs: 10 }
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  });
});
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      External Integrations                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Gemini    │  │  PageSpeed   │  │    Places    │          │
│  │     LLM      │  │   Insights   │  │     API      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │   Circuit    │  │   Circuit    │  │   Circuit    │          │
│  │   Breaker    │  │   Breaker    │  │   Breaker    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │ Retry Wrapper│  │ Retry Wrapper│  │ Retry Wrapper│          │
│  │  + Backoff   │  │  + Backoff   │  │  + Backoff   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │    Cache     │  │    Cache     │  │    Cache     │          │
│  │   (24h)      │  │   (24h)      │  │   (1h)       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Files

- `lib/integrations/config.ts` - Configuration and constants
- `lib/integrations/retryWrapper.ts` - Retry logic with exponential backoff
- `lib/integrations/circuitBreaker.ts` - Circuit breaker implementation
- `lib/integrations/index.ts` - Main export file
- `lib/costs/costTracker.ts` - Cost tracking for APIs
- `lib/llm/provider.ts` - LLM provider with retry and fallback
- `lib/outreach/emailSender.ts` - Email sending with retry

---

## Audit Checklist

- [x] All integrations have documented fallback behavior
- [x] LLM model versions are pinned
- [x] LLM has fallback chain (Pro → 1.5 Pro → Flash → 1.5 Flash)
- [x] Cost tracking implemented with hard cap
- [x] Retry logic with exponential backoff and jitter
- [x] Circuit breakers on high-traffic external calls
- [x] Stripe webhook signature verification
- [x] Stripe idempotency tracking
- [x] Email retry logic
- [x] Web crawling respects robots.txt
- [x] Web crawling has timeout budgets
- [x] Caching enabled for appropriate integrations

**Status: PASS** — All acceptance criteria met.
