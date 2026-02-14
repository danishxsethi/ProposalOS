import { LegacyAuditModuleResult } from './types';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';

export interface SocialModuleInput {
    websiteUrl: string;
    businessName: string;
}

interface SocialPlatform {
    platform: string;
    url: string;
}

const SOCIAL_PLATFORMS = [
    { name: 'facebook', patterns: ['facebook.com', 'fb.com', 'fb.me'] },
    { name: 'instagram', patterns: ['instagram.com', 'instagr.am'] },
    { name: 'twitter', patterns: ['twitter.com', 'x.com', 't.co'] },
    { name: 'linkedin', patterns: ['linkedin.com', 'lnkd.in'] },
    { name: 'youtube', patterns: ['youtube.com', 'youtu.be'] },
    { name: 'tiktok', patterns: ['tiktok.com'] },
];

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
        // Fetch homepage HTML (with timeout — spec: <3s, 3000ms)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(input.websiteUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ProposalEngine/1.0)',
            },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Parse for social media links
        const foundPlatforms: SocialPlatform[] = [];
        const platformsFound = new Set<string>();

        for (const platform of SOCIAL_PLATFORMS) {
            for (const pattern of platform.patterns) {
                // Case-insensitive search for the platform domain
                const regex = new RegExp(`https?://[^"'\\s]*${pattern.replace('.', '\\.')}[^"'\\s]*`, 'gi');
                const matches = html.match(regex);

                if (matches && matches.length > 0) {
                    // Take the first match as the canonical link
                    if (!platformsFound.has(platform.name)) {
                        foundPlatforms.push({
                            platform: platform.name,
                            url: matches[0],
                        });
                        platformsFound.add(platform.name);
                    }
                    break; // Found this platform, move to next
                }
            }
        }

        // Determine which platforms are missing
        const allPlatformNames = SOCIAL_PLATFORMS.map(p => p.name);
        const platformsMissing = allPlatformNames.filter(name => !platformsFound.has(name));

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
        logger.warn({ error: msg, websiteUrl: input.websiteUrl }, '[SocialModule] Fetch failed, skipping');

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
