import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';

export interface PaidSearchModuleInput {
    url: string;
    businessName: string;
    businessType: string; // e.g., "plumber", "dentist"
    city: string;
}

interface AdPresence {
    keyword: string;
    businessIsAdvertising: boolean;
    competitorAds: Array<{
        title: string;
        link: string;
        displayLink?: string;
    }>;
    totalAds: number;
}

interface TrackingPixels {
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

/**
 * Run paid search analysis module
 */
export async function runPaidSearchModule(
    input: PaidSearchModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ businessName: input.businessName }, '[PaidSearch] Starting paid search analysis');

    try {
        // Check primary keyword ads
        tracker?.addApiCall('SERP');
        const primaryKeywordAds = await checkPrimaryKeywordAds(input);

        // Check business name ads (competitor bidding)
        tracker?.addApiCall('SERP');
        const businessNameAds = await checkBusinessNameAds(input);

        // Detect tracking pixels
        const trackingPixels = await detectTrackingPixels(input.url);

        const analysis: PaidSearchAnalysis = {
            primaryKeywordAds,
            businessNameAds,
            competitorsBiddingOnName: businessNameAds.totalAds > 0,
            trackingPixels,
        };

        const findings = generatePaidSearchFindings(analysis, input);

        const evidenceSnapshot = {
            module: 'paid_search',
            source: 'serp_api_analysis',
            rawResponse: analysis,
            collectedAt: new Date(),
        };

        logger.info({
            businessName: input.businessName,
            isAdvertising: primaryKeywordAds.businessIsAdvertising,
            competitorsBiddingOnName: analysis.competitorsBiddingOnName,
            hasTracking: trackingPixels.hasGA4 || trackingPixels.hasGoogleAds,
            findingsCount: findings.length,
        }, '[PaidSearch] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, businessName: input.businessName }, '[PaidSearch] Analysis failed');

        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Visibility',
                title: 'Paid Search Analysis Unavailable',
                description: 'Unable to complete paid search analysis. This may indicate API issues or network problems.',
                impactScore: 1,
                confidenceScore: normalizeConfidence(50, '0-100'),
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Try running paid search analysis again later'],
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Check if business is advertising on primary keywords
 */
async function checkPrimaryKeywordAds(input: PaidSearchModuleInput): Promise<AdPresence> {
    const query = `${input.businessType} ${input.city}`;

    logger.info({ query }, '[PaidSearch] Checking primary keyword ads');

    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) {
        logger.warn('[PaidSearch] No SerpAPI key, skipping ad detection');
        return {
            keyword: query,
            businessIsAdvertising: false,
            competitorAds: [],
            totalAds: 0,
        };
    }

    try {
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&location=${encodeURIComponent(input.city)}&hl=en&gl=us&google_domain=google.com&api_key=${serpApiKey}`;

        const data = await cachedFetch(
            'paid_search_primary',
            { query, city: input.city },
            async () => {
                const res = await fetch(serpUrl);
                return await res.json();
            },
            { ttlHours: 24 }
        );

        // Extract ads from response
        const ads = data.ads || [];
        const competitorAds = ads.map((ad: any) => ({
            title: ad.title,
            link: ad.link,
            displayLink: ad.displayed_link,
        }));

        // Check if audited business is advertising
        const businessDomain = new URL(input.url).hostname.replace('www.', '');
        const businessIsAdvertising = ads.some((ad: any) =>
            ad.link?.includes(businessDomain) || ad.displayed_link?.includes(businessDomain)
        );

        return {
            keyword: query,
            businessIsAdvertising,
            competitorAds,
            totalAds: ads.length,
        };

    } catch (error) {
        logger.warn({ error, query }, '[PaidSearch] Primary keyword check failed');
        return {
            keyword: query,
            businessIsAdvertising: false,
            competitorAds: [],
            totalAds: 0,
        };
    }
}

/**
 * Check if competitors are bidding on business name
 */
async function checkBusinessNameAds(input: PaidSearchModuleInput): Promise<AdPresence> {
    const query = input.businessName;

    logger.info({ query }, '[PaidSearch] Checking business name ads');

    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) {
        return {
            keyword: query,
            businessIsAdvertising: false,
            competitorAds: [],
            totalAds: 0,
        };
    }

    try {
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&location=${encodeURIComponent(input.city)}&hl=en&gl=us&google_domain=google.com&api_key=${serpApiKey}`;

        const data = await cachedFetch(
            'paid_search_name',
            { businessName: input.businessName, city: input.city },
            async () => {
                const res = await fetch(serpUrl);
                return await res.json();
            },
            { ttlHours: 24 }
        );

        const ads = data.ads || [];

        // Filter out the business's own ads (if any)
        const businessDomain = new URL(input.url).hostname.replace('www.', '');
        const competitorAds = ads
            .filter((ad: any) =>
                !ad.link?.includes(businessDomain) && !ad.displayed_link?.includes(businessDomain)
            )
            .map((ad: any) => ({
                title: ad.title,
                link: ad.link,
                displayLink: ad.displayed_link,
            }));

        return {
            keyword: query,
            businessIsAdvertising: ads.length > competitorAds.length, // Has own ads
            competitorAds,
            totalAds: ads.length,
        };

    } catch (error) {
        logger.warn({ error, query }, '[PaidSearch] Business name check failed');
        return {
            keyword: query,
            businessIsAdvertising: false,
            competitorAds: [],
            totalAds: 0,
        };
    }
}

/**
 * Detect tracking pixels on website
 */
async function detectTrackingPixels(url: string): Promise<TrackingPixels> {
    try {
        logger.info({ url }, '[PaidSearch] Detecting tracking pixels');

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOSBot/1.0)' },
        });
        const html = await response.text();

        const detectedTags: string[] = [];

        // Google Ads conversion tag (gtag with AW-)
        const hasGoogleAds = /gtag\s*\(\s*['"]config['"],\s*['"]AW-/.test(html);
        if (hasGoogleAds) {
            detectedTags.push('Google Ads Conversion');
        }

        // Google Analytics 4 (gtag with G-)
        const hasGA4 = /gtag\s*\(\s*['"]config['"],\s*['"]G-/.test(html) ||
            /googletagmanager\.com\/gtag\/js\?id=G-/.test(html);
        if (hasGA4) {
            detectedTags.push('Google Analytics 4');
        }

        // Universal Analytics (ga with UA-)
        const hasUniversalAnalytics = /ga\s*\(\s*['"]create['"],\s*['"]UA-/.test(html) ||
            /google-analytics\.com\/analytics\.js/.test(html);
        if (hasUniversalAnalytics) {
            detectedTags.push('Universal Analytics (legacy)');
        }

        // Facebook Pixel
        const hasFacebookPixel = /connect\.facebook\.net\/en_US\/fbevents\.js/.test(html) ||
            /fbq\s*\(\s*['"]init['"]/.test(html);
        if (hasFacebookPixel) {
            detectedTags.push('Facebook Pixel');
        }

        // LinkedIn Insight Tag
        const hasLinkedInInsight = /snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/.test(html) ||
            /_linkedin_partner_id/.test(html);
        if (hasLinkedInInsight) {
            detectedTags.push('LinkedIn Insight');
        }

        return {
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

    // PAINKILLER: Competitors bidding on business name
    if (analysis.competitorsBiddingOnName && analysis.businessNameAds.competitorAds.length > 0) {
        const topCompetitors = analysis.businessNameAds.competitorAds.slice(0, 3);

        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Competitors Bidding on Your Business Name',
            description: `${analysis.businessNameAds.competitorAds.length} competitor(s) are running Google Ads when people search for "${input.businessName}". This means potential customers looking specifically for YOU are seeing competitor ads first and potentially choosing them instead.`,
            impactScore: 8,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: topCompetitors.map(ad => ({
                type: 'text',
                value: `${ad.title} - ${ad.displayLink || ad.link}`,
                label: 'Competitor Ad'
            })),
            metrics: {
                competitorAdsOnName: analysis.businessNameAds.competitorAds.length,
                competitorAds: topCompetitors,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                `Run Google Ads for your own business name "${input.businessName}"`,
                'Protect your brand by appearing in ads when people search for you',
                'Typically costs $1-3 per click (defensive advertising)',
                'Consider trademark protection if competitors persist',
            ]
        });
    }

    // VITAMIN: Not running Google Ads for primary keywords
    if (!analysis.primaryKeywordAds.businessIsAdvertising && analysis.primaryKeywordAds.totalAds > 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Not Running Paid Search Ads',
            description: `You're not running any Google Ads for "${analysis.primaryKeywordAds.keyword}". ${analysis.primaryKeywordAds.totalAds} competitor(s) are appearing above you in search results.`,
            impactScore: 5,
            confidenceScore: normalizeConfidence(80, '0-100'),
            evidence: [{
                type: 'metric',
                value: analysis.primaryKeywordAds.totalAds,
                label: 'Competitor Ads Detected'
            }],
            metrics: {
                keyword: analysis.primaryKeywordAds.keyword,
                competitorAdCount: analysis.primaryKeywordAds.totalAds,
            },
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Start Google Ads campaign for primary keywords',
                `Target: "${input.businessType} ${input.city}"`,
                'Set monthly budget starting at $500-1000',
                'Focus on high-intent keywords (emergency, near me, etc.)',
                'Use call extensions and location extensions',
            ]
        });
    }

    // VITAMIN: No Google Analytics
    if (!analysis.trackingPixels.hasGA4 && !analysis.trackingPixels.hasUniversalAnalytics) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'No Analytics Tracking Installed',
            description: 'Your website has no Google Analytics. You have zero visibility into who visits your site, where they come from, or what they do. Flying blind.',
            impactScore: 6,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: [{
                type: 'text',
                value: 'No GA4 or Universal Analytics detected',
                label: 'Analytics Status'
            }],
            metrics: {
                hasGA4: false,
                hasUniversalAnalytics: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Install Google Analytics 4 (GA4)',
                'Set up conversion tracking for form submissions and calls',
                'Configure goals for key actions',
                'Link to Google Search Console',
                'Takes 30 minutes to set up',
            ]
        });
    }

    // VITAMIN: No Facebook Pixel
    if (!analysis.trackingPixels.hasFacebookPixel) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'No Facebook Pixel Installed',
            description: 'No Facebook Pixel detected. Can\'t run retargeting ads or build custom audiences from website visitors.',
            impactScore: 4,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: [{
                type: 'text',
                value: 'No Facebook Pixel detected',
                label: 'Facebook Pixel'
            }],
            metrics: {
                hasFacebookPixel: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Install Facebook Pixel on all pages',
                'Enables retargeting ads to people who visited your site',
                'Build lookalike audiences for better targeting',
                'Track conversions from Facebook ads',
            ]
        });
    }

    // POSITIVE: Business IS running ads
    if (analysis.primaryKeywordAds.businessIsAdvertising) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Active Paid Search Campaign Detected',
            description: `Business is running Google Ads for "${analysis.primaryKeywordAds.keyword}". This shows marketing investment and intent.`,
            impactScore: 2,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: [{
                type: 'text',
                value: 'Business detected in Google Ads for primary keywords',
                label: 'Paid Search Status'
            }],
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
            ]
        });
    }

    // POSITIVE: GA4 installed
    if (analysis.trackingPixels.hasGA4) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Google Analytics 4 Installed',
            description: 'GA4 is properly installed. Website traffic and conversions are being tracked.',
            impactScore: 2,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: [{
                type: 'text',
                value: 'GA4 tracking code detected',
                label: 'Analytics Status'
            }],
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
            ]
        });
    }

    return findings;
}
