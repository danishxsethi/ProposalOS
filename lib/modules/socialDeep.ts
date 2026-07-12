import { z } from 'zod';

import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safeFetch } from '@/lib/security/safeFetch';

import { normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, createEvidence, Finding } from './types';

const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'] as const;
type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
type ProfileStatus = 'verified' | 'likely' | 'ambiguous' | 'absent' | 'inaccessible' | 'failed';

const PLATFORM_HOSTS: Record<SocialPlatform, string[]> = {
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com'],
  tiktok: ['tiktok.com'],
};

const REJECTED_PATH_PARTS: Record<SocialPlatform, string[]> = {
  facebook: ['/share', '/sharer', '/dialog/', '/plugins/', '/watch', '/reel/'],
  instagram: ['/p/', '/reel/', '/tv/', '/stories/'],
  linkedin: ['/sharing/', '/sharearticle', '/feed/update/', '/posts/', '/pulse/'],
  youtube: ['/watch', '/shorts/', '/embed/', '/results', '/playlist'],
  tiktok: ['/video/', '/embed/', '/share/'],
};

const SerpResponseSchema = z.object({
  organic_results: z
    .array(
      z.object({
        link: z.string().url(),
        title: z.string().optional().default(''),
        snippet: z.string().optional().default(''),
      })
    )
    .optional()
    .default([]),
});

export interface SocialDeepModuleInput {
  websiteUrl: string;
  businessName: string;
  city: string;
  industry: string;
  discoveredUrls?: { platform: string; url: string }[];
  websiteDiscoverySucceeded?: boolean;
  signal?: AbortSignal;
}

export interface SocialProfileObservation {
  platform: SocialPlatform;
  url: string;
  status: ProfileStatus;
  confidence: number;
  source: 'website' | 'serpapi';
  hasWebsiteLink?: boolean;
  reason?: string;
}

interface DiscoveryResult {
  profiles: Array<{
    platform: SocialPlatform;
    url: string;
    source: 'website' | 'serpapi';
    confidence: number;
  }>;
  checkedPlatforms: SocialPlatform[];
  absentPlatforms: SocialPlatform[];
  unavailablePlatforms: SocialPlatform[];
  evidencePointers: Partial<Record<SocialPlatform, string>>;
}

export function validateSocialProfileUrl(
  platform: string,
  candidate: string
): { ok: true; platform: SocialPlatform; url: string } | { ok: false; reason: string } {
  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return { ok: false, reason: 'unsupported platform' };
  }

  try {
    const parsed = new URL(candidate);
    const normalizedPlatform = platform as SocialPlatform;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const hostMatches = PLATFORM_HOSTS[normalizedPlatform].some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
    if (!hostMatches) return { ok: false, reason: 'platform host mismatch' };

    const path = parsed.pathname.toLowerCase();
    if (
      path === '/' ||
      REJECTED_PATH_PARTS[normalizedPlatform].some((part) => path.includes(part))
    ) {
      return { ok: false, reason: 'not a business profile URL' };
    }

    parsed.hash = '';
    parsed.search = '';
    return { ok: true, platform: normalizedPlatform, url: parsed.toString() };
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
}

export async function runSocialDeepModule(
  input: SocialDeepModuleInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ business: input.businessName }, '[SocialDeep] Starting deep social analysis');

  try {
    const discovery = await discoverProfiles(input, tracker);
    const observations: SocialProfileObservation[] = [];

    for (const profile of discovery.profiles.slice(0, SOCIAL_PLATFORMS.length)) {
      observations.push(await analyzeProfile(profile, input, tracker));
    }

    const findings = generateFindings(input, discovery, observations);
    const hasVerified = observations.some((profile) => profile.status === 'verified');
    const hasIncomplete =
      discovery.unavailablePlatforms.length > 0 ||
      observations.some((profile) =>
        ['likely', 'ambiguous', 'inaccessible', 'failed'].includes(profile.status)
      );
    const noProviderAndNoProfiles =
      discovery.profiles.length === 0 &&
      discovery.checkedPlatforms.length === 0 &&
      discovery.absentPlatforms.length === 0;

    return {
      findings,
      evidenceSnapshots: [
        {
          module: 'social_deep',
          source: 'website_and_social_profile_checks',
          rawResponse: { discovery, observations },
          collectedAt: new Date(),
        },
      ],
      execution: noProviderAndNoProfiles
        ? {
            state: 'unavailable',
            reason: 'No validated website profiles and SERP_API_KEY is not configured',
          }
        : hasIncomplete ||
            (!hasVerified && discovery.absentPlatforms.length < SOCIAL_PLATFORMS.length)
          ? { state: 'partial', reason: 'Some platform checks or profile metrics were unavailable' }
          : { state: 'complete' },
    };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    logger.error({ error, business: input.businessName }, '[SocialDeep] Analysis failed');
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'Social profile analysis failed',
      },
    };
  }
}

