import fs from 'node:fs';

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { z } from 'zod';

import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { safePageGoto } from '@/lib/security/safeBrowser';

import { normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, createEvidence, Finding } from './types';

export interface MobileUXModuleInput {
  url: string;
  businessName: string;
  signal?: AbortSignal;
  /**
   * P1-38 (Wave 7): the `website` module (dependsOn: ['website']) already runs a
   * real mobile-strategy PageSpeed check for this same URL. When that succeeded,
   * its score is forwarded here so this module reuses it instead of making a
   * second, duplicate billable mobile PageSpeed call — the desktop comparison call
   * (genuinely new data `website` never fetches) is unaffected.
   */
  reusedMobileScore?: number | null;
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
  domInteractive: number | null;
  largestContentfulPaint: number | null;
  cumulativeLayoutShift: number | null;
  totalBlockingTime: number | null;

  // PageSpeed mobile
  mobilePerformanceScore: number | null;
  desktopPerformanceScore?: number;
  pageSpeedStatus: 'available' | 'unavailable';
}

const PageSpeedResponseSchema = z.object({
  lighthouseResult: z.object({
    categories: z.object({
      performance: z.object({ score: z.number().min(0).max(1) }),
    }),
  }),
});

/**
 * Run mobile UX analysis module
 */
export async function runMobileUXModule(
  input: MobileUXModuleInput,
  tracker?: CostTracker
): Promise<AuditModuleResult> {
  logger.info({ url: input.url }, '[MobileUX] Starting mobile analysis');

  try {
    const analysis = await analyzeMobileUX(
      input.url,
      tracker,
      input.signal,
      input.reusedMobileScore
    );
    const findings = generateMobileFindings(analysis, input.url);

    const evidenceSnapshot = {
      module: 'mobile_ux',
      source: 'puppeteer_analysis',
      rawResponse: analysis,
      collectedAt: new Date(),
    };

    logger.info(
      {
        url: input.url,
        violations: analysis.touchTargetViolations.length,
        mobileScore: analysis.mobilePerformanceScore,
        findingsCount: findings.length,
      },
      '[MobileUX] Analysis complete'
    );

    return {
      findings,
      evidenceSnapshots: [evidenceSnapshot],
      execution:
        analysis.pageSpeedStatus === 'available'
          ? { state: 'complete' }
          : { state: 'partial', reason: 'PageSpeed metrics were unavailable' },
    };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    logger.error({ error, url: input.url }, '[MobileUX] Analysis failed');

    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'Mobile browser analysis failed',
      },
    };
  }
}

/**
 * Analyze mobile UX using Puppeteer
 */
