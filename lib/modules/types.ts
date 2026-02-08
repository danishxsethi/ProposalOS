// Module result types
export interface AuditModuleResult {
    findings: Finding[];
    evidenceSnapshots: any[];
}

// Legacy format (deprecated, kept for compatibility)
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
export type FindingType = 'PAINKILLER' | 'VITAMIN';
export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Finding {
    type: FindingType;
    category: string;
    title: string;
    description: string;
    impactScore: number;
    confidenceScore: number;
    evidence: EvidenceItem[];
    metrics: Record<string, any>;
    effortEstimate: EffortLevel;
    recommendedFix: string[];
}

export interface EvidenceItem {
    type: 'url' | 'metric' | 'text' | 'image';
    value: any;
    label: string;
}

export interface GBPModuleInput {
    businessName: string;
    city: string;
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
    websiteSpeed?: number;
    photosCount?: number;
    hasHours?: boolean;
    inLocalPack?: boolean;
    placeId?: string;
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

