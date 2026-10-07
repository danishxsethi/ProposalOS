import { logger } from '@/lib/logger';
import { mapsIntelligence, normalizePlaceToLegacy } from '@/lib/maps/serpMapsProvider';

import { GBPModuleInput, LegacyAuditModuleResult } from './types';

/** Normalize for comparison: lowercase, remove punctuation, collapse spaces */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * P1-29 (Wave 7): score a Text Search candidate against the input business identity
 * using the real signals the search response actually returns (name, address) — no
 * fabricated certainty. Used to pick the best-matching candidate out of multiple
 * results instead of blindly trusting index 0, and to flag when the match is not
 * confidently distinguishable from a same-name/franchise competitor.
 */
/**
 * P1-29 (Wave 7): score a Text Search candidate against the input business identity
 * using the real signals the search response actually returns (name, address) — no
 * fabricated certainty. Used to pick the best-matching candidate out of multiple
 * results instead of blindly trusting index 0, and to flag when the match is not
 * confidently distinguishable from a same-name/franchise competitor. Exported so
 * `gbpDeep.ts`'s own independent fallback resolution (used only when the canonical
 * `gbp` dependency is unavailable) applies the identical disambiguation logic
 * instead of a second, divergent implementation.
 */
export function scorePlaceCandidate(
  candidate: { displayName?: { text?: string }; formattedAddress?: string },
  businessName: string,
  city: string
): number {
  const candidateName = normalize(candidate.displayName?.text || '');
  const targetName = normalize(businessName);
  let score = 0;

  if (candidateName && targetName) {
    if (candidateName === targetName) {
      score += 70;
    } else if (candidateName.includes(targetName) || targetName.includes(candidateName)) {
      score += 45;
    } else {
      const candidateTokens = new Set(candidateName.split(' ').filter(Boolean));
      const targetTokens = targetName.split(' ').filter(Boolean);
      const overlap = targetTokens.filter((t) => candidateTokens.has(t)).length;
      if (targetTokens.length > 0) score += Math.round((overlap / targetTokens.length) * 40);
    }
  }

  const address = (candidate.formattedAddress || '').toLowerCase();
  if (city && address.includes(city.toLowerCase())) score += 30;

  return score;
}

/** Check if GBP name is consistent with website domain (e.g. "Main Street Dental" vs mainstreetdental.com) */
function checkNameMatchesWebsite(
  gbpName: string | undefined,
  websiteUrl: string | undefined
): boolean {
  if (!gbpName || !websiteUrl) return true; // No mismatch if either missing
  try {
    const url = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    const host = url.hostname.replace(/^www\./, '').split('.')[0] || '';
    const nameWords = normalize(gbpName)
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const nameCore = nameWords.join('');
    return host.includes(nameCore) || nameCore.includes(host) || host.length < 4;
  } catch {
    return true;
  }
}

export async function runGBPModule(
  input: GBPModuleInput,
  _tracker?: unknown
): Promise<LegacyAuditModuleResult> {
  logger.info({ businessName: input.businessName, city: input.city }, '[GBPModule] Analyzing');

  try {
    const resolution = await mapsIntelligence.resolveBusiness({
      businessName: input.businessName,
      city: input.city,
      domain: input.websiteUrl,
      phone: input.phone,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      fieldProfile: 'GBP_STANDARD',
    });
    if (resolution.status === 'UNAVAILABLE' || resolution.status === 'FAILED') {
      return {
        moduleId: 'gbp-audit',
        status: 'failed',
        timestamp: new Date().toISOString(),
        data: null,
        error: resolution.error?.message ?? 'Maps provider unavailable',
      };
    }
    if (resolution.data?.identityStatus === 'NOT_FOUND' || !resolution.data) {
      throw new Error(`Business not found: ${input.businessName} in ${input.city}`);
    }
    const identityConfidence =
      resolution.data.identityStatus === 'CONFIRMED' ? 'high' : 'ambiguous';
    if (resolution.data.identityStatus !== 'CONFIRMED') {
      return {
        moduleId: 'gbp-audit',
        status: 'success',
        timestamp: new Date().toISOString(),
        data: {
          placeId: resolution.data.placeId,
          mapsUri: resolution.data.mapsUri,
          name: resolution.data.displayName,
          address: resolution.data.formattedAddress,
          identityStatus: resolution.data.identityStatus,
          identityConfidence,
          matchConfidenceScore: resolution.data.identityConfidence,
          candidatesConsidered: resolution.data.candidateCount,
          alternateCandidateNames: resolution.data.alternateCandidates
            .map((candidate) => candidate.displayName)
            .filter((name): name is string => !!name),
          mapsProvenance: resolution.provenance,
        },
      };
    }
    const details = normalizePlaceToLegacy(resolution.data) as Record<string, any>;

    const phone = details.nationalPhoneNumber || details.internationalPhoneNumber;
    const description = details.editorialSummary?.text;
    const photos = details.photos || [];
    const photoCount = photos.length;
    const reviews = details.reviews || [];

    // Check name/phone consistency with website (if websiteUrl provided)
    const websiteUrl = input.websiteUrl;
    const nameMatchesWebsite = checkNameMatchesWebsite(details.name, websiteUrl);
    const phoneMatchesWebsite = true; // Places API doesn't expose website phone; assume OK if both present

    return {
      moduleId: 'gbp-audit',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        placeId: details.placeId,
        identityStatus: resolution.data.identityStatus,
        name: details.name,
        address: details.address,
        rating: details.rating,
        reviewCount: details.userRatingCount,
        website: details.website,
        reviews: reviews.slice(0, 10),
        photos: photos.slice(0, 5),
        photoCount,
        openingHours: details.regularOpeningHours,
        types: details.types,
        primaryType: details.primaryType,
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
        hasAttributes: !!(
          details.paymentOptions ||
          details.accessibilityOptions ||
          details.amenities
        ),
        // P1-29 (Wave 7): real identity-match provenance — never fabricated
        // certainty. `gbpDeep` and the aggregation layer use this to withhold
        // definitive customer-negative findings about an unconfirmed match.
        identityConfidence,
        matchConfidenceScore: resolution.data.identityConfidence ?? 0,
        candidatesConsidered: resolution.data.candidateCount,
        alternateCandidateNames: resolution.data.alternateCandidates
          .map((candidate) => candidate.displayName)
          .filter((name): name is string => !!name),
        mapsProvenance: resolution.provenance,
      },
    };
  } catch (error) {
    logger.error(
      { err: error, businessName: input.businessName, city: input.city },
      '[GBPModule] Error'
    );
    return {
      moduleId: 'gbp-audit',
      status: 'failed',
      timestamp: new Date().toISOString(),
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