async function analyzeMobileUX(
  url: string,
  tracker?: CostTracker,
  signal?: AbortSignal,
  reusedMobileScore?: number | null
): Promise<MobileAnalysis> {
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

    await page.evaluateOnNewDocument(() => {
      const state = { cls: 0, lcp: null as number | null, tbt: 0 };
      (window as unknown as { __proposalMobileMetrics: typeof state }).__proposalMobileMetrics =
        state;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<
            PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          >) {
            if (!entry.hadRecentInput && typeof entry.value === 'number') state.cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          const latest = list.getEntries().at(-1);
          if (latest) state.lcp = latest.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) state.tbt += Math.max(0, entry.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      } catch {}
    });

    // Navigate to page
    await safePageGoto(page, url, { waitUntil: 'networkidle2', timeout: 15000 }, signal);

    // Wait for any animations/transitions
    await waitForDelay(2000, signal);

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

      allElements.forEach((el) => {
        const computed = window.getComputedStyle(el);
        const fontSize = parseFloat(computed.fontSize);
        if (fontSize < 12 && el.textContent?.trim()) {
          smallTextCount++;
        }
      });

      // Check images
      const images = document.querySelectorAll('img');
      let responsiveImageCount = 0;

      images.forEach((img) => {
        const computed = window.getComputedStyle(img);
        if (computed.maxWidth === '100%' || computed.width === '100%') {
          responsiveImageCount++;
        }
      });

      const imagesResponsive = images.length > 0 && responsiveImageCount / images.length > 0.7;

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
      const positions: Array<{ x: number; y: number; width: number; height: number }> = [];

      elements.forEach((el) => {
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
            element:
              el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : ''),
            width: Math.round(width),
            height: Math.round(height),
            position: { x: Math.round(x), y: Math.round(y) },
            issue: 'too-small',
          });
        }
      });

      // Check spacing between touch targets
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          if (!a || !b) continue;

          const distance = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

          // If centers are very close and both are small, flag as too close
          if (distance < 52 && a.width < 44 && b.width < 44) {
            violations.push({
              element: 'adjacent-elements',
              width: 0,
              height: 0,
              position: { x: Math.round(a.x), y: Math.round(a.y) },
              issue: 'too-close',
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
      const hasMapDirections = Array.from(document.querySelectorAll('a')).some(
        (a) => a.href.includes('maps.google.com') || a.href.includes('maps.apple.com')
      );

      // Mobile menu (hamburger)
      const hasMobileMenu =
        document.querySelectorAll(
          '[class*="hamburger"], [class*="menu-toggle"], [class*="mobile-menu"]'
        ).length > 0;

      // Sticky nav on scroll
      const navElements = document.querySelectorAll('nav, header, [role="navigation"]');
      let hasStickyNav = false;
      navElements.forEach((nav) => {
        const computed = window.getComputedStyle(nav);
        if (computed.position === 'fixed' || computed.position === 'sticky') {
          hasStickyNav = true;
        }
      });

      // Bottom CTA bar
      const hasBottomCTA = Array.from(document.querySelectorAll('*')).some((el) => {
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          computed.position === 'fixed' &&
          rect.bottom > window.innerHeight - 100 &&
          (el.textContent?.toLowerCase().includes('call') ||
            el.textContent?.toLowerCase().includes('book') ||
            el.textContent?.toLowerCase().includes('contact'))
        );
      });

      // PWA support
      const hasPWASupport =
        !!document.querySelector('link[rel="manifest"]') ||
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
      const observed = (
        window as unknown as {
          __proposalMobileMetrics?: { cls: number; lcp: number | null; tbt: number };
        }
      ).__proposalMobileMetrics;

      return {
        domInteractive:
          typeof perfData?.domInteractive === 'number' ? Math.round(perfData.domInteractive) : null,
        largestContentfulPaint: typeof observed?.lcp === 'number' ? Math.round(observed.lcp) : null,
        cumulativeLayoutShift:
          typeof observed?.cls === 'number' ? Number(observed.cls.toFixed(4)) : null,
        totalBlockingTime: typeof observed?.tbt === 'number' ? Math.round(observed.tbt) : null,
      };
    });

    // Get PageSpeed mobile score
    const pagespeedData = await fetchPageSpeedMobile(url, tracker, signal, reusedMobileScore);

    return {
      ...layoutMetrics,
      touchTargetViolations: touchTargetData.violations.slice(0, 20), // Limit to top 20
      totalClickableElements: touchTargetData.totalClickableElements,
      ...mobileFeatures,
      ...performanceMetrics,
      mobilePerformanceScore: pagespeedData.mobileScore ?? null,
      desktopPerformanceScore: pagespeedData.desktopScore,
      pageSpeedStatus: pagespeedData.status,
    };
  } catch (error) {
    logger.error({ error, url }, '[MobileUX] Puppeteer analysis failed');
    throw error;
  } finally {
    await page.close().catch(() => undefined);
    await browser.close();
  }
}

async function launchBrowser() {
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
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    executablePath,
    headless: true,
  });
}

function waitForDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Fetch PageSpeed Insights for mobile and desktop
 */
