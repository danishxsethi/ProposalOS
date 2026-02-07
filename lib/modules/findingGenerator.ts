import { FindingType, EffortLevel } from '@prisma/client';

export interface Finding {
    module: string;
    category: string;
    type: FindingType;
    title: string;
    description?: string;
    evidence: any[];
    metrics: any;
    impactScore: number;
    confidenceScore: number;
    effortEstimate?: EffortLevel;
    recommendedFix: any[];
}

/**
 * Generate findings for Website Module
 */
export function generateWebsiteFindings(data: any): Finding[] {
    const findings: Finding[] = [];
    const { scores, coreWebVitals, finalUrl } = data;

    // Finding 1: Performance Score
    const perfScore = Math.round(scores.performance * 100);
    if (perfScore < 90) {
        findings.push({
            module: 'website',
            category: 'performance',
            type: perfScore < 50 ? 'PAINKILLER' : 'VITAMIN',
            title: `Page speed score is ${perfScore}/100 on mobile`,
            description: perfScore < 50
                ? 'Poor page speed is actively losing you visitors and revenue. Most users abandon slow sites.'
                : 'Page speed could be improved to enhance user experience and SEO rankings.',
            evidence: [{ source: 'PageSpeed Insights', score: perfScore, url: finalUrl }],
            metrics: { performanceScore: perfScore },
            impactScore: perfScore < 30 ? 10 : perfScore < 50 ? 8 : perfScore < 70 ? 6 : 4,
            confidenceScore: 10,
            effortEstimate: perfScore < 50 ? 'MEDIUM' : 'LOW',
            recommendedFix: [
                'Optimize images (compress, use WebP)',
                'Minimize CSS and JavaScript',
                'Enable browser caching',
                'Use a CDN for static assets'
            ],
        });
    }

    // Finding 2: SEO Score
    const seoScore = Math.round(scores.seo * 100);
    if (seoScore < 90) {
        findings.push({
            module: 'website',
            category: 'visibility',
            type: 'VITAMIN',
            title: `SEO score is ${seoScore}/100`,
            description: 'Search engines may not be indexing your site optimally.',
            evidence: [{ source: 'PageSpeed Insights', score: seoScore }],
            metrics: { seoScore },
            impactScore: seoScore < 50 ? 7 : 5,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add missing meta descriptions',
                'Ensure all images have alt text',
                'Fix broken links',
                'Improve heading structure'
            ],
        });
    }

    // Finding 3: Accessibility Score
    const a11yScore = Math.round(scores.accessibility * 100);
    if (a11yScore < 90) {
        findings.push({
            module: 'website',
            category: 'trust',
            type: 'VITAMIN',
            title: `Accessibility score is ${a11yScore}/100`,
            description: 'Your site may be difficult to use for people with disabilities, limiting your audience.',
            evidence: [{ source: 'PageSpeed Insights', score: a11yScore }],
            metrics: { accessibilityScore: a11yScore },
            impactScore: 4,
            confidenceScore: 9,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add ARIA labels to interactive elements',
                'Ensure sufficient color contrast',
                'Make site keyboard-navigable'
            ],
        });
    }

    return findings;
}

/**
 * Generate findings for GBP Module
 */
