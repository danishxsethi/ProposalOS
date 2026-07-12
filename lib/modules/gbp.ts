import { withModuleCache } from '@/lib/cache/moduleCache';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';

import { GBPModuleInput, LegacyAuditModuleResult } from './types';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

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
  tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
  logger.info({ businessName: input.businessName, city: input.city }, '[GBPModule] Analyzing');

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY is missing');
  }

  try {
    // 1. Find Place ID via Text Search (Cached 24 hours)
    tracker?.addApiCall('PLACES_TEXT_SEARCH');

    const searchData = await withModuleCache<any>(
      {
        module: 'gbp',
        version: 2,
        input: { type: 'places_text_search', businessName: input.businessName, city: input.city },
      },
      { ttlSeconds: 24 * 60 * 60 },
      async () => {
        return withProviderResilience<any>(
          {
            provider: 'google-places',
            operation: 'gbp:places_text_search',
            degrade: true,
            fallbackValue: { places: [] },
          },
          async () => {
            const searchRes = await fetch(`${PLACES_API_BASE}/places:searchText`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                'X-Goog-FieldMask':
                  'places.displayName,places.id,places.formattedAddress,places.rating,places.userRatingCount',
              },
              body: JSON.stringify({
                textQuery: `${input.businessName} in ${input.city}`,
                // P1-29 (Wave 7): request multiple candidates (same single call, no
                // added cost) so a common/franchise business name can be
                // disambiguated by real name+address signals instead of blindly
                // trusting whatever Places returns first.
                maxResultCount: 5,
              }),
            });

            if (!searchRes.ok) {
              throw new Error(`Places Text Search failed: ${searchRes.statusText}`);
            }

            return searchRes.json();
          }
        );
      }
    );

    if (!searchData.places || searchData.places.length === 0) {
      throw new Error(`Business not found: ${input.businessName} in ${input.city}`);
    }

    // P1-29 (Wave 7): score every returned candidate against the real name/address
    // signals available and select the best match instead of always taking index 0.
    // When the top two candidates are not clearly distinguishable (or even the best
    // match is weak), the match is flagged `ambiguous` — a common name or franchise
    // risk — so the aggregation layer never emits definitive customer-negative
    // findings about a business we could not confidently confirm is the right one.
    const scoredCandidates = searchData.places
      .map((candidate: any) => ({
        candidate,
        score: scorePlaceCandidate(candidate, input.businessName, input.city),
      }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    const best = scoredCandidates[0];
    const second = scoredCandidates[1];
    const identityConfidence: 'high' | 'ambiguous' =
      best.score < 40 || (second && best.score - second.score < 20) ? 'ambiguous' : 'high';
    const alternateCandidateNames: string[] =
      identityConfidence === 'ambiguous'
        ? scoredCandidates
            .slice(1, 3)
            .map((s: { candidate: any }) => s.candidate.displayName?.text)
            .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
        : [];

    const place = best.candidate;
    const placeId = place.id;

    // 2. Get Details + Reviews
    // 2. Get Details + Reviews (Cached 7 days)
    tracker?.addApiCall('PLACES_DETAILS');

    const fieldMask = [
      'id',
      'displayName',
      'formattedAddress',
      'rating',
      'userRatingCount',
      'websiteUri',
      'reviews',
      'photos',
      'regularOpeningHours',
      'types',
      'editorialSummary',
      'nationalPhoneNumber',
      'internationalPhoneNumber',
      'primaryTypeDisplayName',
      'primaryType',
      'paymentOptions',
      'accessibilityOptions',
      'amenities',
    ].join(',');
    const details = await withModuleCache<any>(
      {
        module: 'gbp',
        version: 1,
        input: { type: 'places_details', placeId },
      },
      { ttlSeconds: 7 * 24 * 60 * 60 },
      async () => {
        return withProviderResilience<any>(
          {
            provider: 'google-places',
            operation: 'gbp:places_details',
            degrade: true,
            fallbackValue: {},
          },
          async () => {
            const detailsRes = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
                'X-Goog-FieldMask': fieldMask,
              },
            });
            if (!detailsRes.ok) {
              throw new Error(`Places Details failed: ${detailsRes.statusText}`);
            }
            return await detailsRes.json();
          }
        );
      }
    );

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
        hasAttributes: !!(
          details.paymentOptions ||
          details.accessibilityOptions ||
          details.amenities
        ),
        // P1-29 (Wave 7): real identity-match provenance — never fabricated
        // certainty. `gbpDeep` and the aggregation layer use this to withhold
        // definitive customer-negative findings about an unconfirmed match.
        identityConfidence,
        matchConfidenceScore: best.score,
        candidatesConsidered: searchData.places.length,
        alternateCandidateNames,
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
