import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

import { withModuleCache } from '@/lib/cache/moduleCache';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safeFetchResponseDerived } from '@/lib/security/safeFetch';

import { normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, createEvidence, Finding, GBPModuleInput } from './types';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export interface GbpDeepModuleInput extends GBPModuleInput {
  placeId?: string; // Optional if known from basic GBP module
  websiteUrl?: string; // For consistency check
  placeData?: Record<string, any>;
  signal?: AbortSignal;
}

interface PhotoAnalysis {
  totalCount: number;
  hasLogo: boolean | null;
  hasCover: boolean | null;
  recentPhotoCount: number | null;
  aiAnalysis?: {
    photoUrl: string;
    scores: { quality: number; relevance: number; professionalism: number };
    type: string;
    flags: string[];
  }[];
}

interface ReviewAnalysis {
  totalCount: number | null;
  rating: number | null;
  velocity: number | null;
  daysSinceLastReview: number | null;
  ownerResponseRate: number | null;
  avgResponseLength: number | null;
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
  openingDatePresent: boolean | null;
}

export interface GbpDeepAnalysis {
  completeness: ProfileCompleteness;
  photos: PhotoAnalysis;
  reviews: ReviewAnalysis;
  claimedStatus: {
    value: boolean | null;
    basis: 'observed' | 'inferred' | 'unavailable';
    confidence?: number;
  };
  primaryCategory: string | null;
  secondaryCategories: string[];
}

const PhotoAnalysisSchema = z
  .object({
    scores: z.object({
      quality: z.number().min(1).max(10),
      relevance: z.number().min(1).max(10),
      professionalism: z.number().min(1).max(10),
    }),
    type: z.enum(['Exterior', 'Interior', 'Team', 'Product', 'Other']),
    flags: z.array(z.enum(['Blurry', 'Dark', 'TextHeavy', 'Irrelevant'])).max(4),
  })
  .strict();

/**
 * Run Deep GBP Analysis Module
 */
