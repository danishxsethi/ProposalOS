/**
 * Playbook registry — maps playbook IDs to configs and auto-detects vertical from business data.
 */
import type { VerticalPlaybook } from './types';
import { dentistPlaybook } from './verticals/dentist';
import { lawFirmPlaybook } from './verticals/law-firm';
import { hvacPlaybook } from './verticals/hvac';
import { restaurantPlaybook } from './verticals/restaurant';
import { realEstatePlaybook } from './verticals/real-estate';
import { gymPlaybook } from './verticals/gym';
import { veterinaryPlaybook } from './verticals/veterinary';
import { salonPlaybook } from './verticals/salon';
import { contractorPlaybook } from './verticals/contractor';
import { retailPlaybook } from './verticals/retail';
import { generalPlaybook } from './verticals/general';
import type { BusinessDataForDetection } from './types';

/** Map of all playbooks by ID */
export const PLAYBOOK_REGISTRY = new Map<string, VerticalPlaybook>([
    ['dentist', dentistPlaybook],
    ['law-firm', lawFirmPlaybook],
    ['hvac', hvacPlaybook],
    ['restaurant', restaurantPlaybook],
    ['real-estate', realEstatePlaybook],
    ['gym', gymPlaybook],
    ['veterinary', veterinaryPlaybook],
    ['salon', salonPlaybook],
    ['contractor', contractorPlaybook],
    ['retail', retailPlaybook],
    ['general', generalPlaybook],
]);

/** Default playbook when no vertical is detected */
export const DEFAULT_PLAYBOOK_ID = 'general';

/**
 * Comprehensive Google Business Profile category -> vertical mapping.
 * Maps 50+ common local business categories to our 10 verticals.
 * Categories are matched case-insensitively (normalize to lowercase).
 */
