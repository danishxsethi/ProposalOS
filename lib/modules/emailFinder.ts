import * as cheerio from 'cheerio';
import { logger } from '@/lib/logger';

interface EmailDiscoveryResult {
    emails: string[];
    source: string;
    confidence: number;
}

export async function findEmails(url: string): Promise<EmailDiscoveryResult> {
    try {
        // Ensure URL has protocol
        const targetUrl = url.startsWith('http') ? url : `https://${url}`;

        console.log(`[EmailFinder] Scanning ${targetUrl}...`);

        // Fetch main page
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(10000) // 10s timeout
        }).catch(() => null);

        if (!response || !response.ok) {
            return { emails: [], source: 'failed', confidence: 0 };
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const foundEmails = new Set<string>();

        // Strategy 1: Mailto links
        $('a[href^="mailto:"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
                const email = href.replace('mailto:', '').split('?')[0].trim();
                if (isValidEmail(email)) foundEmails.add(email);
            }
        });

        // Strategy 2: Regex on body text
        const bodyText = $('body').text();
        const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
        const matches = bodyText.match(emailRegex);
        if (matches) {
            matches.forEach(email => {
                if (isValidEmail(email)) foundEmails.add(email);
            });
        }

        // Strategy 3: Check /contact page if no emails found
        if (foundEmails.size === 0) {
            // diverse logic could go here, for now simple return
        }

        // Filter out obvious junk (e.g., example.com, wix.com if generic)
        const filtered = Array.from(foundEmails).filter(e => !isJunkEmail(e));

        return {
            emails: filtered,
            source: 'website_scrape',
            confidence: filtered.length > 0 ? 0.8 : 0
        };

    } catch (error) {
        logger.error({ err: error, url }, 'Email finder failed');
        return { emails: [], source: 'error', confidence: 0 };
    }
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isJunkEmail(email: string): boolean {
    const junkDomains = ['example.com', 'domain.com', 'email.com', 'sentry.io'];
    const junkUsers = ['noreply', 'no-reply', 'admin', 'webmaster', 'support']; // support might be valid though? keeping it for now.

    // Actually support/info/hello are GOOD for businesses.
    // Let's filter only technical junk.
    const technicalJunk = ['sentry', 'bug', 'report', 'noreply', 'no-reply'];

    const domain = email.split('@')[1];
    const user = email.split('@')[0];

    if (junkDomains.includes(domain)) return true;
    if (technicalJunk.some(j => user.includes(j))) return true;

    // Filter out image extensions acting as emails? unlikely with regex but possible
    if (email.endsWith('.png') || email.endsWith('.jpg')) return true;

    return false;
}