export async function runGbpDeepModule(
  input: GbpDeepModuleInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ businessName: input.businessName }, '[GBPDeep] Starting deep analysis');

  if (!input.placeData && !process.env.GOOGLE_PLACES_API_KEY) {
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'unavailable', reason: 'GOOGLE_PLACES_API_KEY is missing' },
    };
  }

  try {
    let placeId = input.placeId || input.placeData?.placeId;
    let details = input.placeData ? dependencyPlaceToApiShape(input.placeData) : null;

    // 1. Resolve Place ID if not provided
    if (!placeId && !details) {
      const searchRes = await withModuleCache<any>(
        {
          module: 'gbp_deep',
          version: 1,
          input: { type: 'places_text_search', businessName: input.businessName, city: input.city },
        },
        { ttlSeconds: 24 * 60 * 60 },
        async () => {
          return withProviderResilience<any>(
            {
              provider: 'google-places',
              operation: 'gbp_deep:places_text_search',
              signal: input.signal,
              degrade: false,
            },
            async ({ signal }) => {
              tracker?.addApiCall('PLACES_TEXT_SEARCH');
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
                signal,
              });
              if (!res.ok) throw new Error(`Place search failed: ${res.statusText}`);
              return res.json();
            }
          );
        }
      );

      if (!searchRes.places?.length) throw new Error('Business not found in Maps');
      placeId = searchRes.places[0].id;
    }

    // 2. Fetch Deep Details
    // Extended FieldMask for deep analysis
    const fieldMask = [
      'id',
      'displayName',
      'formattedAddress',
      'websiteUri',
      'rating',
      'userRatingCount',
      'photos',
      'reviews',
      'primaryType',
      'primaryTypeDisplayName',
      'editorialSummary', // Description
      'paymentOptions',
      'accessibilityOptions',
      'amenities', // Attributes
      // Note: openingDate is explicitly requested via 'businessStatus' usually or specific fields
      'regularOpeningHours',
      'types',
    ]
      .map((f) => (f.startsWith('places.') ? f : f))
      .join(',');

    if (!details) {
      details = await withModuleCache<any>(
        {
          module: 'gbp_deep',
          version: 2,
          input: { type: 'places_details_deep', placeId },
        },
        { ttlSeconds: 7 * 24 * 60 * 60 },
        async () => {
          return withProviderResilience<any>(
            {
              provider: 'google-places',
              operation: 'gbp_deep:places_details_deep',
              signal: input.signal,
              degrade: false,
            },
            async ({ signal }) => {
              tracker?.addApiCall('PLACES_DETAILS_DEEP');
              const res = await fetch(`${PLACES_API_BASE}/places/${placeId}?languageCode=en`, {
                headers: {
                  'Content-Type': 'application/json',
                  'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                  'X-Goog-FieldMask': fieldMask,
                },
                signal,
              });
              if (!res.ok) throw new Error(`Places details deep failed: ${res.statusText}`);
              return res.json();
            }
          );
        }
      );
    }

    if (!details) {
      throw new Error('Places details response was unavailable');
    }
    if (!details.id && !placeId) {
      throw new Error('Places details response did not identify a place');
    }

    // 3. Analyze Data
    const analysis = await analyzeGbpData(details, input.websiteUrl, tracker, input.signal);

    // 4. Generate Findings
    const collectedAt = new Date().toISOString();
    const resolvedPlaceId = details.id || placeId;
    const placeRecordPointer = `${PLACES_API_BASE}/places/${resolvedPlaceId}`;
    const findings = generateGbpFindings(analysis, placeRecordPointer, collectedAt);
    const photoAnalysisUnavailable =
      analysis.photos.totalCount > 0 &&
      (!process.env.GOOGLE_AI_API_KEY || !analysis.photos.aiAnalysis?.length);

    const evidenceSnapshot = {
      module: 'gbp_deep',
      source: input.placeData ? 'canonical_gbp_dependency' : 'places_api_v1',
      rawResponse: {
        completeness: analysis.completeness,
        claimedStatus: analysis.claimedStatus,
        photos: {
          count: analysis.photos.totalCount,
          aiResults: analysis.photos.aiAnalysis?.length,
        },
        reviews: {
          velocity: analysis.reviews.velocity,
          responseRate: analysis.reviews.ownerResponseRate,
        },
      },
      collectedAt: new Date(),
    };

    logger.info(
      {
        businessName: input.businessName,
        completeness: analysis.completeness.score,
        photos: analysis.photos.totalCount,
        findings: findings.length,
      },
      '[GBPDeep] Analysis complete'
    );

    return {
      findings,
      evidenceSnapshots: [evidenceSnapshot],
      execution:
        photoAnalysisUnavailable || analysis.claimedStatus.basis === 'unavailable'
          ? {
              state: 'partial',
              reason: 'Some photo or claimed-status metrics were unavailable',
            }
          : { state: 'complete' },
    };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    logger.error({ error, businessName: input.businessName }, '[GBPDeep] Analysis failed');
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'GBP deep analysis failed',
      },
    };
  }
}

function dependencyPlaceToApiShape(place: Record<string, any>): Record<string, any> {
  return {
    id: place.placeId,
    displayName: place.name ? { text: place.name } : undefined,
    formattedAddress: place.address,
    websiteUri: place.website,
    rating: place.rating,
    userRatingCount: place.reviewCount,
    photos: place.photos,
    reviews: place.reviews,
    regularOpeningHours: place.openingHours,
    types: place.types,
    primaryType: place.primaryType,
    primaryTypeDisplayName: place.primaryType ? { text: place.primaryType } : undefined,
    editorialSummary: place.editorialSummary,
    paymentOptions: place.paymentOptions,
    accessibilityOptions: place.accessibilityOptions,
    amenities: place.amenities,
  };
}

/**
 * Core Analysis Logic
 */
