#!/usr/bin/env npx tsx
/**
 * Re-run only the failed audits from a previous blitz.
 * Reads blitz-results.json, filters for FAIL, re-audits each, merges results.
 *
 * Prerequisites:
 *   - Previous blitz run (scripts/output/blitz-results.json exists)
 *   - Dev server running (npm run dev)
 *   - API_KEY and DEFAULT_TENANT_ID in .env
 *
 * Usage:
 *   npm run rerun-failures
 */

import 'dotenv/config';
import * as fs from 'fs-extra';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.DEFAULT_TENANT_ID;
const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'output', 'blitz-results.json');
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'output');
const PDF_DIR = path.join(OUTPUT_DIR, 'pdfs');
const DELAY_BETWEEN_MS = 5000;
const RETRY_DELAY_MS = 10000;
const EXPECTED_MODULES = ['website', 'gbp', 'competitor'];

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
  modulesCompleted?: string[];
  modulesFailed?: { module: string; error: string }[];
  findingsCount?: number;
  pdfSizeBytes?: number;
}

interface AuditResponse {
  success: boolean;
  auditId?: string;
  modulesCompleted?: string[];
  modulesFailed?: { module: string; error: string }[];
  findingsCount?: number;
  error?: string;
}

interface ProposeResponse {
  success: boolean;
  proposalId?: string;
  webLinkToken?: string;
  qaScore?: number;
  proposal?: {
    executiveSummary?: string;
    tiers?: { essentials?: unknown; growth?: unknown; premium?: unknown };
    pricing?: Record<string, unknown>;
  };
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]/gi, '_').replace(/_+/g, '_').slice(0, 80);
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
    if (TENANT_ID) headers['x-tenant-id'] = TENANT_ID;
  }
  return fetch(url, { ...options, headers });
}

async function runAudit(result: BlitzResult): Promise<AuditResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/audit`, {
    method: 'POST',
    body: JSON.stringify({
      url: result.website,
      name: result.businessName,
      city: 'Saskatoon',
      industry: result.vertical,
    }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || res.statusText };
  return data as AuditResponse;
}

async function runPropose(auditId: string): Promise<ProposeResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/audit/${auditId}/propose`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || res.statusText };
  return data as ProposeResponse;
}

async function fetchPdf(webLinkToken: string): Promise<{ buffer: Buffer; size: number } | null> {
  const res = await fetch(`${BASE_URL}/api/proposal/${webLinkToken}/pdf`);
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, size: buffer.length };
}

function runQualityGate(
  audit: AuditResponse,
  propose: ProposeResponse,
  pdfSize: number | null,
  businessName: string
): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!audit.modulesCompleted || audit.modulesCompleted.length < EXPECTED_MODULES.length) {
    issues.push(`Module(s) failed: ${audit.modulesFailed?.map((m) => m.module).join(', ') || 'unknown'}`);
  }
  if ((audit.findingsCount ?? 0) < 5) issues.push(`Findings ${audit.findingsCount ?? 0} < 5`);
  const qaScore = propose.qaScore ?? 0;
  if (qaScore < 70) issues.push(`QA score ${qaScore}% < 70%`);
  const summary = propose.proposal?.executiveSummary ?? '';
  if (!summary.toLowerCase().includes(businessName.toLowerCase())) {
    issues.push('Executive summary does not mention business name');
  }
  if (pdfSize === null || pdfSize <= 50 * 1024) issues.push(`PDF size ${pdfSize ?? 0} bytes <= 50KB`);
  const pricing = propose.proposal?.pricing;
  const hasPricing =
    pricing &&
    typeof (pricing as Record<string, unknown>).essentials === 'number' &&
    typeof (pricing as Record<string, unknown>).growth === 'number' &&
    typeof (pricing as Record<string, unknown>).premium === 'number';
  if (!hasPricing) issues.push('Pricing tiers missing or empty');
  return { pass: issues.length === 0, issues };
}

