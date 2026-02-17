import type { VerticalPlaybook } from '../types';

export const dentistPlaybook: VerticalPlaybook = {
    id: 'dentist',
    name: 'Dentists & Dental Clinics',
    icon: '🦷',

    averageOrderValue: 250,
    conversionRate: 0.03,
    monthlyVisitorEstimate: (reviewCount) => Math.round(reviewCount * 3.5),

    priorityFindings: [
        'online_booking_widget',
        'emergency_number_visibility',
        'before_after_gallery',
        'insurance_info_page',
        'new_patient_offer',
        'gbp_review_response',
    ],

    industryBenchmarks: {
        pageSpeed: 75,
        mobileScore: 80,
        avgLoadTime: 2.5,
        avgReviewRating: 4.3,
        avgReviewCount: 85,
    },

    verticalSpecificFindings: [
        {
            id: 'online_booking_widget',
            title: 'Online appointment booking widget',
            checkFunction: 'hasOnlineBookingWidget',
            severity: 'critical',
            description: 'Does the site have an online scheduling widget? Online booking is now expected by patients.',
            recommendation: 'Add an online scheduling widget (e.g., Luma, Jane, or embedded Calendly) so patients can book 24/7.',
        },
        {
            id: 'emergency_number_visibility',
            title: 'Emergency/after-hours number prominently displayed',
            checkFunction: 'hasEmergencyNumberVisible',
            severity: 'critical',
            description: 'Is the emergency/after-hours number prominently displayed above the fold?',
            recommendation: 'Display the emergency/after-hours number above the fold on mobile and in the header.',
        },
        {
            id: 'insurance_payment_page',
            title: 'Insurance and payment information page completeness',
            checkFunction: 'hasInsurancePaymentPage',
            severity: 'high',
            description: 'Is there a dedicated page listing accepted insurance plans and payment options?',
            recommendation: 'Create a dedicated page listing accepted insurance plans (including Saskatchewan health coverage) and payment options.',
        },
        {
            id: 'before_after_gallery',
            title: 'Before/after gallery with consent notice',
            checkFunction: 'hasBeforeAfterGallery',
            severity: 'high',
            description: 'Is there a before/after gallery with proper consent/privacy notice?',
            recommendation: 'Add a before/after gallery with a PIPEDA-compliant consent notice. Visual proof builds trust.',
        },
        {
            id: 'new_patient_offer',
            title: 'New patient offer or promotion visibility',
            checkFunction: 'hasNewPatientOffer',
            severity: 'high',
            description: 'Is a new patient offer or promotion visible (e.g., free exam, whitening special)?',
            recommendation: 'Promote new patient offers (free exam, whitening) above the fold to capture first-time visitors.',
        },
        {
            id: 'gbp_review_response',
            title: 'Google reviews response rate',
            checkFunction: 'hasGbpReviewResponse',
            severity: 'high',
            description: 'Are Google reviews being responded to? Patients check reviews before choosing a dentist.',
            recommendation: 'Respond to all Google reviews — 89% of patients read business responses before booking.',
        },
        {
            id: 'patient_testimonials',
            title: 'Patient testimonials or reviews featured',
            checkFunction: 'hasPatientTestimonials',
            severity: 'medium',
            description: 'Are patient testimonials or reviews featured on the site?',
            recommendation: 'Add a testimonials section with Google reviews or patient quotes to build trust.',
        },
        {
            id: 'provider_bios',
            title: 'Provider bios with credentials',
            checkFunction: 'hasProviderBios',
            severity: 'medium',
            description: 'Are provider bios with credentials and photos listed?',
            recommendation: 'Add provider bios with photos, credentials (DDS, DMD), and specialties.',
        },
        {
            id: 'accessibility_compliance',
            title: 'Accessibility and PIPEDA compliance',
            checkFunction: 'hasAccessibilityPipeda',
            severity: 'medium',
            description: 'Is the site accessible and does it address Canadian privacy (PIPEDA)?',
            recommendation: 'Ensure WCAG 2.1 compliance and a clear privacy policy for patient data (PIPEDA).',
        },
    ],

    proposalLanguage: {
        painPoints: [
            'Patients decide on a dentist in under 10 seconds on their phone.',
            'There are 47+ dentists in Saskatoon — standing out online is critical.',
            'Slow sites lose 53% of mobile visitors before the page loads.',
            'Missing online booking means lost appointments when the office is closed.',
        ],
        valueProps: [
            'More new patient appointments from 24/7 online booking',
            'Higher trust with before/after galleries and patient reviews',
            'Reduced no-shows with automated reminders',
        ],
        socialProof: "We've helped 50+ dental practices in Saskatchewan improve their online presence and fill more chairs.",
        urgencyHook: 'Patients searching for dentists in Saskatoon decide in under 10 seconds on their phone.',
        roiFraming: 'Every patient you lose to a competitor represents $3,000+ in lifetime value.',
        executiveSummaryOpening: 'With 47+ dental practices in Saskatoon, your online presence determines whether new patients choose you or a competitor.',
    },

    pricingMultiplier: 1.0,
    recommendedTier: 'growth',

    locationContext: {
        city: 'Saskatoon',
        region: 'Saskatchewan',
        country: 'Canada',
        currency: 'CAD',
        competitiveDensity: 'There are 47+ dentists in Saskatoon — standing out online is critical.',
        regulatoryContext: ['PIPEDA (patient privacy)', 'Saskatchewan College of Dental Surgeons', 'CASL (email consent)'],
        neighbourhoods: ['Downtown', 'Nutana', 'Broadway', 'Stonebridge', 'Evergreen', 'Willowgrove', 'University Heights', 'Lawson Heights', 'River Heights'],
    },
};
