/**
 * Accessibility Quick Scan Module
 * Uses Puppeteer + axe-core for automated rule checks, supplemented with custom checks.
 * It does not certify WCAG conformance or legal compliance.
 */
import { AxePuppeteer } from '@axe-core/puppeteer';

import type { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { acquireSharedBrowser, releaseSharedBrowser } from '@/lib/security/browserLauncher';
import { safePageGoto } from '@/lib/security/safeBrowser';

import { LegacyAuditModuleResult } from './types';

import type { Browser } from 'puppeteer-core';

export interface AccessibilityResult {
  status: 'success' | 'error';
  data: {
    scanStatus: 'violations_detected' | 'no_automated_violations' | 'unavailable';
    score: number | null;
    totalIssues: number | null;
    criticalIssues: number | null;
    manualReviewRequired: true;
    coverageLimitation: string;
    scanTimestamp: string;
    issuesByCategory: {
      altText: { total: number; withAlt: number; percentage: number };
      headings: { h1Count: number; skipLevels: boolean; structure: string[] };
      contrast: { failCount: number; worstRatio: number };
      forms: { totalInputs: number; labeled: number; percentage: number };
      links: { genericCount: number; examples: string[] };
    };
    topIssues: Array<{
      severity: string;
      impact: string;
      ruleId: string;
      selector: string;
      description: string;
      element: string;
      recommendation: string;
      scanTimestamp: string;
    }>;
    recommendations: string[];
  };
}

export interface AccessibilityModuleInput {
  url: string;
  signal?: AbortSignal;
  /** P2-43: audit identity used to share one Puppeteer Browser process across
   * accessibility/mobileUX/conversion instead of each launching its own. */
  auditId?: string;
}

interface CustomCheckResult {
  altText: { total: number; withAlt: number };
  headings: { h1Count: number; levels: number[]; structure: string[] };
  forms: { totalInputs: number; labeled: number };
  links: { genericCount: number; examples: string[] };
  hasLang: boolean;
  hasViewport: boolean;
  hasFocusStyles: boolean;
}

const AUTOMATION_LIMITATION =
  'Automated accessibility checks cover only part of applicable accessibility requirements. Manual review by an accessibility expert is required to assess overall WCAG conformance or legal obligations.';

function sanitizeElementSnippet(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/**
 * Run custom accessibility checks in the page context
 */
async function runCustomChecks(page: {
  evaluate: (fn: () => CustomCheckResult) => Promise<CustomCheckResult>;
}): Promise<CustomCheckResult> {
  return page.evaluate(() => {
    const result: CustomCheckResult = {
      altText: { total: 0, withAlt: 0 },
      headings: { h1Count: 0, levels: [], structure: [] },
      forms: { totalInputs: 0, labeled: 0 },
      links: { genericCount: 0, examples: [] },
      hasLang: false,
      hasViewport: false,
      hasFocusStyles: true,
    };

    const imgs = document.querySelectorAll('img');
    result.altText.total = imgs.length;
    imgs.forEach((img) => {
      const alt = img.getAttribute('alt');
      if (alt !== null && alt !== undefined) result.altText.withAlt++;
    });

    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const levels: number[] = [];
    headings.forEach((h) => {
      const match = h.tagName.match(/h(\d)/i);
      if (match) {
        const level = parseInt(match[1] || '', 10);
        levels.push(level);
        result.headings.structure.push(
          `${h.tagName}: ${(h.textContent || '').trim().slice(0, 40)}`
        );
      }
    });
    result.headings.h1Count = levels.filter((l) => l === 1).length;
    result.headings.levels = levels;

    const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    result.forms.totalInputs = inputs.length;
    inputs.forEach((input) => {
      const id = input.id;
      const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : input.closest('label');
      const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
      if (hasLabel || hasAria) result.forms.labeled++;
    });

    const links = document.querySelectorAll('a[href]');
    const genericPattern = /\b(click here|read more|learn more)\b/i;
    links.forEach((a) => {
      const text = (a.textContent || '').trim();
      if (text && genericPattern.test(text)) {
        result.links.genericCount++;
        if (result.links.examples.length < 5) {
          result.links.examples.push(text.slice(0, 50));
        }
      }
    });

    result.hasLang = !!document.documentElement.getAttribute('lang');
    result.hasViewport = !!document.querySelector('meta[name="viewport"]');

    const styleSheets = document.styleSheets;
    try {
      for (let i = 0; i < styleSheets.length; i++) {
        const sheet = styleSheets[i];
        if (!sheet) continue;
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j] as CSSStyleRule;
              if (rule.selectorText && /:focus/.test(rule.selectorText)) {
                const outline = rule.style?.outline;
                if (outline === 'none' || outline === '0') {
                  result.hasFocusStyles = false;
                  break;
                }
              }
            }
          }
        } catch {
          // CORS may block access to external stylesheets
        }
      }
    } catch {
      // Ignore
    }

    const globalStyle = document.querySelector('style');
    if (
      globalStyle?.textContent?.includes('outline:none') ||
      globalStyle?.textContent?.includes('outline: none')
    ) {
      result.hasFocusStyles = false;
    }

    return result;
  });
}

