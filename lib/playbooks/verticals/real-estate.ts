import type { VerticalPlaybook } from '../types';

export const realEstatePlaybook: VerticalPlaybook = {
    id: 'real-estate',
    name: 'Real Estate & Realtors',
    icon: '🏠',

    averageOrderValue: 10000,
    conversionRate: 0.01,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 5),

    priorityFindings: [
        'idx_mls_integration',
        'neighbourhood_pages',
        'listing_page_speed',
        'lead_capture_listings',
        'agent_bio_credentials',
        'virtual_tour_support',
    ],

    industryBenchmarks: {
        pageSpeed: 65,
        mobileScore: 70,
        avgLoadTime: 3.5,
        avgReviewRating: 4.4,
        avgReviewCount: 35,
    },

    verticalSpecificFindings: [
        {
            id: 'property_search_idx',
            title: 'IDX/MLS integration check',
            checkFunction: 'hasPropertySearchIdx',
            severity: 'critical',
            description: 'Is there a prominent property search or IDX integration?',
            recommendation: 'Add a prominent property search or IDX integration above the fold.',
        },
        {
            id: 'neighbourhood_pages',
            title: 'Neighbourhood/community pages for Saskatoon areas',
            checkFunction: 'hasNeighborhoodPages',
            severity: 'critical',
            description: 'Are neighbourhood pages present for Saskatoon areas?',
            recommendation: 'Create neighbourhood pages (Nutana, Broadway, Stonebridge, Evergreen, etc.) to capture "homes in [area]" searches.',
        },
        {
            id: 'listing_page_speed',
            title: 'Listing page load speed (image-heavy pages)',
            checkFunction: 'hasFastListingPages',
            severity: 'critical',
            description: 'Do listing pages load fast with optimised images?',
            recommendation: 'Optimise listing images (WebP, lazy load) and ensure pages load under 3 seconds.',
        },
        {
            id: 'lead_capture_form',
            title: 'Lead capture on every listing',
            checkFunction: 'hasLeadCaptureForm',
            severity: 'critical',
            description: 'Is there clear lead capture (home valuation, buyer inquiry) on listings?',
            recommendation: 'Add prominent lead capture forms: home valuation, buyer inquiry, contact agent.',
        },
        {
            id: 'agent_bio_trust',
            title: 'Agent bio with credentials and sales stats',
            checkFunction: 'hasAgentBioTrust',
            severity: 'high',
            description: 'Does the agent have a strong bio with photo, credentials, and recent sales?',
            recommendation: 'Add agent bio with photo, credentials, designations, and recent sales/testimonials.',
        },
        {
            id: 'virtual_tour_support',
            title: 'Virtual tour or video walkthrough support',
            checkFunction: 'hasVirtualTourSupport',
            severity: 'high',
            description: 'Are virtual tours or video walkthroughs supported on listings?',
            recommendation: 'Add Matterport, video walkthroughs, or 360° tours to listings.',
        },
        {
            id: 'mobile_listing_ux',
            title: 'Mobile-optimised listing experience',
            checkFunction: 'hasMobileListingUx',
            severity: 'high',
            description: 'Is the listing experience optimised for mobile?',
            recommendation: 'Ensure listing photos, details, and contact forms work seamlessly on mobile.',
        },
        {
            id: 'saskatoon_market_content',
            title: 'Saskatoon market insights or blog',
            checkFunction: 'hasSaskatoonMarketContent',
            severity: 'medium',
            description: 'Is there local market content (Saskatoon neighbourhoods, market trends)?',
            recommendation: 'Add blog posts on Saskatoon neighbourhoods and market trends to build authority.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            "Buyers spend 3+ hours online before contacting an agent. Your website is your first showing.",
            'Slow listing pages lose leads to faster competitors.',
            'Missing neighbourhood content means you lose "homes in Nutana" search traffic.',
        ],
        valueProps: [
            'More leads with fast listing pages and clear capture forms',
            'Better local visibility with Saskatoon neighbourhood content',
            'Higher trust with strong agent bio and credentials',
        ],
        socialProof: "We've helped 25+ Saskatchewan real estate agents and teams generate more leads from their websites.",
        urgencyHook: "Buyers spend 3+ hours online before contacting an agent. Your website is your first showing.",
        roiFraming: 'Each lead from your website can represent $10,000+ in commission.',
        executiveSummaryOpening: 'Saskatoon home buyers and sellers compare agents online before making contact.',
    },

    pricingMultiplier: 1.2,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 500+ active realtors — your website differentiates you.',
        regulatoryContext: ['Saskatchewan Real Estate Commission', 'PIPEDA (client data)', 'CASL (marketing)'],
        neighbourhoods: ['Nutana', 'Broadway', 'Riversdale', 'Stonebridge', 'Evergreen', 'Willowgrove', 'University Heights', 'Lawson Heights', 'River Heights', 'Confederation Park', 'Hampton Village', 'Silverspring', 'Rosewood'],
    },
};
