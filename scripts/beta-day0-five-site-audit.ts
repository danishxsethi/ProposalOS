#!/usr/bin/env npx ts-node
/**
 * Beta Day-0 Pilot Test Script: Audit 5 real websites via proposal-engine-staging.
 * Usage: npx ts-node scripts/beta-day0-five-site-audit.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const STAGING_URL =
  process.env.STAGING_URL || 'https://proposal-engine-staging-ouitkhk5xq-uc.a.run.app';
const API_KEY = process.env.API_KEY || 'local-dev-api-key-change-in-production';
const TENANT_ID = process.env.DEFAULT_TENANT_ID || '40aaeade-8c22-4848-ae44-79fb030b4553';

console.log('STAGING_URL:', STAGING_URL);
console.log('TENANT_ID:', TENANT_ID);
console.log('API_KEY (obfuscated):', API_KEY ? `${API_KEY.slice(0, 8)}...` : 'not set');

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
    'x-tenant-id': TENANT_ID,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSingleAudit(site: { name: string; url: string; category: string }): Promise<any> {
  const startTime = Date.now();
  console.log(`\n🚀 [KICKOFF] Starting audit for ${site.name} (${site.url})...`);

  // 1. Submit audit request
  const submitRes = await fetch(`${STAGING_URL}/api/audit`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      url: site.url,
      industry: 'Generic',
      businessName: site.name,
      businessCity: 'Saskatoon',
    }),
  });

  const submitData = await submitRes.json();
  if (!submitRes.ok) {
    throw new Error(`Failed to submit audit for ${site.name}: ${JSON.stringify(submitData)}`);
  }

  const auditId = submitData.auditId || submitData.id;
  console.log(`   ✓ Audit triggered with ID: ${auditId}. Initial status: ${submitData.status}`);

  // 2. Poll until terminal status
  const maxPollSeconds = 180;
  const pollIntervalMs = 5000;
  let status = submitData.status || 'QUEUED';
  let auditRecord: any = null;
  const pollStart = Date.now();

  while (true) {
    const elapsedSeconds = Math.round((Date.now() - pollStart) / 1000);
    if (elapsedSeconds > maxPollSeconds) {
      console.warn(`   ⚠️ Timeout after ${maxPollSeconds}s polling audit ${auditId}`);
      break;
    }

    await sleep(pollIntervalMs);

    const pollRes = await fetch(`${STAGING_URL}/api/audit/${auditId}`, {
      headers: headers(),
    });

    if (!pollRes.ok) {
      console.error(`   ❌ Failed to poll audit ${auditId}: status ${pollRes.status}`);
      continue;
    }

    auditRecord = await pollRes.json();
    status = auditRecord.status;
    console.log(`   [Polling ${elapsedSeconds}s] Status: ${status}`);

    if (['COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED'].includes(status)) {
      break;
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `   🏁 Terminal status for ${site.name}: ${status} in ${Math.round(durationMs / 1000)}s`
  );

  let findingsCount = 0;
  let modulesCompleted: string[] = [];
  let modulesFailed: string[] = [];
  let topFindings: string[] = [];

  if (auditRecord) {
    findingsCount = auditRecord.findings?.length || 0;
    modulesCompleted = auditRecord.modulesCompleted || [];
    try {
      modulesFailed =
        typeof auditRecord.modulesFailed === 'string'
          ? JSON.parse(auditRecord.modulesFailed)
          : auditRecord.modulesFailed || [];
    } catch {
      modulesFailed = [];
    }
    // Collect first 3 finding titles
    topFindings = (auditRecord.findings || []).slice(0, 3).map((f: any) => f.title);
  }

  // 3. Trigger proposal if not FAILED
  let proposalData: any = null;
  if (['COMPLETE', 'PARTIAL', 'DEGRADED'].includes(status)) {
    console.log(`   📝 Triggering proposal generation for ${site.name}...`);
    try {
      const proposeRes = await fetch(`${STAGING_URL}/api/audit/${auditId}/propose`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      });

      proposalData = await proposeRes.json();
      if (!proposeRes.ok) {
        console.error(`   ❌ Proposal generation failed for ${site.name}:`, proposalData);
      } else {
        console.log(
          `   ✓ Proposal generated. ID: ${proposalData.proposalId}, Status: ${proposalData.status}, QA Score: ${proposalData.qaScore}`
        );
      }
    } catch (err: any) {
      console.error(`   ❌ Exception triggering proposal for ${site.name}:`, err.message);
    }
  }

  return {
    name: site.name,
    url: site.url,
    category: site.category,
    auditId,
    status,
    latencyMs: durationMs,
    findingsCount,
    modulesCompleted,
    modulesFailed,
    topFindings,
    proposalId: proposalData?.proposalId || null,
    proposalStatus: proposalData?.status || null,
    autoQaScore: proposalData?.qaScore || null,
    clientScore: proposalData?.clientScore || null,
    webLinkToken: proposalData?.webLinkToken || null,
    proposalUrl: proposalData?.webLinkToken
      ? `${STAGING_URL}/proposal/${proposalData.webLinkToken}`
      : null,
    rawProposal: proposalData?.proposal || null,
  };
}

async function main() {
  const inputsPath = path.join(
    process.cwd(),
    'docs',
    'remediation',
    '029-beta-day0-five-site-audit-inputs.json'
  );
  if (!fs.existsSync(inputsPath)) {
    console.error(`❌ Inputs file not found at ${inputsPath}`);
    process.exit(1);
  }

  const inputPayload = JSON.parse(fs.readFileSync(inputsPath, 'utf-8'));
  const websites = inputPayload.websites;

  console.log(`🧪 Launching Beta Day-0 pilot runs for ${websites.length} websites...`);

  const results: any[] = [];
  for (const site of websites) {
    try {
      const res = await runSingleAudit(site);
      results.push(res);
    } catch (err: any) {
      console.error(`❌ Complete failure running audit for ${site.name}:`, err.message);
      results.push({
        name: site.name,
        url: site.url,
        category: site.category,
        auditId: null,
        status: 'FAILED',
        latencyMs: 0,
        findingsCount: 0,
        modulesCompleted: [],
        modulesFailed: [],
        topFindings: [],
        proposalId: null,
        proposalStatus: 'FAILED',
        autoQaScore: null,
        clientScore: null,
        webLinkToken: null,
        proposalUrl: null,
        error: err.message,
      });
    }
    // Delay slightly between runs to be safe
    await sleep(2000);
  }

  const outDir = path.join(process.cwd(), 'docs', 'remediation');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, '029-beta-day0-five-site-audit-evidence.json');

  const evidencePayload = {
    runName: inputPayload.runName,
    environment: inputPayload.environment,
    runAt: new Date().toISOString(),
    baseUrl: STAGING_URL,
    results,
  };

  fs.writeFileSync(outPath, JSON.stringify(evidencePayload, null, 2), 'utf-8');
  console.log(`\n🎉 Pilot run completed! Raw evidence saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
