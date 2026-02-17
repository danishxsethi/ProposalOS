import { createHash } from 'crypto';
import { cachedFetch } from '@/lib/cache/apiCache';
import { logger } from '@/lib/logger';
import { normalizeVertical, VERTICAL_SEARCH_QUERIES } from './config';

export type DiscoverySource = 'google_places' | 'yelp' | 'industry_directory';

export interface DiscoverySourceConfig {
    googlePlaces: boolean;
    yelp: boolean;
    directories: boolean;
}

export interface DiscoveryInput {
    city: string;
    state?: string | null;
    metro?: string | null;
    vertical: string;
    targetLeadCount?: number;
    sourceConfig?: Partial<DiscoverySourceConfig>;
}

export interface DiscoveredBusiness {
    source: DiscoverySource;
    sourceExternalId: string;
    sourceUrl?: string;
    businessName: string;
    city: string;
    state?: string | null;
    vertical: string;
    category?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    raw?: unknown;
}

interface SourceDiscoveryResult {
    businesses: DiscoveredBusiness[];
    queryCount: number;
}

export interface DiscoveryResult {
    businesses: DiscoveredBusiness[];
    stats: {
        sourceCounts: Record<DiscoverySource, number>;
        queryCounts: Record<DiscoverySource, number>;
        deduped: number;
        estimatedCostCents: number;
    };
}

const DEFAULT_SOURCE_CONFIG: DiscoverySourceConfig = {
    googlePlaces: true,
    yelp: true,
    directories: true,
};

const CHAIN_BLOCKLIST = [
    'mcdonald',
    'starbucks',
    'subway',
    'walmart',
    'target',
    'burger king',
    'dominos',
    'pizza hut',
    'kfc',
    'taco bell',
    'home depot',
    'lowes',
    'costco',
];

function buildLocation(city: string, state?: string | null): string {
    const parts = [city.trim(), state?.trim()].filter(Boolean);
    return parts.join(', ');
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeWebsite(url: string | undefined | null): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
        const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://${trimmed}`;
        return new URL(normalized).toString();
    } catch {
        return null;
    }
}