async function discoverProfiles(
  input: SocialDeepModuleInput,
  tracker?: CostTracker
): Promise<DiscoveryResult> {
  const profiles: DiscoveryResult['profiles'] = [];
  const checkedPlatforms: SocialPlatform[] = [];
  const absentPlatforms: SocialPlatform[] = [];
  const unavailablePlatforms: SocialPlatform[] = [];
  const evidencePointers: DiscoveryResult['evidencePointers'] = {};
  const seen = new Set<SocialPlatform>();

  for (const candidate of input.discoveredUrls || []) {
    const validated = validateSocialProfileUrl(candidate.platform, candidate.url);
    if (!validated.ok || seen.has(validated.platform)) continue;
    seen.add(validated.platform);
    profiles.push({
      platform: validated.platform,
      url: validated.url,
      source: 'website',
      confidence: 1,
    });
  }

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    unavailablePlatforms.push(...SOCIAL_PLATFORMS.filter((platform) => !seen.has(platform)));
    return { profiles, checkedPlatforms, absentPlatforms, unavailablePlatforms, evidencePointers };
  }

  for (const platform of SOCIAL_PLATFORMS.filter((item) => !seen.has(item))) {
    const query = `site:${PLATFORM_HOSTS[platform][0]} "${input.businessName}" "${input.city}"`;
    const pointer = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=5`;
    evidencePointers[platform] = pointer;

    try {
      const raw = await withProviderResilience<unknown>(
        {
          provider: 'serpapi',
          operation: `social_deep:discover:${platform}`,
          signal: input.signal,
          degrade: false,
          policy: { timeoutMs: 8000, maxAttempts: 2 },
        },
        async ({ signal }) => {
          tracker?.addApiCall('SERP');
          const response = await fetch(`${pointer}&api_key=${apiKey}`, { signal });
          if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);
          return response.json();
        }
      );
      const parsed = SerpResponseSchema.parse(raw);
      checkedPlatforms.push(platform);
      const candidate = parsed.organic_results
        .map((result) => {
          const validated = validateSocialProfileUrl(platform, result.link);
          if (!validated.ok) return null;
          const confidence = identityConfidence(
            `${result.title} ${result.snippet}`,
            input.businessName,
            input.city
          );
          return { validated, confidence };
        })
        .filter(
          (
            item
          ): item is {
            validated: { ok: true; platform: SocialPlatform; url: string };
            confidence: number;
          } => item !== null
        )
        .sort((a, b) => b.confidence - a.confidence)[0];

      if (!candidate) {
        absentPlatforms.push(platform);
      } else {
        profiles.push({
          platform,
          url: candidate.validated.url,
          source: 'serpapi',
          confidence: candidate.confidence,
        });
      }
    } catch (error) {
      if (input.signal?.aborted) throw input.signal.reason ?? error;
      unavailablePlatforms.push(platform);
      logger.warn({ platform, error }, '[SocialDeep] Platform discovery unavailable');
    }
  }

  return { profiles, checkedPlatforms, absentPlatforms, unavailablePlatforms, evidencePointers };
}

async function analyzeProfile(
  profile: DiscoveryResult['profiles'][number],
  input: SocialDeepModuleInput,
  _tracker?: CostTracker
): Promise<SocialProfileObservation> {
  try {
    const response = await withProviderResilience<Response>(
      {
        provider: 'crawler',
        operation: `social_deep:profile:${profile.platform}`,
        signal: input.signal,
        degrade: false,
        policy: { timeoutMs: 8000, maxAttempts: 2 },
      },
      ({ signal }) =>
        safeFetch(
          profile.url,
          { signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOS/1.0)' } },
          { maxRedirects: 3, maxResponseBytes: 512 * 1024 }
        )
    );

    if (response.status === 404 || response.status === 410) {
      return { ...profile, status: 'absent', confidence: 1, reason: `HTTP ${response.status}` };
    }
    if ([401, 403, 429].includes(response.status)) {
      return {
        ...profile,
        status: 'inaccessible',
        confidence: profile.confidence,
        reason: `HTTP ${response.status}`,
      };
    }
    if (!response.ok) {
      return {
        ...profile,
        status: 'failed',
        confidence: profile.confidence,
        reason: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const pageConfidence = identityConfidence(
      html.slice(0, 100_000),
      input.businessName,
      input.city
    );
    const confidence = Math.max(profile.confidence, pageConfidence);
    const websiteHost = new URL(input.websiteUrl).hostname.replace(/^www\./, '').toLowerCase();
    const hasWebsiteLink = html.toLowerCase().includes(websiteHost);
    const status: ProfileStatus =
      profile.source === 'website' ? 'verified' : confidence >= 0.75 ? 'likely' : 'ambiguous';

    return { ...profile, status, confidence, hasWebsiteLink };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    return {
      ...profile,
      status: 'failed',
      confidence: profile.confidence,
      reason: error instanceof Error ? error.message : 'Profile fetch failed',
    };
  }
}

function generateFindings(
  input: SocialDeepModuleInput,
  discovery: DiscoveryResult,
  observations: SocialProfileObservation[]
): Finding[] {
  const collectedAt = new Date().toISOString();
  const findings: Finding[] = [];

  for (const platform of discovery.absentPlatforms) {
    const impact = getMissingPlatformImpact(platform, input.industry);
    const pointer = discovery.evidencePointers[platform];
    if (impact === 0 || !pointer) continue;
    findings.push({
      type: impact >= 7 ? 'PAINKILLER' : 'VITAMIN',
      category: 'Visibility',
      title: `No ${capitalize(platform)} Business Profile Found`,
      description: `A bounded search did not find a matching ${capitalize(platform)} business profile. This is a search observation, not proof that no private or unindexed profile exists.`,
      impactScore: impact,
      confidenceScore: normalizeConfidence(80, '0-100'),
      evidence: [
        createEvidence({
          pointer,
          source: 'serpapi_social_discovery',
          collected_at: collectedAt,
          type: 'text',
          value: 'No validated profile in the first 5 results',
          label: `${capitalize(platform)} Search`,
        }),
      ],
      metrics: { platform, searchResultLimit: 5, status: 'verified_absent_in_bounded_search' },
      effortEstimate: 'LOW',
      recommendedFix: [
        `Review whether a ${capitalize(platform)} profile fits the channel strategy`,
      ],
    });
  }

  const unlinked = observations.filter(
    (profile) => profile.status === 'verified' && profile.hasWebsiteLink === false
  );
  if (unlinked.length > 0) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'Verified Social Profiles Do Not Link to the Website',
      description: `${unlinked.length} accessible profile page(s) did not expose the audited website domain in the checked public HTML.`,
      impactScore: 4,
      confidenceScore: normalizeConfidence(75, '0-100'),
      evidence: unlinked.map((profile) =>
        createEvidence({
          pointer: profile.url,
          source: 'social_profile_fetch',
          collected_at: collectedAt,
          type: 'url',
          value: profile.url,
          label: capitalize(profile.platform),
        })
      ),
      metrics: { unlinkedCount: unlinked.length },
      effortEstimate: 'LOW',
      recommendedFix: ['Add the canonical website URL to each business profile where supported'],
    });
  }

  if (discovery.absentPlatforms.length === SOCIAL_PLATFORMS.length && observations.length === 0) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'No Public Social Business Profile Found in Bounded Checks',
      description:
        'Five platform-specific searches completed without a validated business profile. Private or unindexed profiles may still exist.',
      impactScore: 7,
      confidenceScore: normalizeConfidence(80, '0-100'),
      evidence: SOCIAL_PLATFORMS.map((platform) =>
        createEvidence({
          pointer: discovery.evidencePointers[platform]!,
          source: 'serpapi_social_discovery',
          collected_at: collectedAt,
          type: 'text',
          value: 'No validated profile in the first 5 results',
          label: capitalize(platform),
        })
      ),
      metrics: { checkedPlatforms: SOCIAL_PLATFORMS.length, resultLimitPerPlatform: 5 },
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Confirm the intended social channels and create or claim business profiles',
      ],
    });
  }

  return findings;
}

function identityConfidence(text: string, businessName: string, city: string): number {
  const haystack = normalize(text);
  const nameTokens = normalize(businessName)
    .split(' ')
    .filter((token) => token.length > 2);
  if (nameTokens.length === 0) return 0;
  const nameMatches = nameTokens.filter((token) => haystack.includes(token)).length;
  const nameScore = nameMatches / nameTokens.length;
  const cityScore = city && haystack.includes(normalize(city)) ? 0.15 : 0;
  return Math.min(1, nameScore * 0.85 + cityScore);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getMissingPlatformImpact(platform: SocialPlatform, industry: string): number {
  const normalizedIndustry = industry.toLowerCase();
  if (
    platform === 'instagram' &&
    ['food', 'beauty', 'retail'].some((term) => normalizedIndustry.includes(term))
  ) {
    return 7;
  }
  if (
    platform === 'linkedin' &&
    ['law', 'consulting', 'b2b'].some((term) => normalizedIndustry.includes(term))
  ) {
    return 6;
  }
  if (platform === 'facebook') return 4;
  return 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
