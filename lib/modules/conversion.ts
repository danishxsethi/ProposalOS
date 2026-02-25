/**
 * Conversion Element Detection Module
 * Uses Puppeteer to analyze homepage + /contact for sales/lead-gen elements.
 * Frames missing elements as lost revenue.
 */
import { Browser } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
// @ts-ignore
import rs from 'text-readability';
import { LegacyAuditModuleResult } from './types';
import type { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';

export interface ConversionResult {
    status: 'success' | 'error';
    data: {
        score: number;
        elements: {
            ctas: { count: number; aboveFold: number; texts: string[] };
            phone: { present: boolean; clickToCall: boolean; number: string | null };
            contactForm: { present: boolean; onHomepage: boolean; fields: string[] };
            chat: { present: boolean; provider: string | null };
            booking: { present: boolean; provider: string | null };
            emailCapture: { present: boolean; type: string | null };
            socialProof: { testimonials: boolean; reviews: boolean; trustBadges: boolean };
            maps: { present: boolean; provider: string | null };
        };
        content?: {
            readabilityScore: number;
            gradeLevel: number;
            keywords: Array<{ word: string; count: number; density: number }>;
        };
        missing: string[];
        recommendations: string[];
    };
}

export interface ConversionModuleInput {
    url: string;
    businessName?: string;
    /** Industry/vertical for scoring weights (e.g. dental, medical, retail) */
    industry?: string;
}

/** Verticals where booking is critical vs less important */
const BOOKING_CRITICAL = ['dental', 'medical', 'spa', 'salon', 'fitness', 'yoga', 'legal'];
const BOOKING_LESS_CRITICAL = ['retail', 'restaurant', 'cafe'];

interface PageAnalysis {
    ctas: { count: number; aboveFold: number; texts: string[] };
    phone: { present: boolean; clickToCall: boolean; number: string | null };
    contactForm: { present: boolean; fields: string[] };
    chat: { present: boolean; provider: string | null };
    booking: { present: boolean; provider: string | null };
    emailCapture: { present: boolean; type: string | null };
    socialProof: { testimonials: boolean; reviews: boolean; trustBadges: boolean };
    maps: { present: boolean; provider: string | null };
    text: string;
}

async function launchBrowser(): Promise<Browser> {
    const fs = require('fs');
    const localPaths = [
        process.env.CHROME_EXECUTABLE_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
    ].filter(Boolean) as string[];

    let executablePath: string | undefined;
    for (const p of localPaths) {
        if (p && fs.existsSync(p)) {
            executablePath = p;
            break;
        }
    }
    if (!executablePath) {
        try {
            executablePath = await chromium.executablePath();
        } catch {
            // Ignore
        }
    }
    if (!executablePath) {
        throw new Error('Chromium not found. Install Chrome or set CHROME_EXECUTABLE_PATH.');
    }

    return puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 375, height: 812, deviceScaleFactor: 1 },
        executablePath,
        headless: true,
    });
}

