import { AuditModuleResult, Finding, GBPModuleInput } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export interface GbpDeepModuleInput extends GBPModuleInput {
    placeId?: string; // Optional if known from basic GBP module
    websiteUrl?: string; // For consistency check
}

interface PhotoAnalysis {
    totalCount: number;
    hasLogo: boolean;
    hasCover: boolean;
    recentPhotoCount: number; // Last 3 months
    aiAnalysis?: {
        photoUrl: string;
        scores: { quality: number; relevance: number; professionalism: number };
        type: string;
        flags: string[];
    }[];
}

interface ReviewAnalysis {
    totalCount: number;
    rating: number;
    velocity: number; // Reviews per month (last 6 months)
    daysSinceLastReview: number;
    ownerResponseRate: number; // Percentage
    avgResponseLength: number; // Words
    sentiment: {
        positiveKeywords: string[];
        negativeKeywords: string[];
    };
}

interface ProfileCompleteness {
    score: number; // 0-100
    missingFields: string[];
    nameConsistency: boolean;
    descriptionPresent: boolean;
    attributesPresent: boolean;
    openingDatePresent: boolean;
}

interface GbpDeepAnalysis {
    completeness: ProfileCompleteness;
    photos: PhotoAnalysis;
    reviews: ReviewAnalysis;
    isClaimed: boolean; // Inference
    primaryCategory: string;
    secondaryCategories: string[];
}

/**
 * Run Deep GBP Analysis Module
 */
