import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import * as cheerio from 'cheerio';
import * as dns from 'dns/promises';
import { URL } from 'url';

export interface TechStackModuleInput {
    url: string;
    html?: string; // Optional: reuse HTML from crawler
}

interface TechStack {
    cms: string[];
    hosting: string[];
    analytics: string[];
    marketing: string[];
    widgets: string[];
    frameworks: string[];
}

interface DnsInfo {
    provider: string;
    ip: string;
}

/**
 * Run tech stack analysis module
 */
export async function runTechStackModule(
    input: TechStackModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[TechStack] Starting analysis');

    try {
        let html = input.html;
        let headers: Headers | undefined;

        // Fetch if HTML not provided
        if (!html) {
            const response = await fetch(input.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; ProposalOS/1.0; +http://proposalos.com)'
                }
            });
            html = await response.text();
            headers = response.headers;
        }

        const $ = cheerio.load(html);
        const urlObj = new URL(input.url);

        // Run detection logic
        const stack: TechStack = {
            cms: detectCms($, html, headers),
            hosting: await detectHosting(urlObj.hostname, headers),
            analytics: detectAnalytics($, html),
            marketing: detectMarketing($, html),
            widgets: detectWidgets($, html),
            frameworks: detectFrameworks($, html)
        };

        // Generate findings
        const findings = generateTechFindings(stack);

        const evidenceSnapshot = {
            module: 'tech_stack',
            source: 'html_analysis',
            rawResponse: stack,
            collectedAt: new Date(),
        };

        logger.info({
            url: input.url,
            cms: stack.cms.join(', '),
            findingsCount: findings.length
        }, '[TechStack] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, url: input.url }, '[TechStack] Analysis failed');
        // Return empty result on failure, tech stack is non-critical
        return {
            findings: [],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Detect CMS and Website Builders
 */
function detectCms($: cheerio.CheerioAPI, html: string, headers?: Headers): string[] {
    const detected = new Set<string>();

    // WordPress
    if (html.includes('wp-content') || html.includes('wp-includes')) detected.add('WordPress');
    if ($('meta[name="generator"]').attr('content')?.includes('WordPress')) detected.add('WordPress');

    // Wix
    if (html.includes('wix.com') && html.includes('_api/wix')) detected.add('Wix');
    if (headers && Array.from(headers.keys()).some(k => k.toLowerCase().startsWith('x-wix'))) detected.add('Wix');

    // Squarespace
    if (html.includes('squarespace.com') || html.includes('static.squarespace')) detected.add('Squarespace');

    // Shopify
    if (html.includes('cdn.shopify.com') || html.includes('Shopify.designMode')) detected.add('Shopify');

    // Webflow
    if (html.includes('webflow.com') || $('html').attr('data-wf-page')) detected.add('Webflow');

    // Weebly
    if (html.includes('weebly.com')) detected.add('Weebly');

    // GoDaddy
    if (html.includes('godaddy.com') || html.includes('GoCentral')) detected.add('GoDaddy Website Builder');

    // Generic Generator Tag
    const generator = $('meta[name="generator"]').attr('content');
    if (generator && !detected.has(generator)) {
        // Filter out obvious noise
        if (!generator.includes('Microsoft Word')) {
            detected.add(generator);
        }
    }

    return Array.from(detected);
}

/**
 * Detect Hosting and CDN
 */
async function detectHosting(hostname: string, headers?: Headers): Promise<string[]> {
    const detected = new Set<string>();

    // Header Based
    if (headers) {
        const server = headers.get('server');
        if (server) {
            if (server.includes('cloudflare')) detected.add('Cloudflare');
            if (server.includes('nginx')) detected.add('Nginx');
            if (server.includes('apache')) detected.add('Apache');
            if (server.includes('openresty')) detected.add('OpenResty');
        }

        if (headers.get('x-github-request-id')) detected.add('GitHub Pages');
        if (headers.get('x-vercel-id')) detected.add('Vercel');
        if (headers.get('x-netlify-id')) detected.add('Netlify');
    }

    // DNS/IP Based (Simple Lookup)
    try {
        const addresses = await dns.resolve4(hostname);
        // This is a simplified lookup. In production, mapping IPs to ASNs is better.
        // For now, we rely on checking common patterns or logic could be expanded.
    } catch (e) {
        // Ignore DNS errors
    }

    return Array.from(detected);
}

/**
 * Detect Analytics Tools
 */
function detectAnalytics($: cheerio.CheerioAPI, html: string): string[] {
    const detected = new Set<string>();

    if (html.includes('googletagmanager.com/gtm.js')) detected.add('Google Tag Manager');
    if (html.includes('google-analytics.com/analytics.js') || html.includes('gtag.js')) detected.add('Google Analytics');
    if (html.includes('connect.facebook.net/en_US/fbevents.js')) detected.add('Facebook Pixel');
    if (html.includes('hotjar.com')) detected.add('Hotjar');
    if (html.includes('fullstory.com')) detected.add('FullStory');
    if (html.includes('crazyegg.com')) detected.add('CrazyEgg');

    return Array.from(detected);
}

/**
 * Detect Marketing Tools
 */
function detectMarketing($: cheerio.CheerioAPI, html: string): string[] {
    const detected = new Set<string>();

    if (html.includes('mailchimp.com')) detected.add('Mailchimp');
    if (html.includes('klaviyo.com')) detected.add('Klaviyo');
    if (html.includes('hubspot.com') || html.includes('hs-scripts.com')) detected.add('HubSpot');
    if (html.includes('activecampaign.com')) detected.add('ActiveCampaign');
    if (html.includes('googleadservices.com')) detected.add('Google Ads');

    return Array.from(detected);
}

/**
 * Detect Third-Party Widgets
 */
function detectWidgets($: cheerio.CheerioAPI, html: string): string[] {
    const detected = new Set<string>();

    // Live Chat
    if (html.includes('intercom.com')) detected.add('Intercom');
    if (html.includes('drift.com')) detected.add('Drift');
    if (html.includes('tidio.co')) detected.add('Tidio');
    if (html.includes('zendesk.com')) detected.add('Zendesk Chat');
    if (html.includes('tawk.to')) detected.add('Tawk.to');

    // Booking
    if (html.includes('calendly.com')) detected.add('Calendly');
    if (html.includes('acuityscheduling.com')) detected.add('Acuity Scheduling');
    if (html.includes('booksy.com')) detected.add('Booksy');
    if (html.includes('mindbodyonline.com')) detected.add('MindBody');

    // Reviews
    if (html.includes('birdeye.com')) detected.add('Birdeye');
    if (html.includes('podium.com')) detected.add('Podium');
    if (html.includes('trustpilot.com')) detected.add('Trustpilot');

    return Array.from(detected);
}

/**
 * Detect JS Frameworks & Libraries
 */
function detectFrameworks($: cheerio.CheerioAPI, html: string): string[] {
    const detected = new Set<string>();

    if (html.includes('react') || $('[data-reactroot]').length > 0) detected.add('React');
    if (html.includes('vue.js') || $('[data-v-]').length > 0) detected.add('Vue.js');
    if (html.includes('angular') || $('[ng-app]').length > 0) detected.add('Angular');
    if (html.includes('jquery') || html.includes('jQuery')) {
        detected.add('jQuery');
        // Check for outdated detection logic would need script execution (Puppeteer)
        // Here we just note presence
    }
    if (html.includes('bootstrap')) detected.add('Bootstrap');
    if (html.includes('tailwindcss')) detected.add('Tailwind CSS');

    return Array.from(detected);
}

/**
 * Generate Findings based on Tech Stack
 */
function generateTechFindings(stack: TechStack): Finding[] {
    const findings: Finding[] = [];

    // VITAMIN: Website Builder Limitations
    const limitedBuilders = ['Wix', 'Weebly', 'GoDaddy Website Builder', 'Squarespace'];
    const usedBuilder = stack.cms.find(cms => limitedBuilders.includes(cms));
    if (usedBuilder) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: `Website Built on ${usedBuilder}`,
            description: `Your website is built on ${usedBuilder}. While functional, this platform limits your ability to optimize for search engines and load speed compared to more flexible solutions like WordPress or custom code.`,
            impactScore: 5,
            confidenceScore: 80,
            evidence: [{ type: 'text', value: usedBuilder, label: 'Platform Detected' }],
            metrics: {},
            effortEstimate: 'HIGH', // Replatforming is hard
            recommendedFix: ['Consider migrating to WordPress for better SEO control', 'Monitor page speed closely']
        });
    }

    // VITAMIN: No Analytics
    if (stack.analytics.length === 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'No Analytics Tools Detected',
            description: 'We could not detect Google Analytics or similar tools. You are flying blind without data on visitor behavior.',
            impactScore: 6,
            confidenceScore: 90,
            evidence: [],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Install Google Analytics 4 (GA4)', 'Set up Google Search Console']
        });
    }

    // VITAMIN: No Email Marketing
    if (stack.marketing.length === 0) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'No Email Marketing Integration',
            description: 'You have no email marketing tools detected (e.g., Mailchimp, Klaviyo). You\'re missing the #1 ROI channel (avg $42 return per $1 spent).',
            impactScore: 5,
            confidenceScore: 70, // Possibility of false negative
            evidence: [],
            metrics: {},
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Integrate an email capture form', 'Set up an automated welcome sequence']
        });
    }

    // POSITIVE: Modern Stack
    const isModern = stack.frameworks.some(f => ['React', 'Vue.js', 'Next.js'].includes(f)) ||
        stack.hosting.includes('Vercel') ||
        stack.hosting.includes('Netlify');

    if (isModern) {
        findings.push({
            type: 'POSITIVE',
            category: 'Performance',
            title: 'Modern Technology Stack',
            description: 'Your website uses modern technologies (React/Vue/Cloud Hosting) which enables excellent performance and user experience potential.',
            impactScore: 3,
            confidenceScore: 90,
            evidence: stack.frameworks.filter(f => ['React', 'Vue.js'].includes(f)).map(f => ({ type: 'text', value: f, label: 'Framework' })),
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Maintain package updates']
        });
    }

    // POSITIVE: Strong Tooling (Analytics + Marketing + Widgets)
    if (stack.analytics.length > 0 && stack.marketing.length > 0 && stack.widgets.length > 0) {
        findings.push({
            type: 'POSITIVE',
            category: 'Conversion',
            title: 'Comprehensive Digital Tooling',
            description: 'You have a solid suite of tools for analytics, marketing, and customer interaction. This indicates a high level of digital maturity.',
            impactScore: 2,
            confidenceScore: 90,
            evidence: [
                ...stack.analytics.map(t => ({ type: 'text', value: t, label: 'Analytics' })),
                ...stack.marketing.map(t => ({ type: 'text', value: t, label: 'Marketing' }))
            ],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: []
        });
    }

    return findings;
}
