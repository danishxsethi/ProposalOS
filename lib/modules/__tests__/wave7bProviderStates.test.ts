import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: { signal?: AbortSignal },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => fn({ signal: options.signal || new AbortController().signal }),
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));

import { safeFetch } from '@/lib/security/safeFetch';

import { runBacklinksModule } from '../backlinks';
import { runCompetitorModule } from '../competitor';
import { runVideoModule } from '../videoPresence';

describe('provider-state distinctions (P2-46)', () => {
  const savedEnv = {
    serp: process.env.SERP_API_KEY,
    places: process.env.GOOGLE_PLACES_API_KEY,
    pageSpeed: process.env.GOOGLE_PAGESPEED_API_KEY,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERP_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PAGESPEED_API_KEY;
  });

  afterEach(() => {
    if (savedEnv.serp === undefined) delete process.env.SERP_API_KEY;
    else process.env.SERP_API_KEY = savedEnv.serp;
    if (savedEnv.places === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = savedEnv.places;
    if (savedEnv.pageSpeed === undefined) delete process.env.GOOGLE_PAGESPEED_API_KEY;
    else process.env.GOOGLE_PAGESPEED_API_KEY = savedEnv.pageSpeed;
  });

  it('marks competitor discovery unavailable rather than returning a zero-result shape', async () => {
    const result = await runCompetitorModule({ keyword: 'Acme Dental', location: 'Regina' });

    expect(result.status).toBe('success');
    expect(result.data).toMatchObject({
      competitorSearchStatus: 'not_configured',
      execution: { state: 'unavailable' },
    });
  });

  it('keeps backlinks unavailable until a real provider is configured', async () => {
    const result = await runBacklinksModule({
      websiteUrl: 'https://acme.test',
      businessName: 'Acme Dental',
      city: 'Regina',
    });

    expect(result.findings).toEqual([]);
    expect(result.execution).toMatchObject({ state: 'unavailable' });
  });

  it('keeps video discovery unavailable, without a no-channel finding, when SerpAPI is absent', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('website fetch unavailable'));

    const result = await runVideoModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteUrl: 'https://acme.test',
      competitors: [],
    });

    expect(result.execution).toMatchObject({ state: 'unavailable' });
    expect(result.findings).toEqual([]);
  });
});
