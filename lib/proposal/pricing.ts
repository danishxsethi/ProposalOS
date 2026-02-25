// Fixed pricing tiers — distinct positioning, Growth as recommended

export interface ProposalPricingTiers {
    starter: number;
    growth: number;
    premium: number;
}

/** Base pricing — Starter $497, Growth $1,497, Premium $2,997 */
export const PROPOSAL_PRICING: ProposalPricingTiers = {
    starter: 497,
    growth: 1497,
    premium: 2997,
};

/**
 * Industry multipliers - certain industries command higher prices
 * due to complexity, compliance requirements, or higher customer lifetime value
 */
const INDUSTRY_MULTIPLIERS: Record<string, number> = {
    // High-value industries
    legal: 1.30,           // +30% - High client values, compliance heavy
    medical: 1.20,          // +20% - Compliance, HIPAA, complex SEO
    dental: 1.15,            // +15% - Competitive, high patient volume
    real_estate: 1.20,      // +20% - High competition, luxury markets
    financial: 1.25,         // +25% - Compliance, trust-heavy

    // Specialized services  
    construction: 1.15,      // +15% - Complex sales cycle
    contractor: 1.10,        // +10% - Trade skills
    hvac: 1.10,             // +10% - Seasonal, technical
    plumbing: 1.10,          // +10% - Emergency services

    // Standard industries
    automotive: 1.0,
    restaurant: 1.0,
    retail: 1.0,
    fitness: 1.0,
    salon: 1.0,
    cleaning: 1.0,

    // Lower complexity
    cafe: 0.95,             // -5%
    boutique: 0.95,          // -5%
    photography: 0.90,       // -10%

    // Default
    general: 1.0,
};

/**
 * Business size multipliers based on employee count or revenue scope
 */
const BUSINESS_SIZE_MULTIPLIERS: Record<string, number> = {
    // Small business (1-10 employees)
    small: 1.0,

    // Medium (11-50 employees)  
    medium: 1.20,

    // Large (51-200 employees)
    large: 1.40,

    // Enterprise (200+)
    enterprise: 1.60,

    // Default to small if unknown
    unknown: 1.0,
};

/**
 * Revenue tier multipliers (alternative to employee count)
 */
const REVENUE_MULTIPLIERS: Record<string, number> = {
    '0-100k': 1.0,      // <$100K
    '100k-500k': 1.10,  // $100K-$500K  
    '500k-1m': 1.25,    // $500K-$1M
    '1m-5m': 1.40,      // $1M-$5M
    '5m+': 1.60,        // $5M+
    unknown: 1.0,
};

/**
 * Business size classification based on employee count
 */
export type BusinessSize = 'small' | 'medium' | 'large' | 'enterprise' | 'unknown';

/**
 * Dynamic pricing input parameters
 */
export interface DynamicPricingInput {
    industry: string | null;
    businessSize?: BusinessSize;
    employeeCount?: number;
    revenue?: string;
    location?: string; // Premium markets (NYC, SF, etc.)
}

/**
 * Calculate dynamic pricing based on industry, business size, and market factors
 * Floors/Ceilings enforced: 
 * Starter: $397-$797
 * Growth: $997-$2497
 * Premium: $1997-$4997
 */
