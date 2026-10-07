/**
 * Compatibility exports for older scripts and stored imports. Runtime map
 * enrichment now uses SerpApi's Google Maps search engine and does not call
 * Google Cloud Places or Geocoding endpoints directly.
 */
export {
  SerpApiMapsProvider,
  SerpApiMapsProvider as GoogleMapsProvider,
  mapsIntelligence,
  normalizePlaceToLegacy,
  normalizePlaceToLegacy as normalizeGooglePlaceToLegacy,
  scorePlaceIdentity,
} from './serpMapsProvider';
