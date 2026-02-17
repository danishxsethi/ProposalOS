/**
 * Schema markup analysis — checks HTML for structured data (JSON-LD, Microdata, RDFa).
 */
import * as cheerio from 'cheerio';

export type CwvRating = 'good' | 'needs-improvement' | 'poor';

export interface SchemaCheck {
    id: string;
    present: boolean;
    keyFields?: Record<string, unknown>;
    recommendation?: string;
}

export interface SchemaAnalysis {
    hasAnyJsonLd: boolean;
    hasLocalBusinessOrOrganization: SchemaCheck;
    hasIndustrySpecific: SchemaCheck;
    hasBreadcrumb: SchemaCheck;
    hasFaq: SchemaCheck;
    hasReviewAggregateRating: SchemaCheck;
    hasSitelinksSearchbox: SchemaCheck;
    jsonLdTypes: string[];
    microdataTypes: string[];
    rdfaTypes: string[];
}

const INDUSTRY_SCHEMA_TYPES = [
    'Dentist', 'DentalClinic', 'LegalService', 'Attorney', 'LawFirm',
    'Restaurant', 'FoodEstablishment', 'LocalBusiness', 'Organization',
    'RealEstateAgent', 'AutoRepair', 'HVAC', 'Plumber', 'Electrician',
    'MedicalClinic', 'Physician', 'VeterinaryCare', 'AnimalShelter',
    'HairSalon', 'BeautySalon', 'HealthAndBeautyBusiness', 'Gym', 'ExerciseGym',
    'Store', 'RetailStore', 'HomeAndConstructionBusiness', 'GeneralContractor',
];

/**
 * Parse JSON-LD from script tags and extract @type values.
 */
function parseJsonLd(html: string): { types: string[]; items: Record<string, unknown>[] } {
    const $ = cheerio.load(html);
    const types: string[] = [];
    const items: Record<string, unknown>[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const text = $(el).html()?.trim();
            if (!text) return;

            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                return;
            }

            const process = (obj: unknown) => {
                if (obj && typeof obj === 'object') {
                    const o = obj as Record<string, unknown>;
                    if (o['@type']) {
                        const t = o['@type'];
                        if (typeof t === 'string') {
                            types.push(t);
                            items.push(o);
                        } else if (Array.isArray(t)) {
                            t.forEach((tt) => typeof tt === 'string' && types.push(tt));
                            items.push(o);
                        }
                    }
                    if (Array.isArray(o['@graph'])) {
                        (o['@graph'] as unknown[]).forEach(process);
                    }
                }
            };

            if (Array.isArray(parsed)) {
                parsed.forEach(process);
            } else {
                process(parsed);
            }
        } catch {
            // Skip invalid JSON-LD
        }
    });

    return { types: [...new Set(types)], items };
}

/**
 * Parse Microdata (itemscope/itemprop) and extract item types.
 */
function parseMicrodata(html: string): string[] {
    const $ = cheerio.load(html);
    const types: string[] = [];

    $('[itemscope][itemtype]').each((_, el) => {
        const itemtype = $(el).attr('itemtype');
        if (itemtype) {
            const type = itemtype.split('/').pop() || itemtype;
            types.push(type);
        }
    });

    return [...new Set(types)];
}

/**
 * Parse RDFa (typeof/property) and extract types.
 */
function parseRdfa(html: string): string[] {
    const $ = cheerio.load(html);
    const types: string[] = [];

    $('[typeof]').each((_, el) => {
        const typeofAttr = $(el).attr('typeof');
        if (typeofAttr) {
            typeofAttr.split(/\s+/).forEach((t) => {
                const type = t.replace(/^schema:/, '');
                if (type) types.push(type);
            });
        }
    });

    return [...new Set(types)];
}

/**
 * Analyze schema markup in HTML.
 */
export function analyzeSchemaMarkup(html: string): SchemaAnalysis {
    const { types: jsonLdTypes, items: jsonLdItems } = parseJsonLd(html);
    const microdataTypes = parseMicrodata(html);
    const rdfaTypes = parseRdfa(html);

    const allTypes = [...new Set([...jsonLdTypes, ...microdataTypes, ...rdfaTypes])];
    const hasAnyJsonLd = jsonLdTypes.length > 0;

    const hasLocalBusinessOrOrg = allTypes.some(
        (t) => t === 'LocalBusiness' || t === 'Organization' || t === 'Place'
    );
    const localBusinessItem = jsonLdItems.find(
        (i) => {
            const t = i['@type'];
            return (Array.isArray(t) ? t : [t]).some(
                (x) => x === 'LocalBusiness' || x === 'Organization' || x === 'Place'
            );
        }
    );

    const hasIndustrySpecific = allTypes.some((t) =>
        INDUSTRY_SCHEMA_TYPES.some((ind) => t.includes(ind))
    );
    const industryItem = jsonLdItems.find((i) => {
        const t = i['@type'];
        const arr = Array.isArray(t) ? t : [t];
        return arr.some((x) => typeof x === 'string' && INDUSTRY_SCHEMA_TYPES.some((ind) => x.includes(ind)));
    });

    const hasBreadcrumb = allTypes.some((t) => t === 'BreadcrumbList' || t === 'Breadcrumb');
    const hasFaq = allTypes.some((t) => t === 'FAQPage' || t === 'Question');
    const hasReview = allTypes.some((t) => t === 'AggregateRating' || t === 'Review');
    const hasSitelinks = jsonLdItems.some((i) => i['@type'] === 'WebSite' && (i as Record<string, unknown>).potentialAction);

    return {
        hasAnyJsonLd,
        hasLocalBusinessOrOrganization: {
            id: 'local-business-organization',
            present: hasLocalBusinessOrOrg,
            keyFields: localBusinessItem
                ? {
                    name: (localBusinessItem as Record<string, unknown>).name,
                    url: (localBusinessItem as Record<string, unknown>).url,
                    address: (localBusinessItem as Record<string, unknown>).address,
                    openingHours: (localBusinessItem as Record<string, unknown>).openingHours,
                }
                : undefined,
            recommendation: hasLocalBusinessOrOrg
                ? undefined
                : "Add LocalBusiness or Organization schema so Google can understand your business type, hours, and location.",
        },
        hasIndustrySpecific: {
            id: 'industry-specific',
            present: hasIndustrySpecific,
            keyFields: industryItem ? { '@type': (industryItem as Record<string, unknown>)['@type'] } : undefined,
            recommendation: hasIndustrySpecific
                ? undefined
                : "Add industry-specific schema (e.g., Dentist, LegalService, Restaurant) for better rich results.",
        },
        hasBreadcrumb: {
            id: 'breadcrumb',
            present: hasBreadcrumb,
            recommendation: hasBreadcrumb
                ? undefined
                : "Add BreadcrumbList schema to help Google understand your site structure and show breadcrumbs in search.",
        },
        hasFaq: {
            id: 'faq',
            present: hasFaq,
            recommendation: hasFaq
                ? undefined
                : "Add FAQPage schema for pages with Q&A content to enable FAQ rich results in search.",
        },
        hasReviewAggregateRating: {
            id: 'review-aggregate',
            present: hasReview,
            recommendation: hasReview
                ? undefined
                : "Add AggregateRating schema to display star ratings in search results and build trust.",
        },
        hasSitelinksSearchbox: {
            id: 'sitelinks-searchbox',
            present: hasSitelinks,
            recommendation: hasSitelinks
                ? undefined
                : "Add WebSite schema with potentialAction SearchAction to enable sitelinks search box in Google.",
        },
        jsonLdTypes,
        microdataTypes,
        rdfaTypes,
    };
}