async function fetchPageSpeedMobile(
  url: string,
  tracker?: CostTracker,
  signal?: AbortSignal,
  reusedMobileScore?: number | null
): Promise<{ status: 'available' | 'unavailable'; mobileScore?: number; desktopScore?: number }> {
  try {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey) {
      logger.warn('[MobileUX] No PageSpeed API key, skipping PageSpeed check');
      return { status: 'unavailable' };
    }

    // P1-38 (Wave 7): `website` (dependsOn: ['website']) already performed a real
    // mobile-strategy PageSpeed call for this same URL. Reuse its score instead of
    // making a second duplicate billable mobile call.
    let mobileScore: number;
    if (typeof reusedMobileScore === 'number') {
      mobileScore = reusedMobileScore;
    } else {
      // Mobile strategy
      const mobileUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`;
      const mobileData = await withProviderResilience<unknown>(
        {
          provider: 'pagespeed',
          operation: 'mobileUX:fetchPageSpeedMobile:mobile',
          signal,
          degrade: false,
          policy: { timeoutMs: 10000, maxAttempts: 2 },
        },
        async ({ signal: providerSignal }) => {
          tracker?.addApiCall('PAGESPEED');
          const mobileRes = await fetch(mobileUrl, { signal: providerSignal });
          if (!mobileRes.ok)
            throw new Error(`HTTP error ${mobileRes.status}: ${mobileRes.statusText}`);
          return await mobileRes.json();
        }
      );
      const mobileParsed = PageSpeedResponseSchema.parse(mobileData);
      mobileScore = Math.round(mobileParsed.lighthouseResult.categories.performance.score * 100);
    }

    // Try to get desktop score for comparison
    let desktopScore: number | undefined;
    try {
      const desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&key=${apiKey}`;
      const desktopData = await withProviderResilience<unknown>(
        {
          provider: 'pagespeed',
          operation: 'mobileUX:fetchPageSpeedMobile:desktop',
          signal,
          degrade: false,
          policy: { timeoutMs: 10000, maxAttempts: 1 },
        },
        async ({ signal: providerSignal }) => {
          tracker?.addApiCall('PAGESPEED');
          const desktopRes = await fetch(desktopUrl, { signal: providerSignal });
          if (!desktopRes.ok)
            throw new Error(`HTTP error ${desktopRes.status}: ${desktopRes.statusText}`);
          return await desktopRes.json();
        }
      );
      const desktopParsed = PageSpeedResponseSchema.parse(desktopData);
      desktopScore = Math.round(desktopParsed.lighthouseResult.categories.performance.score * 100);
    } catch {
      // Desktop score is optional
    }

    return { status: 'available', mobileScore, desktopScore };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    logger.warn({ error }, '[MobileUX] PageSpeed fetch failed');
    return { status: 'unavailable' };
  }
}

/**
 * Generate findings from mobile analysis
 */
