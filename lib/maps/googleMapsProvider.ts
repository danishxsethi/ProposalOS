import { createHash } from 'node:crypto';

import { CostTracker } from '@/lib/costs/costTracker';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';

import type {
  BusinessResolutionInput,
  GeocodeInput,
  MapsIntelligenceProvider,
  MapsOperation,
  MapsProvenance,
  MapsResult,
  NearbySearchInput,
  NormalizedPlace,
  PlacesCandidate,
  PlaceSearchInput,
  RouteMatrixInput,
} from './types';

const BASE = 'https://places.googleapis.com/v1';
const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES_BASE = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const MAX_PAGE_SIZE = 20;
const MAX_NEARBY_RADIUS_METERS = 50_000;

const FIELD_PROFILES = {
  IDENTITY_MINIMAL: 'id,displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,internationalPhoneNumber,primaryType,primaryTypeDisplayName,types,googleMapsUri',
  GBP_STANDARD: 'id,displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,internationalPhoneNumber,rating,userRatingCount,reviews,photos,regularOpeningHours,types,primaryType,primaryTypeDisplayName,editorialSummary,googleMapsUri',
  GBP_DEEP: 'id,displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,internationalPhoneNumber,rating,userRatingCount,reviews,photos,regularOpeningHours,types,primaryType,primaryTypeDisplayName,editorialSummary,paymentOptions,accessibilityOptions,amenities,googleMapsUri',
  COMPETITOR: 'id,displayName,formattedAddress,location,websiteUri,rating,userRatingCount,primaryType,primaryTypeDisplayName,types,googleMapsUri',
  MULTI_LOCATION: 'id,displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,primaryType,primaryTypeDisplayName,types,googleMapsUri',
} as const;

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  reviews?: Array<{ rating?: number; publishTime?: string; text?: { text?: string }; authorAttribution?: { displayName?: string } }>;
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
  regularOpeningHours?: unknown;
  editorialSummary?: { text?: string };
  paymentOptions?: unknown;
  accessibilityOptions?: unknown;
  amenities?: unknown;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  attributions?: Array<{ provider?: string; providerUri?: string }>;
};

type RawGeocodeResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    place_id?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function profile(profile: PlaceSearchInput['fieldProfile']): keyof typeof FIELD_PROFILES {
  return profile && profile in FIELD_PROFILES ? profile : 'IDENTITY_MINIMAL';
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function host(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function phoneDigits(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length >= 7 ? digits : null;
}

export function scorePlaceIdentity(
  place: Pick<RawPlace, 'displayName' | 'formattedAddress' | 'websiteUri' | 'nationalPhoneNumber' | 'internationalPhoneNumber' | 'location'> | Pick<NormalizedPlace, 'displayName' | 'formattedAddress' | 'website' | 'phone' | 'latitude' | 'longitude'>,
  input: BusinessResolutionInput
): number {
  const expectedName = normalizeText(input.businessName);
  const actualName = normalizeText(typeof place.displayName === 'string' ? place.displayName : place.displayName?.text);
  let score = 0;
  if (expectedName && actualName) {
    if (actualName === expectedName) score += 45;
    else {
      const expected = new Set(expectedName.split(' '));
      const actual = new Set(actualName.split(' '));
      const overlap = [...expected].filter((word) => actual.has(word)).length;
      score += Math.round((overlap / Math.max(expected.size, 1)) * 30);
      if (actualName.includes(expectedName) || expectedName.includes(actualName)) score += 10;
    }
  }

  const expectedCity = normalizeText(input.city);
  const address = normalizeText(place.formattedAddress);
  if (expectedCity && address.includes(expectedCity)) score += 20;
  if (input.address) {
    const expectedAddress = normalizeText(input.address);
    score += address.includes(expectedAddress) || expectedAddress.includes(address) ? 15 : -12;
  }

  const requestedDomain = host(input.domain);
  const resultDomain = host('website' in place ? place.website : place.websiteUri);
  if (requestedDomain && resultDomain) score += requestedDomain === resultDomain ? 25 : -25;

  const requestedPhone = phoneDigits(input.phone);
  const resultPhone = phoneDigits('phone' in place ? place.phone : place.nationalPhoneNumber ?? place.internationalPhoneNumber);
  if (requestedPhone && resultPhone) score += requestedPhone === resultPhone ? 25 : -25;

  const placeLatitude = 'latitude' in place ? place.latitude : place.location?.latitude;
  const placeLongitude = 'longitude' in place ? place.longitude : place.location?.longitude;
  if (input.latitude != null && input.longitude != null && placeLatitude != null && placeLongitude != null) {
    const distance = haversineMeters(input.latitude, input.longitude, placeLatitude, placeLongitude);
    score += distance <= 500 ? 20 : distance <= 5_000 ? 10 : distance <= 25_000 ? 2 : -15;
  }
  return Math.max(0, Math.min(100, score));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePlace(
  raw: RawPlace,
  identityStatus: NormalizedPlace['identityStatus'],
  score: number | null,
  candidateCount: number,
  alternates: NormalizedPlace['alternateCandidates'],
  collectedAt: string,
  fieldProfile: string
): NormalizedPlace {
  return {
    provider: 'google_maps_platform',
    placeId: raw.id?.replace(/^places\//, '') ?? '',
    displayName: raw.displayName?.text ?? null,
    formattedAddress: raw.formattedAddress ?? null,
    latitude: typeof raw.location?.latitude === 'number' ? raw.location.latitude : null,
    longitude: typeof raw.location?.longitude === 'number' ? raw.location.longitude : null,
    website: raw.websiteUri ?? null,
    phone: raw.nationalPhoneNumber ?? raw.internationalPhoneNumber ?? null,
    primaryType: raw.primaryTypeDisplayName?.text ?? raw.primaryType ?? null,
    types: Array.isArray(raw.types) ? raw.types : [],
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    reviewCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    mapsUri: raw.googleMapsUri ?? null,
    editorialSummary: raw.editorialSummary?.text ?? null,
    openingHours: raw.regularOpeningHours ?? null,
    paymentOptions: raw.paymentOptions ?? null,
    accessibilityOptions: raw.accessibilityOptions ?? null,
    amenities: raw.amenities ?? null,
    reviews: raw.reviews?.map((review) => ({ rating: review.rating ?? null, publishTime: review.publishTime ?? null, text: review.text?.text ?? null, authorName: review.authorAttribution?.displayName ?? null })) ?? [],
    photos: raw.photos?.flatMap((photo) => photo.name ? [{ name: photo.name, widthPx: photo.widthPx ?? null, heightPx: photo.heightPx ?? null }] : []) ?? [],
    providerAttributions: raw.attributions?.map((entry) => [entry.provider, entry.providerUri].filter(Boolean).join(' ')).filter(Boolean) ?? [],
    identityStatus,
    identityConfidence: score,
    candidateCount,
    alternateCandidates: alternates,
    collectedAt,
    fieldProfile,
  };
}

export class GoogleMapsProvider implements MapsIntelligenceProvider {
  constructor(
    private readonly options: {
      apiKey?: string;
      fetchImpl?: typeof fetch;
      tracker?: CostTracker;
      enableGeocoding?: boolean;
      enableRoutes?: boolean;
    } = {}
  ) {}

  private get key(): string | null {
    return this.options.apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? null;
  }

  private get fetcher(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private checkCostBudget(operation: MapsOperation): void {
    const tracker = this.options.tracker;
    if (!tracker) return;
    const allowed = operation === 'getPlace'
      ? tracker.hasBudgetForApiCall('PLACES_DETAILS')
      : tracker.hasBudgetForApiCall('PLACES_TEXT_SEARCH');
    if (!allowed) throw new Error('MAPS_COST_CAP_EXCEEDED: Maps call would exceed the audit provider budget');
  }

  private budgetFailure<T>(operation: MapsOperation, input: unknown, costClass: MapsProvenance['costClass'], error: unknown): MapsResult<T> {
    return { status: 'UNAVAILABLE', data: null, provenance: this.provenance(operation, 'IDENTITY_MINIMAL', input, 'BYPASS', costClass), error: { code: 'COST_CAP_EXCEEDED', message: error instanceof Error ? error.message : 'Maps cost cap exceeded' } };
  }

  private provenance(operation: MapsOperation, fieldProfile: string, input: unknown, cache: MapsProvenance['cache'], costClass: MapsProvenance['costClass']): MapsProvenance {
    return {
      provider: 'google_maps_platform', operation, fieldProfile,
      collectedAt: new Date().toISOString(), requestFingerprint: fingerprint(input), cache, costClass,
    };
  }

  private unavailable<T>(operation: MapsOperation, fieldProfile: string, input: unknown, costClass: MapsProvenance['costClass']): MapsResult<T> {
    const missingKey = !this.key;
    return {
      status: 'UNAVAILABLE', data: null,
      provenance: this.provenance(operation, fieldProfile, input, 'BYPASS', costClass),
      error: { code: missingKey ? 'NOT_CONFIGURED' : 'PROVIDER_ERROR', message: missingKey ? 'Maps provider is not configured' : 'Maps capability is disabled' },
    };
  }

  private async requestJson<T>(url: string, init: RequestInit, operation: MapsOperation, input: unknown, fieldProfile: string, costClass: MapsProvenance['costClass']): Promise<MapsResult<T>> {
    if (!this.key) return this.unavailable(operation, fieldProfile, input, costClass);
    try {
      const response = await withProviderResilience<Response>(
        { provider: 'google-places', operation: `maps:${operation}`, degrade: false, policy: { timeoutMs: 8_000, maxAttempts: 2 } },
        async ({ signal }) => {
          const result = await this.fetcher(url, { ...init, signal });
          if (!result.ok) {
            const error = new Error(`Google Maps ${operation} failed (${result.status})`);
            (error as Error & { status?: number }).status = result.status;
            throw error;
          }
          return result;
        }
      );
      const data = (await response.json()) as T;
      return { status: 'COMPLETE', data, provenance: this.provenance(operation, fieldProfile, input, 'MISS', costClass) };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google Maps request failed';
      const rateLimited = errorMessage.toLowerCase().includes('429') || errorMessage.toLowerCase().includes('rate limit');
      return {
        status: 'FAILED', data: null,
        provenance: this.provenance(operation, fieldProfile, input, 'BYPASS', costClass),
        error: { code: rateLimited ? 'RATE_LIMITED' : 'PROVIDER_ERROR', message: errorMessage },
      };
    }
  }

  private async searchPlaces(inputKey: Record<string, unknown>, operation: 'searchText' | 'searchNearby', fieldProfile: keyof typeof FIELD_PROFILES, makeRequest: () => Promise<MapsResult<{ places?: RawPlace[] }>>): Promise<MapsResult<PlacesCandidate[]>> {
    if (!this.key) return this.unavailable(operation, fieldProfile, inputKey, 'PLACES_TEXT_SEARCH');
    const response = await makeRequest();
    if (response.status !== 'COMPLETE' || !response.data) return response as MapsResult<PlacesCandidate[]>;
    this.options.tracker?.addApiCall('PLACES_TEXT_SEARCH');
    const normalized = (response.data.places ?? []).filter((p) => typeof p.id === 'string').map((place) => ({
      placeId: place.id!.replace(/^places\//, ''), displayName: place.displayName?.text ?? null,
      formattedAddress: place.formattedAddress ?? null, website: place.websiteUri ?? null,
      phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
      latitude: place.location?.latitude ?? null, longitude: place.location?.longitude ?? null,
      primaryType: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
      rating: place.rating ?? null, reviewCount: place.userRatingCount ?? null,
      mapsUri: place.googleMapsUri ?? null, collectedAt: response.provenance.collectedAt,
      identityStatus: 'UNAVAILABLE' as const, identityConfidence: null,
      providerAttributions: place.attributions?.map((entry) => [entry.provider, entry.providerUri].filter(Boolean).join(' ')).filter(Boolean) ?? [],
    }));
    return { ...response, data: normalized, provenance: { ...response.provenance, cache: 'NOT_CACHEABLE' } };
  }

  async searchText(input: PlaceSearchInput): Promise<MapsResult<PlacesCandidate[]>> {
    const profileName = profile(input.fieldProfile);
    const maxResults = Math.max(1, Math.min(MAX_PAGE_SIZE, input.maxResults ?? 5));
    const query = [input.query, input.city, input.region].filter(Boolean).join(' ');
    const request = { query, maxResults, profileName, countryCode: input.countryCode };
    try { this.checkCostBudget('searchText'); } catch (error) { return this.budgetFailure('searchText', request, 'PLACES_TEXT_SEARCH', error); }
    return this.searchPlaces(request, 'searchText', profileName, async () => {
      const result = await this.requestJson<{ places?: RawPlace[] }>(`${BASE}/places:searchText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key!, 'X-Goog-FieldMask': `places.${FIELD_PROFILES[profileName]},places.attributions` },
        body: JSON.stringify({ textQuery: query, maxResultCount: maxResults, regionCode: input.countryCode }),
      }, 'searchText', request, profileName, 'PLACES_TEXT_SEARCH');
      return result;
    });
  }

  async searchNearby(input: NearbySearchInput): Promise<MapsResult<PlacesCandidate[]>> {
    const profileName = profile(input.fieldProfile);
    const radiusMeters = Math.max(1, Math.min(MAX_NEARBY_RADIUS_METERS, input.radiusMeters));
    const maxResults = Math.max(1, Math.min(MAX_PAGE_SIZE, input.maxResults ?? 10));
    const request = { ...input, radiusMeters, maxResults, profileName };
    try { this.checkCostBudget('searchNearby'); } catch (error) { return this.budgetFailure('searchNearby', request, 'PLACES_TEXT_SEARCH', error); }
    return this.searchPlaces(request, 'searchNearby', profileName, async () => {
      const result = await this.requestJson<{ places?: RawPlace[] }>(`${BASE}/places:searchNearby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key!, 'X-Goog-FieldMask': `places.${FIELD_PROFILES[profileName]},places.attributions` },
        body: JSON.stringify({
          includedTypes: input.includedTypes?.slice(0, 20), maxResultCount: maxResults,
          locationRestriction: { circle: { center: { latitude: input.latitude, longitude: input.longitude }, radius: radiusMeters } },
        }),
      }, 'searchNearby', request, profileName, 'PLACES_TEXT_SEARCH');
      return result;
    });
  }

  async getPlace(placeId: string, fieldProfile?: PlaceSearchInput['fieldProfile']): Promise<MapsResult<NormalizedPlace>> {
    const profileName = profile(fieldProfile);
    const id = placeId.replace(/^places\//, '').trim();
    const input = { placeId: id, fieldProfile: profileName };
    try { this.checkCostBudget('getPlace'); } catch (error) { return this.budgetFailure('getPlace', input, 'PLACES_DETAILS', error); }
    if (!id || id.length > 256 || /[^A-Za-z0-9_.:-]/.test(id)) {
      return { status: 'FAILED', data: null, provenance: this.provenance('getPlace', profileName, input, 'BYPASS', 'PLACES_DETAILS'), error: { code: 'PROVIDER_ERROR', message: 'Invalid Google Place ID' } };
    }
    const response = await (async () => {
      const raw = await this.requestJson<RawPlace>(`${BASE}/places/${encodeURIComponent(id)}`, {
        headers: { 'X-Goog-Api-Key': this.key ?? '', 'X-Goog-FieldMask': FIELD_PROFILES[profileName] },
      }, 'getPlace', input, profileName, 'PLACES_DETAILS');
      return raw;
    })();
    if (response.status !== 'COMPLETE' || !response.data) return response as MapsResult<NormalizedPlace>;
    return { ...response, data: normalizePlace(response.data, 'CONFIRMED', 100, 1, [], response.provenance.collectedAt, profileName), provenance: { ...response.provenance, cache: 'NOT_CACHEABLE' } };
  }

  async resolveBusiness(input: BusinessResolutionInput): Promise<MapsResult<NormalizedPlace>> {
    const identityProfile = input.fieldProfile ?? 'IDENTITY_MINIMAL';
    if (input.placeId) {
      const direct = await this.getPlace(input.placeId, identityProfile);
      if (direct.status === 'COMPLETE' && direct.data) {
        const score = scorePlaceIdentity(direct.data, input);
        const confirmed = score >= 45;
        return { ...direct, status: confirmed ? 'COMPLETE' : 'PARTIAL', data: { ...direct.data, identityStatus: confirmed ? 'CONFIRMED' : 'AMBIGUOUS', identityConfidence: score, candidateCount: 1, alternateCandidates: [] } };
      }
      if (direct.status === 'FAILED') return direct;
    }
    const search = await this.searchText({ query: input.businessName, city: input.city, maxResults: 5, fieldProfile: 'IDENTITY_MINIMAL' });
    if (search.status !== 'COMPLETE' || !search.data) return search as unknown as MapsResult<NormalizedPlace>;
    if (search.data.length === 0) {
      return { status: 'COMPLETE', data: null, provenance: search.provenance, error: { code: 'NOT_FOUND', message: 'No matching place candidates found' } };
    }
    const scored = search.data.map((candidate) => ({ candidate, score: scorePlaceIdentity(candidate, input) })).sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    const second = scored[1];
    const confirmed = best.score >= 55 && (!second || best.score - second.score >= 15);
    const alternates = scored.slice(1, 4).map(({ candidate, score }) => ({ placeId: candidate.placeId, displayName: candidate.displayName, formattedAddress: candidate.formattedAddress, score }));
      const selected = { ...best.candidate };
    if (confirmed) {
      const details = await this.getPlace(selected.placeId, input.fieldProfile ?? 'IDENTITY_MINIMAL');
      if (details.status === 'COMPLETE' && details.data) return { ...details, data: { ...details.data, identityStatus: 'CONFIRMED', identityConfidence: best.score, candidateCount: scored.length, alternateCandidates: alternates } };
      if (details.status === 'FAILED') return details;
    }
    if (!confirmed) {
      const minimalPlace = normalizePlace({
        id: selected.placeId, displayName: selected.displayName ? { text: selected.displayName } : undefined,
        formattedAddress: selected.formattedAddress ?? undefined, location: { latitude: selected.latitude ?? undefined, longitude: selected.longitude ?? undefined },
        primaryTypeDisplayName: selected.primaryType ? { text: selected.primaryType } : undefined,
        googleMapsUri: selected.mapsUri ?? undefined,
      }, 'AMBIGUOUS', best.score, scored.length, alternates, selected.collectedAt, 'IDENTITY_MINIMAL');
      return { status: 'PARTIAL', data: minimalPlace, provenance: search.provenance };
    }
    const normalized = normalizePlace({
      id: selected.placeId, displayName: selected.displayName ? { text: selected.displayName } : undefined,
      formattedAddress: selected.formattedAddress ?? undefined, websiteUri: selected.website ?? undefined,
      nationalPhoneNumber: selected.phone ?? undefined, location: { latitude: selected.latitude ?? undefined, longitude: selected.longitude ?? undefined },
      primaryTypeDisplayName: selected.primaryType ? { text: selected.primaryType } : undefined,
      rating: selected.rating ?? undefined, userRatingCount: selected.reviewCount ?? undefined, googleMapsUri: selected.mapsUri ?? undefined,
    }, confirmed ? 'CONFIRMED' : 'AMBIGUOUS', best.score, scored.length, alternates, selected.collectedAt, profile(input.fieldProfile));
    return { status: 'COMPLETE', data: normalized, provenance: search.provenance };
  }

  async geocode(input: GeocodeInput): Promise<MapsResult<{ latitude: number; longitude: number; formattedAddress: string; placeId: string | null }>> {
    if (!this.options.enableGeocoding) return this.unavailable('geocode', 'GEOCODING', input, 'GEOCODING');
    const url = new URL(GEOCODE_BASE);
    url.searchParams.set('address', input.address);
    if (input.languageCode) url.searchParams.set('language', input.languageCode);
    if (input.regionCode) url.searchParams.set('region', input.regionCode);
    url.searchParams.set('key', this.key ?? '');
    return this.geocodeResult(url, 'geocode', input);
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<MapsResult<{ latitude: number; longitude: number; formattedAddress: string; placeId: string | null }>> {
    const input = { latitude, longitude };
    if (!this.options.enableGeocoding) return this.unavailable('reverseGeocode', 'GEOCODING', input, 'GEOCODING');
    const url = new URL(GEOCODE_BASE);
    url.searchParams.set('latlng', `${latitude},${longitude}`);
    url.searchParams.set('key', this.key ?? '');
    return this.geocodeResult(url, 'reverseGeocode', input);
  }

  private async geocodeResult(url: URL, operation: 'geocode' | 'reverseGeocode', input: unknown): Promise<MapsResult<{ latitude: number; longitude: number; formattedAddress: string; placeId: string | null }>> {
    const raw = await this.requestJson<RawGeocodeResponse>(url.toString(), {}, operation, input, 'GEOCODING', 'GEOCODING');
    if (raw.status !== 'COMPLETE' || !raw.data) return raw as MapsResult<{ latitude: number; longitude: number; formattedAddress: string; placeId: string | null }>;
    const item = raw.data.results?.[0];
    const lat = item?.geometry?.location?.lat;
    const lng = item?.geometry?.location?.lng;
    if (raw.data.status !== 'OK' || typeof lat !== 'number' || typeof lng !== 'number' || !item?.formatted_address) {
      return { ...raw, status: raw.data.status === 'ZERO_RESULTS' ? 'COMPLETE' : 'FAILED', data: null, error: { code: raw.data.status === 'ZERO_RESULTS' ? 'NOT_FOUND' : 'PROVIDER_ERROR', message: `Geocoding returned ${raw.data.status ?? 'no result'}` } };
    }
    return { ...raw, data: { latitude: lat, longitude: lng, formattedAddress: item.formatted_address, placeId: item.place_id ?? null } };
  }

  async routeMatrix(input: RouteMatrixInput): Promise<MapsResult<Array<{ originIndex: number; destinationIndex: number; distanceMeters: number | null; durationSeconds: number | null; status: string }>>> {
    if (!this.options.enableRoutes) return this.unavailable('routeMatrix', 'ROUTES', input, 'ROUTES');
    if (input.origins.length < 1 || input.destinations.length < 1 || input.origins.length * input.destinations.length > 100) {
      return { status: 'FAILED', data: null, provenance: this.provenance('routeMatrix', 'ROUTES', input, 'BYPASS', 'ROUTES'), error: { code: 'PROVIDER_ERROR', message: 'Route matrix must have 1-100 origin/destination pairs' } };
    }
    const result = await this.requestJson<Array<{ originIndex: number; destinationIndex: number; distanceMeters?: number; duration?: string; condition?: string }>>(ROUTES_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key ?? '', 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' },
      body: JSON.stringify({ origins: input.origins.map((p) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } })), destinations: input.destinations.map((p) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } })), travelMode: input.travelMode ?? 'DRIVE' }),
    }, 'routeMatrix', input, 'ROUTES', 'ROUTES');
    if (result.status !== 'COMPLETE' || !result.data) return result as MapsResult<Array<{ originIndex: number; destinationIndex: number; distanceMeters: number | null; durationSeconds: number | null; status: string }>>;
    const data = result.data.map((row) => ({ originIndex: row.originIndex, destinationIndex: row.destinationIndex, distanceMeters: row.distanceMeters ?? null, durationSeconds: row.duration ? Number.parseFloat(row.duration.replace(/s$/, '')) : null, status: row.condition ?? 'UNKNOWN' }));
    return { ...result, data };
  }
}

