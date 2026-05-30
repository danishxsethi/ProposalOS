import { describe, it, expect, vi } from 'vitest';
import { withProviderResilience } from '../withProviderResilience';

describe('Resilience - Retry & Backoff Jitter', () => {
  it('should retry a failed function up to maxAttempts on retryable status', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      throw error;
    });

    const promise = withProviderResilience(
      {
        provider: 'generic',
        operation: 'test-retry-exhaustion',
        policy: {
          maxAttempts: 3,
          baseDelayMs: 1,
          maxDelayMs: 5,
          jitter: false, // Turn off jitter for deterministic backoff
          timeoutMs: 5000,
        },
      },
      fn
    );

    await expect(promise).rejects.toThrow('Internal Server Error');
    expect(calls).toBe(3);
  });

  it('should respect Retry-After header with seconds', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        const error: any = new Error('Throttled');
        error.status = 429;
        error.response = {
          status: 429,
          headers: {
            get: (name: string) => (name === 'Retry-After' ? '1' : null),
          },
        };
        throw error;
      }
      return 'success';
    });

    const promise = withProviderResilience(
      {
        provider: 'generic',
        operation: 'test-retry-after-seconds',
        policy: {
          maxAttempts: 2,
          baseDelayMs: 1,
          maxDelayMs: 5,
          jitter: false,
        },
      },
      fn
    );

    const result = await promise;
    expect(result).toBe('success');
    expect(calls).toBe(2);
  });

  it('should respect Retry-After header with Date string', async () => {
    let calls = 0;
    const targetDate = new Date(Date.now() + 1000); // 1 second from now
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        const error: any = new Error('Throttled');
        error.status = 429;
        error.response = {
          status: 429,
          headers: {
            get: (name: string) => (name === 'Retry-After' ? targetDate.toUTCString() : null),
          },
        };
        throw error;
      }
      return 'success';
    });

    const promise = withProviderResilience(
      {
        provider: 'generic',
        operation: 'test-retry-after-date',
        policy: {
          maxAttempts: 2,
          baseDelayMs: 1,
          maxDelayMs: 5,
          jitter: false,
        },
      },
      fn
    );

    const result = await promise;
    expect(result).toBe('success');
    expect(calls).toBe(2);
  });
});

