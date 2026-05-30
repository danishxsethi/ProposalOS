import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';
import { createExtendedPrismaClient } from '../lib/prisma';
import { runWithTenantAsync } from '../lib/tenant/context';


type ResultRow = {
  test: string;
  connectingRole: string;
  path: string;
  tenantContext: string;
  expected: string;
  actual: string;
  pass: boolean;
};

const DEFAULT_POSTGRES_PGBOUNCER_URL =
  'postgresql://postgres:password@localhost:6432/proposal_rls_smoke?pgbouncer=true';
const DEFAULT_POSTGRES_DIRECT_URL =
  'postgresql://postgres:password@localhost:5435/proposal_rls_smoke';
const DEFAULT_APP_USER_PGBOUNCER_URL =
  'postgresql://app_user:password@localhost:6432/proposal_rls_smoke?pgbouncer=true';
const DEFAULT_APP_USER_DIRECT_URL =
  'postgresql://app_user:password@localhost:5435/proposal_rls_smoke';

const postgresPgbouncerUrl = process.env.POSTGRES_PGBOUNCER_URL ?? DEFAULT_POSTGRES_PGBOUNCER_URL;
const postgresDirectUrl = process.env.POSTGRES_DIRECT_URL ?? DEFAULT_POSTGRES_DIRECT_URL;
const appUserPgbouncerUrl = process.env.APP_USER_PGBOUNCER_URL ?? DEFAULT_APP_USER_PGBOUNCER_URL;
const appUserDirectUrl = process.env.APP_USER_DIRECT_URL ?? DEFAULT_APP_USER_DIRECT_URL;

function makeClient(url: string) {
  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });
}

