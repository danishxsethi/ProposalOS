import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import * as cheerio from 'cheerio';

export interface ConversionModuleInput {
    url: string;
    html: string;
    businessName: string;
}

interface ConversionElements {
    // Contact methods
    hasPhoneNumber: boolean;
    phoneNumbers: string[];
    hasClickToCall: boolean;
    hasEmail: boolean;
    emails: string[];
    hasContactForm: boolean;
    hasContactPageLink: boolean;
    hasPhysicalAddress: boolean;

    // CTAs
    ctaElements: Array<{ text: string; href?: string; position: number }>;
    hasCTAAboveFold: boolean;
    ctaCount: number;

    // Trust signals
    hasTestimonials: boolean;
    hasTrustBadges: boolean;
    hasYearsInBusiness: boolean;
    hasTeamSection: boolean;
    hasLicenseNumber: boolean;
    hasInsuranceMention: boolean;
    hasPrivacyPolicy: boolean;
    hasTermsOfService: boolean;

    // Booking
    hasOnlineBooking: boolean;
    bookingProviders: string[];

    // Live engagement
    hasLiveChat: boolean;
    chatProviders: string[];
}

/**
 * Analyze conversion elements on the homepage
 */
export async function runConversionModule(input: ConversionModuleInput): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[Conversion] Analyzing conversion elements');

    const $ = cheerio.load(input.html);
    const elements = detectConversionElements($, input.html);

    const findings = generateConversionFindings(elements, input.url, input.businessName);

    // Store analysis in evidence
    const evidenceSnapshot = {
        module: 'conversion',
        source: 'html_analysis',
        rawResponse: elements,
        collectedAt: new Date(),
    };

    logger.info({
        url: input.url,
        findingsCount: findings.length,
        hasPhone: elements.hasPhoneNumber,
        hasCTA: elements.hasCTAAboveFold,
        ctaCount: elements.ctaCount,
    }, '[Conversion] Analysis complete');

    return {
        findings,
        evidenceSnapshots: [evidenceSnapshot],
    };
}

/**
 * Detect all conversion elements from HTML
 */
