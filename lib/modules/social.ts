import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safeFetch } from '@/lib/security/safeFetch';

import { LegacyAuditModuleResult } from './types';

export interface SocialModuleInput {
  websiteUrl: string;
  businessName: string;
}

interface SocialPlatform {
  platform: string;
  url: string;
}

/**
 * P2-31 (Wave 7): platform names must stay a subset of what `socialDeep`
 * (lib/modules/socialDeep.ts::SOCIAL_DEEP_PLATFORMS) can validate — a platform
 * discovered here that socialDeep cannot recognize is silently dropped downstream
 * with no record. Kept as an independent literal (not a runtime cross-module
 * import, to avoid coupling two modules that otherwise have no dependency on each
 * other) but verified to match exactly by
 * `lib/modules/__tests__/socialShareExclusion.test.ts`.
 */
const SOCIAL_PLATFORMS = [
  { name: 'facebook', patterns: ['facebook.com', 'fb.com', 'fb.me'] },
  { name: 'instagram', patterns: ['instagram.com', 'instagr.am'] },
  { name: 'linkedin', patterns: ['linkedin.com', 'lnkd.in'] },
  { name: 'youtube', patterns: ['youtube.com', 'youtu.be'] },
  { name: 'tiktok', patterns: ['tiktok.com'] },
];

/**
 * P2-32 (Wave 7): a matched URL whose path is a generic share/embed/widget/watch
 * link (present on almost any website via share buttons or embedded content) is
 * not evidence of the business's OWN profile on that platform — it is often a
 * link to someone else's content, or a generic sharing dialog. Rejecting these
 * path shapes mirrors the same exclusion already enforced in the deeper
 * `socialDeep` module (lib/modules/socialDeep.ts::REJECTED_PATH_PARTS) so a quick
 * free scan and the deep bounded-search module apply the same real-profile bar.
 */
const REJECTED_PATH_PARTS: Record<string, string[]> = {
  facebook: ['/share', '/sharer', '/dialog/', '/plugins/', '/watch', '/reel/'],
  instagram: ['/p/', '/reel/', '/tv/', '/stories/'],
  linkedin: ['/sharing/', '/sharearticle', '/feed/update/', '/posts/', '/pulse/'],
  youtube: ['/watch', '/shorts/', '/embed/', '/results', '/playlist'],
  tiktok: ['/video/', '/embed/', '/share/'],
};

function isShareOrEmbedUrl(platformName: string, url: string): boolean {
  const rejectedParts = REJECTED_PATH_PARTS[platformName];
  if (!rejectedParts) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path === '/' || path === '') return true;
    return rejectedParts.some((part) => path.includes(part));
  } catch {
    // Not a parseable absolute URL — treat as not a valid profile link rather
    // than guessing.
    return true;
  }
}

/**
 * Social Media Presence Module
 * Checks for social media links on the business website (no API keys needed)
 */
export async function runSocialModule(
  input: SocialModuleInput,
  tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
  logger.info({ websiteUrl: input.websiteUrl }, '[SocialModule] Analyzing social presence');

  // No cost for this module (just HTML fetch)

  if (!input.websiteUrl) {
    logger.info('[SocialModule] No website URL provided, skipping');
    return {
      moduleId: 'social-presence',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        skipped: true,
        reason: 'No website URL',
      },
    };
  }

  try {
    const html = await withProviderResilience<string>(
      {
        provider: 'generic',
        operation: 'social_fetch_website',
        policy: {
          timeoutMs: 3000,
          maxAttempts: 2,
        },
      },
      async ({ signal }) => {
        const response = await safeFetch(input.websiteUrl, {
          signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ProposalEngine/1.0)',
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      }
    );

    // Parse for social media links
    const foundPlatforms: SocialPlatform[] = [];
    const platformsFound = new Set<string>();

    for (const platform of SOCIAL_PLATFORMS) {
      for (const pattern of platform.patterns) {
        // Case-insensitive search for the platform domain
        const regex = new RegExp(`https?://[^"'\\s]*${pattern.replace('.', '\\.')}[^"'\\s]*`, 'gi');
        const matches = html.match(regex);

        if (matches && matches.length > 0) {
          // P2-32 (Wave 7): skip generic share/embed/widget/watch links and take
          // the first match that actually looks like a real profile URL, instead
          // of blindly trusting whichever URL the regex matched first.
          const realProfileMatch = matches.find((m) => !isShareOrEmbedUrl(platform.name, m));
          if (realProfileMatch && !platformsFound.has(platform.name)) {
            foundPlatforms.push({
              platform: platform.name,
              url: realProfileMatch,
            });
            platformsFound.add(platform.name);
          }
          if (realProfileMatch) break; // Found a real profile link, move to next platform
        }
      }
    }

    // Determine which platforms are missing
    const allPlatformNames = SOCIAL_PLATFORMS.map((p) => p.name);
    const platformsMissing = allPlatformNames.filter((name) => !platformsFound.has(name));

    return {
      moduleId: 'social-presence',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        websiteUrl: input.websiteUrl,
        platformsFound: Array.from(platformsFound),
        platformsMissing,
        totalCount: foundPlatforms.length,
        profiles: foundPlatforms,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(
      { error: msg, websiteUrl: input.websiteUrl },
      '[SocialModule] Fetch failed, skipping'
    );

    // Don't treat fetch errors as failures - just means we couldn't check (timeout, network, etc.)
    return {
      moduleId: 'social-presence',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        skipped: true,
        reason: error instanceof Error ? error.message : 'Unable to fetch website',
        websiteUrl: input.websiteUrl,
      },
    };
  }
}