/**
 * Check for heading level skips (e.g. H1 -> H3 without H2)
 */
function hasHeadingSkipLevels(levels: number[]): boolean {
  if (levels.length < 2) return false;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]! - levels[i - 1]! > 1) return true;
  }
  return false;
}

/**
 * Run accessibility module
 */
export async function runAccessibilityModule(
  input: AccessibilityModuleInput,
  _tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
  const { url } = input;

  if (!url) {
    const scanTimestamp = new Date().toISOString();
    return {
      moduleId: 'accessibility',
      status: 'failed',
      timestamp: scanTimestamp,
      data: {
        status: 'error',
        data: {
          scanStatus: 'unavailable',
          score: null,
          totalIssues: null,
          criticalIssues: null,
          manualReviewRequired: true,
          coverageLimitation: AUTOMATION_LIMITATION,
          scanTimestamp,
          issuesByCategory: {
            altText: { total: 0, withAlt: 0, percentage: 0 },
            headings: { h1Count: 0, skipLevels: false, structure: [] },
            contrast: { failCount: 0, worstRatio: 0 },
            forms: { totalInputs: 0, labeled: 0, percentage: 0 },
            links: { genericCount: 0, examples: [] },
          },
          topIssues: [],
          recommendations: ['No URL provided for accessibility scan.'],
        },
      },
    };
  }

  let browser: Browser | null = null;
  let browserKey: string | null = null;
  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;

  try {
    const acquired = await acquireSharedBrowser(input.auditId);
    browser = acquired.browser;
    browserKey = acquired.key;
    page = await browser.newPage();

    await safePageGoto(page, url, { waitUntil: 'domcontentloaded', timeout: 20000 }, input.signal);

    const custom = await runCustomChecks(page);

    const axeResults = await new AxePuppeteer(page)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const violations = axeResults.violations || [];
    const scanTimestamp = new Date().toISOString();
    let criticalCount = 0;
    let contrastFailCount = 0;
    let worstRatio = 0;

    const topIssues: AccessibilityResult['data']['topIssues'] = [];
    const recommendations: string[] = [];

    for (const v of violations) {
      const count = v.nodes?.length ?? 0;
      if (v.impact === 'critical') criticalCount += count;

      if (v.id === 'color-contrast') {
        contrastFailCount += count;
        for (const node of v.nodes || []) {
          const anyData = (node as { any?: Array<{ data?: { contrastRatio?: number } }> })?.any;
          const ratio = anyData?.[0]?.data?.contrastRatio;
          if (typeof ratio === 'number' && (worstRatio === 0 || ratio < worstRatio)) {
            worstRatio = ratio;
          }
        }
      }

      if (topIssues.length < 8) {
        const node = v.nodes?.[0];
        const selector = String(node?.target?.[0] || 'unknown selector');
        const el = sanitizeElementSnippet(node?.html || selector);
        topIssues.push({
          severity: v.impact || 'moderate',
          impact: v.impact || 'moderate',
          ruleId: v.id,
          selector,
          description: v.description || v.help,
          element: el,
          recommendation: v.helpUrl ? `See ${v.helpUrl}` : v.help || 'Fix accessibility issue',
          scanTimestamp,
        });
      }
    }

    const totalIssues =
      violations.reduce((sum, v) => sum + (v.nodes?.length ?? 0), 0) +
      (custom.altText.total > 0 && custom.altText.withAlt < custom.altText.total ? 1 : 0) +
      (custom.headings.h1Count !== 1 ? 1 : 0) +
      (hasHeadingSkipLevels(custom.headings.levels) ? 1 : 0) +
      (custom.forms.totalInputs > 0 && custom.forms.labeled < custom.forms.totalInputs ? 1 : 0) +
      custom.links.genericCount +
      (custom.hasLang ? 0 : 1) +
      (custom.hasViewport ? 0 : 1) +
      (custom.hasFocusStyles ? 0 : 1);

    const altPct =
      custom.altText.total > 0
        ? Math.round((custom.altText.withAlt / custom.altText.total) * 100)
        : 100;
    const formPct =
      custom.forms.totalInputs > 0
        ? Math.round((custom.forms.labeled / custom.forms.totalInputs) * 100)
        : 100;

    if (altPct < 100 && custom.altText.total > 0) {
      recommendations.push(
        `Add alt text to ${custom.altText.total - custom.altText.withAlt} images (${altPct}% have alt text).`
      );
    }
    if (custom.headings.h1Count !== 1) {
      recommendations.push(
        custom.headings.h1Count === 0
          ? 'Add exactly one H1 heading to the page.'
          : 'Ensure only one H1 exists per page.'
      );
    }
    if (hasHeadingSkipLevels(custom.headings.levels)) {
      recommendations.push(
        'Fix heading hierarchy — do not skip levels (e.g. H1 to H3 without H2).'
      );
    }
    if (contrastFailCount > 0) {
      recommendations.push(
        `Fix ${contrastFailCount} color contrast issues. Aim for 4.5:1 (normal text) or 3:1 (large text).`
      );
    }
    if (formPct < 100 && custom.forms.totalInputs > 0) {
      recommendations.push(
        `Add labels or aria-label to ${custom.forms.totalInputs - custom.forms.labeled} form inputs.`
      );
    }
    if (custom.links.genericCount > 0) {
      recommendations.push(
        `Replace generic link text ("click here", "read more") with descriptive text. Found ${custom.links.genericCount} examples.`
      );
    }
    if (!custom.hasLang) {
      recommendations.push('Add lang="en" (or appropriate language) to the <html> tag.');
    }
    if (!custom.hasViewport) {
      recommendations.push(
        'Add viewport meta tag for mobile accessibility: <meta name="viewport" content="width=device-width, initial-scale=1">'
      );
    }
    if (!custom.hasFocusStyles) {
      recommendations.push(
        'Ensure focus indicators are visible. Avoid outline:none without an alternative.'
      );
    }

    const deduction =
      criticalCount * 8 +
      contrastFailCount * 3 +
      (altPct < 100 ? 15 : 0) +
      (custom.headings.h1Count !== 1 ? 10 : 0) +
      (hasHeadingSkipLevels(custom.headings.levels) ? 5 : 0) +
      (formPct < 100 && custom.forms.totalInputs > 0 ? 5 : 0) +
      custom.links.genericCount * 2 +
      (!custom.hasLang ? 5 : 0) +
      (!custom.hasViewport ? 5 : 0) +
      (!custom.hasFocusStyles ? 3 : 0);

    const score = Math.max(0, Math.min(100, 100 - deduction));
    const result: AccessibilityResult = {
      status: 'success',
      data: {
        scanStatus: totalIssues > 0 ? 'violations_detected' : 'no_automated_violations',
        score,
        totalIssues,
        criticalIssues: criticalCount,
        manualReviewRequired: true,
        coverageLimitation: AUTOMATION_LIMITATION,
        scanTimestamp,
        issuesByCategory: {
          altText: {
            total: custom.altText.total,
            withAlt: custom.altText.withAlt,
            percentage: altPct,
          },
          headings: {
            h1Count: custom.headings.h1Count,
            skipLevels: hasHeadingSkipLevels(custom.headings.levels),
            structure: custom.headings.structure.slice(0, 10),
          },
          contrast: { failCount: contrastFailCount, worstRatio },
          forms: {
            totalInputs: custom.forms.totalInputs,
            labeled: custom.forms.labeled,
            percentage: formPct,
          },
          links: {
            genericCount: custom.links.genericCount,
            examples: custom.links.examples,
          },
        },
        topIssues,
        recommendations:
          recommendations.length > 0
            ? [...recommendations, AUTOMATION_LIMITATION]
            : ['No automated violations were detected in this scan.', AUTOMATION_LIMITATION],
      },
    };

    logger.info({ url, score, criticalIssues: criticalCount }, '[Accessibility] Scan complete');

    return {
      moduleId: 'accessibility',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: result,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { url, errorMessage: errMsg, errorStack: errStack },
      '[Accessibility] Scan failed'
    );
    const scanTimestamp = new Date().toISOString();
    return {
      moduleId: 'accessibility',
      status: 'failed',
      timestamp: scanTimestamp,
      data: {
        status: 'error',
        data: {
          scanStatus: 'unavailable',
          score: null,
          totalIssues: null,
          criticalIssues: null,
          manualReviewRequired: true,
          coverageLimitation: AUTOMATION_LIMITATION,
          scanTimestamp,
          issuesByCategory: {
            altText: { total: 0, withAlt: 0, percentage: 0 },
            headings: { h1Count: 0, skipLevels: false, structure: [] },
            contrast: { failCount: 0, worstRatio: 0 },
            forms: { totalInputs: 0, labeled: 0, percentage: 0 },
            links: { genericCount: 0, examples: [] },
          },
          topIssues: [],
          recommendations: [
            `Accessibility scan failed: ${error instanceof Error ? error.message : 'Unknown error'}. Ensure the URL is accessible.`,
            AUTOMATION_LIMITATION,
          ],
        },
      },
    };
  } finally {
    await page?.close().catch(() => undefined);
    if (browserKey) await releaseSharedBrowser(browserKey);
  }
}
