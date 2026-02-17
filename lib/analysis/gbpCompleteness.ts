/**
 * GBP Completeness Score — 0-100% with weighted sections and letter grade.
 * Uses Places API data; Google Posts, Q&A, services require GMB API (not exposed).
 * Weights: Hours 10%, Photos 15%, Reviews 20%, Posts 10%, Description 10%,
 * Categories 10%, Services 10%, Q&A 5%, Attributes 5%, Contact info 5%.
 */

export interface GbpCompletenessInput {
    placeId?: string;
    name?: string;
    address?: string;
    phone?: string;
    website?: string;
    openingHours?: unknown;
    types?: string[];
    primaryType?: string;
    description?: string;
    editorialSummary?: { text?: string };
    photoCount?: number;
    photos?: unknown[];
    reviewCount?: number;
    rating?: number;
    reviews?: Array<{ text?: { text?: string }; publishTime?: string }>;
    ownerResponseRate?: number;
    hasRecentPosts?: boolean;
    hasQaWithAnswers?: boolean;
    hasServicesOrProducts?: boolean;
    nameMatchesWebsite?: boolean;
    phoneMatchesWebsite?: boolean;
    hasAttributes?: boolean;
}

export interface CompletenessBreakdownItem {
    category: string;
    present: boolean;
    score: number;
    maxScore: number;
    weight: number;
    recommendation?: string;
    detail?: string;
}

export interface GbpCompletenessResult {
    overallScore: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    breakdown: CompletenessBreakdownItem[];
    quickWins: string[];
    recommendations: string[];
    competitorAvgScore: number | null;
    competitorComparison?: Array<{ metric: string; you: string; competitor: string }>;
}

/** Section weights (must sum to 100) */
const WEIGHTS = {
    contactInfo: 5,   // name + address + phone + website
    hours: 10,
    photos: 15,
    reviews: 20,
    posts: 10,
    description: 10,
    categories: 10,
    services: 10,
    qa: 5,
    attributes: 5,
};

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

function isAddressComplete(addr: string | undefined): boolean {
    if (!addr?.trim()) return false;
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length >= 3;
}

function hasValidHours(hours: unknown): boolean {
    if (!hours || typeof hours !== 'object') return false;
    const h = hours as { periods?: unknown[]; weekdayDescriptions?: string[]; weekDayDescriptions?: string[] };
    const periods = h.periods?.length ?? 0;
    const descs = (h.weekdayDescriptions ?? h.weekDayDescriptions)?.length ?? 0;
    return periods >= 1 || descs >= 1;
}

function isDescriptionOptimal(d: GbpCompletenessInput): { ok: boolean; length: number; inRange: boolean } {
    const text = (d.description || d.editorialSummary?.text || '').trim();
    const length = text.length;
    const inRange = length >= 250 && length <= 750;
    const ok = length >= 50; // Minimum usable
    return { ok, length, inRange };
}

function normalizeGbpData(data: any): GbpCompletenessInput {
    const photos = data.photos;
    const photoCount = data.photoCount ?? (Array.isArray(photos) ? photos.length : 0);
    const desc = data.description || data.editorialSummary?.text;
    const phone = data.phone || data.nationalPhoneNumber || data.internationalPhoneNumber;

    return {
        placeId: data.placeId,
        name: data.name || data.displayName?.text,
        address: data.address || data.formattedAddress,
        phone,
        website: data.website || data.websiteUri,
        openingHours: data.openingHours || data.regularOpeningHours,
        types: data.types,
        primaryType: data.primaryType || data.primaryTypeDisplayName?.text,
        description: desc,
        editorialSummary: data.editorialSummary,
        photoCount,
        photos,
        reviewCount: data.reviewCount ?? data.userRatingCount,
        rating: data.rating,
        reviews: data.reviews,
        ownerResponseRate: data.ownerResponseRate,
        hasRecentPosts: data.hasRecentPosts,
        hasQaWithAnswers: data.hasQaWithAnswers,
        hasServicesOrProducts: data.hasServicesOrProducts,
        nameMatchesWebsite: data.nameMatchesWebsite,
        phoneMatchesWebsite: data.phoneMatchesWebsite,
        hasAttributes: data.hasAttributes,
    };
}

