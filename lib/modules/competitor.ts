import { withModuleCache } from '@/lib/cache/moduleCache';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { mapsIntelligence, normalizePlaceToLegacy } from '@/lib/maps/serpMapsProvider';
import { getLocalLighthouseReport } from '@/lib/performance/localLighthouse';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';

import {
  ComparisonGap,
  CompetitorComparisonMatrix,
  CompetitorModuleInput,
  LegacyAuditModuleResult,
  MatchedBusinessData,
} from './types';

const SERP_API_BASE = 'https://serpapi.com/search';

/** SerpAPI google_local puts the site under `links.website` (with GBP UTM params). */
function serpWebsite(
  r: { website?: string; links?: { website?: string } } | null | undefined
): string | undefined {
  const raw = r?.links?.website ?? r?.website;
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\?$/, '');
  } catch {
    return raw;
  }
}

/** Only Places API (New) resource ids (ChIJ…/Eh…) can be fetched via places/{id}; SerpAPI's numeric CID cannot. */
function placesApiId(id: unknown): string | undefined {
  return typeof id === 'string' && /^[A-Za-z]/.test(id) ? id : undefined;
}

export async function runCompetitorModule(
  input: CompetitorModuleInput,
  tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
  logger.info({ keyword: input.keyword, location: input.location }, '[CompetitorModule] Searching');

  if (!process.env.SERP_API_KEY) {
    return {
      moduleId: 'competitor-audit',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        competitorSearchStatus: 'not_configured',
        execution: {
          state: 'unavailable',
          reason: 'Competitor provider is not configured (SERP_API_KEY)',
        },
      },
    };
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

    const response = await withModuleCache<any>(
      {
        module: 'competitor',
        version: 1,
        input: { type: 'local_search', keyword: input.keyword, location: input.location },
      },
      { ttlSeconds: 24 * 3600 },
      async () => {
        const p = new URLSearchParams(params);
        return withProviderResilience<any>(
          {
            provider: 'serpapi',
            operation: 'competitor:top_competitors_search',
            degrade: true,
            fallbackValue: { local_results: [] },
          },
          async () => {
            const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
            if (!res.ok) {
              throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
            }
            return await res.json();
          }
        );
      }
    );

    const data = response;

    if (data.error) {
      throw new Error(`SerpAPI Error: ${data.error}`);
    }

    const localResults = data.local_results || [];
    const topCompetitors = localResults.slice(0, 3); // Top 3

    // Helper to fetch Place Details
    /**
     * SerpAPI's local pack frequently omits competitor websites (measured: zero
     * of four law firms carried `links.website`). Resolve the website via our
     * own Places text search by name + location (COMPETITOR profile, 1 call,
     * cached 24h) so competitorStrategy can actually run.
     */
    const resolveWebsiteByName = async (name: string): Promise<string | undefined> => {
      try {
        const res = await withModuleCache<string | undefined>(
          {
            module: 'competitor',
            version: 1,
            input: { type: 'website_by_name', name, location: input.location },
          },
          { ttlSeconds: 24 * 3600 },
          async () => {
            const found = await mapsIntelligence.searchText({
              query: `${name} ${input.location}`,
              city: input.location,
              maxResults: 3,
              fieldProfile: 'COMPETITOR',
            });
            if (found.status !== 'COMPLETE' || !found.data?.length) return undefined;
            const norm = (s: string) =>
              s
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
            const want = norm(name);
            const match = found.data.find(
              (c) =>
                c.displayName &&
                (norm(c.displayName) === want ||
                  norm(c.displayName).includes(want) ||
                  want.includes(norm(c.displayName)))
            );
            return (match ?? found.data[0])?.website ?? undefined;
          }
        );
        return res;
      } catch {
        return undefined;
      }
    };

    const fetchPlaceDetails = async (placeId: string, name: string): Promise<any> => {
      try {
        const result = await mapsIntelligence.getPlace(placeId, 'COMPETITOR');
        if (result.status !== 'COMPLETE' || !result.data) return null;
        return normalizePlaceToLegacy(result.data);
      } catch (e) {
        logger.warn({ businessName: name }, 'Failed to fetch place details');
        return null;
      }
    };

    /** Lightweight local Lighthouse audit — performance, SEO, accessibility, load time (mobile) */
    const runLightweightPageSpeed = async (
      url: string
    ): Promise<{
      performanceScore: number;
      seoScore: number;
      accessibilityScore: number;
      mobileScore: number;
      loadTimeSeconds: number;
    }> => {
      const empty = {
        performanceScore: 0,
        seoScore: 0,
        accessibilityScore: 0,
        mobileScore: 0,
        loadTimeSeconds: 0,
      };
      if (!url) return empty;
      try {
        tracker?.addApiCall('LIGHTHOUSE');
        const lighthouse = await withModuleCache<any>(
          {
            module: 'competitor',
            version: 2,
            input: { type: 'local_lighthouse_mobile', url },
          },
          { ttlSeconds: 24 * 3600 },
          () => getLocalLighthouseReport(url, 'mobile')
        );

        const audits = lighthouse?.audits ?? {};
        const perf = (lighthouse?.categories?.performance?.score ?? 0) * 100;
        const seo = (lighthouse?.categories?.seo?.score ?? 0) * 100;
        const a11y = (lighthouse?.categories?.accessibility?.score ?? 0) * 100;
        const fcpMs =
          audits['first-contentful-paint']?.numericValue ??
          audits['largest-contentful-paint']?.numericValue ??
          0;
        const loadTimeSeconds = fcpMs ? fcpMs / 1000 : 0;

        return {
          performanceScore: Math.round(perf),
          seoScore: Math.round(seo),
          accessibilityScore: Math.round(a11y),
          mobileScore: Math.round(perf),
          loadTimeSeconds: Math.round(loadTimeSeconds * 10) / 10,
        };
      } catch (e) {
        logger.warn({ url }, 'Failed to run local Lighthouse');
        return empty;
      }
    };

    // 2. Fetch Subject Business Data (Comparison Target)

    // 1. Find SELF and Category
    const selfParams: Record<string, string> = {
      engine: 'google_local',
      q: input.keyword,
      location: input.location,
      api_key: process.env.SERP_API_KEY,
    };

    const selfData = await withModuleCache<any>(
      {
        module: 'competitor',
        version: 1,
        input: { type: 'local_self_search', keyword: input.keyword, location: input.location },
      },
      { ttlSeconds: 24 * 3600 },
      async () => {
        const p = new URLSearchParams(selfParams);
        return withProviderResilience<any>(
          {
            provider: 'serpapi',
            operation: 'competitor:local_self_search',
            degrade: true,
            fallbackValue: { local_results: [] },
          },
          async () => {
            const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
            if (!res.ok) {
              throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
            }
            return await res.json();
          }
        );
      }
    );

    const selfResult = selfData.local_results?.[0]; // Best match

    if (!selfResult) {
      throw new Error('Could not find business to identify category');
    }

    const category = selfResult.type;
    const businessName = input.keyword;

    // Fetch self details + local Lighthouse. Start it now and await it with the competitor runs
    // calls below so the module wall is max() of the calls, not their sum.
    let selfDetails = null;
    const selfPlacesId = placesApiId(selfResult.place_id);
    if (selfPlacesId) {
      selfDetails = await fetchPlaceDetails(selfPlacesId, businessName);
    }
    const selfWebsite = selfDetails?.websiteUri || serpWebsite(selfResult);
    const selfPsiPromise = runLightweightPageSpeed(selfWebsite || '');

    // 2. Find COMPETITORS (if category found) - SECOND PASS
    let competitors: MatchedBusinessData[] = [];
    // P2-46: distinguishes "the competitor SERP search actually ran and found zero
    // local competitors" from "the SERP call failed/degraded and we never really
    // checked" — collapsing these let a provider failure masquerade as the
    // customer-negative "not appearing in local search" finding below.
    let competitorSearchStatus: 'checked' | 'not_checked' = 'not_checked';
    if (category) {
      tracker?.addApiCall('SERP_API');
      const compParams: Record<string, string> = {
        engine: 'google_local',
        q: `${category} in ${input.location}`,
        location: input.location,
        api_key: process.env.SERP_API_KEY,
      };

      let compData: any;
      try {
        compData = await withModuleCache<any>(
          {
            module: 'competitor',
            version: 1,
            input: { type: 'local_competitors_search', category, location: input.location },
          },
          { ttlSeconds: 24 * 3600 },
          async () => {
            const p = new URLSearchParams(compParams);
            // No `degrade`/`fallbackValue` here: a real failure must surface as a
            // caught error below (competitorSearchStatus stays 'not_checked'),
            // never silently become `{ local_results: [] }` — which would be
            // indistinguishable from a genuine zero-competitor SERP result.
            return withProviderResilience<any>(
              {
                provider: 'serpapi',
                operation: 'competitor:local_competitors_search',
              },
              async () => {
                const res = await fetch(`${SERP_API_BASE}?${p.toString()}`);
                if (!res.ok) {
                  throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
                }
                return await res.json();
              }
            );
          }
        );
        competitorSearchStatus = 'checked';
      } catch (searchError) {
        logger.warn(
          { error: searchError, category, location: input.location },
          '[CompetitorModule] Competitor SERP search failed — reporting as not_checked, not zero'
        );
        compData = { local_results: [] };
      }

      // Filter out self
      const rawCompetitors = (compData.local_results || [])
        .filter((r: any) => r.place_id !== selfResult.place_id && r.title !== selfResult.title)
        .slice(0, 3);

      // Fetch details + lightweight PageSpeed for competitors
      competitors = await Promise.all(
        rawCompetitors.map(async (comp: any) => {
          let d = null;
          const compPlacesId = placesApiId(comp.place_id);
          if (compPlacesId) d = await fetchPlaceDetails(compPlacesId, comp.title);

          const w = d?.websiteUri || serpWebsite(comp) || (await resolveWebsiteByName(comp.title));
          const psi = await runLightweightPageSpeed(w || '');

          return {
            name: comp.title,
            rating: d?.rating || comp.rating || 0,
            reviewCount: d?.userRatingCount || comp.reviews || 0,
            website: w,
            websiteSpeed: psi.performanceScore,
            photosCount: d?.photos ? d.photos.length : 0,
            hasHours: !!d?.regularOpeningHours,
            inLocalPack: true,
            placeId: comp.place_id,
            category: d?.primaryTypeDisplayName?.text || comp.type,
            performanceScore: psi.performanceScore,
            seoScore: psi.seoScore,
            accessibilityScore: psi.accessibilityScore,
            mobileScore: psi.mobileScore,
            loadTimeSeconds: psi.loadTimeSeconds,
          };
        })
      );
    }

    const selfPsi = await selfPsiPromise;
    const selfDataStruct: MatchedBusinessData = {
      name: selfResult.title,
      rating: selfDetails?.rating || selfResult.rating || 0,
      reviewCount: selfDetails?.userRatingCount || selfResult.reviews || 0,
      website: selfWebsite,
      websiteSpeed: selfPsi.performanceScore,
      photosCount: selfDetails?.photos ? selfDetails.photos.length : 0,
      hasHours: !!selfDetails?.regularOpeningHours,
      inLocalPack: true,
      placeId: selfResult.place_id,
      category: selfDetails?.primaryTypeDisplayName?.text || category,
      performanceScore: selfPsi.performanceScore,
      seoScore: selfPsi.seoScore,
      accessibilityScore: selfPsi.accessibilityScore,
      mobileScore: selfPsi.mobileScore,
      loadTimeSeconds: selfPsi.loadTimeSeconds,
    };

    // 3. Calculate Gaps
    const gaps: ComparisonGap[] = [];

    if (competitors.length > 0) {
      // Reviews
      const avgReviews =
        competitors.reduce((sum, c) => sum + c.reviewCount, 0) / competitors.length;
      const reviewGap = selfDataStruct.reviewCount - avgReviews;
      gaps.push({
        metric: 'reviews',
        businessValue: selfDataStruct.reviewCount,
        competitorAvg: Math.round(avgReviews),
        gap: Math.round(reviewGap),
      });

      // Rating
      const avgRating = competitors.reduce((sum, c) => sum + c.rating, 0) / competitors.length;
      const ratingGap = selfDataStruct.rating - avgRating;
      gaps.push({
        metric: 'rating',
        businessValue: selfDataStruct.rating,
        competitorAvg: Number(avgRating.toFixed(1)),
        gap: Number(ratingGap.toFixed(1)),
      });

      // Speed
      const avgSpeed =
        competitors.reduce((sum, c) => sum + (c.websiteSpeed || 0), 0) / competitors.length;
      const speedGap = (selfDataStruct.websiteSpeed || 0) - avgSpeed;
      gaps.push({
        metric: 'speed',
        businessValue: selfDataStruct.websiteSpeed || 0,
        competitorAvg: Math.round(avgSpeed),
        gap: Math.round(speedGap),
      });

      // Photos
      const avgPhotos =
        competitors.reduce((sum, c) => sum + (c.photosCount || 0), 0) / competitors.length;
      const photoGap = (selfDataStruct.photosCount || 0) - avgPhotos;
      gaps.push({
        metric: 'photos',
        businessValue: selfDataStruct.photosCount || 0,
        competitorAvg: Math.round(avgPhotos),
        gap: Math.round(photoGap),
      });
    }

    const matrix: CompetitorComparisonMatrix = {
      business: selfDataStruct,
      competitors,
      gaps,
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
        // P2-46: 'not_checked' means the SERP call for competitors failed/degraded
        // — downstream Finding generation must not treat this the same as a real
        // zero-result search.
        competitorSearchStatus,
        topCompetitors: competitors.map((c) => ({
          name: c.name,
          rating: c.rating,
          reviews: c.reviewCount,
          website: c.website,
          category: c.category,
          performanceScore: c.performanceScore,
          seoScore: c.seoScore,
          accessibilityScore: c.accessibilityScore,
          mobileScore: c.mobileScore,
          loadTimeSeconds: c.loadTimeSeconds,
          websiteSpeed: c.websiteSpeed,
          photosCount: c.photosCount,
          hasHours: c.hasHours,
        })),
        comparisonMatrix: matrix,
      },
    };
  } catch (error) {
    logger.error({ error }, '[CompetitorModule] Error');
    return {
      moduleId: 'competitor-audit',
      status: 'failed',
      timestamp: new Date().toISOString(),
      costCents: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
