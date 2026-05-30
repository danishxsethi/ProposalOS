import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkProviderRateLimit } from '../rateLimiter';
import * as sharedStoreModule from '@/lib/store/shared';

describe('Resilience - Rate Limiter', () => {
  const originalEnv = process.env.ENABLE_PROVIDER_RATE_LIMIT_TEST;

  beforeEach(async () => {
    process.env.ENABLE_PROVIDER_RATE_LIMIT_TEST = 'true';
    sharedStoreModule._resetSharedStore();
    const store = await sharedStoreModule.getSharedStore();
    if (store.clear) await store.clear();
  });

  afterEach(() => {
    process.env.ENABLE_PROVIDER_RATE_LIMIT_TEST = originalEnv;
  });

  it('should allow calls up to the limit and block subsequent requests', async () => {
    const provider = 'generic';
    const policy = {
      rateLimitWindowMs: 60000,
      rateLimitMaxCalls: 2,
      timeoutMs: 1000,
      maxAttempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerCooldownMs: 60000,
    };

    // First call: success
    const result1 = await checkProviderRateLimit(provider, undefined, policy);
    expect(result1.success).toBe(true);
    expect(result1.remaining).toBe(1);

    // Second call: success (reaches limit)
    const result2 = await checkProviderRateLimit(provider, undefined, policy);
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(0);

    // Third call: blocked
    const result3 = await checkProviderRateLimit(provider, undefined, policy);
    expect(result3.success).toBe(false);
    expect(result3.remaining).toBe(0);
  });

  it('should support tenant-scoped rate limits independently from global provider limit', async () => {
    const provider = 'generic';
    const policy = {
      rateLimitWindowMs: 60000,
      rateLimitMaxCalls: 1,
      timeoutMs: 1000,
      maxAttempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerCooldownMs: 60000,
    };

    // Tenant A call: success
    const resultTenantA = await checkProviderRateLimit(provider, 'tenant-A', policy);
    expect(resultTenantA.success).toBe(true);

    // Tenant A call 2: blocked (limit is 1)
    const resultTenantA2 = await checkProviderRateLimit(provider, 'tenant-A', policy);
    expect(resultTenantA2.success).toBe(false);

    // Tenant B call: success (independent scope)
    const resultTenantB = await checkProviderRateLimit(provider, 'tenant-B', policy);
    expect(resultTenantB.success).toBe(true);
  });

  it('should fail open (allow call) if SharedStore throws an exception', async () => {
    sharedStoreModule._resetSharedStore();
    // Force getSharedStore to throw or we mock it
    const mockStore = {
      increment: () => {
        throw new Error('Database down');
      },
      get: async () => null,
      set: async () => {},
      setIfNotExists: async () => true,
      del: async () => {},
    };

    // Inject mock failure into internal SharedStore singleton via vi.spyOn
    const spy = vi.spyOn(sharedStoreModule, 'getSharedStore').mockResolvedValue(mockStore as any);

    const provider = 'generic';
    const policy = {
      rateLimitWindowMs: 60000,
      rateLimitMaxCalls: 1,
      timeoutMs: 1000,
      maxAttempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerCooldownMs: 60000,
    };

    const result = await checkProviderRateLimit(provider, undefined, policy);
    // Should fail open gracefully
    expect(result.success).toBe(true);

    // Restore
    spy.mockRestore();
  });
});
