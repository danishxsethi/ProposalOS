/**
 * Schema Markup Analysis Module
 * Fetches target URL HTML, parses JSON-LD/Microdata/RDFa, validates completeness by vertical.
 */
import * as cheerio from 'cheerio';
import { LegacyAuditModuleResult } from './types';
import type { CostTracker } from '@/lib/costs/costTracker';

export interface SchemaMarkupResult {
    status: 'success' | 'error';
    data: {
        schemasFound: Array<{
            type: string;
            source: 'json-ld' | 'microdata' | 'rdfa';
            completeness: number;
            missingProperties: string[];
        }>;
        schemasExpected: string[];
        schemasMissing: string[];
        score: number;
        recommendations: string[];
    };
}

// Schema.org required/recommended properties per type (simplified for local SEO)
const SCHEMA_REQUIRED: Record<string, string[]> = {
    LocalBusiness: ['name', 'address', 'telephone'],
    Organization: ['name'],
    Place: ['name', 'address'],
    WebSite: ['name', 'url'],
    BreadcrumbList: ['itemListElement'],
    Restaurant: ['name', 'address', 'servesCuisine'],
    Dentist: ['name', 'address', 'telephone'],
    MedicalBusiness: ['name', 'address'],
    Physician: ['name', 'address'],
    LegalService: ['name', 'address'],
    Attorney: ['name', 'address'],
    LawFirm: ['name', 'address'],
    RealEstateAgent: ['name'],
    Product: ['name'],
    Offer: ['price', 'priceCurrency'],
    FAQPage: ['mainEntity'],
    Menu: ['hasMenuSection'],
};

// Map vertical/industry to expected schema types
const VERTICAL_SCHEMAS: Record<string, string[]> = {
    general: ['Organization', 'LocalBusiness', 'WebSite', 'BreadcrumbList'],
    restaurant: ['Restaurant', 'LocalBusiness', 'Organization', 'WebSite', 'BreadcrumbList', 'Menu'],
    dental: ['Dentist', 'MedicalBusiness', 'LocalBusiness', 'Organization', 'WebSite', 'BreadcrumbList'],
    medical: ['MedicalBusiness', 'Physician', 'LocalBusiness', 'Organization', 'WebSite', 'BreadcrumbList'],
    legal: ['Attorney', 'LegalService', 'LawFirm', 'Organization', 'WebSite', 'BreadcrumbList'],
    realestate: ['RealEstateAgent', 'LocalBusiness', 'Organization', 'WebSite', 'BreadcrumbList'],
    retail: ['Product', 'Offer', 'Organization', 'WebSite', 'BreadcrumbList'],
};

// GBP category -> vertical
const CATEGORY_TO_VERTICAL: Record<string, string> = {
    restaurant: 'restaurant',
    cafe: 'restaurant',
    bar: 'restaurant',
    dentist: 'dental',
    dental_clinic: 'dental',
    orthodontist: 'dental',
    doctor: 'medical',
    medical_clinic: 'medical',
    hospital: 'medical',
    lawyer: 'legal',
    law_firm: 'legal',
    attorney: 'legal',
    real_estate_agent: 'realestate',
    real_estate: 'realestate',
    store: 'retail',
    retail: 'retail',
};

export interface SchemaMarkupModuleInput {
    url: string;
    businessName?: string;
    /** GBP types/categories for vertical detection */
    gbpTypes?: string[];
}

type SchemaSource = 'json-ld' | 'microdata' | 'rdfa';

interface ParsedSchema {
    type: string;
    source: SchemaSource;
    item: Record<string, unknown>;
}

function getRequiredProps(type: string): string[] {
    for (const [key, props] of Object.entries(SCHEMA_REQUIRED)) {
        if (type === key || type.endsWith(key)) return props;
    }
    return ['name'];
}

function checkCompleteness(item: Record<string, unknown>, type: string): { completeness: number; missingProperties: string[] } {
    const required = getRequiredProps(type);
    const missing: string[] = [];
    for (const prop of required) {
        const val = item[prop];
        if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
            missing.push(prop);
        } else if (typeof val === 'object' && !Array.isArray(val)) {
            const sub = val as Record<string, unknown>;
            if (Object.keys(sub).length === 0) missing.push(prop);
        }
    }
    const completeness = required.length > 0 ? Math.round(((required.length - missing.length) / required.length) * 100) : 100;
    return { completeness, missingProperties: missing };
}

function parseJsonLd(html: string): ParsedSchema[] {
    const $ = cheerio.load(html);
    const result: ParsedSchema[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
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
                const types: string[] = [];
                const t = o['@type'];
                if (typeof t === 'string') types.push(t);
                else if (Array.isArray(t)) t.forEach((tt) => typeof tt === 'string' && types.push(tt));

                for (const type of types) {
                    result.push({
                        type,
                        source: 'json-ld',
                        item: o,
                    });
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
    });

    return result;
}

function parseMicrodata(html: string): ParsedSchema[] {
    const $ = cheerio.load(html);
    const result: ParsedSchema[] = [];

    $('[itemscope][itemtype]').each((_, el) => {
        const itemtype = $(el).attr('itemtype');
        if (!itemtype) return;

        const type = itemtype.split('/').pop() || itemtype;
        const item: Record<string, unknown> = { '@type': type };

        $(el).find('[itemprop]').each((_, propEl) => {
            const prop = $(propEl).attr('itemprop');
            const content = $(propEl).attr('content') ?? $(propEl).text().trim();
            if (prop && content) item[prop] = content;
        });

        result.push({ type, source: 'microdata', item });
    });

    return result;
}

