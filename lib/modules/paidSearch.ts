import { z } from 'zod';

import { withModuleCache } from '@/lib/cache/moduleCache';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safeFetch } from '@/lib/security/safeFetch';

import { normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, createEvidence, Finding } from './types';

export interface PaidSearchModuleInput {
  url: string;
  businessName: string;
  businessType: string; // e.g., "plumber", "dentist"
  city: string;
}

interface AdPresence {
  status: 'observed' | 'not_observed' | 'unavailable';
  keyword: string;
  location: string;
  language: 'en';
  device: 'desktop';
  provider: 'SerpAPI';
  observedAt: string;
  businessIsAdvertising: boolean | null;
  businessAds: Array<{
    title: string;
    link: string;
    displayLink?: string;
    advertiserDomain: string;
  }>;
  competitorAds: Array<{
    title: string;
    link: string;
    displayLink?: string;
    advertiserDomain: string;
  }>;
  totalAds: number;
  reason?: string;
}

interface TrackingPixels {
  status: 'observed' | 'unavailable';
  observedAt: string;
  sourceUrl: string;
  hasGoogleAds: boolean;
  hasGA4: boolean;
  hasUniversalAnalytics: boolean;
  hasFacebookPixel: boolean;
  hasLinkedInInsight: boolean;
  detectedTags: string[];
}

interface PaidSearchAnalysis {
  primaryKeywordAds: AdPresence;
  businessNameAds: AdPresence;
  competitorsBiddingOnName: boolean;
  trackingPixels: TrackingPixels;
}

const SerpResponseSchema = z.object({
  ads: z
    .array(
      z.object({
        title: z.string().optional(),
        link: z.string().optional(),
        displayed_link: z.string().optional(),
      })
    )
    .default([]),
});

type SerpAd = z.infer<typeof SerpResponseSchema>['ads'][number];

