#!/usr/bin/env npx tsx
/**
 * Phase 4: Assert agency-grade QA (≥90%) on a small batch.
 * Use in CI or locally to fail fast if proposals drop below 90%.
 *
 * Prerequisites: same as batch-audit (targets, BASE_URL, API_KEY, tenant).
 *
 * Usage:
 *   npx tsx scripts/assert-agency-grade.ts           # default 5 audits
 *   npx tsx scripts/assert-agency-grade.ts --limit 10
 *   BASE_URL=http://localhost:3001 npx tsx scripts/assert-agency-grade.ts
 *
 * Exit: 0 if every proposal has qaScore >= 90 and avg >= 90; 1 otherwise.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

let BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.DEFAULT_TENANT_ID || process.env.E2E_TENANT_ID;
const TARGETS_PATH = path.join(process.cwd(), 'data', 'saskatoon-targets.json');

const MIN_QA_SCORE = 90;
const DEFAULT_LIMIT = 5;

function parseArgs(): { limit: number; baseUrl?: string } {
    const args = process.argv.slice(2);
    const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1]
        ?? (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : undefined);
    const limit = limitArg ? Math.max(1, parseInt(limitArg, 10)) : DEFAULT_LIMIT;
    const baseUrl = args.find((a) => a.startsWith('--base-url='))?.split('=')[1];
    return { limit, baseUrl };
}

function headers(): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
    };
    if (TENANT_ID) h['x-tenant-id'] = TENANT_ID;
    return h;
}

async function runAudit(target: { url: string; businessName: string; vertical?: string }): Promise<{ auditId: string }> {
    const res = await fetch(`${BASE_URL}/api/audit`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            url: target.url,
            name: target.businessName,
            city: 'Saskatoon',
            industry: target.vertical ?? 'general',
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details || res.statusText);
    return { auditId: data.auditId };
}

async function runPropose(auditId: string): Promise<{ qaScore?: number }> {
    const res = await fetch(`${BASE_URL}/api/audit/${auditId}/propose`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details || res.statusText);
    return { qaScore: data.qaScore ?? data.proposal?.qaScore };
}

interface Target {
    id: number;
    url?: string;
    businessName: string;
    vertical?: string;
    status?: string;
}

function loadTargets(): Target[] {
    const raw = fs.readFileSync(TARGETS_PATH, 'utf-8');
    const list = JSON.parse(raw) as { targets: Target[] };
    return (list.targets ?? []).filter((t) => t.url && t.status !== 'error');
}

async function main(): Promise<void> {
    const { limit, baseUrl } = parseArgs();
    if (baseUrl) BASE_URL = baseUrl;

    if (!API_KEY) {
        console.error('Missing API_KEY in .env');
        process.exit(1);
    }
    if (!fs.existsSync(TARGETS_PATH)) {
        console.error(`Target file not found: ${TARGETS_PATH}`);
        process.exit(1);
    }

    const allTargets = loadTargets();
    const targets = allTargets
        .filter((t): t is Target & { url: string } => typeof t.url === 'string' && t.url.length > 0)
        .slice(0, limit);
    if (targets.length === 0) {
        console.error('No targets with URL found.');
        process.exit(1);
    }

    console.log(`\n🎯 Assert agency-grade: ${targets.length} audits (min QA ${MIN_QA_SCORE}%)`);
    console.log(`   Base URL: ${BASE_URL}\n`);

    const scores: number[] = [];
    const below: { name: string; score: number }[] = [];

    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
            const audit = await runAudit(t);
            const propose = await runPropose(audit.auditId);
            const score = propose.qaScore ?? 0;
            scores.push(score);
            const icon = score >= MIN_QA_SCORE ? '✅' : '❌';
            console.log(`[${i + 1}/${targets.length}] ${icon} ${t.businessName} — QA ${score}%`);
            if (score < MIN_QA_SCORE) below.push({ name: t.businessName, score });
        } catch (err) {
            console.error(`[${i + 1}/${targets.length}] ❌ ${t.businessName} — ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
        }
    }

    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const minScore = scores.length ? Math.min(...scores) : 0;

    console.log(`\n📊 Avg QA: ${avg.toFixed(1)}% | Min: ${minScore}%`);

    if (below.length > 0) {
        console.error(`\n❌ Agency-grade assertion failed: ${below.length} proposal(s) below ${MIN_QA_SCORE}%:`);
        below.forEach(({ name, score }) => console.error(`   - ${name}: ${score}%`));
        process.exit(1);
    }
    if (avg < MIN_QA_SCORE) {
        console.error(`\n❌ Agency-grade assertion failed: avg QA ${avg.toFixed(1)}% < ${MIN_QA_SCORE}%`);
        process.exit(1);
    }

    console.log(`\n✅ All proposals agency-grade (≥${MIN_QA_SCORE}%).`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
