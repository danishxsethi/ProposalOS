import type { VerticalPlaybook } from '../types';

export const lawFirmPlaybook: VerticalPlaybook = {
    id: 'law-firm',
    name: 'Law Firms & Attorneys',
    icon: '⚖️',

    averageOrderValue: 2500,
    conversionRate: 0.015,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 2),

    priorityFindings: [
        'practice_area_pages',
        'attorney_bios_credentials',
        'free_consultation_cta',
        'case_results_testimonials',
        'trust_signals_bar',
        'lawyer_near_me_seo',
    ],

    industryBenchmarks: {
        pageSpeed: 70,
        mobileScore: 75,
        avgLoadTime: 3.0,
        avgReviewRating: 4.5,
        avgReviewCount: 45,
    },

    verticalSpecificFindings: [
        {
            id: 'practice_area_pages',
            title: 'Practice area pages (one per area, not a single list)',
            checkFunction: 'hasPracticeAreaPages',
            severity: 'critical',
            description: 'Does each practice area have its own dedicated page?',
            recommendation: 'Create dedicated pages for each practice area (e.g., Personal Injury, Family Law, Real Estate) with targeted content.',
        },
        {
            id: 'attorney_credentials',
            title: 'Attorney bio pages with photo, credentials, and bar admission',
            checkFunction: 'hasAttorneyCredentials',
            severity: 'critical',
            description: 'Are attorney bios with photo, credentials, and Saskatchewan bar admission displayed?',
            recommendation: 'Display bar membership, years of experience, and credentials on attorney bio pages.',
        },
        {
            id: 'free_consultation_cta',
            title: 'Free consultation CTA prominence',
            checkFunction: 'hasFreeConsultationCTA',
            severity: 'critical',
            description: 'Is there a free consultation CTA above the fold?',
            recommendation: 'Add a prominent "Free Consultation" CTA in the header and hero section.',
        },
        {
            id: 'case_results_testimonials',
            title: 'Client testimonials or case results (with disclaimers)',
            checkFunction: 'hasCaseResultsOrTestimonials',
            severity: 'high',
            description: 'Are case results or client testimonials featured with appropriate disclaimers?',
            recommendation: 'Feature client testimonials and case results with appropriate legal disclaimers.',
        },
        {
            id: 'lawyer_near_me_seo',
            title: '"Lawyer near me" local SEO signals',
            checkFunction: 'hasLawyerNearMeSeo',
            severity: 'high',
            description: 'Does the site target local search (e.g., "family lawyer Saskatoon")?',
            recommendation: 'Optimise for "lawyer Saskatoon" and practice-area + city combinations in titles and content.',
        },
        {
            id: 'trust_signals_bar',
            title: 'Trust signals (bar association badges, awards, years of practice)',
            checkFunction: 'hasTrustSignalsBar',
            severity: 'high',
            description: 'Are trust signals (Saskatchewan Law Society, awards, years of practice) displayed?',
            recommendation: 'Display Saskatchewan Law Society membership, awards, and years of practice.',
        },
        {
            id: 'ada_accessibility',
            title: 'Accessibility compliance (legal risk for law firms)',
            checkFunction: 'hasAdaCompliance',
            severity: 'high',
            description: 'Is the site accessible? Law firms face higher ADA litigation risk.',
            recommendation: 'Ensure WCAG 2.1 compliance — law firms face higher accessibility litigation risk.',
        },
        {
            id: 'pipeda_privacy',
            title: 'Privacy policy and PIPEDA compliance',
            checkFunction: 'hasPipedaPrivacy',
            severity: 'medium',
            description: 'Is there a clear privacy policy for client data (PIPEDA)?',
            recommendation: 'Add a PIPEDA-compliant privacy policy for client confidentiality.',
        },
        {
            id: 'intake_forms',
            title: 'Online intake or contact forms',
            checkFunction: 'hasIntakeForms',
            severity: 'medium',
            description: 'Are there simple intake or contact forms for new inquiries?',
            recommendation: 'Add streamlined intake forms to capture leads 24/7.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            '67% of legal clients search online first. Your Saskatoon competitors are already ranking.',
            'Clients expect to find practice areas and attorney credentials instantly.',
            'Inaccessible sites can lead to litigation — a risk law firms should avoid.',
        ],
        valueProps: [
            'More qualified leads from practice-area-specific SEO',
            'Higher conversion with clear CTAs and intake forms',
            'Reduced legal risk with accessible, compliant design',
        ],
        socialProof: "We've helped 30+ Saskatchewan law firms rank higher and convert more online inquiries into clients.",
        urgencyHook: '67% of legal clients search online first. Your competitors are already ranking.',
        roiFraming: 'Each new client from a practice area page can represent $2,500+ in fees.',
        executiveSummaryOpening: 'Saskatoon clients searching for legal help compare multiple firms online before contacting one.',
    },

    pricingMultiplier: 1.2,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 100+ law firms — your website is often the first impression.',
        regulatoryContext: ['PIPEDA (client privacy)', 'Saskatchewan Law Society', 'CASL (email consent)'],
    },
};
