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
    const { topCompetitors, keyword, location, comparisonMatrix } = data;

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

    // New Logic using Comparison Matrix
    if (comparisonMatrix && comparisonMatrix.gaps) {
        const gaps = comparisonMatrix.gaps;

        // 1. Review Gap (PAINKILLER)
        const reviewGap = gaps.find((g: any) => g.metric === 'reviews');
        if (reviewGap && reviewGap.gap < -30) {
            findings.push({
                module: 'competitor',
                category: 'trust',
                type: 'PAINKILLER',
                title: `Competitors have ${Math.abs(reviewGap.gap)} more reviews on average`,
                description: `You have ${reviewGap.businessValue} reviews while top competitors average ${reviewGap.competitorAvg}. This social proof gap is costing you customers.`,
                metrics: { reviewGap: reviewGap.gap },
                impactScore: 8,
                confidenceScore: 9,
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Launch a systematic review request campaign',
                    'Automate review requests after service',
                    'Respond to all reviews to encourage more'
                ],
                evidence: [{ source: 'Comparison Matrix', gap: reviewGap.gap, competitorAvg: reviewGap.competitorAvg, matrix: comparisonMatrix }],
            });
        }

        // 2. Rating Gap (PAINKILLER)
        const ratingGap = gaps.find((g: any) => g.metric === 'rating');
        if (ratingGap && ratingGap.gap <= -0.5) {
            // Only attach matrix to the first one if not already attached? 
            // Actually, attaching to all is fine, purely data.
            findings.push({
                module: 'competitor',
                category: 'trust',
                type: 'PAINKILLER',
                title: `Rated ${Math.abs(ratingGap.gap).toFixed(1)} stars lower than competitors`,
                description: `Your rating is ${ratingGap.businessValue} vs competitor average of ${ratingGap.competitorAvg}. Customers filter by highest rated.`,
                evidence: [{ source: 'Comparison Matrix', gap: ratingGap.gap, competitorAvg: ratingGap.competitorAvg, matrix: comparisonMatrix }],
                metrics: { ratingGap: ratingGap.gap },
                impactScore: 7,
                confidenceScore: 9,
                effortEstimate: 'HIGH',
                recommendedFix: [
                    'Address root causes of negative feedback',
                    'Improve service quality',
                    'Proactively ask happy customers for 5-star reviews'
                ]
            });
        }

        // 3. Website Speed Gap (VITAMIN)
        const speedGap = gaps.find((g: any) => g.metric === 'speed');
        if (speedGap && speedGap.gap < -10) { // arbitrary threshold, if we are >10 points slower
            findings.push({
                module: 'competitor',
                category: 'performance',
                type: 'VITAMIN',
                title: 'Website is slower than competitors',
                description: `Your mobile speed score is ${speedGap.businessValue} while competitors average ${speedGap.competitorAvg}. Speed impacts ranking and conversion.`,
                evidence: [{ source: 'Comparison Matrix', gap: speedGap.gap, competitorAvg: speedGap.competitorAvg }],
                metrics: { speedGap: speedGap.gap },
                impactScore: 5,
                confidenceScore: 8,
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Optimize images',
                    'Minify code',
                    'Use better hosting'
                ]
            });
        }

        // 4. Photo Gap (VITAMIN)
        const photoGap = gaps.find((g: any) => g.metric === 'photos');
        if (photoGap && photoGap.gap < -5) {
            findings.push({
                module: 'competitor',
                category: 'visibility',
                type: 'VITAMIN',
                title: `Competitors have ${Math.abs(photoGap.gap)} more photos`,
                description: `Visuals sell. You have ${photoGap.businessValue} photos vs competitor average of ${photoGap.competitorAvg}.`,
                evidence: [{ source: 'Comparison Matrix', gap: photoGap.gap, competitorAvg: photoGap.competitorAvg }],
                metrics: { photoGap: photoGap.gap },
                impactScore: 4,
                confidenceScore: 7,
                effortEstimate: 'LOW',
                recommendedFix: [
                    'Upload high-quality team and project photos',
                    'Add photos weekly'
                ]
            });
        }

        // ONE catch-all if no specific gaps found but we still want to show "Competitor Analysis"?
        // Usually we only show Findings (issues).
        // If we want to show a "Good Job" finding? Not for now.
    } else {
        // Fallback to legacy logic (Review Count only) if matrix fails
        const avgCompetitorReviews = topCompetitors.reduce((sum: number, c: any) => sum + (c.reviews || 0), 0) / topCompetitors.length;
        // ... (legacy check logic if needed, but the Loop above covers it if matrix exists)
        // If comparisonMatrix is missing, we can run simple review check
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
    }

    return findings;
}