function analyzePage(): PageAnalysis {
    const CTA_PAT = /\b(book now|get quote|schedule|buy|order|contact|call|request|appointment|consultation|free quote|start|sign up|register)\b/i;
    const CHAT = ['intercom', 'drift', 'tawk.to', 'livechat', 'zendesk', 'hubspot', 'crisp', 'tidio', 'olark', 'pure chat'];
    const BOOKING = ['calendly', 'acuity', 'square appointments', 'booksy', 'vagaro', 'mindbody', 'setmore', 'appointy', 'genbook', 'schedulicity', 'fresha'];

    const viewportHeight = window.innerHeight;
    const result: PageAnalysis = {
        ctas: { count: 0, aboveFold: 0, texts: [] },
        phone: { present: false, clickToCall: false, number: null },
        contactForm: { present: false, fields: [] },
        chat: { present: false, provider: null },
        booking: { present: false, provider: null },
        emailCapture: { present: false, type: null },
        socialProof: { testimonials: false, reviews: false, trustBadges: false },
        maps: { present: false, provider: null },
        text: '',
    };

    const html = document.documentElement.outerHTML.toLowerCase();
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    result.text = document.body?.innerText || '';

    // CTAs
    const buttons = document.querySelectorAll('a, button, [role="button"]');
    buttons.forEach((el) => {
        const text = (el.textContent || '').trim();
        if (text && CTA_PAT.test(text) && text.length < 80) {
            result.ctas.count++;
            result.ctas.texts.push(text.slice(0, 50));
            const rect = el.getBoundingClientRect();
            if (rect.top < viewportHeight && rect.top >= 0) result.ctas.aboveFold++;
        }
    });
    result.ctas.texts = [...new Set(result.ctas.texts)].slice(0, 10);

    // Phone
    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    const phoneNumbers = document.body?.innerText?.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
    result.phone.present = phoneNumbers.length > 0;
    result.phone.clickToCall = telLinks.length > 0;
    result.phone.number = telLinks.length > 0 ? (telLinks[0] as HTMLAnchorElement).href.replace('tel:', '') : (phoneNumbers[0] || null);

    // Contact form
    const forms = document.querySelectorAll('form');
    forms.forEach((form) => {
        const inputs = form.querySelectorAll('input, textarea, select');
        const fieldNames: string[] = [];
        inputs.forEach((inp) => {
            const name = (inp.getAttribute('name') || inp.getAttribute('placeholder') || inp.getAttribute('type') || '').toLowerCase();
            if (name && !fieldNames.includes(name)) fieldNames.push(name);
            const type = (inp.getAttribute('type') || '').toLowerCase();
            if (['email', 'tel', 'text'].includes(type)) fieldNames.push(type);
        });
        if (fieldNames.some((f) => ['email', 'message', 'contact', 'name', 'phone'].some((k) => f.includes(k)))) {
            result.contactForm.present = true;
            result.contactForm.fields = [...new Set(fieldNames)].slice(0, 8);
        }
    });

    // Chat
    for (const p of CHAT) {
        if (html.includes(p) || document.querySelector(`[class*="${p}"], [id*="${p}"]`)) {
            result.chat.present = true;
            result.chat.provider = p;
            break;
        }
    }

    // Booking
    for (const p of BOOKING) {
        if (html.includes(p)) {
            result.booking.present = true;
            result.booking.provider = p;
            break;
        }
    }

    // Email capture
    const emailForms = document.querySelectorAll('form input[type="email"], form input[name*="email"], [class*="newsletter"], [class*="subscribe"]');
    if (emailForms.length > 0) {
        result.emailCapture.present = true;
        result.emailCapture.type = document.querySelector('[class*="popup"], [class*="modal"]') ? 'popup' : 'inline';
    }
    if (!result.emailCapture.present && (html.includes('mailchimp') || html.includes('convertkit') || html.includes('klaviyo'))) {
        result.emailCapture.present = true;
        result.emailCapture.type = 'embedded';
    }

    // Social proof
    result.socialProof.testimonials = /testimonial|testimony|customer says|client feedback|review/i.test(bodyText) ||
        !!document.querySelector('[class*="testimonial"], [class*="review"]');
    result.socialProof.reviews = !!document.querySelector('[class*="review"], [class*="rating"], iframe[src*="google"]') ||
        html.includes('aggregaterating') || html.includes('yelp') || html.includes('trustpilot');
    result.socialProof.trustBadges = /bbb|accredited|certified|award|as seen in/i.test(bodyText);

    // Maps
    const mapEmbeds = document.querySelectorAll('iframe[src*="google.com/maps"], iframe[src*="maps.google"], a[href*="maps.google"], a[href*="google.com/maps"], a[href*="directions"]');
    result.maps.present = mapEmbeds.length > 0 || html.includes('maps.google') || html.includes('google.com/maps');
    result.maps.provider = result.maps.present ? 'google' : null;

    return result;
}

