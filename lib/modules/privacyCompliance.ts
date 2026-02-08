import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_PLACES_API_KEY!);

export interface PrivacyModuleInput {
    url: string;
    businessName: string;
    city: string; // for CCPA context if in CA, but we'll assume US general
}

interface CookieAnalysis {
    hasBanner: boolean;
    bannerText: string | null;
    hasAcceptButton: boolean;
    hasRejectButton: boolean;
    cmpName: string | null;
    initialCookies: number; // Cookies set before interaction
    trackingCookiesFound: string[];
}

interface PolicyAnalysis {
    exists: boolean;
    url: string | null;
    completenessScore: number; // 1-10
    hasContactInfo: boolean;
    hasUserRights: boolean;
    isGdprCompliant: boolean;
    isCcpaCompliant: boolean;
    lastUpdated: string | null;
    isGenericTemplate: boolean;
    missingElements: string[];
}

export async function runPrivacyModule(
    input: PrivacyModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[Privacy] Starting compliance analysis');

    try {
        const browser = await launchBrowser();
        const page = await browser.newPage();

        // 1. Cookie Analysis (Puppeteer)
        const cookieAnalysis: CookieAnalysis = {
            hasBanner: false,
            bannerText: null,
            hasAcceptButton: false,
            hasRejectButton: false,
            cmpName: null,
            initialCookies: 0,
            trackingCookiesFound: []
        };

        let policyUrl: string | null = null;
        let formsFound = 0;
        let thirdPartyScripts: string[] = [];

        try {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(input.url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Count initial cookies
            const cookies = await page.cookies();
            cookieAnalysis.initialCookies = cookies.length;
            cookieAnalysis.trackingCookiesFound = cookies
                .filter(c => c.name.includes('_ga') || c.name.includes('_fbp') || c.name.includes('ads'))
                .map(c => c.name);

            // Check for CMPs / Banners
            const bannerSelectors = [
                '#onetrust-banner-sdk',
                '.cookie-banner',
                '#cookie-law-info-bar',
                '.cky-consent-container',
                '[aria-label="cookieconsent"]',
                '.cc-banner'
            ];

            for (const sel of bannerSelectors) {
                if (await page.$(sel)) {
                    cookieAnalysis.hasBanner = true;
                    // Try to identify CMP
                    if (sel.includes('onetrust')) cookieAnalysis.cmpName = 'OneTrust';
                    else if (sel.includes('cky')) cookieAnalysis.cmpName = 'CookieYes';
                    else if (sel.includes('cookie-law')) cookieAnalysis.cmpName = 'CookieLaw';
                    break;
                }
            }

            // Fallback: search for text "cookie" in fixed/sticky elements at bottom/top
            if (!cookieAnalysis.hasBanner) {
                const possibleBanner = await page.evaluate(() => {
                    const elements = document.querySelectorAll('div, section, aside');
                    for (const el of Array.from(elements)) {
                        const style = window.getComputedStyle(el);
                        const text = el.textContent?.toLowerCase() || '';
                        if ((style.position === 'fixed' || style.position === 'sticky') &&
                            text.includes('cookie') &&
                            text.length < 500) {
                            return true;
                        }
                    }
                    return false;
                });
                cookieAnalysis.hasBanner = possibleBanner;
            }

            // Check buttons if banner found
            if (cookieAnalysis.hasBanner) {
                const buttonText = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a.btn'));
                    return buttons.map(b => b.textContent?.toLowerCase() || '');
                });
                cookieAnalysis.hasAcceptButton = buttonText.some(t => t.includes('accept') || t.includes('agree') || t.includes('allow'));
                cookieAnalysis.hasRejectButton = buttonText.some(t => t.includes('reject') || t.includes('decline') || t.includes('deny'));
            }

            // Find Privacy Policy Link
            policyUrl = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const privacyLink = links.find(a =>
                    a.textContent?.toLowerCase().includes('privacy policy') ||
                    a.href.toLowerCase().includes('privacy')
                );
                return privacyLink ? privacyLink.href : null;
            });

            // Check Forms
            formsFound = (await page.$$('form')).length;

            // Check Scripts
            thirdPartyScripts = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script[src]'));
                return scripts.map(s => s.getAttribute('src') || '').filter(src => src.startsWith('http'));
            });

        } catch (error) {
            logger.warn({ error }, '[Privacy] Puppeteer analysis failed');
        } finally {
            await browser.close();
        }

        // 2. Privacy Policy Analysis (Gemini)
        let policyAnalysis: PolicyAnalysis = {
            exists: !!policyUrl,
            url: policyUrl,
            completenessScore: 0,
            hasContactInfo: false,
            hasUserRights: false,
            isGdprCompliant: false,
            isCcpaCompliant: false,
            lastUpdated: null,
            isGenericTemplate: false,
            missingElements: []
        };

        if (policyUrl) {
            tracker?.addApiCall("GEMINI_FLASH");
            const policyText = await fetchPolicyText(policyUrl);
            if (policyText) {
                {
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const prompt = `Analyze this privacy policy for a small business:
                
                ${policyText.substring(0, 10000)} ... [truncated]

                Return JSON with fields:
                - completenessScore (1-10)
                - hasContactInfo (boolean)
                - hasUserRights (boolean)
                - isGdprCompliant (boolean)
                - isCcpaCompliant (boolean)
                - lastUpdated (string or null)
                - isGenericTemplate (boolean)
                - missingElements (array of strings: e.g. "Do Not Sell", "Data Types", "DPO Contact")
                `;

                    const result = await model.generateContent(prompt);
                    const text = result.response.text();
                    const jsonMatch = text.match(/\\{.*\\}/s);
                    if (jsonMatch) {
                        const aiData = JSON.parse(jsonMatch[0]);
                        policyAnalysis = { ...policyAnalysis, ...aiData };
                    }
                }
            }
        }
        // 3. Generate Findings
        const findings: Finding[] = [];

        // PAINKILLER: No Banner
        if (!cookieAnalysis.hasBanner) {
            findings.push({
                type: 'PAINKILLER',
                category: 'Compliance',
                title: 'No Cookie Consent Banner',
                description: 'Your website sets tracking cookies without user permission. This violates GDPR and can lead to fines.',
                impactScore: 8,
                confidenceScore: 100,
                evidence: [{ type: 'text', value: 'No banner detected', label: 'Compliance' }],
                metrics: { initialCookies: cookieAnalysis.initialCookies },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Install a CMP (Cookiebot, OneTrust, Termly)']
            });
        }
        // PAINKILLER: Illegal Tracking
        else if (cookieAnalysis.initialCookies > 0 && cookieAnalysis.trackingCookiesFound.length > 0) {
            findings.push({
                type: 'PAINKILLER',
                category: 'Compliance',
                title: 'Illegal Tracking Before Consent',
                description: `We found ${cookieAnalysis.trackingCookiesFound.length} tracking cookies set BEFORE the user clicked "Accept".This renders your consent banner legally useless.`,
                impactScore: 7,
                confidenceScore: 95,
                evidence: [{ type: 'text', value: `Cookies: ${cookieAnalysis.trackingCookiesFound.join(', ')}`, label: 'Cookies' }],
                metrics: { count: cookieAnalysis.trackingCookiesFound.length },
                effortEstimate: 'HIGH',
                recommendedFix: ['Configure CMP to block scripts until consent is given']
            });
        }

        // PAINKILLER: No Privacy Policy
        if (!policyAnalysis.exists) {
            findings.push({
                type: 'PAINKILLER',
                category: 'Compliance',
                title: 'No Privacy Policy Found',
                description: 'Operating a website without a privacy policy is illegal in most jurisdictions (CalOPPA, GDPR, etc).',
                impactScore: 9,
                confidenceScore: 100,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Generate and publish a privacy policy immediately']
            });
        }
        // VITAMIN: Weak Policy
        else if (policyAnalysis.completenessScore < 5) {
            findings.push({
                type: 'VITAMIN',
                category: 'Compliance',
                title: 'Incomplete Privacy Policy',
                description: `Your policy scored ${policyAnalysis.completenessScore}/10. It is likely a generic template and misses key business-specific disclosures.`,
                impactScore: 5,
                confidenceScore: 90,
                evidence: [{ type: 'link', value: policyAnalysis.url || '', label: 'Current Policy' }],
                metrics: { score: policyAnalysis.completenessScore },
                effortEstimate: 'MEDIUM',
                recommendedFix: ['Update policy to include: ' + policyAnalysis.missingElements.join(', ')]
            });
        }

        // VITAMIN: No Reject Option
        if (cookieAnalysis.hasBanner && !cookieAnalysis.hasRejectButton) {
            findings.push({
                type: 'VITAMIN',
                category: 'Compliance',
                title: 'Cookie Banner Missing "Reject" Option',
                description: 'GDPR requires an option to "Reject All" that is as easy to access as "Accept".',
                impactScore: 6,
                confidenceScore: 100,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Update banner settings to show Reject button']
            });
        }

        return {
            findings,
            evidenceSnapshots: [
                {
                    module: 'privacy',
                    source: 'puppeteer',
                    rawResponse: { cookieAnalysis, policyAnalysis },
                    collectedAt: new Date()
                }
            ]
        };

    } catch (e) {
        logger.error({ error: e, url: input.url }, '[Privacy] Module failed');
        return { findings: [], evidenceSnapshots: [] };
    }
}

async function fetchPolicyText(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        // Try to get main content
        return $('main, article, .content, body').text().replace(/\s+/g, ' ').trim();
    } catch {
        return null;
    }
}

async function launchBrowser() {
    const isLocal = process.env.NODE_ENV === 'development';
    if (isLocal) {
        return await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    } else {
        return await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }
}
