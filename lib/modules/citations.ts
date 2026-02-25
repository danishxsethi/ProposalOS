import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { cachedFetch } from '@/lib/cache/apiCache';
import * as cheerio from 'cheerio';

export interface CitationsModuleInput {
    businessName: string;
    city: string;
    state?: string;
    address?: string;
    phone?: string;
}

interface DirectoryListing {
    directory: string;
    found: boolean;
    url?: string;
    name?: string;
    address?: string;
    phone?: string;
    rating?: number;
    reviewCount?: number;
    verified?: boolean;
}

interface NAPConsistency {
    nameMatches: number;
    addressMatches: number;
    phoneMatches: number;
    totalDirectories: number;
    consistencyScore: number; // 0-100
    inconsistencies: string[];
}

interface CitationAnalysis {
    listings: DirectoryListing[];
    napConsistency: NAPConsistency;
    totalFound: number;
    totalChecked: number;
}

/**
 * Run citations module - check business listings across directories
 */
export async function runCitationsModule(
    input: CitationsModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ businessName: input.businessName, city: input.city }, '[Citations] Starting citation analysis');

    try {
        const analysis = await analyzeCitations(input, tracker);
        const findings = generateCitationFindings(analysis, input);

        const evidenceSnapshot = {
            module: 'citations',
            source: 'directory_search',
            rawResponse: {
                listings: analysis.listings,
                napConsistency: analysis.napConsistency,
                totalFound: analysis.totalFound,
            },
            collectedAt: new Date(),
        };

        logger.info({
            businessName: input.businessName,
            totalFound: analysis.totalFound,
            consistencyScore: analysis.napConsistency.consistencyScore,
            findingsCount: findings.length,
        }, '[Citations] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, businessName: input.businessName }, '[Citations] Analysis failed');

        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Visibility',
                title: 'Citation Analysis Unavailable',
                description: 'Unable to check business listings across directories. This may indicate API issues or network problems.',
                impactScore: 1,
                confidenceScore: normalizeConfidence(50, '0-100'),
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Try running citation analysis again later'],
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Analyze citations across multiple directories
 */
async function analyzeCitations(
    input: CitationsModuleInput,
    tracker?: CostTracker
): Promise<CitationAnalysis> {
    const listings: DirectoryListing[] = [];

    // Check each directory
    const yelpListing = await checkYelp(input, tracker);
    listings.push(yelpListing);

    const facebookListing = await checkFacebook(input, tracker);
    listings.push(facebookListing);

    const bbbListing = await checkBBB(input, tracker);
    listings.push(bbbListing);

    const yellowPagesListing = await checkYellowPages(input, tracker);
    listings.push(yellowPagesListing);

    const appleMapsListing = await checkAppleMaps(input, tracker);
    listings.push(appleMapsListing);

    // Calculate NAP consistency
    const foundListings = listings.filter(l => l.found);
    const napConsistency = calculateNAPConsistency(input, foundListings);

    return {
        listings,
        napConsistency,
        totalFound: foundListings.length,
        totalChecked: listings.length,
    };
}

/**
 * Check Yelp listing
 */
async function checkYelp(input: CitationsModuleInput, tracker?: CostTracker): Promise<DirectoryListing> {
    try {
        const searchQuery = `${input.businessName} ${input.city}`;
        const url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(input.businessName)}&find_loc=${encodeURIComponent(input.city)}`;

        logger.info({ searchQuery }, '[Citations] Checking Yelp');

        // Use SerpAPI to search Yelp
        const serpApiKey = process.env.SERP_API_KEY;

        if (!serpApiKey) {
            // Fallback: direct HTTP scraping (less reliable)
            const html = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOSBot/1.0)' },
            }).then(r => r.text());

            const $ = cheerio.load(html);
            const firstResult = $('.businessName').first();

            if (firstResult.length === 0) {
                return { directory: 'Yelp', found: false };
            }

            const name = firstResult.text().trim();
            const rating = parseFloat($('.rating').first().attr('aria-label')?.match(/(\d+\.?\d*)/)?.[1] || '0');
            const reviewCount = parseInt($('.reviewCount').first().text().match(/\d+/)?.[0] || '0');

            return {
                directory: 'Yelp',
                found: true,
                url: `https://yelp.com${$('a').first().attr('href')}`,
                name,
                rating,
                reviewCount,
            };
        }

        // Use SerpAPI
        tracker?.addApiCall('SERP');
        const serpUrl = `https://serpapi.com/search.json?engine=yelp&find_desc=${encodeURIComponent(input.businessName)}&find_loc=${encodeURIComponent(input.city)}&api_key=${serpApiKey}`;

        const data = await cachedFetch(
            'citations_yelp',
            { business: input.businessName, city: input.city },
            async () => {
                const res = await fetch(serpUrl);
                return await res.json();
            },
            { ttlHours: 168 } // 7 days
        );

        if (!data.organic_results || data.organic_results.length === 0) {
            return { directory: 'Yelp', found: false };
        }

        const firstResult = data.organic_results[0];

        return {
            directory: 'Yelp',
            found: true,
            url: firstResult.link,
            name: firstResult.title,
            rating: firstResult.rating,
            reviewCount: firstResult.reviews,
        };

    } catch (error) {
        logger.warn({ error }, '[Citations] Yelp check failed');
        return { directory: 'Yelp', found: false };
    }
}

