import type { VerticalPlaybook } from '../types';

export const veterinaryPlaybook: VerticalPlaybook = {
    id: 'veterinary',
    name: 'Veterinary Clinics',
    icon: '🐾',

    averageOrderValue: 175,
    conversionRate: 0.03,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 3),

    priorityFindings: [
        'emergency_after_hours',
        'online_appointment_booking',
        'services_page_completeness',
        'pet_portal_login',
        'new_client_forms_online',
        'reviews_mentioning_vets',
    ],

    industryBenchmarks: {
        pageSpeed: 70,
        mobileScore: 80,
        avgLoadTime: 2.5,
        avgReviewRating: 4.5,
        avgReviewCount: 75,
    },

    verticalSpecificFindings: [
        {
            id: 'emergency_after_hours_info',
            title: 'Emergency/after-hours info (above the fold)',
            checkFunction: 'hasEmergencyAfterHoursInfo',
            severity: 'critical',
            description: 'Is emergency/after-hours info prominently displayed above the fold?',
            recommendation: 'Display emergency number and after-hours instructions above the fold on mobile.',
        },
        {
            id: 'online_appointment_booking',
            title: 'Online appointment booking available',
            checkFunction: 'hasOnlineAppointmentBooking',
            severity: 'critical',
            description: 'Is online appointment booking available?',
            recommendation: 'Add online scheduling (e.g., Vetster, Vetspire) for 24/7 booking.',
        },
        {
            id: 'services_listed',
            title: 'Services page completeness (list all services with descriptions)',
            checkFunction: 'hasServicesListed',
            severity: 'critical',
            description: 'Are all services listed with descriptions?',
            recommendation: 'Create a services page with descriptions (wellness, surgery, dental, emergency, etc.).',
        },
        {
            id: 'pet_portal_login',
            title: 'Pet portal or client login',
            checkFunction: 'hasPetPortalLogin',
            severity: 'high',
            description: 'Is there a pet portal or client login for records and appointments?',
            recommendation: 'Add a client portal for vaccination records, appointment history, and online requests.',
        },
        {
            id: 'new_client_forms_online',
            title: 'New client forms online (save time at visit)',
            checkFunction: 'hasNewClientFormsOnline',
            severity: 'high',
            description: 'Can new clients complete forms online before their first visit?',
            recommendation: 'Offer new client forms online to reduce wait time and improve first impressions.',
        },
        {
            id: 'reviews_mentioning_vets',
            title: 'Reviews mentioning specific vets by name',
            checkFunction: 'hasReviewsMentioningVets',
            severity: 'high',
            description: 'Do Google reviews mention specific vets? Personal connection builds trust.',
            recommendation: 'Encourage reviews that mention vet names — "Dr. Smith was wonderful" builds trust.',
        },
        {
            id: 'vet_bios_credentials',
            title: 'Vet bios with credentials and photos',
            checkFunction: 'hasVetBiosCredentials',
            severity: 'high',
            description: 'Do vet bios include credentials and photos?',
            recommendation: 'Add vet bios with photos, DVM credentials, and specialisations.',
        },
        {
            id: 'pet_owner_resources',
            title: 'Pet owner resources (FAQ, blog, puppy guides)',
            checkFunction: 'hasPetOwnerResources',
            severity: 'medium',
            description: 'Are pet owner resources (FAQ, blog, guides) present?',
            recommendation: 'Add FAQ, blog posts, or guides (puppy care, senior pets) to build authority.',
        },
        {
            id: 'pipeda_privacy',
            title: 'Privacy policy for pet/owner data (PIPEDA)',
            checkFunction: 'hasPipedaPrivacy',
            severity: 'medium',
            description: 'Is there a clear privacy policy for pet and owner data?',
            recommendation: 'Add a PIPEDA-compliant privacy policy for client and pet records.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            'Pet owners are emotionally invested — they choose a vet they trust. Your site must build that trust in seconds.',
            'Missing emergency info can cost lives. It must be visible immediately.',
            'No online booking means lost appointments when the office is closed.',
        ],
        valueProps: [
            'More new clients with online booking and clear service info',
            'Higher trust with vet bios and pet owner resources',
            'Reduced no-shows with automated reminders',
        ],
        socialProof: "We've helped 35+ Saskatchewan veterinary clinics attract more pet owners and fill their schedules.",
        urgencyHook: 'Pet owners are emotionally invested — they choose a vet they trust. Your site must build that trust in seconds.',
        roiFraming: 'Each new client represents $175+ in average lifetime value per visit.',
        executiveSummaryOpening: 'Saskatoon pet owners search for vets when they need one — your site and emergency visibility matter.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 25+ veterinary clinics — trust and convenience win.',
        regulatoryContext: ['PIPEDA (client/pet data)', 'Saskatchewan Veterinary Medical Association', 'CASL (appointment reminders)'],
    },
};
