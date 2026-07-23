import { cachedFetch } from '@/lib/cache/apiCache';
import { logger } from '@/lib/logger';
import { runSocialModule } from '@/lib/modules/social';
import { normalizeVertical, VERTICAL_SEARCH_QUERIES } from './config';

export interface QualifiableLeadInput {
    businessName: string;
    city: string;
    state?: string | null;
    vertical: string;
    website?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
}

interface WebsiteSignals {
    performanceScore: number | null;
    accessibilityScore: number | null;
    lcpSeconds: number | null;
    isHttps: boolean;
}

interface GbpSignals {
    found: boolean;
    placeId?: string;
    rating: number | null;
    reviewCount: number;
    photoCount: number;
    hasHours: boolean;
    ownerResponseRate: number | null;
    ownerResponseConfidence: 'direct' | 'inferred' | 'unknown';
}

interface SocialSignals {
    profileCount: number;
    platformsFound: string[];
}

interface CompetitorSignals {
    available: boolean;
    competitorNames: string[];
    avgRating: number | null;
    avgReviewCount: number | null;
    isOutperformed: boolean;
    reasons: string[];
}

export interface PainScoreComponent {
    weight: number;
    score: number;
    detail: string;
}

export interface QualificationResult {
    painScore: number;
    qualified: boolean;
    threshold: number;
    breakdown: {
        websiteSpeed: PainScoreComponent;
        mobileBroken: PainScoreComponent;
        gbpNeglected: PainScoreComponent;
        noSsl: PainScoreComponent;
        zeroReviewResponses: PainScoreComponent;
        socialDead: PainScoreComponent;
        competitorsOutperforming: PainScoreComponent;
        accessibilityViolations: PainScoreComponent;
    };
    topFindings: string[];
    summarySnippet: string;
    evidence: Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function normalizeWebsite(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
        const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://${trimmed}`;
        return new URL(normalized).toString();
    } catch {
        return null;
    }
}

function toLocation(city: string, state?: string | null): string {
    return [city, state].filter(Boolean).join(', ');
}

async function fetchWebsiteSignals(website: string | null | undefined): Promise<WebsiteSignals> {
    const normalizedWebsite = normalizeWebsite(website);
    if (!normalizedWebsite) {
        return { performanceScore: null, accessibilityScore: null, lcpSeconds: null, isHttps: false };
    }

    const isHttps = normalizedWebsite.startsWith('https://');
    const key = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!key) {
        return { performanceScore: null, accessibilityScore: null, lcpSeconds: null, isHttps };
    }

    const params = new URLSearchParams({
        url: normalizedWebsite,
        key,
        strategy: 'mobile',
    });
    params.append('category', 'performance');
    params.append('category', 'accessibility');

    const data = await cachedFetch(
        'outreach_pagespeed_mobile',
        { website: normalizedWebsite },
        async () => {
            const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`PageSpeed failed (${res.status}): ${text}`);
            }
            return res.json();
        },
        { ttlHours: 12 },
    );

    const lighthouse = (data as { lighthouseResult?: Record<string, unknown> }).lighthouseResult ?? {};
    const categories = (lighthouse.categories as Record<string, { score?: number }> | undefined) ?? {};
    const audits = (lighthouse.audits as Record<string, { numericValue?: number }> | undefined) ?? {};

    const performanceScoreRaw = categories.performance?.score;
    const accessibilityScoreRaw = categories.accessibility?.score;
    const lcpMs = audits['largest-contentful-paint']?.numericValue ?? null;

    const performanceScore = typeof performanceScoreRaw === 'number'
        ? Math.round(performanceScoreRaw * 100)
        : null;
    const accessibilityScore = typeof accessibilityScoreRaw === 'number'
        ? Math.round(accessibilityScoreRaw * 100)
        : null;

    return {
        performanceScore,
        accessibilityScore,
        lcpSeconds: typeof lcpMs === 'number' ? Number((lcpMs / 1000).toFixed(1)) : null,
        isHttps,
    };
}