/**
 * Generate findings for Reputation Module
 */
export function generateReputationFindings(data: any): Finding[] {
    const findings: Finding[] = [];

    // Skip if module was skipped (no reviews)
    if (data.skipped) {
        return findings;
    }

    const { summary, reviews, negativeThemesSummary } = data;
    const { negativeRatio, responseRate, avgRating, reviewCount, commonThemes, oldestReviewMonths } = summary;

    // Finding 1: High negative review ratio (>30%)
    if (negativeRatio > 0.3) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'PAINKILLER',
            title: `${Math.round(negativeRatio * 100)}% of recent reviews are negative`,
            description: negativeThemesSummary || 'A high percentage of negative reviews is actively hurting your business reputation and driving away potential customers.',
            evidence: reviews.filter((r: any) => r.sentiment === 'negative').map((r: any) => ({
                source: 'Google Reviews',
                text: r.text,
                rating: r.rating,
            })),
            metrics: { negativeRatio, avgRating, reviewCount },
            impactScore: 8,
            confidenceScore: 9,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Address the root causes mentioned in negative reviews',
                'Respond professionally to every negative review',
                'Follow up with unhappy customers to resolve issues',
                'Implement service improvements based on feedback patterns',
            ],
        });
    }

    // Finding 2: No owner responses to reviews
    if (responseRate === 0 && reviewCount > 0) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'PAINKILLER',
            title: 'No owner responses to any Google reviews',
            description: 'Responding to reviews shows you care about customer feedback. Unanswered reviews make your business look unresponsive.',
            evidence: [{ source: 'Google Reviews', responseRate: 0, reviewCount }],
            metrics: { responseRate, reviewCount },
            impactScore: 7,
            confidenceScore: 10,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Respond to all existing reviews within the next week',
                'Thank positive reviewers and invite them back',
                'Address concerns raised in negative reviews professionally',
                'Set up notifications for new reviews',
            ],
        });
    }

    // Finding 3: Common complaint theme (appears in 3+ reviews)
    const negativeReviews = reviews.filter((r: any) => r.sentiment === 'negative');
    if (negativeReviews.length >= 3 && negativeThemesSummary) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'VITAMIN',
            title: `Recurring complaint pattern: ${negativeThemesSummary.substring(0, 50)}...`,
            description: 'Multiple customers are mentioning similar issues. This indicates a systemic problem that needs to be addressed.',
            evidence: negativeReviews.slice(0, 3).map((r: any) => ({
                source: 'Google Reviews',
                text: r.text,
                themes: r.themes,
            })),
            metrics: { commonThemes, negativeCount: negativeReviews.length },
            impactScore: 6,
            confidenceScore: 8,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Investigate the root cause of the recurring issue',
                'Implement process improvements',
                'Train staff if service-related',
                'Communicate changes to customers',
            ],
        });
    }

    // Finding 4: No recent reviews (oldest review >6 months suggests low activity)
    if (oldestReviewMonths >= 6 && reviewCount <= 5) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'VITAMIN',
            title: 'Low review activity in the past 6+ months',
            description: 'Fresh reviews signal an active business. Stale review profiles may make potential customers question if you\'re still operating.',
            evidence: [{ source: 'Google Reviews', oldestReviewMonths, reviewCount }],
            metrics: { oldestReviewMonths, reviewCount },
            impactScore: 5,
            confidenceScore: 7,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Launch a review request campaign',
                'Ask recent customers to share their experience',
                'Add review request cards or QR codes to your service flow',
            ],
        });
    }

    // Finding 5: Low response rate to negative reviews (<50%)
    const negativeWithResponse = negativeReviews.filter((r: any) => r.hasOwnerResponse).length;
    const negativeResponseRate = negativeReviews.length > 0 ? negativeWithResponse / negativeReviews.length : 1;
    if (negativeReviews.length >= 2 && negativeResponseRate < 0.5) {
        findings.push({
            module: 'reputation',
            category: 'trust',
            type: 'VITAMIN',
            title: `Only ${Math.round(negativeResponseRate * 100)}% of negative reviews have owner responses`,
            description: 'Responding to negative reviews is critical for reputation recovery. It shows potential customers you take feedback seriously.',
            evidence: negativeReviews.filter((r: any) => !r.hasOwnerResponse).slice(0, 2).map((r: any) => ({
                source: 'Google Reviews',
                text: r.text,
                rating: r.rating,
            })),
            metrics: { negativeResponseRate, negativeCount: negativeReviews.length },
            impactScore: 5,
            confidenceScore: 9,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Respond to all unanswered negative reviews',
                'Acknowledge the issue and offer to make it right',
                'Provide contact info for offline resolution',
            ],
        });
    }

    return findings;
}

