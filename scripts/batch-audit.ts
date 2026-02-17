#!/usr/bin/env npx tsx
/**
 * Batch audit runner for the Saskatoon 50-audit blitz.
 *
 * Prerequisites:
 *   - data/saskatoon-targets.json with targets (use scripts/target-list.ts to manage)
 *   - Dev server running (npm run dev) or BASE_URL pointing to deployed app
 *   - API_KEY and DEFAULT_TENANT_ID in .env
 *
 * Usage:
 *   npx tsx scripts/batch-audit.ts                    # Run all pending audits
 *   npx tsx scripts/batch-audit.ts --vertical dentist # Run only dentist vertical
 *   npx tsx scripts/batch-audit.ts --retry             # Re-run failed audits
 *   npx tsx scripts/batch-audit.ts --limit 5           # Run only 5 audits (test)
 *   npx tsx scripts/batch-audit.ts --concurrency 2    # Run 2 audits in parallel (default: 1)
 *   npx tsx scripts/batch-audit.ts --base-url=http://localhost:3002  # Override when ProposalOS runs on different port
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import * as fs from 'fs';
import type { Target, TargetList } from './target-list';

let BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.DEFAULT_TENANT_ID || process.env.E2E_TENANT_ID;
const TARGETS_PATH = path.join(process.cwd(), 'data', 'saskatoon-targets.json');
const REPORTS_DIR = path.join(process.cwd(), 'audit', 'reports');
const DELAY_BETWEEN_AUDITS_MS = 5000;

function parseArgs(): {
    vertical?: string;
    retry: boolean;
    limit?: number;
    concurrency: number;
    baseUrl?: string;
} {
    const args = process.argv.slice(2);
    const vertical = args.find((a) => a.startsWith('--vertical='))?.split('=')[1];
    const retry = args.includes('--retry');
    const limitArg =
        args.find((a) => a.startsWith('--limit='))?.split('=')[1] ??
        (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : undefined);
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;
    const concurrencyArg = args.find((a) => a.startsWith('--concurrency='))?.split('=')[1];
    const concurrency = concurrencyArg ? Math.max(1, parseInt(concurrencyArg, 10)) : 1;
    const baseUrl = args.find((a) => a.startsWith('--base-url='))?.split('=')[1];
    return { vertical, retry, limit, concurrency, baseUrl };
}

function headers(): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
    };
    if (TENANT_ID) h['x-tenant-id'] = TENANT_ID;
    return h;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function runAudit(target: Target): Promise<{ auditId: string; status: string }> {
    const res = await fetch(`${BASE_URL}/api/audit`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            url: target.url,
            name: target.businessName,
            city: 'Saskatoon',
            industry: target.vertical,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details || res.statusText);
    return { auditId: data.auditId, status: data.status };
}

async function runPropose(auditId: string): Promise<{ proposalId: string; webLinkToken: string; qaScore?: number }> {
    const res = await fetch(`${BASE_URL}/api/audit/${auditId}/propose`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details || res.statusText);
    return {
        proposalId: data.proposalId,
        webLinkToken: data.proposal?.webLinkToken ?? data.webLinkToken,
        qaScore: data.qaScore ?? data.proposal?.qaScore,
    };
}

function loadTargets(): TargetList {
    const raw = fs.readFileSync(TARGETS_PATH, 'utf-8');
    return JSON.parse(raw) as TargetList;
}

function saveTargets(data: TargetList): void {
    fs.writeFileSync(TARGETS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function updateTarget(
    data: TargetList,
    id: number,
    update: Partial<Pick<Target, 'status' | 'auditId' | 'qaScore' | 'errorMessage'>>
): void {
    const t = data.targets.find((x) => x.id === id);
    if (t) {
        Object.assign(t, update);
    }
}

interface AuditResult {
    target: Target;
    status: 'success' | 'error';
    auditId?: string;
    qaScore?: number;
    errorMessage?: string;
}

async function processOne(target: Target, data: TargetList): Promise<AuditResult> {
    const result: AuditResult = { target, status: 'error' };
    try {
        const audit = await runAudit(target);
        result.auditId = audit.auditId;
        updateTarget(data, target.id, { auditId: audit.auditId });

        const propose = await runPropose(audit.auditId);
        result.qaScore = propose.qaScore;
        updateTarget(data, target.id, {
            status: 'success',
            qaScore: propose.qaScore ?? null,
            errorMessage: undefined,
        });
        result.status = 'success';
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errorMessage = msg;
        updateTarget(data, target.id, {
            status: 'error',
            errorMessage: msg,
        });
    }
    saveTargets(data);
    return result;
}

function generateReport(results: AuditResult[]): string {
    const successful = results.filter((r) => r.status === 'success');
    const failed = results.filter((r) => r.status === 'error');
    const withScore = successful.filter((r) => r.qaScore != null);
    const avgScore =
        withScore.length > 0
            ? (withScore.reduce((s, r) => s + (r.qaScore ?? 0), 0) / withScore.length).toFixed(1)
            : 'N/A';
    const successRate = results.length > 0 ? ((successful.length / results.length) * 100).toFixed(1) : '0';

    const byVertical = new Map<
        string,
        { success: number; failed: number; scores: number[] }
    >();
    for (const r of results) {
        const v = r.target.vertical;
        const curr = byVertical.get(v) ?? { success: 0, failed: 0, scores: [] };
        if (r.status === 'success') {
            curr.success++;
            if (r.qaScore != null) curr.scores.push(r.qaScore);
        } else curr.failed++;
        byVertical.set(v, curr);
    }

    const top5 = [...successful]
        .filter((r) => r.qaScore != null)
        .sort((a, b) => (b.qaScore ?? 0) - (a.qaScore ?? 0))
        .slice(0, 5);
    const bottom5 = [...successful]
        .filter((r) => r.qaScore != null)
        .sort((a, b) => (a.qaScore ?? 0) - (b.qaScore ?? 0))
        .slice(0, 5);

    const errors = [...new Set(failed.map((r) => r.errorMessage).filter(Boolean))];

    let md = `# Batch Audit Report — Saskatoon Blitz\n\n`;
    md += `**Generated:** ${new Date().toISOString()}\n\n`;
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total run | ${results.length} |\n`;
    md += `| Successful | ${successful.length} |\n`;
    md += `| Failed | ${failed.length} |\n`;
    md += `| Success rate | ${successRate}% |\n`;
    md += `| Avg QA score | ${avgScore} |\n\n`;

    md += `## Per-vertical breakdown\n\n`;
    md += `| Vertical | Success | Failed | Avg QA |\n`;
    md += `|----------|---------|--------|--------|\n`;
    for (const [v, s] of byVertical) {
        const avg = s.scores.length > 0 ? (s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1) : 'N/A';
        md += `| ${v} | ${s.success} | ${s.failed} | ${avg} |\n`;
    }
    md += `\n`;

    md += `## Top 5 proposals (by QA score)\n\n`;
    for (const r of top5) {
        md += `- **${r.target.businessName}** (${r.target.vertical}): QA ${r.qaScore}\n`;
    }
    md += `\n`;

    md += `## Bottom 5 proposals (need attention)\n\n`;
    for (const r of bottom5) {
        md += `- **${r.target.businessName}** (${r.target.vertical}): QA ${r.qaScore}\n`;
    }
    md += `\n`;

    if (errors.length > 0) {
        md += `## Edge cases and errors\n\n`;
        for (const e of errors) {
            md += `- ${e}\n`;
        }
    }

    return md;
}

async function main(): Promise<void> {
    if (!API_KEY) {
        console.error('API_KEY required. Add to .env or .env.local');
        process.exit(1);
    }

    const { vertical, retry, limit, concurrency, baseUrl } = parseArgs();
    if (baseUrl) BASE_URL = baseUrl;

    if (!fs.existsSync(TARGETS_PATH)) {
        console.error(`Target file not found: ${TARGETS_PATH}`);
        process.exit(1);
    }

    let data = loadTargets();
    let targets = data.targets.filter((t) => {
        if (!t.url) return false;
        if (retry) return t.status === 'error';
        return t.status === 'pending';
    });
    if (vertical) targets = targets.filter((t) => t.vertical === vertical);
    if (limit) targets = targets.slice(0, limit);

    if (targets.length === 0) {
        console.log('No targets to run. Use --retry for failed, or add pending targets with URLs.');
        process.exit(0);
    }

    console.log(`\n🚀 Batch Audit: ${targets.length} targets`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Concurrency: ${concurrency}, Delay: ${DELAY_BETWEEN_AUDITS_MS}ms\n`);

    const results: AuditResult[] = [];
    let lastStartTime = 0;
    let completed = 0;

    const processWithRateLimit = async (target: Target): Promise<AuditResult> => {
        const now = Date.now();
        const wait = Math.max(0, lastStartTime + DELAY_BETWEEN_AUDITS_MS - now);
        if (wait > 0) await sleep(wait);
        lastStartTime = Date.now();

        const result = await processOne(target, data);
        completed++;
        const icon = result.status === 'success' ? '✅' : '❌';
        const qa = result.qaScore != null ? `QA: ${result.qaScore}` : result.errorMessage ?? 'error';
        console.log(`[${completed}/${targets.length}] ${icon} ${target.businessName} (${target.vertical}) — ${qa}`);
        return result;
    };

    if (concurrency === 1) {
        for (const target of targets) {
            const r = await processWithRateLimit(target);
            results.push(r);
        }
    } else {
        const queue = [...targets];
        const workers = Array.from({ length: concurrency }, async () => {
            while (queue.length > 0) {
                const target = queue.shift();
                if (!target) break;
                const r = await processWithRateLimit(target);
                results.push(r);
            }
        });
        await Promise.all(workers);
    }

    const successful = results.filter((r) => r.status === 'success');
    const failed = results.filter((r) => r.status === 'error');
    const withScore = successful.filter((r) => r.qaScore != null);
    const avgScore =
        withScore.length > 0
            ? (withScore.reduce((s, r) => s + (r.qaScore ?? 0), 0) / withScore.length).toFixed(1)
            : 'N/A';

    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${results.length} | Success: ${successful.length} | Failed: ${failed.length}`);
    console.log(`   Avg QA score: ${avgScore}`);

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const reportPath = path.join(
        REPORTS_DIR,
        `batch_audit_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`
    );
    fs.writeFileSync(reportPath, generateReport(results), 'utf-8');
    console.log(`\n📄 Report: ${reportPath}`);

    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
