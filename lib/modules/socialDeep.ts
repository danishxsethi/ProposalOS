import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { traceLlmCall } from '@/lib/tracing';

export interface SocialDeepModuleInput {
    websiteUrl: string;
    businessName: string;
    city: string;
    industry: string;
    discoveredUrls?: { platform: string; url: string }[];
}

interface SocialProfile {
    platform: 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok';
    url: string;
    exists: boolean;
    followers?: number;
    lastPostDate?: string;
    isPrivate?: boolean; // IG
    hasWebsiteLink?: boolean;
    posts?: string[]; // Captions for analysis
}

interface ContentAnalysis {
    score: number; // 1-10
    strengths: string[];
    weaknesses: string[];
    bestPost?: string;
    professionalism: number;
    engagementPotential: number;
}

/**
 * Deep Social Analysis Module
 * Checks profile health, consistency, and content quality.
 */
export async function runSocialDeepModule(
    input: SocialDeepModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ business: input.businessName }, '[SocialDeep] Starting deep social analysis');

    const findings: Finding[] = [];
    const profiles: SocialProfile[] = [];

    // 1. Identify Profiles to Analyze
    // If not provided, we could try to find them or just skip. 
    // For now, we assume basic 'social' module ran first or we have URLs.
    // If not, we do a quick SerpAPI search for them.
    let targetUrls = input.discoveredUrls || [];

    if (targetUrls.length === 0) {
        // Fallback: Try to find them via Google Search
        tracker?.addApiCall('SERP');
        targetUrls = await findSocialProfiles(input.businessName, input.city);
    }

    // 2. Analyze Each Platform
    // We'll process commonly requested platforms
    const platforms = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'];

    for (const pName of platforms) {
        const target = targetUrls.find(t => t.platform === pName);
        if (target) {
            const profile = await analyzeProfile(target.platform as any, target.url, tracker);
            profiles.push(profile);
        } else {
            // Missing platform?
            // Only flag as "Missing" if it's high relevance for the industry
            const impact = getMissingPlatformImpact(pName, input.industry);
            if (impact > 0) {
                findings.push({
                    type: (impact >= 7) ? 'PAINKILLER' : 'VITAMIN',
                    category: 'Visibility',
                    title: `Missing ${capitalize(pName)} Profile`,
                    description: `No ${capitalize(pName)} profile found. For ${input.industry}, this is a key channel.`,
                    impactScore: impact,
                    confidenceScore: normalizeConfidence(90, '0-100'),
                    evidence: [{ type: 'text', value: 'Profile not found', label: 'Missing' }],
                    metrics: { platform: pName, status: 'missing' },
                    effortEstimate: 'LOW',
                    recommendedFix: [`Create a ${capitalize(pName)} page`, 'Optimise bio and link to website']
                });
            }
        }
    }

    // 3. Cross-Platform Consistency
    const activeProfiles = profiles.filter(p => p.exists);
    if (activeProfiles.length > 0) { // Check branding logic here if we had images data
        // For MVP, just checking if they link back to website
        const unlinked = activeProfiles.filter(p => p.hasWebsiteLink === false);
        if (unlinked.length > 0) {
            findings.push({
                type: 'VITAMIN',
                category: 'Visibility',
                title: 'Social Profiles Not Linking to Website',
                description: `${unlinked.length} profiles are missing a link back to your website. You are losing traffic.`,
                impactScore: 4,
                confidenceScore: normalizeConfidence(95, '0-100'),
                evidence: unlinked.map(p => ({ type: 'url' as const, value: p.url, label: capitalize(p.platform) })),
                metrics: { unlinkedCount: unlinked.length },
                effortEstimate: 'LOW',
                recommendedFix: ['Add website URL to all social bios']
            });
        }
    } else {
        // Abandoned / Ghost Town
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'No Active Social Presence',
            description: 'We could not find any active social media profiles. In 2026, social proof is critical for trust.',
            impactScore: 8,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: [],
            metrics: { activeCount: 0 },
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Claim operational profiles', 'Post at least once a week']
        });
    }


    // 4. AI Content Analysis (Gemini)
    // Gather all posts text
    const allPosts = profiles.flatMap(p => p.posts || []);
    if (allPosts.length > 0) {
        const analysis = await analyzeContentQuality(allPosts, input.industry, input.city, tracker);

        if (analysis) {
            if (analysis.score < 5) {
                findings.push({
                    type: 'VITAMIN',
                    category: 'Content',
                    title: 'Low Quality Social Content',
                    description: 'AI analysis suggests your posts lack engagement or professionalism.',
                    impactScore: 5,
                    confidenceScore: normalizeConfidence(80, '0-100'),
                    evidence: analysis.weaknesses.map(w => ({ type: 'text', value: w, label: 'Weakness' })),
                    metrics: { contentScore: analysis.score },
                    effortEstimate: 'MEDIUM',
                    recommendedFix: ['Use higher quality images', 'Include clear CTAs', 'Post consistently']
                });
            }
        }
    }

    // 5. Abandoned Profiles
    const abandoned = profiles.filter(p => p.exists && p.lastPostDate && isOlderThan(p.lastPostDate, 90));
    if (abandoned.length > 0) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Abandoned Social Profiles',
            description: `${abandoned.length} profiles haven't posted in 3 months. This looks worse than having no profile.`,
            impactScore: 7,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: abandoned.map(p => ({ type: 'text', value: `Last post: ${p.lastPostDate}`, label: capitalize(p.platform) })),
            metrics: { abandonedCount: abandoned.length },
            effortEstimate: 'LOW',
            recommendedFix: ['Resume posting or archive the page', 'Pin a "We are still active" post']
        });
    }

    return {
        findings,
        evidenceSnapshots: [{
            module: 'social_deep',
            source: 'serp_api',
            rawResponse: profiles,
            collectedAt: new Date()
        }]
    };
}

