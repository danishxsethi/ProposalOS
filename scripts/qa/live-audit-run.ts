/**
 * scripts/qa/live-audit-run.ts
 *
 * Live end-to-end audit → proposal run against real providers (Places, PageSpeed,
 * SerpAPI, Gemini). Produces per-run wall/phase/cost/trust evidence and, when the
 * audit is TRUSTED, compiles + auto-promotes a proposal so the public proposal and
 * PDF surfaces can be exercised in a browser.
 *
 * Usage:
 *   DATABASE_URL=... GOOGLE_AI_API_KEY=... GOOGLE_PLACES_API_KEY=... \
 *   GOOGLE_PAGESPEED_API_KEY=... SERP_API_KEY=... \
 *   npx tsx scripts/qa/live-audit-run.ts --tenant <tenantId> --out <dir> \
 *     --business "Name|City|https://url|industry" [--business ...]
 *
 * Never fabricates: every number is measured from the real run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runAudit } from '@/lib/audit/runner';
import { prisma } from '@/lib/prisma';
import { generateProposal } from '@/lib/proposal/runner';
import { runWithTenantAsync } from '@/lib/tenant/context';

type BusinessSpec = { name: string; city: string; url: string; industry: string };

function arg(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

const tenantId = arg('tenant')[0];
const outDir = arg('out')[0] || 'docs/execution/fable-5.1-full-advancement/closure/evidence/live-runs';
const specs: BusinessSpec[] = arg('business').map((raw) => {
  const [name, city, url, industry] = raw.split('|');
  return { name, city, url, industry };
});
if (!tenantId || specs.length === 0) {
  console.error('usage: --tenant <id> --business "Name|City|https://url|industry" [...]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

async function runOne(spec: BusinessSpec) {
  const t0 = Date.now();
  const audit = await runWithTenantAsync(tenantId, () =>
    prisma.audit.create({
      data: {
        tenantId,
        businessName: spec.name,
        businessCity: spec.city,
        businessUrl: spec.url,
        businessIndustry: spec.industry,
        status: 'QUEUED',
      },
    })
  );
  let auditError: string | null = null;
  try {
    await runWithTenantAsync(tenantId, () => runAudit(audit.id));
  } catch (e) {
    auditError = e instanceof Error ? e.message : String(e);
  }
  const auditMs = Date.now() - t0;

  const after = await runWithTenantAsync(tenantId, () =>
    prisma.audit.findUnique({
      where: { id: audit.id },
      include: { findings: { select: { id: true, module: true, type: true, impactScore: true } }, evidence: { select: { id: true, module: true, observationStatus: true } } },
    })
  );

  let proposalMs: number | null = null;
  let proposal: Record<string, unknown> | null = null;
  let proposalError: string | null = null;
  if (after?.status === 'COMPLETE' && after.trustState === 'TRUSTED') {
    const p0 = Date.now();
    try {
      await runWithTenantAsync(tenantId, () => generateProposal(audit.id));
    } catch (e) {
      proposalError = e instanceof Error ? e.message : String(e);
    }
    proposalMs = Date.now() - p0;
    const row = await runWithTenantAsync(tenantId, () =>
      prisma.proposal.findFirst({
        where: { auditId: audit.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, webLinkToken: true, qaScore: true, pricing: true, qaResults: true, executiveSummary: true, version: true },
      })
    );
    if (row) {
      const qa = (row.qaResults ?? {}) as Record<string, unknown>;
      proposal = {
        id: row.id,
        status: row.status,
        webLinkToken: row.webLinkToken,
        version: row.version,
        qaScore: row.qaScore,
        pricing: row.pricing,
        qaStatus: qa.status,
        hardFailures: qa.hardFailures,
        evaluation: (qa.evaluation as Record<string, unknown> | undefined)?.overallScore,
        publicationDecision: (qa.publicationApproval as Record<string, unknown> | undefined)?.decision,
        executiveSummaryChars: row.executiveSummary?.length ?? 0,
      };
    }
  }

  const moduleResults = (after?.moduleResults ?? {}) as Record<string, { status?: string; durationMs?: number; error?: string }>;
  const byStatus: Record<string, number> = {};
  for (const r of Object.values(moduleResults)) byStatus[r.status ?? 'UNKNOWN'] = (byStatus[r.status ?? 'UNKNOWN'] ?? 0) + 1;

  return {
    business: spec,
    auditId: audit.id,
    auditStatus: after?.status,
    trustState: after?.trustState,
    overallScore: after?.overallScore,
    apiCostCents: after?.apiCostCents,
    auditWallMs: auditMs,
    auditError,
    modulesCompleted: after?.modulesCompleted?.length ?? 0,
    modulesFailed: Array.isArray(after?.modulesFailed) ? (after!.modulesFailed as unknown[]).length : 0,
    moduleStatusCounts: byStatus,
    moduleTimingsMs: Object.fromEntries(Object.entries(moduleResults).map(([k, v]) => [k, v.durationMs ?? null])),
    findings: after?.findings.length ?? 0,
    findingsByType: after?.findings.reduce<Record<string, number>>((acc, f) => ((acc[f.type] = (acc[f.type] ?? 0) + 1), acc), {}),
    evidenceSnapshots: after?.evidence.length ?? 0,
    proposalWallMs: proposalMs,
    proposalError,
    proposal,
  };
}

(async () => {
  const results = [];
  for (const spec of specs) {
    console.log(`▶ ${spec.name} (${spec.city})`);
    const r = await runOne(spec);
    console.log(
      `  audit=${r.auditStatus}/${r.trustState} score=${r.overallScore} wall=${r.auditWallMs}ms cost=${r.apiCostCents}¢ modules=${r.modulesCompleted}✓/${r.modulesFailed}✗ findings=${r.findings} proposal=${r.proposal ? `${r.proposal.status} qa=${r.proposal.qaScore} ${r.proposalWallMs}ms` : r.proposalError ?? 'skipped'}`
    );
    results.push(r);
    writeFileSync(join(outDir, `${new Date().toISOString().slice(0, 10)}-${spec.industry}-${spec.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`), JSON.stringify(r, null, 2));
  }
  const walls = results.map((r) => r.auditWallMs).sort((a, b) => a - b);
  const pct = (p: number) => walls[Math.min(walls.length - 1, Math.floor((p / 100) * walls.length))];
  const summary = {
    generatedAt: new Date().toISOString(),
    sampleSize: results.length,
    trusted: results.filter((r) => r.trustState === 'TRUSTED').length,
    degraded: results.filter((r) => r.trustState === 'DEGRADED_REVIEW_REQUIRED').length,
    failed: results.filter((r) => r.auditStatus === 'FAILED' || r.auditError).length,
    auditWallMs: { p50: pct(50), p90: pct(90), p95: pct(95), max: walls[walls.length - 1], samples: walls },
    costCents: results.map((r) => r.apiCostCents),
    proposals: results.filter((r) => r.proposal).map((r) => ({ business: r.business.name, status: r.proposal!.status, qaScore: r.proposal!.qaScore, wallMs: r.proposalWallMs })),
  };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('LIVE_RUN_FAIL', e);
  await prisma.$disconnect();
  process.exit(1);
});