/**
 * Check Facebook business page
 */
async function checkFacebook(input: CitationsModuleInput, tracker?: CostTracker): Promise<DirectoryListing> {
    try {
        // Use Google search with site: operator
        const searchQuery = `site:facebook.com "${input.businessName}" "${input.city}"`;

        logger.info({ searchQuery }, '[Citations] Checking Facebook');

        const serpApiKey = process.env.SERP_API_KEY;

        if (!serpApiKey) {
            return { directory: 'Facebook', found: false };
        }

        tracker?.addApiCall('SERP');
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}`;

        const data = await cachedFetch(
            'citations_facebook',
            { business: input.businessName, city: input.city },
            async () => {
                const res = await fetch(serpUrl);
                return await res.json();
            },
            { ttlHours: 168 }
        );

        if (!data.organic_results || data.organic_results.length === 0) {
            return { directory: 'Facebook', found: false };
        }

        const facebookPage = data.organic_results.find((r: any) =>
            r.link?.includes('facebook.com') && !r.link?.includes('/posts/')
        );

        if (!facebookPage) {
            return { directory: 'Facebook', found: false };
        }

        return {
            directory: 'Facebook',
            found: true,
            url: facebookPage.link,
            name: facebookPage.title,
        };

    } catch (error) {
        logger.warn({ error }, '[Citations] Facebook check failed');
        return { directory: 'Facebook', found: false };
    }
}

/**
 * Check BBB (Better Business Bureau)
 */
async function checkBBB(input: CitationsModuleInput, tracker?: CostTracker): Promise<DirectoryListing> {
    try {
        const searchQuery = `${input.businessName} ${input.city}`;
        const url = `https://www.bbb.org/search?find_country=USA&find_text=${encodeURIComponent(searchQuery)}`;

        logger.info({ searchQuery }, '[Citations] Checking BBB');

        // Direct scraping (BBB is scrapable)
        const html = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOSBot/1.0)' },
        }).then(r => r.text());

        const $ = cheerio.load(html);
        const firstResult = $('.result-item').first();

        if (firstResult.length === 0) {
            return { directory: 'BBB', found: false };
        }

        const name = firstResult.find('.business-name').text().trim();
        const ratingText = firstResult.find('.rating').text().trim();
        const rating = ratingText.match(/([A-F][+-]?)/)?.[1];
        const accredited = firstResult.find('.accredited-badge').length > 0;

        return {
            directory: 'BBB',
            found: true,
            url: `https://bbb.org${firstResult.find('a').attr('href')}`,
            name,
            verified: accredited,
        };

    } catch (error) {
        logger.warn({ error }, '[Citations] BBB check failed');
        return { directory: 'BBB', found: false };
    }
}

/**
 * Check Yellow Pages
 */
async function checkYellowPages(input: CitationsModuleInput, tracker?: CostTracker): Promise<DirectoryListing> {
    try {
        const searchQuery = `${input.businessName} ${input.city}`;
        const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(searchQuery)}&geo_location_terms=${encodeURIComponent(input.city)}`;

        logger.info({ searchQuery }, '[Citations] Checking Yellow Pages');

        // Direct scraping
        const html = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProposalOSBot/1.0)' },
        }).then(r => r.text());

        const $ = cheerio.load(html);
        const firstResult = $('.result').first();

        if (firstResult.length === 0) {
            return { directory: 'Yellow Pages', found: false };
        }

        const name = firstResult.find('.business-name').text().trim();
        const phone = firstResult.find('.phone').text().trim();
        const address = firstResult.find('.street-address').text().trim();

        return {
            directory: 'Yellow Pages',
            found: true,
            url: `https://yellowpages.com${firstResult.find('a').attr('href')}`,
            name,
            phone,
            address,
        };

    } catch (error) {
        logger.warn({ error }, '[Citations] Yellow Pages check failed');
        return { directory: 'Yellow Pages', found: false };
    }
}

/**
 * Check Apple Maps (using Maps URL scheme)
 */
