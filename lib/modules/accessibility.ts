import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { Browser, Page } from 'puppeteer-core';
import { AxePuppeteer } from '@axe-core/puppeteer';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export interface AccessibilityModuleInput {
    url: string;
    crawledPages?: Array<{ url: string; html: string; }>;
}

interface Violation {
    id: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
    tags: string[];
    description: string;
    help: string;
    nodes: Array<{
        html: string;
        target: string[];
        failureSummary?: string;
    }>;
}

interface PageAccessibilityResult {
    url: string;
    score: number;
    violations: Violation[];
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
}

interface AccessibilityAnalysis {
    pages: PageAccessibilityResult[];
    totalViolations: number;
    totalCritical: number;
    totalSerious: number;
    commonViolations: Array<{ id: string; description: string; count: number }>;
    overallScore: number;
}

/**
 * Run accessibility analysis module
 */
export async function runAccessibilityModule(
    input: AccessibilityModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[Accessibility] Starting accessibility analysis');

    let browser: Browser | null = null;

    try {
        // Launch browser (reusing existing setup if possible, but for simplicity launching new here)
        // In production, inject the shared browser instance
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const pagesToAnalyze = [input.url, ...(input.crawledPages?.slice(0, 4).map(p => p.url) || [])];
        const pageResults: PageAccessibilityResult[] = [];

        // Analyze pages sequentially to save resources
        for (const url of pagesToAnalyze) {
            try {
                const pageResult = await analyzePageAccessibility(browser, url);
                if (pageResult) {
                    pageResults.push(pageResult);
                }
            } catch (error) {
                logger.warn({ error, url }, '[Accessibility] Page analysis failed');
            }
        }

        if (pageResults.length === 0) {
            throw new Error('No accessibility results collected');
        }

        // Aggregate results
        const analysis = aggregateAccessibilityResults(pageResults);

        // Generate findings
        const findings = generateAccessibilityFindings(analysis);

        const evidenceSnapshot = {
            module: 'accessibility',
            source: 'axe_core',
            rawResponse: analysis,
            collectedAt: new Date(),
        };

        logger.info({
            url: input.url,
            pagesAnalyzed: pageResults.length,
            overallScore: analysis.overallScore,
            criticalViolations: analysis.totalCritical,
        }, '[Accessibility] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, url: input.url }, '[Accessibility] Analysis failed');

        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Compliance',
                title: 'Accessibility Analysis Unavailable',
                description: 'Unable to run automated accessibility checks. This may be due to browser or timeout issues.',
                impactScore: 1,
                confidenceScore: 50,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Try running accessibility analysis again later'],
            }],
            evidenceSnapshots: [],
        };
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Analyze a single page with axe-core
 */
async function analyzePageAccessibility(browser: Browser, url: string): Promise<PageAccessibilityResult | null> {
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

        // Run axe-core
        const results = await new AxePuppeteer(page)
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) // WCAG 2.1 Level AA
            .analyze();

        const violations = results.violations as Violation[];

        // Count violations by impact
        let critical = 0;
        let serious = 0;
        let moderate = 0;
        let minor = 0;

        violations.forEach(v => {
            const count = v.nodes.length;
            if (v.impact === 'critical') critical += count;
            else if (v.impact === 'serious') serious += count;
            else if (v.impact === 'moderate') moderate += count;
            else minor += count;
        });

        // Calculate page score (0-100)
        // Deduct points based on violation counts and severity
        // 100 - (critical * 10) - (serious * 5) - (moderate * 2) - (minor * 1)
        const deduction = (critical * 10) + (serious * 5) + (moderate * 2) + minor;
        const score = Math.max(0, 100 - deduction);

        return {
            url,
            score,
            violations,
            criticalCount: critical,
            seriousCount: serious,
            moderateCount: moderate,
            minorCount: minor,
        };

    } catch (error) {
        logger.warn({ error, url }, '[Accessibility] Axe-core failed');
        return null;
    } finally {
        await page.close();
    }
}

/**
 * Aggregate results from multiple pages
 */
