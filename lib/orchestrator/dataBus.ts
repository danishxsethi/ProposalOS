import { logger } from '@/lib/logger';
import {
    AuditModuleResult,
    CompetitorComparisonMatrix,
    ReputationModuleResult,
    PlaceDataResult
} from '@/lib/modules/types';

// Type map for DataBus values
export interface DataBusTypeMap {
    auditId: string;
    websiteUrl: string;
    businessName: string;
    city: string;
    industry: string;

    // Module Results - Strictly Typed
    crawlResults: AuditModuleResult;
    placeData: PlaceDataResult;
    reviews: any[]; // Google Reviews array
    competitorData: AuditModuleResult;
    competitorStrategy: any; // Strategy Module Result
    reputationData: ReputationModuleResult;
    seoDeepData: AuditModuleResult;

    // Other Modules
    conversionData: AuditModuleResult;
    mobileUxData: AuditModuleResult;
    contentQualityData: AuditModuleResult;
    citationData: AuditModuleResult;
    paidSearchData: AuditModuleResult;
    techStackData: AuditModuleResult;
    securityData: AuditModuleResult;
    accessibilityData: AuditModuleResult;
    keywordGapData: AuditModuleResult;

    // Evidence
    screenshotData: any;
    benchmarkData: any;
}

// Type-safe keys for the Data Bus
export type DataBusKey = keyof DataBusTypeMap;

/**
 * Shared Data Bus for Audit Execution
 * Stores intermediate results from modules so dependent modules can access them.
 */
export class DataBus {
    private store: Map<DataBusKey, any> = new Map();

    constructor() { }

    /**
     * Set a value in the bus
     */
    set<K extends DataBusKey>(key: K, value: DataBusTypeMap[K]): void {
        this.store.set(key, value);
    }

    /**
     * Get a value from the bus
     */
    get<K extends DataBusKey>(key: K): DataBusTypeMap[K] | undefined {
        return this.store.get(key) as DataBusTypeMap[K] | undefined;
    }

    /**
     * Check if key exists
     */
    has(key: DataBusKey): boolean {
        return this.store.has(key);
    }

    /**
     * Get all data as object (for debugging/logging)
     */
    getAll(): Record<string, any> {
        return Object.fromEntries(this.store);
    }
}