function detectConversionElements($: cheerio.CheerioAPI, html: string): ConversionElements {
    const bodyText = $('body').text();
    const bodyHtml = $('body').html() || '';

    // Phone number detection
    const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phoneMatches = bodyText.match(phoneRegex) || [];
    const hasPhoneNumber = phoneMatches.length > 0;

    // Click-to-call detection
    const clickToCallLinks = $('a[href^="tel:"]');
    const hasClickToCall = clickToCallLinks.length > 0;

    // Email detection
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = bodyText.match(emailRegex) || [];
    const hasEmail = emailMatches.length > 0;

    // Contact form detection
    const forms = $('form');
    const hasContactForm = forms.toArray().some((form) => {
        const formHtml = $(form).html()?.toLowerCase() || '';
        return (
            formHtml.includes('email') ||
            formHtml.includes('message') ||
            formHtml.includes('contact')
        );
    });

    // Contact page link
    const contactLinks = $('a').filter((_, el) => {
        const href = $(el).attr('href')?.toLowerCase() || '';
        const text = $(el).text().toLowerCase();
        return href.includes('contact') || text.includes('contact');
    });
    const hasContactPageLink = contactLinks.length > 0;

    // Physical address detection (simplified)
    const addressKeywords = ['street', 'avenue', 'road', 'suite', 'floor', 'building'];
    const hasPhysicalAddress = addressKeywords.some(keyword =>
        bodyText.toLowerCase().includes(keyword)
    ) && /\d{5}/.test(bodyText); // Has ZIP code

    // CTA detection
    const ctaKeywords = ['call', 'book', 'schedule', 'get quote', 'contact', 'free', 'start', 'request', 'order', 'buy'];
    const ctaElements: Array<{ text: string; href?: string; position: number }> = [];

    $('button, a').each((_, el) => {
        const text = $(el).text().toLowerCase().trim();
        const href = $(el).attr('href');

        // Check if text contains CTA keywords
        const isCTA = ctaKeywords.some(keyword => text.includes(keyword));

        if (isCTA && text.length > 0 && text.length < 50) {
            const position = $(el).offset()?.top || 0;
            ctaElements.push({ text: $(el).text().trim(), href, position });
        }
    });

    const hasCTAAboveFold = ctaElements.some(cta => cta.position < 600);
    const ctaCount = ctaElements.length;

    // Trust signals
    const testimonialKeywords = ['testimonial', 'review', 'customer says', 'client feedback', 'what our customers'];
    const hasTestimonials = testimonialKeywords.some(keyword =>
        bodyHtml.toLowerCase().includes(keyword)
    );

    const trustBadgeKeywords = ['bbb', 'accredited', 'certified', 'award', 'Top rated', 'best of'];
    const hasTrustBadges = trustBadgeKeywords.some(keyword =>
        bodyText.toLowerCase().includes(keyword)
    );

    const yearsRegex = /(\d{1,2})\+?\s*(years?|decades?)\s*(of\s*)?(experience|in business|serving)/i;
    const hasYearsInBusiness = yearsRegex.test(bodyText);

    const teamKeywords = ['our team', 'about us', 'meet the team', 'our staff'];
    const hasTeamSection = teamKeywords.some(keyword =>
        bodyText.toLowerCase().includes(keyword)
    );

    const licenseRegex = /license[d]?\s*#?\s*\d+/i;
    const hasLicenseNumber = licenseRegex.test(bodyText);

    const insuranceKeywords = ['insured', 'bonded', 'insurance', 'liability coverage'];
    const hasInsuranceMention = insuranceKeywords.some(keyword =>
        bodyText.toLowerCase().includes(keyword)
    );

    const privacyLinks = $('a').filter((_, el) => {
        const href = $(el).attr('href')?.toLowerCase() || '';
        const text = $(el).text().toLowerCase();
        return href.includes('privacy') || text.includes('privacy');
    });
    const hasPrivacyPolicy = privacyLinks.length > 0;

    const termsLinks = $('a').filter((_, el) => {
        const href = $(el).attr('href')?.toLowerCase() || '';
        const text = $(el).text().toLowerCase();
        return href.includes('terms') || text.includes('terms') || text.includes('t&c') || text.includes('tos');
    });
    const hasTermsOfService = termsLinks.length > 0;

    // Booking widget detection
    const bookingProviders = ['calendly', 'acuity', 'booksy', 'square appointments', 'setmore', 'schedulicity'];
    const detectedBookingProviders: string[] = [];

    bookingProviders.forEach(provider => {
        if (bodyHtml.toLowerCase().includes(provider)) {
            detectedBookingProviders.push(provider);
        }
    });

    const bookingKeywords = ['book now', 'schedule appointment', 'book appointment', 'reserve'];
    const hasBookingButton = bookingKeywords.some(keyword =>
        bodyText.toLowerCase().includes(keyword)
    );

    const hasOnlineBooking = detectedBookingProviders.length > 0 || hasBookingButton;

    // Live chat detection
    const chatProviders = ['intercom', 'drift', 'tidio', 'facebook messenger', 'whatsapp', 'livechat', 'zendesk', 'crisp'];
    const detectedChatProviders: string[] = [];

    chatProviders.forEach(provider => {
        if (bodyHtml.toLowerCase().includes(provider)) {
            detectedChatProviders.push(provider);
        }
    });

    // Check for chat bubble icon/widget
    const chatSelectors = [
        '[class*="chat"]',
        '[id*="chat"]',
        '[class*="messenger"]',
        '[id*="intercom"]',
        '[class*="drift"]',
    ];

    const hasChatWidget = chatSelectors.some(selector => $(selector).length > 0);
    const hasLiveChat = detectedChatProviders.length > 0 || hasChatWidget;

    return {
        hasPhoneNumber,
        phoneNumbers: phoneMatches,
        hasClickToCall,
        hasEmail,
        emails: emailMatches,
        hasContactForm,
        hasContactPageLink,
        hasPhysicalAddress,
        ctaElements,
        hasCTAAboveFold,
        ctaCount,
        hasTestimonials,
        hasTrustBadges,
        hasYearsInBusiness,
        hasTeamSection,
        hasLicenseNumber,
        hasInsuranceMention,
        hasPrivacyPolicy,
        hasTermsOfService,
        hasOnlineBooking,
        bookingProviders: detectedBookingProviders,
        hasLiveChat,
        chatProviders: detectedChatProviders,
    };
}

/**
 * Generate findings from conversion analysis
 */
