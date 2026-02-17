#!/usr/bin/env npx tsx
/**
 * QA Review: triage failed audits from blitz-results.json
 *
 * Usage:
 *   npm run qa-review           # Print table of failures
 *   npm run qa-review -- --open # Open failed proposal URLs in browser
 */

import 'dotenv/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';

const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'output', 'blitz-results.json');

interface BlitzResult {
  businessName: string;
  vertical: string;
  website: string;
  auditId?: string;
  proposalId?: string;
  webLinkToken?: string;
  proposalUrl?: string;
  pdfPath?: string;
  pass: boolean;
  qaScore?: number;
  issues: string[];
}

function openUrl(url: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
  } catch {
    console.log(`  URL: ${url}`);
  }
}

async function main(): Promise<void> {
  if (!(await fs.pathExists(RESULTS_PATH))) {
    console.error(`Results not found. Run: npm run blitz`);
    process.exit(1);
  }

  const results = (await fs.readJson(RESULTS_PATH)) as BlitzResult[];
  const failed = results.filter((r) => !r.pass);

  if (failed.length === 0) {
    console.log('No failures to review. All audits passed.');
    return;
  }

  console.log(`\n📋 QA Review: ${failed.length} failed audit(s)\n`);
  console.log('| # | Business              | Vertical    | QA  | Issues                    | Proposal URL              |');
  console.log('|---|-----------------------|-------------|-----|---------------------------|---------------------------|');

  for (let i = 0; i < failed.length; i++) {
    const r = failed[i];
    const name = r.businessName.slice(0, 21).padEnd(21);
    const vert = r.vertical.slice(0, 11).padEnd(11);
    const qa = r.qaScore !== undefined ? String(r.qaScore).padStart(3) : 'N/A';
    const issues = r.issues.join('; ').slice(0, 25).padEnd(25);
    const url = r.proposalUrl ? 'Yes' : 'No';
    console.log(`| ${String(i + 1).padStart(2)} | ${name} | ${vert} | ${qa} | ${issues} | ${url.padEnd(25)} |`);
  }

  console.log('\n--- Failure details ---\n');
  for (let i = 0; i < failed.length; i++) {
    const r = failed[i];
    console.log(`${i + 1}. ${r.businessName} (${r.vertical})`);
    console.log(`   Issues: ${r.issues.join('; ')}`);
    if (r.proposalUrl) console.log(`   URL: ${r.proposalUrl}`);
    console.log('');
  }

  const doOpen = process.argv.includes('--open');
  if (doOpen) {
    console.log('Opening failed proposal URLs in browser...\n');
    for (const r of failed) {
      if (r.proposalUrl) {
        openUrl(r.proposalUrl);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } else {
    console.log('Tip: Run with --open to open failed proposal URLs in your browser.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
