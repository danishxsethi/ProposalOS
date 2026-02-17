#!/usr/bin/env npx tsx
/**
 * Batch audit blitz: audit all 50 Saskatoon target businesses with quality gates.
 *
 * Prerequisites:
 *   - npm run build-targets (creates scripts/output/saskatoon-targets.json)
 *   - Dev server running (npm run dev) or BASE_URL pointing to deployed app
 *   - API_KEY and DEFAULT_TENANT_ID (or x-tenant-id) in .env
 *
 * Usage:
 *   npm run blitz
 */

import 'dotenv/config';
import * as fs from 'fs-extra';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.DEFAULT_TENANT_ID;
const TARGETS_PATH = path.join(process.cwd(), 'scripts', 'output', 'saskatoon-targets.json');
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'output');
const PDF_DIR = path.join(OUTPUT_DIR, 'pdfs');
const RESULTS_PATH = path.join(OUTPUT_DIR, 'blitz-results.json');

const MAX_CONCURRENT = 3;
const DELAY_BETWEEN_STARTS_MS = 5000;
const RETRY_DELAY_MS = 10000;

const EXPECTED_MODULES = ['website', 'gbp', 'competitor'];

interface TargetBusiness {
  businessName: string;
  placeId: string;
  website: string;
  phone: string;
  address: string;
  rating: number;
  reviewCount: number;
  category: string;
  vertical: string;
}

interface AuditResponse {
  success: boolean;
  auditId?: string;
  status?: string;
  modulesCompleted?: string[];
  modulesFailed?: { module: string; error: string }[];
  findingsCount?: number;
  error?: string;
  details?: string;
}

interface ProposeResponse {
  success: boolean;
  auditId?: string;
  proposalId?: string;
  webLinkToken?: string;
  qaScore?: number;
  proposal?: {
    executiveSummary?: string;
    tiers?: { essentials?: unknown; growth?: unknown; premium?: unknown };
    pricing?: Record<string, unknown>;
  };
  error?: string;
  details?: string;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]/gi, '_').replace(/_+/g, '_').slice(0, 80);
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
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

