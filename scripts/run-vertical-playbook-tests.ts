#!/usr/bin/env npx ts-node
/**
 * Run one test audit per vertical to verify Saskatoon playbook output quality.
 * Usage: npx ts-node scripts/run-vertical-playbook-tests.ts [--base-url=http://localhost:3000]
 *
 * Requires: API_KEY in .env.local (or env), DEFAULT_TENANT_ID, server running (npm run dev)
 * Output: audit/reports/vertical_playbook_tests_YYYYMMDD_HHmmss.json
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

/** One test business per vertical — industry values map to playbook IDs via detectVertical */
const VERTICAL_TEST_BUSINESSES = [
    { name: 'Saskatoon Family Dental', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'dentist' },
    { name: 'Prairie Law Group', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'law firm' },
    { name: 'Bridge City Heating & Cooling', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'hvac' },
    { name: 'Broadway Bistro', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'restaurant' },
    { name: 'Stonebridge Realty', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'real estate agent' },
    { name: 'Nutana Fitness Centre', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'gym' },
    { name: 'Prairie Pet Veterinary Clinic', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'veterinarian' },
    { name: 'Downtown Hair Studio', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'hair salon' },
    { name: 'Saskatoon Home Renovations', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'contractor' },
    { name: 'River Landing Retail', city: 'Saskatoon', url: 'https://www.wikipedia.org', industry: 'retail' },
];

async function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function runAudit(business: (typeof VERTICAL_TEST_BUSINESSES)[0]): Promise<{ auditId: string; status: string }> {
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

    console.log('\n🧪 Running 10 vertical playbook test audits (Saskatoon)');
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Auth: Bearer ${API_KEY.slice(0, 12)}...\n`);

    const results: Array<{
        business: (typeof VERTICAL_TEST_BUSINESSES)[0];
        vertical: string;
        auditId: string;
        proposalId: string;
        webLinkToken: string;
        proposal: unknown;
        error?: string;
    }> = [];

    for (let i = 0; i < VERTICAL_TEST_BUSINESSES.length; i++) {
        const biz = VERTICAL_TEST_BUSINESSES[i];
        const vertical = biz.industry;
        console.log(`\n[${i + 1}/10] ${vertical}: ${biz.name}`);
        try {
            const { auditId } = await runAudit(biz);
            console.log(`   ✓ Audit: ${auditId}`);

            const { proposalId, webLinkToken } = await propose(auditId);
            console.log(`   ✓ Proposal: ${proposalId}`);

            const proposal = await getProposal(webLinkToken);
            results.push({ business: biz, vertical, auditId, proposalId, webLinkToken, proposal });
            console.log(`   ✓ Fetched proposal`);
        } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            console.error(`   ❌ ${err}`);
            results.push({ business: biz, vertical, auditId: '', proposalId: '', webLinkToken: '', proposal: null, error: err });
        }
        if (i < VERTICAL_TEST_BUSINESSES.length - 1) await sleep(2500);
    }

    const outDir = path.join(process.cwd(), 'audit', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(outDir, `vertical_playbook_tests_${timestamp}.json`);

    const logPayload = {
        runAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        location: 'Saskatoon, Saskatchewan',
        results: results.map((r) => {
            const p = r.proposal as {
                executiveSummary?: string;
                painClusters?: Array<{ rootCause: string; narrative: string }>;
                tierEssentials?: { name: string; badge?: string; description: string };
                tierGrowth?: { name: string; badge?: string; description: string };
                tierPremium?: { name: string; badge?: string; description: string };
                pricing?: unknown;
            } | null;
            return {
                vertical: r.vertical,
                business: r.business,
                auditId: r.auditId,
                proposalId: r.proposalId,
                proposalUrl: r.webLinkToken ? `${BASE_URL}/proposal/${r.webLinkToken}` : null,
                executiveSummary: p?.executiveSummary,
                painClusters: p?.painClusters?.map((c) => ({ rootCause: c.rootCause, narrative: c.narrative })),
                tiers: p
                    ? { starter: p.tierEssentials, growth: p.tierGrowth, premium: p.tierPremium }
                    : null,
                pricing: p?.pricing,
                error: r.error,
            };
        }),
    };

    fs.writeFileSync(outPath, JSON.stringify(logPayload, null, 2), 'utf-8');
    const passed = results.filter((r) => !r.error).length;
    console.log(`\n📄 Results: ${passed}/10 passed. Logged to: ${outPath}`);
    process.exit(passed < 10 ? 1 : 0);
}

main();
