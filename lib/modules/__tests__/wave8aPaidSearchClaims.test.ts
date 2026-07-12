import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: { signal?: AbortSignal },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => fn({ signal: options.signal || new AbortController().signal }),
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: mocks.safeFetch }));

import { validateFinding } from '@/lib/audit/findingContract';

import { runPaidSearchModule } from '../paidSearch';

const input = {
  url: 'https://acme.test/',
  businessName: 'Acme',
  businessType: 'dentist',
  city: 'Regina',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('paid-search bounded observation claims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERP_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.SERP_API_KEY;
  });

  it('reports an observed business ad with bounded query/provider/location/device Evidence', async () => {
    mocks.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes('serpapi')) {
        return response({ ads: [{ title: 'Acme', link: 'https://acme.test/offer' }] });
      }
      return new Response('<script></script>', { status: 200 });
    });

    const result = await runPaidSearchModule(input);
    const observed = result.findings.find((f) => /paid search ad observed/i.test(f.title));

    expect(result.execution?.state).toBe('complete');
    expect(observed?.description).toMatch(/bounded.*snapshot/i);
    expect(observed?.evidence[0]).toMatchObject({ source: 'serpapi_paid_search' });
    expect(observed?.evidence[0].raw).toMatchObject({
      query: 'dentist Regina',
      location: 'Regina',
      language: 'en',
      device: 'desktop',
      provider: 'SerpAPI',
    });
    expect(validateFinding({ ...observed, module: 'paidSearch' }).success).toBe(true);
  });

  it('describes a successful empty result only as no ad observed in the bounded sample', async () => {
    mocks.safeFetch.mockImplementation(async (url: string) =>
      url.includes('serpapi') ? response({ ads: [] }) : new Response('', { status: 200 })
    );
    const result = await runPaidSearchModule(input);
    const text = JSON.stringify(result);

    expect(text).toMatch(/no business ad observed/i);
    expect(text).toMatch(/bounded/i);
    expect(text).not.toMatch(/\b(not advertising|not running any google ads|runs no campaigns)\b/i);
  });

  it.each([
    ['missing key', undefined, 200],
    ['quota response', 'test-key', 429],
    ['provider failure', 'test-key', 503],
  ])('keeps %s unavailable instead of verified absence', async (_name, key, status) => {
    if (key) process.env.SERP_API_KEY = key;
    else delete process.env.SERP_API_KEY;
    mocks.safeFetch.mockImplementation(async (url: string) =>
      url.includes('serpapi') ? response({}, status) : new Response('', { status: 200 })
    );

    const result = await runPaidSearchModule(input);
    expect(result.execution?.state).not.toBe('complete');
    expect(JSON.stringify(result)).not.toMatch(/\bnot advertising\b/i);
  });

  it('does not attribute an ad to the business by substring or an unrelated advertiser domain', async () => {
    mocks.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes('serpapi')) {
        return response({
          ads: [
            { title: 'Lookalike', link: 'https://acme.test.evil.example/' },
            { title: 'Competitor', link: 'https://competitor.test/' },
          ],
        });
      }
      return new Response('', { status: 200 });
    });

    const result = await runPaidSearchModule(input);
    expect(JSON.stringify(result)).toMatch(/no business ad observed/i);
    expect(JSON.stringify(result)).not.toMatch(/\$1-3 per click|\$500-1000/);
  });
});