function createFallbackId(source: DiscoverySource, parts: Array<string | null | undefined>): string {
    const text = `${source}:${parts.filter(Boolean).join('|').toLowerCase()}`;
    return createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function isLikelyChain(name: string): boolean {
    const lower = name.toLowerCase();
    return CHAIN_BLOCKLIST.some((token) => lower.includes(token));
}

function getQueriesForVertical(vertical: string): string[] {
    const normalized = normalizeVertical(vertical);
    const fromConfig = VERTICAL_SEARCH_QUERIES[normalized];
    if (fromConfig && fromConfig.length > 0) return fromConfig;
    return [normalized];
}

function dedupeBusinesses(candidates: DiscoveredBusiness[]): DiscoveredBusiness[] {
    const map = new Map<string, DiscoveredBusiness>();

    for (const candidate of candidates) {
        const website = normalizeWebsite(candidate.website);
        const websiteKey = website ? new URL(website).hostname.replace(/^www\./, '') : '';
        const key = websiteKey
            ? `site:${websiteKey}`
            : `${candidate.source}:${candidate.sourceExternalId}`;

        const existing = map.get(key);
        if (!existing) {
            map.set(key, { ...candidate, website });
            continue;
        }

        map.set(key, {
            ...existing,
            website: existing.website || website,
            phone: existing.phone || candidate.phone,
            address: existing.address || candidate.address,
            category: existing.category || candidate.category,
            rating: existing.rating ?? candidate.rating ?? null,
            reviewCount: existing.reviewCount ?? candidate.reviewCount ?? null,
            sourceUrl: existing.sourceUrl || candidate.sourceUrl,
        });
    }

    return [...map.values()];
}

async function discoverFromGooglePlaces(input: DiscoveryInput): Promise<SourceDiscoveryResult> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return { businesses: [], queryCount: 0 };
    }

    const vertical = normalizeVertical(input.vertical);
    const queries = getQueriesForVertical(vertical);
    const location = buildLocation(input.city, input.state);
    const maxPerQuery = Math.max(10, Math.ceil((input.targetLeadCount ?? 100) / Math.max(queries.length, 1)));

    const businesses: DiscoveredBusiness[] = [];
    let queryCount = 0;

    for (const phrase of queries) {
        const textQuery = `${phrase} in ${location}`;
        queryCount += 1;

        const response = await cachedFetch(
            'outreach_places_search',
            { textQuery, maxPerQuery },
            async () => {
                const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask': [
                            'places.id',
                            'places.displayName',
                            'places.formattedAddress',
                            'places.websiteUri',
                            'places.nationalPhoneNumber',
                            'places.internationalPhoneNumber',
                            'places.rating',
                            'places.userRatingCount',
                            'places.primaryTypeDisplayName',
                            'places.googleMapsUri',
                        ].join(','),
                    },
                    body: JSON.stringify({
                        textQuery,
                        maxResultCount: Math.min(20, maxPerQuery),
                    }),
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Places search failed (${res.status}): ${errorText}`);
                }

                return res.json() as Promise<{ places?: Array<Record<string, unknown>> }>;
            },
            { ttlHours: 24 },
        );

        for (const place of response.places ?? []) {
            const businessName = (place.displayName as { text?: string } | undefined)?.text?.trim();
            if (!businessName || isLikelyChain(businessName)) continue;

            const placeId = typeof place.id === 'string' && place.id
                ? place.id.replace(/^places\//, '')
                : createFallbackId('google_places', [
                    businessName,
                    String(place.formattedAddress ?? ''),
                    input.city,
                    input.state,
                ]);

            businesses.push({
                source: 'google_places',
                sourceExternalId: placeId,
                sourceUrl: typeof place.googleMapsUri === 'string' ? place.googleMapsUri : undefined,
                businessName,
                city: input.city,
                state: input.state,
                vertical,
                category: (place.primaryTypeDisplayName as { text?: string } | undefined)?.text ?? null,
                address: typeof place.formattedAddress === 'string' ? place.formattedAddress : null,
                phone:
                    (typeof place.nationalPhoneNumber === 'string' && place.nationalPhoneNumber) ||
                    (typeof place.internationalPhoneNumber === 'string' && place.internationalPhoneNumber) ||
                    null,
                website: normalizeWebsite(typeof place.websiteUri === 'string' ? place.websiteUri : null),
                rating: toNumber(place.rating),
                reviewCount: toNumber(place.userRatingCount),
                raw: place,
            });
        }
    }

    return { businesses, queryCount };
}

async function discoverFromYelp(input: DiscoveryInput): Promise<SourceDiscoveryResult> {
    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) {
        return { businesses: [], queryCount: 0 };
    }

    const vertical = normalizeVertical(input.vertical);
    const location = buildLocation(input.city, input.state);
    const phrase = getQueriesForVertical(vertical)[0] || vertical;

    const endpointParams = new URLSearchParams({
        engine: 'yelp',
        find_desc: phrase,
        find_loc: location,
        api_key: serpApiKey,
    });

    const response = await cachedFetch(
        'outreach_serpapi_yelp',
        { phrase, location },
        async () => {
            const res = await fetch(`https://serpapi.com/search.json?${endpointParams.toString()}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`SerpAPI Yelp failed (${res.status}): ${text}`);
            }
            return res.json() as Promise<{ organic_results?: Array<Record<string, unknown>> }>;
        },
        { ttlHours: 24 },
    );

    const businesses: DiscoveredBusiness[] = [];
    for (const row of response.organic_results ?? []) {
        const businessName = typeof row.title === 'string' ? row.title.trim() : '';
        if (!businessName || isLikelyChain(businessName)) continue;

        const sourceUrl = typeof row.link === 'string' ? row.link : undefined;
        const sourceExternalId = sourceUrl
            ? sourceUrl.split('/').pop() || createFallbackId('yelp', [businessName, location])
            : createFallbackId('yelp', [businessName, location]);

        businesses.push({
            source: 'yelp',
            sourceExternalId,
            sourceUrl,
            businessName,
            city: input.city,
            state: input.state,
            vertical,
            category: typeof row.category === 'string' ? row.category : null,
            address: typeof row.address === 'string' ? row.address : null,
            phone: typeof row.phone === 'string' ? row.phone : null,
            website: null,
            rating: toNumber(row.rating),
            reviewCount: toNumber(row.reviews),
            raw: row,
        });
    }

    return { businesses, queryCount: 1 };
}

