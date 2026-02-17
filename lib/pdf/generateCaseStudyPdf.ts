import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { BRANDING } from '@/lib/config/branding';

/**
 * Generate a case study PDF from the case study template page.
 * Navigates to /case-study/[auditId]/pdf and captures as PDF.
 */
export async function generateCaseStudyPdf(
    auditId: string,
    baseUrl: string = process.env.BASE_URL || 'http://localhost:3000',
    businessName?: string
): Promise<Buffer> {
    let browser;

    try {
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

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
            executablePath,
            headless: true,
            ignoreHTTPSErrors: true,
        } as Parameters<typeof puppeteer.launch>[0]);

        const page = await browser.newPage();
        const url = `${baseUrl}/case-study/${auditId}/pdf`;

        await page.goto(url, { waitUntil: 'load', timeout: 45000 });
        await new Promise((r) => setTimeout(r, 2000));

        const selector = '[data-pdf-ready], .pdf-root, main';
        try {
            await page.waitForSelector(selector, { timeout: 10000 });
        } catch {
            const hasBody = await page.$('body');
            if (!hasBody) throw new Error('Case study page failed to render');
        }

        const footerLeft = 'Case Study | Confidential';
        const footerCenter = 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>';
        const contactEmail = process.env.BRAND_CONTACT_EMAIL || BRANDING.contact?.email;
        const footerRight = contactEmail ? `Questions? ${contactEmail}` : 'proposalengine.com';

        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: false,
            printBackground: true,
            margin: { top: '2.5cm', right: '2cm', bottom: '2.5cm', left: '2cm' },
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
    } finally {
        if (browser) await browser.close();
    }
}
