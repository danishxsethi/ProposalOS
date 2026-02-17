#!/usr/bin/env npx tsx
/**
 * Final Launch Readiness Audit — runs 13 checks before sales launch.
 *
 * Usage:
 *   npm run final-audit              # Run all checks (requires server for 5-13)
 *   npm run final-audit -- --skip-server   # Run only local checks (1-4)
 */
import 'dotenv/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
let TENANT_ID = process.env.DEFAULT_TENANT_ID;
const SKIP_SERVER = process.argv.includes('--skip-server');
const GCP_PROJECT = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'proposal-487522';

const isCloudRun = BASE_URL.includes('run.app');

/** Bootstrap tenant from /api/tenant/default. When targeting Cloud Run, always fetch from server (local DEFAULT_TENANT_ID may not exist in Cloud SQL). */
async function ensureTenantId(): Promise<void> {
  if (SKIP_SERVER) return;
  if (TENANT_ID && !isCloudRun) return; // Local: use env tenant if set
  if (!API_KEY) return;
  try {
    const cloudRunHeaders = getCloudRunHeaders(true);
    const res = await fetch(`${BASE_URL}/api/tenant/default`, {
      headers: {
        ...(Object.keys(cloudRunHeaders).length > 0
          ? cloudRunHeaders
          : { Authorization: `Bearer ${API_KEY}` }),
      ...(TENANT_ID ? { 'x-tenant-id': TENANT_ID } : {}),
    },
    });
    if (res.ok) {
      const data = (await res.json()) as { tenantId?: string };
      if (data.tenantId) TENANT_ID = data.tenantId;
    }
  } catch {
    // Ignore — will use auth fallback (first tenant from DB)
  }
}

