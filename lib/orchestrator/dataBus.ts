import { logger } from '@/lib/logger';

// Type-safe keys for the Data Bus
export type DataBusKey =
    | 'websiteUrl'
    | 'businessName'
    | 'city'
    | 'industry'
    | 'crawlResults'
    | 'placeData'
    | 'reviews'
    | 'competitorData'
    | 'competitorStrategy'
    | 'reputationData' // gbpDeep result
    | 'seoDeepData'
    | 'conversionData'
    | 'mobileUxData'
    | 'contentQualityData'
    | 'citationData'
    | 'paidSearchData'
    | 'techStackData'
    | 'securityData'
    | 'accessibilityData'
    | 'keywordGapData'
    | 'screenshotData'
    | 'benchmarkData';

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
    set<T>(key: DataBusKey, value: T): void {
        this.store.set(key, value);
    }

    /**
     * Get a value from the bus
     */
    get<T>(key: DataBusKey): T | undefined {
        return this.store.get(key) as T;
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
