import { AuditModuleResult, CompetitorModuleInput, CompetitorComparisonMatrix, MatchedBusinessData, ComparisonGap } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';

const SERP_API_BASE = 'https://serpapi.com/search';
const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runCompetitorModule(input: CompetitorModuleInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    console.log(`[CompetitorModule] Searching for '${input.keyword}' in ${input.location}...`);

    if (!process.env.SERP_API_KEY || !process.env.GOOGLE_PLACES_API_KEY || !process.env.GOOGLE_PAGESPEED_API_KEY) {
        throw new Error('Missing API keys for Competitor Module (SERP, PLACES, or PAGESPEED)');
    }

    try {
        // 1. SerpAPI Search to find top competitors
        tracker?.addApiCall('SERP_API');
        const params: Record<string, string> = {
            engine: 'google_local',
            q: input.keyword,
            location: input.location,
            api_key: process.env.SERP_API_KEY,
            google_domain: 'google.com',
            gl: 'us',
            hl: 'en',
        };

        const response = await cachedFetch('serpapi_local', params, async () => {
            const p = new URLSearchParams(params);
            const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
            return await res.json();
        }, { ttlHours: 24 });

        const data = response;

        if (data.error) {
            throw new Error(`SerpAPI Error: ${data.error}`);
        }

        const localResults = data.local_results || [];
        const topCompetitors = localResults.slice(0, 3); // Top 3

        // Helper to fetch Place Details
        const fetchPlaceDetails = async (placeId: string, name: string): Promise<any> => {
            tracker?.addApiCall('PLACES_DETAILS');
            try {
                return await cachedFetch('places_details_competitor', { placeId }, async () => {
                    const res = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY as string,
                            'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,websiteUri,photos,regularOpeningHours',
                        },
                    });
                    return await res.json();
                }, { ttlHours: 24 * 7 });
            } catch (e) {
                console.warn(`Failed to fetch place details for ${name}`);
                return null;
            }
        };

        // Helper to run Quick PageSpeed (mobile)
        const runQuickPageSpeed = async (url: string): Promise<number> => {
            if (!url) return 0;
            tracker?.addApiCall('PAGESPEED');
            try {
                const psParams = new URLSearchParams({
                    url: url,
                    key: process.env.GOOGLE_PAGESPEED_API_KEY as string,
                    strategy: 'mobile',
                    category: 'performance',
                });
                const psData = await cachedFetch('psi_quick', { url }, async () => {
                    const res = await fetch(`${PSI_API_URL}?${psParams.toString()}`);
                    if (!res.ok) throw new Error('PSI Failed');
                    return await res.json();
                }, { ttlHours: 24 });

                return (psData.lighthouseResult?.categories?.performance?.score || 0) * 100;
            } catch (e) {
                console.warn(`Failed to run PageSpeed for ${url}`);
                return 0;
            }
        };

        // 2. Enrich Competitor Data
        const enrichedCompetitors: MatchedBusinessData[] = [];

        // Parallel fetch for competitors
        await Promise.all(topCompetitors.map(async (comp: any) => {
            let details = null;
            let speed = 0;

            if (comp.place_id) {
                details = await fetchPlaceDetails(comp.place_id, comp.title);
            }

            const website = details?.websiteUri || comp.website; // fallback to serpapi website
            if (website) {
                speed = await runQuickPageSpeed(website);
            }

            enrichedCompetitors.push({
                name: comp.title,
                rating: details?.rating || comp.rating || 0,
                reviewCount: details?.userRatingCount || comp.reviews || 0,
                websiteSpeed: speed,
                photosCount: details?.photos ? details.photos.length : 0,
                hasHours: !!details?.regularOpeningHours,
                inLocalPack: true, // They are in top results
                placeId: comp.place_id
            });
        }));

        // 3. Fetch Subject Business Data (Comparison Target)

        // 1. Find SELF and Category
        const selfParams: Record<string, string> = {
            engine: 'google_local',
            q: input.keyword,
            location: input.location,
            api_key: process.env.SERP_API_KEY,
        };

        const selfData = await cachedFetch('serpapi_local_self', selfParams, async () => {
            const p = new URLSearchParams(selfParams);
            const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
            return await res.json();
        }, { ttlHours: 24 });

        const selfResult = selfData.local_results?.[0]; // Best match

        if (!selfResult) {
            throw new Error('Could not find business to identify category');
        }

        const category = selfResult.type;
        const businessName = input.keyword;

        // Fetch Self Details
        let selfDetails = null;
        if (selfResult.place_id) {
            selfDetails = await fetchPlaceDetails(selfResult.place_id, businessName);
        }
        const selfWebsite = selfDetails?.websiteUri || selfResult.website;
        const selfSpeed = await runQuickPageSpeed(selfWebsite);

        const selfDataStruct: MatchedBusinessData = {
            name: selfResult.title,
            rating: selfDetails?.rating || selfResult.rating || 0,
            reviewCount: selfDetails?.userRatingCount || selfResult.reviews || 0,
            websiteSpeed: selfSpeed,
            photosCount: selfDetails?.photos ? selfDetails.photos.length : 0,
            hasHours: !!selfDetails?.regularOpeningHours,
            inLocalPack: true,
            placeId: selfResult.place_id
        };

        // 2. Find COMPETITORS (if category found) - SECOND PASS
        let competitors: MatchedBusinessData[] = [];
        if (category) {
            tracker?.addApiCall('SERP_API');
            const compParams: Record<string, string> = {
                engine: 'google_local',
                q: `${category} in ${input.location}`,
                location: input.location,
                api_key: process.env.SERP_API_KEY,
            };

            const compData = await cachedFetch('serpapi_local_comp', compParams, async () => {
                const p = new URLSearchParams(compParams);
                const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
                return await res.json();
            }, { ttlHours: 24 });

            // Filter out self
            const rawCompetitors = (compData.local_results || [])
                .filter((r: any) => r.place_id !== selfResult.place_id && r.title !== selfResult.title)
                .slice(0, 3);

            // Fetch details for competitors
            competitors = await Promise.all(rawCompetitors.map(async (comp: any) => {
                let d = null;
                if (comp.place_id) d = await fetchPlaceDetails(comp.place_id, comp.title);

                const w = d?.websiteUri || comp.website;
                const s = await runQuickPageSpeed(w);

                return {
                    name: comp.title,
                    rating: d?.rating || comp.rating || 0,
                    reviewCount: d?.userRatingCount || comp.reviews || 0,
                    websiteSpeed: s,
                    photosCount: d?.photos ? d.photos.length : 0,
                    hasHours: !!d?.regularOpeningHours,
                    inLocalPack: true,
                    placeId: comp.place_id
                };
            }));
        }

        // 3. Calculate Gaps
        const gaps: ComparisonGap[] = [];

        if (competitors.length > 0) {
            // Reviews
            const avgReviews = competitors.reduce((sum, c) => sum + c.reviewCount, 0) / competitors.length;
            const reviewGap = selfDataStruct.reviewCount - avgReviews;
            gaps.push({ metric: 'reviews', businessValue: selfDataStruct.reviewCount, competitorAvg: Math.round(avgReviews), gap: Math.round(reviewGap) });

            // Rating
            const avgRating = competitors.reduce((sum, c) => sum + c.rating, 0) / competitors.length;
            const ratingGap = selfDataStruct.rating - avgRating;
            gaps.push({ metric: 'rating', businessValue: selfDataStruct.rating, competitorAvg: Number(avgRating.toFixed(1)), gap: Number(ratingGap.toFixed(1)) });

            // Speed
            const avgSpeed = competitors.reduce((sum, c) => sum + (c.websiteSpeed || 0), 0) / competitors.length;
            const speedGap = (selfDataStruct.websiteSpeed || 0) - avgSpeed;
            gaps.push({ metric: 'speed', businessValue: selfDataStruct.websiteSpeed || 0, competitorAvg: Math.round(avgSpeed), gap: Math.round(speedGap) });

            // Photos
            const avgPhotos = competitors.reduce((sum, c) => sum + (c.photosCount || 0), 0) / competitors.length;
            const photoGap = (selfDataStruct.photosCount || 0) - avgPhotos;
            gaps.push({ metric: 'photos', businessValue: selfDataStruct.photosCount || 0, competitorAvg: Math.round(avgPhotos), gap: Math.round(photoGap) });
        }

        const matrix: CompetitorComparisonMatrix = {
            business: selfDataStruct,
            competitors,
            gaps
        };

        return {
            moduleId: 'competitor-audit',
            status: 'success',
            timestamp: new Date().toISOString(),
            // costCents is tracked via CostTracker
            data: {
                keyword: input.keyword,
                location: input.location,
                totalResults: competitors.length, // approximation
                topCompetitors: competitors.map(c => ({ name: c.name, rating: c.rating, reviews: c.reviewCount })), // light version for legacy
                comparisonMatrix: matrix
            }
        };

    } catch (error) {
        console.error('[CompetitorModule] Error:', error);
        return {
            moduleId: 'competitor-audit',
            status: 'failed',
            timestamp: new Date().toISOString(),
            costCents: 0,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