function mergeResults(home: PageAnalysis, contact: PageAnalysis | null): ConversionResult['data']['elements'] {
    return {
        ctas: {
            count: home.ctas.count + (contact?.ctas.count ?? 0),
            aboveFold: Math.max(home.ctas.aboveFold, contact?.ctas.aboveFold ?? 0),
            texts: [...new Set([...home.ctas.texts, ...(contact?.ctas.texts ?? [])])].slice(0, 10),
        },
        phone: home.phone.present || contact?.phone.present
            ? { present: true, clickToCall: home.phone.clickToCall || (contact?.phone.clickToCall ?? false), number: home.phone.number || contact?.phone.number || null }
            : home.phone,
        contactForm: {
            present: home.contactForm.present || (contact?.contactForm.present ?? false),
            onHomepage: home.contactForm.present,
            fields: home.contactForm.fields.length > 0 ? home.contactForm.fields : (contact?.contactForm.fields ?? []),
        },
        chat: home.chat.present ? home.chat : (contact?.chat ?? home.chat),
        booking: home.booking.present ? home.booking : (contact?.booking ?? home.booking),
        emailCapture: home.emailCapture.present ? home.emailCapture : (contact?.emailCapture ?? home.emailCapture),
        socialProof: {
            testimonials: home.socialProof.testimonials || (contact?.socialProof.testimonials ?? false),
            reviews: home.socialProof.reviews || (contact?.socialProof.reviews ?? false),
            trustBadges: home.socialProof.trustBadges || (contact?.socialProof.trustBadges ?? false),
        },
        maps: home.maps.present ? home.maps : (contact?.maps ?? home.maps),
        text: (home.text || '') + ' ' + (contact?.text || ''),
    };
}

/**
 * Run conversion element detection module
 */
