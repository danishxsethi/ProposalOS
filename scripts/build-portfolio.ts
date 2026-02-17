#!/usr/bin/env npx tsx
/**
 * Portfolio Builder: selects the best 5 proposals from the Saskatoon blitz.
 *
 * - Reads blitz-results.json
 * - Sorts by QA score (descending)
 * - Picks top 1 from each of the top 5 verticals (diversity)
 * - Copies PDFs to scripts/output/portfolio/
 * - Generates index.html with preview thumbnails
 *
 * Prerequisites:
 *   - npm run blitz (creates scripts/output/blitz-results.json)
 *
 * Usage:
 *   npm run build-portfolio
 */

import * as fs from 'fs-extra';
import * as path from 'path';

const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'output', 'blitz-results.json');
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'output');
const PORTFOLIO_DIR = path.join(OUTPUT_DIR, 'portfolio');

interface BlitzResult {
  businessName: string;
  vertical: string;
  website: string;
  pass: boolean;
  qaScore?: number;
  pdfPath?: string;
  proposalUrl?: string;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]/gi, '_').replace(/_+/g, '_').slice(0, 80);
}

async function main(): Promise<void> {
  if (!(await fs.pathExists(RESULTS_PATH))) {
    console.error('blitz-results.json not found. Run: npm run blitz');
    process.exit(1);
  }

  const results = (await fs.readJson(RESULTS_PATH)) as BlitzResult[];

  // Filter to passing results with PDFs and QA scores
  const withPdfAndScore = results.filter(
    (r) => r.pass && r.pdfPath && r.qaScore !== undefined
  );
  const exists = await Promise.all(
    withPdfAndScore.map((r) => fs.pathExists(r.pdfPath!))
  );
  const withPdf = withPdfAndScore.filter((_, i) => exists[i]);

  if (withPdf.length === 0) {
    console.error('No passing results with PDFs found in blitz-results.json');
    process.exit(1);
  }

  // Sort by QA score descending
  const sorted = [...withPdf].sort((a, b) => (b.qaScore ?? 0) - (a.qaScore ?? 0));

  // Pick top 1 from each of the top 5 verticals (diversity)
  const seen = new Set<string>();
  const selected: BlitzResult[] = [];
  for (const r of sorted) {
    if (seen.has(r.vertical)) continue;
    seen.add(r.vertical);
    selected.push(r);
    if (selected.length >= 5) break;
  }

  await fs.ensureDir(PORTFOLIO_DIR);

  // Copy PDFs and build HTML entries
  const entries: { businessName: string; vertical: string; qaScore: number; pdfFilename: string }[] = [];

  for (const r of selected) {
    const pdfFilename = `${safeFilename(r.businessName)}.pdf`;
    const destPath = path.join(PORTFOLIO_DIR, pdfFilename);
    await fs.copy(r.pdfPath!, destPath);
    entries.push({
      businessName: r.businessName,
      vertical: r.vertical,
      qaScore: r.qaScore ?? 0,
      pdfFilename,
    });
  }

  // Generate index.html
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portfolio — Top 5 Proposals</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #f5f5f5; }
    h1 { color: #1a1a1a; margin-bottom: 0.5rem; }
    .sub { color: #666; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .card {
      background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex; flex-direction: column;
    }
    .card-preview {
      height: 200px; background: #e8e8e8; display: flex; align-items: center; justify-content: center;
    }
    .card-preview embed { width: 100%; height: 100%; }
    .card-body { padding: 1rem; flex: 1; }
    .card h3 { margin: 0 0 0.25rem; font-size: 1rem; }
    .card .vertical { color: #888; font-size: 0.85rem; text-transform: capitalize; }
    .card .qa { color: #0a0; font-weight: 600; font-size: 0.9rem; margin-top: 0.5rem; }
    .card a {
      display: inline-block; margin-top: 0.75rem; padding: 0.5rem 1rem; background: #e94560; color: white;
      text-decoration: none; border-radius: 6px; font-size: 0.9rem;
    }
    .card a:hover { background: #d63a54; }
  </style>
</head>
<body>
  <h1>Portfolio — Top 5 Proposals</h1>
  <p class="sub">Best proposals from the Saskatoon blitz (one per vertical)</p>
  <div class="grid">
${entries
  .map(
    (e) => `    <div class="card">
      <div class="card-preview">
        <embed src="./${e.pdfFilename}#page=1" type="application/pdf" />
      </div>
      <div class="card-body">
        <h3>${e.businessName}</h3>
        <p class="vertical">${e.vertical}</p>
        <p class="qa">QA Score: ${e.qaScore}/100</p>
        <a href="./${e.pdfFilename}" target="_blank">View PDF</a>
      </div>
    </div>`
  )
  .join('\n')}
  </div>
</body>
</html>
`;

  const indexPath = path.join(PORTFOLIO_DIR, 'index.html');
  await fs.writeFile(indexPath, html, 'utf-8');

  console.log(`\n✅ Portfolio built: ${selected.length} proposals`);
  console.log(`   Output: ${PORTFOLIO_DIR}`);
  console.log(`   Open: ${indexPath}\n`);
  for (const e of entries) {
    console.log(`   - ${e.businessName} (${e.vertical}): QA ${e.qaScore}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
