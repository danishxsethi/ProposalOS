/**
 * Wave 7B — P2-27: techStack's raw HTML fetch was invisible to CostTracker (no
 * `addApiCall` at its only `safeFetch` site). Red-before: a successful analysis
 * recorded zero calls in `tracker.usage` even though a real network request was
 * made. Green-after: exactly one WEBSITE_FETCH call is recorded per real network
 * round-trip — never for the reused-HTML branch, never before a response is
 * actually received, and never twice for one logical fetch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: { signal?: AbortSignal; policy?: { maxAttempts?: number } },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => {
    const attempts = options.policy?.maxAttempts ?? 1;
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn({ signal: options.signal || new AbortController().signal });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  },
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));

import { safeFetch } from '@/lib/security/safeFetch';
import { CostTracker } from '@/lib/costs/costTracker';

import { runTechStackModule } from '../techStack';

describe('techStack CostTracker wiring (P2-27)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records exactly one WEBSITE_FETCH call for a successful real fetch', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      new Response('<html><body>hi</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    );
    const tracker = new CostTracker();
    const addApiCallSpy = vi.spyOn(tracker, 'addApiCall');

    await runTechStackModule({ url: 'https://acme.test' }, tracker);

    expect(addApiCallSpy).toHaveBeenCalledTimes(1);
    expect(addApiCallSpy).toHaveBeenCalledWith('WEBSITE_FETCH');
    expect(tracker.getReport().usage.WEBSITE_FETCH).toBe(1);
    // The call is real but zero-cost — no phantom spend introduced.
    expect(tracker.getTotalCents()).toBe(0);
  });

  it('records zero calls when HTML is reused (no network call made)', async () => {
    const tracker = new CostTracker();
    const addApiCallSpy = vi.spyOn(tracker, 'addApiCall');

    await runTechStackModule(
      { url: 'https://acme.test', html: '<html><body>cached</body></html>' },
      tracker
    );

    expect(safeFetch).not.toHaveBeenCalled();
    expect(addApiCallSpy).not.toHaveBeenCalled();
  });

  it('records zero calls when the fetch fails before any response is received', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('DNS resolution failed'));
    const tracker = new CostTracker();
    const addApiCallSpy = vi.spyOn(tracker, 'addApiCall');

    const result = await runTechStackModule({ url: 'https://acme.test' }, tracker);

    // Module degrades gracefully (tech stack is non-critical) but must not have
    // recorded a call for a network round-trip that never completed.
    expect(result.findings).toEqual([]);
    expect(addApiCallSpy).not.toHaveBeenCalled();
  });

  it('propagates abort before execution without a fetch or phantom cost', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    const tracker = new CostTracker();
    const addApiCallSpy = vi.spyOn(tracker, 'addApiCall');

    const result = await runTechStackModule(
      { url: 'https://acme.test', signal: controller.signal },
      tracker
    );

    expect(result.findings).toEqual([]);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(addApiCallSpy).not.toHaveBeenCalled();
  });

  it('records one call per real attempt when a retry occurs (no phantom, no undercount)', async () => {
    vi.mocked(safeFetch)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('<html></html>', { status: 200 }));
    const tracker = new CostTracker();
    const addApiCallSpy = vi.spyOn(tracker, 'addApiCall');

    await runTechStackModule({ url: 'https://acme.test' }, tracker);

    // Two real HTTP responses were actually received (one 503, one success) —
    // both are real network activity and must both be visible.
    expect(addApiCallSpy).toHaveBeenCalledTimes(2);
  });

  it('works with no tracker provided (tracker is optional)', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));
    await expect(runTechStackModule({ url: 'https://acme.test' })).resolves.toBeDefined();
  });
});
