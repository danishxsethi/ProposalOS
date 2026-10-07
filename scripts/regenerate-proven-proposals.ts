import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PdfTemplate from '../components/PdfTemplate';
import { generatePdfFromHtml } from '../lib/pdf/generatePdf';

const PROVEN_PROPOSALS = [
  {
    id: 'e943703e-5902-426e-824e-82219d0da230',
    webLinkToken: 'f9df6fcc-8017-41ac-9786-6d2f5132c9b5',
    createdAt: new Date('2026-09-04T02:58:32.563Z'),
    pricing: { essentials: 797, growth: 2497, premium: 4997 },
    audit: {
      businessName: 'Park 56 Dental',
      businessCity: 'New York',
      businessIndustry: 'dental',
      overallScore: 68,
      findings: [
        {
          id: 'f-p56-1',
          type: 'PAINKILLER',
          impactScore: 10,
          title: 'Competitors have 342 more reviews on average',
          description:
            'Pearl Dental NYC (5.0★) and Sky Dental (2,700 reviews) dominate the local map pack in Midtown Manhattan, pulling an estimated $3,200/mo in high-value cosmetic and restorative appointments.',
          evidence: ['Local search analysis: Park 56 Dental (995 reviews) vs Sky Dental (2,700 reviews).'],
          recommendedFix: 'Deploy an automated review acceleration protocol to systematically solicit patient reviews post-appointment.',
        },
        {
          id: 'f-p56-2',
          type: 'PAINKILLER',
          impactScore: 9,
          title: 'No LocalBusiness or Organization schema',
          description:
            'Search engines cannot read hours, practice address, accepted insurances, or emergency availability in machine-readable JSON-LD format.',
          evidence: ['0 structured data entities found matching Schema.org/Dentist or Schema.org/LocalBusiness.'],
          recommendedFix: 'Deploy comprehensive JSON-LD Dentist and MedicalBusiness schema with explicit service catalog.',
        },
        {
          id: 'f-p56-3',
          type: 'VITAMIN',
          impactScore: 8,
          title: 'No review or aggregate rating schema',
          description:
            'Google search result snippets lack golden review stars because AggregateRating markup is absent from the page header.',
          evidence: ['Missing AggregateRating markup on homepage and key service landing pages.'],
          recommendedFix: 'Implement Schema.org/AggregateRating referencing verified Google Business Profile score (4.9★).',
        },
        {
          id: 'f-p56-4',
          type: 'VITAMIN',
          impactScore: 7,
          title: 'Missing or truncated meta descriptions',
          description:
            'Search engine result previews show truncated or auto-generated body text instead of conversion-focused copy.',
          evidence: ['Meta description missing or short across primary dental service pages.'],
          recommendedFix: 'Deploy optimized meta descriptions (140-155 characters) with clear booking call to action.',
        },
        {
          id: 'f-p56-5',
          type: 'VITAMIN',
          impactScore: 6,
          title: 'No Email Marketing Integration',
          description:
            'Prospective patients visiting after-hours have no automated way to request appointment callbacks or join a practice newsletter.',
          evidence: ['No automated patient email capture flow detected on primary landing page.'],
          recommendedFix: 'Embed an instant appointment request capture form with automated SMS/email confirmation.',
        },
      ],
    },
    comparisonReport: {
      prospectRank: 2,
      totalCompetitors: 4,
      summaryStatement: 'You rank #2 out of 4 dental practices in your area. Competitors lead on reviews and schema.',
      competitors: [
        { name: 'Pearl Dental NYC', rating: 5.0, reviews: 478 },
        { name: 'Sky Dental', rating: 4.9, reviews: 2700 },
        { name: 'Tend Dental Wall Street', rating: 4.4, reviews: 834 },
      ],
    },
    outputFilename: 'park56_dental_proposal.pdf',
    cleanOutputFilename: 'park56_clean.pdf',
  },
  {
    id: '08ab2b5a-2102-4fab-aa4f-c57cf9f1e072',
    webLinkToken: '21b22567-44ca-47d9-8ccc-1151ebf459ef',
    createdAt: new Date('2026-09-04T03:09:13.106Z'),
    pricing: { essentials: 797, growth: 2497, premium: 4997 },
    audit: {
      businessName: "Joe's Pizza",
      businessCity: 'New York',
      businessIndustry: 'restaurant',
      overallScore: 62,
      findings: [
        {
          id: 'f-joe-1',
          type: 'PAINKILLER',
          impactScore: 10,
          title: 'Missing Restaurant and Menu Schema',
          description:
            'Google cannot parse your pizza menu or catering options natively, pushing high-margin catering orders to third-party delivery apps charging 30% commissions—costing ~$2,100/mo.',
          evidence: ['No Schema.org/Restaurant, Menu, or MenuItem markup detected in page source.'],
          recommendedFix: 'Deploy full JSON-LD Restaurant, Menu, and ServesCuisine schema graph.',
        },
        {
          id: 'f-joe-2',
          type: 'PAINKILLER',
          impactScore: 8,
          title: '18 Unresponded Reviews on Google Maps',
          description:
            'Google Maps algorithm penalizes local search rankings when owner review responses fall below 75%. Unmanaged reviews hurt local map pack dominance.',
          evidence: ['18 recent reviews lack owner responses on Google Business Profile.'],
          recommendedFix: 'Implement an automated review monitoring and owner response workflow.',
        },
        {
          id: 'f-joe-3',
          type: 'VITAMIN',
          impactScore: 7,
          title: 'Mobile Page Load Over 4.2 Seconds',
          description:
            'Over 40% of hungry mobile searchers bounce if an online ordering menu takes more than 3 seconds to load.',
          evidence: ['Mobile LCP measured at 4.2s on mobile 4G connection.'],
          recommendedFix: 'Optimize menu asset delivery and compress high-resolution food images to modern WebP format.',
        },
      ],
    },
    comparisonReport: {
      prospectRank: 2,
      totalCompetitors: 3,
      summaryStatement: 'Competitors are capturing direct catering orders through native Google menu indexing.',
      competitors: [
        { name: 'Bleecker Street Pizza', rating: 4.7, reviews: 4200 },
        { name: 'Prince Street Pizza', rating: 4.6, reviews: 6100 },
      ],
    },
    outputFilename: 'joespizza_proposal.pdf',
    cleanOutputFilename: 'joespizza_clean.pdf',
  },
  {
    id: '375e86a7-69a1-43c9-9b2d-edce216bd4a4',
    webLinkToken: 'db30c9e9-a0fd-42dc-9ff7-4c2dd1f7a923',
    createdAt: new Date('2026-09-04T03:13:43.674Z'),
    pricing: { essentials: 397, growth: 1197, premium: 2397 },
    audit: {
      businessName: 'Blink Fitness',
      businessCity: 'New York',
      businessIndustry: 'fitness',
      overallScore: 65,
      findings: [
        {
          id: 'f-blink-1',
          type: 'PAINKILLER',
          impactScore: 9,
          title: 'No Email Marketing Integration for Guest Pass Capture',
          description:
            'Prospective members searching for nearby gym memberships hit dead ends with no automated guest pass or free trial capture—costing ~$1,800/mo in dropped membership dues.',
          evidence: ['No automated lead or guest pass capture modal detected on club location page.'],
          recommendedFix: 'Deploy a high-converting 1-click mobile guest pass capture flow with automated email follow-up.',
        },
        {
          id: 'f-blink-2',
          type: 'VITAMIN',
          impactScore: 8,
          title: 'Missing or Short Meta Title & Description',
          description:
            'Search engine snippets are truncated, reducing organic click-through rates against local competing fitness clubs.',
          evidence: ['Meta title under 30 characters; meta description missing on local club page.'],
          recommendedFix: 'Rewrite meta title and description with local keywords and trial membership incentives.',
        },
        {
          id: 'f-blink-3',
          type: 'VITAMIN',
          impactScore: 7,
          title: 'Mobile LCP Speed Bottleneck (4.8s on 4G)',
          description:
            'Heavy background assets and unoptimized video cause prospective members on mobile phones to abandon before viewing membership rates.',
          evidence: ['Mobile Largest Contentful Paint clocked at 4.8s.'],
          recommendedFix: 'Lazy load video assets and optimize critical CSS for sub-1.5s mobile LCP.',
        },
      ],
    },
    comparisonReport: {
      prospectRank: 3,
      totalCompetitors: 4,
      summaryStatement: 'Competitors out-rank you on mobile search speed and immediate trial capture.',
      competitors: [
        { name: 'Planet Fitness', rating: 4.5, reviews: 1800 },
        { name: 'Crunch Fitness', rating: 4.4, reviews: 1200 },
      ],
    },
    outputFilename: 'blinkfitness_proposal.pdf',
    cleanOutputFilename: 'blinkfitness_clean.pdf',
  },
];

