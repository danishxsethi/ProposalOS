import { execSync } from 'child_process';

import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_ROOT = process.cwd();
const TEST_DB = 'proposal_rls_smoke';
const POSTGRES_PASSWORD = 'password';
const DIRECT_URL = `postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5435/${TEST_DB}`;
const POOLED_POSTGRES_URL = `postgresql://postgres:${POSTGRES_PASSWORD}@localhost:6432/${TEST_DB}?pgbouncer=true`;
const POOLED_APP_USER_URL = `postgresql://app_user:${POSTGRES_PASSWORD}@localhost:6432/${TEST_DB}?pgbouncer=true`;
const RLS_MIGRATION_PATH =
  '/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/20260429093000_enable_rls/migration.sql';

type RuntimeModules = {
  prisma: PrismaClient;
  MissingTenantError: typeof import('@/lib/prisma').MissingTenantError;
  runWithTenantAsync: typeof import('@/lib/tenant/context').runWithTenantAsync;
  runWithTenantBypass: typeof import('@/lib/tenant/context').runWithTenantBypass;
};

type SeedData = {
  prefix: string;
  tenantAId: string;
  tenantBId: string;
  tenantASlug: string;
  tenantBSlug: string;
  auditAName: string;
  auditBName: string;
};

const admin = new PrismaClient({
  datasources: {
    db: {
      url: DIRECT_URL,
    },
  },
});

let runtime: RuntimeModules;
let currentSeed: SeedData | null = null;

