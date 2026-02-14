import { LegacyAuditModuleResult, GBPModuleInput } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import { logger } from '@/lib/logger';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export async function runGBPModule(input: GBPModuleInput, tracker?: CostTracker): Promise<LegacyAuditModuleResult> {
    logger.info({ businessName: input.businessName, city: input.city }, '[GBPModule] Analyzing');

    if (!process.env.GOOGLE_PLACES_API_KEY) {
        throw new Error('GOOGLE_PLACES_API_KEY is missing');
    }

    try {
        // 1. Find Place ID via Text Search (Cached 24 hours)
        tracker?.addApiCall('PLACES_TEXT_SEARCH');

        const searchData = await cachedFetch(
            'places_text_search',
            { businessName: input.businessName, city: input.city },
            async () => {
                const searchRes = await fetch(`${PLACES_API_BASE}/places:searchText`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                        'X-Goog-FieldMask': 'places.name,places.id,places.formattedAddress,places.rating,places.userRatingCount',
                    },
                    body: JSON.stringify({
                        textQuery: `${input.businessName} in ${input.city}`,
                        maxResultCount: 1,
                    }),
                });


                if (!searchRes.ok) {
                    throw new Error(`Places Text Search failed: ${searchRes.statusText}`);
                }

                return searchRes.json();
            },
            { ttlHours: 24 }
        );

        if (!searchData.places || searchData.places.length === 0) {
            throw new Error(`Business not found: ${input.businessName} in ${input.city}`);
        }

        const place = searchData.places[0];
        const placeId = place.id;

        // 2. Get Details + Reviews
        // 2. Get Details + Reviews (Cached 7 days)
        tracker?.addApiCall('PLACES_DETAILS');

        const details = await cachedFetch('places_details', { placeId }, async () => {
            const detailsRes = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                    'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,userRatingCount,websiteUri,reviews,photos,regularOpeningHours,types',
                },
            });
            return await detailsRes.json();
        }, { ttlHours: 24 * 7 });

        return {
            moduleId: 'gbp-audit',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                placeId: details.id,
                name: details.displayName?.text,
                address: details.formattedAddress,
                rating: details.rating,
                reviewCount: details.userRatingCount,
                website: details.websiteUri,
                reviews: details.reviews?.slice(0, 5) || [], // Top 5 reviews
                photos: details.photos?.slice(0, 1) || [],
                openingHours: details.regularOpeningHours,
                types: details.types,
            }
        };

    } catch (error) {
        logger.error({ err: error, businessName: input.businessName, city: input.city }, '[GBPModule] Error');
        return {
            moduleId: 'gbp-audit',
            status: 'failed',
            timestamp: new Date().toISOString(),
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