async function main() {
  console.log('🚀 Regenerating 3 Proven Proposals to Elite Conversion Standard...');

  const cssPath = path.join(process.cwd(), 'app/proposal/[token]/pdf/pdf-print.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

  const branding = {
    name: 'Claraud',
    logoUrl: null,
    contact: { website: 'https://claraud.com/book', email: 'audit@claraud.com' },
    colors: { primary: '#4361ee', accent: '#38bdf8' },
  };

  const results: Array<{ name: string; pdfSize: number; outputPath: string }> = [];

  for (const proposal of PROVEN_PROPOSALS) {
    console.log(`\n📄 Processing: ${proposal.audit.businessName} (Token: ${proposal.webLinkToken})...`);

    // Render PdfTemplate component to static HTML
    const templateElement = React.createElement(PdfTemplate as any, { proposal, branding });
    const contentHtml = await (PdfTemplate as any)({ proposal, branding });
    const renderedMarkup = renderToStaticMarkup(contentHtml);

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${proposal.audit.businessName} - Forensic Digital Audit</title>
  <style>
    ${css}
    body { margin: 0; padding: 0; background-color: #ffffff; color: #0f172a; }
  </style>
</head>
<body>
  <div class="pdf-root" data-pdf-ready>
    ${renderedMarkup}
  </div>
</body>
</html>`;

    const pdfBuffer = await generatePdfFromHtml(fullHtml, {
      businessName: proposal.audit.businessName,
      branding,
    });

    // Save to artifacts/proposals/
    const artifactPath = path.join(process.cwd(), 'artifacts/proposals', proposal.outputFilename);
    fs.writeFileSync(artifactPath, pdfBuffer);

    // Also update /tmp/
    const tmpPath = path.join('/tmp', proposal.cleanOutputFilename);
    fs.writeFileSync(tmpPath, pdfBuffer);

    console.log(`   ✅ Saved PDF artifact: ${artifactPath} (${Math.round(pdfBuffer.length / 1024)} KB)`);
    console.log(`   ✅ Updated /tmp clean PDF: ${tmpPath}`);

    results.push({
      name: proposal.audit.businessName,
      pdfSize: pdfBuffer.length,
      outputPath: artifactPath,
    });
  }

  console.log('\n=========================================');
  console.log('🎉 All 3 Proven Proposals Successfully Regenerated:');
  for (const r of results) {
    console.log(` - ${r.name}: ${Math.round(r.pdfSize / 1024)} KB (${r.outputPath})`);
  }
  console.log('=========================================');
}

main().catch((err) => {
  console.error('Fatal error regenerating proposals:', err);
  process.exit(1);
});
