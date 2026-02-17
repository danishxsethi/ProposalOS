// Module result types
export interface AuditModuleResult {
    findings: Finding[];
    evidenceSnapshots: any[];
    /** Legacy: modules may include moduleId for runner compatibility */
    moduleId?: string;
    /** Normalized data for finding generator compatibility (scores, coreWebVitals, finalUrl, schemaAnalysis, conversionAnalysis) */
    data?: { scores?: Record<string, number>; coreWebVitals?: any; finalUrl?: string; schemaAnalysis?: unknown; conversionAnalysis?: unknown };
}

// Legacy format — modules (gbp, competitor, social, reputation) return this; runner handles both
export interface LegacyAuditModuleResult {
    moduleId: string;
    status: 'success' | 'failed';
    data: any;
    error?: string;
    timestamp: string;
    costCents?: number;
}

export interface WebsiteModuleInput {
    url: string;
    businessName?: string;
}

// Finding types
export type FindingType = 'PAINKILLER' | 'VITAMIN' | 'POSITIVE';
export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Finding {
    module?: string;
    type: FindingType;
    category: string;
    title: string;
    description?: string;
    impactScore: number;
    confidenceScore: number;
    evidence: Array<Evidence | EvidenceItem>;
    metrics: Record<string, any>;
    effortEstimate: EffortLevel;
    recommendedFix: string[];
}

export interface EvidenceItem {
    type: 'url' | 'metric' | 'text' | 'image' | 'link';
    value: any;
    label: string;
}

/**
 * Standardized evidence format (spec requirement).
 * Every evidence object MUST have pointer (non-null) and collected_at.
 */
export interface Evidence {
    pointer: string;           // URL, API endpoint, or data source reference (REQUIRED)
    collected_at: string;     // ISO 8601 timestamp (REQUIRED)
    source: string;           // Module that collected this (e.g., 'pagespeed_v5', 'places_api_v1')
    type?: string;            // Type of evidence (e.g., 'score', 'metric', 'review')
    value?: string | number;   // The actual data point
    label?: string;           // Human-readable label
    raw?: any;                // Raw data for debugging (optional)
}

/**
 * Create standardized evidence with required pointer and collected_at.
 * Keeps backward compatibility by including type/value/label when provided.
 */
export function createEvidence(opts: {
    pointer: string;
    source: string;
    type?: 'url' | 'metric' | 'text' | 'image' | 'link' | string;
    value?: string | number;
    label?: string;
    raw?: any;
}): EvidenceItem & { raw?: unknown } {
    const validTypes: EvidenceItem['type'][] = ['url','metric','text','image','link'];
    const t = opts.type && validTypes.includes(opts.type as EvidenceItem['type']) ? opts.type : 'metric';
    const type = (t === 'score' ? 'metric' : t) as EvidenceItem['type'];
    const item: EvidenceItem & { raw?: unknown } = {
        type,
        value: opts.value ?? '',
        label: opts.label || opts.source,
    };
    if (opts.raw !== undefined) item.raw = opts.raw;
    return item;
}

export interface GBPModuleInput {
    businessName: string;
    city: string;
    /** Optional website URL for name/phone consistency checks */
    websiteUrl?: string;
}

export interface CompetitorModuleInput {
    keyword: string;
    location: string;
}

export interface CompetitorComparisonMatrix {
    business: MatchedBusinessData;
    competitors: MatchedBusinessData[];
    gaps: ComparisonGap[];
}

export interface MatchedBusinessData {
    name: string;
    rating: number;
    reviewCount: number;
    website?: string;
    websiteSpeed?: number;
    photosCount?: number;
    hasHours?: boolean;
    inLocalPack?: boolean;
    placeId?: string;
    /** Google Business category (e.g. "Dental clinic") */
    category?: string;
    /** PageSpeed performance score 0-100 */
    performanceScore?: number;
    /** PageSpeed SEO score 0-100 */
    seoScore?: number;
    /** PageSpeed accessibility score 0-100 */
    accessibilityScore?: number;
    /** Mobile performance (same as performance when strategy=mobile) */
    mobileScore?: number;
    /** Page load time in seconds (FCP or LCP) */
    loadTimeSeconds?: number;
}

export interface ComparisonGap {
    metric: 'reviews' | 'rating' | 'speed' | 'photos';
    businessValue: number;
    competitorAvg: number;
    gap: number; // business - competitor (negative means gap)
}

export interface ReputationModuleInput {
    reviews: any[];
    businessName: string;
}

export interface SocialModuleInput {
    websiteUrl: string;
    businessName: string;
}

// Result Types for DataBus
export interface PlaceDataResult {
    placeId: string;
    reviews: any[];
    rating?: number;
    userRatingCount?: number;
    address?: string;
    phone?: string;
    website?: string;
    types?: string[];
    [key: string]: any; // Allow loose typing for now until we map full Places API
}

export interface ReputationModuleResult extends ReputationModuleInput {
    skipped?: boolean;
    sentimentAnalysis?: any;
    // Add other fields returned by runReputationModule
}

