import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from '../circuitBreaker';
import { CircuitBreakerOpenError } from '../types';
import { getSharedStore, _resetSharedStore } from '@/lib/store/shared';

describe('Resilience - Circuit Breaker', () => {
  const originalEnv = process.env.ENABLE_PROVIDER_CB_TEST;

  beforeEach(async () => {
    process.env.ENABLE_PROVIDER_CB_TEST = 'true';
    _resetSharedStore();
    const store = await getSharedStore();
    if (store.clear) await store.clear();
  });

  afterEach(() => {
    process.env.ENABLE_PROVIDER_CB_TEST = originalEnv;
  });

  it('should transition from CLOSED to OPEN after consecutive failures', async () => {
    const provider = 'generic';
    const policy = {
      circuitBreakerFailureThreshold: 2,
      circuitBreakerCooldownMs: 5000,
      timeoutMs: 1000,
      maxAttempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      rateLimitWindowMs: 60000,
      rateLimitMaxCalls: 10,
    };

    // First check should pass
    await expect(checkCircuitBreaker(provider, 'test', undefined, policy)).resolves.toBeUndefined();

    // Record failure 1
    await recordCircuitFailure(provider, undefined, policy);
    await expect(checkCircuitBreaker(provider, 'test', undefined, policy)).resolves.toBeUndefined();

    // Record failure 2 (reaches threshold)
    await recordCircuitFailure(provider, undefined, policy);

    // Now it should throw CircuitBreakerOpenError
    await expect(checkCircuitBreaker(provider, 'test', undefined, policy)).rejects.toThrow(
      CircuitBreakerOpenError
    );
  });

  it('should transition to HALF-OPEN after cooldown expires and CLOSE on success', async () => {
    vi.useFakeTimers();
    const provider = 'generic';
    const policy = {
      circuitBreakerFailureThreshold: 1,
      circuitBreakerCooldownMs: 1000,
      timeoutMs: 1000,
      maxAttempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      rateLimitWindowMs: 60000,
      rateLimitMaxCalls: 10,
    };

    // 1. Force circuit open
    await recordCircuitFailure(provider, undefined, policy);
    await expect(checkCircuitBreaker(provider, 'test', undefined, policy)).rejects.toThrow(
      CircuitBreakerOpenError
    );

    // 2. Advance time past cooldown
    await vi.advanceTimersByTimeAsync(1100);

    // 3. This check should transition state to half-open and NOT throw (allows test call)
    await expect(checkCircuitBreaker(provider, 'test', undefined, policy)).resolves.toBeUndefined();

    // 4. Record success to close the circuit
    await recordCircuitSuccess(provider, undefined);

    // 5. Verify the circuit is closed
    await expect(checkCircuitBreaker(provider, 'test', undefined, policy)).resolves.toBeUndefined();

    vi.useRealTimers();
  });
});
