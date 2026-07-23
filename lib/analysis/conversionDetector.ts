/**
 * Conversion Element Detection — analyzes website HTML for key conversion elements.
 */
import * as cheerio from 'cheerio';

export type ElementLocation = 'above-fold' | 'below-fold' | 'subpage' | 'not-found';

export interface ConversionElement {
    name: string;
    detected: boolean;
    location: ElementLocation;
    details?: string;
}

export interface ConversionDetectionResult {
    score: number;
    elements: ConversionElement[];
    criticalMissing: string[];
    recommendations: string[];
}

const ABOVE_FOLD_HEIGHT_PX = 600;
const CTA_WORDS = ['book', 'schedule', 'call', 'get quote', 'free', 'contact', 'request', 'appointment', 'consultation', 'quote', 'start', 'sign up', 'register'];
const CHAT_SIGNATURES = ['intercom', 'drift', 'tidio', 'livechat', 'live chat', 'crisp', 'zendesk chat', 'hubspot chat', 'messenger', 'whatsapp', 'tawk', 'olark', 'pure chat'];
const BOOKING_SIGNATURES = ['calendly', 'acuity', 'square appointments', 'mindbody', 'vagaro', 'booksy', 'fresha', 'setmore', 'appointy', 'genbook', 'schedulicity'];
const EMAIL_SIGNATURES = ['mailchimp', 'convertkit', 'constant contact', 'klaviyo', 'getresponse', 'campaign monitor', 'mailchimp', 'convertkit'];
const REVIEW_WIDGET_SIGNATURES = ['google reviews', 'yelp', 'trustpilot', 'reviews', 'testimonial', 'rating', 'aggregaterating', 'review-widget'];

function getElementApproxHeight($: cheerio.CheerioAPI, el: { tagName?: string } & Record<string, unknown>): number {
    const $el = $(el as never);
    const style = $el.attr('style') || '';
    const heightMatch = style.match(/height:\s*(\d+)px/);
    if (heightMatch) return parseInt(heightMatch[1], 10);
    return 0;
}

function estimateCumulativeHeight($: cheerio.CheerioAPI, elements: Array<{ tagName?: string } & Record<string, unknown>>): number {
    let total = 0;
    for (const el of elements) {
        const $el = $(el as never);
        const tag = el.tagName?.toLowerCase();
        if (tag === 'header' || tag === 'nav') total += 80;
        else if (tag === 'section' || tag === 'div') total += getElementApproxHeight($, el) || 200;
        else total += 40;
        if (total >= ABOVE_FOLD_HEIGHT_PX) break;
    }
    return total;
}

function isAboveFold($: cheerio.CheerioAPI, el: { tagName?: string }, precedingElements: Array<{ tagName?: string }>): boolean {
    const idx = precedingElements.indexOf(el);
    if (idx < 0) return false;
    const before = precedingElements.slice(0, idx);
    const height = estimateCumulativeHeight($, before);
    return height < ABOVE_FOLD_HEIGHT_PX;
}

/**
 * Detect conversion elements in HTML.
 */
