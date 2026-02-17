#!/usr/bin/env npx ts-node
/**
 * Generate a sample PDF for review.
 * Usage: npx ts-node scripts/generate-sample-pdf.ts [--token=xxx] [--base-url=http://localhost:3000]
 *
 * If --token omitted, uses the most recent proposal from the QA report or prompts.
 * Output: audit/reports/sample_proposal_YYYYMMDD_HHmmss.pdf
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE_URL =
    process.env.BASE_URL ||
    process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1] ||
    'http://localhost:3000';

const tokenArg = process.argv.find((a) => a.startsWith('--token='));
let TOKEN: string | undefined = tokenArg?.split('=')[1];

async function getLatestTokenFromReport(): Promise<string | undefined> {
    const reportsDir = path.join(process.cwd(), 'audit', 'reports');
    if (!fs.existsSync(reportsDir)) return undefined;
    const files = fs.readdirSync(reportsDir).filter((f) => f.startsWith('qa_proposals_'));
    if (files.length === 0) return undefined;
    const latest = files.sort().reverse()[0];
    const content = fs.readFileSync(path.join(reportsDir, latest), 'utf-8');
    const data = JSON.parse(content);
    const first = data.results?.[0];
    if (!first?.proposalUrl) return undefined;
    const match = first.proposalUrl.match(/\/proposal\/([a-zA-Z0-9_-]+)/);
    return match?.[1];
}

async function main(): Promise<void> {
    if (!TOKEN) {
        TOKEN = await getLatestTokenFromReport();
        if (!TOKEN) {
            console.error('No token found. Run with --token=YOUR_PROPOSAL_TOKEN or run run-test-audits-for-qa.ts first.');
            process.exit(1);
        }
        console.log(`Using token from latest QA report: ${TOKEN.slice(0, 12)}...`);
    }

    const url = `${BASE_URL}/api/proposal/${TOKEN}/pdf`;
    console.log(`Fetching PDF from ${url}...`);

    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to generate PDF: ${res.status} ${text}`);
        process.exit(1);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const outDir = path.join(process.cwd(), 'audit', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(outDir, `sample_proposal_${timestamp}.pdf`);
    fs.writeFileSync(outPath, buf);
    console.log(`\n✅ PDF saved to: ${outPath}`);
    console.log(`   Open in a PDF viewer to review the agency-grade design.`);
}

main();
