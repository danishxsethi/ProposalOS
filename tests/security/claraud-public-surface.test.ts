import { readFileSync } from 'node:fs';
import path from 'node:path';

import { GET as testEmail } from '../../claraud-web/src/app/api/test-email/route';
import { POST as captureLead } from '../../claraud-web/src/app/api/lead/route';
import { POST as startScan } from '../../claraud-web/src/app/api/scan/route';

const readClaraudSource = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), 'claraud-web', 'src', relativePath), 'utf8');

describe('Claraud public surfaces fail closed', () => {
  it('does not accept public lead submissions or send email', async () => {
    const response = await captureLead();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('3600');
  });

  it('does not start cost-bearing audits through unauthenticated public intake', async () => {
    const response = await startScan();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.error).toContain('browser network controls');
  });

  it('hides the mock test-email endpoint', async () => {
    const response = await testEmail();

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not submit contact details from the report gate', () => {
    const emailGate = readClaraudSource('components/scan/email-gate.tsx');
    const scanInput = readClaraudSource('components/scan/scan-input.tsx');

    expect(emailGate).not.toContain("fetch('/api/lead'");
    expect(emailGate).toContain('will not collect an email address');
    expect(scanInput).not.toContain("fetch('/api/scan'");
    expect(scanInput).not.toContain('@react-google-maps/api');
    expect(scanInput).toContain('does not collect a URL or start an audit');
  });

  it('does not publish unqualified pricing, customer counts, or scan performance claims', () => {
    const home = readClaraudSource('app/(public)/page.tsx');
    const pricing = readClaraudSource('app/(public)/pricing/page.tsx');
    const hero = readClaraudSource('components/home/hero.tsx');
    const footer = readClaraudSource('components/layout/footer.tsx');
    const blogPosts = [
      readClaraudSource('content/blog/ai-audit-vs-manual-audit.mdx'),
      readClaraudSource('content/blog/why-your-website-is-losing-customers.mdx'),
      readClaraudSource('content/blog/google-business-profile-complete-guide.mdx'),
    ].join('\n');

    expect(home).not.toContain('SocialProof');
    expect(home).not.toContain('PricingPreview');
    expect(home).not.toContain('IndustryVerticals');
    expect(pricing).toContain('not currently accepting paid orders');
    expect(hero).not.toContain('2,800+');
    expect(hero).not.toContain('Apex Dental');
    expect(footer).not.toContain('Encrypted in transit and at rest');
    expect(blogPosts).not.toMatch(/\b53%|\b60%|\b7x|\$3,000|30 seconds|ROI projection/i);
  });

  it('keeps tokenized reports preliminary, unindexed, and free of fabricated comparisons', () => {
    const reportPage = readClaraudSource('app/(public)/report/[token]/page.tsx');
    const reportHeader = readClaraudSource('components/report/report-header.tsx');
    const reportCta = readClaraudSource('components/report/report-cta.tsx');

    expect(reportPage).toContain('index: false, follow: false');
    expect(reportPage).toContain('does not establish lost revenue');
    expect(reportPage).not.toContain('reviewCount: 41');
    expect(reportPage).not.toContain('pageSpeed: 62');
    expect(reportHeader).toContain('PDF download unavailable');
    expect(reportHeader).not.toContain("captureEvent('share_clicked', { platform: 'copy', token })");
    expect(reportHeader).not.toContain("captureEvent('pdf_downloaded', { token })");
    expect(reportCta).not.toMatch(/projected ROI|leapfrog your competitors/i);
  });
});
