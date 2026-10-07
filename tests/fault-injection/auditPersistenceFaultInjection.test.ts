// @vitest-environment node
/**
 * tests/fault-injection/auditPersistenceFaultInjection.test.ts
 *
 * REAL-PostgreSQL qualification of the atomic audit persistence boundary
 * (lib/audit/findingPersistence.ts::persistAuditResult) against a disposable,
 * migrated database. No database mocks: every failure is a genuine Postgres
 * error raised by a test-installed database trigger INSIDE the production
 * interactive transaction, so the rollback semantics under test are the real
 * database's. No production bypass changes — triggers are installed via the
 * superuser fixture connection and dropped after each test.
 *
 * Covers:
 *   1. Failure at the evidence-write stage (before any finding row).
 *   2. Failure at the finding-write stage (after evidence rows were written
 *      in-transaction — they must be rolled back).
 *   3. Failure at the audit finalization update (after evidence + findings —
 *      everything must be rolled back).
 *   4. Rollback leaves zero partial rows in any table.
 *   5. Retry after a rolled-back attempt succeeds and writes each row set
 *      exactly once (idempotence-safe retry).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { activateRealDb, type RealDbSession } from '../helpers/realDb';

const session: RealDbSession = await activateRealDb('persistence');

// Import production code under test AFTER the disposable DATABASE_URL is live.
const { persistAuditResult } = await import('@/lib/audit/findingPersistence');
const { runWithTenantAsync, runWithTenantBypass } = await import('@/lib/tenant/context');

const VALID_FINDING = {
  module: 'website',
  category: 'Performance',
  type: 'VITAMIN',
  title: 'Measured optimization opportunity',
  description: 'Real measured opportunity backed by evidence.',
  impactScore: 4,
  confidenceScore: 8,
  evidence: [
    {
      pointer: 'https://business.test/report',
      source: 'pagespeed',
      collected_at: new Date().toISOString(),
      value: 70,
    },
  ],
  metrics: {},
  recommendedFix: ['Compress hero image'],
};

const VALID_EVIDENCE = {
  module: 'website',
  source: 'pagespeed',
  rawResponse: { scores: { performance: 0.7 } },
  targetUrl: 'https://business.test',
};

type FaultStage = 'evidence' | 'finding' | 'finalization';

const FAULT_TRIGGERS: Record<FaultStage, { name: string; ddl: string; drop: string }> = {
  evidence: {
    name: 'fi_evidence_fail',
    ddl: `CREATE TRIGGER fi_evidence_fail BEFORE INSERT ON "EvidenceSnapshot"
          FOR EACH ROW EXECUTE FUNCTION fi_raise()`,
    drop: 'DROP TRIGGER IF EXISTS fi_evidence_fail ON "EvidenceSnapshot"',
  },
  finding: {
    name: 'fi_finding_fail',
    ddl: `CREATE TRIGGER fi_finding_fail BEFORE INSERT ON "Finding"
          FOR EACH ROW EXECUTE FUNCTION fi_raise()`,
    drop: 'DROP TRIGGER IF EXISTS fi_finding_fail ON "Finding"',
  },
  finalization: {
    name: 'fi_finalization_fail',
    ddl: `CREATE TRIGGER fi_finalization_fail BEFORE UPDATE ON "Audit"
          FOR EACH ROW EXECUTE FUNCTION fi_raise()`,
    drop: 'DROP TRIGGER IF EXISTS fi_finalization_fail ON "Audit"',
  },
};

async function installFault(stage: FaultStage): Promise<void> {
  const fault = FAULT_TRIGGERS[stage];
  await runWithTenantBypass('test-fixture:install-fault-trigger', async () => {
    await session.admin.$executeRawUnsafe(fault.drop);
    await session.admin.$executeRawUnsafe(fault.ddl);
  });
}

async function clearFault(stage: FaultStage): Promise<void> {
  await runWithTenantBypass('test-fixture:drop-fault-trigger', () =>
    session.admin.$executeRawUnsafe(FAULT_TRIGGERS[stage].drop)
  );
}

describe('audit persistence fault injection (real PostgreSQL, disposable DB)', () => {
  let tenantId: string;
  let auditId: string;

  const counts = () =>
    runWithTenantBypass('test-fixture:count-rows', async () => ({
      evidence: await session.admin.evidenceSnapshot.count({ where: { auditId } }),
      findings: await session.admin.finding.count({ where: { auditId } }),
    }));
  const auditRow = () =>
    runWithTenantBypass('test-fixture:read-audit', () =>
      session.admin.audit.findUniqueOrThrow({ where: { id: auditId } })
    );
  const persist = () =>
    runWithTenantAsync(tenantId, () =>
      persistAuditResult({
        auditId,
        tenantId,
        findings: [VALID_FINDING],
        evidence: [VALID_EVIDENCE],
        auditUpdate: { status: 'COMPLETE', trustState: 'TRUSTED' },
      })
    );

  beforeAll(async () => {
    tenantId = randomUUID();
    auditId = randomUUID();
    await runWithTenantBypass('test-fixture:create-tenant', () =>
      session.admin.tenant.create({ data: { id: tenantId, name: 'FI Tenant', slug: `fi-${tenantId}` } })
    );
    await runWithTenantBypass('test-fixture:create-audit', () =>
      session.admin.audit.create({
        data: { id: auditId, tenantId, businessName: 'FI Business', status: 'RUNNING' },
      })
    );
    await runWithTenantBypass('test-fixture:create-fault-function', () =>
      session.admin.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION fi_raise() RETURNS trigger AS $$
         BEGIN
           RAISE EXCEPTION 'fault injected at %', TG_TABLE_NAME;
         END $$ LANGUAGE plpgsql`
      )
    );
  });

  afterAll(async () => {
    for (const stage of Object.keys(FAULT_TRIGGERS) as FaultStage[]) {
      await clearFault(stage).catch(() => {});
    }
    await session.cleanup();
  });

  it('fails before the finding stage when evidence write faults; no partial rows survive', async () => {
    await installFault('evidence');
    try {
      await expect(persist()).rejects.toThrow('fault injected at EvidenceSnapshot');
    } finally {
      await clearFault('evidence');
    }

    expect(await counts()).toEqual({ evidence: 0, findings: 0 });
    expect((await auditRow()).status).toBe('RUNNING');
  });

  it('fails at the finding stage after evidence was written in-transaction; evidence rolls back too', async () => {
    await installFault('finding');
    try {
      await expect(persist()).rejects.toThrow('fault injected at Finding');
    } finally {
      await clearFault('finding');
    }

    expect(await counts()).toEqual({ evidence: 0, findings: 0 });
    expect((await auditRow()).status).toBe('RUNNING');
  });

  it('fails at audit finalization after evidence+findings; the whole batch rolls back', async () => {
    await installFault('finalization');
    try {
      await expect(persist()).rejects.toThrow('fault injected at Audit');
    } finally {
      await clearFault('finalization');
    }

    expect(await counts()).toEqual({ evidence: 0, findings: 0 });
    const audit = await auditRow();
    expect(audit.status).toBe('RUNNING');
    expect(audit.trustState).toBe('PENDING');
  });

  it('retry after rollback succeeds atomically and writes each row set exactly once', async () => {
    const result = await persist();

    expect(result).toMatchObject({ persistedFindings: 1, persistedEvidence: 1, rejectedFindings: [] });
    expect(await counts()).toEqual({ evidence: 1, findings: 1 });
    const audit = await auditRow();
    expect(audit.status).toBe('COMPLETE');
    expect(audit.trustState).toBe('TRUSTED');
  });
});
