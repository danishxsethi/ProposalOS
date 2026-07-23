import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { BRANDING } from '@/lib/config/branding';

export type PdfFormat = 'A4' | 'Letter';

/**
 * Generate a PDF from the premium PDF template using Puppeteer
 * @param token - The proposal web link token
 * @param baseUrl - Base URL of the application
 * @param businessName - Optional, for footer "Prepared for [Business Name]"
 * @param format - Page size: A4 (210×297mm) or Letter (215.9×279.4mm)
 * @returns PDF as Buffer
 */
export async function generatePdf(
    token: string,
    baseUrl: string = process.env.BASE_URL || 'http://localhost:3000',
    businessName?: string,
    format: PdfFormat = 'A4'
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
        } as Parameters<typeof puppeteer.launch>[0]);

        const page = await browser.newPage();

        // Navigate to PDF template page (premium agency design)
        const url = `${baseUrl}/proposal/${token}/pdf`;
        console.log(`Generating PDF for: ${url}`);

        // Use 'load' instead of 'networkidle0' — networkidle0 often never fires on SPAs
        await page.goto(url, {
            waitUntil: 'load',
            timeout: 45000,
        });

        // Allow React to hydrate
        await new Promise(r => setTimeout(r, 2000));

        // Wait for PDF template (pdf-root or data-pdf-ready)
        const selector = '[data-pdf-ready], .pdf-root, main';
        try {
            await page.waitForSelector(selector, { timeout: 10000 });
        } catch {
            const hasBody = await page.$('body');
            if (!hasBody) throw new Error('Page failed to render');
        }

        // Generate PDF — A4 portrait, premium margins (min 19mm), professional footer
        const safeName = businessName
            ? String(businessName)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
            : '';
        const footerLeft = 'Proposal Engine | Confidential';
        const footerCenter = 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>';
        const contactEmail = process.env.BRAND_CONTACT_EMAIL || BRANDING.contact?.email;
        const footerRight = contactEmail ? `Questions? ${contactEmail}` : 'proposalengine.com';

        const pdfBuffer = await page.pdf({
            format: format === 'Letter' ? 'Letter' : 'A4',
            landscape: false,
            printBackground: true,
            margin: {
                top: '2.5cm',
                right: '2cm',
                bottom: '2.5cm',
                left: '2cm',
            },
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="font-size: 9px; color: #6c757d; width: 100%; padding: 8px 2cm 0; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;">
                    <span>${footerLeft}</span>
                    <span>${footerCenter}</span>
                    <span>${footerRight}</span>
                </div>
            `,
            preferCSSPageSize: true,
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
