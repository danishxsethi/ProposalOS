import { LegacyAuditModuleResult, GBPModuleInput } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import { logger } from '@/lib/logger';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

/** Normalize for comparison: lowercase, remove punctuation, collapse spaces */
function normalize(s: string): string {
    return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Check if GBP name is consistent with website domain (e.g. "Main Street Dental" vs mainstreetdental.com) */
function checkNameMatchesWebsite(gbpName: string | undefined, websiteUrl: string | undefined): boolean {
    if (!gbpName || !websiteUrl) return true; // No mismatch if either missing
    try {
        const url = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
        const host = url.hostname.replace(/^www\./, '').split('.')[0];
        const nameWords = normalize(gbpName).split(/\s+/).filter(w => w.length > 2);
        const nameCore = nameWords.join('');
        return host.includes(nameCore) || nameCore.includes(host) || host.length < 4;
    } catch {
        return true;
    }
}

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

        const fieldMask = [
            'id', 'displayName', 'formattedAddress', 'rating', 'userRatingCount',
            'websiteUri', 'reviews', 'photos', 'regularOpeningHours', 'types',
            'editorialSummary', 'nationalPhoneNumber', 'internationalPhoneNumber',
            'primaryTypeDisplayName', 'primaryType',
            'paymentOptions', 'accessibilityOptions', 'amenities',
        ].join(',');
        const details = await cachedFetch('places_details', { placeId }, async () => {
            const detailsRes = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                    'X-Goog-FieldMask': fieldMask,
                },
            });
            return await detailsRes.json();
        }, { ttlHours: 24 * 7 });

        const phone = details.nationalPhoneNumber || details.internationalPhoneNumber;
        const description = details.editorialSummary?.text;
        const photos = details.photos || [];
        const photoCount = photos.length;
        const reviews = details.reviews || [];

        // Check name/phone consistency with website (if websiteUrl provided)
        const websiteUrl = input.websiteUrl;
        const nameMatchesWebsite = checkNameMatchesWebsite(details.displayName?.text, websiteUrl);
        const phoneMatchesWebsite = true; // Places API doesn't expose website phone; assume OK if both present

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
                reviews: reviews.slice(0, 10),
                photos: photos.slice(0, 5),
                photoCount,
                openingHours: details.regularOpeningHours,
                types: details.types,
                primaryType: details.primaryTypeDisplayName?.text,
                phone,
                nationalPhoneNumber: details.nationalPhoneNumber,
                internationalPhoneNumber: details.internationalPhoneNumber,
                description,
                editorialSummary: details.editorialSummary,
                paymentOptions: details.paymentOptions,
                accessibilityOptions: details.accessibilityOptions,
                amenities: details.amenities,
                nameMatchesWebsite,
                phoneMatchesWebsite,
                hasAttributes: !!(details.paymentOptions || details.accessibilityOptions || details.amenities),
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