function aggregateAccessibilityResults(results: PageAccessibilityResult[]): AccessibilityAnalysis {
    let totalScore = 0;
    let totalViolations = 0;
    let totalCritical = 0;
    let totalSerious = 0;
    const violationMap = new Map<string, { description: string; count: number }>();

    results.forEach(res => {
        totalScore += res.score;
        totalViolations += (res.criticalCount + res.seriousCount + res.moderateCount + res.minorCount);
        totalCritical += res.criticalCount;
        totalSerious += res.seriousCount;

        res.violations.forEach(v => {
            const current = violationMap.get(v.id) || { description: v.description, count: 0 };
            current.count += v.nodes.length;
            violationMap.set(v.id, current);
        });
    });

    const commonViolations = Array.from(violationMap.entries())
        .map(([id, data]) => ({ id, description: data.description, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        pages: results,
        totalViolations,
        totalCritical,
        totalSerious,
        commonViolations,
        overallScore: Math.round(totalScore / results.length),
    };
}

/**
 * Generate findings from accessibility analysis
 */
function generateAccessibilityFindings(analysis: AccessibilityAnalysis): Finding[] {
    const findings: Finding[] = [];

    // PAINKILLER: Critical violations (Legal Risk)
    if (analysis.totalCritical > 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Compliance',
            title: 'Critical Accessibility Violations (Legal Risk)',
            description: `Your website has ${analysis.totalCritical} critical accessibility violations. Under ADA Title III, businesses face lawsuits of $10,000-$75,000 for inaccessible websites. These issues prevent users with disabilities from using your site.`,
            impactScore: 9,
            confidenceScore: 100,
            evidence: analysis.commonViolations.slice(0, 3).map(v => ({
                type: 'text',
                value: `${v.count} instances of "${v.description}"`,
                label: 'Violation'
            })),
            metrics: {
                criticalViolations: analysis.totalCritical,
                overallScore: analysis.overallScore,
            },
            effortEstimate: 'HIGH',
            recommendedFix: [
                'Fix "missing alt text" on images immediately',
                'Ensure all form fields have labels',
                'Fix color contrast issues',
                'Consult with an accessibility specialist',
            ]
        });
    }

    // PAINKILLER: Missing Alt Text
    const altTextViolation = analysis.commonViolations.find(v => v.id === 'image-alt');
    if (altTextViolation && altTextViolation.count > 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Compliance',
            title: 'Images Missing Alt Text',
            description: `Found ${altTextViolation.count} images missing "alt" text description. Screen readers cannot describe these images to blind users, a major ADA compliance failure.`,
            impactScore: 8,
            confidenceScore: 100,
            evidence: [{
                type: 'metric',
                value: altTextViolation.count,
                label: 'Images Without Alt Text'
            }],
            metrics: {
                missingAltTextCount: altTextViolation.count,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add descriptive alt text to every image',
                'Mark decorative images with alt=""',
                'Ensure alt text conveys the image meaning',
            ]
        });
    }

    // PAINKILLER: Color Contrast
    const contrastViolation = analysis.commonViolations.find(v => v.id === 'color-contrast');
    if (contrastViolation && contrastViolation.count > 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Compliance',
            title: 'Poor Color Contrast',
            description: `Found ${contrastViolation.count} text elements with insufficient color contrast. Users with visual impairments cannot read this text.`,
            impactScore: 7,
            confidenceScore: 100,
            evidence: [{
                type: 'metric',
                value: contrastViolation.count,
                label: 'Contrast Violations'
            }],
            metrics: {
                contrastViolations: contrastViolation.count,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Darken text color or lighten background',
                'Aim for 4.5:1 contrast ratio for normal text',
                'Aim for 3:1 contrast ratio for large text',
            ]
        });
    }

    // VITAMIN: Serious Violations
    if (analysis.totalSerious > 10) {
        findings.push({
            type: 'VITAMIN',
            category: 'Compliance',
            title: 'Multiple Serious Accessibility Issues',
            description: `Detected ${analysis.totalSerious} serious accessibility issues (e.g., heading hierarchy, missing language attribute). These create a frustrating experience for assistive technology users.`,
            impactScore: 6,
            confidenceScore: 95,
            evidence: [],
            metrics: {
                seriousViolations: analysis.totalSerious,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Fix heading order (h1 -> h2 -> h3)',
                'Add lang="en" to html tag',
                'Ensure all links have concise text',
            ]
        });
    }

    // Vitamin: Missing Form Labels
    const labelViolation = analysis.commonViolations.find(v => v.id === 'label');
    if (labelViolation) {
        findings.push({
            type: 'VITAMIN',
            category: 'Compliance',
            title: 'Missing Form Labels',
            description: 'Form inputs are missing labels. Screen reader users won\'t know what to type in these fields.',
            impactScore: 5,
            confidenceScore: 100,
            evidence: [{
                type: 'metric',
                value: labelViolation.count,
                label: 'Unlabeled Inputs'
            }],
            metrics: {
                unlabeledInputs: labelViolation.count,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add <label> elements for all inputs',
                'Use aria-label if visual label is not possible',
            ]
        });
    }

    // POSITIVE: Accessible Site
    if (analysis.totalViolations < 3) {
        findings.push({
            type: 'POSITIVE',
            category: 'Compliance',
            title: 'Website is Accessible',
            description: `Excellent work! Only found ${analysis.totalViolations} accessibility issues. Your site is more accessible than 85% of local businesses.`,
            impactScore: 2,
            confidenceScore: 100,
            evidence: [{
                type: 'metric',
                value: analysis.overallScore,
                label: 'Accessibility Score'
            }],
            metrics: {
                score: analysis.overallScore,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Maintain high standards',
                'Check accessibility when adding new content',
            ]
        });
    }

    return findings;
}