async function discoverFromDirectoryFallback(input: DiscoveryInput): Promise<SourceDiscoveryResult> {
    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) {
        return { businesses: [], queryCount: 0 };
    }

    const vertical = normalizeVertical(input.vertical);
    const location = buildLocation(input.city, input.state);
    const phrase = `${getQueriesForVertical(vertical)[0] || vertical} in ${location}`;

    const endpointParams = new URLSearchParams({
        engine: 'google_local',
        q: phrase,
        location,
        gl: 'us',
        hl: 'en',
        api_key: serpApiKey,
    });

    const response = await cachedFetch(
        'outreach_serpapi_local',
        { phrase, location },
        async () => {
            const res = await fetch(`https://serpapi.com/search.json?${endpointParams.toString()}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`SerpAPI local failed (${res.status}): ${text}`);
            }
            return res.json() as Promise<{ local_results?: Array<Record<string, unknown>> }>;
        },
        { ttlHours: 24 },
    );

    const businesses: DiscoveredBusiness[] = [];
    for (const row of response.local_results ?? []) {
        const businessName = typeof row.title === 'string' ? row.title.trim() : '';
        if (!businessName || isLikelyChain(businessName)) continue;

        const sourceExternalId = typeof row.place_id === 'string' && row.place_id
            ? row.place_id
            : createFallbackId('industry_directory', [
                businessName,
                String(row.address ?? ''),
                input.city,
                input.state,
            ]);

        businesses.push({
            source: 'industry_directory',
            sourceExternalId,
            sourceUrl: typeof row.place_id_search === 'string' ? row.place_id_search : undefined,
            businessName,
            city: input.city,
            state: input.state,
            vertical,
            category: typeof row.type === 'string' ? row.type : null,
            address: typeof row.address === 'string' ? row.address : null,
            phone: typeof row.phone === 'string' ? row.phone : null,
            website: normalizeWebsite(typeof row.website === 'string' ? row.website : null),
            rating: toNumber(row.rating),
            reviewCount: toNumber(row.reviews),
            raw: row,
        });
    }

    return { businesses, queryCount: 1 };
}

async function safeSourceDiscovery(
    source: DiscoverySource,
    fn: () => Promise<SourceDiscoveryResult>,
): Promise<SourceDiscoveryResult> {
    try {
        return await fn();
    } catch (error) {
        logger.warn({
            event: 'outreach.discovery.source_error',
            source,
            error: error instanceof Error ? error.message : String(error),
        }, 'Outreach discovery source failed; continuing with remaining sources');
        return { businesses: [], queryCount: 0 };
    }
}

export async function discoverBusinesses(input: DiscoveryInput): Promise<DiscoveryResult> {
    const mergedConfig: DiscoverySourceConfig = {
        ...DEFAULT_SOURCE_CONFIG,
        ...input.sourceConfig,
    };

    const targetLeadCount = Math.max(25, Math.min(500, input.targetLeadCount ?? 200));
    const normalizedInput: DiscoveryInput = {
        ...input,
        vertical: normalizeVertical(input.vertical),
        targetLeadCount,
    };

    const [googleResult, yelpResult, directoryResult] = await Promise.all([
        mergedConfig.googlePlaces
            ? safeSourceDiscovery('google_places', () => discoverFromGooglePlaces(normalizedInput))
            : Promise.resolve({ businesses: [], queryCount: 0 }),
        mergedConfig.yelp
            ? safeSourceDiscovery('yelp', () => discoverFromYelp(normalizedInput))
            : Promise.resolve({ businesses: [], queryCount: 0 }),
        mergedConfig.directories
            ? safeSourceDiscovery('industry_directory', () => discoverFromDirectoryFallback(normalizedInput))
            : Promise.resolve({ businesses: [], queryCount: 0 }),
    ]);

    const combined = [
        ...googleResult.businesses,
        ...yelpResult.businesses,
        ...directoryResult.businesses,
    ];
    const deduped = dedupeBusinesses(combined).slice(0, targetLeadCount);

    const estimatedCostCents =
        googleResult.queryCount * 2 +
        yelpResult.queryCount * 1 +
        directoryResult.queryCount * 1;

    logger.info({
        event: 'outreach.discovery.complete',
        city: normalizedInput.city,
        state: normalizedInput.state,
        vertical: normalizedInput.vertical,
        fetched: combined.length,
        deduped: deduped.length,
        queryCounts: {
            google_places: googleResult.queryCount,
            yelp: yelpResult.queryCount,
            industry_directory: directoryResult.queryCount,
        },
    }, 'Outreach discovery completed');

    return {
        businesses: deduped,
        stats: {
            sourceCounts: {
                google_places: googleResult.businesses.length,
                yelp: yelpResult.businesses.length,
                industry_directory: directoryResult.businesses.length,
            },
            queryCounts: {
                google_places: googleResult.queryCount,
                yelp: yelpResult.queryCount,
                industry_directory: directoryResult.queryCount,
            },
            deduped: deduped.length,
            estimatedCostCents,
        },
    };
}
