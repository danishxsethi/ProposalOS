import { AuditModuleResult, GBPModuleInput } from './types';
import { CostTracker } from '@/lib/costs/costTracker';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export async function runGBPModule(input: GBPModuleInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    console.log(`[GBPModule] Analyzing ${input.businessName} in ${input.city}...`);

    if (!process.env.GOOGLE_PLACES_API_KEY) {
        throw new Error('GOOGLE_PLACES_API_KEY is missing');
    }

    try {
        // 1. Find Place ID (Text Search)
        tracker?.addApiCall('PLACES_TEXT_SEARCH');
        const searchRes = await fetch(`${PLACES_API_BASE}/places:searchText`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
                'X-Goog-FieldMask': 'places.name,places.id,places.formattedAddress,places.rating,places.userRatingCount',
            },
            body: JSON.stringify({
                textQuery: `${input.businessName} in ${input.city}`,
                maxResultCount: 1,
            }),
        });

        const searchData = await searchRes.json();
        if (!searchData.places || searchData.places.length === 0) {
            throw new Error(`Business not found: ${input.businessName} in ${input.city}`);
        }

        const place = searchData.places[0];
        const placeId = place.id;

        // 2. Get Details + Reviews
        tracker?.addApiCall('PLACES_DETAILS');
        const detailsRes = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
                'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,userRatingCount,websiteUri,reviews,photos,regularOpeningHours,types',
            },
        });

        const details = await detailsRes.json();

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
        console.error('[GBPModule] Error:', error);
        return {
            moduleId: 'gbp-audit',
            status: 'failed',
            timestamp: new Date().toISOString(),
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
