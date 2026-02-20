import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { Storage } from '@google-cloud/storage';
import { logger } from '@/lib/logger';
import sharp from 'sharp';

const storage = new Storage();
const BUCKET_NAME = 'proposal-engine-assets';
const SCREENSHOT_TIMEOUT = 20000; // 20 seconds total budget
const MAX_PARALLEL = 3; // Capture 3 screenshots at a time max

export interface ScreenshotOptions {
    url: string;
    name: string;
    device?: 'desktop' | 'mobile';
    annotate?: boolean;
    annotationConfig?: AnnotationConfig;
}

export interface AnnotationConfig {
    highlightMissingAlt?: boolean;
    highlightMissingH1?: boolean;
    highlightNoCTA?: boolean;
}

export interface ScreenshotResult {
    name: string;
    url: string;
    thumbnailUrl: string;
    annotatedUrl?: string;
    width: number;
    height: number;
    device: 'desktop' | 'mobile';
    capturedAt: Date;
    base64?: string;
    mimeType?: string;
}

interface ScreenshotTask {
    options: ScreenshotOptions;
    auditId: string;
}

/**
 * Get Puppeteer browser instance (reusable)
 */
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    logger.info('Launching Puppeteer browser');

    const isLocal = process.env.NODE_ENV === 'development';

    if (isLocal) {
        // Local development - use system Chrome
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    } else {
        // Production - use Chromium from @sparticuz/chromium
        browserInstance = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
            executablePath: await chromium.executablePath(),
            headless: true,
        });
    }

    return browserInstance;
}

/**
 * Close the browser instance
 */
export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        logger.info('Puppeteer browser closed');
    }
}

/**
 * Inject CSS to highlight issues on the page
 */
