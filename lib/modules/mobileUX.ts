import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export interface MobileUXModuleInput {
    url: string;
    businessName: string;
}

interface TouchTargetViolation {
    element: string;
    width: number;
    height: number;
    position: { x: number; y: number };
    issue: 'too-small' | 'too-close';
}

interface MobileAnalysis {
    // Layout
    hasViewportMeta: boolean;
    hasHorizontalOverflow: boolean;
    hasSmallText: boolean;
    smallTextCount: number;
    imagesResponsive: boolean;

    // Touch targets
    touchTargetViolations: TouchTargetViolation[];
    totalClickableElements: number;

    // Mobile features
    hasClickToCall: boolean;
    hasMapDirections: boolean;
    hasMobileMenu: boolean;
    hasStickyNav: boolean;
    hasBottomCTA: boolean;
    hasPWASupport: boolean;

    // Performance
    timeToInteractive: number;
    largestContentfulPaint: number;
    cumulativeLayoutShift: number;
    totalBlockingTime: number;

    // PageSpeed mobile
    mobilePerformanceScore: number;
    desktopPerformanceScore?: number;
}

/**
 * Run mobile UX analysis module
 */
export async function runMobileUXModule(
    input: MobileUXModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[MobileUX] Starting mobile analysis');

    try {
        const analysis = await analyzeMobileUX(input.url, tracker);
        const findings = generateMobileFindings(analysis, input.url, input.businessName);

        const evidenceSnapshot = {
            module: 'mobile_ux',
            source: 'puppeteer_analysis',
            rawResponse: analysis,
            collectedAt: new Date(),
        };

        logger.info({
            url: input.url,
            violations: analysis.touchTargetViolations.length,
            mobileScore: analysis.mobilePerformanceScore,
            findingsCount: findings.length,
        }, '[MobileUX] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, url: input.url }, '[MobileUX] Analysis failed');

        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Performance',
                title: 'Mobile Analysis Unavailable',
                description: 'Unable to complete mobile UX analysis. This may indicate browser issues or network problems.',
                impactScore: 1,
                confidenceScore: 50,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Try running mobile analysis again later'],
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Analyze mobile UX using Puppeteer
 */
async function analyzeMobileUX(url: string, tracker?: CostTracker): Promise<MobileAnalysis> {
    const browser = await launchBrowser();
    const page = await browser.newPage();

    try {
        // Set iPhone 14 viewport
        await page.setViewport({
            width: 390,
            height: 844,
            deviceScaleFactor: 3,
            isMobile: true,
            hasTouch: true,
        });

        // Navigate to page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

        // Wait for any animations/transitions
        await page.waitForTimeout(2000);

        // Analyze layout
        const layoutMetrics = await page.evaluate(() => {
            // Check viewport meta tag
            const viewportMeta = document.querySelector('meta[name="viewport"]');
            const hasViewportMeta = !!viewportMeta;

            // Check horizontal overflow
            const hasHorizontalOverflow = document.body.scrollWidth > window.innerWidth;

            // Check for small text
            const allElements = document.querySelectorAll('p, span, div, a, button, li');
            let smallTextCount = 0;

            allElements.forEach(el => {
                const computed = window.getComputedStyle(el);
                const fontSize = parseFloat(computed.fontSize);
                if (fontSize < 12 && el.textContent?.trim()) {
                    smallTextCount++;
                }
            });

            // Check images
            const images = document.querySelectorAll('img');
            let responsiveImageCount = 0;

            images.forEach(img => {
                const computed = window.getComputedStyle(img);
                if (computed.maxWidth === '100%' || computed.width === '100%') {
                    responsiveImageCount++;
                }
            });

            const imagesResponsive = images.length > 0 &&
                (responsiveImageCount / images.length) > 0.7;

            return {
                hasViewportMeta,
                hasHorizontalOverflow,
                hasSmallText: smallTextCount > 0,
                smallTextCount,
                imagesResponsive,
            };
        });

        // Analyze touch targets
        const touchTargetData = await page.evaluate(() => {
            const clickableSelectors = 'a, button, input, select, textarea, [role="button"], [onclick]';
            const elements = document.querySelectorAll(clickableSelectors);
            const violations: any[] = [];
            const positions: Array<{ x: number, y: number, width: number, height: number }> = [];

            elements.forEach((el, index) => {
                const rect = el.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const x = rect.left;
                const y = rect.top;

                // Skip invisible elements
                if (width === 0 || height === 0) return;

                positions.push({ x, y, width, height });

                // Check minimum size (44x44px for touch targets)
                if (width < 44 || height < 44) {
                    violations.push({
                        element: el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : ''),
                        width: Math.round(width),
                        height: Math.round(height),
                        position: { x: Math.round(x), y: Math.round(y) },
                        issue: 'too-small'
                    });
                }
            });

            // Check spacing between touch targets
            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const a = positions[i];
                    const b = positions[j];

                    const distance = Math.sqrt(
                        Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
                    );

                    // If centers are very close and both are small, flag as too close
                    if (distance < 52 && a.width < 44 && b.width < 44) {
                        violations.push({
                            element: 'adjacent-elements',
                            width: 0,
                            height: 0,
                            position: { x: Math.round(a.x), y: Math.round(a.y) },
                            issue: 'too-close'
                        });
                        break; // Only flag once per element
                    }
                }
            }

            return {
                violations,
                totalClickableElements: elements.length,
            };
        });

        // Check mobile features
        const mobileFeatures = await page.evaluate(() => {
            // Click-to-call
            const hasClickToCall = document.querySelectorAll('a[href^="tel:"]').length > 0;

            // Google Maps directions
            const hasMapDirections = Array.from(document.querySelectorAll('a')).some(a =>
                a.href.includes('maps.google.com') || a.href.includes('maps.apple.com')
            );

            // Mobile menu (hamburger)
            const hasMobileMenu = document.querySelectorAll('[class*="hamburger"], [class*="menu-toggle"], [class*="mobile-menu"]').length > 0;

            // Sticky nav on scroll
            const navElements = document.querySelectorAll('nav, header, [role="navigation"]');
            let hasStickyNav = false;
            navElements.forEach(nav => {
                const computed = window.getComputedStyle(nav);
                if (computed.position === 'fixed' || computed.position === 'sticky') {
                    hasStickyNav = true;
                }
            });

            // Bottom CTA bar
            const hasBottomCTA = Array.from(document.querySelectorAll('*')).some(el => {
                const computed = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return computed.position === 'fixed' &&
                    rect.bottom > window.innerHeight - 100 &&
                    (el.textContent?.toLowerCase().includes('call') ||
                        el.textContent?.toLowerCase().includes('book') ||
                        el.textContent?.toLowerCase().includes('contact'));
            });

            // PWA support
            const hasPWASupport = !!document.querySelector('link[rel="manifest"]') ||
                !!document.querySelector('meta[name="apple-mobile-web-app-capable"]');

            return {
                hasClickToCall,
                hasMapDirections,
                hasMobileMenu,
                hasStickyNav,
                hasBottomCTA,
                hasPWASupport,
            };
        });

        // Get performance metrics
        const performanceMetrics = await page.evaluate(() => {
            const perfData = performance.getEntriesByType('navigation')[0] as any;
            const paintEntries = performance.getEntriesByType('paint');

            const tti = perfData?.domInteractive || 0;
            const lcp = paintEntries.find(e => e.name === 'largest-contentful-paint')?.startTime || 0;

            // Layout shift (simplified - would need PerformanceObserver for real CLS)
            const cls = 0; // Placeholder

            // Total blocking time (simplified)
            const tbt = perfData?.domContentLoadedEventEnd - perfData?.domContentLoadedEventStart || 0;

            return {
                timeToInteractive: Math.round(tti),
                largestContentfulPaint: Math.round(lcp),
                cumulativeLayoutShift: cls,
                totalBlockingTime: Math.round(tbt),
            };
        });

        // Get PageSpeed mobile score
        tracker?.addApiCall('PAGESPEED');
        const pagespeedData = await fetchPageSpeedMobile(url);

        await page.close();
        await browser.close();

        return {
            ...layoutMetrics,
            touchTargetViolations: touchTargetData.violations.slice(0, 20), // Limit to top 20
            totalClickableElements: touchTargetData.totalClickableElements,
            ...mobileFeatures,
            ...performanceMetrics,
            mobilePerformanceScore: pagespeedData.mobileScore,
            desktopPerformanceScore: pagespeedData.desktopScore,
        };

    } catch (error) {
        logger.error({ error, url }, '[MobileUX] Puppeteer analysis failed');
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Launch Puppeteer browser
 */
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

/**
 * Fetch PageSpeed Insights for mobile and desktop
 */
async function fetchPageSpeedMobile(url: string): Promise<{ mobileScore: number; desktopScore?: number }> {
    try {
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
        if (!apiKey) {
            logger.warn('[MobileUX] No PageSpeed API key, skipping PageSpeed check');
            return { mobileScore: 0 };
        }

        // Mobile strategy
        const mobileUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`;
        const mobileRes = await fetch(mobileUrl);
        const mobileData = await mobileRes.json();

        const mobileScore = Math.round((mobileData.lighthouseResult?.categories?.performance?.score || 0) * 100);

        // Try to get desktop score for comparison
        let desktopScore: number | undefined;
        try {
            const desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&key=${apiKey}`;
            const desktopRes = await fetch(desktopUrl);
            const desktopData = await desktopRes.json();
            desktopScore = Math.round((desktopData.lighthouseResult?.categories?.performance?.score || 0) * 100);
        } catch {
            // Desktop score is optional
        }

        return { mobileScore, desktopScore };

    } catch (error) {
        logger.warn({ error }, '[MobileUX] PageSpeed fetch failed');
        return { mobileScore: 0 };
    }
}

/**
 * Generate findings from mobile analysis
 */
function generateMobileFindings(
    analysis: MobileAnalysis,
    url: string,
    businessName: string
): Finding[] {
    const findings: Finding[] = [];

    // PAINKILLER: No mobile viewport meta tag
    if (!analysis.hasViewportMeta) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Performance',
            title: 'No Mobile Viewport Meta Tag',
            description: 'Website is missing the mobile viewport meta tag. This causes broken layouts on mobile devices. Over 60% of traffic is mobile.',
            impactScore: 9,
            confidenceScore: 100,
            evidence: [{
                type: 'text',
                value: 'Meta tag missing: <meta name="viewport" content="width=device-width, initial-scale=1">',
                label: 'Viewport Meta'
            }],
            metrics: {
                hasViewportMeta: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add viewport meta tag to <head>: <meta name="viewport" content="width=device-width, initial-scale=1">',
                'Test on actual mobile devices',
                'Ensure responsive design is implemented',
            ]
        });
    }

    // PAINKILLER: Horizontal overflow (broken layout)
    if (analysis.hasHorizontalOverflow) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Performance',
            title: 'Mobile Layout Broken (Horizontal Scrolling)',
            description: 'Content overflows horizontally on mobile, requiring side-scrolling. This is a critical mobile UX failure that frustrates users.',
            impactScore: 9,
            confidenceScore: 100,
            evidence: [{
                type: 'text',
                value: 'Content width exceeds viewport width',
                label: 'Horizontal Overflow'
            }],
            metrics: {
                hasHorizontalOverflow: true,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Fix elements that are too wide (tables, images, containers)',
                'Use max-width: 100% on all images',
                'Apply responsive CSS with media queries',
                'Test with Chrome DevTools mobile emulation',
            ]
        });
    }

    // PAINKILLER: Mobile performance score <30
    if (analysis.mobilePerformanceScore < 30 && analysis.mobilePerformanceScore > 0) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Performance',
            title: 'Critical Mobile Performance Issues',
            description: `Mobile performance score is ${analysis.mobilePerformanceScore}/100. Slow mobile sites lose 53% of visitors within 3 seconds.`,
            impactScore: 8,
            confidenceScore: 95,
            evidence: [{
                type: 'metric',
                value: analysis.mobilePerformanceScore,
                label: 'Mobile Performance Score'
            }],
            metrics: {
                mobilePerformanceScore: analysis.mobilePerformanceScore,
                timeToInteractive: analysis.timeToInteractive,
            },
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Compress and optimize all images',
                'Enable browser caching',
                'Minify CSS and JavaScript',
                'Use a CDN for static assets',
                'Reduce third-party scripts',
                'Consider lazy loading for images',
            ]
        });
    }

    // PAINKILLER: Phone number not tap-to-call
    if (!analysis.hasClickToCall) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Performance',
            title: 'Phone Number Not Tap-to-Call on Mobile',
            description: '60% of site traffic is mobile. Make it easy for mobile users to call you with one tap by wrapping phone numbers in tel: links.',
            impactScore: 7,
            confidenceScore: 95,
            evidence: [{
                type: 'text',
                value: 'No tel: links detected',
                label: 'Click-to-Call'
            }],
            metrics: {
                hasClickToCall: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Wrap phone numbers in <a href="tel:+15551234567"> tags',
                'Ensure all instances of phone number are clickable',
                'Test on actual mobile devices',
            ]
        });
    }

    // VITAMIN: Touch target violations
    if (analysis.touchTargetViolations.length > 10) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'Multiple Touch Target Violations',
            description: `Found ${analysis.touchTargetViolations.length} touch target issues. Buttons and links should be at least 44x44px with 8px spacing for easy tapping.`,
            impactScore: 6,
            confidenceScore: 90,
            evidence: analysis.touchTargetViolations.slice(0, 5).map(v => ({
                type: 'text',
                value: `${v.element}: ${v.width}x${v.height}px - ${v.issue}`,
                label: 'Touch Target Violation'
            })),
            metrics: {
                violationCount: analysis.touchTargetViolations.length,
                totalClickable: analysis.totalClickableElements,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Make all buttons/links at least 44x44px',
                'Add padding to increase touch target size',
                'Ensure 8px minimum spacing between clickable elements',
                'Test with finger (not mouse) on actual mobile device',
            ]
        });
    }

    // VITAMIN: Mobile score significantly lower than desktop
    if (analysis.desktopPerformanceScore &&
        analysis.mobilePerformanceScore > 0 &&
        (analysis.desktopPerformanceScore - analysis.mobilePerformanceScore) > 20) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'Mobile Performance Much Worse Than Desktop',
            description: `Mobile score (${analysis.mobilePerformanceScore}) is ${analysis.desktopPerformanceScore - analysis.mobilePerformanceScore} points lower than desktop (${analysis.desktopPerformanceScore}). Mobile users get a significantly worse experience.`,
            impactScore: 5,
            confidenceScore: 95,
            evidence: [{
                type: 'metric',
                value: `Mobile: ${analysis.mobilePerformanceScore}, Desktop: ${analysis.desktopPerformanceScore}`,
                label: 'Performance Comparison'
            }],
            metrics: {
                mobileScore: analysis.mobilePerformanceScore,
                desktopScore: analysis.desktopPerformanceScore,
                gap: analysis.desktopPerformanceScore - analysis.mobilePerformanceScore,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Optimize for mobile-first (slowest connection)',
                'Reduce image sizes specifically for mobile',
                'Test on real mobile devices and slow 3G',
                'Consider adaptive serving (different images for mobile)',
            ]
        });
    }

    // VITAMIN: No sticky mobile CTA
    if (!analysis.hasBottomCTA) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'No Sticky Mobile CTA Bar',
            description: 'Mobile sites with sticky bottom CTAs ("Call Now", "Book") see 15-25% higher conversion rates. Make it easy for users to take action.',
            impactScore: 4,
            confidenceScore: 85,
            evidence: [{
                type: 'text',
                value: 'No sticky bottom CTA detected',
                label: 'Bottom CTA Bar'
            }],
            metrics: {
                hasBottomCTA: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add fixed-position CTA bar at bottom of mobile view',
                'Include primary action (Call, Book, Contact)',
                'Make it easily dismissible if needed',
                'Show on scroll (hide when scrolling down, show when scrolling up)',
            ]
        });
    }

    // VITAMIN: No Google Maps directions link
    if (!analysis.hasMapDirections) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'No Directions Link to Google Maps',
            description: 'Mobile users often look for directions. Adding a "Get Directions" link increases foot traffic for local businesses.',
            impactScore: 4,
            confidenceScore: 90,
            evidence: [{
                type: 'text',
                value: 'No Google Maps or Apple Maps links found',
                label: 'Directions Link'
            }],
            metrics: {
                hasMapDirections: false,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add "Get Directions" button linking to Google Maps',
                'Use link format: https://maps.google.com/maps?q=YOUR+ADDRESS',
                'Place prominently in header or footer',
                'Consider Apple Maps link as well',
            ]
        });
    }

    // VITAMIN: Small text found
    if (analysis.hasSmallText && analysis.smallTextCount > 5) {
        findings.push({
            type: 'VITAMIN',
            category: 'Performance',
            title: 'Text Too Small on Mobile',
            description: `Found ${analysis.smallTextCount} elements with text smaller than 12px on mobile. This hurts readability and accessibility.`,
            impactScore: 3,
            confidenceScore: 90,
            evidence: [{
                type: 'metric',
                value: analysis.smallTextCount,
                label: 'Small Text Elements'
            }],
            metrics: {
                smallTextCount: analysis.smallTextCount,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Ensure all body text is at least 16px on mobile',
                'Use relative units (rem, em) instead of fixed px',
                'Increase line height for better readability (1.5+)',
                'Test on actual mobile devices',
            ]
        });
    }

    return findings;
}
