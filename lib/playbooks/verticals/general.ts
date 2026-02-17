import type { VerticalPlaybook } from '../types';

/**
 * General fallback playbook — used when no vertical is detected.
 * Uses average benchmarks across all industries.
 */
export const generalPlaybook: VerticalPlaybook = {
    id: 'general',
    name: 'Local Business',
    icon: '🏪',

    averageOrderValue: 150,
    conversionRate: 0.03,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 4),

    priorityFindings: [
        'site_speed',
        'mobile_experience',
        'contact_visibility',
        'trust_signals',
        'conversion_cta',
    ],

    industryBenchmarks: {
        pageSpeed: 70,
        mobileScore: 75,
        avgLoadTime: 3.0,
        avgReviewRating: 4.2,
        avgReviewCount: 65,
    },

    verticalSpecificFindings: [
        {
            id: 'site_speed',
            title: 'Site loads quickly',
            checkFunction: 'hasSiteSpeed',
            severity: 'high',
            description: 'Does the site load quickly?',
            recommendation: 'Optimize images, enable caching, and reduce server response time. Target under 3 seconds.',
        },
        {
            id: 'mobile_experience',
            title: 'Mobile experience optimized',
            checkFunction: 'hasMobileExperience',
            severity: 'high',
            description: 'Is the mobile experience optimized?',
            recommendation: 'Ensure responsive design, readable text, and tappable buttons (min 44px).',
        },
        {
            id: 'contact_visibility',
            title: 'Contact info prominently displayed',
            checkFunction: 'hasContactVisibility',
            severity: 'critical',
            description: 'Is contact info prominently displayed?',
            recommendation: 'Display phone, email, and address above the fold. Add click-to-call on mobile.',
        },
        {
            id: 'trust_signals',
            title: 'Trust signals (reviews, credentials)',
            checkFunction: 'hasTrustSignals',
            severity: 'medium',
            description: 'Are trust signals (reviews, credentials) present?',
            recommendation: 'Feature Google reviews, testimonials, or credentials to build trust.',
        },
        {
            id: 'conversion_cta',
            title: 'Clear call-to-action',
            checkFunction: 'hasConversionCTA',
            severity: 'high',
            description: 'Is there a clear call-to-action?',
            recommendation: 'Add a prominent CTA (Contact, Get Quote, Book Now) above the fold.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            'Most customers research online before contacting. A slow or confusing site loses them.',
            'Missing contact info and unclear CTAs send leads to competitors.',
            'Mobile experience matters — over 60% of local searches happen on phones.',
        ],
        valueProps: [
            'More leads with fast site and clear contact info',
            'Higher trust with reviews and credentials',
            'Better conversion with mobile-optimized experience',
        ],
        socialProof: "We've helped 200+ local businesses improve their online presence and win more customers.",
        urgencyHook: 'Most customers research online before contacting. A slow or confusing site loses them.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',
};
