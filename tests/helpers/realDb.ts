// @vitest-environment node
/**
 * tests/helpers/realDb.ts
 *
 * Shared helper for REAL-PostgreSQL qualification tests (fault injection, worker
 * lease/crash/reclaim). Unlike the mocked unit suites, these tests run the actual
 * production code paths against a disposable per-file database created from the
 * real migrations — no mocks for the database behavior under test, no production
 * bypass changes.
 *
 * Contract:
 *   - A per-file database `proposalos_fi_<random>` is created on the local Postgres
 *     server (default postgresql://postgres:password@localhost:5435, override with
 *     REAL_DB_ADMIN_URL) and migrated with `prisma migrate deploy`.
 *   - `activateRealDb(...)` MUST be awaited at module top level (before any dynamic
 *     import of modules that read DATABASE_URL / bind the global PrismaClient).
 *     This module deliberately uses a dynamic import of `@/lib/prisma` so importing
 *     this helper does not bind the global client to the pre-activation URL.
 *   - Test fixtures use the superuser connection under runWithTenantBypass with
 *     explicit `test-fixture:*` reasons; code under test always runs through the
 *     production path (RLS-scoped app_user client where relevant).
 *   - The database is dropped in afterAll, so nothing persists beyond the run.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import type { ExtendedPrismaClient } from '@/lib/prisma';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'migrations');
const RLS_MARKER = "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user')";

export interface RealDbSession {
  /** Unique disposable database name for this test file. */
  dbName: string;
  /** App-role (RLS-enforced) extended client — the production code path. */
  app: ExtendedPrismaClient;
  /** Superuser client, only for fixture setup/teardown under runWithTenantBypass. */
  admin: PrismaClient;
  /** Drop the disposable database and disconnect clients. Call from afterAll. */
  cleanup: () => Promise<void>;
}

/**
 * Create and migrate a disposable database, then point this process's DATABASE_URL /
 * DIRECT_URL at it. Must be awaited before importing (even transitively) any
 * `@/lib/*` module that touches Prisma.
 */
export async function activateRealDb(fileLabel: string): Promise<RealDbSession> {
  const adminUrl =
    process.env.REAL_DB_ADMIN_URL ??
    process.env.DIRECT_URL ??
    'postgresql://postgres:password@localhost:5435/postgres';
  const base = new URL(adminUrl);
  const serverUrl = `${base.protocol}//${base.username}:${base.password}@${base.host}`;
  const dbName = `proposalos_fi_${fileLabel}_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const dbUrl = `${serverUrl}/${dbName}`;

  const superuser = new PrismaClient({ datasources: { db: { url: `${serverUrl}/postgres` } } });
  try {
    await superuser.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await superuser.$disconnect();
  }

  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_URL = dbUrl;
  process.env.PROPOSALOS_RLS_APP_URL = dbUrl;

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  // app_user is a cluster-level role; the RLS migration only creates it
  // IF NOT EXISTS, so ensure it exists with a login + deterministic password.
  const migrationsHaveRole = readFileSync(
    path.join(MIGRATIONS_DIR, '20260429093000_enable_rls', 'migration.sql'),
    'utf8'
  ).includes(RLS_MARKER);
  if (migrationsHaveRole) {
    const roleFix = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await roleFix.$executeRawUnsafe(
        `DO $$ BEGIN
           IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
             CREATE ROLE app_user LOGIN PASSWORD 'app_user';
           ELSE
             ALTER ROLE app_user LOGIN PASSWORD 'app_user';
           END IF;
         END $$`
      );
    } finally {
      await roleFix.$disconnect();
    }
  }

  const appUserUrl = `${base.protocol}//app_user:app_user@${base.host}/${dbName}`;
  const admin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const { createExtendedPrismaClient } = await import('@/lib/prisma');
  const app = createExtendedPrismaClient(
    new PrismaClient({ datasources: { db: { url: appUserUrl } } })
  );

  const cleanup = async () => {
    await Promise.allSettled([admin.$disconnect(), app.$disconnect()]);
    const dropper = new PrismaClient({ datasources: { db: { url: `${serverUrl}/postgres` } } });
    try {
      await dropper.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`
      );
      await dropper.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    } finally {
      await dropper.$disconnect();
    }
  };

  return { dbName, app, admin, cleanup };
}
