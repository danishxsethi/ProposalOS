import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withProviderResilience } from '../withProviderResilience';
import { ProviderResilienceError } from '../types';
import { withTenantRuntimeContext } from '@/lib/tenant/context';

describe('Resilience - withProviderResilience Orchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return successfully called function values', async () => {
    const fn = vi.fn().mockResolvedValue('expected-payload');
    const result = await withProviderResilience(
      { provider: 'generic', operation: 'test-success' },
      fn
    );
    expect(result).toBe('expected-payload');
    expect(fn).toHaveBeenCalled();
  });

  it('should redact sensitive keys/secrets from thrown errors', async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('API key sk_123456789012345678901234 was rejected on user@domain.com');
    });

    const promise = withProviderResilience(
      { provider: 'generic', operation: 'test-redaction' },
      fn
    );

    await expect(promise).rejects.toThrow(ProviderResilienceError);
    await expect(promise).rejects.toThrow('[REDACTED_STRIPE_KEY]');
    await expect(promise).rejects.toThrow('[REDACTED_EMAIL]');
    await expect(promise).rejects.not.toThrow('sk_123456789012345678901234');
    await expect(promise).rejects.not.toThrow('user@domain.com');
  });

  it('should return fallbackValue when degrade is allowed', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Throttled'));
    const result = await withProviderResilience(
      {
        provider: 'generic',
        operation: 'test-fallback-static',
        degrade: true,
        fallbackValue: 'degraded-value',
        policy: { maxAttempts: 1 },
      },
      fn
    );
    expect(result).toBe('degraded-value');
  });

  it('should execute fallbackFn when degrade is allowed', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Timeout'));
    const fallbackFn = vi.fn().mockResolvedValue('dynamic-fallback-value');

    const result = await withProviderResilience(
      {
        provider: 'generic',
        operation: 'test-fallback-fn',
        degrade: true,
        fallbackFn,
        policy: { maxAttempts: 1 },
      },
      fn
    );

    expect(result).toBe('dynamic-fallback-value');
    expect(fallbackFn).toHaveBeenCalled();
  });

  it('does not retry after the caller aborts', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(() => {
      controller.abort(new DOMException('Cancelled', 'AbortError'));
      const error: any = new Error('temporary');
      error.status = 500;
      throw error;
    });

    await expect(
      withProviderResilience(
        {
          provider: 'generic',
          operation: 'test-caller-abort',
          signal: controller.signal,
          policy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
        },
        fn
      )
    ).rejects.toThrow('Cancelled');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('inherits the canonical audit signal from tenant runtime context', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Audit cancelled', 'AbortError'));
    const fn = vi.fn();

    await expect(
      withTenantRuntimeContext({ auditSignal: controller.signal }, () =>
        withProviderResilience({ provider: 'generic', operation: 'test-inherited-abort' }, fn)
      )
    ).rejects.toThrow('Audit cancelled');
    expect(fn).not.toHaveBeenCalled();
  });
});