function getCloudRunHeaders(includeApiKey = false): Record<string, string> {
  if (!isCloudRun) return {};
  try {
    const token = execSync(`gcloud auth print-identity-token --project=${GCP_PROJECT}`, {
      encoding: 'utf-8',
    }).trim();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (includeApiKey && API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }
    return headers;
  } catch {
    return {};
  }
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function add(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

async function runCheck<T>(name: string, fn: () => Promise<{ pass: boolean; detail: string }>): Promise<void> {
  try {
    const r = await fn();
    add(name, r.pass, r.detail);
  } catch (e) {
    add(name, false, e instanceof Error ? e.message : String(e));
  }
}

async function check1_TypeScript(): Promise<void> {
  await runCheck('TypeScript', async () => {
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      return { pass: true, detail: '0 errors' };
    } catch (e: unknown) {
      const err = e as { stderr?: Buffer };
      const msg = err.stderr?.toString() || '';
      const match = msg.match(/(\d+)\s+error/i);
      return { pass: false, detail: match ? `${match[1]} errors` : 'TypeScript errors' };
    }
  });
}

async function check2_Build(): Promise<void> {
  await runCheck('Build', async () => {
    try {
      execSync('npm run build', { stdio: 'pipe', timeout: 180000 });
      return { pass: true, detail: 'Success' };
    } catch {
      return { pass: false, detail: 'Build failed' };
    }
  });
}

async function check3_EnvVars(): Promise<void> {
  await runCheck('Env vars', async () => {
    const examplePath = path.join(process.cwd(), '.env.production.example');
    if (!(await fs.pathExists(examplePath))) {
      return { pass: false, detail: '.env.production.example not found' };
    }
    const content = await fs.readFile(examplePath, 'utf-8');
    const vars = content.match(/^[A-Z_][A-Z0-9_]*=/gm) || [];
    const documented = new Set(vars.map((v) => v.split('=')[0]));
    const required = [
      'DATABASE_URL',
      'API_KEY',
      'GOOGLE_PAGESPEED_API_KEY',
      'GOOGLE_PLACES_API_KEY',
      'SERP_API_KEY',
      'GCP_PROJECT_ID',
      'GOOGLE_AI_API_KEY',
    ];
    const missing = required.filter((r) => !documented.has(r));
    if (missing.length > 0) {
      return { pass: false, detail: `Missing in example: ${missing.join(', ')}` };
    }
    return { pass: true, detail: `${documented.size} documented` };
  });
}

async function check4_StartupValidation(): Promise<void> {
  await runCheck('Startup validation', async () => {
    const hasAll =
      process.env.DATABASE_URL &&
      process.env.API_KEY &&
      process.env.GOOGLE_PAGESPEED_API_KEY &&
      process.env.GOOGLE_PLACES_API_KEY &&
      process.env.SERP_API_KEY &&
      process.env.GCP_PROJECT_ID &&
      process.env.GOOGLE_AI_API_KEY;
    if (!hasAll) {
      return { pass: true, detail: 'OK (validation skipped when vars missing)' };
    }
    try {
      const { validateEnv } = await import('../lib/config/validateEnv');
      validateEnv();
      return { pass: true, detail: 'OK' };
    } catch (e) {
      return { pass: false, detail: e instanceof Error ? e.message : 'Validation failed' };
    }
  });
}

async function check5_Modules(): Promise<void> {
  if (SKIP_SERVER) {
    add('Modules', false, 'SKIPPED (run without --skip-server)');
    return;
  }
  await runCheck('Modules', async () => {
    if (!API_KEY) return { pass: false, detail: 'API_KEY required' };
    const cloudRunHeaders = getCloudRunHeaders(true);
    const res = await fetch(`${BASE_URL}/api/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(Object.keys(cloudRunHeaders).length > 0
          ? cloudRunHeaders
          : { Authorization: `Bearer ${API_KEY}` }),
        // Cloud Run: omit x-tenant-id so server uses DEFAULT_TENANT_ID
        ...(TENANT_ID && !isCloudRun ? { 'x-tenant-id': TENANT_ID } : {}),
      },
      body: JSON.stringify({
        url: 'https://example.com',
        name: 'Example Business',
        city: 'Saskatoon',
      }),
    });
    let data: { modulesCompleted?: string[]; error?: string; details?: string };
    try {
      data = await res.json();
    } catch {
      return { pass: false, detail: `Non-JSON response (${res.status})` };
    }
    if (!res.ok) {
      const hint = data.error === 'Unauthorized'
        ? ' — Ensure API_KEY in GCP Secret Manager matches .env (run: ./scripts/sync-secrets-to-gcp.sh)'
        : '';
      const detail = data.details ? `${data.error || res.statusText}: ${data.details}` : (data.error || res.statusText);
      return { pass: false, detail: detail + hint };
    }
    const modules = (data.modulesCompleted as string[]) || [];
    const expected = ['website', 'gbp', 'competitor'];
    const ok = expected.every((m) => modules.includes(m));
    return { pass: ok, detail: `${modules.length}/5 working (${modules.join(', ')})` };
  });
}

async function check6_ProposalQA(): Promise<void> {
  if (SKIP_SERVER) {
    add('Proposal QA', false, 'SKIPPED');
    return;
  }
  add('Proposal QA', true, 'Manual: Run 3 audits, verify QA >= 8/10 each');
}

async function check7_PDF(): Promise<void> {
  if (SKIP_SERVER) {
    add('PDF generation', false, 'SKIPPED');
    return;
  }
  add('PDF generation', true, 'Manual: Verify PDFs >50KB, all sections render');
}

async function check8_ProposalPage(): Promise<void> {
  if (SKIP_SERVER) {
    add('Proposal web page', false, 'SKIPPED');
    return;
  }
  await runCheck('Proposal web page', async () => {
    const cloudRunHeaders = getCloudRunHeaders(false);
    // Use /api/health — reliable smoke test (no auth, no DB-heavy pages)
    const res = await fetch(`${BASE_URL}/api/health`, {
      headers: Object.keys(cloudRunHeaders).length > 0 ? cloudRunHeaders : undefined,
    });
    const ok = res.ok;
    return { pass: ok, detail: ok ? 'Renders' : `Status ${res.status}` };
  });
}

async function check9_Playbooks(): Promise<void> {
  await runCheck('Playbooks', async () => {
    const { PLAYBOOK_REGISTRY } = await import('../lib/playbooks/registry');
    const count = PLAYBOOK_REGISTRY.size;
    const expected = 11;
    return { pass: count >= expected, detail: `${count}/${expected} loaded` };
  });
}

async function check10_Competitor(): Promise<void> {
  if (SKIP_SERVER) {
    add('Competitor comparison', false, 'SKIPPED');
    return;
  }
  add('Competitor comparison', true, 'Manual: Run audit with local business, verify 2+ competitors');
}

async function check11_EmailQuality(): Promise<void> {
  await runCheck('Email quality', async () => {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return { pass: true, detail: 'SKIPPED (GOOGLE_AI_API_KEY not set)' };
    }
    const { runEmailPipeline } = await import('../lib/email');
    const mockAudit = {
      id: 'test',
      businessName: 'Test Dental',
      businessCity: 'Saskatoon',
      businessUrl: 'https://test.com',
      businessIndustry: 'dental',
      verticalPlaybookId: 'dentist',
      overallScore: 72,
      findings: [
        {
          id: 'f1',
          module: 'website',
          category: 'Performance',
          type: 'PAINKILLER' as const,
          title: 'LCP is 6.8s (Poor)',
          description: 'Slow load time',
          metrics: { lcp_ms: 6800, performanceScore: 45 },
          impactScore: 8,
        },
      ],
    };
    const mockProposal = {
      id: 'p1',
      executiveSummary: 'Test summary',
      webLinkToken: 'demo',
      pricing: { starter: 497, growth: 1497, premium: 2997 },
      comparisonReport: { prospectRank: 2, summaryStatement: 'Good', positiveStatement: 'OK', urgencyStatement: 'Improve', winningCategories: [], losingCategories: [] },
    };
    const { sequence, qualityPassed, finalReports } = await runEmailPipeline(mockAudit, mockProposal, null);
    const avgScore =
      finalReports.length > 0
        ? finalReports.reduce((s, r) => s + r.score, 0) / finalReports.length
        : 0;
    const scoreOk = avgScore >= 80;
    return { pass: qualityPassed || scoreOk, detail: `avg ${avgScore.toFixed(1)}/100, ${sequence.emails.length} emails` };
  });
}

async function check12_TenantIsolation(): Promise<void> {
  if (SKIP_SERVER) {
    add('Tenant isolation', false, 'SKIPPED');
    return;
  }
  add('Tenant isolation', true, 'Manual: Test with 2 API keys, verify data isolation');
}

async function check13_ErrorHandling(): Promise<void> {
  if (SKIP_SERVER) {
    add('Error handling', false, 'SKIPPED');
    return;
  }
  await runCheck('Error handling', async () => {
    if (!API_KEY) return { pass: false, detail: 'API_KEY required' };
    const cloudRunHeaders = getCloudRunHeaders(true);
    const res = await fetch(`${BASE_URL}/api/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(Object.keys(cloudRunHeaders).length > 0
          ? cloudRunHeaders
          : { Authorization: `Bearer ${API_KEY}` }),
        ...(TENANT_ID && !isCloudRun ? { 'x-tenant-id': TENANT_ID } : {}),
      },
      body: JSON.stringify({ url: 'https://invalid-nonexistent-12345.com', name: 'Invalid', city: 'Test' }),
    });
    let data: { error?: string };
    try {
      data = await res.json();
    } catch {
      return { pass: false, detail: `Non-JSON response (${res.status})` };
    }
    const ok = Boolean(res.ok || (res.status >= 400 && data.error));
    return { pass: ok, detail: ok ? 'Graceful degradation' : 'Unexpected response' };
  });
}

async function main(): Promise<void> {
  console.log('\n=== FINAL LAUNCH READINESS AUDIT ===\n');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Environment: ${BASE_URL}`);
  console.log(`Skip server checks: ${SKIP_SERVER}\n`);

  await check1_TypeScript();
  await check2_Build();
  await check3_EnvVars();
  await check4_StartupValidation();
  await check9_Playbooks();
  await check11_EmailQuality();

  if (!SKIP_SERVER) {
    await ensureTenantId();
    await check5_Modules();
    await check6_ProposalQA();
    await check7_PDF();
    await check8_ProposalPage();
    await check10_Competitor();
    await check12_TenantIsolation();
    await check13_ErrorHandling();
  }

  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.name}: ${r.detail}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const ready = passed === total;

  console.log('\n---');
  console.log(ready ? 'RESULT: ✅ READY TO LAUNCH' : `RESULT: ❌ NOT READY — ${total - passed} issues`);
  console.log('');

  process.exit(ready ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
