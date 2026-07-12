import * as cheerio from 'cheerio';
import { z } from 'zod';

import { withModuleCache } from '@/lib/cache/moduleCache';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safeFetch } from '@/lib/security/safeFetch';

import { normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, createEvidence, Finding } from './types';

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

export interface VideoModuleInput {
  businessName: string;
  city: string;
  industry: string;
  websiteUrl: string;
  competitors: string[];
  signal?: AbortSignal;
}

interface WebsiteVideoAnalysis {
  checked: boolean;
  hasVideo: boolean;
  embeds: { youtube: number; vimeo: number; other: number };
  hasHeroVideo: boolean;
  hasVideoSchema: boolean;
  channelLinks: string[];
  reason?: string;
}

interface YouTubeChannelObservation {
  title: string;
  url: string;
  status: 'verified' | 'likely' | 'ambiguous' | 'inaccessible' | 'failed';
  confidence: number;
  source: 'website' | 'serpapi';
  channelId?: string;
  description?: string;
  recentVideos?: Array<{ title: string; link: string; publishedAt: string }>;
  metricsStatus: 'available' | 'unavailable';
  reason?: string;
}

interface ChannelDiscovery {
  channel: YouTubeChannelObservation | null;
  checked: boolean;
  verifiedAbsent: boolean;
  unavailable: boolean;
  evidencePointer?: string;
}

export async function runVideoModule(
  input: VideoModuleInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ business: input.businessName }, '[Video] Starting video presence analysis');

  try {
    const website = await analyzeWebsiteVideo(input.websiteUrl, input.signal);
    const discovery = await discoverBusinessChannel(input, website.channelLinks, tracker);
    const channel = discovery.channel
      ? await inspectChannel(discovery.channel, input, input.signal)
      : null;
    const competitorChannels = await checkCompetitorYouTube(
      input.competitors,
      input.city,
      tracker,
      input.signal
    );
    const findings = generateVideoFindings(input, website, discovery, channel, competitorChannels);

    const hasSubstantiveWork = website.checked || discovery.checked || channel !== null;
    const isPartial =
      !website.checked ||
      discovery.unavailable ||
      channel?.metricsStatus === 'unavailable' ||
      channel?.status === 'ambiguous' ||
      competitorChannels.some((competitor) => competitor.status === 'unavailable');

    return {
      findings,
      evidenceSnapshots: [
        {
          module: 'video',
          source: 'website_serpapi_youtube_public_feed',
          rawResponse: { website, discovery, channel, competitorChannels },
          collectedAt: new Date(),
        },
      ],
      execution: !hasSubstantiveWork
        ? { state: 'unavailable', reason: 'Website and channel providers were unavailable' }
        : isPartial
          ? { state: 'partial', reason: 'Some channel identity or public metrics were unavailable' }
          : { state: 'complete' },
    };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    logger.error({ error }, '[Video] Module failed');
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'Video presence analysis failed',
      },
    };
  }
}