export function generateGBPFindings(data: any, businessName: string): Finding[] {
    const findings: Finding[] = [];
    const { rating, reviewCount, website, photos, openingHours } = data;

    // Finding 1: Low Rating or Review Count
    if (rating < 4.0 || reviewCount < 10) {
        const impact = rating < 3.5 ? 9 : rating < 4.0 ? 7 : reviewCount < 10 ? 7 : 5;
        findings.push({
            module: 'gbp',
            category: 'trust',
            type: 'PAINKILLER',
            title: `GBP rating is ${rating}/5 with ${reviewCount} reviews`,
            description: rating < 4.0
                ? 'Low ratings directly hurt customer trust. Most people won\'t call a business rated below 4.0.'
                : 'You need more reviews to build credibility. Competitors with 25+ reviews will outrank you.',
            evidence: [{ source: 'Google Business Profile', rating, reviewCount }],
            metrics: { rating, reviewCount },
            impactScore: impact,
            confidenceScore: 10,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Ask satisfied customers to leave reviews',
                'Respond to all existing reviews',
                'Address negative feedback professionally'
            ],
        });
    }

    // Finding 2: No Website Linked
    if (!website) {
        findings.push({
            module: 'gbp',
            category: 'conversion',
            type: 'PAINKILLER',
            title: 'No website linked in Google Business Profile',
            description: 'Customers searching for you on Google can\'t find your website, losing you potential business.',
            evidence: [{ source: 'Google Business Profile', website: null }],
            metrics: { hasWebsite: false },
            impactScore: 8,
            confidenceScore: 10,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add your website URL to your GBP listing',
                'If you don\'t have a website, create a simple one-page site'
            ],
        });
    }

    // Finding 3: Low Photo Count
    const photoCount = photos?.length || 0;
    if (photoCount < 10) {
        findings.push({
            module: 'gbp',
            category: 'visibility',
            type: 'VITAMIN',
            title: `Only ${photoCount} photos on GBP (recommend 10+)`,
            description: 'Businesses with more photos get more clicks and calls from Google Search.',
            evidence: [{ source: 'Google Business Profile', photoCount }],
            metrics: { photoCount },
            impactScore: photoCount === 0 ? 7 : photoCount < 5 ? 5 : 3,
            confidenceScore: 8,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Upload high-quality photos of your business, products, and team',
                'Add photos monthly to keep your profile fresh'
            ],
        });
    }

    // Finding 4: Missing Hours
    if (!openingHours) {
        findings.push({
            module: 'gbp',
            category: 'visibility',
            type: 'VITAMIN',
            title: 'Business hours not set on Google',
            description: 'Customers can\'t see when you\'re open, which may cause them to choose a competitor instead.',
            evidence: [{ source: 'Google Business Profile', hasHours: false }],
            metrics: { hasHours: false },
            impactScore: 6,
            confidenceScore: 10,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Set your business hours in Google Business Profile',
                'Mark special hours for holidays'
            ],
        });
    }

    return findings;
}

/**
 * Generate findings for Competitor Module
 */
export function generateCompetitorFindings(data: any, businessName: string): Finding[] {
    const findings: Finding[] = [];
    const { topCompetitors, keyword, location } = data;

    if (!topCompetitors || topCompetitors.length === 0) {
        // No local pack results - this itself is a finding
        findings.push({
            module: 'competitor',
            category: 'visibility',
            type: 'PAINKILLER',
            title: `Not appearing in local search for "${keyword}"`,
            description: 'You don\'t show up when people search for your services in your area. Competitors are getting all the clicks.',
            evidence: [{ source: 'SerpAPI', keyword, location, found: false }],
            metrics: { inLocalPack: false },
            impactScore: 8,
            confidenceScore: 7,
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Optimize your Google Business Profile',
                'Get more reviews',
                'Add location keywords to your website'
            ],
        });
        return findings;
    }

    // Check if target business is in results (we'd need to compare names)
    // For MVP, assume they're not if we got here
    const avgCompetitorReviews = topCompetitors.reduce((sum: number, c: any) => sum + (c.reviews || 0), 0) / topCompetitors.length;

    findings.push({
        module: 'competitor',
        category: 'trust',
        type: 'PAINKILLER',
        title: `Top competitors average ${Math.round(avgCompetitorReviews)} reviews`,
        description: 'Your competitors have more social proof. To compete, you need to close the review gap.',
        evidence: topCompetitors.map((c: any) => ({
            source: 'SerpAPI',
            name: c.name,
            reviews: c.reviews,
            rating: c.rating,
            position: c.position
        })),
        metrics: { competitorAvgReviews: avgCompetitorReviews },
        impactScore: avgCompetitorReviews > 50 ? 8 : avgCompetitorReviews > 20 ? 6 : 4,
        confidenceScore: 8,
        effortEstimate: 'MEDIUM',
        recommendedFix: [
            'Launch a systematic review request campaign',
            'Follow up with every satisfied customer',
            'Make leaving a review as easy as possible (QR codes, links)'
        ],
    });

    return findings;
}
