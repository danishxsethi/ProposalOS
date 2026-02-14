import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { BRANDING } from '@/lib/config/branding';

/**
 * Generate a PDF from a proposal web page using Puppeteer (Serverless optimized)
 * @param token - The proposal web link token
 * @param baseUrl - Base URL of the application
 * @returns PDF as Buffer
 */
export async function generatePdf(
    token: string,
    baseUrl: string = process.env.BASE_URL || 'http://localhost:3000'
): Promise<Buffer> {
    let browser;

    try {
        // Prefer local Chrome on macOS/development (sparticuz binary can cause ENOEXEC on Mac)
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

        // Fallback: sparticuz (for Lambda/serverless environments)
        if (!executablePath) {
            try {
                executablePath = await chromium.executablePath();
            } catch {
                // Ignore - use local paths only
            }
        }

        if (!executablePath) {
            throw new Error('Chromium not found. Install Chrome or set CHROME_EXECUTABLE_PATH.');
        }

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
            executablePath,
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        // Navigate to proposal page
        const url = `${baseUrl}/proposal/${token}`;
        console.log(`Generating PDF for: ${url}`);

        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 30000,
        });

        // Wait for content to render (look for main which contains the content)
        // ProposalPage uses <main> tag now
        await page.waitForSelector('main', { timeout: 30000 });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true, // Requested: landscape
            printBackground: true, // Requested: true (for dark theme)
            margin: {
                top: '0.5in',
                right: '0.5in',
                bottom: '0.5in',
                left: '0.5in',
            },
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding-top: 5px;">
                    ${BRANDING.name}
                </div>
            `,
            footerTemplate: `
                <div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding-bottom: 5px;">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
            `,
            preferCSSPageSize: false,
        });

        return Buffer.from(pdfBuffer);
    } catch (error) {
        console.error('PDF generation error:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