function advertiserDomain(ad: SerpAd): string | null {
  if (!ad.link) return null;
  try {
    return new URL(ad.link).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function domainMatches(candidate: string, businessDomain: string): boolean {
  return candidate === businessDomain || candidate.endsWith(`.${businessDomain}`);
}

function unavailableObservation(keyword: string, location: string, reason: string): AdPresence {
  return {
    status: 'unavailable',
    keyword,
    location,
    language: 'en',
    device: 'desktop',
    provider: 'SerpAPI',
    observedAt: new Date().toISOString(),
    businessIsAdvertising: null,
    businessAds: [],
    competitorAds: [],
    totalAds: 0,
    reason,
  };
}

/**
 * Run paid search analysis module
 */
export async function runPaidSearchModule(
  input: PaidSearchModuleInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ businessName: input.businessName }, '[PaidSearch] Starting paid search analysis');

  try {
    const configured = Boolean(process.env.SERP_API_KEY);
    if (configured) tracker?.addApiCall('SERP');
    const primaryKeywordAds = await checkAds(input, `${input.businessType} ${input.city}`);
    if (configured) tracker?.addApiCall('SERP');
    const businessNameAds = await checkAds(input, input.businessName);
    const trackingPixels = await detectTrackingPixels(input.url);

    const analysis: PaidSearchAnalysis = {
      primaryKeywordAds,
      businessNameAds,
      competitorsBiddingOnName:
        businessNameAds.status !== 'unavailable' && businessNameAds.competitorAds.length > 0,
      trackingPixels,
    };

    const findings = generatePaidSearchFindings(analysis, input);

    const evidenceSnapshot = {
      module: 'paid_search',
      source: 'serp_api_analysis',
      rawResponse: analysis,
      collectedAt: new Date(),
    };

    logger.info(
      {
        businessName: input.businessName,
        isAdvertising: primaryKeywordAds.businessIsAdvertising,
        competitorsBiddingOnName: analysis.competitorsBiddingOnName,
        hasTracking: trackingPixels.hasGA4 || trackingPixels.hasGoogleAds,
        findingsCount: findings.length,
      },
      '[PaidSearch] Analysis complete'
    );

    return {
      findings,
      evidenceSnapshots: [evidenceSnapshot],
      execution: {
        state:
          primaryKeywordAds.status === 'unavailable' &&
          businessNameAds.status === 'unavailable' &&
          trackingPixels.status === 'unavailable'
            ? 'unavailable'
            : primaryKeywordAds.status === 'unavailable' ||
                businessNameAds.status === 'unavailable' ||
                trackingPixels.status === 'unavailable'
              ? 'partial'
              : 'complete',
        reason:
          primaryKeywordAds.reason ||
          businessNameAds.reason ||
          (trackingPixels.status === 'unavailable' ? 'Tracking-pixel scan unavailable' : undefined),
      },
    };
  } catch (error) {
    logger.error({ error, businessName: input.businessName }, '[PaidSearch] Analysis failed');

    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function checkAds(input: PaidSearchModuleInput, query: string): Promise<AdPresence> {
  const serpApiKey = process.env.SERP_API_KEY;
  if (!serpApiKey) {
    logger.warn({ query }, '[PaidSearch] No SerpAPI key, observation unavailable');
    return unavailableObservation(query, input.city, 'SerpAPI is not configured');
  }

  try {
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&location=${encodeURIComponent(input.city)}&hl=en&gl=us&google_domain=google.com&api_key=${serpApiKey}`;

    const data = await withModuleCache<unknown>(
      {
        module: 'paid_search',
        version: 2,
        input: { type: 'paid_search_snapshot', query, city: input.city },
      },
      { ttlSeconds: 6 * 60 * 60 },
      async () => {
        return withProviderResilience<unknown>(
          {
            provider: 'serpapi',
            operation: 'paidSearch:checkAds',
          },
          async () => {
            const res = await safeFetch(serpUrl);
            if (!res.ok) {
              const error = new Error(`HTTP error ${res.status}: ${res.statusText}`);
              (error as Error & { status: number }).status = res.status;
              throw error;
            }
            return await res.json();
          }
        );
      }
    );

    const parsed = SerpResponseSchema.parse(data);
    const businessDomain = new URL(input.url).hostname.toLowerCase().replace(/^www\./, '');
    const attributedAds = parsed.ads.flatMap((ad) => {
      const domain = advertiserDomain(ad);
      return domain && ad.link
        ? [
            {
              title: ad.title || domain,
              link: ad.link,
              displayLink: ad.displayed_link,
              advertiserDomain: domain,
            },
          ]
        : [];
    });
    const businessIsAdvertising = attributedAds.some((ad) =>
      domainMatches(ad.advertiserDomain, businessDomain)
    );
    const businessAds = attributedAds.filter((ad) =>
      domainMatches(ad.advertiserDomain, businessDomain)
    );
    const competitorAds = attributedAds.filter(
      (ad) => !domainMatches(ad.advertiserDomain, businessDomain)
    );
    const observedAt = new Date().toISOString();

    return {
      status: businessIsAdvertising ? 'observed' : 'not_observed',
      keyword: query,
      location: input.city,
      language: 'en',
      device: 'desktop',
      provider: 'SerpAPI',
      observedAt,
      businessIsAdvertising,
      businessAds,
      competitorAds,
      totalAds: parsed.ads.length,
    };
  } catch (error) {
    logger.warn({ error, query }, '[PaidSearch] Search snapshot unavailable');
    return unavailableObservation(
      query,
      input.city,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Detect tracking pixels on website
 */
async function detectTrackingPixels(url: string): Promise<TrackingPixels> {
  const observedAt = new Date().toISOString();
  try {
    logger.info({ url }, '[PaidSearch] Detecting tracking pixels');

    const html = await withProviderResilience<string>(
      {
        provider: 'crawler',
        operation: 'paidSearch:detectTrackingPixels',
      },
      async () => {
        const response = await safeFetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOSBot/1.0)' },
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        return await response.text();
      }
    );

    const detectedTags: string[] = [];

    // Google Ads conversion tag (gtag with AW-)
    const hasGoogleAds = /gtag\s*\(\s*['"]config['"],\s*['"]AW-/.test(html);
    if (hasGoogleAds) {
      detectedTags.push('Google Ads Conversion');
    }

    // Google Analytics 4 (gtag with G-)
    const hasGA4 =
      /gtag\s*\(\s*['"]config['"],\s*['"]G-/.test(html) ||
      /googletagmanager\.com\/gtag\/js\?id=G-/.test(html);
    if (hasGA4) {
      detectedTags.push('Google Analytics 4');
    }

    // Universal Analytics (ga with UA-)
    const hasUniversalAnalytics =
      /ga\s*\(\s*['"]create['"],\s*['"]UA-/.test(html) ||
      /google-analytics\.com\/analytics\.js/.test(html);
    if (hasUniversalAnalytics) {
      detectedTags.push('Universal Analytics (legacy)');
    }

    // Facebook Pixel
    const hasFacebookPixel =
      /connect\.facebook\.net\/en_US\/fbevents\.js/.test(html) ||
      /fbq\s*\(\s*['"]init['"]/.test(html);
    if (hasFacebookPixel) {
      detectedTags.push('Facebook Pixel');
    }

    // LinkedIn Insight Tag
    const hasLinkedInInsight =
      /snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/.test(html) ||
      /_linkedin_partner_id/.test(html);
    if (hasLinkedInInsight) {
      detectedTags.push('LinkedIn Insight');
    }

    return {
      status: 'observed',
      observedAt,
      sourceUrl: url,
      hasGoogleAds,
      hasGA4,
      hasUniversalAnalytics,
      hasFacebookPixel,
      hasLinkedInInsight,
      detectedTags,
    };
  } catch (error) {
    logger.warn({ error, url }, '[PaidSearch] Pixel detection failed');
    return {
      status: 'unavailable',
      observedAt,
      sourceUrl: url,
      hasGoogleAds: false,
      hasGA4: false,
      hasUniversalAnalytics: false,
      hasFacebookPixel: false,
      hasLinkedInInsight: false,
      detectedTags: [],
    };
  }
}

/**
 * Generate findings from paid search analysis
 */
function generatePaidSearchFindings(
  analysis: PaidSearchAnalysis,
  input: PaidSearchModuleInput
): Finding[] {
  const findings: Finding[] = [];
  const observationEvidence = (
    observation: AdPresence,
    value: string | number,
    label: string,
    pointer = 'https://serpapi.com/search.json'
  ) =>
    createEvidence({
      pointer,
      source: 'serpapi_paid_search',
      collected_at: observation.observedAt,
      type: typeof value === 'number' ? 'metric' : 'text',
      value,
      label,
      raw: {
        query: observation.keyword,
        location: observation.location,
        language: observation.language,
        device: observation.device,
        provider: observation.provider,
        resultScope: 'single bounded search snapshot',
      },
    });

  if (analysis.competitorsBiddingOnName && analysis.businessNameAds.competitorAds.length > 0) {
    const topCompetitors = analysis.businessNameAds.competitorAds.slice(0, 3);

    findings.push({
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'Competitor Ads Observed in Business-Name Search Sample',
      description: `${analysis.businessNameAds.competitorAds.length} ad(s) from validated non-business domains were observed in the bounded SerpAPI snapshot for "${input.businessName}" in ${input.city}. This sample does not establish continuous bidding, campaign scope, or impression share.`,
      impactScore: 6,
      confidenceScore: normalizeConfidence(85, '0-100'),
      evidence: topCompetitors.map((ad) =>
        observationEvidence(
          analysis.businessNameAds,
          `${ad.title} - ${ad.advertiserDomain}`,
          'Observed advertiser',
          ad.link
        )
      ),
      metrics: {
        competitorAdsOnName: analysis.businessNameAds.competitorAds.length,
        competitorAds: topCompetitors,
      },
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Review a broader set of time-, device-, and location-bounded samples before changing campaign strategy',
        'Consider whether brand-search coverage fits the approved marketing plan',
      ],
    });
  }

  if (analysis.primaryKeywordAds.status === 'not_observed') {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'No Business Ad Observed in Paid Search Sample',
      description: `No ad attributable to ${input.businessName}'s validated domain was observed in the bounded SerpAPI snapshot for "${analysis.primaryKeywordAds.keyword}" in ${input.city}. This does not prove the business runs no search, Local Services, shopping, maps, display, social, or remarketing campaigns.`,
      impactScore: analysis.primaryKeywordAds.totalAds > 0 ? 4 : 1,
      confidenceScore: normalizeConfidence(80, '0-100'),
      evidence: [
        observationEvidence(
          analysis.primaryKeywordAds,
          analysis.primaryKeywordAds.totalAds,
          'Ads in bounded snapshot'
        ),
      ],
      metrics: {
        keyword: analysis.primaryKeywordAds.keyword,
        competitorAdCount: analysis.primaryKeywordAds.totalAds,
      },
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Confirm current campaign activity in the business advertising accounts',
        'Use additional bounded queries and times before making a paid-search recommendation',
      ],
    });
  }

  if (
    analysis.trackingPixels.status === 'observed' &&
    !analysis.trackingPixels.hasGA4 &&
    !analysis.trackingPixels.hasUniversalAnalytics
  ) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Google Analytics Tag Not Observed in HTML Sample',
      description:
        'No GA4 or Universal Analytics tag pattern was observed in the fetched HTML sample. Tags loaded later, through a consent flow, or through an unrecognized container may not appear in this check.',
      impactScore: 4,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: analysis.trackingPixels.sourceUrl,
          source: 'paid_search_pixel_scan',
          collected_at: analysis.trackingPixels.observedAt,
          type: 'text',
          value: 'No GA4 or Universal Analytics tag pattern observed',
          label: 'HTML tag scan',
        }),
      ],
      metrics: {
        hasGA4: false,
        hasUniversalAnalytics: false,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Confirm analytics configuration in the site tag manager and analytics account',
        'Install or repair analytics only if account-level review confirms it is absent',
      ],
    });
  }

  if (analysis.trackingPixels.status === 'observed' && !analysis.trackingPixels.hasFacebookPixel) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Meta Pixel Tag Not Observed in HTML Sample',
      description:
        'No Meta Pixel tag pattern was observed in the fetched HTML sample. A tag loaded later, through consent, or through an unrecognized container may not appear in this check.',
      impactScore: 2,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: analysis.trackingPixels.sourceUrl,
          source: 'paid_search_pixel_scan',
          collected_at: analysis.trackingPixels.observedAt,
          type: 'text',
          value: 'No Meta Pixel tag pattern observed',
          label: 'HTML tag scan',
        }),
      ],
      metrics: {
        hasFacebookPixel: false,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Confirm Meta advertising and tag-manager configuration before deciding whether a pixel is needed',
      ],
    });
  }

  if (analysis.primaryKeywordAds.status === 'observed') {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Paid Search Ad Observed in Bounded Sample',
      description: `An ad attributable to ${input.businessName}'s validated domain was observed in the bounded SerpAPI snapshot for "${analysis.primaryKeywordAds.keyword}" in ${input.city}. This observation does not establish campaign duration, spend, or full channel coverage.`,
      impactScore: 2,
      confidenceScore: normalizeConfidence(85, '0-100'),
      evidence: analysis.primaryKeywordAds.businessAds.map((ad) =>
        observationEvidence(
          analysis.primaryKeywordAds,
          `${ad.title} - ${ad.advertiserDomain}`,
          'Observed business ad',
          ad.link
        )
      ),
      metrics: {
        isAdvertising: true,
        keyword: analysis.primaryKeywordAds.keyword,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Audit existing Google Ads campaign for optimization',
        'Check Quality Score and CTR',
        'Ensure ad extensions are enabled',
        'Review negative keywords list',
        'Test ad copy variations',
      ],
    });
  }

  if (analysis.trackingPixels.status === 'observed' && analysis.trackingPixels.hasGA4) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Google Analytics 4 Installed',
      description:
        'A GA4 tag pattern was observed in the fetched HTML sample. This scan does not verify account ownership, event configuration, consent behavior, or successful data collection.',
      impactScore: 2,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: analysis.trackingPixels.sourceUrl,
          source: 'paid_search_pixel_scan',
          collected_at: analysis.trackingPixels.observedAt,
          type: 'text',
          value: 'GA4 tag pattern observed',
          label: 'HTML tag scan',
        }),
      ],
      metrics: {
        hasGA4: true,
        detectedTags: analysis.trackingPixels.detectedTags,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Verify GA4 is collecting data correctly',
        'Set up conversion events (form submissions, calls)',
        'Configure enhanced measurement',
        'Link to Google Ads if running campaigns',
      ],
    });
  }

  return findings;
}