async function runAudit(target: TargetBusiness): Promise<AuditResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/audit`, {
    method: 'POST',
    body: JSON.stringify({
      url: target.website,
      name: target.businessName,
      city: 'Saskatoon',
      industry: target.vertical,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      success: false,
      error: data.error || res.statusText,
      details: data.details,
    };
  }
  return data as AuditResponse;
}

async function runPropose(auditId: string): Promise<ProposeResponse> {
  const res = await fetchWithAuth(`${BASE_URL}/api/audit/${auditId}/propose`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      success: false,
      error: data.error || res.statusText,
      details: data.details,
    };
  }
  return data as ProposeResponse;
}

async function fetchPdf(webLinkToken: string): Promise<{ buffer: Buffer; size: number } | null> {
  const url = `${BASE_URL}/api/proposal/${webLinkToken}/pdf`;
  const res = await fetch(url);
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

  // 1. All expected modules returned data
  const modulesOk = audit.modulesCompleted && audit.modulesCompleted.length >= EXPECTED_MODULES.length;
  if (!modulesOk) {
    const failed = audit.modulesFailed?.map((m) => m.module).join(', ') || 'unknown';
    issues.push(`Module(s) failed: ${failed}`);
  }

  // 2. Finding count >= 5
  const findingsOk = (audit.findingsCount ?? 0) >= 5;
  if (!findingsOk) {
    issues.push(`Findings ${audit.findingsCount ?? 0} < 5`);
  }

  // 3. Proposal qaScore >= 7/10 (70%)
  const qaScore = propose.qaScore ?? 0;
  const qaOk = qaScore >= 70;
  if (!qaOk) {
    issues.push(`QA score ${qaScore}% < 70%`);
  }

  // 4. Executive summary mentions business name
  const summary = propose.proposal?.executiveSummary ?? '';
  const nameMentioned = summary.toLowerCase().includes(businessName.toLowerCase());
  if (!nameMentioned) {
    issues.push('Executive summary does not mention business name');
  }

  // 5. PDF file size > 50KB
  const pdfOk = pdfSize !== null && pdfSize > 50 * 1024;
  if (!pdfOk) {
    issues.push(`PDF size ${pdfSize ?? 0} bytes <= 50KB`);
  }

  // 6. Pricing tiers present
  const pricing = propose.proposal?.pricing;
  const hasPricing =
    pricing &&
    typeof (pricing as Record<string, unknown>).essentials === 'number' &&
    typeof (pricing as Record<string, unknown>).growth === 'number' &&
    typeof (pricing as Record<string, unknown>).premium === 'number';
  if (!hasPricing) {
    issues.push('Pricing tiers missing or empty');
  }

  const pass = issues.length === 0;
  return { pass, issues };
}

async function processOne(
  target: TargetBusiness,
  index: number,
  total: number
): Promise<BlitzResult> {
  const result: BlitzResult = {
    businessName: target.businessName,
    vertical: target.vertical,
    website: target.website,
    pass: false,
    issues: [],
  };

  const runWithRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      await sleep(RETRY_DELAY_MS);
      return fn();
    }
  };

  try {
    const audit = await runWithRetry(() => runAudit(target));
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
      const verticalDir = path.join(PDF_DIR, target.vertical);
      await fs.ensureDir(verticalDir);
      const filename = `${safeFilename(target.businessName)}.pdf`;
      const pdfPath = path.join(verticalDir, filename);
      await fs.writeFile(pdfPath, pdfResult.buffer);
      result.pdfPath = pdfPath;
    }

    const gate = runQualityGate(audit, propose, pdfSize, target.businessName);
    result.pass = gate.pass;
    result.issues = gate.issues;
  } catch (err) {
    result.issues.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const item = items[i];
      results[i] = await fn(item, i);
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

function printProgress(result: BlitzResult, index: number, total: number): void {
  const icon = result.pass ? '✅' : '❌';
  const qa = result.qaScore !== undefined ? `QA: ${result.qaScore}` : 'N/A';
  const status = result.pass ? 'PASS' : 'FAIL';
  const shortName = result.businessName.slice(0, 35).padEnd(35);
  console.log(`[${index + 1}/${total}] ${icon} ${shortName}... ${status} (${qa})`);
}

function printSummary(results: BlitzResult[]): void {
  const byVertical = new Map<string, BlitzResult[]>();
  for (const r of results) {
    const arr = byVertical.get(r.vertical) ?? [];
    arr.push(r);
    byVertical.set(r.vertical, arr);
  }

  console.log('\n| Vertical        | Audited | Passed | Failed | Avg QA Score | Issues         |');
  console.log('|-----------------|---------|--------|--------|--------------|----------------|');

  let totalAudited = 0;
  let totalPassed = 0;

  for (const [vertical, arr] of byVertical) {
    const audited = arr.length;
    const passed = arr.filter((r) => r.pass).length;
    const failed = audited - passed;
    totalAudited += audited;
    totalPassed += passed;

    const withScore = arr.filter((r) => r.qaScore !== undefined);
    const avgQa =
      withScore.length > 0
        ? (withScore.reduce((s, r) => s + (r.qaScore ?? 0), 0) / withScore.length).toFixed(1)
        : 'N/A';

    const issueSummary =
      failed > 0
        ? arr
            .filter((r) => !r.pass)
            .flatMap((r) => r.issues)
            .slice(0, 1)[0]?.slice(0, 14) ?? 'Various'
        : 'None';

    console.log(
      `| ${vertical.padEnd(15)} | ${String(audited).padStart(7)} | ${String(passed).padStart(6)} | ${String(failed).padStart(6)} | ${String(avgQa).padStart(12)} | ${issueSummary.padEnd(14)} |`
    );
  }

  const totalFailed = totalAudited - totalPassed;
  const overallAvg =
    results.filter((r) => r.qaScore !== undefined).length > 0
      ? (
          results
            .filter((r) => r.qaScore !== undefined)
            .reduce((s, r) => s + (r.qaScore ?? 0), 0) /
          results.filter((r) => r.qaScore !== undefined).length
        ).toFixed(1)
      : 'N/A';

  console.log(
    `| ${'TOTAL'.padEnd(15)} | ${String(totalAudited).padStart(7)} | ${String(totalPassed).padStart(6)} | ${String(totalFailed).padStart(6)} | ${String(overallAvg).padStart(12)} |                |`
  );

  const passRate = totalAudited > 0 ? (totalPassed / totalAudited) * 100 : 0;
  console.log(`\nOverall pass rate: ${passRate.toFixed(1)}% (target: >=90%)`);

  if (passRate < 90 && totalFailed > 0) {
    const failedResults = results.filter((r) => !r.pass);
    const issueCounts = new Map<string, number>();
    for (const r of failedResults) {
      for (const issue of r.issues) {
        const key = issue.split(':')[0] || issue;
        issueCounts.set(key, (issueCounts.get(key) ?? 0) + 1);
      }
    }
    const sorted = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]);
    console.log('\nMost common issues:');
    for (const [issue, count] of sorted.slice(0, 5)) {
      console.log(`  - ${issue}: ${count} occurrences`);
    }
  }

  console.log('\nFailures:');
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`  - ${r.businessName} (${r.vertical}): ${r.issues.join('; ')}`);
    if (r.proposalUrl) console.log(`    URL: ${r.proposalUrl}`);
  }
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('API_KEY is required. Add it to .env');
    process.exit(1);
  }

  if (!(await fs.pathExists(TARGETS_PATH))) {
    console.error(`Target list not found. Run: npm run build-targets`);
    process.exit(1);
  }

  const targets = (await fs.readJson(TARGETS_PATH)) as TargetBusiness[];
  if (targets.length === 0) {
    console.error('Target list is empty.');
    process.exit(1);
  }

  console.log(`\n🚀 Batch Audit Blitz: ${targets.length} businesses`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Max concurrent: ${MAX_CONCURRENT}, Delay: ${DELAY_BETWEEN_STARTS_MS}ms\n`);

  await fs.ensureDir(OUTPUT_DIR);
  await fs.ensureDir(PDF_DIR);

  const results: BlitzResult[] = [];
  let lastStartTime = 0;
  let completedCount = 0;
  let startMutex = Promise.resolve();

  const acquireStartSlot = async (): Promise<void> => {
    const now = Date.now();
    const wait = Math.max(0, lastStartTime + DELAY_BETWEEN_STARTS_MS - now);
    if (wait > 0) await sleep(wait);
    lastStartTime = Date.now();
  };

  const processWithRateLimit = async (
    target: TargetBusiness,
    globalIndex: number
  ): Promise<BlitzResult> => {
    const prev = startMutex;
    let resolve: () => void;
    startMutex = new Promise<void>((r) => (resolve = r));
    await prev;
    await acquireStartSlot();
    resolve!();

    const result = await processOne(target, globalIndex, targets.length);
    completedCount++;
    printProgress(result, completedCount, targets.length);
    return result;
  };

  for (let i = 0; i < targets.length; i += MAX_CONCURRENT) {
    const batch = targets.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((t, j) => processWithRateLimit(t, i + j))
    );
    results.push(...batchResults);
  }

  await fs.writeJson(RESULTS_PATH, results, { spaces: 2 });
  console.log(`\nWrote ${RESULTS_PATH}`);

  printSummary(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