export const mapsIntelligence = new GoogleMapsProvider();

export function normalizeGooglePlaceToLegacy(raw: (RawPlace & { editorialSummary?: { text?: string }; reviews?: RawPlace['reviews']; photos?: RawPlace['photos']; regularOpeningHours?: unknown; paymentOptions?: unknown; accessibilityOptions?: unknown; amenities?: unknown }) | NormalizedPlace): Record<string, unknown> {
  if ('provider' in raw) {
    return {
      placeId: raw.placeId, name: raw.displayName, address: raw.formattedAddress,
      rating: raw.rating, reviewCount: raw.reviewCount, website: raw.website,
      phone: raw.phone, nationalPhoneNumber: raw.phone, internationalPhoneNumber: raw.phone,
      primaryType: raw.primaryType, types: raw.types, identityConfidence: raw.identityStatus === 'CONFIRMED' ? 'high' : 'ambiguous',
      identityStatus: raw.identityStatus, matchConfidenceScore: raw.identityConfidence,
      candidatesConsidered: raw.candidateCount, alternateCandidateNames: raw.alternateCandidates.map((candidate) => candidate.displayName).filter(Boolean),
      photos: raw.photos.map((photo) => ({ name: photo.name, widthPx: photo.widthPx, heightPx: photo.heightPx })),
      photoCount: raw.photos.length,
      reviews: raw.reviews.map((review) => ({ rating: review.rating, publishTime: review.publishTime, text: review.text, authorName: review.authorName })),
      editorialSummary: raw.editorialSummary ? { text: raw.editorialSummary } : undefined,
      description: raw.editorialSummary,
      openingHours: raw.openingHours,
      regularOpeningHours: raw.openingHours,
      paymentOptions: raw.paymentOptions,
      accessibilityOptions: raw.accessibilityOptions,
      amenities: raw.amenities,
      mapsProvenance: { fieldProfile: raw.fieldProfile, collectedAt: raw.collectedAt },
    };
  }
  return {
    placeId: raw.id?.replace(/^places\//, ''),
    name: raw.displayName?.text,
    address: raw.formattedAddress,
    rating: raw.rating,
    reviewCount: raw.userRatingCount,
    website: raw.websiteUri,
    reviews: raw.reviews?.map((review) => ({
      rating: review.rating,
      publishTime: review.publishTime,
      text: review.text?.text,
      authorName: review.authorAttribution?.displayName,
    })) ?? [],
    photos: raw.photos ?? [],
    photoCount: raw.photos?.length ?? 0,
    openingHours: raw.regularOpeningHours,
    regularOpeningHours: raw.regularOpeningHours,
    types: raw.types ?? [],
    primaryType: raw.primaryTypeDisplayName?.text ?? raw.primaryType,
    nationalPhoneNumber: raw.nationalPhoneNumber,
    internationalPhoneNumber: raw.internationalPhoneNumber,
    phone: raw.nationalPhoneNumber ?? raw.internationalPhoneNumber,
    description: raw.editorialSummary?.text,
    editorialSummary: raw.editorialSummary,
    paymentOptions: raw.paymentOptions,
    accessibilityOptions: raw.accessibilityOptions,
    amenities: raw.amenities,
  };
}
