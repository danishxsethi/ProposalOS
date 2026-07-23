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
 * Calculate dynamic pricing based on LTV and pain scores.
 */
export function getDynamicPricing(findings: { impactScore: number, confidenceScore: number }[], industry?: string | null): IndustryPricing {
    // 1. Calculate base pain score
    let painScore = 0;
    for (const f of findings) {
        // Impact (1-10) * Confidence (1-100 or 1-10)
        // If confidence is 1-10, divide by 10. If 1-100, divide by 100.
        const confMultiplier = f.confidenceScore > 10 ? f.confidenceScore / 100 : f.confidenceScore / 10;
        painScore += f.impactScore * confMultiplier;
    }

    // 2. Estimate LTV based on industry
    const ltvMap: Record<string, number> = {
        dental: 2500,
        medical: 3000,
        legal: 5000,
        plumbing: 1500,
        hvac: 3500,
        roofing: 8000,
        landscaping: 1200,
        construction: 15000,
        automotive: 800,
        restaurant: 200,
        cafe: 150,
        fitness: 600,
        spa: 400,
        salon: 300,
        accounting: 1500,
        insurance: 2000,
        real_estate: 5000,
        event_planning: 2500,
        general: 1000
    };

    const detectedIndustry = industry || 'general';
    const ltv = ltvMap[detectedIndustry] || ltvMap['general'];

    // 3. Dynamic Calculation Rules
    let basePrice = 497;

    // Scale by Pain: Every 10 points adds $150
    const painMultiplier = Math.floor(painScore / 10);
    basePrice += painMultiplier * 150;

    // Scale by LTV: 5% of LTV if LTV > 1500
    if (ltv > 1500) {
        basePrice += (ltv * 0.05);
    }

    // Ensure sensible caps, round to nearest 7
    const roundTo7 = (num: number) => Math.floor(num / 10) * 10 + 7;

    const essentials = roundTo7(basePrice);
    const growth = roundTo7(essentials * 2.5);
    const premium = roundTo7(essentials * 5);

    return {
        essentials,
        growth,
        premium
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
