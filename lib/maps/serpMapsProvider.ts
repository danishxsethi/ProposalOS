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

const SERP_API = 'https://serpapi.com/search.json';
const MAX_RESULTS = 20;
const MAX_NEARBY_RADIUS_METERS = 50_000;
const FIELD_PROFILES = [
  'IDENTITY_MINIMAL',
  'GBP_STANDARD',
  'GBP_DEEP',
  'COMPETITOR',
  'MULTI_LOCATION',
] as const;

type FieldProfile = (typeof FIELD_PROFILES)[number];

type RawMapsPlace = {
  place_id?: string | number;
  data_id?: string;
  data_cid?: string | number;
  title?: string;
  name?: string;
  address?: string;
  website?: string;
  phone?: string;
  rating?: number;
  reviews?:
    | number
    | Array<{
        rating?: number;
        date?: string;
        snippet?: string;
        extracted_snippet?: string;
        user?: { name?: string };
      }>;
  gps_coordinates?: { latitude?: number; longitude?: number };
  type?: string;
  types?: string[];
  operating_hours?: unknown;
  hours?: unknown;
  description?: string;
  amenities?: unknown;
  thumbnail?: string;
  thumbnail_large?: string;
  images?: Array<
    string | { name?: string; url?: string; thumbnail?: string; width?: number; height?: number }
  >;
  photos?: Array<{
    name?: string;
    url?: string;
    thumbnail?: string;
    width?: number;
    height?: number;
  }>;
  links?: { website?: string; phone?: string; directions?: string };
  place_id_search?: string;
};

type RawMapsResponse = {
  error?: string;
  search_metadata?: { status?: string };
  local_results?: RawMapsPlace[];
  place_results?: RawMapsPlace;
};

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function getFieldProfile(value: PlaceSearchInput['fieldProfile']): FieldProfile {
  return value && FIELD_PROFILES.includes(value) ? value : 'IDENTITY_MINIMAL';
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function host(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return null;
  }
}

