#!/usr/bin/env npx tsx
/**
 * Test cold email generation — generate 5 sample emails using real Saskatoon audit data.
 * Usage: npx tsx scripts/test-cold-email-generate.ts [--base-url=http://localhost:3000]
 *
 * Requires: API_KEY, DEFAULT_TENANT_ID, server running, and at least one completed audit with proposal.
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
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

async function getAuditsWithProposals(): Promise<Array<{ id: string; businessName: string }>> {
    const res = await fetch(`${BASE_URL}/api/audits?limit=20`, { headers: headers() });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`Failed to fetch audits: ${data.error || res.statusText}`);
    }
    const data = await res.json();
    const audits = data.audits || [];
    return audits
        .filter((a: { proposal?: unknown }) => a.proposal)
        .slice(0, 5)
        .map((a: { id: string; businessName: string }) => ({ id: a.id, businessName: a.businessName }));
}

async function generateEmails(auditId: string): Promise<unknown> {
    const res = await fetch(`${BASE_URL}/api/email/generate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ auditId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || res.statusText);
    return data;
}

async function main(): Promise<void> {
    if (!API_KEY) {
        console.error('API_KEY required. Set in .env.local or env.');
        process.exit(1);
    }

    console.log('\n🧪 Testing cold email generation (5 samples)\n');
    console.log(`   Base URL: ${BASE_URL}\n`);

    let audits: Array<{ id: string; businessName: string }>;
    try {
        audits = await getAuditsWithProposals();
    } catch (e) {
        console.error('Could not fetch audits. Ensure server is running and you have completed audits with proposals.');
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    }

    if (audits.length === 0) {
        console.log('No audits with proposals found. Run some test audits first (e.g. npm run test:vertical-playbooks).');
        process.exit(0);
    }

    const results: Array<{
        auditId: string;
        businessName: string;
        result: unknown;
    }> = [];

    for (let i = 0; i < Math.min(5, audits.length); i++) {
        const audit = audits[i];
        console.log(`[${i + 1}/5] Generating for: ${audit.businessName} (${audit.id})`);
        try {
            const result = await generateEmails(audit.id);
            results.push({ auditId: audit.id, businessName: audit.businessName, result });
            const r = result as { emails?: Array<{ subject: string; score?: number; variant: number }>; bestVariant?: number };
            const emails = r.emails || [];
            console.log(`   ✓ ${emails.length} variants, best: #${r.bestVariant ?? '?'}`);
            if (emails[0]) {
                console.log(`   Subject: "${emails[0].subject?.slice(0, 50)}..."`);
                console.log(`   Score: ${emails[0].score ?? 'N/A'}`);
            }
        } catch (e) {
            console.error(`   ❌ ${e instanceof Error ? e.message : e}`);
        }
    }

    const outDir = path.join(process.cwd(), 'audit', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `cold_email_test_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ runAt: new Date().toISOString(), results }, null, 2), 'utf-8');
    console.log(`\n📄 Results: ${outPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