export async function runConversionModule(
    input: ConversionModuleInput,
    _tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
    const { url, industry } = input;

    if (!url) {
        return {
            moduleId: 'conversion',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                status: 'error',
                data: {
                    score: 0,
                    elements: {
                        ctas: { count: 0, aboveFold: 0, texts: [] },
                        phone: { present: false, clickToCall: false, number: null },
                        contactForm: { present: false, onHomepage: false, fields: [] },
                        chat: { present: false, provider: null },
                        booking: { present: false, provider: null },
                        emailCapture: { present: false, type: null },
                        socialProof: { testimonials: false, reviews: false, trustBadges: false },
                        maps: { present: false, provider: null },
                    },
                    missing: ['No URL provided'],
                    recommendations: ['No URL provided for conversion analysis.'],
                },
            },
        };
    }

    let browser: Browser | null = null;

    try {
        browser = await launchBrowser();
        const page = await browser.newPage();

        const baseUrl = url.startsWith('http') ? url : `https://${url}`;
        const parsed = new URL(baseUrl);
        const contactUrl = `${parsed.origin}/contact`;

        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const homeResult = await page.evaluate(analyzePage);

        let contactResult: PageAnalysis | null = null;
        try {
            const contactRes = await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
            if (contactRes && contactRes.status() === 200) {
                contactResult = await page.evaluate(analyzePage);
            }
        } catch {
            // Contact page may not exist
        }

        const elements = mergeResults(homeResult, contactResult);

        // Content Analysis
        const textToAnalyze = (elements as any).text.replace(/\s+/g, ' ').trim();
        const readabilityScore = rs.fleschReadingEase(textToAnalyze);
        const gradeLevel = Math.round(rs.fleschKincaidGrade(textToAnalyze));

        const words = textToAnalyze.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const stopWords = new Set(['the', 'and', 'for', 'that', 'with', 'you', 'this', 'but', 'his', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'are', 'has', 'have', 'had', 'been', 'was', 'were', 'not', 'did', 'does']);

        const counts: Record<string, number> = {};
        let totalValuableWords = 0;
        for (const w of words) {
            if (!stopWords.has(w)) {
                counts[w] = (counts[w] || 0) + 1;
                totalValuableWords++;
            }
        }

        const sortedKeywords = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({
                word,
                count,
                density: totalValuableWords > 0 ? Number(((count / totalValuableWords) * 100).toFixed(2)) : 0
            }));

        let score = 0;
        const missing: string[] = [];
        const recommendations: string[] = [];

        if (elements.ctas.aboveFold > 0) {
            score += 15;
        } else if (elements.ctas.count > 0) {
            score += 5;
            missing.push('CTA above the fold');
            recommendations.push('Add a prominent CTA (Book Now, Get Quote, Call) above the fold — capture intent before visitors scroll away');
        } else {
            missing.push('Clear CTA buttons');
            recommendations.push('Add CTAs (Book Now, Schedule, Call, Get Quote) — visitors need a clear next step');
        }

        if (elements.phone.clickToCall) {
            score += 15;
        } else if (elements.phone.present) {
            score += 5;
            missing.push('Click-to-call phone link');
            recommendations.push('Without a click-to-call button, mobile visitors (60% of traffic) can\'t easily reach you. Wrap your phone in <a href="tel:+1234567890">');
        } else {
            missing.push('Phone number');
            recommendations.push('Add a prominent phone number with click-to-call — mobile visitors are your highest-intent traffic');
        }

        if (elements.contactForm.present) {
            score += elements.contactForm.onHomepage ? 15 : 10;
        } else {
            missing.push('Contact form');
            recommendations.push('Add a contact form with email, phone, and message fields — visitors ready to inquire need an easy way to reach you');
        }

        if (elements.chat.present) {
            score += 10;
        } else {
            missing.push('Chat widget');
            recommendations.push('Consider a chat widget (Intercom, Tidio, Tawk.to) — capture leads who prefer instant messaging');
        }

        const normIndustry = industry?.toLowerCase().replace(/\s+/g, '_') ?? '';
        const bookingWeight = BOOKING_CRITICAL.some(v => normIndustry.includes(v)) ? 20
            : BOOKING_LESS_CRITICAL.some(v => normIndustry.includes(v)) ? 5
                : 15;
        if (elements.booking.present) {
            score += bookingWeight;
        } else {
            missing.push('Booking/scheduling');
            const msg = normIndustry && BOOKING_CRITICAL.some(v => normIndustry.includes(v))
                ? 'Online booking is critical for your industry — add Calendly, Acuity, or Square Appointments'
                : 'Add online booking (Calendly, Acuity, Square) — 67% of customers prefer to book online vs calling';
            recommendations.push(msg);
        }

        if (elements.socialProof.testimonials || elements.socialProof.reviews || elements.socialProof.trustBadges) {
            score += 10;
        } else {
            missing.push('Social proof');
            recommendations.push('Add testimonials, review widgets, or trust badges — 92% of consumers read reviews before deciding');
        }

        if (elements.emailCapture.present) {
            score += 10;
        } else {
            missing.push('Email capture');
            recommendations.push('Add newsletter signup or lead magnet — build a list for follow-up');
        }

        if (elements.maps.present) {
            score += 10;
        } else {
            missing.push('Maps/directions');
            recommendations.push('Add Google Maps embed or "Get Directions" link — local businesses benefit from easy navigation');
        }

        const result: ConversionResult = {
            status: 'success',
            data: {
                score: Math.min(100, score),
                elements,
                content: {
                    readabilityScore,
                    gradeLevel,
                    keywords: sortedKeywords
                },
                missing,
                recommendations: recommendations.length > 0 ? recommendations : ['No major conversion elements missing. Maintain current standards.'],
            },
        };

        logger.info({ url, score: result.data.score }, '[Conversion] Analysis complete');

        return {
            moduleId: 'conversion',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: result,
        };
    } catch (error) {
        logger.error({ error, url }, '[Conversion] Analysis failed');
        return {
            moduleId: 'conversion',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                status: 'error',
                data: {
                    score: 0,
                    elements: {
                        ctas: { count: 0, aboveFold: 0, texts: [] },
                        phone: { present: false, clickToCall: false, number: null },
                        contactForm: { present: false, onHomepage: false, fields: [] },
                        chat: { present: false, provider: null },
                        booking: { present: false, provider: null },
                        emailCapture: { present: false, type: null },
                        socialProof: { testimonials: false, reviews: false, trustBadges: false },
                        maps: { present: false, provider: null },
                    },
                    missing: ['Analysis failed'],
                    recommendations: [`Conversion analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}. Ensure the URL is accessible.`],
                },
            },
        };
    } finally {
        if (browser) await browser.close();
    }
}
