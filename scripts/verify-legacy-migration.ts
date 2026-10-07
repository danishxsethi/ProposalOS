/**
 * verify-legacy-migration.ts
 *
 * Post-migration verifier for scripts/check-legacy-migration.sh. Connects to
 * the disposable database (DATABASE_URL) after the pre-R1 fixture has been
 * carried through the current Prisma migrations and asserts:
 *
 *   1. Row preservation — every seeded tenant/audit/finding/evidence/job row
 *      still exists (counts match the fixture).
 *   2. Tenant preservation — every row's tenantId matches its fixture value
 *      (incl. backfilled FindingStatus rows).
 *   3. Relationship preservation — findings/evidence/jobs still resolve to
 *      their parent audits/tenants.
 *   4. Confidence normalization — legacy >10 percentages scaled to 0-10,
 *      in-scale values unchanged, all values within the new CHECK constraint.
 *   5. Valid enums — status/trustState/type values are members of the current
 *      Prisma enums; R1 columns got their defaults.
 *   6. Prisma readback — rows are readable through the current generated
 *      Prisma client (schema/runtime agreement).
 *
 * Writes machine-readable evidence to LEGACY_ARTIFACT (default
 * docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/legacy-migration.json).
 * Exits 0 on PASS, 1 on FAIL.
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ARTIFACT =
  process.env.LEGACY_ARTIFACT ??
  'docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/legacy-migration.json';

const TENANT_A = '00000000-0000-4000-8000-0000000000a1';
const TENANT_B = '00000000-0000-4000-8000-0000000000b2';
const AUDIT_1 = '00000000-0000-4000-8000-0000000000c1';
const AUDIT_2 = '00000000-0000-4000-8000-0000000000c2';
const AUDIT_3 = '00000000-0000-4000-8000-0000000000c3';

// Finding id -> expected confidenceScore after R1 normalization.
// Legacy rule (20260924000000_audit_trust_contract): >10 is a percentage and
// becomes round(v/10); <=10 is already on the 0-10 product scale.
const EXPECTED_CONFIDENCE: Record<string, number> = {
  '00000000-0000-4000-8000-0000000000d1': 0, // boundary low, unchanged
  '00000000-0000-4000-8000-0000000000d2': 7, // in-scale, unchanged
  '00000000-0000-4000-8000-0000000000d3': 4, // 42 -> round(4.2)
  '00000000-0000-4000-8000-0000000000d4': 10, // boundary 100 -> 10
  '00000000-0000-4000-8000-0000000000d5': 6, // 55 -> round(5.5) (PG half-up)
  '00000000-0000-4000-8000-0000000000d6': 10, // 95 -> round(9.5)
};

const FINDING_TENANT: Record<string, string> = {
  '00000000-0000-4000-8000-0000000000d1': TENANT_A,
  '00000000-0000-4000-8000-0000000000d2': TENANT_A,
  '00000000-0000-4000-8000-0000000000d3': TENANT_A,
  '00000000-0000-4000-8000-0000000000d4': TENANT_B,
  '00000000-0000-4000-8000-0000000000d5': TENANT_B,
  '00000000-0000-4000-8000-0000000000d6': TENANT_B,
};

const VALID_AUDIT_STATUS = new Set(['QUEUED', 'RUNNING', 'COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED']);
const VALID_TRUST_STATE = new Set(['PENDING', 'TRUSTED', 'DEGRADED_REVIEW_REQUIRED', 'FAILED']);
const VALID_FINDING_TYPE = new Set([
  'PAINKILLER', 'VITAMIN', 'POSITIVE', 'VISUAL_UX', 'VISUAL_DESIGN', 'VISUAL_COMPARISON',
]);

type Check = { name: string; pass: boolean; detail?: unknown };

const checks: Check[] = [];
function check(name: string, pass: boolean, detail?: unknown) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : '  ' + JSON.stringify(detail)}`);
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    // ── Raw SQL assertions ──────────────────────────────────────────────────
    const counts = await prisma.$queryRawUnsafe<Array<{ rel: string; n: number }>>(`
      SELECT 'Tenant' AS rel, COUNT(*)::int AS n FROM "Tenant"
        WHERE id IN ('${TENANT_A}','${TENANT_B}')
      UNION ALL SELECT 'Audit', COUNT(*)::int FROM "Audit"
        WHERE id IN ('${AUDIT_1}','${AUDIT_2}','${AUDIT_3}')
      UNION ALL SELECT 'Finding', COUNT(*)::int FROM "Finding"
        WHERE id LIKE '00000000-0000-4000-8000-0000000000d_'
      UNION ALL SELECT 'EvidenceSnapshot', COUNT(*)::int FROM "EvidenceSnapshot"
        WHERE id LIKE '00000000-0000-4000-8000-0000000000e_'
      UNION ALL SELECT 'audit_jobs', COUNT(*)::int FROM "audit_jobs"
        WHERE id LIKE '00000000-0000-4000-8000-0000000000f_'
      UNION ALL SELECT 'FindingStatus', COUNT(*)::int FROM "FindingStatus"
        WHERE id LIKE '00000000-0000-4000-8000-00000000005_'
      UNION ALL SELECT 'AuditTrailEvent', COUNT(*)::int FROM "AuditTrailEvent"
        WHERE id = '00000000-0000-4000-8000-000000000061'
    `);
    const expectedCounts: Record<string, number> = {
      Tenant: 2, Audit: 3, Finding: 6, EvidenceSnapshot: 3, audit_jobs: 3,
      FindingStatus: 2, AuditTrailEvent: 1,
    };
    for (const [rel, n] of Object.entries(expectedCounts)) {
      const got = counts.find((c) => c.rel === rel)?.n;
      check(`row-preservation:${rel}`, got === n, { expected: n, got });
    }

    // Tenant preservation on every seeded finding.
    const findingRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; tenantId: string; confidenceScore: number; type: string; confidenceLevel: string | null }>
    >(`SELECT id, "tenantId", "confidenceScore", type, "confidenceLevel" FROM "Finding"
        WHERE id LIKE '00000000-0000-4000-8000-0000000000d_' ORDER BY id`);
    check(
      'tenant-preservation:Finding',
      findingRows.every((r) => r.tenantId === FINDING_TENANT[r.id]),
      findingRows,
    );
    check(
      'confidence-normalization',
      findingRows.every((r) => r.confidenceScore === EXPECTED_CONFIDENCE[r.id]),
      findingRows.map((r) => ({ id: r.id, got: r.confidenceScore, expected: EXPECTED_CONFIDENCE[r.id] })),
    );
    check(
      'confidence-constraint-range',
      findingRows.every((r) => r.confidenceScore >= 0 && r.confidenceScore <= 10),
      findingRows.map((r) => r.confidenceScore),
    );
    check(
      'valid-enum:FindingType',
      findingRows.every((r) => VALID_FINDING_TYPE.has(r.type)),
      findingRows.map((r) => r.type),
    );

    // Nullable record survived: d4 had NULL description/effortEstimate/confidenceLevel.
    const d4 = findingRows.find((r) => r.id === '00000000-0000-4000-8000-0000000000d4');
    check('nullable-record-preserved', d4 !== undefined && d4.confidenceLevel === null, d4);

    // Relationship preservation: no orphaned findings/evidence; jobs reference audits.
    const orphans = await prisma.$queryRawUnsafe<Array<{ rel: string; n: number }>>(`
      SELECT 'Finding' AS rel, COUNT(*)::int AS n FROM "Finding" f
        WHERE f.id LIKE '00000000-0000-4000-8000-0000000000d_'
          AND NOT EXISTS (SELECT 1 FROM "Audit" a WHERE a.id = f."auditId")
      UNION ALL
      SELECT 'EvidenceSnapshot', COUNT(*)::int FROM "EvidenceSnapshot" e
        WHERE e.id LIKE '00000000-0000-4000-8000-0000000000e_'
          AND NOT EXISTS (SELECT 1 FROM "Audit" a WHERE a.id = e."auditId")
      UNION ALL
      SELECT 'audit_jobs', COUNT(*)::int FROM "audit_jobs" j
        WHERE j.id LIKE '00000000-0000-4000-8000-0000000000f_'
          AND NOT EXISTS (SELECT 1 FROM "Audit" a WHERE a.id = j."auditId")
      UNION ALL
      SELECT 'FindingStatus', COUNT(*)::int FROM "FindingStatus" s
        WHERE s.id LIKE '00000000-0000-4000-8000-00000000005_'
          AND NOT EXISTS (SELECT 1 FROM "Finding" f WHERE f.id = s."findingId")
    `);
    for (const o of orphans) {
      check(`relationship-preservation:${o.rel}`, o.n === 0, o);
    }

    // FindingStatus tenant preservation (values match parent finding tenants).
    const statusRows = await prisma.$queryRawUnsafe<Array<{ id: string; tenantId: string }>>(
      `SELECT id, "tenantId" FROM "FindingStatus" WHERE id LIKE '00000000-0000-4000-8000-00000000005_'`,
    );
    const expectedStatusTenant: Record<string, string> = {
      '00000000-0000-4000-8000-000000000051': TENANT_A,
      '00000000-0000-4000-8000-000000000052': TENANT_B,
    };
    check(
      'tenant-preservation:FindingStatus',
      statusRows.length === 2 && statusRows.every((r) => r.tenantId === expectedStatusTenant[r.id]),
      statusRows,
    );

    // Enum / default correctness on audits.
    const auditRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; trustState: string; moduleResults: unknown }>
    >(`SELECT id, status::text, "trustState"::text, "moduleResults" FROM "Audit"
        WHERE id IN ('${AUDIT_1}','${AUDIT_2}','${AUDIT_3}')`);
    check('valid-enum:AuditStatus', auditRows.every((r) => VALID_AUDIT_STATUS.has(r.status)), auditRows.map((r) => r.status));
    check('valid-enum:AuditTrustState', auditRows.every((r) => VALID_TRUST_STATE.has(r.trustState)), auditRows.map((r) => r.trustState));
    check('r1-default:trustState=PENDING', auditRows.every((r) => r.trustState === 'PENDING'), auditRows.map((r) => r.trustState));

    // Evidence R1 provenance columns got defaults.
    const evRows = await prisma.$queryRawUnsafe<Array<{ observationStatus: string }>>(
      `SELECT "observationStatus" FROM "EvidenceSnapshot" WHERE id LIKE '00000000-0000-4000-8000-0000000000e_'`,
    );
    check('r1-default:observationStatus=COMPLETE', evRows.every((r) => r.observationStatus === 'COMPLETE'), evRows);

    // audit_jobs generateProposal default added by the final migration.
    const jobRows = await prisma.$queryRawUnsafe<Array<{ status: string; generateProposal: boolean }>>(
      `SELECT status, "generateProposal" FROM "audit_jobs" WHERE id LIKE '00000000-0000-4000-8000-0000000000f_'`,
    );
    check('r1-default:generateProposal=true', jobRows.length === 3 && jobRows.every((r) => r.generateProposal === true), jobRows);
    check('job-states-preserved', JSON.stringify(jobRows.map((r) => r.status).sort()) === JSON.stringify(['DEAD', 'QUEUED', 'SUCCEEDED']), jobRows.map((r) => r.status));

    // ── Prisma readback through the current generated client ────────────────
    const auditReadback = await prisma.audit.findUnique({
      where: { id: AUDIT_1 },
      include: { findings: true, evidence: true, tenant: true },
    });
    check(
      'prisma-readback:audit-with-relations',
      auditReadback !== null &&
        auditReadback.tenant.id === TENANT_A &&
        auditReadback.findings.length === 3 &&
        auditReadback.evidence.length === 2 &&
        auditReadback.trustState === 'PENDING',
      auditReadback && { findings: auditReadback.findings.length, evidence: auditReadback.evidence.length },
    );

    const jobReadback = await prisma.auditJob.findUnique({ where: { idempotencyKey: 'legacy-key-2' } });
    check(
      'prisma-readback:auditJob',
      jobReadback !== null && jobReadback.status === 'DEAD' && jobReadback.generateProposal === true,
      jobReadback && { status: jobReadback.status },
    );

    const tenantAudits = await prisma.audit.count({ where: { tenantId: TENANT_B } });
    check('prisma-readback:tenant-scoped-count', tenantAudits === 1, { tenantAudits });
  } finally {
    await prisma.$disconnect();
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  const evidence = {
    artifact: 'legacy-migration',
    generatedAt: new Date().toISOString(),
    databaseUrl: (process.env.DATABASE_URL ?? '').replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
    checkpoint: {
      preR1LastMigration: '20260713090000_wave9d_lifecycle_controls',
      appliedByScript: 'scripts/check-legacy-migration.sh',
      fixture: 'scripts/fixtures/legacy-pre-r1-seed.sql',
      replayGuard: 'scripts/check-migration-replay.sh',
    },
    summary: { total: checks.length, passed, failed, verdict: failed === 0 ? 'PASS' : 'FAIL' },
    checks,
  };
  mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${checks.length} checks passed. Evidence written to ${ARTIFACT}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
