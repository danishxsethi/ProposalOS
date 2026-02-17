import type { VerticalPlaybook } from '../types';

export const restaurantPlaybook: VerticalPlaybook = {
    id: 'restaurant',
    name: 'Restaurants & Food Service',
    icon: '🍽️',

    averageOrderValue: 40,
    conversionRate: 0.05,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 8),

    priorityFindings: [
        'menu_html_accessibility',
        'online_ordering',
        'gbp_hours_accuracy',
        'gbp_photos_quality',
        'reservation_system',
        'dietary_info',
    ],

    industryBenchmarks: {
        pageSpeed: 70,
        mobileScore: 80,
        avgLoadTime: 2.5,
        avgReviewRating: 4.0,
        avgReviewCount: 150,
    },

    verticalSpecificFindings: [
        {
            id: 'menu_html',
            title: 'Online menu accessible (not just a PDF image)',
            checkFunction: 'hasMenuAsHtml',
            severity: 'critical',
            description: 'Is the menu available as HTML (not just a PDF)? PDFs hurt SEO and mobile UX.',
            recommendation: 'Convert the menu to HTML for SEO and mobile readability. PDFs cannot be indexed properly.',
        },
        {
            id: 'online_ordering',
            title: 'Online ordering integration (Skip, DoorDash, direct)',
            checkFunction: 'hasOnlineOrdering',
            severity: 'critical',
            description: 'Is online ordering available or linked?',
            recommendation: 'Add online ordering or link to Skip The Dishes, DoorDash, or your own ordering system.',
        },
        {
            id: 'gbp_hours_accurate',
            title: 'Google Business hours accuracy (critical — stale hours = lost customers)',
            checkFunction: 'hasAccurateGbpHours',
            severity: 'critical',
            description: 'Are Google Business hours accurate and complete?',
            recommendation: 'Keep Google Business hours up to date, including holidays and special hours.',
        },
        {
            id: 'gbp_photos',
            title: 'Photo quality and recency on Google Business',
            checkFunction: 'hasGbpPhotos',
            severity: 'high',
            description: 'Does Google Business have 10+ recent, high-quality photos?',
            recommendation: 'Add 10+ high-quality photos (food, interior, exterior) and update regularly.',
        },
        {
            id: 'reservation_system',
            title: 'Reservation or waitlist system',
            checkFunction: 'hasReservationSystem',
            severity: 'high',
            description: 'Is there a reservation or waitlist system?',
            recommendation: 'Add OpenTable, Resy, or a simple reservation form for dine-in customers.',
        },
        {
            id: 'dietary_info',
            title: 'Special dietary info (allergens, vegan options)',
            checkFunction: 'hasDietaryInfo',
            severity: 'high',
            description: 'Is allergen and dietary info (vegan, gluten-free) available?',
            recommendation: 'List allergens and dietary options — 30%+ of diners have dietary restrictions.',
        },
        {
            id: 'mobile_experience_fast',
            title: 'Mobile experience fast (people search while hungry)',
            checkFunction: 'hasFastMobileExperience',
            severity: 'critical',
            description: 'Is the mobile experience fast? Hungry customers won\'t wait.',
            recommendation: 'Optimise for mobile speed — hungry customers will pick the next restaurant on Google.',
        },
        {
            id: 'local_seo_saskatoon',
            title: 'Local SEO for Saskatoon (menu, neighbourhood)',
            checkFunction: 'hasLocalSeoSaskatoon',
            severity: 'medium',
            description: 'Does the site target "restaurant Saskatoon" and neighbourhood searches?',
            recommendation: 'Optimise for "restaurant Broadway Saskatoon" and similar local queries.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            "Hungry customers won't wait for a slow site — they'll pick the next restaurant on Google.",
            'PDF menus hurt SEO and mobile UX. Google cannot index them properly.',
            'Incomplete Google Business profiles lose clicks to competitors with better photos and hours.',
        ],
        valueProps: [
            'More reservations and orders with fast mobile experience',
            'Better local visibility with optimised Google Business Profile',
            'Higher conversion with HTML menu and online ordering',
        ],
        socialProof: "We've helped 60+ Saskatchewan restaurants improve visibility and online orders.",
        urgencyHook: "Hungry customers won't wait for a slow site — they'll pick the next restaurant on Google.",
        roiFraming: 'Each lost click to a competitor could mean $40+ in lost order value.',
        executiveSummaryOpening: 'Saskatoon diners search for restaurants on their phones — your site has seconds to convert.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 400+ restaurants — your Google listing and site speed determine who gets the click.',
        regulatoryContext: ['Saskatchewan Food Safety', 'Liquor licensing', 'CASL (email for promotions)'],
        neighbourhoods: ['Downtown', 'Broadway', 'Nutana', 'Riversdale', 'Stonebridge', 'University', 'Sutherland'],
    },
};