function formatNames(names: string[]) {
  return names.length ? names.join(', ') : '(none)';
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function main() {
  const admin = makeClient(postgresDirectUrl);
  const postgresPool = makeClient(postgresPgbouncerUrl);
  const appUserPool = makeClient(appUserPgbouncerUrl);
  const appUserDirect = makeClient(appUserDirectUrl);
  const appUserPoolShim = createExtendedPrismaClient(appUserPool);
  const results: ResultRow[] = [];

  const runId = randomUUID().slice(0, 8);
  const tenant1Id = randomUUID();
  const tenant2Id = randomUUID();
  const tenant1Slug = `rls-smoke-${runId}-tenant-1`;
  const tenant2Slug = `rls-smoke-${runId}-tenant-2`;
  const audit1Name = `RLS Smoke ${runId} Tenant 1`;
  const audit2Name = `RLS Smoke ${runId} Tenant 2`;

  const addResult = (
    row: Omit<ResultRow, 'pass'> & {
      actualValue: string;
      passCondition: boolean;
    }
  ) => {
    results.push({
      test: row.test,
      connectingRole: row.connectingRole,
      path: row.path,
      tenantContext: row.tenantContext,
      expected: row.expected,
      actual: row.actualValue,
      pass: row.passCondition,
    });
  };

  try {
    await admin.$connect();
    await postgresPool.$connect();

    await admin.$executeRawUnsafe(`ALTER ROLE app_user WITH LOGIN PASSWORD 'password'`);
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE proposal_rls_smoke TO app_user`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user`);
    await admin.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`
    );
    await admin.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user`
    );
    await admin.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user`
    );

    await appUserPool.$connect();

    await admin.audit.deleteMany({
      where: {
        businessName: {
          startsWith: 'RLS Smoke ',
        },
      },
    });

    await admin.tenant.deleteMany({
      where: {
        slug: {
          startsWith: 'rls-smoke-',
        },
      },
    });

    await admin.tenant.create({
      data: {
        id: tenant1Id,
        name: `RLS Smoke Tenant 1 ${runId}`,
        slug: tenant1Slug,
      },
    });

    await admin.tenant.create({
      data: {
        id: tenant2Id,
        name: `RLS Smoke Tenant 2 ${runId}`,
        slug: tenant2Slug,
      },
    });

    await admin.audit.create({
      data: {
        businessName: audit1Name,
        tenantId: tenant1Id,
      },
    });

    await admin.audit.create({
      data: {
        businessName: audit2Name,
        tenantId: tenant2Id,
      },
    });

    const expectedTenant1 = audit1Name;
    const expectedAll = [audit1Name, audit2Name].sort().join(', ');

    try {
      const names = await postgresPool.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant1Id}'`);
        const rows = await tx.audit.findMany({
          orderBy: {
            businessName: 'asc',
          },
          select: {
            businessName: true,
          },
        });
        return rows.map((row) => row.businessName);
      });

      addResult({
        test: 'Tenant 1 read with SET LOCAL',
        connectingRole: 'postgres',
        path: 'PgBouncer transaction',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: formatNames(names),
        passCondition: names.length === 1 && names[0] === audit1Name,
      });
    } catch (error) {
      addResult({
        test: 'Tenant 1 read with SET LOCAL',
        connectingRole: 'postgres',
        path: 'PgBouncer transaction',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      const names = await appUserPool.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant1Id}'`);
        const rows = await tx.audit.findMany({
          orderBy: {
            businessName: 'asc',
          },
          select: {
            businessName: true,
          },
        });
        return rows.map((row) => row.businessName);
      });

      addResult({
        test: 'Tenant 1 read with SET LOCAL',
        connectingRole: 'app_user',
        path: 'PgBouncer transaction',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: formatNames(names),
        passCondition: names.length === 1 && names[0] === audit1Name,
      });
    } catch (error) {
      addResult({
        test: 'Tenant 1 read with SET LOCAL',
        connectingRole: 'app_user',
        path: 'PgBouncer transaction',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      const rows = await postgresPool.audit.findMany({
        orderBy: {
          businessName: 'asc',
        },
        select: {
          businessName: true,
        },
      });
      const names = rows.map((row) => row.businessName);

      addResult({
        test: 'No tenant context',
        connectingRole: 'postgres',
        path: 'PgBouncer direct query',
        tenantContext: '(none)',
        expected: expectedAll,
        actualValue: formatNames(names),
        passCondition: names.join(', ') === expectedAll,
      });
    } catch (error) {
      addResult({
        test: 'No tenant context',
        connectingRole: 'postgres',
        path: 'PgBouncer direct query',
        tenantContext: '(none)',
        expected: expectedAll,
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      const rows = await appUserPool.audit.findMany({
        orderBy: {
          businessName: 'asc',
        },
        select: {
          businessName: true,
        },
      });
      const names = rows.map((row) => row.businessName);

      addResult({
        test: 'No tenant context',
        connectingRole: 'app_user',
        path: 'PgBouncer direct query',
        tenantContext: '(none)',
        expected: '(none)',
        actualValue: formatNames(names),
        passCondition: names.length === 0,
      });
    } catch (error) {
      addResult({
        test: 'No tenant context',
        connectingRole: 'app_user',
        path: 'PgBouncer direct query',
        tenantContext: '(none)',
        expected: '(none)',
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      const firstRead = await postgresPool.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant1Id}'`);
        const rows = await tx.audit.findMany({
          orderBy: {
            businessName: 'asc',
          },
          select: {
            businessName: true,
          },
        });
        return rows.map((row) => row.businessName);
      });

      const secondRead = await postgresPool.audit.findMany({
        orderBy: {
          businessName: 'asc',
        },
        select: {
          businessName: true,
        },
      });
      const secondNames = secondRead.map((row) => row.businessName);

      addResult({
        test: 'Cross-transaction SET LOCAL bleed',
        connectingRole: 'postgres',
        path: 'PgBouncer mixed',
        tenantContext: 'tenant1 then none',
        expected: `first=${expectedTenant1}; second=${expectedAll}`,
        actualValue: `first=${formatNames(firstRead)}; second=${formatNames(secondNames)}`,
        passCondition:
          firstRead.length === 1 &&
          firstRead[0] === audit1Name &&
          secondNames.join(', ') === expectedAll,
      });
    } catch (error) {
      addResult({
        test: 'Cross-transaction SET LOCAL bleed',
        connectingRole: 'postgres',
        path: 'PgBouncer mixed',
        tenantContext: 'tenant1 then none',
        expected: `first=${expectedTenant1}; second=${expectedAll}`,
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      await appUserPool.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant1Id}'`);
      const settingRows = (await appUserPool.$queryRawUnsafe(
        `SELECT current_setting('app.current_tenant_id', true) AS current_setting`
      )) as Array<{ current_setting: string | null }>;
      const auditRows = (await appUserPool.$queryRawUnsafe(
        `SELECT "businessName" FROM "Audit" ORDER BY "businessName" ASC`
      )) as Array<{ businessName: string }>;

      addResult({
        test: '$queryRaw outside transaction',
        connectingRole: 'app_user',
        path: 'PgBouncer raw query',
        tenantContext: 'tenant1 attempted outside tx',
        expected: 'setting=(none); rows=(none)',
        actualValue: `setting=${settingRows[0]?.current_setting ?? '(none)'}; rows=${formatNames(
          auditRows.map((row) => row.businessName)
        )}`,
        passCondition:
          ((settingRows[0]?.current_setting ?? '') === '' ||
            (settingRows[0]?.current_setting ?? null) === null) &&
          auditRows.length === 0,
      });
    } catch (error) {
      addResult({
        test: '$queryRaw outside transaction',
        connectingRole: 'app_user',
        path: 'PgBouncer raw query',
        tenantContext: 'tenant1 attempted outside tx',
        expected: 'setting=(none); rows=(none)',
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      await appUserDirect.$connect();
      const names = await appUserDirect.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenant1Id}'`);
        const rows = await tx.audit.findMany({
          orderBy: {
            businessName: 'asc',
          },
          select: {
            businessName: true,
          },
        });
        return rows.map((row) => row.businessName);
      });

      addResult({
        test: 'Tenant 1 read with SET LOCAL',
        connectingRole: 'app_user',
        path: 'Direct transaction',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: formatNames(names),
        passCondition: names.length === 1 && names[0] === audit1Name,
      });
    } catch (error) {
      addResult({
        test: 'Tenant 1 read with SET LOCAL',
        connectingRole: 'app_user',
        path: 'Direct transaction',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    try {
      const names = await runWithTenantAsync(tenant1Id, () =>
        appUserPoolShim.$transaction(async (tx) => {
          const rows = await appUserPoolShim.audit.findMany({
            orderBy: {
              businessName: 'asc',
            },
            select: {
              businessName: true,
            },
          });
          return rows.map((row) => row.businessName);
        })
      );

      addResult({
        test: 'Current shim pattern (query outside tx)',
        connectingRole: 'app_user',
        path: 'PgBouncer simulated lib/prisma.ts',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: formatNames(names),
        passCondition: names.length === 1 && names[0] === audit1Name,
      });
    } catch (error) {
      addResult({
        test: 'Current shim pattern (query outside tx)',
        connectingRole: 'app_user',
        path: 'PgBouncer simulated lib/prisma.ts',
        tenantContext: 'tenant1',
        expected: expectedTenant1,
        actualValue: `error: ${formatError(error)}`,
        passCondition: false,
      });
    }

    const passing = results.filter((row) => row.pass).length;
    console.table(
      results.map((row) => ({
        Test: row.test,
        Role: row.connectingRole,
        Path: row.path,
        Context: row.tenantContext,
        Expected: row.expected,
        Actual: row.actual,
        Pass: row.pass ? 'yes' : 'no',
      }))
    );
    console.log(`PASS_COUNT ${passing}/${results.length}`);
    console.log(`RESULTS_JSON ${JSON.stringify(results)}`);
  } finally {
    await Promise.allSettled([
      admin.$disconnect(),
      postgresPool.$disconnect(),
      appUserPool.$disconnect(),
      appUserDirect.$disconnect(),
    ]);
  }
}

main().catch((error) => {
  console.error('RLS smoke test failed:', error);
  process.exitCode = 1;
});