async function analyzeGbpData(
  place: any,
  websiteUrl: string | undefined,
  tracker?: CostTracker,
  signal?: AbortSignal
): Promise<GbpDeepAnalysis> {
  // A. Profile Completeness
  const missingFields: string[] = [];
  if (!place.editorialSummary) missingFields.push('Business Description');
  if (!place.websiteUri) missingFields.push('Website Link');
  if (!place.paymentOptions && !place.accessibilityOptions)
    missingFields.push('Attributes (Payment/Access)');

  // Check name consistency
  // Simple normalization: lowercase, remove punctuation
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w]/g, '');
  const inputHost = websiteUrl ? normalize(new URL(websiteUrl).hostname.replace(/^www\./, '')) : '';
  const placeHost = place.websiteUri
    ? normalize(new URL(place.websiteUri).hostname.replace(/^www\./, ''))
    : '';
  const nameConsistency = !inputHost || !placeHost || inputHost === placeHost;

  const completenessScore = Math.max(0, 100 - missingFields.length * 15);

  // B. Photo Analysis
  const photos = place.photos || [];
  const photoAnalysis: PhotoAnalysis = {
    totalCount: photos.length,
    hasLogo: null,
    hasCover: null,
    recentPhotoCount: null,
  };

  // AI Photo Scoring
  if (photos.length > 0 && process.env.GOOGLE_AI_API_KEY) {
    const photoUrls = photos
      .slice(0, 5)
      .filter((photo: any) => typeof photo?.name === 'string' && photo.name.length > 0)
      .map((photo: any) => ({
        evidenceUrl: `${PLACES_API_BASE}/${photo.name}/media`,
        fetchUrl: `${PLACES_API_BASE}/${photo.name}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400&maxWidthPx=400`,
      }));

    photoAnalysis.aiAnalysis = await analyzePhotosWithGemini(photoUrls, tracker, signal);
  }

  // C. Review Analysis
  const reviews = place.reviews || [];
  const now = new Date();

  // Sort by date (publishTime)
  // Format: "2023-10-25T..."
  const sortedReviews = [...reviews].sort(
    (a, b) => new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime()
  );

  // Calculate Velocity (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  const recentReviews = sortedReviews.filter((r: any) => new Date(r.publishTime) > sixMonthsAgo);
  const velocity = reviews.length === place.userRatingCount ? recentReviews.length / 6 : null;

  // Recency
  const lastReviewDate = sortedReviews.length > 0 ? new Date(sortedReviews[0].publishTime) : null;
  const daysSinceLastReview = lastReviewDate
    ? Math.floor((now.getTime() - lastReviewDate.getTime()) / (1000 * 3600 * 24))
    : null;

  // Public Places details do not expose owner response coverage.
  const ownerResponseRate = null;

  return {
    completeness: {
      score: completenessScore,
      missingFields,
      nameConsistency,
      descriptionPresent: !!place.editorialSummary,
      attributesPresent: !!(place.paymentOptions || place.accessibilityOptions),
      openingDatePresent: null,
    },
    photos: photoAnalysis,
    reviews: {
      totalCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
      rating: typeof place.rating === 'number' ? place.rating : null,
      velocity,
      daysSinceLastReview,
      ownerResponseRate,
      avgResponseLength: null,
      sentiment: { positiveKeywords: [], negativeKeywords: [] },
    },
    claimedStatus: { value: null, basis: 'unavailable' },
    primaryCategory: place.primaryTypeDisplayName?.text || place.primaryType || null,
    secondaryCategories: place.types || [],
  };
}

/**
 * AI Photo Analysis with Gemini
 */