function phoneDigits(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length >= 7 ? digits : null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stablePlaceId(place: RawMapsPlace): string {
  const id = place.place_id ?? place.data_id ?? place.data_cid;
  return id == null ? '' : String(id);
}

function mapUri(id: string, title?: string): string | null {
  if (!id) return null;
  const query = title ? `&query=${encodeURIComponent(title)}` : '';
  return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}${query}`;
}

function photoItems(place: RawMapsPlace): NormalizedPlace['photos'] {
  const photos = Array.isArray(place.photos) ? place.photos : [];
  const images = Array.isArray(place.images) ? place.images : [];
  const raw = [...photos, ...images];
  if (raw.length === 0 && place.thumbnail) raw.push(place.thumbnail);
  if (raw.length === 0 && place.thumbnail_large) raw.push(place.thumbnail_large);
  return raw.flatMap((photo) => {
    const url = typeof photo === 'string' ? photo : (photo.url ?? photo.thumbnail ?? photo.name);
    if (!url) return [];
    return [
      {
        name: url,
        widthPx: typeof photo === 'string' ? null : (photo.width ?? null),
        heightPx: typeof photo === 'string' ? null : (photo.height ?? null),
      },
    ];
  });
}

function reviewItems(place: RawMapsPlace): NormalizedPlace['reviews'] {
  if (!Array.isArray(place.reviews)) return [];
  return place.reviews.map((review) => ({
    rating: typeof review.rating === 'number' ? review.rating : null,
    publishTime: review.date ?? null,
    text: review.snippet ?? review.extracted_snippet ?? null,
    authorName: review.user?.name ?? null,
  }));
}

function normalizePlace(
  raw: RawMapsPlace,
  identityStatus: NormalizedPlace['identityStatus'],
  score: number | null,
  candidateCount: number,
  alternates: NormalizedPlace['alternateCandidates'],
  collectedAt: string,
  fieldProfile: string
): NormalizedPlace {
  const id = stablePlaceId(raw);
  const title = raw.title ?? raw.name ?? null;
  const reviewCount = Array.isArray(raw.reviews) ? raw.reviews.length : raw.reviews;
  const website = raw.links?.website ?? raw.website ?? null;
  const phone = raw.links?.phone ?? raw.phone ?? null;
  const types = Array.isArray(raw.types) ? raw.types : raw.type ? [raw.type] : [];

  return {
    provider: 'serpapi_google_maps',
    placeId: id,
    displayName: title,
    formattedAddress: raw.address ?? null,
    latitude:
      typeof raw.gps_coordinates?.latitude === 'number' ? raw.gps_coordinates.latitude : null,
    longitude:
      typeof raw.gps_coordinates?.longitude === 'number' ? raw.gps_coordinates.longitude : null,
    website,
    phone,
    primaryType: raw.type ?? types[0] ?? null,
    types,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    reviewCount: typeof reviewCount === 'number' ? reviewCount : null,
    mapsUri: mapUri(id, title ?? undefined),
    editorialSummary: raw.description ?? null,
    openingHours: raw.operating_hours ?? raw.hours ?? null,
    paymentOptions: null,
    accessibilityOptions: null,
    amenities: raw.amenities ?? null,
    reviews: reviewItems(raw),
    photos: photoItems(raw),
    providerAttributions: ['SerpApi Google Maps results'],
    identityStatus,
    identityConfidence: score,
    candidateCount,
    alternateCandidates: alternates,
    collectedAt,
    fieldProfile,
  };
}

export function scorePlaceIdentity(
  place: Pick<
    NormalizedPlace,
    'displayName' | 'formattedAddress' | 'website' | 'phone' | 'latitude' | 'longitude'
  >,
  input: BusinessResolutionInput
): number {
  const expectedName = normalizeText(input.businessName);
  const actualName = normalizeText(place.displayName);
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
  const resultDomain = host(place.website);
  if (requestedDomain && resultDomain) score += requestedDomain === resultDomain ? 25 : -25;
  const requestedPhone = phoneDigits(input.phone);
  const resultPhone = phoneDigits(place.phone);
  if (requestedPhone && resultPhone) score += requestedPhone === resultPhone ? 25 : -25;
  if (
    input.latitude != null &&
    input.longitude != null &&
    place.latitude != null &&
    place.longitude != null
  ) {
    const distance = haversineMeters(
      input.latitude,
      input.longitude,
      place.latitude,
      place.longitude
    );
    score += distance <= 500 ? 20 : distance <= 5_000 ? 10 : distance <= 25_000 ? 2 : -15;
  }
  return Math.max(0, Math.min(100, score));
}

export class SerpApiMapsProvider implements MapsIntelligenceProvider {
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
    return this.options.apiKey ?? process.env.SERP_API_KEY ?? null;
  }

  private get fetcher(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private provenance(
    operation: MapsOperation,
    fieldProfile: string,
    input: unknown,
    cache: MapsProvenance['cache']
  ): MapsProvenance {
    return {
      provider: 'serpapi_google_maps',
      operation,
      fieldProfile,
      collectedAt: new Date().toISOString(),
      requestFingerprint: fingerprint(input),
      cache,
      costClass: this.key ? 'SERP_API' : 'NO_BILLABLE_CALL',
    };
  }

  private unavailable<T>(
    operation: MapsOperation,
    fieldProfile: string,
    input: unknown,
    message: string
  ): MapsResult<T> {
    return {
      status: 'UNAVAILABLE',
      data: null,
      provenance: this.provenance(operation, fieldProfile, input, 'BYPASS'),
      error: { code: this.key ? 'PROVIDER_ERROR' : 'NOT_CONFIGURED', message },
    };
  }

  private async request(
    operation: MapsOperation,
    profile: string,
    input: unknown,
    params: Record<string, string>
  ): Promise<MapsResult<RawMapsResponse>> {
    if (!this.key) return this.unavailable(operation, profile, input, 'SerpApi is not configured');
    if (this.options.tracker && !this.options.tracker.hasBudgetForApiCall('SERP_API')) {
      return {
        status: 'UNAVAILABLE',
        data: null,
        provenance: this.provenance(operation, profile, input, 'BYPASS'),
        error: {
          code: 'COST_CAP_EXCEEDED',
          message: 'Maps search would exceed the audit provider budget',
        },
      };
    }

    const query = new URLSearchParams({ ...params, api_key: this.key });
    try {
      const data = await withProviderResilience<RawMapsResponse>(
        {
          provider: 'serpapi',
          operation: `maps:${operation}`,
          degrade: false,
          policy: { timeoutMs: 20_000, maxAttempts: 1 },
        },
        async ({ signal }) => {
          this.options.tracker?.addApiCall('SERP_API');
          const response = await this.fetcher(`${SERP_API}?${query.toString()}`, { signal });
          if (!response.ok) {
            const error = new Error(`SerpApi Maps request failed (${response.status})`);
            (error as Error & { status?: number }).status = response.status;
            throw error;
          }
          const result = (await response.json()) as RawMapsResponse;
          if (result.error || result.search_metadata?.status === 'Error') {
            throw new Error(`SerpApi Maps request failed: ${result.error ?? 'provider error'}`);
          }
          return result;
        }
      );
      return {
        status: 'COMPLETE',
        data,
        provenance: this.provenance(operation, profile, input, 'MISS'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SerpApi Maps request failed';
      const rateLimited = message.includes('429') || /rate limit|exceeded/i.test(message);
      return {
        status: 'FAILED',
        data: null,
        provenance: this.provenance(operation, profile, input, 'BYPASS'),
        error: { code: rateLimited ? 'RATE_LIMITED' : 'PROVIDER_ERROR', message },
      };
    }
  }

  private async searchPlaces(
    operation: 'searchText' | 'searchNearby',
    profile: FieldProfile,
    input: unknown,
    params: Record<string, string>,
    maxResults: number
  ): Promise<MapsResult<PlacesCandidate[]>> {
    const response = await this.request(operation, profile, input, params);
    if (response.status !== 'COMPLETE' || !response.data)
      return response as MapsResult<PlacesCandidate[]>;
    const collectedAt = response.provenance.collectedAt;
    const candidates = (response.data.local_results ?? [])
      .slice(0, maxResults)
      .filter((place) => stablePlaceId(place))
      .map((place) => {
        const normalized = normalizePlace(place, 'UNAVAILABLE', null, 0, [], collectedAt, profile);
        return {
          placeId: normalized.placeId,
          displayName: normalized.displayName,
          formattedAddress: normalized.formattedAddress,
          website: normalized.website,
          phone: normalized.phone,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          primaryType: normalized.primaryType,
          rating: normalized.rating,
          reviewCount: normalized.reviewCount,
          mapsUri: normalized.mapsUri,
          collectedAt,
          identityStatus: 'UNAVAILABLE' as const,
          identityConfidence: null,
          providerAttributions: normalized.providerAttributions,
        } satisfies PlacesCandidate;
      });
    return { ...response, data: candidates };
  }

  async searchText(input: PlaceSearchInput): Promise<MapsResult<PlacesCandidate[]>> {
    const fieldProfile = getFieldProfile(input.fieldProfile);
    const query = [input.query, input.city, input.region].filter(Boolean).join(' ').trim();
    const maxResults = Math.max(1, Math.min(MAX_RESULTS, input.maxResults ?? 5));
    const params: Record<string, string> = {
      engine: 'google_maps',
      type: 'search',
      q: query,
      hl: 'en',
    };
    const location = [input.city, input.region].filter(Boolean).join(', ');
    if (location) params.location = location;
    if (input.countryCode) params.gl = input.countryCode.toLowerCase();
    return this.searchPlaces(
      'searchText',
      fieldProfile,
      { ...input, query, maxResults },
      params,
      maxResults
    );
  }

  async searchNearby(input: NearbySearchInput): Promise<MapsResult<PlacesCandidate[]>> {
    const fieldProfile = getFieldProfile(input.fieldProfile);
    const radiusMeters = Math.max(1, Math.min(MAX_NEARBY_RADIUS_METERS, input.radiusMeters));
    const maxResults = Math.max(1, Math.min(MAX_RESULTS, input.maxResults ?? 10));
    const query = input.includedTypes?.slice(0, 10).join(' ') || 'business';
    const params = {
      engine: 'google_maps',
      type: 'search',
      q: query,
      ll: `@${input.latitude},${input.longitude}`,
      m: String(radiusMeters),
      hl: 'en',
    };
    return this.searchPlaces(
      'searchNearby',
      fieldProfile,
      { ...input, radiusMeters, maxResults },
      params,
      maxResults
    );
  }

  async getPlace(
    placeId: string,
    fieldProfileInput?: PlaceSearchInput['fieldProfile']
  ): Promise<MapsResult<NormalizedPlace>> {
    const fieldProfile = getFieldProfile(fieldProfileInput);
    const id = placeId.trim();
    const input = { placeId: id, fieldProfile };
    if (!id || id.length > 256 || /[^A-Za-z0-9_.:-]/.test(id)) {
      return {
        status: 'FAILED',
        data: null,
        provenance: this.provenance('getPlace', fieldProfile, input, 'BYPASS'),
        error: { code: 'PROVIDER_ERROR', message: 'Invalid Google Maps place ID' },
      };
    }
    const response = await this.request('getPlace', fieldProfile, input, {
      engine: 'google_maps',
      type: 'place',
      place_id: id,
      hl: 'en',
    });
    if (response.status !== 'COMPLETE' || !response.data)
      return response as MapsResult<NormalizedPlace>;
    const rawPlace = response.data.place_results ?? response.data.local_results?.[0];
    if (!rawPlace) {
      return {
        ...response,
        data: null,
        error: { code: 'NOT_FOUND', message: 'No matching Google Maps place was returned' },
      };
    }
    return {
      ...response,
      data: normalizePlace(
        rawPlace,
        'CONFIRMED',
        100,
        1,
        [],
        response.provenance.collectedAt,
        fieldProfile
      ),
    };
  }

  async resolveBusiness(input: BusinessResolutionInput): Promise<MapsResult<NormalizedPlace>> {
    const fieldProfile = getFieldProfile(input.fieldProfile);
    if (input.placeId) {
      const direct = await this.getPlace(input.placeId, fieldProfile);
      if (direct.status === 'COMPLETE' && direct.data) {
        const score = scorePlaceIdentity(direct.data, input);
        const confirmed = score >= 45;
        return {
          ...direct,
          status: confirmed ? 'COMPLETE' : 'PARTIAL',
          data: {
            ...direct.data,
            identityStatus: confirmed ? 'CONFIRMED' : 'AMBIGUOUS',
            identityConfidence: score,
          },
        };
      }
      if (direct.status === 'FAILED') return direct;
    }

    const search = await this.searchText({
      query: input.businessName,
      city: input.city,
      maxResults: 5,
      fieldProfile: 'IDENTITY_MINIMAL',
    });
    if (search.status !== 'COMPLETE' || !search.data)
      return search as unknown as MapsResult<NormalizedPlace>;
    if (search.data.length === 0) {
      return {
        status: 'COMPLETE',
        data: null,
        provenance: search.provenance,
        error: { code: 'NOT_FOUND', message: 'No matching place candidates found' },
      };
    }

    const scored = search.data
      .map((candidate) => ({
        candidate,
        score: scorePlaceIdentity(
          {
            ...candidate,
            displayName: candidate.displayName,
            formattedAddress: candidate.formattedAddress,
          },
          input
        ),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    const second = scored[1];
    const confirmed = best.score >= 55 && (!second || best.score - second.score >= 15);
    const alternates = scored
      .slice(1, 4)
      .map(({ candidate, score }) => ({
        placeId: candidate.placeId,
        displayName: candidate.displayName,
        formattedAddress: candidate.formattedAddress,
        score,
      }));

    if (confirmed) {
      const details = await this.getPlace(best.candidate.placeId, fieldProfile);
      if (details.status === 'COMPLETE' && details.data) {
        return {
          ...details,
          data: {
            ...details.data,
            identityStatus: 'CONFIRMED',
            identityConfidence: best.score,
            candidateCount: scored.length,
            alternateCandidates: alternates,
          },
        };
      }
      if (details.status === 'FAILED') return details;
    }

    const partial = normalizePlace(
      {
        place_id: best.candidate.placeId,
        title: best.candidate.displayName ?? undefined,
        address: best.candidate.formattedAddress ?? undefined,
        website: best.candidate.website ?? undefined,
        phone: best.candidate.phone ?? undefined,
        rating: best.candidate.rating ?? undefined,
        reviews: best.candidate.reviewCount ?? undefined,
        gps_coordinates: {
          latitude: best.candidate.latitude ?? undefined,
          longitude: best.candidate.longitude ?? undefined,
        },
        type: best.candidate.primaryType ?? undefined,
      },
      'AMBIGUOUS',
      best.score,
      scored.length,
      alternates,
      search.provenance.collectedAt,
      'IDENTITY_MINIMAL'
    );
    return { status: 'PARTIAL', data: partial, provenance: search.provenance };
  }

  async geocode(
    input: GeocodeInput
  ): Promise<
    MapsResult<{
      latitude: number;
      longitude: number;
      formattedAddress: string;
      placeId: string | null;
    }>
  > {
    if (!this.options.enableGeocoding)
      return this.unavailable('geocode', 'GEOCODING', input, 'Geocoding is disabled');
    const results = await this.searchText({
      query: input.address,
      fieldProfile: 'IDENTITY_MINIMAL',
      maxResults: 1,
    });
    const candidate = results.data?.[0];
    if (
      results.status !== 'COMPLETE' ||
      !candidate ||
      candidate.latitude == null ||
      candidate.longitude == null ||
      !candidate.formattedAddress
    ) {
      return { ...results, data: null } as MapsResult<{
        latitude: number;
        longitude: number;
        formattedAddress: string;
        placeId: string | null;
      }>;
    }
    return {
      ...results,
      data: {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        formattedAddress: candidate.formattedAddress,
        placeId: candidate.placeId,
      },
    } as MapsResult<{
      latitude: number;
      longitude: number;
      formattedAddress: string;
      placeId: string | null;
    }>;
  }

  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<
    MapsResult<{
      latitude: number;
      longitude: number;
      formattedAddress: string;
      placeId: string | null;
    }>
  > {
    const input = { latitude, longitude };
    if (!this.options.enableGeocoding)
      return this.unavailable('reverseGeocode', 'GEOCODING', input, 'Geocoding is disabled');
    const results = await this.searchNearby({
      latitude,
      longitude,
      radiusMeters: 100,
      maxResults: 1,
      fieldProfile: 'IDENTITY_MINIMAL',
    });
    const candidate = results.data?.[0];
    if (results.status !== 'COMPLETE' || !candidate || !candidate.formattedAddress) {
      return { ...results, data: null } as MapsResult<{
        latitude: number;
        longitude: number;
        formattedAddress: string;
        placeId: string | null;
      }>;
    }
    return {
      ...results,
      data: {
        latitude,
        longitude,
        formattedAddress: candidate.formattedAddress,
        placeId: candidate.placeId,
      },
    } as MapsResult<{
      latitude: number;
      longitude: number;
      formattedAddress: string;
      placeId: string | null;
    }>;
  }

  async routeMatrix(
    input: RouteMatrixInput
  ): Promise<
    MapsResult<
      Array<{
        originIndex: number;
        destinationIndex: number;
        distanceMeters: number | null;
        durationSeconds: number | null;
        status: string;
      }>
    >
  > {
    return this.unavailable(
      'routeMatrix',
      'ROUTES',
      input,
      'Route matrix is not part of the Maps provider used by ProposalOS'
    );
  }
}

export const mapsIntelligence = new SerpApiMapsProvider();

export function normalizePlaceToLegacy(place: NormalizedPlace): Record<string, unknown> {
  return {
    placeId: place.placeId,
    name: place.displayName,
    address: place.formattedAddress,
    rating: place.rating,
    reviewCount: place.reviewCount,
    website: place.website,
    phone: place.phone,
    nationalPhoneNumber: place.phone,
    internationalPhoneNumber: place.phone,
    primaryType: place.primaryType,
    types: place.types,
    identityConfidence: place.identityStatus === 'CONFIRMED' ? 'high' : 'ambiguous',
    identityStatus: place.identityStatus,
    matchConfidenceScore: place.identityConfidence,
    candidatesConsidered: place.candidateCount,
    alternateCandidateNames: place.alternateCandidates
      .map((candidate) => candidate.displayName)
      .filter(Boolean),
    photos: place.photos.map((photo) => ({
      name: photo.name,
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
    })),
    photoCount: place.photos.length,
    reviews: place.reviews.map((review) => ({
      rating: review.rating,
      publishTime: review.publishTime,
      text: review.text,
      authorName: review.authorName,
    })),
    editorialSummary: place.editorialSummary ? { text: place.editorialSummary } : undefined,
    description: place.editorialSummary,
    openingHours: place.openingHours,
    regularOpeningHours: place.openingHours,
    paymentOptions: place.paymentOptions,
    accessibilityOptions: place.accessibilityOptions,
    amenities: place.amenities,
    mapsProvenance: {
      provider: place.provider,
      fieldProfile: place.fieldProfile,
      collectedAt: place.collectedAt,
    },
    mapsUri: place.mapsUri,
  };
}

export const normalizeGooglePlaceToLegacy = normalizePlaceToLegacy;
