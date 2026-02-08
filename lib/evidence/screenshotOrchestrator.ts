import { logger } from '@/lib/logger';
import {
    captureScreenshots,
    captureComparisonScreenshot,
    captureGBPScreenshot,
    closeBrowser,
    ScreenshotResult,
    ScreenshotOptions,
} from './screenshotCapture';
import { CrawlResult } from '@/lib/modules/websiteCrawler';

export interface ScreenshotOrchestrationInput {
    auditId: string;
    businessUrl: string;
    businessName: string;
    city?: string;
    crawlResult?: CrawlResult;
    competitorUrls?: string[];
}

export interface ScreenshotEvidence {
    homepage: {
        desktop?: ScreenshotResult;
        mobile?: ScreenshotResult;
        desktopAnnotated?: ScreenshotResult;
    };
    gbp?: ScreenshotResult;
    competitors?: ScreenshotResult[];
    competitorComparisons?: ScreenshotResult[];
    brokenPages?: ScreenshotResult[];
    allScreenshots: ScreenshotResult[];
}

/**
 * Orchestrate all screenshot capture for an audit
 */
export async function orchestrateScreenshots(
    input: ScreenshotOrchestrationInput
): Promise<ScreenshotEvidence> {
    logger.info({ auditId: input.auditId }, '[Screenshot] Starting screenshot orchestration');

    const evidence: ScreenshotEvidence = {
        homepage: {},
        allScreenshots: [],
    };

    const tasks: Array<{ options: ScreenshotOptions; auditId: string }> = [];

    try {
        // 1. Homepage screenshots (desktop + mobile)
        tasks.push({
            auditId: input.auditId,
            options: {
                url: input.businessUrl,
                name: 'homepage-desktop',
                device: 'desktop',
            },
        });

        tasks.push({
            auditId: input.auditId,
            options: {
                url: input.businessUrl,
                name: 'homepage-mobile',
                device: 'mobile',
            },
        });

        // 2. Annotated homepage (desktop only) - highlight issues
        const hasIssues = input.crawlResult && (
            input.crawlResult.crawledPages.some(p => {
                const homepage = input.crawlResult?.crawledPages.find(page => page.url === input.businessUrl);
                return homepage && (
                    homepage.h1Count === 0 ||
                    (homepage.imageCount > 0 && (homepage.imagesWithAlt / homepage.imageCount) < 0.7)
                );
            })
        );

        if (hasIssues) {
            const homepageCrawl = input.crawlResult?.crawledPages.find(p => p.url === input.businessUrl);

            tasks.push({
                auditId: input.auditId,
                options: {
                    url: input.businessUrl,
                    name: 'homepage-desktop-annotated',
                    device: 'desktop',
                    annotate: true,
                    annotationConfig: {
                        highlightMissingAlt: homepageCrawl && homepageCrawl.imageCount > 0 &&
                            (homepageCrawl.imagesWithAlt / homepageCrawl.imageCount) < 0.7,
                        highlightMissingH1: homepageCrawl?.h1Count === 0,
                        highlightNoCTA: true, // Always check for CTA
                    },
                },
            });
        }

        // 3. Broken pages (404s) from crawl result - capture first 3
        if (input.crawlResult) {
            const brokenPages = input.crawlResult.brokenLinks.slice(0, 3);
            brokenPages.forEach((url, index) => {
                tasks.push({
                    auditId: input.auditId,
                    options: {
                        url,
                        name: `broken-page-${index + 1}`,
                        device: 'desktop',
                    },
                });
            });
        }

        // 4. Competitor screenshots (first 3, desktop only)
        if (input.competitorUrls && input.competitorUrls.length > 0) {
            const topCompetitors = input.competitorUrls.slice(0, 3);
            topCompetitors.forEach((url, index) => {
                tasks.push({
                    auditId: input.auditId,
                    options: {
                        url,
                        name: `competitor-${index + 1}`,
                        device: 'desktop',
                    },
                });
            });
        }

        // Capture all screenshots in parallel batches
        const results = await captureScreenshots(tasks);
        evidence.allScreenshots = results;

        // Organize results
        evidence.homepage.desktop = results.find(r => r.name === 'homepage-desktop');
        evidence.homepage.mobile = results.find(r => r.name === 'homepage-mobile');
        evidence.homepage.desktopAnnotated = results.find(r => r.name === 'homepage-desktop-annotated');

        evidence.brokenPages = results.filter(r => r.name.startsWith('broken-page'));
        evidence.competitors = results.filter(r => r.name.startsWith('competitor-'));

        // 5. GBP screenshot (if city provided)
        if (input.city) {
            const gbpResult = await captureGBPScreenshot(
                input.businessName,
                input.city,
                input.auditId
            );
            if (gbpResult) {
                evidence.gbp = gbpResult;
                evidence.allScreenshots.push(gbpResult);
            }
        }

        // 6. Competitor comparisons (side-by-side)
        if (evidence.homepage.desktop && evidence.competitors.length > 0) {
            evidence.competitorComparisons = [];

            for (let i = 0; i < Math.min(evidence.competitors.length, 2); i++) {
                const competitor = evidence.competitors[i];
                const competitorUrl = input.competitorUrls![i];

                const comparisonResult = await captureComparisonScreenshot(
                    input.businessUrl,
                    competitorUrl,
                    input.auditId,
                    `vs-competitor-${i + 1}`,
                    'desktop'
                );

                if (comparisonResult) {
                    evidence.competitorComparisons.push(comparisonResult);
                    evidence.allScreenshots.push(comparisonResult);
                }
            }

            // Mobile comparison with top competitor
            if (evidence.homepage.mobile && input.competitorUrls.length > 0) {
                const mobileComparison = await captureComparisonScreenshot(
                    input.businessUrl,
                    input.competitorUrls[0],
                    input.auditId,
                    'vs-competitor-mobile',
                    'mobile'
                );

                if (mobileComparison) {
                    evidence.competitorComparisons.push(mobileComparison);
                    evidence.allScreenshots.push(mobileComparison);
                }
            }
        }

        logger.info({
            auditId: input.auditId,
            totalScreenshots: evidence.allScreenshots.length,
            homepage: !!evidence.homepage.desktop,
            gbp: !!evidence.gbp,
            competitors: evidence.competitors?.length || 0,
            comparisons: evidence.competitorComparisons?.length || 0,
        }, '[Screenshot] Orchestration complete');

        return evidence;

    } catch (error) {
        logger.error({ error, auditId: input.auditId }, '[Screenshot] Orchestration failed');
        return evidence;
    } finally {
        // Close browser to free resources
        await closeBrowser();
    }
}

