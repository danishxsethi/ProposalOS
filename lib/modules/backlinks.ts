import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';

export interface BacklinksModuleInput {
    websiteUrl: string;
    businessName: string;
    city: string;
    competitors?: string[]; // Competitor URLs
}

interface BacklinkProfile {
    url: string;
    estimatedLinks: number; // Rough count
    indexedPages: number;
    hasChamber: boolean;
    hasLocalNews: boolean;
    hasIndustryDir: boolean;
}

interface BacklinkAnalysis {
    business: BacklinkProfile;
    competitors: BacklinkProfile[];
    authorityScore: number; // 0-100
}

/**
 * Backlinks Module
 * Estimates link authority using SerpAPI
 */
export async function runBacklinksModule(
    input: BacklinksModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ business: input.businessName }, '[Backlinks] Starting analysis');

    const analysis = await analyzeBacklinks(input, tracker);
    const findings = generateBacklinkFindings(analysis, input);

    return {
        findings,
        evidenceSnapshots: [{
            module: 'backlinks',
            source: 'serp_api_estimation',
            rawResponse: analysis,
            collectedAt: new Date()
        }]
    };
}

// ANALYSIS LOGIC

async function analyzeBacklinks(input: BacklinksModuleInput, tracker?: CostTracker): Promise<BacklinkAnalysis> {
    const businessProfile = await getProfile(input.websiteUrl, input.businessName, input.city, tracker);

    const competitors: BacklinkProfile[] = [];
    if (input.competitors) {
        for (const compUrl of input.competitors.slice(0, 3)) {
            competitors.push(await getProfile(compUrl, '', input.city, tracker));
        }
    }

    // Calculate Score
    // Heuristic: 
    // - 50 pts for indexed pages (log scale)
    // - 15 pts for each major link type (Chamber, News, Industry)
    // - Cap at 100
    let score = 0;

    // Indexed Pages Score (0-50)
    // 0 -> 0
    // 10 -> 10
    // 100 -> 30
    // 1000+ -> 50
    const pages = businessProfile.indexedPages;
    if (pages < 10) score += pages;
    else if (pages < 100) score += 10 + (pages - 10) * 0.2;
    else if (pages < 1000) score += 30 + (pages - 100) * 0.02;
    else score += 50;

    if (businessProfile.hasChamber) score += 15;
    if (businessProfile.hasLocalNews) score += 15;
    if (businessProfile.hasIndustryDir) score += 20;

    return {
        business: businessProfile,
        competitors,
        authorityScore: Math.min(Math.round(score), 100)
    };
}

async function getProfile(url: string, name: string, city: string, tracker?: CostTracker): Promise<BacklinkProfile> {
    const domain = new URL(url).hostname.replace('www.', '');
    const profile: BacklinkProfile = {
        url,
        estimatedLinks: 0,
        indexedPages: 0,
        hasChamber: false,
        hasLocalNews: false,
        hasIndustryDir: false
    };

    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) return profile;

    // 1. Indexed Pages (site:domain.com)
    try {
        tracker?.addApiCall('SERP');
        const siteQuery = `site:${domain}`;
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(siteQuery)}&api_key=${serpApiKey}`;

        const data = await cachedFetch('se_site:' + domain, {}, async () => {
            const res = await fetch(serpUrl);
            return await res.json();
        }, { ttlHours: 168 });

        // SerpAPI returns "About X results" in search_information.total_results
        profile.indexedPages = data.search_information?.total_results || 0;
    } catch (e) {
        console.error('Site search failed', e);
    }

    // 2. Link Estimation (link:domain.com) - Less reliable on Google but nonzero
    try {
        tracker?.addApiCall('SERP');
        const linkQuery = `link:${domain}`;
        const data = await cachedFetch('se_link:' + domain, {}, async () => {
            const res = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(linkQuery)}&api_key=${serpApiKey}`);
            return await res.json();
        });
        profile.estimatedLinks = data.search_information?.total_results || 0;
    } catch (e) { }

    // 3. High Value Links (Only check for main business, competitors skip this to save cost/time)
    if (name) {
        // Chamber
        profile.hasChamber = await checkLinkPresence(`"${city}" chamber of commerce "${name}"`, domain, serpApiKey, tracker);

        // News (generic "news" keyword with city + business name)
        profile.hasLocalNews = await checkLinkPresence(`"${city}" news "${name}"`, domain, serpApiKey, tracker);
    }

    return profile;
}

