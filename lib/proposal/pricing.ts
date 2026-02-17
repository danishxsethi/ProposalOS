// Fixed pricing tiers — distinct positioning, Growth as recommended

export interface ProposalPricingTiers {
    starter: number;
    growth: number;
    premium: number;
}

/** Fixed pricing — Starter $497, Growth $1,497, Premium $2,997 */
export const PROPOSAL_PRICING: ProposalPricingTiers = {
    starter: 497,
    growth: 1497,
    premium: 2997,
};

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
export function getIndustryPricing(_industry?: string | null): IndustryPricing {
    return {
        essentials: PROPOSAL_PRICING.starter,
        growth: PROPOSAL_PRICING.growth,
        premium: PROPOSAL_PRICING.premium,
    };
}

/**
 * Detect industry from Google Places category
 */
export function detectIndustryFromCategory(category?: string): string {
    if (!category) return 'general';

    const normalized = category.toLowerCase();

    const categoryMap: Record<string, string> = {
        dentist: 'dental',
        'dental_clinic': 'dental',
        orthodontist: 'dental',
        doctor: 'medical',
        'medical_clinic': 'medical',
        hospital: 'medical',
        lawyer: 'legal',
        'law_firm': 'legal',
        plumber: 'plumbing',
        hvac: 'hvac',
        roofer: 'roofing',
        landscaper: 'landscaping',
        'landscape_designer': 'landscaping',
        'general_contractor': 'construction',
        contractor: 'contractor',
        'car_repair': 'automotive',
        'auto_repair': 'automotive',
        mechanic: 'automotive',
        restaurant: 'restaurant',
        cafe: 'cafe',
        coffee: 'cafe',
        gym: 'gym',
        'fitness_center': 'fitness',
        'yoga_studio': 'yoga',
        spa: 'spa',
        'hair_salon': 'salon',
        barber: 'barber',
        'cleaning_service': 'cleaning',
        'house_cleaning': 'cleaning',
        store: 'retail',
        shop: 'retail',
        boutique: 'boutique',
        veterinarian: 'vet',
        vet: 'vet',
        'real_estate': 'real_estate',
        realtor: 'real_estate',
        'property_management': 'real_estate',
        accountant: 'accounting',
        cpa: 'accounting',
        tax: 'accounting',
        insurance: 'insurance',
        electrician: 'electrician',
        pest: 'pest_control',
        painter: 'painter',
        mover: 'moving',
        moving: 'moving',
        school: 'daycare',
        daycare: 'daycare',
        preschool: 'daycare',
        photographer: 'photography',
        photography: 'photography',
        event: 'event_planning',
        wedding: 'event_planning',
    };

    for (const [key, industry] of Object.entries(categoryMap)) {
        if (normalized.includes(key)) {
            return industry;
        }
    }

    return 'general';
}

export const getPricing = getIndustryPricing;
