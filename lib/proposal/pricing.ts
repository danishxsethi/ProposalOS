// Industry-specific pricing templates
// Base pricing uses 3-tier model, adjusted by industry complexity and market rates

export interface IndustryPricing {
    essentials: number;
    growth: number;
    premium: number;
}

export const INDUSTRY_PRICING: Record<string, IndustryPricing> = {
    // Service-based (higher value, complex operations)
    dental: {
        essentials: 600,
        growth: 1400,
        premium: 2800,
    },
    medical: {
        essentials: 700,
        growth: 1600,
        premium: 3200,
    },
    legal: {
        essentials: 800,
        growth: 1800,
        premium: 3600,
    },

    // Trades (moderate pricing, local market)
    plumbing: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },
    construction: {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },
    roofing: {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },
    landscaping: {
        essentials: 400,
        growth: 900,
        premium: 1800,
    },
    hvac: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },

    // Automotive
    automotive: {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },
    'car_repair': {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },
    'auto_repair': {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },

    // Hospitality & Food
    restaurant: {
        essentials: 400,
        growth: 900,
        premium: 1800,
    },
    cafe: {
        essentials: 350,
        growth: 800,
        premium: 1600,
    },
    hotel: {
        essentials: 600,
        growth: 1300,
        premium: 2600,
    },

    // Health & Wellness
    fitness: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },
    gym: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },
    yoga: {
        essentials: 400,
        growth: 900,
        premium: 1800,
    },
    spa: {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },

    // Personal Services
    salon: {
        essentials: 400,
        growth: 900,
        premium: 1800,
    },
    barber: {
        essentials: 350,
        growth: 800,
        premium: 1600,
    },
    cleaning: {
        essentials: 350,
        growth: 800,
        premium: 1600,
    },

    // Retail
    retail: {
        essentials: 500,
        growth: 1100,
        premium: 2200,
    },
    boutique: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },

    // Professional Services (New)
    real_estate: {
        essentials: 600,
        growth: 1500,
        premium: 3000,
    },
    accounting: {
        essentials: 750,
        growth: 1750,
        premium: 3500,
    },
    insurance: {
        essentials: 700,
        growth: 1600,
        premium: 3200,
    },

    // More Home Services (New)
    electrician: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },
    pest_control: {
        essentials: 450,
        growth: 950,
        premium: 1900,
    },
    painter: {
        essentials: 400,
        growth: 900,
        premium: 1800,
    },
    moving: {
        essentials: 500,
        growth: 1200,
        premium: 2400,
    },

    // Education & Events (New)
    daycare: {
        essentials: 400,
        growth: 900,
        premium: 1800,
    },
    photography: {
        essentials: 500,
        growth: 1200,
        premium: 2500,
    },
    event_planning: {
        essentials: 550,
        growth: 1300,
        premium: 2600,
    },



    // Default fallback
    general: {
        essentials: 450,
        growth: 1000,
        premium: 2000,
    },
};

/**
 * Get industry-specific pricing
 * Falls back to general pricing if industry not found
 */
export function getIndustryPricing(industry?: string | null): IndustryPricing {
    if (!industry) {
        return INDUSTRY_PRICING.general;
    }

    const normalized = industry.toLowerCase().trim();

    // Direct match
    if (INDUSTRY_PRICING[normalized]) {
        return INDUSTRY_PRICING[normalized];
    }

    // Partial matches
    for (const [key, pricing] of Object.entries(INDUSTRY_PRICING)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return pricing;
        }
    }

    // Fallback
    return INDUSTRY_PRICING.general;
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

        roofer: 'roofing',
        landscaper: 'landscaping',
        'landscape_designer': 'landscaping',
        'general_contractor': 'construction',
        'car_repair': 'automotive',
        'auto_repair': 'automotive',
        mechanic: 'automotive',
        restaurant: 'restaurant',
        cafe: 'cafe',
        coffee: 'cafe',
        gym: 'fitness',
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

        // New mappings
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

/**
 * Alias for backward compatibility
 */
export const getPricing = getIndustryPricing;