async function injectAnnotations(page: Page, config: AnnotationConfig): Promise<void> {
    await page.evaluate((cfg) => {
        const style = document.createElement('style');
        style.textContent = `
            /* Annotation styles */
            ._screenshot-annotation-missing-alt {
                outline: 3px solid #ff0000 !important;
                outline-offset: 2px !important;
            }
            ._screenshot-annotation-missing-h1 {
                outline: 3px solid #ffaa00 !important;
                outline-offset: 2px !important;
                position: relative !important;
            }
            ._screenshot-annotation-missing-h1::before {
                content: "Missing H1" !important;
                position: absolute !important;
                top: -25px !important;
                left: 0 !important;
                background: #ffaa00 !important;
                color: #000 !important;
                padding: 4px 8px !important;
                font-size: 12px !important;
                font-weight: bold !important;
                z-index: 99999 !important;
            }
            ._screenshot-annotation-no-cta {
                outline: 3px dashed #ff6600 !important;
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);

        // Highlight images missing alt text
        if (cfg.highlightMissingAlt) {
            const images = document.querySelectorAll('img');
            images.forEach(img => {
                if (!img.getAttribute('alt') || img.getAttribute('alt')?.trim() === '') {
                    img.classList.add('_screenshot-annotation-missing-alt');
                }
            });
        }

        // Highlight if no H1
        if (cfg.highlightMissingH1) {
            const h1s = document.querySelectorAll('h1');
            if (h1s.length === 0) {
                const header = document.querySelector('header') || document.body;
                header?.classList.add('_screenshot-annotation-missing-h1');
            }
        }

        // Highlight above-the-fold with no CTA
        if (cfg.highlightNoCTA) {
            const foldHeight = window.innerHeight;
            const buttons = Array.from(document.querySelectorAll('button, a[href*="contact"], a[href*="signup"], a[href*="get-started"], [class*="cta"], [class*="btn"]'));

            const hasAboveFoldCTA = buttons.some(btn => {
                const rect = btn.getBoundingClientRect();
                return rect.top >= 0 && rect.top < foldHeight;
            });

            if (!hasAboveFoldCTA) {
                const aboveFold = document.createElement('div');
                aboveFold.className = '_screenshot-annotation-no-cta';
                aboveFold.style.cssText = `
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    height: ${foldHeight}px !important;
                    pointer-events: none !important;
                    z-index: 99998 !important;
                `;
                document.body.appendChild(aboveFold);
            }
        }
    }, config);
}

/**
 * Capture a single screenshot
 */
async function captureScreenshot(
    browser: Browser,
    options: ScreenshotOptions,
    auditId: string
): Promise<ScreenshotResult | null> {
    const page = await browser.newPage();

    try {
        // Set viewport based on device
        const viewport = options.device === 'mobile'
            ? { width: 375, height: 812, isMobile: true, hasTouch: true }
            : { width: 1440, height: 900 };

        await page.setViewport(viewport);

        // Navigate to page
        logger.info({ url: options.url, device: options.device }, 'Capturing screenshot');
        await page.goto(options.url, {
            waitUntil: 'networkidle2',
            timeout: 10000,
        });

        // Wait a moment for any animations
        await new Promise(r => setTimeout(r, 1000));

        // Capture main screenshot
        const screenshotData = await page.screenshot({
            type: 'png',
            fullPage: false, // Above the fold only
        });
        const screenshotBuffer = Buffer.isBuffer(screenshotData) ? screenshotData : Buffer.from(screenshotData);

        // Upload to GCS
        const mainFileName = `screenshots/${auditId}/${options.name}.png`;
        const mainUrl = await uploadToGCS(screenshotBuffer, mainFileName);

        // Generate thumbnail (400px wide)
        const thumbnailBuffer = await sharp(screenshotBuffer)
            .resize(400, null, { withoutEnlargement: true })
            .png()
            .toBuffer();

        const thumbnailFileName = `screenshots/${auditId}/${options.name}-thumb.png`;
        const thumbnailUrl = await uploadToGCS(thumbnailBuffer, thumbnailFileName);

        let annotatedUrl: string | undefined;

        // Capture annotated version if requested
        if (options.annotate && options.annotationConfig) {
            await injectAnnotations(page, options.annotationConfig);
            await new Promise(r => setTimeout(r, 500)); // Let styles apply

            const annotatedData = await page.screenshot({
                type: 'png',
                fullPage: false,
            });
            const annotatedBuffer = Buffer.isBuffer(annotatedData) ? annotatedData : Buffer.from(annotatedData);

            const annotatedFileName = `screenshots/${auditId}/${options.name}-annotated.png`;
            annotatedUrl = await uploadToGCS(annotatedBuffer, annotatedFileName);
        }

        logger.info({ name: options.name, url: mainUrl }, 'Screenshot captured and uploaded');

        return {
            name: options.name,
            url: mainUrl,
            thumbnailUrl,
            annotatedUrl,
            width: viewport.width,
            height: viewport.height,
            device: options.device || 'desktop',
            capturedAt: new Date(),
            base64: screenshotBuffer.toString('base64'),
            mimeType: 'image/png'
        };

    } catch (error) {
        logger.error({ error, url: options.url, name: options.name }, 'Screenshot capture failed');
        return null;
    } finally {
        await page.close();
    }
}

/**
 * Upload buffer to Google Cloud Storage
 */
async function uploadToGCS(buffer: Buffer, fileName: string): Promise<string> {
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(fileName);

    await file.save(buffer, {
        metadata: {
            contentType: 'image/png',
            cacheControl: 'public, max-age=31536000', // 1 year
        },
    });

    // Make publicly readable
    await file.makePublic();

    return `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`;
}

/**
 * Capture multiple screenshots in parallel (with concurrency limit)
 */
export async function captureScreenshots(
    tasks: ScreenshotTask[]
): Promise<ScreenshotResult[]> {
    if (tasks.length === 0) return [];

    const browser = await getBrowser();
    const results: ScreenshotResult[] = [];

    // Process in batches of MAX_PARALLEL
    for (let i = 0; i < tasks.length; i += MAX_PARALLEL) {
        const batch = tasks.slice(i, i + MAX_PARALLEL);

        const batchResults = await Promise.all(
            batch.map(task =>
                captureScreenshot(browser, task.options, task.auditId)
            )
        );

        results.push(...batchResults.filter((r): r is ScreenshotResult => r !== null));
    }

    logger.info({ total: tasks.length, successful: results.length }, 'Screenshot batch complete');

    return results;
}

/**
 * Create side-by-side comparison screenshot
 */
export async function captureComparisonScreenshot(
    leftUrl: string,
    rightUrl: string,
    auditId: string,
    name: string,
    device: 'desktop' | 'mobile' = 'desktop'
): Promise<ScreenshotResult | null> {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        const viewport = device === 'mobile'
            ? { width: 375, height: 812 }
            : { width: 1440, height: 900 };

        await page.setViewport(viewport);

        // Capture left side
        await page.goto(leftUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        await new Promise(r => setTimeout(r, 500));
        const leftData = await page.screenshot({ type: 'png', fullPage: false });
        const leftBuffer = Buffer.isBuffer(leftData) ? leftData : Buffer.from(leftData);

        // Capture right side
        await page.goto(rightUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        await new Promise(r => setTimeout(r, 500));
        const rightData = await page.screenshot({ type: 'png', fullPage: false });
        const rightBuffer = Buffer.isBuffer(rightData) ? rightData : Buffer.from(rightData);

        // Combine side by side using sharp
        const left = sharp(leftBuffer);
        const right = sharp(rightBuffer);

        const leftMeta = await left.metadata();
        const rightMeta = await right.metadata();

        const height = Math.max(leftMeta.height || 0, rightMeta.height || 0);
        const width = (leftMeta.width || 0) + (rightMeta.width || 0);

        const combined = await sharp({
            create: {
                width,
                height,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
            .composite([
                { input: await left.toBuffer(), top: 0, left: 0 },
                { input: await right.toBuffer(), top: 0, left: leftMeta.width || 0 }
            ])
            .png()
            .toBuffer();

        // Upload comparison
        const fileName = `screenshots/${auditId}/${name}-comparison.png`;
        const url = await uploadToGCS(combined, fileName);

        // Generate thumbnail
        const thumbnailBuffer = await sharp(combined)
            .resize(800, null, { withoutEnlargement: true })
            .png()
            .toBuffer();

        const thumbnailFileName = `screenshots/${auditId}/${name}-comparison-thumb.png`;
        const thumbnailUrl = await uploadToGCS(thumbnailBuffer, thumbnailFileName);

        logger.info({ name, url }, 'Comparison screenshot created');

        return {
            name: `${name}-comparison`,
            url,
            thumbnailUrl,
            width,
            height,
            device,
            capturedAt: new Date(),
            base64: combined.toString('base64'),
            mimeType: 'image/png'
        };

    } catch (error) {
        logger.error({ error, leftUrl, rightUrl }, 'Comparison screenshot failed');
        return null;
    } finally {
        await page.close();
    }
}

/**
 * Capture Google Business Profile screenshot
 */
export async function captureGBPScreenshot(
    businessName: string,
    city: string,
    auditId: string
): Promise<ScreenshotResult | null> {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setViewport({ width: 1440, height: 900 });

        // Search for business on Google Maps
        const searchQuery = encodeURIComponent(`${businessName} ${city}`);
        const mapsUrl = `https://www.google.com/maps/search/${searchQuery}`;

        logger.info({ businessName, city, mapsUrl }, 'Capturing GBP screenshot');

        await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 15000 });

        // Wait for map to load
        await new Promise(r => setTimeout(r, 3000));

        // Try to click on the first result to show details
        try {
            await page.waitForSelector('[role="article"]', { timeout: 2000 });
            await page.click('[role="article"]');
            await new Promise(r => setTimeout(r, 2000));
        } catch {
            // If clicking fails, just proceed with map view
        }

        const screenshotData = await page.screenshot({ type: 'png', fullPage: false });
        const screenshotBuffer = Buffer.isBuffer(screenshotData) ? screenshotData : Buffer.from(screenshotData);

        // Upload
        const fileName = `screenshots/${auditId}/gbp-listing.png`;
        const url = await uploadToGCS(screenshotBuffer, fileName);

        // Thumbnail
        const thumbnailBuffer = await sharp(screenshotBuffer)
            .resize(400, null)
            .png()
            .toBuffer();

        const thumbnailFileName = `screenshots/${auditId}/gbp-listing-thumb.png`;
        const thumbnailUrl = await uploadToGCS(thumbnailBuffer, thumbnailFileName);

        logger.info({ url }, 'GBP screenshot captured');

        return {
            name: 'gbp-listing',
            url,
            thumbnailUrl,
            width: 1440,
            height: 900,
            device: 'desktop',
            capturedAt: new Date(),
            base64: screenshotBuffer.toString('base64'),
            mimeType: 'image/png'
        };

    } catch (error) {
        logger.error({ error, businessName, city }, 'GBP screenshot failed');
        return null;
    } finally {
        await page.close();
    }
}