async function analyzeWebsiteVideo(
  url: string,
  signal?: AbortSignal
): Promise<WebsiteVideoAnalysis> {
  if (!url) {
    return {
      checked: false,
      hasVideo: false,
      embeds: { youtube: 0, vimeo: 0, other: 0 },
      hasHeroVideo: false,
      hasVideoSchema: false,
      channelLinks: [],
      reason: 'No website URL',
    };
  }

  try {
    const html = await withProviderResilience<string>(
      {
        provider: 'crawler',
        operation: 'video:website_fetch',
        signal,
        degrade: false,
        policy: { timeoutMs: 8000, maxAttempts: 2 },
      },
      async ({ signal: providerSignal }) => {
        const response = await safeFetch(
          url,
          { signal: providerSignal },
          { maxResponseBytes: 1024 * 1024 }
        );
        if (!response.ok) throw new Error(`Website HTTP ${response.status}`);
        return response.text();
      }
    );
    const $ = cheerio.load(html);
    const youtube = $('iframe[src*="youtube.com"], iframe[src*="youtu.be"]').length;
    const vimeo = $('iframe[src*="vimeo.com"]').length;
    const other = $('video').length;
    const channelLinks = [
      ...new Set(
        $('a[href*="youtube.com"]')
          .map((_, element) => $(element).attr('href') || '')
          .get()
          .map(validateYouTubeChannelUrl)
          .filter((value): value is string => value !== null)
      ),
    ].slice(0, 3);

    return {
      checked: true,
      hasVideo: youtube + vimeo + other > 0,
      embeds: { youtube, vimeo, other },
      hasHeroVideo: $('section:first-of-type video, header video, .hero video').length > 0,
      hasVideoSchema: $('script[type="application/ld+json"]').text().includes('VideoObject'),
      channelLinks,
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return {
      checked: false,
      hasVideo: false,
      embeds: { youtube: 0, vimeo: 0, other: 0 },
      hasHeroVideo: false,
      hasVideoSchema: false,
      channelLinks: [],
      reason: error instanceof Error ? error.message : 'Website fetch failed',
    };
  }
}

async function discoverBusinessChannel(
  input: VideoModuleInput,
  websiteLinks: string[],
  tracker?: CostTracker
): Promise<ChannelDiscovery> {
  if (websiteLinks[0]) {
    return {
      channel: {
        title: input.businessName,
        url: websiteLinks[0],
        status: 'verified',
        confidence: 1,
        source: 'website',
        metricsStatus: 'unavailable',
      },
      checked: true,
      verifiedAbsent: false,
      unavailable: false,
      evidencePointer: input.websiteUrl,
    };
  }

  const search = await searchYouTube(input.businessName, input.city, tracker, input.signal);
  if (search.status === 'unavailable') {
    return { channel: null, checked: false, verifiedAbsent: false, unavailable: true };
  }
  if (!search.candidate) {
    return {
      channel: null,
      checked: true,
      verifiedAbsent: true,
      unavailable: false,
      evidencePointer: search.pointer,
    };
  }

  return {
    channel: {
      title: search.candidate.title,
      url: search.candidate.url,
      status: search.candidate.confidence >= 0.75 ? 'likely' : 'ambiguous',
      confidence: search.candidate.confidence,
      source: 'serpapi',
      description: search.candidate.snippet,
      metricsStatus: 'unavailable',
    },
    checked: true,
    verifiedAbsent: false,
    unavailable: false,
    evidencePointer: search.pointer,
  };
}

async function inspectChannel(
  channel: YouTubeChannelObservation,
  input: VideoModuleInput,
  signal?: AbortSignal
): Promise<YouTubeChannelObservation> {
  try {
    const response = await withProviderResilience<Response>(
      {
        provider: 'crawler',
        operation: 'video:youtube_channel_page',
        signal,
        degrade: false,
        policy: { timeoutMs: 8000, maxAttempts: 2 },
      },
      ({ signal: providerSignal }) =>
        safeFetch(
          channel.url,
          {
            signal: providerSignal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOS/1.0)' },
          },
          { maxRedirects: 3, maxResponseBytes: 1024 * 1024 }
        )
    );

    if ([401, 403, 429].includes(response.status)) {
      return {
        ...channel,
        status: 'inaccessible',
        metricsStatus: 'unavailable',
        reason: `HTTP ${response.status}`,
      };
    }
    if (!response.ok) {
      return {
        ...channel,
        status: 'failed',
        metricsStatus: 'unavailable',
        reason: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title')
        .text()
        .replace(/- YouTube$/, '')
        .trim() ||
      channel.title;
    const description =
      $('meta[property="og:description"]').attr('content')?.trim() || channel.description;
    const canonical = validateYouTubeChannelUrl($('link[rel="canonical"]').attr('href') || '');
    const channelId =
      $('meta[itemprop="channelId"]').attr('content') ||
      canonical?.match(/\/channel\/([A-Za-z0-9_-]+)/)?.[1];
    const confidence = Math.max(
      channel.confidence,
      identityConfidence(`${title} ${description || ''}`, input.businessName, input.city)
    );
    const identityStatus =
      channel.source === 'website'
        ? 'verified'
        : confidence >= 0.8
          ? 'likely'
          : ('ambiguous' as const);

    if (!channelId) {
      return {
        ...channel,
        title,
        description,
        url: canonical || channel.url,
        status: identityStatus,
        confidence,
        metricsStatus: 'unavailable',
        reason: 'Public channel ID was not exposed',
      };
    }

    const recentVideos = await fetchYouTubeFeed(channelId, signal);
    return {
      ...channel,
      title,
      description,
      url: canonical || channel.url,
      status: identityStatus,
      confidence,
      channelId,
      recentVideos,
      metricsStatus: 'available',
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return {
      ...channel,
      status: channel.status === 'verified' ? 'verified' : 'failed',
      metricsStatus: 'unavailable',
      reason: error instanceof Error ? error.message : 'Channel inspection failed',
    };
  }
}

async function fetchYouTubeFeed(
  channelId: string,
  signal?: AbortSignal
): Promise<Array<{ title: string; link: string; publishedAt: string }>> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const xml = await withProviderResilience<string>(
    {
      provider: 'crawler',
      operation: 'video:youtube_public_feed',
      signal,
      degrade: false,
      policy: { timeoutMs: 8000, maxAttempts: 2 },
    },
    async ({ signal: providerSignal }) => {
      const response = await safeFetch(
        feedUrl,
        { signal: providerSignal },
        { maxRedirects: 2, maxResponseBytes: 512 * 1024 }
      );
      if (!response.ok) throw new Error(`YouTube feed HTTP ${response.status}`);
      return response.text();
    }
  );
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('entry')
    .slice(0, 10)
    .map((_, entry) => {
      const element = $(entry);
      return {
        title: element.find('title').first().text().trim(),
        link: element.find('link').first().attr('href') || '',
        publishedAt: element.find('published').first().text().trim(),
      };
    })
    .get()
    .filter(
      (entry) =>
        entry.title.length > 0 &&
        isHttpUrl(entry.link) &&
        !Number.isNaN(Date.parse(entry.publishedAt))
    );
}

async function searchYouTube(
  name: string,
  city: string,
  tracker?: CostTracker,
  signal?: AbortSignal
): Promise<{
  status: 'complete' | 'unavailable';
  pointer?: string;
  candidate?: { title: string; url: string; snippet: string; confidence: number };
}> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return { status: 'unavailable' };

  const query = `site:youtube.com "${name}" "${city}"`;
  const pointer = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=5`;

  try {
    const raw = await withModuleCache<unknown>(
      {
        module: 'video',
        version: 2,
        input: { type: 'youtube_channel_search', name, city },
      },
      { ttlSeconds: 7 * 24 * 60 * 60 },
      () =>
        withProviderResilience<unknown>(
          {
            provider: 'serpapi',
            operation: 'video:youtube_search',
            signal,
            degrade: false,
            policy: { timeoutMs: 8000, maxAttempts: 2 },
          },
          async ({ signal: providerSignal }) => {
            tracker?.addApiCall('SERP_API');
            const response = await fetch(`${pointer}&api_key=${apiKey}`, {
              signal: providerSignal,
            });
            if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);
            return response.json();
          }
        )
    );
    const parsed = SerpResponseSchema.parse(raw);
    const candidate = parsed.organic_results
      .map((result) => {
        const url = validateYouTubeChannelUrl(result.link);
        if (!url) return null;
        return {
          title: result.title,
          url,
          snippet: result.snippet,
          confidence: identityConfidence(`${result.title} ${result.snippet}`, name, city),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.confidence - a.confidence)[0];
    return { status: 'complete', pointer, candidate };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    logger.warn({ name, error }, '[Video] Channel search unavailable');
    return { status: 'unavailable' };
  }
}

async function checkCompetitorYouTube(
  competitors: string[],
  city: string,
  tracker?: CostTracker,
  signal?: AbortSignal
): Promise<
  Array<{
    name: string;
    status: 'found' | 'absent' | 'ambiguous' | 'unavailable';
    url?: string;
    evidencePointer?: string;
  }>
> {
  const results = [];
  for (const name of competitors.slice(0, 3)) {
    const search = await searchYouTube(name, city, tracker, signal);
    if (search.status === 'unavailable') {
      results.push({ name, status: 'unavailable' as const });
    } else if (!search.candidate) {
      results.push({
        name,
        status: 'absent' as const,
        evidencePointer: search.pointer,
      });
    } else if (search.candidate.confidence < 0.75) {
      results.push({
        name,
        status: 'ambiguous' as const,
        url: search.candidate.url,
        evidencePointer: search.pointer,
      });
    } else {
      results.push({
        name,
        status: 'found' as const,
        url: search.candidate.url,
        evidencePointer: search.pointer,
      });
    }
  }
  return results;
}

function generateVideoFindings(
  input: VideoModuleInput,
  website: WebsiteVideoAnalysis,
  discovery: ChannelDiscovery,
  channel: YouTubeChannelObservation | null,
  competitorChannels: Awaited<ReturnType<typeof checkCompetitorYouTube>>
): Finding[] {
  const findings: Finding[] = [];
  const collectedAt = new Date().toISOString();

  if (discovery.verifiedAbsent && discovery.evidencePointer) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'No Matching YouTube Business Channel Found',
      description: `A bounded search did not find a YouTube channel confidently matching ${input.businessName}. Private or unindexed channels may still exist.`,
      impactScore: 6,
      confidenceScore: normalizeConfidence(80, '0-100'),
      evidence: [
        createEvidence({
          pointer: discovery.evidencePointer,
          source: 'serpapi_youtube_discovery',
          collected_at: collectedAt,
          type: 'text',
          value: 'No validated channel in the first 5 results',
          label: 'YouTube Channel Search',
        }),
      ],
      metrics: { hasChannel: false, searchResultLimit: 5 },
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Review whether a branded YouTube channel fits the content strategy'],
    });
  }

  const latestVideo = channel?.recentVideos?.[0];
  if (
    channel &&
    ['verified', 'likely'].includes(channel.status) &&
    latestVideo &&
    isOlderThan(latestVideo.publishedAt, 180)
  ) {
    findings.push({
      type: 'VITAMIN',
      category: 'Visibility',
      title: 'YouTube Channel Has Not Published Recently',
      description: `The newest public feed item was published on ${latestVideo.publishedAt.slice(0, 10)}.`,
      impactScore: 5,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: latestVideo.link,
          source: 'youtube_public_feed',
          collected_at: collectedAt,
          type: 'text',
          value: latestVideo.publishedAt,
          label: 'Latest Public Video',
        }),
      ],
      metrics: {
        latestPublishedAt: latestVideo.publishedAt,
        observedFeedItems: channel.recentVideos?.length || 0,
      },
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Publish a new useful video if YouTube remains an active channel'],
    });
  }

  if (website.checked && !website.hasVideo) {
    findings.push({
      type: 'VITAMIN',
      category: 'Engagement',
      title: 'No Video Embed Detected on the Audited Page',
      description:
        'The audited page contained no YouTube/Vimeo iframe or HTML video element. This observation applies only to the checked page.',
      impactScore: 4,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: input.websiteUrl,
          source: 'website_video_scan',
          collected_at: collectedAt,
          type: 'metric',
          value: 0,
          label: 'Video Elements on Audited Page',
        }),
      ],
      metrics: { youtubeEmbeds: 0, vimeoEmbeds: 0, htmlVideoElements: 0 },
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Consider adding a relevant video where it supports the page goal'],
    });
  }

  const verifiedCompetitors = competitorChannels.filter(
    (competitor) => competitor.status === 'found' && competitor.url
  );
  if (discovery.verifiedAbsent && verifiedCompetitors.length > 0) {
    findings.push({
      type: 'VITAMIN',
      category: 'Competitive',
      title: 'Competitors Have Discoverable YouTube Channels',
      description: `${verifiedCompetitors.length} canonical competitor(s) had a confidently matched channel while the subject business did not.`,
      impactScore: 5,
      confidenceScore: normalizeConfidence(80, '0-100'),
      evidence: verifiedCompetitors.map((competitor) =>
        createEvidence({
          pointer: competitor.url!,
          source: 'serpapi_youtube_discovery',
          collected_at: collectedAt,
          type: 'url',
          value: competitor.name,
          label: 'Competitor Channel',
        })
      ),
      metrics: { competitorChannelCount: verifiedCompetitors.length },
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Review competitor formats before deciding whether to invest in the channel',
      ],
    });
  }

  return findings;
}

export function validateYouTubeChannelUrl(candidate: string): string | null {
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;
    const path = parsed.pathname;
    if (!/^\/(?:channel\/[A-Za-z0-9_-]+|@[A-Za-z0-9._-]+|c\/[^/]+|user\/[^/]+)\/?$/.test(path)) {
      return null;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function identityConfidence(text: string, businessName: string, city: string): number {
  const haystack = normalize(text);
  const tokens = normalize(businessName)
    .split(' ')
    .filter((token) => token.length > 2);
  if (tokens.length === 0) return 0;
  const nameScore = tokens.filter((token) => haystack.includes(token)).length / tokens.length;
  const cityScore = city && haystack.includes(normalize(city)) ? 0.15 : 0;
  return Math.min(1, nameScore * 0.85 + cityScore);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isOlderThan(value: string, days: number): boolean {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && Date.now() - timestamp > days * 24 * 60 * 60 * 1000;
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
