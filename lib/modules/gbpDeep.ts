import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { mapsIntelligence, normalizePlaceToLegacy } from '@/lib/maps/serpMapsProvider';

import { normalizeConfidence } from './findingGenerator';
import { scorePlaceCandidate } from './gbp';
import { AuditModuleResult, createEvidence, Finding, GBPModuleInput } from './types';

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

/**
 * Run Deep GBP Analysis Module
 */
export async function runGbpDeepModule(
  input: GbpDeepModuleInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ businessName: input.businessName }, '[GBPDeep] Starting deep analysis');

  if (input.signal?.aborted) throw input.signal.reason ?? new Error('Places lookup cancelled');
  if (!input.placeData && !process.env.SERP_API_KEY) {
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'unavailable', reason: 'SERP_API_KEY is missing' },
    };
  }

  try {
    let placeId = input.placeId || input.placeData?.placeId;
    let details = input.placeData ? dependencyPlaceToApiShape(input.placeData) : null;

    if (!details) {
      const resolution = await mapsIntelligence.resolveBusiness({
        businessName: input.businessName,
        city: input.city,
        domain: input.websiteUrl,
        placeId,
        fieldProfile: 'GBP_DEEP',
      });
      if (resolution.status === 'FAILED' || resolution.status === 'UNAVAILABLE') {
        if (input.signal?.aborted)
          throw input.signal.reason ?? new Error('Places lookup cancelled');
        return {
          findings: [],
          evidenceSnapshots: [],
          execution: {
            state: resolution.status === 'FAILED' ? 'failed' : 'unavailable',
            reason: resolution.error?.message ?? 'Maps provider unavailable',
          },
        };
      }
      if (!resolution.data)
        return {
          findings: [],
          evidenceSnapshots: [],
          execution: { state: 'partial', reason: 'No place candidate found' },
        };
      placeId = resolution.data.placeId;
      details = normalizePlaceToLegacy(resolution.data);
      details.id = resolution.data.placeId;
      details.websiteUri = resolution.data.website;
      details.userRatingCount = resolution.data.reviewCount;
      details.displayName = resolution.data.displayName
        ? { text: resolution.data.displayName }
        : undefined;
      details.formattedAddress = resolution.data.formattedAddress;
      details.primaryTypeDisplayName = resolution.data.primaryType
        ? { text: resolution.data.primaryType }
        : undefined;
      details.identityConfidence =
        resolution.data.identityStatus === 'CONFIRMED' ? 'high' : 'ambiguous';
      details.identityStatus = resolution.data.identityStatus;
      details.mapsProvenance = resolution.provenance;
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
    const placeRecordPointer =
      typeof details.mapsUri === 'string'
        ? details.mapsUri
        : `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(resolvedPlaceId)}`;
    const findings = generateGbpFindings(analysis, placeRecordPointer, collectedAt);
    const photoAnalysisUnavailable =
      analysis.photos.totalCount > 0 &&
      (process.env.BEDROCK_ENABLED !== 'true' || !analysis.photos.aiAnalysis?.length);

    const evidenceSnapshot = {
      module: 'gbp_deep',
      source: input.placeData ? 'canonical_gbp_dependency' : 'serpapi_google_maps',
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
      data: {
        scores: {},
        coreWebVitals: undefined,
        finalUrl: undefined,
        schemaAnalysis: undefined,
        conversionAnalysis: undefined,
        placeId: resolvedPlaceId,
        placeData: details,
        identityConfidence: input.placeData?.identityConfidence ?? 'high',
        identityStatus: input.placeData?.identityStatus ?? 'CONFIRMED',
        mapsProvenance: input.placeData?.mapsProvenance ?? null,
        primaryType: analysis.primaryCategory,
        types: analysis.secondaryCategories,
        rating: analysis.reviews.rating,
        reviewCount: analysis.reviews.totalCount,
      },
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
  if (place.provider === 'serpapi_google_maps') return normalizePlaceToLegacy(place as any);
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
  if (photos.length > 0 && process.env.BEDROCK_ENABLED === 'true') {
    // Places photo media requires the secret-bearing media URL; it is not sent
    // through generic derived-URL fetches. Photo interpretation stays unavailable
    // until it can be fetched through an explicit credential-safe client path.
    photoAnalysis.aiAnalysis = [];
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
 * AI Photo Analysis with Amazon Bedrock
 */
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
          source: 'serpapi_google_maps',
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
          source: 'serpapi_google_maps',
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
          source: 'serpapi_google_maps',
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
          source: 'ai_photo_analysis',
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
          source: 'serpapi_google_maps',
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
          source: 'serpapi_google_maps',
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