async function checkAppleMaps(input: CitationsModuleInput, tracker?: CostTracker): Promise<DirectoryListing> {
    try {
        // Apple Maps doesn't have a public API, so we use Google to search for Apple Maps links
        const searchQuery = `site:maps.apple.com "${input.businessName}" "${input.city}"`;

        logger.info({ searchQuery }, '[Citations] Checking Apple Maps');

        const serpApiKey = process.env.SERP_API_KEY;

        if (!serpApiKey) {
            return { directory: 'Apple Maps', found: false };
        }

        tracker?.addApiCall('SERP');
        const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}`;

        const data = await cachedFetch(
            'citations_apple_maps',
            { business: input.businessName, city: input.city },
            async () => {
                const res = await fetch(serpUrl);
                return await res.json();
            },
            { ttlHours: 168 }
        );

        if (!data.organic_results || data.organic_results.length === 0) {
            return { directory: 'Apple Maps', found: false };
        }

        const appleMapsResult = data.organic_results.find((r: any) =>
            r.link?.includes('maps.apple.com')
        );

        if (!appleMapsResult) {
            return { directory: 'Apple Maps', found: false };
        }

        return {
            directory: 'Apple Maps',
            found: true,
            url: appleMapsResult.link,
            name: appleMapsResult.title,
        };

    } catch (error) {
        logger.warn({ error }, '[Citations] Apple Maps check failed');
        return { directory: 'Apple Maps', found: false };
    }
}

/**
 * Calculate NAP consistency across found listings
 */
function calculateNAPConsistency(
    expected: CitationsModuleInput,
    listings: DirectoryListing[]
): NAPConsistency {
    if (listings.length === 0) {
        return {
            nameMatches: 0,
            addressMatches: 0,
            phoneMatches: 0,
            totalDirectories: 0,
            consistencyScore: 0,
            inconsistencies: [],
        };
    }

    let nameMatches = 0;
    let addressMatches = 0;
    let phoneMatches = 0;
    const inconsistencies: string[] = [];

    const normalizePhone = (phone?: string) =>
        phone?.replace(/[\s\-\.\(\)]/g, '').replace(/^\+?1/, '') || '';

    const normalizeName = (name?: string) =>
        name?.toLowerCase().replace(/[^\w\s]/g, '').trim() || '';

    const normalizeAddress = (address?: string) =>
        address?.toLowerCase().replace(/[^\w\s]/g, '').trim() || '';

    const expectedPhone = normalizePhone(expected.phone);
    const expectedName = normalizeName(expected.businessName);
    const expectedAddress = normalizeAddress(expected.address);

    listings.forEach(listing => {
        if (!listing.found) return;

        // Check name
        const listedName = normalizeName(listing.name);
        if (listedName && expectedName && listedName.includes(expectedName.slice(0, 10))) {
            nameMatches++;
        } else if (listedName && expectedName) {
            inconsistencies.push(`${listing.directory}: Name mismatch ("${listing.name}")`);
        }

        // Check phone
        const listedPhone = normalizePhone(listing.phone);
        if (listedPhone && expectedPhone && listedPhone === expectedPhone) {
            phoneMatches++;
        } else if (listedPhone && expectedPhone && listedPhone !== expectedPhone) {
            inconsistencies.push(`${listing.directory}: Phone mismatch (${listing.phone})`);
        }

        // Check address
        const listedAddress = normalizeAddress(listing.address);
        if (listedAddress && expectedAddress && listedAddress.includes(expectedAddress.slice(0, 15))) {
            addressMatches++;
        } else if (listedAddress && expectedAddress && !listedAddress.includes(expectedAddress.slice(0, 15))) {
            inconsistencies.push(`${listing.directory}: Address mismatch`);
        }
    });

    const totalMatches = nameMatches + phoneMatches + addressMatches;
    const totalPossible = listings.length * 3; // 3 fields per listing
    const consistencyScore = Math.round((totalMatches / totalPossible) * 100);

    return {
        nameMatches,
        addressMatches,
        phoneMatches,
        totalDirectories: listings.length,
        consistencyScore,
        inconsistencies,
    };
}

/**
 * Generate findings from citation analysis
 */
function generateCitationFindings(
    analysis: CitationAnalysis,
    input: CitationsModuleInput
): Finding[] {
    const findings: Finding[] = [];

    const yelpListing = analysis.listings.find(l => l.directory === 'Yelp');
    const facebookListing = analysis.listings.find(l => l.directory === 'Facebook');
    const bbbListing = analysis.listings.find(l => l.directory === 'BBB');
    const yellowPagesListing = analysis.listings.find(l => l.directory === 'Yellow Pages');

    // PAINKILLER: Not listed on Yelp
    if (yelpListing && !yelpListing.found) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'Not Listed on Yelp',
            description: 'Business is not found on Yelp. Over 50% of consumers check Yelp before choosing a local business. Missing this listing costs you customers.',
            impactScore: 7,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{
                type: 'text',
                value: 'Not found on Yelp',
                label: 'Yelp Status'
            }],
            metrics: {
                yelpFound: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Claim or create Yelp business listing',
                'Add complete business information',
                'Upload high-quality photos',
                'Encourage customers to leave reviews',
            ]
        });
    }

    // PAINKILLER: NAP inconsistency
    if (analysis.napConsistency.inconsistencies.length > 0) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Visibility',
            title: 'NAP Inconsistencies Detected',
            description: `Found ${analysis.napConsistency.inconsistencies.length} inconsistencies in Name, Address, or Phone across directories. This confuses search engines and damages local SEO rankings.`,
            impactScore: 8,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: analysis.napConsistency.inconsistencies.slice(0, 5).map(inc => ({
                type: 'text',
                value: inc,
                label: 'Inconsistency'
            })),
            metrics: {
                inconsistencyCount: analysis.napConsistency.inconsistencies.length,
                consistencyScore: analysis.napConsistency.consistencyScore,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Update all listings to match exact NAP from Google Business Profile',
                'Ensure phone number format is consistent',
                'Use same business name spelling everywhere',
                'Update old addresses on all directories',
            ]
        });
    }

    // VITAMIN: Not on BBB
    if (bbbListing && !bbbListing.found) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Not Listed on BBB',
            description: 'Business is not found on Better Business Bureau. BBB accreditation builds trust and improves local search visibility.',
            impactScore: 4,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: [{
                type: 'text',
                value: 'Not found on BBB',
                label: 'BBB Status'
            }],
            metrics: {
                bbbFound: false,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Register business with BBB',
                'Consider BBB accreditation ($400-1000/year)',
                'Display BBB badge on website if accredited',
            ]
        });
    }

    // VITAMIN: Not on Yellow Pages
    if (yellowPagesListing && !yellowPagesListing.found) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Not Listed on Yellow Pages',
            description: 'Business is not found on Yellow Pages. While less critical than Yelp, it is still a trusted directory that drives local traffic.',
            impactScore: 3,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: [{
                type: 'text',
                value: 'Not found on Yellow Pages',
                label: 'Yellow Pages Status'
            }],
            metrics: {
                yellowPagesFound: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Claim or create Yellow Pages listing',
                'Add complete business details',
                'Keep information up to date',
            ]
        });
    }

    // VITAMIN: Listed on <3 directories
    if (analysis.totalFound < 3) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Limited Directory Presence',
            description: `Business is only listed on ${analysis.totalFound} out of ${analysis.totalChecked} checked directories. More citations improve local SEO and make you easier to find.`,
            impactScore: 6,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{
                type: 'metric',
                value: analysis.totalFound,
                label: 'Directories Found'
            }],
            metrics: {
                totalFound: analysis.totalFound,
                totalChecked: analysis.totalChecked,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Create listings on Yelp, Facebook, BBB, Yellow Pages',
                'Ensure NAP is consistent across all',
                'Add to industry-specific directories',
                'Consider citation building service for 50+ directories',
            ]
        });
    }

    // VITAMIN: No Facebook business page
    if (facebookListing && !facebookListing.found) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'No Facebook Business Page',
            description: 'Business does not have a Facebook page. With 2.9 billion users, Facebook is critical for local visibility and customer engagement.',
            impactScore: 5,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{
                type: 'text',
                value: 'Facebook page not found',
                label: 'Facebook Status'
            }],
            metrics: {
                facebookFound: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Create Facebook business page',
                'Add complete business information',
                'Post regularly (2-3 times per week)',
                'Respond to messages and reviews',
                'Run occasional promoted posts',
            ]
        });
    }

    // POSITIVE: Strong citation consistency
    if (analysis.napConsistency.consistencyScore >= 80 && analysis.totalFound >= 3) {
        findings.push({
            type: 'VITAMIN',
            category: 'Visibility',
            title: 'Strong Citation Consistency',
            description: `Excellent NAP consistency (${analysis.napConsistency.consistencyScore}% match) across ${analysis.totalFound} directories. This strengthens local SEO.`,
            impactScore: 2,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: [{
                type: 'metric',
                value: analysis.napConsistency.consistencyScore,
                label: 'Consistency Score'
            }],
            metrics: {
                consistencyScore: analysis.napConsistency.consistencyScore,
                totalDirectories: analysis.totalFound,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Maintain current NAP consistency',
                'Monitor listings quarterly for accuracy',
                'Update all listings if business info changes',
            ]
        });
    }

    return findings;
}
