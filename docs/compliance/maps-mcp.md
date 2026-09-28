# ProposalOS Maps MCP

The first-party Maps MCP is a read-only JSON-RPC 2.0 subset implementation of the MCP protocol, provided over stdio by default. Optional HTTP mode is disabled unless `MAPS_MCP_HTTP_ENABLED=true`; if enabled, it binds to loopback by default and requires `MAPS_MCP_BEARER_TOKEN`. No browser/customer tenant identity is accepted or inferred by this standalone operator/development tool. It never accepts tenant IDs, provider endpoint URLs, or credentials as tool arguments.

Tools: `maps_resolve_business`, `maps_search_places`, `maps_search_nearby`, `maps_get_place`, `maps_geocode`, `maps_reverse_geocode`, and `maps_route_matrix`. All are read-only and call `GoogleMapsProvider`. Geocoding and Routes stay disabled unless the provider options explicitly enable them. The MCP process reads `GOOGLE_PLACES_API_KEY` server-side and returns normalized result envelopes without keys or raw HTTP request data.

No write-to-Google-Profile operation exists. HTTP mode bounds JSON input size to 32 KiB and uses fixed tools; it is not an arbitrary URL proxy. A production shared multi-tenant MCP service is not activated by this development/operator transport.
