import type { VerticalPlaybook } from '../types';

export const gymPlaybook: VerticalPlaybook = {
    id: 'gym',
    name: 'Gyms & Fitness Centres',
    icon: '💪',

    averageOrderValue: 55,
    conversionRate: 0.03,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 4),

    priorityFindings: [
        'class_schedule_ux',
        'online_membership_signup',
        'free_trial_cta',
        'social_proof_transformations',
        'mobile_class_booking',
        'gbp_photos_facility',
    ],

    industryBenchmarks: {
        pageSpeed: 70,
        mobileScore: 80,
        avgLoadTime: 3.0,
        avgReviewRating: 4.1,
        avgReviewCount: 95,
    },

    verticalSpecificFindings: [
        {
            id: 'class_schedule_accessible',
            title: 'Class schedule visibility and UX',
            checkFunction: 'hasClassScheduleAccessible',
            severity: 'critical',
            description: 'Is the class schedule accessible and up to date?',
            recommendation: 'Display class schedules prominently with real-time updates. Link to booking or show availability.',
        },
        {
            id: 'online_membership_signup',
            title: 'Online membership signup flow',
            checkFunction: 'hasOnlineMembershipSignup',
            severity: 'critical',
            description: 'Can prospects sign up for membership online?',
            recommendation: 'Add an online membership signup flow — reduce friction and capture leads 24/7.',
        },
        {
            id: 'free_trial_cta',
            title: 'Free trial or guest pass CTA',
            checkFunction: 'hasFreeTrialCTA',
            severity: 'critical',
            description: 'Is there a free trial or guest pass CTA above the fold?',
            recommendation: 'Add a prominent "Free Trial" or "First Visit Free" CTA above the fold.',
        },
        {
            id: 'member_testimonials',
            title: 'Social proof (transformation stories, member count)',
            checkFunction: 'hasMemberTestimonials',
            severity: 'high',
            description: 'Are transformation stories or member testimonials featured?',
            recommendation: 'Feature transformation stories, before/after photos, and member quotes to build trust.',
        },
        {
            id: 'mobile_booking_optimized',
            title: 'Mobile booking for classes',
            checkFunction: 'hasMobileBookingOptimized',
            severity: 'critical',
            description: 'Is class booking optimised for mobile?',
            recommendation: 'Ensure class booking and membership signup work seamlessly on mobile.',
        },
        {
            id: 'gbp_photos_facility',
            title: 'Google Business photos (facility, equipment, classes)',
            checkFunction: 'hasGbpPhotosFacility',
            severity: 'high',
            description: 'Does Google Business have 10+ photos of facility, equipment, and classes?',
            recommendation: 'Upload 15+ photos (facility, equipment, classes, team) to your Google Business Profile.',
        },
        {
            id: 'pricing_transparent',
            title: 'Membership pricing transparent',
            checkFunction: 'hasPricingTransparent',
            severity: 'high',
            description: 'Is pricing transparent?',
            recommendation: 'Add a clear pricing page with membership tiers, fees, and what\'s included.',
        },
        {
            id: 'amenities_listed',
            title: 'Amenities and services listed',
            checkFunction: 'hasAmenitiesListed',
            severity: 'medium',
            description: 'Are amenities (pool, sauna, childcare, etc.) clearly listed?',
            recommendation: 'List all amenities and services to help prospects compare.',
        },
    ],

    proposalLanguage: {
        painPoints: [
            '73% of gym members research online before signing up. A slow or confusing site kills conversions.',
            'Hidden pricing and no free trial CTA lose leads to competitors.',
            'Outdated class schedules frustrate members and hurt retention.',
        ],
        valueProps: [
            'More sign-ups with transparent pricing and free trial CTA',
            'Higher conversion with mobile-optimised booking',
            'Stronger trust with transformation stories and testimonials',
        ],
        socialProof: "We've helped 40+ Saskatchewan gyms and fitness studios fill more memberships online.",
        urgencyHook: '73% of gym members research online before signing up. A slow or confusing site kills conversions.',
        roiFraming: 'Each new member represents $55+ per month in recurring revenue.',
        executiveSummaryOpening: 'Saskatoon fitness seekers compare gyms online — your site and Google presence decide who joins.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'Saskatoon has 50+ gyms and fitness studios — differentiation matters.',
        regulatoryContext: ['Provincial health regulations', 'PIPEDA (member data)', 'CASL (promotions)'],
    },
};
