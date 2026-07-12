import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: {
      signal?: AbortSignal;
      policy?: { maxAttempts?: number };
      degrade?: boolean;
      fallbackValue?: unknown;
    },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => {
    const attempts = options.policy?.maxAttempts ?? 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await fn({ signal: options.signal || new AbortController().signal });
      } catch (error) {
        lastError = error;
      }
    }
    if (options.degrade) return options.fallbackValue;
    throw lastError;
  },
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, callback: () => Promise<unknown>) =>
    callback(),
}));

import { CostTracker } from '@/lib/costs/costTracker';
import { safeFetch } from '@/lib/security/safeFetch';

import { findEmails } from '../emailFinder';
import { crawlWebsite } from '../websiteCrawler';

describe('P2-27 emailFinder tracker wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a completed fetch exactly once and preserves verified empty results', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response('<html><body>none</body></html>'));
    const tracker = new CostTracker();

    const result = await findEmails('https://acme.test', tracker);

    expect(result).toMatchObject({ emails: [], source: 'website_scrape' });
    expect(tracker.getReport().usage.WEBSITE_FETCH).toBe(1);
    expect(tracker.getTotalCents()).toBe(0);
  });

  it('does not record a phantom call when the fetch fails before a response', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('DNS failure'));
    const tracker = new CostTracker();

    const result = await findEmails('https://acme.test', tracker);

    expect(result.source).toBe('failed');
    expect(tracker.getReport().usage.WEBSITE_FETCH).toBeUndefined();
  });
});

describe('P2-27 websiteCrawler tracker wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records each completed bounded crawl operation without pricing free HTTP work', async () => {
    vi.mocked(safeFetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /');
      }
      return new Response('<html><head><title>Acme</title></head><body>content</body></html>');
    });
    const tracker = new CostTracker();

    const result = await crawlWebsite({
      url: 'https://acme.test',
      businessName: 'Acme',
      tracker,
    });

    expect(result.crawledPages).toHaveLength(1);
    // robots.txt, page analysis, and link extraction are separate completed fetches.
    expect(tracker.getReport().usage.WEBSITE_FETCH).toBe(3);
    expect(tracker.getTotalCents()).toBe(0);
  });

  it('does not record a fetch when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Stopped', 'AbortError'));
    const tracker = new CostTracker();

    await expect(
      crawlWebsite({
        url: 'https://acme.test',
        businessName: 'Acme',
        tracker,
        signal: controller.signal,
      })
    ).rejects.toThrow(/stopped|abort/i);

    expect(safeFetch).not.toHaveBeenCalled();
    expect(tracker.getReport().usage.WEBSITE_FETCH).toBeUndefined();
  });
});