async function processOne(failed: BlitzResult): Promise<BlitzResult> {
  const result: BlitzResult = {
    ...failed,
    pass: false,
    issues: [],
  };

  const runWithRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch {
      await sleep(RETRY_DELAY_MS);
      return fn();
    }
  };

  try {
    const audit = await runWithRetry(() => runAudit(failed));
    if (!audit.success || !audit.auditId) {
      result.issues.push(audit.error || 'Audit failed');
      return result;
    }

    result.auditId = audit.auditId;
    result.modulesCompleted = audit.modulesCompleted;
    result.modulesFailed = audit.modulesFailed;
    result.findingsCount = audit.findingsCount;

    const propose = await runWithRetry(() => runPropose(audit.auditId!));
    if (!propose.success || !propose.webLinkToken) {
      result.issues.push(propose.error || 'Proposal generation failed');
      return result;
    }

    result.proposalId = propose.proposalId;
    result.webLinkToken = propose.webLinkToken;
    result.proposalUrl = `${BASE_URL}/proposal/${propose.webLinkToken}`;
    result.qaScore = propose.qaScore;

    const pdfResult = await fetchPdf(propose.webLinkToken);
    const pdfSize = pdfResult?.size ?? null;
    result.pdfSizeBytes = pdfSize ?? undefined;

    if (pdfResult) {
      const verticalDir = path.join(PDF_DIR, failed.vertical);
      await fs.ensureDir(verticalDir);
      const filename = `${safeFilename(failed.businessName)}.pdf`;
      await fs.writeFile(path.join(verticalDir, filename), pdfResult.buffer);
      result.pdfPath = path.join(verticalDir, filename);
    }

    const gate = runQualityGate(audit, propose, pdfSize, failed.businessName);
    result.pass = gate.pass;
    result.issues = gate.issues;
  } catch (err) {
    result.issues.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('API_KEY is required. Add it to .env');
    process.exit(1);
  }

  if (!(await fs.pathExists(RESULTS_PATH))) {
    console.error('blitz-results.json not found. Run: npm run blitz');
    process.exit(1);
  }

  const results = (await fs.readJson(RESULTS_PATH)) as BlitzResult[];
  const failed = results.filter((r) => !r.pass);

  if (failed.length === 0) {
    console.log('No failures to re-run. All audits passed.');
    return;
  }

  console.log(`\n🔄 Re-running ${failed.length} failed audit(s)\n`);

  const failedIndexes = new Set(results.map((r, i) => (r.pass ? -1 : i)).filter((i) => i >= 0));
  const updated = [...results];

  for (let i = 0; i < failed.length; i++) {
    const f = failed[i];
    console.log(`[${i + 1}/${failed.length}] Re-auditing ${f.businessName}...`);
    const newResult = await processOne(f);
    const icon = newResult.pass ? '✅' : '❌';
    console.log(`  ${icon} ${newResult.pass ? 'PASS' : 'FAIL'} (QA: ${newResult.qaScore ?? 'N/A'})`);

    const idx = results.findIndex(
      (r) => r.businessName === f.businessName && r.website === f.website
    );
    if (idx >= 0) updated[idx] = newResult;

    await sleep(DELAY_BETWEEN_MS);
  }

  await fs.writeJson(RESULTS_PATH, updated, { spaces: 2 });
  console.log(`\nWrote ${RESULTS_PATH}`);

  const passed = updated.filter((r) => r.pass).length;
  const total = updated.length;
  const rate = total > 0 ? (passed / total) * 100 : 0;
  console.log(`\nUpdated pass rate: ${passed}/${total} (${rate.toFixed(1)}%)`);
  if (rate >= 90) {
    console.log('✅ Target of >=90% pass rate achieved!');
  } else {
    console.log(`⚠️  Still below 90% target. Run npm run qa-review to triage remaining failures.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
