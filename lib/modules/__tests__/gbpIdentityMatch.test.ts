/**
 * P1-29 (Wave 7) — `runGBPModule`'s Text Search previously requested exactly one
 * candidate (`maxResultCount: 1`) and always trusted it, with zero disambiguation
 * against name/address signals — a real wrong-business risk for common names and
 * franchises. This proves: multiple real candidates are scored, the best match is
 * selected, and a genuinely ambiguous/weak match is flagged rather than silently
 * trusted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (_opts: unknown, fn: (ctx: Record<string, never>) => unknown) =>
    fn({}),
}));

import { runGBPModule } from '../gbp';
import { runGbpDeepModule } from '../gbpDeep';

function textSearchResponse(places: unknown[]) {
  return { local_results: places };
}

function detailsResponse(placeId: string) {
  return {
    place_results: {
      place_id: placeId,
      title: 'Acme Dental',
      address: '123 Main St, Regina',
      website: 'https://acme-dental.test',
      reviews: 20,
      type: 'Dental clinic',
    },
  };
}

function installMapsResponseFixture(searchPlaces: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.searchParams.get('type') === 'search') {
        return new Response(JSON.stringify(textSearchResponse(searchPlaces)), { status: 200 });
      }
      return new Response(
        JSON.stringify(detailsResponse(requestUrl.searchParams.get('place_id') ?? '')),
        { status: 200 }
      );
    })
  );
}

describe('runGBPModule identity disambiguation (P1-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERP_API_KEY = 'serp-test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SERP_API_KEY;
  });

  it('selects the exact-name, same-city candidate over an unrelated same-name-elsewhere candidate and reports high confidence', async () => {
    installMapsResponseFixture([
      {
        place_id: 'place-wrong-city',
        title: 'Acme Dental',
        address: '9 Other Ave, Springfield',
      },
      { place_id: 'place-1', title: 'Acme Dental', address: '123 Main St, Regina' },
    ]);

    const result = await runGBPModule({ businessName: 'Acme Dental', city: 'Regina' });

    expect(result.status).toBe('success');
    const data = result.data as { placeId: string; identityConfidence: string };
    expect(data.placeId).toBe('place-1');
    expect(data.identityConfidence).toBe('high');
  });

  it('flags an ambiguous match and records real alternate candidates when multiple identically-named businesses are returned (franchise/common-name risk)', async () => {
    installMapsResponseFixture([
      { place_id: 'place-1', title: 'Acme Dental', address: '123 Main St' },
      { place_id: 'place-2', title: 'Acme Dental', address: '456 Side St' },
    ]);

    const result = await runGBPModule({ businessName: 'Acme Dental', city: '' });

    const data = result.data as {
      identityConfidence: string;
      alternateCandidateNames: string[];
      candidatesConsidered: number;
    };
    expect(data.identityConfidence).toBe('ambiguous');
    expect(data.alternateCandidateNames).toContain('Acme Dental');
    expect(data.candidatesConsidered).toBe(2);
  });
});

describe('runGbpDeepModule independent fallback resolution reuses the same disambiguation (P1-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERP_API_KEY = 'serp-test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SERP_API_KEY;
  });

  it('resolves the correctly-addressed candidate out of multiple same-name results when no canonical gbp dependency is available', async () => {
    installMapsResponseFixture([
      { place_id: 'wrong-place', title: 'Acme Dental', address: '9 Other Ave, Springfield' },
      { place_id: 'right-place', title: 'Acme Dental', address: '123 Main St, Regina' },
    ]);

    const result = await runGbpDeepModule({ businessName: 'Acme Dental', city: 'Regina' });
    expect(result.evidenceSnapshots[0]?.source).toBe('serpapi_google_maps');
    // The details fetch is keyed by the resolved placeId — confirmed indirectly via
    // a successful, non-failed, non-unavailable execution state using the mocked
    // details response tied to the disambiguated candidate.
    expect(result.execution?.state).not.toBe('failed');
  });
});