export function detectConversionElements(html: string, baseUrl?: string): ConversionDetectionResult {
    const $ = cheerio.load(html);
    const elements: ConversionElement[] = [];
    const criticalMissing: string[] = [];
    const recommendations: string[] = [];

    const bodyText = $('body').text().toLowerCase();
    const htmlLower = html.toLowerCase();
    const scripts = $('script').toArray();
    const allElements = $('body *').toArray();

    // 1. Phone number (click-to-call)
    const telLinks = $('a[href^="tel:"]');
    const hasTel = telLinks.length > 0;
    let phoneLocation: ElementLocation = hasTel ? 'below-fold' : 'not-found';
    if (hasTel) {
        const firstTel = telLinks.first();
        const firstEl = firstTel.get(0);
        if (firstEl && isAboveFold($, firstEl, allElements)) phoneLocation = 'above-fold';
    }
    elements.push({
        name: 'Phone number (click-to-call)',
        detected: hasTel,
        location: phoneLocation,
        details: hasTel ? `${telLinks.length} tel: link(s) found` : undefined,
    });
    if (!hasTel) {
        criticalMissing.push('Click-to-call phone number');
        recommendations.push('Add a click-to-call phone link in the header/hero — mobile visitors can\'t contact you with one tap (your highest-intent traffic)');
    } else if (phoneLocation === 'below-fold') {
        recommendations.push('Move phone number above the fold — most mobile users decide in the first 3 seconds');
    }

    // 2. Contact form
    const forms = $('form');
    const hasForm = forms.length > 0;
    const formLibs = EMAIL_SIGNATURES.concat(['gravity', 'typeform', 'hubspot', 'calendly', 'form', 'wpforms', 'ninja-forms', 'contact-form']).some(
        (sig) => htmlLower.includes(sig)
    );
    let formLocation: ElementLocation = hasForm || formLibs ? 'below-fold' : 'not-found';
    if (hasForm) {
        const firstForm = forms.first().get(0);
        if (firstForm && isAboveFold($, firstForm, allElements)) formLocation = 'above-fold';
    }
    elements.push({
        name: 'Contact form',
        detected: hasForm || formLibs,
        location: formLocation,
        details: hasForm ? `Found ${forms.length} form(s)` : formLibs ? 'Form library detected' : undefined,
    });
    if (!hasForm && !formLibs) {
        criticalMissing.push('Contact form');
        recommendations.push('Add a contact form — visitors ready to inquire need an easy way to reach you');
    }

    // 3. CTA buttons
    const ctaCandidates = $('a, button').filter((_, el) => {
        const text = $(el).text().toLowerCase().trim();
        return CTA_WORDS.some((w) => text.includes(w));
    });
    const hasCta = ctaCandidates.length > 0;
    let ctaLocation: ElementLocation = hasCta ? 'below-fold' : 'not-found';
    if (hasCta) {
        const firstCta = ctaCandidates.first().get(0);
        if (firstCta && isAboveFold($, firstCta, allElements)) ctaLocation = 'above-fold';
    }
    elements.push({
        name: 'CTA buttons (Book, Schedule, Call, etc.)',
        detected: hasCta,
        location: ctaLocation,
        details: hasCta ? `Found ${ctaCandidates.length} CTA(s)` : undefined,
    });
    if (!hasCta) {
        criticalMissing.push('Clear CTA buttons');
        recommendations.push('Add prominent CTAs (Book, Schedule, Call, Get Quote) — visitors need a clear next step');
    } else if (ctaLocation === 'below-fold') {
        recommendations.push('Add at least one CTA above the fold — capture intent before users scroll away');
    }

    // 4. Chat widget
    const hasChat = CHAT_SIGNATURES.some((sig) => htmlLower.includes(sig));
    elements.push({
        name: 'Chat widget',
        detected: hasChat,
        location: hasChat ? 'above-fold' : 'not-found',
        details: hasChat ? 'Chat provider detected' : undefined,
    });
    if (!hasChat) {
        recommendations.push('Consider a chat widget (Intercom, Tidio, etc.) — capture leads who prefer instant messaging');
    }

    // 5. Appointment/booking widget
    const hasBooking = BOOKING_SIGNATURES.some((sig) => htmlLower.includes(sig));
    elements.push({
        name: 'Appointment/booking widget',
        detected: hasBooking,
        location: hasBooking ? 'below-fold' : 'not-found',
        details: hasBooking ? 'Booking provider detected' : undefined,
    });
    if (!hasBooking) {
        recommendations.push('Add online booking (Calendly, Acuity, etc.) — reduce friction for appointment-based businesses');
    }

    // 6. Social proof (reviews, testimonials)
    const hasReviewWidget = REVIEW_WIDGET_SIGNATURES.some((sig) => htmlLower.includes(sig) || bodyText.includes(sig));
    const hasTestimonialClass = $('[class*="testimonial"], [class*="review"], [class*="rating"]').length > 0;
    const hasSocialProof = hasReviewWidget || hasTestimonialClass;
    elements.push({
        name: 'Social proof (reviews, testimonials)',
        detected: hasSocialProof,
        location: hasSocialProof ? 'below-fold' : 'not-found',
        details: hasSocialProof ? 'Review/testimonial elements found' : undefined,
    });
    if (!hasSocialProof) {
        recommendations.push('Add review widgets or testimonials — social proof increases conversions');
    }

    // 7. Email capture / newsletter
    const hasEmailForm = EMAIL_SIGNATURES.some((sig) => htmlLower.includes(sig)) ||
        $('form').filter((_, f) => $(f).find('input[type="email"]').length > 0).length > 0;
    elements.push({
        name: 'Email capture / newsletter',
        detected: hasEmailForm,
        location: hasEmailForm ? 'below-fold' : 'not-found',
        details: hasEmailForm ? 'Email form detected' : undefined,
    });
    if (!hasEmailForm) {
        recommendations.push('Add email capture for lead nurturing — build a list for follow-up');
    }

    // 8. Map / directions
    const hasMapEmbed = htmlLower.includes('maps.google') || htmlLower.includes('google.com/maps') || htmlLower.includes('embed');
    const hasDirectionsLink = $('a[href*="maps.google"], a[href*="google.com/maps"], a[href*="directions"]').length > 0;
    const hasMap = hasMapEmbed || hasDirectionsLink;
    elements.push({
        name: 'Map / directions',
        detected: hasMap,
        location: hasMap ? 'below-fold' : 'not-found',
        details: hasMap ? (hasMapEmbed ? 'Map embed' : 'Directions link') : undefined,
    });
    if (!hasMap) {
        recommendations.push('Add Google Maps embed or "Get Directions" link — local businesses benefit from easy navigation');
    }

    // Score: 0-100
    const detectedCount = elements.filter((e) => e.detected).length;
    const criticalDetected = elements.filter((e) =>
        ['Phone number (click-to-call)', 'Contact form', 'CTA buttons (Book, Schedule, Call, etc.)'].includes(e.name) && e.detected
    ).length;
    const score = Math.min(100, Math.round((detectedCount / elements.length) * 70 + (criticalDetected / 3) * 30));

    return {
        score,
        elements,
        criticalMissing,
        recommendations: [...new Set(recommendations)],
    };
}