function generateMobileFindings(analysis: MobileAnalysis, url: string): Finding[] {
  const findings: Finding[] = [];
  const collectedAt = new Date().toISOString();
  const evidence = (
    pointer: string,
    value: string | number,
    label: string,
    type: 'text' | 'metric' = 'text'
  ) =>
    createEvidence({
      pointer,
      source: 'mobile_browser_analysis',
      collected_at: collectedAt,
      type,
      value,
      label,
    });

  // PAINKILLER: No mobile viewport meta tag
  if (!analysis.hasViewportMeta) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Performance',
      title: 'No Mobile Viewport Meta Tag',
      description:
        'Website is missing the mobile viewport meta tag. This causes broken layouts on mobile devices. Over 60% of traffic is mobile.',
      impactScore: 9,
      confidenceScore: normalizeConfidence(100, '0-100'),
      evidence: [
        evidence(`${url}#meta[name=viewport]`, 'Viewport meta tag absent', 'Viewport Meta'),
      ],
      metrics: {
        hasViewportMeta: false,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Add viewport meta tag to <head>: <meta name="viewport" content="width=device-width, initial-scale=1">',
        'Test on actual mobile devices',
        'Ensure responsive design is implemented',
      ],
    });
  }

  // PAINKILLER: Horizontal overflow (broken layout)
  if (analysis.hasHorizontalOverflow) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Performance',
      title: 'Mobile Layout Broken (Horizontal Scrolling)',
      description:
        'Content overflows horizontally on mobile, requiring side-scrolling. This is a critical mobile UX failure that frustrates users.',
      impactScore: 9,
      confidenceScore: normalizeConfidence(100, '0-100'),
      evidence: [
        evidence(`${url}#document-body`, 'Content width exceeds viewport', 'Horizontal Overflow'),
      ],
      metrics: {
        hasHorizontalOverflow: true,
      },
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Fix elements that are too wide (tables, images, containers)',
        'Use max-width: 100% on all images',
        'Apply responsive CSS with media queries',
        'Test with Chrome DevTools mobile emulation',
      ],
    });
  }

  // PAINKILLER: Mobile performance score <30
  if (analysis.mobilePerformanceScore !== null && analysis.mobilePerformanceScore < 30) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Performance',
      title: 'Critical Mobile Performance Issues',
      description: `Mobile performance score is ${analysis.mobilePerformanceScore}/100. Slow mobile sites lose 53% of visitors within 3 seconds.`,
      impactScore: 8,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile`,
          source: 'pagespeed_v5',
          collected_at: collectedAt,
          type: 'metric',
          value: analysis.mobilePerformanceScore,
          label: 'Mobile Lab Performance Score',
        }),
      ],
      metrics: {
        mobilePerformanceScore: analysis.mobilePerformanceScore,
        domInteractiveMs: analysis.domInteractive,
        formFactor: 'mobile',
        dataType: 'lab',
      },
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Compress and optimize all images',
        'Enable browser caching',
        'Minify CSS and JavaScript',
        'Use a CDN for static assets',
        'Reduce third-party scripts',
        'Consider lazy loading for images',
      ],
    });
  }

  // PAINKILLER: Phone number not tap-to-call
  if (!analysis.hasClickToCall) {
    findings.push({
      type: 'PAINKILLER',
      category: 'Performance',
      title: 'Phone Number Not Tap-to-Call on Mobile',
      description:
        '60% of site traffic is mobile. Make it easy for mobile users to call you with one tap by wrapping phone numbers in tel: links.',
      impactScore: 7,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [evidence(`${url}#a[href^=tel]`, 'No tel: links detected', 'Click-to-Call')],
      metrics: {
        hasClickToCall: false,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Wrap phone numbers in <a href="tel:+15551234567"> tags',
        'Ensure all instances of phone number are clickable',
        'Test on actual mobile devices',
      ],
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
      confidenceScore: normalizeConfidence(90, '0-100'),
      evidence: analysis.touchTargetViolations
        .slice(0, 5)
        .map((violation) =>
          evidence(
            `${url}#${encodeURIComponent(violation.element)}`,
            `${violation.width}x${violation.height}px - ${violation.issue}`,
            'Touch Target Violation'
          )
        ),
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
      ],
    });
  }

  // VITAMIN: Mobile score significantly lower than desktop
  if (
    analysis.desktopPerformanceScore !== undefined &&
    analysis.mobilePerformanceScore !== null &&
    analysis.desktopPerformanceScore - analysis.mobilePerformanceScore > 20
  ) {
    findings.push({
      type: 'VITAMIN',
      category: 'Performance',
      title: 'Mobile Performance Much Worse Than Desktop',
      description: `Mobile score (${analysis.mobilePerformanceScore}) is ${analysis.desktopPerformanceScore - analysis.mobilePerformanceScore} points lower than desktop (${analysis.desktopPerformanceScore}). Mobile users get a significantly worse experience.`,
      impactScore: 5,
      confidenceScore: normalizeConfidence(95, '0-100'),
      evidence: [
        createEvidence({
          pointer: `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}`,
          source: 'pagespeed_v5',
          collected_at: collectedAt,
          type: 'text',
          value: `Mobile ${analysis.mobilePerformanceScore}; desktop ${analysis.desktopPerformanceScore}`,
          label: 'Lab Performance Comparison',
        }),
      ],
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
      ],
    });
  }

  // VITAMIN: No sticky mobile CTA
  if (!analysis.hasBottomCTA) {
    findings.push({
      type: 'VITAMIN',
      category: 'Performance',
      title: 'No Sticky Mobile CTA Bar',
      description:
        'Mobile sites with sticky bottom CTAs ("Call Now", "Book") see 15-25% higher conversion rates. Make it easy for users to take action.',
      impactScore: 4,
      confidenceScore: normalizeConfidence(85, '0-100'),
      evidence: [
        evidence(`${url}#document-body`, 'No fixed bottom CTA detected', 'Bottom CTA Bar'),
      ],
      metrics: {
        hasBottomCTA: false,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Add fixed-position CTA bar at bottom of mobile view',
        'Include primary action (Call, Book, Contact)',
        'Make it easily dismissible if needed',
        'Show on scroll (hide when scrolling down, show when scrolling up)',
      ],
    });
  }

  // VITAMIN: No Google Maps directions link
  if (!analysis.hasMapDirections) {
    findings.push({
      type: 'VITAMIN',
      category: 'Performance',
      title: 'No Directions Link to Google Maps',
      description:
        'Mobile users often look for directions. Adding a "Get Directions" link increases foot traffic for local businesses.',
      impactScore: 4,
      confidenceScore: normalizeConfidence(90, '0-100'),
      evidence: [
        evidence(
          `${url}#a[href*=maps]`,
          'No Google Maps or Apple Maps links found',
          'Directions Link'
        ),
      ],
      metrics: {
        hasMapDirections: false,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Add "Get Directions" button linking to Google Maps',
        'Use link format: https://maps.google.com/maps?q=YOUR+ADDRESS',
        'Place prominently in header or footer',
        'Consider Apple Maps link as well',
      ],
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
      confidenceScore: normalizeConfidence(90, '0-100'),
      evidence: [
        evidence(`${url}#text-elements`, analysis.smallTextCount, 'Small Text Elements', 'metric'),
      ],
      metrics: {
        smallTextCount: analysis.smallTextCount,
      },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Ensure all body text is at least 16px on mobile',
        'Use relative units (rem, em) instead of fixed px',
        'Increase line height for better readability (1.5+)',
        'Test on actual mobile devices',
      ],
    });
  }

  return findings;
}