// HELPERS

async function findSocialProfiles(name: string, city: string): Promise<{ platform: string, url: string }[]> {
    // Quick SERP search logic to be implemented or rely on existing module
    // For now returning empty to rely on input
    return [];
}

async function analyzeProfile(platform: string, url: string, tracker?: CostTracker): Promise<SocialProfile> {
    const profile: SocialProfile = {
        platform: platform as any,
        url,
        exists: true, // assume exists if URL provided, verify below
        posts: []
    };

    try {
        // Use SerpAPI "site:" search to get index info + snippet
        // This is cheaper and more reliable than scraping profile directly
        const query = `site:${getDomain(platform)} "${extractHandle(url)}" `;
        // Or just search for the profile URL to see google's cache info

        // For MVP, we'll implement a Mock/Heuristic or simple fetch if public
        // Real implementation would use SerpAPI /google_search

        // Mocking extraction for demo speed, assuming valid URL
        // In prod, use: await fetch(url) -> parse meta tags

        // Let's try to fetch meta tags for description (Followers often in description)
        /*
        const res = await fetch(url, { headers: { 'User-Agent': 'Bot' } });
        const html = await res.text();
        const desc = extractMeta(html, 'description');
        if (desc) {
            // "100 Followers, 20 Following"
            const followers = parseFollowers(desc);
            if (followers) profile.followers = followers;
        }
        */

    } catch (e) {
        console.error(`Failed to analyze ${platform}`, e);
        profile.exists = false;
    }

    return profile;
}

async function analyzeContentQuality(posts: string[], industry: string, city: string, tracker?: CostTracker): Promise<ContentAnalysis | null> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || posts.length === 0) return null;

    try {
        tracker?.addLlmCall('GEMINI_FLASH', 300, 100);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
            Analyze these social media captions for a ${industry} business in ${city}:
            ${JSON.stringify(posts)}
            
            Rate 1-10 on professionalism and engagement.
            Return JSON: { "score": number, "strengths": string[], "weaknesses": string[] }
        `;

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (e) {
        return null;
    }
}

function getMissingPlatformImpact(platform: string, industry: string): number {
    const i = industry.toLowerCase();

    if (platform === 'instagram' && (i.includes('food') || i.includes('beauty') || i.includes('retail'))) return 7;
    if (platform === 'linkedin' && (i.includes('law') || i.includes('consulting') || i.includes('b2b'))) return 6;
    if (platform === 'facebook') return 4; // Expected for everyone

    return 0; // Not critical
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function isOlderThan(dateStr: string, days: number) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
    return diff > days;
}
function getDomain(p: string) {
    if (p === 'linkedin') return 'linkedin.com';
    if (p === 'instagram') return 'instagram.com';
    return `${p}.com`;
}
function extractHandle(url: string) {
    const parts = url.split('/').filter(x => x);
    return parts[parts.length - 1];
}