/**
 * Helper: Add screenshot URLs to finding evidence
 */
export function attachScreenshotsToFinding(
    finding: any,
    screenshots: ScreenshotResult[]
): any {
    // Match screenshots to finding based on category/type
    const relevantScreenshots: any[] = [];

    if (finding.category === 'Performance' || finding.category === 'On-Page SEO') {
        // Use homepage screenshots
        const homepageScreenshot = screenshots.find(s => s.name === 'homepage-desktop');
        if (homepageScreenshot) {
            relevantScreenshots.push({
                type: 'image',
                value: homepageScreenshot.url,
                label: 'Homepage Screenshot',
                thumbnailUrl: homepageScreenshot.thumbnailUrl,
            });
        }

        // If annotated version exists, prefer it
        const annotated = screenshots.find(s => s.name === 'homepage-desktop-annotated');
        if (annotated) {
            relevantScreenshots.push({
                type: 'image',
                value: annotated.url,
                label: 'Issues Highlighted',
                thumbnailUrl: annotated.thumbnailUrl,
            });
        }
    }

    if (finding.title.includes('404') || finding.title.includes('Broken')) {
        // Add broken page screenshots
        const brokenScreenshots = screenshots.filter(s => s.name.startsWith('broken-page'));
        brokenScreenshots.forEach((s, i) => {
            relevantScreenshots.push({
                type: 'image',
                value: s.url,
                label: `Broken Page ${i + 1}`,
                thumbnailUrl: s.thumbnailUrl,
            });
        });
    }

    if (finding.category === 'Competitor Analysis') {
        // Add competitor comparison screenshots
        const comparisons = screenshots.filter(s => s.name.includes('comparison'));
        comparisons.forEach((s, i) => {
            relevantScreenshots.push({
                type: 'image',
                value: s.url,
                label: `Business vs Competitor ${i + 1}`,
                thumbnailUrl: s.thumbnailUrl,
            });
        });
    }

    // Append to existing evidence
    return {
        ...finding,
        evidence: [...(finding.evidence || []), ...relevantScreenshots],
    };
}