export async function runGbpDeepModule(
    input: GbpDeepModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ businessName: input.businessName }, '[GBPDeep] Starting deep analysis');

    if (!process.env.GOOGLE_PLACES_API_KEY) {
        throw new Error('GOOGLE_PLACES_API_KEY is missing');
    }

    try {
        let placeId = input.placeId;

        // 1. Resolve Place ID if not provided
        if (!placeId) {
            tracker?.addApiCall('PLACES_TEXT_SEARCH');
            const searchRes = await cachedFetch(
                'places_text_search',
                { businessName: input.businessName, city: input.city },
                async () => {
                    const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                            'X-Goog-FieldMask': 'places.id',
                        },
                        body: JSON.stringify({
                            textQuery: `${input.businessName} in ${input.city}`,
                            maxResultCount: 1,
                        }),
                    });
                    if (!res.ok) throw new Error('Place search failed');
                    return res.json();
                },
                { ttlHours: 24 }
            );

            if (!searchRes.places?.length) throw new Error('Business not found in Maps');
            placeId = searchRes.places[0].id;
        }

        // 2. Fetch Deep Details
        // Extended FieldMask for deep analysis
        const fieldMask = [
            'id', 'displayName', 'formattedAddress', 'websiteUri',
            'rating', 'userRatingCount',
            'photos', 'reviews',
            'primaryType', 'primaryTypeDisplayName',
            'editorialSummary', // Description
            'paymentOptions', 'accessibilityOptions', 'amenities', // Attributes
            // Note: openingDate is explicitly requested via 'businessStatus' usually or specific fields
            'regularOpeningHours',
            'types'
        ].map(f => f.startsWith('places.') ? f : f).join(',');

        tracker?.addApiCall('PLACES_DETAILS_DEEP');
        const details = await cachedFetch(
            'places_details_deep',
            { placeId },
            async () => {
                const res = await fetch(`${PLACES_API_BASE}/places/${placeId}?languageCode=en`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                        'X-Goog-FieldMask': fieldMask,
                    },
                });
                return res.json();
            },
            { ttlHours: 24 * 7 }
        );

        // 3. Analyze Data
        const analysis = await analyzeGbpData(details, input.websiteUrl, tracker);

        // 4. Generate Findings
        const findings = generateGbpFindings(analysis);

        const evidenceSnapshot = {
            module: 'gbp_deep',
            source: 'places_api_v1',
            rawResponse: {
                completeness: analysis.completeness,
                photos: { count: analysis.photos.totalCount, aiResults: analysis.photos.aiAnalysis?.length },
                reviews: { velocity: analysis.reviews.velocity, responseRate: analysis.reviews.ownerResponseRate }
            },
            collectedAt: new Date(),
        };

        logger.info({
            businessName: input.businessName,
            completeness: analysis.completeness.score,
            photos: analysis.photos.totalCount,
            findings: findings.length
        }, '[GBPDeep] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, businessName: input.businessName }, '[GBPDeep] Analysis failed');
        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Visibility',
                title: 'GBP Analysis Failed',
                description: 'Could not perform deep analysis of Google Business Profile.',
                impactScore: 1,
                confidenceScore: 0,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: []
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Core Analysis Logic
 */
async function analyzeGbpData(place: any, websiteUrl: string | undefined, tracker?: CostTracker): Promise<GbpDeepAnalysis> {
    // A. Profile Completeness
    const missingFields: string[] = [];
    if (!place.editorialSummary) missingFields.push('Business Description');
    if (!place.websiteUri) missingFields.push('Website Link');
    if (!place.paymentOptions && !place.accessibilityOptions) missingFields.push('Attributes (Payment/Access)');

    // Check name consistency
    // Simple normalization: lowercase, remove punctuation
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    // Assuming websiteUrl is passed, fetching title would be needed for perfect match, 
    // but here we might just assume consistency if websiteUri exists in GBP.
    // For now, simply verify websiteUri presence matches input requirement logic later.
    const nameConsistency = true; // Placeholder for deeper scraper integration

    const completenessScore = Math.max(0, 100 - (missingFields.length * 15));

    // B. Photo Analysis
    const photos = place.photos || [];
    const photoAnalysis: PhotoAnalysis = {
        totalCount: photos.length,
        hasLogo: false, // Cannot distinguish explicitly via API v1 easily without "category" field in photo, assuming false for conservative finding
        hasCover: false,
        recentPhotoCount: 0,
    };

    // AI Photo Scoring
    if (photos.length > 0 && process.env.GOOGLE_AI_API_KEY) {
        const top5Photos = photos.slice(0, 5);
        // We need to construct fetchable URLs
        // Format: https://places.googleapis.com/v1/{name}/media?key=API_KEY&maxHeightPx=400&maxWidthPx=400
        const photoUrls = top5Photos.map((p: any) =>
            `${PLACES_API_BASE}/${p.name}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400&maxWidthPx=400`
        );

        photoAnalysis.aiAnalysis = await analyzePhotosWithGemini(photoUrls, tracker);
    }

    // C. Review Analysis
    const reviews = place.reviews || [];
    const now = new Date();

    // Sort by date (publishTime)
    // Format: "2023-10-25T..."
    const sortedReviews = [...reviews].sort((a, b) =>
        new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime()
    );

    // Calculate Velocity (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    const recentReviews = sortedReviews.filter((r: any) => new Date(r.publishTime) > sixMonthsAgo);
    const velocity = recentReviews.length / 6;

    // Recency
    const lastReviewDate = sortedReviews.length > 0 ? new Date(sortedReviews[0].publishTime) : null;
    const daysSinceLastReview = lastReviewDate ? Math.floor((now.getTime() - lastReviewDate.getTime()) / (1000 * 3600 * 24)) : 999;

    // Owner Response Rate
    // API v1 review object contains 'originalText' (review) and 'text' (response? No, separate logic usually).
    // Wait, v1 places.reviews contains 'authorAttribution', 'publishTime', 'rating', 'text', 'originalText'.
    // OWNER RESPONSE is NOT explicitly in the standard 'reviews' array in v1 Place Details unless expanded?
    // Actually, 'googleMapsUri' -> users can see responses. 
    // Programmatically checking owner response via Places API v1 is tricky. It provides the *user* review. 
    // It DOES NOT standardly providing the owner response text in the default review object for Place Details.
    // However, GMB API (My Business) does. Places API (public) often omits this.
    // Workaround: We will skip strict "Owner Response Rate" calculation if data is missing, or infer from specialized fields if available.
    // For this module, we will assume 0 if we can't see it, or mark "Unknown".
    // Let's degrade gracefully: if we can't see responses, we don't flag "0% response".
    // NOTE: For the sake of the prompt requirements, I will assume we might parse this if available, or simulate via scraping if this were a production scraper.
    // Since we are using official API, we'll mark response rate as -1 (Unknown) to avoid false painkiller.
    const ownerResponseRate = -1;

    return {
        completeness: {
            score: completenessScore,
            missingFields,
            nameConsistency,
            descriptionPresent: !!place.editorialSummary,
            attributesPresent: !!(place.paymentOptions || place.accessibilityOptions),
            openingDatePresent: false // Not easily available in v1 field mask
        },
        photos: photoAnalysis,
        reviews: {
            totalCount: place.userRatingCount || 0,
            rating: place.rating || 0,
            velocity,
            daysSinceLastReview,
            ownerResponseRate,
            avgResponseLength: reviews.reduce((acc: number, r: any) => acc + (r.text?.text?.length || 0), 0) / (reviews.length || 1),
            sentiment: { positiveKeywords: [], negativeKeywords: [] }
        },
        isClaimed: true, // Difficult to know via API, assume claimed/verified if data is rich
        primaryCategory: place.primaryTypeDisplayName?.text || place.primaryType || 'Unknown',
        secondaryCategories: place.types || []
    };
}

/**
 * AI Photo Analysis with Gemini
 */
async function analyzePhotosWithGemini(urls: string[], tracker?: CostTracker): Promise<NonNullable<PhotoAnalysis['aiAnalysis']>> {
    if (!process.env.GOOGLE_AI_API_KEY) return [];

    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // We cannot pass URLs directly to Gemini 1.5 Flash in this manner usually (needs base64 or file/URI in storage).
        // However, standard fetch + base64 convert works.

        const results = [];

        // Analyze up to 3 photos to save time/cost
        for (const url of urls.slice(0, 3)) {
            tracker?.addApiCall('GEMINI_PHOTO_ANALYSIS');

            // Fetch image buffer
            const imgRes = await fetch(url);
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64Img = Buffer.from(arrayBuffer).toString('base64');

            const prompt = `Analyze this business photo for a GBP audit.
            Rate 1-10 on: Quality, Relevance, Professionalism.
            Identify Type: Exterior, Interior, Team, Product, or Other.
            Flag issues: Blurry, Dark, TextHeavy, Irrelevant.
            Return JSON: { scores: { quality: number, relevance: number, professionalism: number }, type: string, flags: string[] }`;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: base64Img, mimeType: 'image/jpeg' } }
            ]);

            const text = result.response.text();
            // Simple JSON parse (cleanup markdown if needed)
            const cleanText = text.replace(/```json|```/g, '').trim();
            const analysis = JSON.parse(cleanText);

            results.push({
                photoUrl: url,
                ...analysis
            });
        }

        return results;
    } catch (e) {
        logger.warn({ error: e }, '[GBPDeep] Photo analysis failed');
        return [];
    }
}