async function checkLinkPresence(query: string, targetDomain: string, apiKey: string, tracker?: CostTracker): Promise<boolean> {
    try {
        tracker?.addApiCall('SERP');
        const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}`;
        const data = await cachedFetch('se_check:' + query, {}, async () => {
            const res = await fetch(url);
            return await res.json();
        }, { ttlHours: 168 });

        // Check if any result is NOT the target domain itself
        // Actually, we want to find IF the target domain is mentioned/linked in these results results
        // But simpler: does a result appear that matches the query? 
        // If we search "City Chamber Business Name" and get a result from "citychamber.com", that's a hit.

        const results = data.organic_results || [];
        // If we find a result from a different domain that mentions us?
        // Heuristic: If we get ANY results that aren't our own website, likely a mention.
        const externalHits = results.filter((r: any) => !r.link.includes(targetDomain));
        return externalHits.length > 0;
    } catch (e) { return false; }
}


// FINDINGS

function generateBacklinkFindings(analysis: BacklinkAnalysis, input: BacklinksModuleInput): Finding[] {
    const findings: Finding[] = [];
    const b = analysis.business;
    const score = analysis.authorityScore;

    // PAINKILLER: Thin Content / Not Indexed
    if (b.indexedPages < 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Website Not Properly Indexed',
            description: `Google has only indexed ${b.indexedPages} pages of your website. Most customers effectively cannot find you.`,
            impactScore: 8,
            confidenceScore: 95,
            evidence: [{ type: 'metric', value: b.indexedPages, label: 'Indexed Pages' }],
            metrics: { indexed: b.indexedPages },
            effortEstimate: 'HIGH',
            recommendedFix: ['Submit sitemap to Google Search Console', 'Fix "noindex" tags', 'Create more content']
        });
    }

    // PAINKILLER: Competitor Gap
    const strongCompetitor = analysis.competitors.find(c => c.indexedPages > b.indexedPages * 5);
    if (strongCompetitor) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Competitors Dominate Search Presence',
            description: `Competitors have 5x more pages indexed by Google (${strongCompetitor.indexedPages} vs ${b.indexedPages}). They are capturing significantly more traffic.`,
            impactScore: 7,
            confidenceScore: 90,
            evidence: [{ type: 'metric', value: strongCompetitor.indexedPages, label: 'Competitor Pages' }],
            metrics: { gap: strongCompetitor.indexedPages - b.indexedPages },
            effortEstimate: 'HIGH',
            recommendedFix: ['Publish weekly blog content', 'Create location service pages', 'Expand service descriptions']
        });
    }

    // VITAMIN: Authority Gap
    if (score < 30) {
        findings.push({
            type: 'VITAMIN',
            category: 'Authority',
            title: 'Low Domain Authority',
            description: 'Your website lacks authority signals. This makes it hard to rank for competitive keywords.',
            impactScore: 6,
            confidenceScore: 85,
            evidence: [{ type: 'metric', value: score, label: 'Authority Score' }],
            metrics: { score },
            effortEstimate: 'HIGH',
            recommendedFix: ['Get citations from local chamber', 'Partner with local charities', 'Link from social profiles']
        });
    }

    // VITAMIN: Missing specific links
    if (!b.hasChamber) {
        findings.push({
            type: 'VITAMIN',
            category: 'Authority',
            title: 'Missing Chamber of Commerce Link',
            description: 'No link found from the local Chamber of Commerce. This is a powerful trust signal for Google.',
            impactScore: 4,
            confidenceScore: 60, // Fuzzy check
            evidence: [],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Join local chamber', 'Ensure they link to your website']
        });
    }

    return findings;
}