/** Competitor data shape for comparison */
export interface CompetitorGbpData {
    name?: string;
    reviewCount?: number;
    rating?: number;
    photosCount?: number;
    hasHours?: boolean;
    hasRecentPosts?: boolean;
}

/**
 * Compute GBP completeness score with weighted sections and letter grade.
 */
export function computeGbpCompleteness(
    data: any,
    competitorScores?: number[],
    competitorData?: CompetitorGbpData[]
): GbpCompletenessResult {
    const d = normalizeGbpData(data);
    const breakdown: CompletenessBreakdownItem[] = [];
    let totalScore = 0;

    // 1. Contact info (5%): name + address + phone + website
    const nameOk = !!(d.name?.trim());
    const nameMatch = d.nameMatchesWebsite !== false;
    const addrOk = isAddressComplete(d.address);
    const phoneOk = !!(d.phone || (d as any).nationalPhoneNumber);
    const websiteOk = !!(d.website?.trim());
    const contactPoints = [nameOk && nameMatch, addrOk, phoneOk, websiteOk].filter(Boolean).length;
    const contactScore = Math.round((contactPoints / 4) * WEIGHTS.contactInfo);
    breakdown.push({
        category: 'Contact info',
        present: contactPoints === 4,
        score: contactScore,
        maxScore: WEIGHTS.contactInfo,
        weight: WEIGHTS.contactInfo,
        detail: `Name${nameMatch ? '✓' : '✗'}, Address${addrOk ? '✓' : '✗'}, Phone${phoneOk ? '✓' : '✗'}, Website${websiteOk ? '✓' : '✗'}`,
        recommendation: !nameOk ? 'Add business name in GBP' : !addrOk ? 'Add full address (street, city, state/zip)' : !phoneOk ? 'Add phone number' : !websiteOk ? 'Link your website in GBP' : !nameMatch ? 'Ensure GBP name matches your website' : undefined,
    });
    totalScore += contactScore;

    // 2. Hours (10%)
    const hoursOk = !!d.openingHours && hasValidHours(d.openingHours);
    const hoursScore = hoursOk ? WEIGHTS.hours : 0;
    breakdown.push({
        category: 'Business hours',
        present: hoursOk,
        score: hoursScore,
        maxScore: WEIGHTS.hours,
        weight: WEIGHTS.hours,
        recommendation: !hoursOk ? 'Set hours for all 7 days in GBP — add special hours for holidays' : undefined,
    });
    totalScore += hoursScore;

    // 3. Photos (15%): 10+ recommended
    const photoCount = d.photoCount ?? 0;
    const photoScore = photoCount >= 10 ? WEIGHTS.photos : photoCount >= 5 ? Math.round(WEIGHTS.photos * 0.6) : photoCount >= 1 ? Math.round(WEIGHTS.photos * 0.2) : 0;
    breakdown.push({
        category: 'Photos',
        present: photoCount >= 10,
        score: photoScore,
        maxScore: WEIGHTS.photos,
        weight: WEIGHTS.photos,
        detail: `${photoCount} photos (10+ recommended)`,
        recommendation: photoCount < 10 ? `Add ${10 - photoCount} more photos — businesses with 10+ photos get 35% more clicks` : undefined,
    });
    totalScore += photoScore;

    // 4. Reviews (20%): count + rating + response rate
    const reviewCount = d.reviewCount ?? 0;
    const rating = d.rating ?? 0;
    const respRate = d.ownerResponseRate;
    const reviewCountScore = reviewCount >= 20 ? 8 : reviewCount >= 10 ? 5 : reviewCount >= 1 ? 2 : 0;
    const ratingScore = rating >= 4 ? 8 : rating >= 3.5 ? 4 : 0;
    const respScore = respRate != null && respRate >= 0 ? (respRate >= 0.8 ? 4 : respRate > 0 ? 2 : 0) : 2; // Unknown = partial credit
    const reviewsTotal = Math.min(WEIGHTS.reviews, reviewCountScore + ratingScore + respScore);
    breakdown.push({
        category: 'Reviews',
        present: reviewCount >= 10 && rating >= 4,
        score: reviewsTotal,
        maxScore: WEIGHTS.reviews,
        weight: WEIGHTS.reviews,
        detail: `${reviewCount} reviews (${rating}★)${respRate != null && respRate >= 0 ? `, ${Math.round(respRate * 100)}% response rate` : ''}`,
        recommendation: reviewCount < 10 ? `Get more reviews — you have ${reviewCount}, aim for 20+` : rating < 4 ? 'Improve rating — address negative feedback' : respRate === 0 ? 'Respond to your reviews — 89% of consumers read business responses' : undefined,
    });
    totalScore += reviewsTotal;

    // 5. Posts (10%) — GMB only
    const postsOk = !!d.hasRecentPosts;
    const postsScore = postsOk ? WEIGHTS.posts : 0;
    breakdown.push({
        category: 'Google Posts',
        present: postsOk,
        score: postsScore,
        maxScore: WEIGHTS.posts,
        weight: WEIGHTS.posts,
        recommendation: !postsOk ? 'Start posting weekly Google updates — active profiles rank higher in local search' : undefined,
    });
    totalScore += postsScore;

    // 6. Description (10%): 250-750 chars optimal
    const descCheck = isDescriptionOptimal(d);
    const descScore = descCheck.inRange ? WEIGHTS.description : descCheck.ok ? Math.round(WEIGHTS.description * 0.6) : 0;
    breakdown.push({
        category: 'Business description',
        present: descCheck.inRange,
        score: descScore,
        maxScore: WEIGHTS.description,
        weight: WEIGHTS.description,
        detail: `${descCheck.length} chars (250-750 optimal)`,
        recommendation: !descCheck.ok ? 'Add a business description (250-750 chars with keywords)' : !descCheck.inRange ? `Expand description to 250-750 chars (you have ${descCheck.length}) — include services and location keywords` : undefined,
    });
    totalScore += descScore;

    // 7. Categories (10%): primary + 2-5 additional
    const types = d.types || [];
    const hasPrimary = !!(d.primaryType || types[0]);
    const additionalCount = types.length > 1 ? types.length - 1 : 0;
    const categoriesOptimal = hasPrimary && additionalCount >= 2 && additionalCount <= 5;
    const catScore = categoriesOptimal ? WEIGHTS.categories : hasPrimary ? Math.round(WEIGHTS.categories * 0.5) : 0;
    breakdown.push({
        category: 'Categories',
        present: categoriesOptimal,
        score: catScore,
        maxScore: WEIGHTS.categories,
        weight: WEIGHTS.categories,
        detail: `Primary + ${additionalCount} additional (2-5 recommended)`,
        recommendation: !hasPrimary ? 'Set primary category in GBP' : additionalCount < 2 ? 'Add 2-5 additional categories to improve discoverability' : undefined,
    });
    totalScore += catScore;

    // 8. Services (10%) — GMB only
    const servicesOk = !!d.hasServicesOrProducts;
    const servicesScore = servicesOk ? WEIGHTS.services : 0;
    breakdown.push({
        category: 'Services/Products',
        present: servicesOk,
        score: servicesScore,
        maxScore: WEIGHTS.services,
        weight: WEIGHTS.services,
        recommendation: !servicesOk ? 'List services or products in GBP — include prices where possible' : undefined,
    });
    totalScore += servicesScore;

    // 9. Q&A (5%) — GMB only
    const qaOk = !!d.hasQaWithAnswers;
    const qaScore = qaOk ? WEIGHTS.qa : 0;
    breakdown.push({
        category: 'Q&A',
        present: qaOk,
        score: qaScore,
        maxScore: WEIGHTS.qa,
        weight: WEIGHTS.qa,
        recommendation: !qaOk ? 'Add Q&A and answer common questions — helps with "near me" searches' : undefined,
    });
    totalScore += qaScore;

    // 10. Attributes (5%)
    const attrsOk = !!d.hasAttributes;
    const attrsScore = attrsOk ? WEIGHTS.attributes : 0;
    breakdown.push({
        category: 'Attributes',
        present: attrsOk,
        score: attrsScore,
        maxScore: WEIGHTS.attributes,
        weight: WEIGHTS.attributes,
        recommendation: !attrsOk ? 'Set attributes (wheelchair accessible, free wifi, payment methods) in GBP' : undefined,
    });
    totalScore += attrsScore;

    const overallScore = Math.min(100, Math.round(totalScore));
    const grade = getGrade(overallScore);

    // Quick wins (top 3 missing)
    const quickWins = breakdown
        .filter((b) => !b.present && b.recommendation)
        .sort((a, b) => b.maxScore - a.maxScore)
        .slice(0, 3)
        .map((b) => b.recommendation!)
        .filter(Boolean);

    // Actionable recommendations with stats
    const recommendations: string[] = [];
    if (photoCount < 10 && photoCount > 0) {
        recommendations.push(`Add ${10 - photoCount} more photos of your office interior — businesses with 10+ photos get 35% more clicks`);
    } else if (photoCount === 0) {
        recommendations.push('Upload 10+ photos (exterior, interior, team, products) — businesses with photos get 35% more clicks');
    }
    if (reviewCount > 0 && respRate === 0) {
        recommendations.push(`Respond to your ${reviewCount} unanswered reviews — 89% of consumers read business responses`);
    }
    if (!postsOk) {
        recommendations.push('Start posting weekly Google updates — active profiles rank higher in local search');
    }
    if (!descCheck.ok) {
        recommendations.push('Add a 250-750 character description with keywords — helps with local SEO');
    }
    if (!hoursOk) {
        recommendations.push('Set business hours for all 7 days — add special hours for holidays');
    }
    if (!attrsOk) {
        recommendations.push('Add attributes (wheelchair accessible, free wifi) — key filters in voice search');
    }

    const competitorAvgScore =
        competitorScores?.length && competitorScores.length > 0
            ? Math.round(competitorScores.reduce((a, b) => a + b, 0) / competitorScores.length)
            : null;

    // Build competitor comparison if data available
    const competitorComparison: Array<{ metric: string; you: string; competitor: string }> = [];
    if (competitorData?.length && competitorData[0]) {
        const top = competitorData[0];
        competitorComparison.push({
            metric: 'Reviews',
            you: `${reviewCount} reviews (${rating}★)`,
            competitor: `${top.reviewCount ?? 0} reviews (${(top.rating ?? 0).toFixed(1)}★)`,
        });
        competitorComparison.push({
            metric: 'Photos',
            you: `${photoCount} photos`,
            competitor: `${top.photosCount ?? 0} photos`,
        });
        if (!postsOk && top.hasRecentPosts) {
            competitorComparison.push({
                metric: 'Google Posts',
                you: 'Last post 3+ months ago',
                competitor: 'Posted this week',
            });
        }
    }

    return {
        overallScore,
        grade,
        breakdown,
        quickWins,
        recommendations: recommendations.length > 0 ? recommendations : ['No major improvements needed. Maintain current standards.'],
        competitorAvgScore,
        competitorComparison: competitorComparison.length > 0 ? competitorComparison : undefined,
    };
}