async function analyzePhotosWithGemini(
  urls: Array<{ fetchUrl: string; evidenceUrl: string }>,
  tracker?: CostTracker,
  signal?: AbortSignal
): Promise<NonNullable<PhotoAnalysis['aiAnalysis']>> {
  if (!process.env.GOOGLE_AI_API_KEY) return [];

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // We cannot pass URLs directly to Gemini 1.5 Flash in this manner usually (needs base64 or file/URI in storage).
    // However, standard fetch + base64 convert works.

    const results = [];

    // Analyze up to 3 photos to save time/cost
    for (const url of urls.slice(0, 3)) {
      try {
        // Fetch image buffer with resilience
        const imgRes = await withProviderResilience<Response>(
          {
            provider: 'crawler',
            operation: 'gbp_deep:fetch_photo',
            signal,
            degrade: false,
            policy: { timeoutMs: 8000, maxAttempts: 2 },
          },
          async ({ signal: providerSignal }) => {
            const res = await safeFetchResponseDerived(
              url.fetchUrl,
              { signal: providerSignal },
              { maxResponseBytes: 2 * 1024 * 1024 }
            );
            if (!res.ok) throw new Error(`Fetch photo failed: ${res.statusText}`);
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.startsWith('image/')) {
              throw new Error(`Unexpected photo content type: ${contentType || 'missing'}`);
            }
            return res;
          }
        );

        const arrayBuffer = await imgRes.arrayBuffer();
        const base64Img = Buffer.from(arrayBuffer).toString('base64');

        const prompt = `Analyze this business photo for a GBP audit.
              Rate 1-10 on: Quality, Relevance, Professionalism.
              Identify Type: Exterior, Interior, Team, Product, or Other.
              Flag issues: Blurry, Dark, TextHeavy, Irrelevant.
              Return JSON: { scores: { quality: number, relevance: number, professionalism: number }, type: string, flags: string[] }`;

        const result = await withProviderResilience<any>(
          {
            provider: 'gemini',
            operation: 'gbp_deep:photo_analysis_gemini',
            signal,
            degrade: false,
            policy: { timeoutMs: 15000, maxAttempts: 2 },
          },
          async () => {
            tracker?.addApiCall('GEMINI_PHOTO_ANALYSIS');
            return await model.generateContent([
              prompt,
              { inlineData: { data: base64Img, mimeType: 'image/jpeg' } },
            ]);
          }
        );

        const text = result.response.text();
        // Simple JSON parse (cleanup markdown if needed)
        const cleanText = text.replace(/```json|```/g, '').trim();
        const analysis = PhotoAnalysisSchema.parse(JSON.parse(cleanText));

        results.push({
          photoUrl: url.evidenceUrl,
          ...analysis,
        });
      } catch (err) {
        if (signal?.aborted) throw signal.reason ?? err;
        logger.warn(
          { error: err, url: url.evidenceUrl },
          '[GBPDeep] Failed to analyze photo, skipping'
        );
      }
    }

    return results;
  } catch (e) {
    if (signal?.aborted) throw signal.reason ?? e;
    logger.warn({ error: e }, '[GBPDeep] Photo analysis failed');
    return [];
  }
}

/**
 * Generate Findings.
 *
 * P1-31 (Wave 3): every evidence item identifies the real Places API record that was
 * fetched (`placeRecordPointer`) and the collection time, via `createEvidence`, instead
 * of `evidence: []`. Only called after a successful Places API details fetch (we are
 * past the try block's data-fetch stage by the time this runs), so "missing
 * description"/"missing attributes" here means "checked the real profile and it was
 * absent" — never a fetch failure silently becoming a deficiency finding.
 */