async function fetchGbpSignals(input: QualifiableLeadInput): Promise<GbpSignals> {
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!placesKey) {
        return {
            found: false,
            rating: null,
            reviewCount: 0,
            photoCount: 0,
            hasHours: false,
            ownerResponseRate: null,
            ownerResponseConfidence: 'unknown',
        };
    }

    const location = toLocation(input.city, input.state);
    const searchData = await cachedFetch(
        'outreach_places_text_search',
        { businessName: input.businessName, location },
        async () => {
            const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': placesKey,
                    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
                },
                body: JSON.stringify({
                    textQuery: `${input.businessName} in ${location}`,
                    maxResultCount: 1,
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Places search failed (${res.status}): ${text}`);
            }
            return res.json() as Promise<{ places?: Array<{ id?: string }> }>;
        },
        { ttlHours: 24 },
    );

    const placeId = searchData.places?.[0]?.id;
    if (!placeId) {
        return {
            found: false,
            rating: input.rating ?? null,
            reviewCount: input.reviewCount ?? 0,
            photoCount: 0,
            hasHours: false,
            ownerResponseRate: null,
            ownerResponseConfidence: 'unknown',
        };
    }

    const details = await cachedFetch(
        'outreach_places_details',
        { placeId },
        async () => {
            const res = await fetch(`https://places.googleapis.com/v1/places/${placeId.replace(/^places\//, '')}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': placesKey,
                    'X-Goog-FieldMask': [
                        'id',
                        'rating',
                        'userRatingCount',
                        'photos',
                        'reviews',
                        'regularOpeningHours',
                        'websiteUri',
                    ].join(','),
                },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Places details failed (${res.status}): ${text}`);
            }
            return res.json() as Promise<Record<string, unknown>>;
        },
        { ttlHours: 24 * 7 },
    );

    const reviews = Array.isArray(details.reviews) ? details.reviews as Array<Record<string, unknown>> : [];
    const photoCount = Array.isArray(details.photos) ? details.photos.length : 0;
    const reviewCount = toNumber(details.userRatingCount) ?? input.reviewCount ?? 0;
    const rating = toNumber(details.rating) ?? input.rating ?? null;
    const hasHours = !!details.regularOpeningHours;

    const directResponseSignals = reviews.filter((review) =>
        Boolean(review.reviewReply || review.ownerResponse || review.response),
    ).length;

    let ownerResponseRate: number | null = null;
    let confidence: GbpSignals['ownerResponseConfidence'] = 'unknown';
    if (reviews.length > 0) {
        if (directResponseSignals > 0) {
            ownerResponseRate = directResponseSignals / reviews.length;
            confidence = 'direct';
        } else {
            ownerResponseRate = 0;
            confidence = 'inferred';
        }
    }

    return {
        found: true,
        placeId: placeId.replace(/^places\//, ''),
        rating,
        reviewCount,
        photoCount,
        hasHours,
        ownerResponseRate,
        ownerResponseConfidence: confidence,
    };
}

async function fetchSocialSignals(website: string | null | undefined, businessName: string): Promise<SocialSignals> {
    const normalized = normalizeWebsite(website);
    if (!normalized) {
        return { profileCount: 0, platformsFound: [] };
    }

    const socialResult = await runSocialModule({ websiteUrl: normalized, businessName });
    if (socialResult.status !== 'success' || socialResult.data?.skipped) {
        return { profileCount: 0, platformsFound: [] };
    }

    const platformsFound = Array.isArray(socialResult.data?.platformsFound)
        ? socialResult.data.platformsFound.filter((p: unknown): p is string => typeof p === 'string')
        : [];

    return {
        profileCount: platformsFound.length,
        platformsFound,
    };
}

async function fetchCompetitorSignals(input: QualifiableLeadInput, gbpSignals: GbpSignals): Promise<CompetitorSignals> {
    const serpApiKey = process.env.SERP_API_KEY;
    if (!serpApiKey) {
        return {
            available: false,
            competitorNames: [],
            avgRating: null,
            avgReviewCount: null,
            isOutperformed: false,
            reasons: [],
        };
    }

    const vertical = normalizeVertical(input.vertical);
    const location = toLocation(input.city, input.state);
    const seedPhrase = VERTICAL_SEARCH_QUERIES[vertical]?.[0] ?? vertical;

    const params = new URLSearchParams({
        engine: 'google_local',
        q: `${seedPhrase} in ${location}`,
        location,
        gl: 'us',
        hl: 'en',
        api_key: serpApiKey,
    });

    const data = await cachedFetch(
        'outreach_serp_competitors',
        { vertical, location },
        async () => {
            const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`SerpAPI competitors failed (${res.status}): ${text}`);
            }
            return res.json() as Promise<{ local_results?: Array<Record<string, unknown>> }>;
        },
        { ttlHours: 12 },
    );

    const localResults = Array.isArray(data.local_results) ? data.local_results : [];
    const competitors = localResults
        .slice(0, 3)
        .map((row) => ({
            name: typeof row.title === 'string' ? row.title : '',
            rating: toNumber(row.rating),
            reviews: toNumber(row.reviews),
        }))
        .filter((row) => row.name);

    if (competitors.length === 0) {
        return {
            available: false,
            competitorNames: [],
            avgRating: null,
            avgReviewCount: null,
            isOutperformed: false,
            reasons: [],
        };
    }

    const competitorRatings = competitors.map((c) => c.rating).filter((n): n is number => n !== null);
    const competitorReviewCounts = competitors.map((c) => c.reviews).filter((n): n is number => n !== null);

    const avgRating = competitorRatings.length > 0
        ? Number((competitorRatings.reduce((sum, n) => sum + n, 0) / competitorRatings.length).toFixed(2))
        : null;
    const avgReviewCount = competitorReviewCounts.length > 0
        ? Math.round(competitorReviewCounts.reduce((sum, n) => sum + n, 0) / competitorReviewCounts.length)
        : null;

    const businessRating = gbpSignals.rating ?? input.rating ?? null;
    const businessReviewCount = gbpSignals.reviewCount || input.reviewCount || 0;

    const reasons: string[] = [];
    if (avgRating !== null && businessRating !== null && avgRating >= businessRating + 0.2) {
        reasons.push(`competitor rating ${avgRating.toFixed(1)} vs ${businessRating.toFixed(1)}`);
    }
    if (avgReviewCount !== null && avgReviewCount >= Math.max(10, businessReviewCount * 1.5)) {
        reasons.push(`competitor reviews ${avgReviewCount} vs ${businessReviewCount}`);
    }

    return {
        available: true,
        competitorNames: competitors.map((c) => c.name),
        avgRating,
        avgReviewCount,
        isOutperformed: reasons.length > 0,
        reasons,
    };
}

function clampScore(score: number, weight: number): number {
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(weight, Math.round(score)));
}

function buildComponent(weight: number, score: number, detail: string): PainScoreComponent {
    return {
        weight,
        score: clampScore(score, weight),
        detail,
    };
}

function buildTopFindings(
    breakdown: QualificationResult['breakdown'],
    website: WebsiteSignals,
    gbp: GbpSignals,
    social: SocialSignals,
    competitors: CompetitorSignals,
): string[] {
    const ranked = Object.values(breakdown)
        .filter((component) => component.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    if (ranked.length === 0) {
        return ['Digital footprint is in healthy shape; no major pain spikes detected.'];
    }

    const findings: string[] = [];
    if (breakdown.websiteSpeed.score > 0) {
        findings.push(`Mobile performance is ${website.performanceScore ?? 'N/A'}/100 (LCP ${website.lcpSeconds ?? 'N/A'}s).`);
    }
    if (breakdown.gbpNeglected.score > 0) {
        findings.push(`Google profile has ${gbp.photoCount} photos and ${gbp.reviewCount} reviews.`);
    }
    if (breakdown.socialDead.score > 0) {
        findings.push(`${social.profileCount} social profiles detected from website links.`);
    }
    if (breakdown.competitorsOutperforming.score > 0 && competitors.available) {
        findings.push(`Competitors beat this business on: ${competitors.reasons.join('; ')}.`);
    }

    return findings.slice(0, 3);
}

function buildSummarySnippet(painScore: number, topFindings: string[]): string {
    const summary = topFindings.slice(0, 3).join(' ');
    return `Pain Score ${painScore}/100. ${summary}`;
}

export async function qualifyLead(
    lead: QualifiableLeadInput,
    threshold = 60,
): Promise<QualificationResult> {
    const normalizedLead: QualifiableLeadInput = {
        ...lead,
        vertical: normalizeVertical(lead.vertical),
        website: normalizeWebsite(lead.website),
    };

    const [websiteSignals, gbpSignals, socialSignals] = await Promise.all([
        fetchWebsiteSignals(normalizedLead.website),
        fetchGbpSignals(normalizedLead),
        fetchSocialSignals(normalizedLead.website, normalizedLead.businessName),
    ]);

    const competitorSignals = await fetchCompetitorSignals(normalizedLead, gbpSignals);

    const websiteSpeedScore = websiteSignals.performanceScore === null
        ? 20
        : websiteSignals.performanceScore < 40
            ? 20
            : websiteSignals.performanceScore < 55
                ? 16
                : websiteSignals.performanceScore < 70
                    ? 12
                    : websiteSignals.performanceScore < 85
                        ? 5
                        : 0;

    const mobileBrokenScore =
        websiteSignals.performanceScore === null
            ? 15
            : websiteSignals.performanceScore < 50 || (websiteSignals.lcpSeconds ?? 0) > 4.5
                ? 15
                : websiteSignals.performanceScore < 70 || (websiteSignals.lcpSeconds ?? 0) > 3.5
                    ? 8
                    : 0;

    const gbpNeglectedScore = !gbpSignals.found
        ? 15
        : Math.min(
            15,
            (gbpSignals.photoCount < 5 ? 7 : 0) +
            (gbpSignals.reviewCount < 20 ? 5 : 0) +
            (!gbpSignals.hasHours ? 3 : 0),
        );

    const noSslScore = websiteSignals.isHttps ? 0 : 10;

    const zeroReviewResponseScore = !gbpSignals.found
        ? 5
        : gbpSignals.reviewCount === 0
            ? 10
            : gbpSignals.ownerResponseRate === null
                ? 5
                : gbpSignals.ownerResponseRate === 0
                    ? 10
                    : gbpSignals.ownerResponseRate < 0.2
                        ? 6
                        : 0;

    const socialDeadScore = socialSignals.profileCount === 0
        ? 10
        : socialSignals.profileCount === 1
            ? 6
            : socialSignals.profileCount === 2
                ? 3
                : 0;

    const competitorOutperformScore = !competitorSignals.available
        ? 0
        : competitorSignals.reasons.length >= 2
            ? 10
            : competitorSignals.reasons.length === 1
                ? 6
                : 0;

    const accessibilityScore = websiteSignals.accessibilityScore === null
        ? 5
        : websiteSignals.accessibilityScore <= 50
            ? 10
            : websiteSignals.accessibilityScore <= 70
                ? 7
                : websiteSignals.accessibilityScore <= 84
                    ? 3
                    : 0;

    const breakdown: QualificationResult['breakdown'] = {
        websiteSpeed: buildComponent(
            20,
            websiteSpeedScore,
            `Website speed signal: ${websiteSignals.performanceScore ?? 'N/A'}/100`,
        ),
        mobileBroken: buildComponent(
            15,
            mobileBrokenScore,
            `Mobile UX signal: performance ${websiteSignals.performanceScore ?? 'N/A'}/100, LCP ${websiteSignals.lcpSeconds ?? 'N/A'}s`,
        ),
        gbpNeglected: buildComponent(
            15,
            gbpNeglectedScore,
            `GBP signal: ${gbpSignals.photoCount} photos, ${gbpSignals.reviewCount} reviews, hours ${gbpSignals.hasHours ? 'present' : 'missing'}`,
        ),
        noSsl: buildComponent(
            10,
            noSslScore,
            websiteSignals.isHttps ? 'HTTPS enabled' : 'HTTPS missing or not enforced',
        ),
        zeroReviewResponses: buildComponent(
            10,
            zeroReviewResponseScore,
            gbpSignals.ownerResponseRate === null
                ? `Owner response rate unavailable (${gbpSignals.ownerResponseConfidence})`
                : `Owner response rate ${(gbpSignals.ownerResponseRate * 100).toFixed(0)}%`,
        ),
        socialDead: buildComponent(
            10,
            socialDeadScore,
            `${socialSignals.profileCount} social profiles detected`,
        ),
        competitorsOutperforming: buildComponent(
            10,
            competitorOutperformScore,
            competitorSignals.reasons.length > 0
                ? competitorSignals.reasons.join('; ')
                : 'No clear competitor gap detected',
        ),
        accessibilityViolations: buildComponent(
            10,
            accessibilityScore,
            `Accessibility score ${websiteSignals.accessibilityScore ?? 'N/A'}/100`,
        ),
    };

    const painScore = Object.values(breakdown).reduce((sum, component) => sum + component.score, 0);
    const topFindings = buildTopFindings(breakdown, websiteSignals, gbpSignals, socialSignals, competitorSignals);
    const summarySnippet = buildSummarySnippet(painScore, topFindings);

    logger.info({
        event: 'outreach.qualification.complete',
        businessName: normalizedLead.businessName,
        city: normalizedLead.city,
        vertical: normalizedLead.vertical,
        painScore,
        threshold,
        qualified: painScore >= threshold,
    }, 'Outreach qualification completed');

    return {
        painScore,
        qualified: painScore >= threshold,
        threshold,
        breakdown,
        topFindings,
        summarySnippet,
        evidence: {
            websiteSignals,
            gbpSignals,
            socialSignals,
            competitorSignals,
        },
    };
}