function generateConversionFindings(
    elements: ConversionElements,
    url: string,
    businessName: string
): Finding[] {
    const findings: Finding[] = [];

    // PAINKILLER: No phone number on homepage
    if (!elements.hasPhoneNumber) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'No Phone Number on Homepage',
            description: 'The homepage does not display a phone number. Customers cannot easily call you, which significantly reduces conversion rates, especially for local service businesses.',
            impactScore: 9,
            confidenceScore: 95,
            evidence: [{
                type: 'text',
                value: 'No phone numbers detected',
                label: 'Phone Detection'
            }],
            metrics: {
                hasPhoneNumber: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add phone number prominently in header',
                'Include phone number in footer',
                'Make phone number click-to-call on mobile',
                'Consider adding phone number in multiple locations'
            ]
        });
    }

    // PAINKILLER: No CTA above the fold
    if (!elements.hasCTAAboveFold) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'No Call-to-Action Above the Fold',
            description: 'There is no clear CTA (Call, Book, Schedule, Get Quote) visible when the page first loads. Visitors need immediate direction on what action to take.',
            impactScore: 8,
            confidenceScore: 90,
            evidence: [{
                type: 'metric',
                value: elements.ctaCount,
                label: 'Total CTAs Found'
            }],
            metrics: {
                ctaCount: elements.ctaCount,
                hasCTAAboveFold: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add prominent CTA button in hero section',
                'Use action-oriented language ("Call Now", "Get Free Quote")',
                'Make CTA button visually distinct (contrasting color)',
                'Place CTA within first 600px of page'
            ]
        });
    }

    // PAINKILLER: No contact form AND no phone number
    if (!elements.hasContactForm && !elements.hasPhoneNumber) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'No Contact Methods Available',
            description: 'Website has neither a contact form nor a phone number. Visitors have no clear way to reach you, causing immediate loss of potential customers.',
            impactScore: 9,
            confidenceScore: 95,
            evidence: [{
                type: 'text',
                value: 'No contact form or phone number found',
                label: 'Contact Methods'
            }],
            metrics: {
                hasContactForm: false,
                hasPhoneNumber: false,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add contact form with name, email, phone, message fields',
                'Display phone number prominently',
                'Add email address as backup contact method',
                'Link to dedicated contact page from navigation'
            ]
        });
    }

    // PAINKILLER: Phone number not click-to-call
    if (elements.hasPhoneNumber && !elements.hasClickToCall) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'Phone Number Not Click-to-Call',
            description: `Phone number is displayed but not clickable on mobile. ${Math.round(60)}% of traffic is mobile — make it easy for them to call with one tap.`,
            impactScore: 7,
            confidenceScore: 90,
            evidence: [{
                type: 'text',
                value: elements.phoneNumbers.join(', '),
                label: 'Phone Numbers Found'
            }],
            metrics: {
                hasPhoneNumber: true,
                hasClickToCall: false,
                phoneNumbers: elements.phoneNumbers,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Wrap phone numbers in <a href="tel:+1234567890"> tags',
                'Test click-to-call functionality on mobile devices',
                'Ensure all instances of phone number are clickable'
            ]
        });
    }

    // VITAMIN: No online booking/scheduling
    if (!elements.hasOnlineBooking) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'No Online Booking or Scheduling',
            description: 'Website does not offer online booking. 67% of customers prefer to book online vs calling. Adding scheduling increases conversions by 30-40%.',
            impactScore: 6,
            confidenceScore: 85,
            evidence: [{
                type: 'text',
                value: 'No booking widgets detected',
                label: 'Booking Detection'
            }],
            metrics: {
                hasOnlineBooking: false,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Integrate online booking system (Calendly, Acuity, Square)',
                'Add "Book Now" or "Schedule Appointment" button',
                'Show real-time availability',
                'Send automatic confirmation emails'
            ]
        });
    }

    // VITAMIN: No trust signals
    if (!elements.hasTestimonials && !elements.hasTrustBadges) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'No Trust Signals or Social Proof',
            description: 'Homepage lacks testimonials, reviews, or trust badges. 92% of consumers read reviews before making a decision. Social proof increases conversions by 15-20%.',
            impactScore: 6,
            confidenceScore: 85,
            evidence: [{
                type: 'text',
                value: 'No testimonials or trust badges found',
                label: 'Trust Signals'
            }],
            metrics: {
                hasTestimonials: false,
                hasTrustBadges: false,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add customer testimonials with photos',
                'Display Google/Yelp review widget',
                'Show trust badges (BBB, industry certifications)',
                'Include "As Featured In" or "Awards Won" section',
                'Add years in business if >5 years'
            ]
        });
    }

    // VITAMIN: No live chat
    if (!elements.hasLiveChat) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'No Live Chat Available',
            description: 'No live chat widget detected. 41% of customers expect live chat on websites. Adding chat can increase conversions by 10-15% by answering questions instantly.',
            impactScore: 4,
            confidenceScore: 90,
            evidence: [{
                type: 'text',
                value: 'No chat widgets detected',
                label: 'Chat Detection'
            }],
            metrics: {
                hasLiveChat: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add live chat widget (Intercom, Drift, Tidio)',
                'Set up automated responses for common questions',
                'Offer chat during business hours',
                'Use chatbot for after-hours inquiries'
            ]
        });
    }

    // VITAMIN: No privacy policy
    if (!elements.hasPrivacyPolicy) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'No Privacy Policy Link',
            description: 'No privacy policy link found. This is required by law for data collection and builds trust with visitors. Also affects legal compliance and SEO.',
            impactScore: 5,
            confidenceScore: 90,
            evidence: [{
                type: 'text',
                value: 'No privacy policy link detected',
                label: 'Privacy Policy'
            }],
            metrics: {
                hasPrivacyPolicy: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Create privacy policy page',
                'Link to privacy policy in footer',
                'Include policy compliance (GDPR, CCPA if applicable)',
                'Use privacy policy generator tool if needed'
            ]
        });
    }

    // VITAMIN: Too many CTAs (cluttered)
    if (elements.ctaCount > 5) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'Too Many CTAs on Homepage',
            description: `Found ${elements.ctaCount} CTAs on homepage. Too many choices confuse visitors and reduce conversions. Focus on 1-3 primary actions.`,
            impactScore: 3,
            confidenceScore: 80,
            evidence: [{
                type: 'metric',
                value: elements.ctaCount,
                label: 'CTA Count'
            }],
            metrics: {
                ctaCount: elements.ctaCount,
                ctas: elements.ctaElements.map(c => c.text).slice(0, 10),
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Reduce to 1-3 primary CTAs',
                'Remove redundant or low-priority action buttons',
                'Make primary CTA most prominent',
                'Secondary CTAs should be less visually dominant'
            ]
        });
    }

    return findings;
}