export function generateGbpFindings(
  analysis: GbpDeepAnalysis,
  placeRecordPointer: string,
  collectedAt: string
): Finding[] {
  const findings: Finding[] = [];
  const { completeness, photos, reviews } = analysis;

  // PAINKILLER: Description Empty
  if (!completeness.descriptionPresent) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'Critical: Business Description Missing',
      description:
        'Your Google Business Profile has no description. This is a primary ranking factor and your main "elevator pitch" to searchers.',
      impactScore: 7,
      confidenceScore: normalizeConfidence(100, '0-100'),
      evidence: [
        createEvidence({
          pointer: `${placeRecordPointer}#editorialSummary`,
          source: 'places_api_v1',
          collected_at: collectedAt,
          type: 'text',
          value: 'editorialSummary field absent',
          label: 'Business Description Field',
        }),
      ],
      metrics: {},
      effortEstimate: 'LOW',
      recommendedFix: [
        'Write a 750-character keyword-rich description',
        'Include services and city name',
      ],
    });
  }

  // PAINKILLER: Ghost Town (No recent reviews)
  if (reviews.daysSinceLastReview !== null && reviews.daysSinceLastReview > 90) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'No Reviews in 3 Months',
      description: `You haven't received a Google review in ${reviews.daysSinceLastReview} days. Customers trust "fresh" reviews; inactivity signals a closed or struggling business.`,
      impactScore: 7,
      confidenceScore: normalizeConfidence(100, '0-100'),
      evidence: [
        createEvidence({
          pointer: `${placeRecordPointer}#reviews`,
          source: 'places_api_v1',
          collected_at: collectedAt,
          type: 'metric',
          value: reviews.daysSinceLastReview,
          label: 'Days Since Last Review',
        }),
      ],
      metrics: { daysSinceReview: reviews.daysSinceLastReview },
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Implement an automated review request campaign',
        'Ask recent happy clients immediately',
      ],
    });
  }

  // PAINKILLER: No Owner Photos (Inferred from low count)
  // If photos < 5, likely just maps/street view
  if (photos.totalCount < 5) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'Lack of Owner-Uploaded Photos',
      description:
        'Your profile has very few photos. Businesses with photos receive 42% more requests for directions and 35% more click-throughs.',
      impactScore: 6,
      confidenceScore: normalizeConfidence(90, '0-100'),
      evidence: [
        createEvidence({
          pointer: `${placeRecordPointer}#photos`,
          source: 'places_api_v1',
          collected_at: collectedAt,
          type: 'metric',
          value: photos.totalCount,
          label: 'Total Photos',
        }),
      ],
      metrics: { photoCount: photos.totalCount },
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Upload 10+ high-quality photos (team, exterior, interior)',
        'Add logo and cover photo',
      ],
    });
  }

  // VITAMIN: Poor Photo Quality (AI Detected)
  const poorPhotos = photos.aiAnalysis?.filter((p) => p.scores.quality < 6 || p.flags.length > 0);
  if (poorPhotos && poorPhotos.length > 0) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Low-Quality Profile Photos',
      description:
        'AI analysis detected blurry or unprofessional photos on your profile. This damages visible trust before a customer even calls.',
      impactScore: 4,
      confidenceScore: normalizeConfidence(85, '0-100'),
      evidence: poorPhotos.map((p) =>
        createEvidence({
          pointer: p.photoUrl,
          source: 'gemini_photo_analysis',
          collected_at: collectedAt,
          type: 'text',
          value: `Quality Score: ${p.scores.quality}/10 (${p.flags.join(', ')})`,
          label: 'Photo Issue',
        })
      ),
      metrics: {},
      effortEstimate: 'LOW',
      recommendedFix: [
        'Replace identified low-quality photos',
        'Hire a professional for a 1-hour shoot',
      ],
    });
  }

  // VITAMIN: Missing Attributes
  if (!completeness.attributesPresent) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Missing Business Attributes',
      description:
        'You haven\'t added attributes (e.g., "Wheelchair Accessible", "Women-Led", payment methods). These serve as key filters in voice search.',
      impactScore: 5,
      confidenceScore: normalizeConfidence(100, '0-100'),
      evidence: [
        createEvidence({
          pointer: `${placeRecordPointer}#attributes`,
          source: 'places_api_v1',
          collected_at: collectedAt,
          type: 'text',
          value: 'paymentOptions/accessibilityOptions/amenities fields absent',
          label: 'Business Attributes Fields',
        }),
      ],
      metrics: {},
      effortEstimate: 'LOW',
      recommendedFix: ['Log into GBP and fill out "Attributes" section completely'],
    });
  }

  // VITAMIN: Low Review Velocity
  if (
    reviews.velocity !== null &&
    reviews.totalCount !== null &&
    reviews.velocity < 1 &&
    reviews.totalCount > 10
  ) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Stagnant Review Velocity',
      description: `You are averaging ${reviews.velocity.toFixed(1)} reviews/month. Consistent new reviews are a major ranking signal for the Local Pack.`,
      impactScore: 5,
      confidenceScore: normalizeConfidence(100, '0-100'),
      evidence: [
        createEvidence({
          pointer: `${placeRecordPointer}#reviews`,
          source: 'places_api_v1',
          collected_at: collectedAt,
          type: 'metric',
          value: reviews.velocity.toFixed(1),
          label: 'Reviews/Month',
        }),
      ],
      metrics: { velocity: reviews.velocity },
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Build a review process into your sales flow'],
    });
  }

  return findings;
}
