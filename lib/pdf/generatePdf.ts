import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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
        // Configure Chromium for serverless
        // Use local Chrome in development if available
        let executablePath = await chromium.executablePath();

        if (process.env.NODE_ENV === 'development') {
            // Fallback for local mac dev if sparticuz doesn't find it
            // puppeteer-core needs an executable. 
            // Common paths:
            const fs = require('fs');
            const localPaths = [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser'
            ];

            // If sparticuz returns valid path use it, otherwise check local
            if (!executablePath) {
                for (const path of localPaths) {
                    if (fs.existsSync(path)) {
                        executablePath = path;
                        break;
                    }
                }
            }
        }

        if (!executablePath) {
            throw new Error('Chromium executable not found. Please set CHROME_EXECUTABLE_PATH or install Chrome.');
        }

        browser = await puppeteer.launch({
            args: (chromium as any).args,
            defaultViewport: (chromium as any).defaultViewport,
            executablePath: executablePath,
            headless: (chromium as any).headless,
            ignoreHTTPSErrors: true,
        } as any);

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
                    ProposalOS
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
