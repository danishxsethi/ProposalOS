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
const BYPASS_MIGRATION_PATH =
  '/Users/danishsethi/VSCODE/ProposalOS/prisma/migrations/20260501014500_rls_bypass_policies/migration.sql';

type RuntimeModules = {
  prisma: PrismaClient;
  MissingTenantError: typeof import('@/lib/prisma').MissingTenantError;
  logger: typeof import('@/lib/logger').logger;
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

function assertPooledEndpointConfiguration() {
  const poolMode = runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 6432 -U postgres -d pgbouncer -tAc 'SHOW CONFIG' | awk -F'|' '$1=="pool_mode"{print $2}'`
  )
    .trim()
    .split('\n')
    .at(-1);

  if (poolMode !== 'transaction') {
    throw new Error(`Expected PgBouncer pool_mode=transaction, received "${poolMode}"`);
  }

  if (
    !POOLED_APP_USER_URL.includes('localhost:6432') ||
    !POOLED_APP_USER_URL.includes('pgbouncer=true')
  ) {
    throw new Error(`Expected pooled app URL to target PgBouncer: ${POOLED_APP_USER_URL}`);
  }
}

function resetSchemaAndRls() {
  runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`
  );

  runShell(
    `DATABASE_URL='${POOLED_POSTGRES_URL}' DIRECT_URL='${DIRECT_URL}' npx prisma db push --skip-generate`
  );

  runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -f ${RLS_MIGRATION_PATH}`
  );

  runShell(
    `PGPASSWORD=${POSTGRES_PASSWORD} psql -h localhost -p 5435 -U postgres -d ${TEST_DB} -f ${BYPASS_MIGRATION_PATH}`
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
  const loggerModule = await import('@/lib/logger');

  return {
    prisma: prismaModule.prisma as PrismaClient,
    MissingTenantError: prismaModule.MissingTenantError,
    logger: loggerModule.logger,
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
    assertPooledEndpointConfiguration();
    resetSchemaAndRls();
    runtime = await loadRuntimeModules();
    await admin.$connect();
    expect(process.env.DATABASE_URL).toBe(POOLED_APP_USER_URL);
  }, 120000);

  afterAll(async () => {
    await cleanupSeedData();
    await Promise.allSettled([runtime?.prisma.$disconnect(), admin.$disconnect()]);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
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

  it('bypass hook allows cross-tenant read', async () => {
    const rows = await runtime.runWithTenantBypass('test:bypass-cross-tenant-read', () =>
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

  it('bypass hook allows cross-tenant write as app_user', async () => {
    const created = await runtime.runWithTenantBypass('test:bypass-cross-tenant-write', () =>
      runtime.prisma.audit.create({
        data: {
          businessName: `${currentSeed!.prefix} Bypass Insert`,
          tenantId: currentSeed!.tenantBId,
        },
      })
    );

    expect(created.tenantId).toBe(currentSeed!.tenantBId);

    const tenantBRows = await runtime.runWithTenantAsync(currentSeed!.tenantBId, () =>
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

    expect(tenantBRows.map((row) => row.businessName)).toContain(
      `${currentSeed!.prefix} Bypass Insert`
    );
  });

  it("bypass setting doesn't bleed across pooled requests", async () => {
    const [bypassRows, noTenantResult] = await Promise.allSettled([
      runtime.runWithTenantBypass('test:bypass-bleed-check', () =>
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
      runtime.prisma.audit.findMany({
        where: {
          businessName: {
            startsWith: currentSeed!.prefix,
          },
        },
      }),
    ]);

    expect(bypassRows.status).toBe('fulfilled');
    if (bypassRows.status === 'fulfilled') {
      expect(bypassRows.value.map((row) => row.businessName)).toEqual([
        currentSeed!.auditAName,
        currentSeed!.auditBName,
      ]);
    }

    expect(noTenantResult.status).toBe('rejected');
    if (noTenantResult.status === 'rejected') {
      expect(noTenantResult.reason).toMatchObject({
        name: 'MissingTenantError',
        reason: 'missing',
      });
    }
  });

  it('runWithTenantBypass requires a reason argument', async () => {
    const unsafeBypass = runtime.runWithTenantBypass as unknown as (
      reason: string | undefined,
      fn: () => Promise<unknown>
    ) => Promise<unknown>;

    await expect(
      unsafeBypass(undefined, () =>
        runtime.prisma.audit.findMany({
          where: {
            businessName: {
              startsWith: currentSeed!.prefix,
            },
          },
        })
      )
    ).rejects.toThrow('runWithTenantBypass requires a non-empty reason');
  });

  it('runWithTenantBypass logs an audit entry', async () => {
    const warnSpy = vi.spyOn(runtime.logger, 'warn');

    await runtime.runWithTenantBypass('test:bypass-log-entry', () =>
      runtime.prisma.audit.findMany({
        where: {
          businessName: {
            startsWith: currentSeed!.prefix,
          },
        },
      })
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'rls_bypass',
        reason: 'test:bypass-log-entry',
        caller: expect.any(String),
        timestamp: expect.any(String),
      }),
      'RLS bypass invoked'
    );
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
