export type MapsResultStatus = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED';
export type PlaceIdentityStatus = 'CONFIRMED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'UNAVAILABLE';
export type MapsOperation =
  | 'searchText'
  | 'searchNearby'
  | 'getPlace'
  | 'geocode'
  | 'reverseGeocode'
  | 'routeMatrix'
  | 'validateAddress';

export interface MapsProvenance {
  provider: 'google_maps_platform';
  operation: MapsOperation;
  fieldProfile: string;
  collectedAt: string;
  requestFingerprint: string;
  cache: 'HIT' | 'MISS' | 'BYPASS' | 'NOT_CACHEABLE';
  costClass: 'NO_BILLABLE_CALL' | 'PLACES_TEXT_SEARCH' | 'PLACES_DETAILS' | 'GEOCODING' | 'ROUTES';
}

export interface MapsResult<T> {
  status: MapsResultStatus;
  data: T | null;
  provenance: MapsProvenance;
  error?: { code: 'NOT_CONFIGURED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'COST_CAP_EXCEEDED'; message: string };
}

export interface PlacesCandidate {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  website: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
  collectedAt: string;
  identityStatus: PlaceIdentityStatus;
  identityConfidence: number | null;
  providerAttributions: string[];
}

export interface NormalizedPlace {
  provider: 'google_maps_platform';
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  primaryType: string | null;
  types: string[];
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
  editorialSummary: string | null;
  openingHours: unknown | null;
  paymentOptions: unknown | null;
  accessibilityOptions: unknown | null;
  amenities: unknown | null;
  reviews: Array<{ rating: number | null; publishTime: string | null; text: string | null; authorName: string | null }>;
  photos: Array<{ name: string; widthPx: number | null; heightPx: number | null }>;
  providerAttributions: string[];
  identityStatus: PlaceIdentityStatus;
  identityConfidence: number | null;
  candidateCount: number;
  alternateCandidates: Array<{ placeId: string; displayName: string | null; formattedAddress: string | null; score: number }>;
  collectedAt: string;
  fieldProfile: string;
}

export interface PlaceSearchInput {
  query: string;
  city?: string;
  region?: string;
  countryCode?: string;
  maxResults?: number;
  fieldProfile?: 'IDENTITY_MINIMAL' | 'GBP_STANDARD' | 'GBP_DEEP' | 'COMPETITOR' | 'MULTI_LOCATION';
}

export interface NearbySearchInput {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  includedTypes?: string[];
  maxResults?: number;
  fieldProfile?: 'IDENTITY_MINIMAL' | 'GBP_STANDARD' | 'GBP_DEEP' | 'COMPETITOR' | 'MULTI_LOCATION';
}

export interface BusinessResolutionInput {
  businessName: string;
  city: string;
  address?: string | null;
  domain?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  fieldProfile?: 'IDENTITY_MINIMAL' | 'GBP_STANDARD' | 'GBP_DEEP' | 'COMPETITOR' | 'MULTI_LOCATION';
}

export interface GeocodeInput {
  address: string;
  languageCode?: string;
  regionCode?: string;
}

export interface RouteMatrixInput {
  origins: Array<{ latitude: number; longitude: number }>;
  destinations: Array<{ latitude: number; longitude: number }>;
  travelMode?: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
}

export interface MapsIntelligenceProvider {
  searchText(input: PlaceSearchInput): Promise<MapsResult<PlacesCandidate[]>>;
  searchNearby(input: NearbySearchInput): Promise<MapsResult<PlacesCandidate[]>>;
  getPlace(placeId: string, fieldProfile?: PlaceSearchInput['fieldProfile']): Promise<MapsResult<NormalizedPlace>>;
  resolveBusiness(input: BusinessResolutionInput): Promise<MapsResult<NormalizedPlace>>;
  geocode(input: GeocodeInput): Promise<MapsResult<{ latitude: number; longitude: number; formattedAddress: string; placeId: string | null }>>;
  reverseGeocode(latitude: number, longitude: number): Promise<MapsResult<{ latitude: number; longitude: number; formattedAddress: string; placeId: string | null }>>;
  routeMatrix(input: RouteMatrixInput): Promise<MapsResult<Array<{ originIndex: number; destinationIndex: number; distanceMeters: number | null; durationSeconds: number | null; status: string }>>>;
  validateAddress?(input: GeocodeInput): Promise<MapsResult<{ verdict: string; formattedAddress: string | null; placeId: string | null }>>;
}