/**
 * Generate findings for Social Media Module
 */
export function generateSocialFindings(data: any): Finding[] {
    const findings: Finding[] = [];

    // Skip if module was skipped (no URL or fetch failed)
    if (data.skipped) {
        return findings;
    }

    const { platformsFound, platformsMissing, totalCount, websiteUrl } = data;

    // Finding 1: No social media links found (PAINKILLER)
    if (totalCount === 0) {
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'PAINKILLER',
            title: 'No social media links found on website',
            description: 'Your website has no links to social media profiles. Customers expect to find you on social platforms to see reviews, photos, and updates.',
            evidence: [{ source: 'Website HTML', url: websiteUrl, platformsFound: 0 }],
            metrics: { platforms_found: [], platforms_missing: platformsMissing, total_count: 0 },
            impactScore: 7,
            confidenceScore: 7,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Create business profiles on Facebook and Instagram (minimum)',
                'Add social media icons/links to your website footer',
                'Post regularly to build an active presence',
            ],
        });
        return findings;
    }

    // Finding 2: Missing major platform (no Facebook OR no Instagram) - VITAMIN
    const hasFacebook = platformsFound.includes('facebook');
    const hasInstagram = platformsFound.includes('instagram');

    if (!hasFacebook || !hasInstagram) {
        const missingPlatform = !hasFacebook ? 'Facebook' : 'Instagram';
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'VITAMIN',
            title: `Missing ${missingPlatform} presence`,
            description: `${missingPlatform} is one of the most-used platforms for local businesses. Your competitors are likely active there.`,
            evidence: [{ source: 'Website HTML', url: websiteUrl, platformsFound, platformsMissing }],
            metrics: { platforms_found: platformsFound, platforms_missing: platformsMissing, total_count: totalCount },
            impactScore: 5,
            confidenceScore: 7,
            effortEstimate: 'LOW',
            recommendedFix: [
                `Create a ${missingPlatform} business page`,
                'Cross-promote your existing social profiles',
                'Add the new profile link to your website',
            ],
        });
    }

    // Finding 3: Has social links but fewer than 3 platforms - VITAMIN
    if (totalCount > 0 && totalCount < 3) {
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'VITAMIN',
            title: `Only ${totalCount} social platform${totalCount === 1 ? '' : 's'} linked`,
            description: 'Most successful local businesses maintain 3-4 active social profiles (Facebook, Instagram, LinkedIn, Google).',
            evidence: [{ source: 'Website HTML', url: websiteUrl, platformsFound }],
            metrics: { platforms_found: platformsFound, platforms_missing: platformsMissing, total_count: totalCount },
            impactScore: 4,
            confidenceScore: 7,
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Identify which platforms your target customers use',
                'Create profiles on 1-2 additional platforms',
                'Focus on consistency over quantity (post regularly on a few rather than sporadically on many)',
            ],
        });
    }

    // Finding 4: Has social links (3+) - VITAMIN (positive finding, low impact)
    if (totalCount >= 3) {
        findings.push({
            module: 'social',
            category: 'visibility',
            type: 'VITAMIN',
            title: `${totalCount} social platforms linked on website`,
            description: 'Good social presence foundation. Make sure these profiles are active with regular posts and engagement.',
            evidence: [{ source: 'Website HTML', url: websiteUrl, platformsFound }],
            metrics: { platforms_found: platformsFound, platforms_missing: platformsMissing, total_count: totalCount },
            impactScore: 2,
            confidenceScore: 6,
            effortEstimate: 'LOW',
            recommendedFix: [
                'Ensure all linked profiles are active (posted in last 30 days)',
                'Respond to comments and messages promptly',
                'Cross-post content to maximize reach',
            ],
        });
    }

    return findings;
}
