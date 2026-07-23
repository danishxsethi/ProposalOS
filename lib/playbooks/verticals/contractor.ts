import type { VerticalPlaybook } from '../types';

export const contractorPlaybook: VerticalPlaybook = {
    id: 'contractor',
    name: 'Contractors & Home Services',
    icon: '🔧',

    averageOrderValue: 5500,
    conversionRate: 0.015,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 2),

    priorityFindings: [
        'project_portfolio',
        'licensing_insurance_bonding',
        'service_area_map',
        'quote_request_form',
        'certifications_partnerships',
        'warranty_guarantee',
    ],

    industryBenchmarks: {
        pageSpeed: 60,
        mobileScore: 70,
        avgLoadTime: 3.5,
        avgReviewRating: 4.2,
        avgReviewCount: 50,
    },

    verticalSpecificFindings: [
        {
            id: 'project_portfolio_photos',
            title: 'Project portfolio with before/after photos',
            checkFunction: 'hasProjectPortfolioPhotos',
            severity: 'critical',
            description: 'Is there a project portfolio with before/after photos?',
            recommendation: 'Add a portfolio of completed projects with before/after photos. No portfolio = no call.',
        },
        {
            id: 'licensing_insurance_bonding',
            title: 'Licensing, insurance, and bonding info prominently displayed',
            checkFunction: 'hasLicensingInsuranceBonding',
            severity: 'critical',
            description: 'Are licensing, insurance, and bonding credentials displayed?',
            recommendation: 'Display Saskatchewan contractor licence, liability insurance, and bonding badges.',
        },
        {
            id: 'service_areas_defined',
            title: 'Service area map (Saskatoon + surrounding communities)',
            checkFunction: 'hasServiceAreasDefined',
            severity: 'critical',
            description: 'Is the service area (Saskatoon + surrounding communities) clearly defined?',
            recommendation: 'List Saskatoon neighbourhoods and surrounding communities (Martensville, Warman, etc.) served.',
        },
        {
            id: 'quote_request_form',
            title: 'Online quote or estimate request form',
            checkFunction: 'hasQuoteRequestForm',
            severity: 'critical',
            description: 'Is the quote request form simple and accessible?',
            recommendation: 'Add a simple quote request form (project type, contact info) above the fold.',
        },
        {
            id: 'certifications_partnerships',
            title: 'Certifications and manufacturer partnerships',
            checkFunction: 'hasCertificationsPartnerships',
            severity: 'high',
            description: 'Are certifications and manufacturer partnerships displayed?',
            recommendation: 'Display manufacturer certifications (e.g., James Hardie, CertainTeed) and trade associations.',
        },
        {
            id: 'warranty_guarantee',
            title: 'Warranty or guarantee information',
            checkFunction: 'hasWarrantyGuarantee',
            severity: 'high',
            description: 'Is warranty or guarantee information displayed?',
            recommendation: 'Display workmanship warranty and product guarantees to build trust.',
        },
        {
            id: 'emergency_service_visibility',
            title: 'Emergency service visibility (for plumbers, HVAC)',
            checkFunction: 'hasEmergencyServiceVisibility',
            severity: 'high',
            description: 'Is emergency service prominently displayed (if applicable)?',
            recommendation: 'Place emergency number in sticky header for 24/7 trades.',
        },
        {
            id: 'financing_options',
            title: 'Financing options mentioned',
            checkFunction: 'hasFinancingOptions',
            severity: 'medium',
            description: 'Are financing options mentioned?',
            recommendation: 'Mention financing for larger projects to reduce purchase friction.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            'Homeowners check 3-5 contractors online before calling. No portfolio = no call.',
            'Missing trust signals (licence, insurance) sends leads to competitors who display them.',
            'Complex quote forms lose leads — keep it simple.',
        ],
        valueProps: [
            'More quote requests with portfolio and simple form',
            'Higher trust with licensing and insurance displayed',
            'Better lead quality with clear Saskatoon service areas',
        ],
        socialProof: "We've helped 60+ Saskatchewan contractors and home service businesses win more projects online.",
        urgencyHook: 'Homeowners check 3-5 contractors online before calling. No portfolio = no call.',
        roiFraming: 'Each project from your website can represent $5,500+ in revenue.',
        executiveSummaryOpening: 'Saskatoon homeowners search for contractors when they need work — your portfolio and trust signals decide who gets the call.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 200+ contractors and trades — your portfolio and trust signals win jobs.',
        regulatoryContext: ['Saskatchewan Apprenticeship and Trade Certification', 'Provincial licensing', 'Liability insurance', 'Bonding'],
        neighbourhoods: ['Downtown', 'Nutana', 'Broadway', 'Stonebridge', 'Evergreen', 'Willowgrove', 'Martensville', 'Warman', 'Osler', 'Dundurn'],
    },
};
