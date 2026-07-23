import type { VerticalPlaybook } from '../types';

export const salonPlaybook: VerticalPlaybook = {
    id: 'salon',
    name: 'Salons & Beauty',
    icon: '💇',

    averageOrderValue: 95,
    conversionRate: 0.04,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 5),

    priorityFindings: [
        'booking_widget',
        'portfolio_gallery',
        'stylist_pages',
        'gift_cards_online',
        'pricing_transparency',
        'gbp_photos',
    ],

    industryBenchmarks: {
        pageSpeed: 70,
        mobileScore: 80,
        avgLoadTime: 2.5,
        avgReviewRating: 4.3,
        avgReviewCount: 110,
    },

    verticalSpecificFindings: [
        {
            id: 'booking_widget_mobile',
            title: 'Online booking widget (Booksy, Vagaro, etc.)',
            checkFunction: 'hasBookingWidgetMobile',
            severity: 'critical',
            description: 'Does the site have an online booking widget that works on mobile?',
            recommendation: 'Use a fast, mobile-friendly booking system (Vagaro, Fresha, Booksy, Square) that loads quickly.',
        },
        {
            id: 'portfolio_gallery',
            title: 'Portfolio/gallery of work (Instagram integration)',
            checkFunction: 'hasPortfolioGallery',
            severity: 'critical',
            description: 'Is there a portfolio or gallery of work?',
            recommendation: 'Add a gallery with before/after photos, styles, and colour work. Consider Instagram integration.',
        },
        {
            id: 'stylist_technician_pages',
            title: 'Individual stylist/technician pages',
            checkFunction: 'hasStylistTechnicianPages',
            severity: 'high',
            description: 'Are individual stylist or technician pages present?',
            recommendation: 'Create pages for each stylist/technician with photo, specialties, and booking link.',
        },
        {
            id: 'gift_cards_online',
            title: 'Gift card or gift certificate online purchase',
            checkFunction: 'hasGiftCardsOnline',
            severity: 'high',
            description: 'Can customers purchase gift cards online?',
            recommendation: 'Add online gift card sales to capture holiday and gift-giving traffic.',
        },
        {
            id: 'service_menu_pricing',
            title: 'Pricing transparency',
            checkFunction: 'hasServiceMenuPricing',
            severity: 'high',
            description: 'Is the service menu with pricing available online?',
            recommendation: 'Display services with prices (cuts, colour, treatments) to reduce friction.',
        },
        {
            id: 'gbp_photos_quality',
            title: 'Google Business photos (interior, work samples)',
            checkFunction: 'hasGbpPhotosQuality',
            severity: 'high',
            description: 'Are Google Business photos high quality and recent?',
            recommendation: 'Upload 15+ high-quality photos (work, interior, team) and update regularly.',
        },
        {
            id: 'mobile_booking_ux',
            title: 'Mobile booking experience smooth',
            checkFunction: 'hasMobileBookingUx',
            severity: 'critical',
            description: 'Does the booking flow work smoothly on mobile?',
            recommendation: 'Ensure booking loads fast and works on mobile — most clients book on their phone.',
        },
        {
            id: 'social_proof_reviews',
            title: 'Social proof (reviews, before/after)',
            checkFunction: 'hasSocialProofReviews',
            severity: 'medium',
            description: 'Are reviews and before/after work featured?',
            recommendation: 'Feature Google reviews and before/after photos to build trust.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            '80% of salon clients book after seeing your work online. Your portfolio IS your storefront.',
            'Slow or broken booking widgets lose clients to competitors with smoother UX.',
            'Missing pricing creates friction — clients want to know cost before booking.',
        ],
        valueProps: [
            'More bookings with fast mobile booking and strong portfolio',
            'Higher trust with quality photos and clear pricing',
            'Additional revenue from online gift card sales',
        ],
        socialProof: "We've helped 55+ Saskatchewan salons and spas attract more clients and fill their books.",
        urgencyHook: '80% of salon clients book after seeing your work online. Your portfolio IS your storefront.',
        roiFraming: 'Each new client represents $95+ in average service value.',
        executiveSummaryOpening: 'Saskatoon clients discover salons on Instagram and Google — your portfolio and booking UX decide who books.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 150+ salons and spas — your online presence wins bookings.',
        regulatoryContext: ['Provincial cosmetology licensing', 'PIPEDA (client data)', 'CASL (promotions)'],
    },
};