function runShell(command: string) {
  return execSync(command, {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function ensureLocalStack() {
  try {
    runShell(
      `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -c 'SELECT 1'`
    );
    runShell(
      `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 6432 -U app_user -d ${TEST_DB} -c 'SELECT 1'`
    );
  } catch {
    throw new Error(
      'Local Postgres + PgBouncer stack is not ready for shim integration tests. Start the Phase 2.2 local stack before running this suite.'
    );
  }
}

function resetSchemaAndRls() {
  runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`
  );

  runShell(
    `DATABASE_URL='${POOLED_POSTGRES_URL}' DIRECT_URL='${DIRECT_URL}' pnpm exec prisma db push --skip-generate`
  );

  runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -f ${RLS_MIGRATION_PATH}`
  );

  runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -c "ALTER ROLE app_user WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}';"`
  );
}

async function loadRuntimeModules(): Promise<RuntimeModules> {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = 'test';
  env.DATABASE_URL = POOLED_APP_USER_URL;
  env.DIRECT_URL = DIRECT_URL;

  vi.resetModules();

  const prismaModule = await import('@/lib/prisma');
  const contextModule = await import('@/lib/tenant/context');

  return {
    prisma: prismaModule.prisma as PrismaClient,
    MissingTenantError: prismaModule.MissingTenantError,
    runWithTenantAsync: contextModule.runWithTenantAsync,
    runWithTenantBypass: contextModule.runWithTenantBypass,
  };
}

async function cleanupSeedData() {
  await admin.audit.deleteMany({
    where: {
      businessName: {
        startsWith: 'Shim Integration ',
      },
    },
  });

  await admin.tenant.deleteMany({
    where: {
      slug: {
        startsWith: 'shim-integration-',
      },
    },
  });
}

async function seedTenantsAndAudits(): Promise<SeedData> {
  const prefix = `Shim Integration ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenantA = await admin.tenant.create({
    data: {
      name: `${prefix} Tenant A`,
      slug: `${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tenant-a`,
    },
  });

  const tenantB = await admin.tenant.create({
    data: {
      name: `${prefix} Tenant B`,
      slug: `${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tenant-b`,
    },
  });

  const auditAName = `${prefix} Tenant A Audit`;
  const auditBName = `${prefix} Tenant B Audit`;

  await admin.audit.create({
    data: {
      businessName: auditAName,
      tenantId: tenantA.id,
    },
  });

  await admin.audit.create({
    data: {
      businessName: auditBName,
      tenantId: tenantB.id,
    },
  });

  return {
    prefix,
    tenantAId: tenantA.id,
    tenantBId: tenantB.id,
    tenantASlug: tenantA.slug ?? '',
    tenantBSlug: tenantB.slug ?? '',
    auditAName,
    auditBName,
  };
}

describe('Prisma RLS shim integration', () => {
  beforeAll(async () => {
    ensureLocalStack();
    resetSchemaAndRls();
    runtime = await loadRuntimeModules();
    await admin.$connect();
  }, 120000);

  afterAll(async () => {
    await cleanupSeedData();
    await Promise.allSettled([runtime?.prisma.$disconnect(), admin.$disconnect()]);
  });

  beforeEach(async () => {
    await cleanupSeedData();
    currentSeed = await seedTenantsAndAudits();
  });

  afterEach(async () => {
    await cleanupSeedData();
    currentSeed = null;
  });

  it('tenant A query sees only tenant A rows', async () => {
    const rows = await runtime.runWithTenantAsync(currentSeed!.tenantAId, () =>
      runtime.prisma.audit.findMany({
        where: {
          businessName: {
            startsWith: currentSeed!.prefix,
          },
        },
        orderBy: {
          businessName: 'asc',
        },
      })
    );

    expect(rows.map((row) => row.businessName)).toEqual([currentSeed!.auditAName]);
  });

  it('tenant B query sees only tenant B rows', async () => {
    const rows = await runtime.runWithTenantAsync(currentSeed!.tenantBId, () =>
      runtime.prisma.audit.findMany({
        where: {
          businessName: {
            startsWith: currentSeed!.prefix,
          },
        },
        orderBy: {
          businessName: 'asc',
        },
      })
    );

    expect(rows.map((row) => row.businessName)).toEqual([currentSeed!.auditBName]);
  });

  it('no tenant context throws MissingTenantError', async () => {
    await expect(
      runtime.prisma.audit.findMany({
        where: {
          businessName: {
            startsWith: currentSeed!.prefix,
          },
        },
      })
    ).rejects.toMatchObject({
      name: 'MissingTenantError',
      operationName: 'Audit.findMany',
      reason: 'missing',
    });
  });

  it('empty-string tenantId throws MissingTenantError', async () => {
    await expect(
      runtime.runWithTenantAsync('', () =>
        runtime.prisma.audit.findMany({
          where: {
            businessName: {
              startsWith: currentSeed!.prefix,
            },
          },
        })
      )
    ).rejects.toMatchObject({
      name: 'MissingTenantError',
      reason: 'missing',
    });
  });

  it('non-UUID tenantId throws MissingTenantError', async () => {
    await expect(
      runtime.runWithTenantAsync('not-a-uuid', () =>
        runtime.prisma.audit.findMany({
          where: {
            businessName: {
              startsWith: currentSeed!.prefix,
            },
          },
        })
      )
    ).rejects.toMatchObject({
      name: 'MissingTenantError',
      reason: 'invalid',
      tenantId: 'not-a-uuid',
    });
  });

  it("concurrent requests don't bleed tenant context", async () => {
    const [tenantARows, tenantBRows] = await Promise.all([
      runtime.runWithTenantAsync(currentSeed!.tenantAId, () =>
        runtime.prisma.audit.findMany({
          where: {
            businessName: {
              startsWith: currentSeed!.prefix,
            },
          },
          orderBy: {
            businessName: 'asc',
          },
        })
      ),
      runtime.runWithTenantAsync(currentSeed!.tenantBId, () =>
        runtime.prisma.audit.findMany({
          where: {
            businessName: {
              startsWith: currentSeed!.prefix,
            },
          },
          orderBy: {
            businessName: 'asc',
          },
        })
      ),
    ]);

    expect(tenantARows.map((row) => row.businessName)).toEqual([currentSeed!.auditAName]);
    expect(tenantBRows.map((row) => row.businessName)).toEqual([currentSeed!.auditBName]);
  });

  it('reuses the active transaction instead of opening a nested sub-transaction', async () => {
    const rows = await runtime.runWithTenantAsync(currentSeed!.tenantAId, () =>
      runtime.prisma.$transaction(async (tx) =>
        tx.audit.findMany({
          where: {
            businessName: {
              startsWith: currentSeed!.prefix,
            },
          },
          orderBy: {
            businessName: 'asc',
          },
        })
      )
    );

    expect(rows.map((row) => row.businessName)).toEqual([currentSeed!.auditAName]);
  });

  it.skip('bypass hook allows cross-tenant read', async () => {
    // Phase 2.4 will add the database-side bypass policy. The runtime hook exists now,
    // but the DB policy is intentionally not active yet.
    const rows = await runtime.runWithTenantBypass(() =>
      runtime.prisma.audit.findMany({
        where: {
          businessName: {
            startsWith: currentSeed!.prefix,
          },
        },
        orderBy: {
          businessName: 'asc',
        },
      })
    );

    expect(rows.map((row) => row.businessName)).toEqual([
      currentSeed!.auditAName,
      currentSeed!.auditBName,
    ]);
  });

  it('mutation respects tenant scope via WITH CHECK', async () => {
    await expect(
      runtime.runWithTenantAsync(currentSeed!.tenantAId, () =>
        runtime.prisma.audit.create({
          data: {
            businessName: `${currentSeed!.prefix} Cross Tenant Insert`,
            tenantId: currentSeed!.tenantBId,
          },
        })
      )
    ).rejects.toThrow();
  });
});
