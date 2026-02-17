#!/usr/bin/env npx ts-node
/**
 * Run 3 test audits and log proposals for manual QA review.
 * Usage: npx ts-node scripts/run-test-audits-for-qa.ts [--base-url=http://localhost:3000]
 *
 * Requires: API_KEY in .env.local (or env), DEFAULT_TENANT_ID, server running (npm run dev)
 * Output: audit/reports/qa_proposals_YYYYMMDD_HHmmss.json
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE_URL =
    process.env.BASE_URL ||
    (process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1]) ||
    'http://localhost:3000';

const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.DEFAULT_TENANT_ID || process.env.E2E_TENANT_ID;

function headers(): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
    };
    if (TENANT_ID) h['x-tenant-id'] = TENANT_ID;
    return h;
}

const TEST_BUSINESSES = [
    { name: "Joe's Plumbing", city: 'Saskatoon', url: 'https://www.google.com', industry: 'plumbing' },
    { name: 'Main Street Dental', city: 'Saskatoon', url: 'https://example.com', industry: 'dental' },
    { name: 'Downtown Cafe', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'restaurant' },
];

async function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function runAudit(business: (typeof TEST_BUSINESSES)[0]): Promise<{ auditId: string; status: string }> {
    const res = await fetch(`${BASE_URL}/api/audit`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            url: business.url,
            name: business.name,
            city: business.city,
            industry: business.industry,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Audit failed: ${JSON.stringify(data)}`);
    return { auditId: data.auditId, status: data.status };
}

async function propose(auditId: string): Promise<{ proposalId: string; webLinkToken: string }> {
    const res = await fetch(`${BASE_URL}/api/audit/${auditId}/propose`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Propose failed: ${JSON.stringify(data)}`);
    return {
        proposalId: data.proposalId,
        webLinkToken: data.proposal?.webLinkToken || data.webLinkToken,
    };
}

async function getProposal(token: string): Promise<unknown> {
    const res = await fetch(`${BASE_URL}/api/proposal/${token}`, { headers: headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(`Get proposal failed: ${JSON.stringify(data)}`);
    return data;
}

async function main(): Promise<void> {
    if (!API_KEY) {
        console.error('❌ API_KEY required. Set in .env.local or env.');
        process.exit(1);
    }

    console.log('\n🧪 Running 3 test audits for QA review');
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Auth: Bearer ${API_KEY.slice(0, 12)}...\n`);

    const results: Array<{
        business: (typeof TEST_BUSINESSES)[0];
        auditId: string;
        proposalId: string;
        webLinkToken: string;
        proposal: unknown;
    }> = [];

    for (let i = 0; i < TEST_BUSINESSES.length; i++) {
        const biz = TEST_BUSINESSES[i];
        console.log(`\n[${i + 1}/3] Auditing: ${biz.name} (${biz.url})`);
        try {
            const { auditId } = await runAudit(biz);
            console.log(`   ✓ Audit complete: ${auditId}`);

            console.log(`   📝 Generating proposal...`);
            const { proposalId, webLinkToken } = await propose(auditId);
            console.log(`   ✓ Proposal: ${proposalId}`);

            const proposal = await getProposal(webLinkToken);
            results.push({ business: biz, auditId, proposalId, webLinkToken, proposal });
            console.log(`   ✓ Fetched proposal for QA`);
        } catch (e) {
            console.error(`   ❌ Failed:`, e instanceof Error ? e.message : e);
        }
        if (i < TEST_BUSINESSES.length - 1) await sleep(2000);
    }

    const outDir = path.join(process.cwd(), 'audit', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(outDir, `qa_proposals_${timestamp}.json`);

    const logPayload = {
        runAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        results: results.map((r) => {
            const p = r.proposal as {
                executiveSummary?: string;
                painClusters?: Array<{ rootCause: string; narrative: string }>;
                tierEssentials?: { name: string; badge?: string; description: string };
                tierGrowth?: { name: string; badge?: string; description: string };
                tierPremium?: { name: string; badge?: string; description: string };
                pricing?: unknown;
            };
            return {
                business: r.business,
                auditId: r.auditId,
                proposalId: r.proposalId,
                proposalUrl: `${BASE_URL}/proposal/${r.webLinkToken}`,
                executiveSummary: p?.executiveSummary,
                painClusters: p?.painClusters?.map((c) => ({ rootCause: c.rootCause, narrative: c.narrative })),
                tiers: {
                    starter: p?.tierEssentials,
                    growth: p?.tierGrowth,
                    premium: p?.tierPremium,
                },
                pricing: p?.pricing,
            };
        }),
    };

    fs.writeFileSync(outPath, JSON.stringify(logPayload, null, 2), 'utf-8');
    console.log(`\n📄 Proposals logged to: ${outPath}`);
    console.log(`   Manual QA: Review executive summaries, narratives, and tier positioning.`);
    process.exit(results.length < 3 ? 1 : 0);
}

main();
