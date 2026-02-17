#!/usr/bin/env node
/**
 * Full E2E Audit Test: Single + Batch, Findings, Proposal, PDF
 *
 * Usage:
 *   API_KEY=your-key node scripts/e2e-full-audit.js [--base-url=http://localhost:3000]
 *
 * Requires: API_KEY in env (or pe_live_* from DB). Optional: DEFAULT_TENANT_ID, x-tenant-id.
 * Server must be running: npm run dev
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const BASE_URL =
  process.env.BASE_URL ||
  process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1] ||
  'http://localhost:3000';

const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.DEFAULT_TENANT_ID || process.env.E2E_TENANT_ID;

function headers() {
  const h = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  };
  if (TENANT_ID) h['x-tenant-id'] = TENANT_ID;
  return h;
}

// Single audit: url is required by schema
const SINGLE_BUSINESS = {
  name: "Joe's Plumbing",
  city: 'Saskatoon',
  url: 'https://www.google.com',
  industry: 'trades',
};

// Batch: name+city required, url optional
const BATCH_BUSINESSES = [
  { name: "Joe's Plumbing", city: 'Saskatoon', url: 'https://www.google.com', industry: 'trades' },
  { name: 'Main Street Dental', city: 'Toronto', industry: 'dental' },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSingleAudit() {
  console.log('\n' + '='.repeat(60));
  console.log('SINGLE AUDIT');
  console.log('='.repeat(60));

  const res = await fetch(`${BASE_URL}/api/audit`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      url: SINGLE_BUSINESS.url,
      name: SINGLE_BUSINESS.name,
      city: SINGLE_BUSINESS.city,
      industry: SINGLE_BUSINESS.industry,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Single audit failed: ${JSON.stringify(data)}`);
  }

  console.log(`  Audit ID: ${data.auditId}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Findings: ${data.findingsCount}`);
  console.log(`  Modules: ${(data.modulesCompleted || []).join(', ')}`);
  return data.auditId;
}

async function runPropose(auditId) {
  const res = await fetch(`${BASE_URL}/api/audit/${auditId}/propose`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({}),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Propose failed: ${JSON.stringify(data)}`);
  }

  console.log(`  Proposal ID: ${data.proposalId}`);
  console.log(`  Executive Summary: ${(data.proposal?.executiveSummary || '').slice(0, 80)}...`);
  return data;
}

async function fetchPdf(token) {
  const res = await fetch(`${BASE_URL}/api/proposal/${token}/pdf`, {
    method: 'GET',
    redirect: 'manual',
  });

  if (res.status === 302 || res.status === 301) {
    const loc = res.headers.get('location');
    if (loc) {
      const pdfRes = await fetch(loc);
      const buf = await pdfRes.arrayBuffer();
      return buf.byteLength;
    }
  }

  if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
    const buf = await res.arrayBuffer();
    return buf.byteLength;
  }

  const text = await res.text();
  throw new Error(`PDF fetch failed: ${res.status} ${text.slice(0, 200)}`);
}

async function getFindings(auditId) {
  const res = await fetch(`${BASE_URL}/api/audit/${auditId}`, {
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Get audit failed: ${JSON.stringify(data)}`);
  return data;
}

async function runBatchAudit() {
  console.log('\n' + '='.repeat(60));
  console.log('BATCH AUDIT');
  console.log('='.repeat(60));

  const res = await fetch(`${BASE_URL}/api/audit/batch`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ businesses: BATCH_BUSINESSES }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Batch create failed: ${JSON.stringify(data)}`);
  }

  console.log(`  Batch ID: ${data.batchId}`);
  console.log(`  Audit IDs: ${(data.auditIds || []).join(', ')}`);
  return data;
}

async function pollBatchStatus(batchId) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${BASE_URL}/api/audit/batch/${batchId}`, {
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Batch status failed: ${JSON.stringify(data)}`);

    const { status, summary } = data;
    console.log(`  Poll ${i + 1}: ${status} - completed: ${summary?.completed}, failed: ${summary?.failed}, pending: ${summary?.pending}`);

    if (status === 'COMPLETED') {
      return data;
    }
    await sleep(5000);
  }
  throw new Error('Batch did not complete within 5 minutes');
}

async function getProposalTokenForAudit(auditId) {
  const res = await fetch(`${BASE_URL}/api/audit/${auditId}`, {
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Get audit failed: ${JSON.stringify(data)}`);
  const proposal = data.proposal || data.proposals?.[0];
  if (!proposal?.webLinkToken) {
    throw new Error(`No proposal found for audit ${auditId}`);
  }
  return proposal.webLinkToken;
}

async function main() {
  if (!API_KEY) {
    console.error('❌ API_KEY required. Set in .env.local or env.');
    process.exit(1);
  }

  console.log('\n🧪 Full E2E Audit Test');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Auth: Bearer ${API_KEY?.slice(0, 12)}...`);

  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    if (healthRes.ok) {
      console.log('   ✓ Server healthy\n');
    } else {
      const data = await healthRes.json().catch(() => ({}));
      console.log(`   ⚠ Server responded ${healthRes.status} (DB may be down)\n`);
    }
  } catch (e) {
    console.error('❌ Server not reachable. Run: npm run dev');
    process.exit(1);
  }

  let failures = 0;

  // --- Single Audit ---
  try {
    const auditId = await runSingleAudit();

    console.log('\n  📋 Verify findings...');
    const auditData = await getFindings(auditId);
    const findings = auditData.findings || [];
    console.log(`  ✓ Findings count: ${findings.length}`);
    if (findings.length > 0) {
      console.log(`  Sample: ${findings[0].title} (${findings[0].type})`);
    }

    console.log('\n  📝 Generate proposal...');
    const proposeData = await runPropose(auditId);
    const token = proposeData.proposal?.webLinkToken || proposeData.webLinkToken;
    if (!token) {
      throw new Error('No webLinkToken in proposal response');
    }

    console.log('\n  📄 Fetch PDF...');
    const pdfSize = await fetchPdf(token);
    console.log(`  ✓ PDF size: ${pdfSize} bytes`);

    console.log('\n✅ Single audit → findings → proposal → PDF: PASSED');
  } catch (e) {
    console.error('\n❌ Single audit flow failed:', e.message);
    failures++;
  }

  // --- Batch Audit ---
  try {
    const { batchId, auditIds } = await runBatchAudit();
    if (!auditIds?.length) {
      throw new Error('No audit IDs returned');
    }

    console.log('\n  ⏳ Polling batch status...');
    const batchData = await pollBatchStatus(batchId);

    const completed = (batchData.audits || []).filter((a) => a.status === 'COMPLETE' || a.status === 'PARTIAL');
    if (completed.length === 0) {
      throw new Error('No completed audits in batch');
    }

    console.log(`\n  ✓ Batch complete: ${completed.length} succeeded`);

    const firstCompletedId = completed[0].id;
    console.log(`\n  📋 Verify batch audit findings: ${firstCompletedId}`);
    const batchAuditData = await getFindings(firstCompletedId);
    const batchFindings = batchAuditData.findings || [];
    console.log(`  ✓ Findings: ${batchFindings.length}`);

    console.log('\n  📝 Generate proposal for batch audit...');
    const proposeData = await runPropose(firstCompletedId);
    const batchToken = proposeData.proposal?.webLinkToken || proposeData.webLinkToken;
    if (!batchToken) {
      throw new Error('No webLinkToken in proposal response');
    }
    console.log(`\n  📄 Fetch batch proposal PDF...`);
    const batchPdfSize = await fetchPdf(batchToken);
    console.log(`  ✓ PDF size: ${batchPdfSize} bytes`);

    console.log('\n✅ Batch audit → findings → proposal → PDF: PASSED');
  } catch (e) {
    console.error('\n❌ Batch audit flow failed:', e.message);
    failures++;
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  if (failures > 0) {
    console.log(`\n❌ ${failures} flow(s) failed`);
    process.exit(1);
  }
  console.log('\n✅ All E2E flows passed: single + batch, findings, proposal, PDF');
  process.exit(0);
}

main();