export function getDynamicPricing(input: DynamicPricingInput): ProposalPricingTiers {
    const { industry, businessSize, employeeCount, revenue, location } = input;

    // Custom Industry Multipliers from Requirements
    const customIndustryMultipliers: Record<string, number> = {
        restaurant: 0.8,
        legal: 1.3,
        healthcare: 1.4,
        medical: 1.4,
        dental: 1.4,
        ecommerce: 1.2,
        general: 1.0
    };

    // Custom Size Multipliers from Requirements 
    const customSizeMultipliers: Record<string, number> = {
        small: 0.8,
        medium: 1.0,
        large: 1.3,
        enterprise: 1.5,
        unknown: 1.0
    };

    let multiplier = 1.0;

    // Apply industry multiplier
    const industryKey = (industry || 'general').toLowerCase();
    const industryMultiplier = customIndustryMultipliers[industryKey] || INDUSTRY_MULTIPLIERS[industryKey] || 1.0;
    multiplier *= industryMultiplier;

    // Apply business size multiplier
    let sizeMultiplier = 1.0;
    if (businessSize && businessSize !== 'unknown') {
        sizeMultiplier = customSizeMultipliers[businessSize] || 1.0;
    } else if (employeeCount !== undefined) {
        if (employeeCount <= 10) sizeMultiplier = customSizeMultipliers.small;
        else if (employeeCount <= 50) sizeMultiplier = customSizeMultipliers.medium;
        else if (employeeCount <= 200) sizeMultiplier = customSizeMultipliers.large;
        else sizeMultiplier = customSizeMultipliers.enterprise;
    }
    multiplier *= sizeMultiplier;

    // Apply revenue multiplier if provided
    if (revenue) {
        const revenueKey = revenue.toLowerCase();
        const revenueMultiplier = REVENUE_MULTIPLIERS[revenueKey] || 1.0;
        multiplier *= revenueMultiplier;
    }

    // Apply location premium for major markets
    const premiumMarkets = ['nyc', 'new york', 'san francisco', 'sf', 'los angeles', 'la', 'chicago', 'boston', 'seattle', 'miami'];
    if (location && premiumMarkets.some(m => location.toLowerCase().includes(m))) {
        multiplier *= 1.15; // +15% for premium markets
    }

    // Floor/Ceiling constants
    const bounds = {
        starter: [397, 797],
        growth: [997, 2497],
        premium: [1997, 4997]
    };

    // Calculate final prices and clamp to boundaries, rounding to nearest $10
    const roundToNearest10 = (val: number) => Math.round(val / 10) * 10 - 3; // e.g. 500 -> 497

    const calcBoundedPrice = (base: number, [min, max]: number[]) => {
        let raw = base * multiplier;
        raw = Math.max(min, Math.min(raw, max));
        // We round to nearest 10, then subtract 3 to get ending in 7 ($497, $997, etc)
        const rounded = Math.round(raw / 10) * 10;
        // Keep it ending in 7 for standard psychology, so subtract 3
        const result = rounded - 3;
        // Re-clamp just in case the -3 pushed it out
        return Math.max(min, Math.min(result, max));
    };

    return {
        starter: calcBoundedPrice(PROPOSAL_PRICING.starter, bounds.starter),
        growth: calcBoundedPrice(PROPOSAL_PRICING.growth, bounds.growth),
        premium: calcBoundedPrice(PROPOSAL_PRICING.premium, bounds.premium),
    };
}

/**
 * Classify business size from employee count
 */
export function classifyBusinessSize(employeeCount?: number): BusinessSize {
    if (!employeeCount) return 'unknown';

    if (employeeCount <= 10) return 'small';
    if (employeeCount <= 50) return 'medium';
    if (employeeCount <= 200) return 'large';
    return 'enterprise';
}

// Legacy interface for backward compatibility
export interface IndustryPricing {
    essentials: number;
    growth: number;
    premium: number;
}

/**
 * Get proposal pricing. Uses fixed tiers (Starter/Growth/Premium).
 * Maps essentials -> starter for backward compatibility.
 */
export function getProposalPricing(): ProposalPricingTiers {
    return { ...PROPOSAL_PRICING };
}

/**
 * Get pricing in legacy format (essentials/growth/premium)
 * for components that expect the old keys.
 */
export function getIndustryPricing(input?: string | null | DynamicPricingInput): IndustryPricing {
    // If we're passed a DynamicPricingInput object, use it directly
    const pricingInput = typeof input === 'object' && input !== null
        ? input as DynamicPricingInput
        : { industry: typeof input === 'string' ? input : null };

    const dynamicPricing = getDynamicPricing(pricingInput);

    return {
        essentials: dynamicPricing.starter,
        growth: dynamicPricing.growth,
        premium: dynamicPricing.premium,
    };
}

export const getPricing = getIndustryPricing;
