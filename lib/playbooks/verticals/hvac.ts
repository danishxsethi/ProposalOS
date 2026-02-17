import type { VerticalPlaybook } from '../types';

export const hvacPlaybook: VerticalPlaybook = {
    id: 'hvac',
    name: 'HVAC & Heating/Cooling',
    icon: '❄️',

    averageOrderValue: 400,
    conversionRate: 0.025,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 4),

    priorityFindings: [
        'emergency_service_visibility',
        'service_area_pages',
        'seasonal_content',
        'licensing_insurance_badges',
        'quote_request_form',
        'before_after_projects',
    ],

    industryBenchmarks: {
        pageSpeed: 65,
        mobileScore: 75,
        avgLoadTime: 3.5,
        avgReviewRating: 4.2,
        avgReviewCount: 65,
    },

    verticalSpecificFindings: [
        {
            id: 'emergency_number_first_viewport',
            title: 'Emergency/24-7 service visibility (this is #1 for trades)',
            checkFunction: 'hasEmergencyNumberFirstViewport',
            severity: 'critical',
            description: 'Is the emergency/24-hour number visible in the first viewport on mobile?',
            recommendation: 'Place the emergency number in a sticky header or above-the-fold banner on mobile.',
        },
        {
            id: 'service_area_pages',
            title: 'Service area page listing Saskatoon neighbourhoods',
            checkFunction: 'hasServiceAreaPages',
            severity: 'critical',
            description: 'Does the site list specific Saskatoon neighbourhoods served?',
            recommendation: 'Create a service area page listing Saskatoon neighbourhoods (Downtown, Nutana, Stonebridge, etc.).',
        },
        {
            id: 'seasonal_content',
            title: 'Seasonal content (furnace before winter, AC before summer — critical in SK)',
            checkFunction: 'hasSeasonalContent',
            severity: 'critical',
            description: 'Is there seasonal content for furnace tune-ups (fall) and AC prep (spring)?',
            recommendation: 'Add seasonal landing pages — Saskatchewan winters demand furnace readiness; summers need AC.',
        },
        {
            id: 'licensing_insurance_badges',
            title: 'Licensing, insurance, and bonding badges prominently displayed',
            checkFunction: 'hasLicensingInsuranceBadges',
            severity: 'high',
            description: 'Are licensing, insurance, and bonding credentials displayed?',
            recommendation: 'Display Saskatchewan contractor licence, liability insurance, and bonding badges.',
        },
        {
            id: 'before_after_projects',
            title: 'Before/after project photos',
            checkFunction: 'hasBeforeAfterProjects',
            severity: 'high',
            description: 'Are before/after project photos featured?',
            recommendation: 'Add a portfolio of furnace installs, AC replacements, and ductwork projects.',
        },
        {
            id: 'quote_request_form',
            title: 'Online quote or estimate request form',
            checkFunction: 'hasQuoteRequestForm',
            severity: 'critical',
            description: 'Is there an online quote/estimate request form?',
            recommendation: 'Add a simple quote request form (project type, contact info) above the fold.',
        },
        {
            id: 'click_to_call_mobile',
            title: 'Click-to-call working on mobile',
            checkFunction: 'hasClickToCallMobile',
            severity: 'critical',
            description: 'Is click-to-call working on mobile?',
            recommendation: 'Ensure phone numbers use tel: links and are tappable on mobile.',
        },
        {
            id: 'financing_payment_options',
            title: 'Financing and payment options listed',
            checkFunction: 'hasFinancingPaymentOptions',
            severity: 'high',
            description: 'Are financing and payment options listed?',
            recommendation: 'Add financing options (e.g., Synchrony, Affirm) to reduce purchase friction.',
        },
        {
            id: 'manufacturer_partnerships',
            title: 'Certifications and manufacturer partnerships',
            checkFunction: 'hasManufacturerPartnerships',
            severity: 'medium',
            description: 'Are manufacturer certifications (Carrier, Lennox, etc.) displayed?',
            recommendation: 'Display manufacturer certifications and authorised dealer badges.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            "When someone's furnace breaks at 10pm in -40°C, they're searching on their phone. You have 3 seconds.",
            'Slow sites lose emergency calls to competitors who load faster.',
            'Missing service area pages means you lose "HVAC Saskatoon" search traffic.',
        ],
        valueProps: [
            'More emergency calls with fast-loading mobile site',
            'Better local visibility with Saskatoon neighbourhood pages',
            'Higher conversion with visible financing options',
        ],
        socialProof: "We've helped 40+ Saskatchewan HVAC companies capture more emergency calls and seasonal tune-up bookings.",
        urgencyHook: "When someone's furnace breaks at 10pm in Saskatchewan winter, they're searching on their phone. You have 3 seconds.",
        roiFraming: 'Each emergency furnace call can lead to $400–$2,000+ in repairs or replacement.',
        executiveSummaryOpening: 'Saskatchewan winters are unforgiving — homeowners searching for HVAC help need to find you fast.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 60+ HVAC and plumbing businesses — emergency visibility is critical.',
        regulatoryContext: ['Saskatchewan Apprenticeship and Trade Certification', 'Provincial licensing', 'Liability insurance'],
        neighbourhoods: ['Downtown', 'Nutana', 'Broadway', 'Stonebridge', 'Evergreen', 'Willowgrove', 'University Heights', 'Lawson Heights', 'River Heights', 'Confederation Park', 'Hampton Village'],
    },
};
