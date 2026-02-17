/**
 * Vertical playbook types — industry-specific audit and proposal customization.
 */

/** Location-specific context (e.g. Saskatoon, Saskatchewan) */
export interface LocationContext {
    city?: string;
    region?: string;
    country?: string;
    currency?: string; // e.g. 'CAD'
    competitiveDensity?: string; // e.g. "There are 47 dentists in Saskatoon"
    regulatoryContext?: string[]; // e.g. PIPEDA, CASL, provincial regulations
    neighbourhoods?: string[]; // for service area pages
}

export interface VerticalPlaybook {
    id: string; // e.g., 'dentist'
    name: string; // e.g., 'Dentists & Dental Clinics'
    icon: string; // emoji

    // Industry context
    averageOrderValue: number; // avg revenue per customer interaction
    conversionRate: number; // typical website conversion rate
    monthlyVisitorEstimate: (reviewCount: number) => number;

    // Audit customization
    priorityFindings: string[]; // finding types to prioritize for this vertical
    industryBenchmarks: {
        pageSpeed: number; // target score
        mobileScore: number;
        avgLoadTime: number; // seconds
        avgReviewRating: number;
        avgReviewCount: number;
    };

    // Proposal customization
    verticalSpecificFindings: VerticalFinding[];
    proposalLanguage: {
        painPoints: string[]; // industry-specific pain points to reference
        valueProps: string[]; // industry-specific value propositions
        socialProof: string; // e.g., "We've helped 50+ dental practices improve..."
        urgencyHook: string; // e.g., "Patients searching for dentists decide in <10 seconds"
        roiFraming?: string; // e.g. "Every patient you lose = $3,000+ lifetime value"
        executiveSummaryOpening?: string; // custom opening line per vertical
    };

    // Pricing adjustments
    pricingMultiplier: number; // 1.0 = standard, 1.5 = premium vertical
    recommendedTier: 'starter' | 'growth' | 'premium';

    /** Saskatoon/Saskatchewan-specific overrides (Canadian English, CAD, local data) */
    locationContext?: LocationContext;
}

export interface VerticalFinding {
    id: string;
    title: string;
    checkFunction: string; // name of the check function
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
}

export interface BusinessDataForDetection {
    businessName?: string;
    businessIndustry?: string | null;
    businessCity?: string | null;
    businessUrl?: string | null;
    gbpCategories?: string[]; // Google Business Profile types
    googleCategory?: string; // single primary category
    services?: string[]; // business services offered
    reviewCount?: number;
    rating?: number;
    websiteContent?: string; // optional: scraped meta/headings for keyword detection
}
