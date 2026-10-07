import { describe, expect, it, vi } from 'vitest';

import { SerpApiMapsProvider } from '@/lib/maps/serpMapsProvider';

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const place = (overrides: Record<string, unknown> = {}) => ({
  place_id: 'place.1',
  title: 'Acme Dental',
  address: '123 Main St, Denver, CO',
  website: 'https://acmedental.test',
  phone: '3035550100',
  rating: 4.7,
  reviews: 80,
  gps_coordinates: { latitude: 39.7, longitude: -104.9 },
  type: 'Dentist',
  ...overrides,
});

const requestUrl = (fetchImpl: ReturnType<typeof vi.fn>, index = 0) =>
  new URL(String(fetchImpl.mock.calls[index]?.[0]));

describe('SerpApi Google Maps provider', () => {
  it('confirms an exact business match and loads place details once', async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      const type = new URL(String(url)).searchParams.get('type');
      return type === 'place'
        ? response({ place_results: place({ reviews: 80 }) })
        : response({ local_results: [place()] });
    });
    const provider = new SerpApiMapsProvider({
      apiKey: 'test-only',
      fetchImpl: mockFetch as typeof fetch,
    });

    const result = await provider.resolveBusiness({
      businessName: 'Acme Dental',
      city: 'Denver',
      domain: 'acmedental.test',
      phone: '3035550100',
      fieldProfile: 'GBP_DEEP',
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.data?.identityStatus).toBe('CONFIRMED');
    expect(result.data?.placeId).toBe('place.1');
    expect(result.data?.rating).toBe(4.7);
    expect(calls).toHaveLength(2);
    expect(requestUrl(mockFetch, 0).searchParams.get('engine')).toBe('google_maps');
    expect(requestUrl(mockFetch, 0).searchParams.get('type')).toBe('search');
    expect(requestUrl(mockFetch, 0).searchParams.get('q')).toContain('Acme Dental');
    expect(requestUrl(mockFetch, 1).searchParams.get('type')).toBe('place');
    expect(requestUrl(mockFetch, 1).searchParams.get('place_id')).toBe('place.1');
    expect(result.provenance.provider).toBe('serpapi_google_maps');
    expect(result.provenance.cache).toBe('MISS');
    expect(JSON.stringify(result)).not.toContain('test-only');
  });

  it('returns PARTIAL for same-name, same-city ambiguous candidates', async () => {
    const provider = new SerpApiMapsProvider({
      apiKey: 'test-only',
      fetchImpl: vi.fn(async () =>
        response({
          local_results: [
            place({ place_id: 'place-1', address: '1 Main Street, Denver' }),
            place({ place_id: 'place-2', address: '2 Main Street, Denver' }),
          ],
        })
      ) as typeof fetch,
    });

    const result = await provider.resolveBusiness({ businessName: 'Acme Dental', city: 'Denver' });

    expect(result.status).toBe('PARTIAL');
    expect(result.data?.identityStatus).toBe('AMBIGUOUS');
    expect(result.data?.alternateCandidates).toHaveLength(1);
    expect(result.data?.fieldProfile).toBe('IDENTITY_MINIMAL');
  });

  it.each([401, 429, 503])(
    'preserves provider HTTP %i failures instead of returning an empty match',
    async (status) => {
      const provider = new SerpApiMapsProvider({
        apiKey: 'test-only',
        fetchImpl: vi.fn(async () =>
          response({ error: 'provider unavailable' }, status)
        ) as typeof fetch,
      });

      const result = await provider.resolveBusiness({
        businessName: 'Acme Dental',
        city: 'Denver',
      });

      expect(result.status).toBe('FAILED');
      expect(result.error?.code).toBe(status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
    }
  );

  it('does not make HTTP calls or classify an unconfigured provider as a business miss', async () => {
    const fetchImpl = vi.fn();
    const provider = new SerpApiMapsProvider({ apiKey: '', fetchImpl: fetchImpl as typeof fetch });

    const result = await provider.resolveBusiness({ businessName: 'Acme Dental', city: 'Denver' });

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.error?.code).toBe('NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('clamps nearby radius and returned candidate count', async () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      place({ place_id: `place-${index}`, title: `Business ${index}` })
    );
    const fetchImpl = vi.fn(async () => response({ local_results: candidates }));
    const provider = new SerpApiMapsProvider({
      apiKey: 'test-only',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await provider.searchNearby({
      latitude: 40,
      longitude: -105,
      radiusMeters: 500_000,
      maxResults: 300,
    });
    const url = requestUrl(fetchImpl);

    expect(url.searchParams.get('ll')).toBe('@40,-105');
    expect(url.searchParams.get('m')).toBe('50000');
    expect(result.data).toHaveLength(20);
  });

  it('supports reverse geocoding only when enabled', async () => {
    const fetchImpl = vi.fn(async () => response({ local_results: [place()] }));
    const disabled = new SerpApiMapsProvider({
      apiKey: 'test-only',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect((await disabled.reverseGeocode(39.7, -104.9)).status).toBe('UNAVAILABLE');
    expect(fetchImpl).not.toHaveBeenCalled();

    const enabled = new SerpApiMapsProvider({
      apiKey: 'test-only',
      fetchImpl: fetchImpl as typeof fetch,
      enableGeocoding: true,
    });
    expect((await enabled.reverseGeocode(39.7, -104.9)).data?.placeId).toBe('place.1');
  });

  it('does not expose the API key in provenance or returned data', async () => {
    const provider = new SerpApiMapsProvider({
      apiKey: 'server-secret-test',
      fetchImpl: vi.fn(async () => response({ local_results: [place()] })) as typeof fetch,
    });

    const result = await provider.searchText({ query: 'Acme' });

    expect(JSON.stringify(result)).not.toContain('server-secret-test');
  });

  it('does not write place data to the persistent module cache', async () => {
    const { getSharedStore } = await import('@/lib/store/shared');
    const store = await getSharedStore();
    const set = vi.spyOn(store, 'set');
    const provider = new SerpApiMapsProvider({
      apiKey: 'test-only',
      fetchImpl: vi.fn(async () =>
        response({ local_results: [place({ title: 'Sensitive Place Name' })] })
      ) as typeof fetch,
    });

    const result = await provider.searchText({ query: 'Sensitive Place Name' });

    expect(result.provenance.cache).toBe('MISS');
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});
