import { describe, it, expect, vi } from 'vitest';
import { withProviderResilience } from '../withProviderResilience';
import { ProviderTimeoutError } from '../types';

describe('Resilience - Timeouts', () => {
  it('should timeout and abort the call if it takes longer than timeoutMs', async () => {
    const fn = vi.fn().mockImplementation(async ({ signal }) => {
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          reject(new Error('Aborted'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort);
        
        // Use a small timeout that is longer than the policy's timeoutMs (10ms)
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve('done');
        }, 50);

        // Cleanup on abort
        signal.addEventListener('abort', () => clearTimeout(timer));
      });
    });

    const promise = withProviderResilience(
      {
        provider: 'generic',
        operation: 'test-timeout',
        policy: {
          timeoutMs: 10, // Timeout after 10ms
          maxAttempts: 1, // Only try once to test timeout immediately
        },
      },
      fn
    );

    await expect(promise).rejects.toThrow(ProviderTimeoutError);
    await expect(promise).rejects.toThrow('Request timed out after 10ms');
    expect(fn).toHaveBeenCalled();
  });
});