function parseRdfa(html: string): ParsedSchema[] {
    const $ = cheerio.load(html);
    const result: ParsedSchema[] = [];

    $('[typeof]').each((_, el) => {
        const typeofAttr = $(el).attr('typeof');
        if (!typeofAttr) return;

        typeofAttr.split(/\s+/).forEach((t) => {
            const type = t.replace(/^schema:/, '').trim();
            if (!type) return;

            const item: Record<string, unknown> = { '@type': type };
            $(el).find('[property]').each((_, propEl) => {
                const prop = $(propEl).attr('property')?.replace(/^schema:/, '');
                const content = $(propEl).attr('content') ?? $(propEl).text().trim();
                if (prop && content) item[prop] = content;
            });

            result.push({ type, source: 'rdfa', item });
        });
    });

    return result;
}

function detectVertical(gbpTypes?: string[]): string {
    if (!gbpTypes || gbpTypes.length === 0) return 'general';

    for (const cat of gbpTypes) {
        const normalized = cat.toLowerCase().replace(/\s+/g, '_');
        for (const [key, vertical] of Object.entries(CATEGORY_TO_VERTICAL)) {
            if (normalized.includes(key)) return vertical;
        }
    }
    return 'general';
}

/**
 * Run schema markup analysis on a URL.
 */
export async function runSchemaMarkupModule(
    input: SchemaMarkupModuleInput,
    _tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
    const { url, gbpTypes } = input;

    if (!url) {
        return {
            moduleId: 'schemaMarkup',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                status: 'error',
                data: {
                    schemasFound: [],
                    schemasExpected: VERTICAL_SCHEMAS.general,
                    schemasMissing: VERTICAL_SCHEMAS.general,
                    score: 0,
                    recommendations: ['No URL provided for schema analysis.'],
                },
            },
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ProposalOS-SchemaBot/1.0)',
            },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        const jsonLdItems = parseJsonLd(html);
        const microdataItems = parseMicrodata(html);
        const rdfaItems = parseRdfa(html);

        const allParsed: ParsedSchema[] = [...jsonLdItems, ...microdataItems, ...rdfaItems];
        const typesFound = new Set<string>(allParsed.map((p) => p.type));

        const vertical = detectVertical(gbpTypes);
        const schemasExpected = [...new Set(VERTICAL_SCHEMAS[vertical] ?? VERTICAL_SCHEMAS.general)];
        const schemasMissing = schemasExpected.filter((s) => !typesFound.has(s));

        const schemasFound: SchemaMarkupResult['data']['schemasFound'] = [];
        const seen = new Set<string>();

        for (const { type, source, item } of allParsed) {
            const key = `${type}:${source}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const { completeness, missingProperties } = checkCompleteness(item, type);
            schemasFound.push({
                type,
                source,
                completeness,
                missingProperties,
            });
        }

        const recommendations: string[] = [];

        if (schemasMissing.includes('LocalBusiness') && schemasMissing.includes('Organization')) {
            recommendations.push(
                "Add LocalBusiness schema with your address, phone, and hours to appear in Google's local pack."
            );
        }
        if (schemasMissing.includes('WebSite')) {
            recommendations.push('Add WebSite schema with your site URL and name for sitelinks and search features.');
        }
        if (schemasMissing.includes('BreadcrumbList')) {
            recommendations.push('Add BreadcrumbList schema to help Google understand your site structure and show breadcrumbs in search.');
        }
        if (schemasMissing.includes('Restaurant') && vertical === 'restaurant') {
            recommendations.push('Add Restaurant schema with cuisine type and menu for rich results in local search.');
        }
        if (schemasMissing.includes('Dentist') && vertical === 'dental') {
            recommendations.push('Add Dentist or DentalClinic schema for medical/dental local pack visibility.');
        }
        if (schemasMissing.includes('Attorney') && vertical === 'legal') {
            recommendations.push('Add Attorney or LegalService schema for law firm rich results.');
        }
        if (schemasMissing.includes('RealEstateAgent') && vertical === 'realestate') {
            recommendations.push('Add RealEstateAgent schema for real estate listing visibility.');
        }

        const foundExpected = schemasExpected.filter((s) => typesFound.has(s)).length;
        const completenessAvg =
            schemasFound.length > 0
                ? Math.round(schemasFound.reduce((a, b) => a + b.completeness, 0) / schemasFound.length)
                : 0;
        const coverage = schemasExpected.length > 0 ? foundExpected / schemasExpected.length : 0;
        const score = Math.round(coverage * 60 + (completenessAvg / 100) * 40);

        const result: SchemaMarkupResult = {
            status: 'success',
            data: {
                schemasFound,
                schemasExpected,
                schemasMissing,
                score: Math.min(100, Math.max(0, score)),
                recommendations,
            },
        };

        return {
            moduleId: 'schemaMarkup',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: result,
        };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        return {
            moduleId: 'schemaMarkup',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                status: 'error',
                data: {
                    schemasFound: [],
                    schemasExpected: VERTICAL_SCHEMAS.general,
                    schemasMissing: VERTICAL_SCHEMAS.general,
                    score: 0,
                    recommendations: [`Schema analysis failed: ${errMsg}. Ensure the URL is accessible.`],
                },
            },
        };
    }
}
