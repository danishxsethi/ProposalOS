# Google Maps Platform Data Policy

**Applies to:** Places API (New), optional Geocoding API and optional Routes API use in Proposal Engine OS.  
**Provider credential:** server-side `GOOGLE_PLACES_API_KEY`; it is never returned to callers or MCP clients.  
**Policy basis reviewed:** Google Places API policies/attribution and usage/billing documentation, reviewed 2026-09-25.

## Canonical provider and use

All ProposalOS Places requests must go through `lib/maps/GoogleMapsProvider`. Production modules do not depend on MCP. The optional `tools/maps-mcp` stdio server is a read-only adapter to that provider and has no arbitrary URL, endpoint, key, or write tool.

## Persisted data

* Google Place IDs may be retained as stable provider identifiers; Google documents Place IDs as exempt from Places content caching restrictions.
* Places response content (names, address, rating/review totals, coordinates, website, phone, reviews, photos and other provider fields) is not written to the persistent module cache or evidence database by the Places provider.
* Audit evidence stores only a minimal identity observation: Place ID, identity status/confidence, candidate count, selected field profile, and collection time. It does not store raw Places responses, reviews, photos, phone/address payloads or arbitrary provider fields.
* Normalized Places content is transient in-memory input for the current call. The provider marks response provenance `NOT_CACHEABLE`; no durable content cache or customer-facing search-result UI is enabled.
* Independent customer inputs, such as a submitted business URL, and ProposalOS-derived findings are governed by their own product retention/deletion policy; they are not treated as a copy of Places response content.

## Refresh, deletion, and attribution

Place IDs are stable identifiers and are retained with tenant business records subject to tenant deletion and audit retention. Maps-derived transient content is reacquired for each provider request. If Maps content is presented to end users in a later product surface, Google Maps attribution, required author attribution for reviews/photos, source links, ordering/filters disclosure, and any required notices must be implemented at that surface before activation. Current audit and discovery uses do not render raw Maps content as a standalone customer UI.

## Field masks and billing

The provider owns allowlisted field profiles (`IDENTITY_MINIMAL`, `GBP_STANDARD`, `GBP_DEEP`, `COMPETITOR`, `MULTI_LOCATION`). Call sites cannot submit field masks. Per-audit CostTracker checks configured call costs before each billable Places call. Nearby search radius/results and route matrices are bounded. Geocoding and Routes are capability-disabled unless explicitly enabled on the provider instance.

## Credentials and network boundary

Only the server-side provider reads the API key. MCP stdio clients never receive it. No HTTP MCP service is enabled. The provider constructs requests only to fixed Google Maps API hosts; caller input cannot supply an endpoint or URL. Google Cloud API restrictions, service restrictions, quota alerts and separate environment keys remain required deployment controls.

## Deletion and policy review

Tenant deletion removes tenant-owned proposal, audit and associated identity observations under existing cascade/deletion controls. A policy review is required before adding persistent caching, exporting Maps response content, displaying reviews/photos/provider-generated summaries, enabling HTTP MCP, or adding a new Maps API operation.

References:

* https://developers.google.com/maps/documentation/places/web-service/policies
* https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
* https://developers.google.com/maps/api-security-best-practices