/**
 * Generate Findings
 */
function generateGbpFindings(analysis: GbpDeepAnalysis): Finding[] {
    const findings: Finding[] = [];
    const { completeness, photos, reviews } = analysis;

    // PAINKILLER: Description Empty
    if (!completeness.descriptionPresent) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Critical: Business Description Missing',
            description: 'Your Google Business Profile has no description. This is a primary ranking factor and your main "elevator pitch" to searchers.',
            impactScore: 7,
            confidenceScore: 100,
            evidence: [],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Write a 750-character keyword-rich description', 'Include services and city name']
        });
    }

    // PAINKILLER: Ghost Town (No recent reviews)
    if (reviews.daysSinceLastReview > 90) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'No Reviews in 3 Months',
            description: `You haven't received a Google review in ${reviews.daysSinceLastReview} days. Customers trust "fresh" reviews; inactivity signals a closed or struggling business.`,
            impactScore: 7,
            confidenceScore: 100,
            evidence: [{ type: 'metric', value: reviews.daysSinceLastReview, label: 'Days Since Last Review' }],
            metrics: { daysSinceReview: reviews.daysSinceLastReview },
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Implement an automated review request campaign', 'Ask recent happy clients immediately']
        });
    }

    // PAINKILLER: No Owner Photos (Inferred from low count)
    // If photos < 5, likely just maps/street view
    if (photos.totalCount < 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Lack of Owner-Uploaded Photos',
            description: 'Your profile has very few photos. Businesses with photos receive 42% more requests for directions and 35% more click-throughs.',
            impactScore: 6,
            confidenceScore: 90,
            evidence: [{ type: 'metric', value: photos.totalCount, label: 'Total Photos' }],
            metrics: { photoCount: photos.totalCount },
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Upload 10+ high-quality photos (team, exterior, interior)', 'Add logo and cover photo']
        });
    }

    // VITAMIN: Poor Photo Quality (AI Detected)
    const poorPhotos = photos.aiAnalysis?.filter(p => p.scores.quality < 6 || p.flags.length > 0);
    if (poorPhotos && poorPhotos.length > 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Low-Quality Profile Photos',
            description: 'AI analysis detected blurry or unprofessional photos on your profile. This damages visible trust before a customer even calls.',
            impactScore: 4,
            confidenceScore: 85,
            evidence: poorPhotos.map(p => ({
                type: 'text',
                value: `Quality Score: ${p.scores.quality}/10 (${p.flags.join(', ')})`,
                label: 'Photo Issue'
            })),
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Replace identified low-quality photos', 'Hire a professional for a 1-hour shoot']
        });
    }

    // VITAMIN: Missing Attributes
    if (!completeness.attributesPresent) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Missing Business Attributes',
            description: 'You haven\'t added attributes (e.g., "Wheelchair Accessible", "Women-Led", payment methods). These serve as key filters in voice search.',
            impactScore: 5,
            confidenceScore: 100,
            evidence: [],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Log into GBP and fill out "Attributes" section completely']
        });
    }

    // VITAMIN: Low Review Velocity
    if (reviews.velocity < 1 && reviews.totalCount > 10) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Stagnant Review Velocity',
            description: `You are averaging ${reviews.velocity.toFixed(1)} reviews/month. Consistent new reviews are a major ranking signal for the Local Pack.`,
            impactScore: 5,
            confidenceScore: 100,
            evidence: [{ type: 'metric', value: reviews.velocity.toFixed(1), label: 'Reviews/Month' }],
            metrics: { velocity: reviews.velocity },
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Build a review process into your sales flow']
        });
    }

    return findings;
}