const GOOGLE_CATEGORY_TO_VERTICAL: Record<string, string> = {
    // Dentist
    dentist: 'dentist',
    'dental clinic': 'dentist',
    'dental implants periodontist': 'dentist',
    orthodontist: 'dentist',
    'pediatric dentist': 'dentist',
    'cosmetic dentist': 'dentist',
    'oral surgeon': 'dentist',
    'dental laboratory': 'dentist',

    // Law firm
    lawyer: 'law-firm',
    'law firm': 'law-firm',
    attorney: 'law-firm',
    'criminal defense attorney': 'law-firm',
    'personal injury attorney': 'law-firm',
    'family law attorney': 'law-firm',
    'estate planning attorney': 'law-firm',
    'immigration attorney': 'law-firm',
    'bankruptcy attorney': 'law-firm',

    // HVAC
    'hvac contractor': 'hvac',
    'heating contractor': 'hvac',
    'air conditioning contractor': 'hvac',
    'air conditioning repair service': 'hvac',
    'heating equipment supplier': 'hvac',
    'furnace repair service': 'hvac',

    // Restaurant
    restaurant: 'restaurant',
    cafe: 'restaurant',
    'coffee shop': 'restaurant',
    bar: 'restaurant',
    'fast food restaurant': 'restaurant',
    'pizza restaurant': 'restaurant',
    'sandwich shop': 'restaurant',
    'bakery': 'restaurant',
    'breakfast restaurant': 'restaurant',
    'lunch restaurant': 'restaurant',
    'brunch restaurant': 'restaurant',
    bistro: 'restaurant',
    diner: 'restaurant',
    'ice cream shop': 'restaurant',
    'food truck': 'restaurant',

    // Real estate
    'real estate agent': 'real-estate',
    'real estate agency': 'real-estate',
    realtor: 'real-estate',
    'property management company': 'real-estate',
    'mortgage broker': 'real-estate',

    // Gym
    gym: 'gym',
    'fitness center': 'gym',
    'yoga studio': 'gym',
    'pilates studio': 'gym',
    'martial arts school': 'gym',
    'dance school': 'gym',
    'personal trainer': 'gym',
    'crossfit box': 'gym',
    'sports club': 'gym',
    'swimming pool': 'gym',

    // Veterinary
    veterinarian: 'veterinary',
    'veterinary clinic': 'veterinary',
    'animal hospital': 'veterinary',
    'veterinary pharmacy': 'veterinary',
    'pet groomer': 'veterinary',
    'pet store': 'veterinary',
    'dog boarding': 'veterinary',
    'pet sitter': 'veterinary',

    // Salon
    'hair salon': 'salon',
    'hair stylist': 'salon',
    'barber shop': 'salon',
    'beauty salon': 'salon',
    'nail salon': 'salon',
    spa: 'salon',
    'massage spa': 'salon',
    'facial spa': 'salon',
    'hair extension technician': 'salon',
    'makeup artist': 'salon',
    'eyebrow bar': 'salon',
    'waxing hair removal service': 'salon',

    // Contractor
    contractor: 'contractor',
    'general contractor': 'contractor',
    plumber: 'contractor',
    electrician: 'contractor',
    roofer: 'contractor',
    'roofing contractor': 'contractor',
    'painting contractor': 'contractor',
    'flooring contractor': 'contractor',
    'landscaper': 'contractor',
    'landscape designer': 'contractor',
    'pest control service': 'contractor',
    'moving company': 'contractor',
    'cleaning service': 'contractor',
    'house cleaning service': 'contractor',
    'window cleaning service': 'contractor',
    'handyman': 'contractor',
    'carpenter': 'contractor',
    'concrete contractor': 'contractor',
    'drywall contractor': 'contractor',
    'siding contractor': 'contractor',
    'fence contractor': 'contractor',
    'garage door supplier': 'contractor',
    'locksmith': 'contractor',

    // Retail
    store: 'retail',
    'clothing store': 'retail',
    'shoe store': 'retail',
    'jewelry store': 'retail',
    'electronics store': 'retail',
    'furniture store': 'retail',
    'home goods store': 'retail',
    'gift shop': 'retail',
    'convenience store': 'retail',
    'liquor store': 'retail',
    'florist': 'retail',
    'book store': 'retail',
    'toy store': 'retail',
    'sporting goods store': 'retail',
    'hardware store': 'retail',
    'auto parts store': 'retail',
    'boutique': 'retail',
    'thrift store': 'retail',
    'department store': 'retail',
    'supermarket': 'retail',
    'grocery store': 'retail',
    'pharmacy': 'retail',
};

/**
 * Keywords in business name, services, or website content that suggest a vertical.
 * Higher priority = checked first. Order matters for overlapping matches.
 */
const VERTICAL_KEYWORDS: Record<string, string[]> = {
    dentist: ['dental', 'dentist', 'orthodontist', 'dds', 'dmd', 'teeth', 'smile', 'oral', 'implants'],
    'law-firm': ['law', 'attorney', 'legal', 'lawyer', 'esq', 'firm', 'legal services'],
    hvac: ['hvac', 'heating', 'cooling', 'furnace', 'ac ', 'air conditioning', 'hvac repair'],
    restaurant: ['restaurant', 'cafe', 'coffee', 'bistro', 'grill', 'kitchen', 'eatery', 'bar', 'diner', 'bakery'],
    'real-estate': ['real estate', 'realtor', 'realtors', 'homes', 'properties', 'listing', 'realty'],
    gym: ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'workout', 'personal trainer', 'training'],
    veterinary: ['vet', 'veterinary', 'animal hospital', 'pet clinic', 'dvm', 'veterinarian', 'pets'],
    salon: ['salon', 'hair', 'barber', 'spa', 'beauty', 'nail', 'stylist', 'manicure', 'pedicure'],
    contractor: ['contractor', 'plumbing', 'electrician', 'roofing', 'hvac', 'repair', 'renovation', 'handyman', 'construction'],
    retail: ['store', 'shop', 'boutique', 'retail', 'products', 'shopping', 'inventory'],
};

