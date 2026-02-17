import type { VerticalPlaybook } from '../types';

export const retailPlaybook: VerticalPlaybook = {
    id: 'retail',
    name: 'Retail & E-commerce',
    icon: '🛒',

    averageOrderValue: 50,
    conversionRate: 0.04,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 6),

    priorityFindings: [
        'ecommerce_functionality',
        'product_page_seo',
        'mobile_checkout',
        'payment_options',
        'store_hours_location',
        'inventory_availability',
    ],

    industryBenchmarks: {
        pageSpeed: 75,
        mobileScore: 85,
        avgLoadTime: 2.0,
        avgReviewRating: 4.1,
        avgReviewCount: 80,
    },

    verticalSpecificFindings: [
        {
            id: 'ecommerce_functionality',
            title: 'E-commerce functionality (if applicable)',
            checkFunction: 'hasEcommerceFunctionality',
            severity: 'critical',
            description: 'If you sell online, does the checkout flow work?',
            recommendation: 'Ensure add-to-cart, checkout, and payment flow work seamlessly.',
        },
        {
            id: 'product_descriptions_unique',
            title: 'Product page SEO (unique descriptions, schema markup)',
            checkFunction: 'hasProductDescriptionsUnique',
            severity: 'critical',
            description: 'Do product pages have unique descriptions and schema markup?',
            recommendation: 'Write unique product descriptions for SEO. Add Product schema markup.',
        },
        {
            id: 'mobile_checkout_optimized',
            title: 'Mobile checkout experience',
            checkFunction: 'hasMobileCheckoutOptimized',
            severity: 'critical',
            description: 'Is checkout optimised for mobile (3 steps or less)?',
            recommendation: 'Streamline checkout to 3 steps or less. Guest checkout and saved payment info boost conversion.',
        },
        {
            id: 'payment_options',
            title: 'Payment options visibility (credit, debit, e-transfer, Apple Pay)',
            checkFunction: 'hasPaymentOptions',
            severity: 'high',
            description: 'Are payment options (credit, debit, e-transfer, Apple Pay) visible?',
            recommendation: 'Offer credit, debit, e-transfer, Apple Pay, and Google Pay. Canadians expect multiple options.',
        },
        {
            id: 'store_locator_inventory',
            title: 'Store hours and location info',
            checkFunction: 'hasStoreLocatorInventory',
            severity: 'high',
            description: 'Are store hours and location clearly displayed?',
            recommendation: 'Display store hours, address, and directions. Link to Google Maps.',
        },
        {
            id: 'inventory_availability',
            title: 'Inventory or availability indicators',
            checkFunction: 'hasInventoryAvailability',
            severity: 'high',
            description: 'Is there a store locator or "check availability" for local pickup?',
            recommendation: 'Add "check availability" or store locator for local pickup. Your advantage is local trust.',
        },
        {
            id: 'shipping_return_policies',
            title: 'Shipping and return policies clearly visible',
            checkFunction: 'hasShippingReturnPolicies',
            severity: 'medium',
            description: 'Are shipping and return policies clearly visible?',
            recommendation: 'Display shipping costs, delivery times, and return policy prominently.',
        },
        {
            id: 'casl_consent',
            title: 'CASL-compliant email signup (if collecting emails)',
            checkFunction: 'hasCaslConsent',
            severity: 'medium',
            description: 'If collecting emails, is CASL consent obtained?',
            recommendation: 'Ensure email signup includes express consent (CASL) for Canadian marketing.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            'Amazon has same-day delivery. Your advantage is local trust — but only if your site converts.',
            'Slow product pages and complex checkout lose 70%+ of mobile shoppers.',
            'Duplicate product descriptions hurt SEO — competitors with unique copy outrank you.',
        ],
        valueProps: [
            'More sales with fast mobile checkout and multiple payment options',
            'Better SEO with unique product descriptions',
            'Stronger local advantage with store locator and inventory',
        ],
        socialProof: "We've helped 45+ Saskatchewan retailers compete with big-box stores online.",
        urgencyHook: 'Amazon has same-day delivery. Your advantage is local trust — but only if your site converts.',
        roiFraming: 'Each lost mobile shopper could mean $50+ in lost sale value.',
        executiveSummaryOpening: 'Saskatoon shoppers compare local retailers online — your site speed and checkout UX decide who buys.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon retailers compete with national chains — local trust and UX win.',
        regulatoryContext: ['CASL (email marketing)', 'PIPEDA (customer data)', 'Provincial consumer protection'],
    },
};
