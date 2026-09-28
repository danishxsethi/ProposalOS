import { describe, expect, it, vi } from 'vitest';

import { GoogleMapsProvider } from '@/lib/maps/googleMapsProvider';

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('canonical Maps intelligence provider', () => {
  it('resolves exact business using identity signals then fetches details once', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      if (String(url).endsWith('places:searchText')) return response({ places: [{ id: 'places/place.1', displayName: { text: 'Acme Dental' }, formattedAddress: '123 Main St, Denver, CO', websiteUri: 'https://acmedental.test', nationalPhoneNumber: '3035550100' }] });
      return response({ id: 'places/place.1', displayName: { text: 'Acme Dental' }, formattedAddress: '123 Main St, Denver, CO', websiteUri: 'https://acmedental.test', nationalPhoneNumber: '3035550100', rating: 4.7, userRatingCount: 80, location: { latitude: 39.7, longitude: -104.9 }, googleMapsUri: 'https://maps.google.test/place.1' });
    });
    const provider = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: fetchImpl as typeof fetch });
    const result = await provider.resolveBusiness({ businessName: 'Acme Dental', city: 'Denver', domain: 'acmedental.test', phone: '3035550100', fieldProfile: 'GBP_DEEP' });
    expect(result.status).toBe('COMPLETE');
    expect(result.data?.identityStatus).toBe('CONFIRMED');
    expect(result.data?.placeId).toBe('place.1');
    expect(result.data?.rating).toBe(4.7);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.get('X-Goog-FieldMask')).toContain('places.id');
    expect(calls[1]?.headers.get('X-Goog-FieldMask')).toContain('reviews');
    expect(result.provenance.provider).toBe('google_maps_platform');
    expect(result.provenance.cache).toBe('NOT_CACHEABLE');
    expect(JSON.stringify(result)).not.toContain('test-only');
  });

  it('returns PARTIAL for same-name, same-city ambiguous candidates', async () => {
    const provider = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: vi.fn(async () => response({ places: [
      { id: 'place-1', displayName: { text: 'Acme Dental' }, formattedAddress: '1 Main Street, Denver' },
      { id: 'place-2', displayName: { text: 'Acme Dental' }, formattedAddress: '2 Main Street, Denver' },
    ] })) as typeof fetch });
    const result = await provider.resolveBusiness({ businessName: 'Acme Dental', city: 'Denver' });
    expect(result.status).toBe('PARTIAL');
    expect(result.data?.identityStatus).toBe('AMBIGUOUS');
    expect(result.data?.alternateCandidates).toHaveLength(1);
    expect(result.data?.fieldProfile).toBe('IDENTITY_MINIMAL');
  });

  it.each([401, 429, 503])('does not turn provider HTTP %i into an empty match', async (status) => {
    const provider = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: vi.fn(async () => response({ error: 'provider unavailable' }, status)) as typeof fetch });
    const result = await provider.resolveBusiness({ businessName: 'Acme Dental', city: 'Denver' });
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe(status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
  });

  it('does not make HTTP calls or classify unavailable provider as a business miss', async () => {
    const fetchImpl = vi.fn();
    const provider = new GoogleMapsProvider({ apiKey: '', fetchImpl: fetchImpl as typeof fetch });
    const result = await provider.resolveBusiness({ businessName: 'Acme Dental', city: 'Denver' });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.error?.code).toBe('NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('clamps Nearby Search radius and result counts', async () => {
    const fetchImpl = vi.fn(async () => response({ places: [] }));
    const provider = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: fetchImpl as typeof fetch });
    await provider.searchNearby({ latitude: 40, longitude: -105, radiusMeters: 500_000, maxResults: 300 });
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody.maxResultCount).toBe(20);
    expect(requestBody.locationRestriction.circle.radius).toBe(50_000);
  });

  it('supports reverse geocoding only when the optional capability is enabled', async () => {
    const fetchImpl = vi.fn(async () => response({ status: 'OK', results: [{ formatted_address: '1 Main St', place_id: 'place.1', geometry: { location: { lat: 40, lng: -105 } } }] }));
    const disabled = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: fetchImpl as typeof fetch });
    expect((await disabled.reverseGeocode(40, -105)).status).toBe('UNAVAILABLE');
    expect(fetchImpl).not.toHaveBeenCalled();
    const enabled = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: fetchImpl as typeof fetch, enableGeocoding: true });
    expect((await enabled.reverseGeocode(40, -105)).data?.placeId).toBe('place.1');
  });

  it('does not expose the API key in provenance or returned data', async () => {
    const provider = new GoogleMapsProvider({ apiKey: 'server-secret-test', fetchImpl: vi.fn(async () => response({ places: [{ id: 'place-1', displayName: { text: 'Acme' } }] })) as typeof fetch });
    const result = await provider.searchText({ query: 'Acme' });
    expect(JSON.stringify(result)).not.toContain('server-secret-test');
  });

  it('does not write Places content to the persistent module cache', async () => {
    const { getSharedStore } = await import('@/lib/store/shared');
    const store = await getSharedStore();
    const set = vi.spyOn(store, 'set');
    const provider = new GoogleMapsProvider({ apiKey: 'test-only', fetchImpl: vi.fn(async () => response({ places: [{ id: 'place-1', displayName: { text: 'Sensitive Place Name' } }] })) as typeof fetch });
    const result = await provider.searchText({ query: 'Sensitive Place Name' });
    expect(result.provenance.cache).toBe('NOT_CACHEABLE');
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});