/**
 * Extended detection input — supports both legacy (gbpCategories, businessIndustry)
 * and new (googleCategory, services) fields.
 */
export interface DetectVerticalInput {
    googleCategory?: string;
    gbpCategories?: string[];
    businessIndustry?: string | null;
    businessName?: string;
    businessCity?: string | null;
    businessUrl?: string | null;
    websiteContent?: string;
    services?: string[];
    reviewCount?: number;
    rating?: number;
}

/**
 * Smart vertical detection with three levels of priority:
 * 1. Google Business category mapping
 * 2. Keyword matching on business name + services
 * 3. Website content analysis
 * Fallback: "general"
 */
export function detectVertical(businessData: DetectVerticalInput | BusinessDataForDetection): string {
    const input = businessData as DetectVerticalInput & BusinessDataForDetection;

    const googleCategory = (input.googleCategory || '').toLowerCase().trim();
    const categories = (input.gbpCategories || []).map((c) => String(c).toLowerCase().trim());
    const industry = (input.businessIndustry || '').toLowerCase().trim();
    const name = (input.businessName || '').toLowerCase();
    const url = (input.businessUrl || '').toLowerCase();
    const services = (input.services || []).map((s) => String(s).toLowerCase());
    const content = (input.websiteContent || '').toLowerCase();

    const allCategories = [...new Set([googleCategory, ...categories, industry].filter(Boolean))];
    const combinedText = [name, url, ...services, content].join(' ');

    // Priority 1: Google Business category mapping
    for (const cat of allCategories) {
        if (!cat) continue;
        // Exact match first
        if (GOOGLE_CATEGORY_TO_VERTICAL[cat]) {
            return GOOGLE_CATEGORY_TO_VERTICAL[cat];
        }
        // Partial match (category contains or is contained by a key)
        for (const [key, vertical] of Object.entries(GOOGLE_CATEGORY_TO_VERTICAL)) {
            if (cat.includes(key) || key.includes(cat)) {
                return vertical;
            }
        }
    }

    // Priority 2: Keyword matching on business name + services
    for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
        if (keywords.some((kw) => combinedText.includes(kw))) {
            return vertical;
        }
    }

    // Priority 3: Website content analysis (industry-specific phrases)
    const contentPhrases: Record<string, string[]> = {
        dentist: ['appointment', 'teeth', 'dental', 'oral health', 'insurance accepted'],
        'law-firm': ['free consultation', 'legal', 'attorney', 'case', 'practice area'],
        hvac: ['emergency', '24 hour', 'furnace', 'ac repair', 'heating'],
        restaurant: ['menu', 'reservation', 'order online', 'delivery', 'takeout'],
        'real-estate': ['listing', 'home for sale', 'property', 'mls', 'open house'],
        gym: ['membership', 'class schedule', 'personal training', 'free trial'],
        veterinary: ['pet', 'emergency vet', 'appointment', 'vaccination', 'animal'],
        salon: ['book appointment', 'haircut', 'color', 'manicure', 'pedicure'],
        contractor: ['free estimate', 'quote', 'licensed', 'insured', 'portfolio'],
        retail: ['add to cart', 'checkout', 'shipping', 'free returns', 'in stock'],
    };
    for (const [vertical, phrases] of Object.entries(contentPhrases)) {
        if (phrases.some((p) => content.includes(p))) {
            return vertical;
        }
    }

    return DEFAULT_PLAYBOOK_ID;
}

/**
 * Get playbook by ID. Returns general playbook for 'general' or unknown IDs.
 * Never returns null — always returns a valid playbook.
 */
export function getPlaybook(id: string): VerticalPlaybook {
    if (!id) return generalPlaybook;
    return PLAYBOOK_REGISTRY.get(id) ?? generalPlaybook;
}
