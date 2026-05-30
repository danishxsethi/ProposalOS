import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

type VerifiedTable = {
  model: string;
  table: string;
};

const DEFAULT_BASE_MIGRATION = 'prisma/migrations/20260429093000_enable_rls/migration.sql';
const DEFAULT_TIMESTAMP = '20260501014500';
const MIGRATION_NAME = 'rls_bypass_policies';

function parseArgs(argv: string[]) {
  const options = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (!rawKey) continue;
    const nextValue = inlineValue ?? argv[index + 1];

    if (inlineValue == null && nextValue && !nextValue.startsWith('--')) {
      options.set(rawKey, nextValue);
      index += 1;
      continue;
    }

    if (inlineValue != null) {
      options.set(rawKey, inlineValue);
    }
  }

  const timestamp = options.get('timestamp') ?? DEFAULT_TIMESTAMP;
  const baseMigration = options.get('base-migration') ?? DEFAULT_BASE_MIGRATION;
  const outputDir = options.get('output-dir') ?? `prisma/migrations/${timestamp}_${MIGRATION_NAME}`;

  return {
    timestamp,
    baseMigration: resolve(baseMigration),
    outputDir: resolve(outputDir),
  };
}

async function readTextFile(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf8');
}

function extractVerifiedTables(migrationSql: string): VerifiedTable[] {
  const verifiedMatches = Array.from(
    migrationSql.matchAll(/^-- VERIFIED: (?<model>.+?) -> (?<table>.+?)$/gm)
  );

  const tables = verifiedMatches.map((match) => ({
    model: match.groups?.model?.trim() ?? '',
    table: match.groups?.table?.trim() ?? '',
  }));

  const invalid = tables.find((entry) => !entry.model || !entry.table);
  if (invalid) {
    throw new Error(`Invalid VERIFIED comment encountered: ${JSON.stringify(invalid)}`);
  }

  const uniqueTables = new Map<string, VerifiedTable>();
  for (const entry of tables) {
    if (!uniqueTables.has(entry.table)) {
      uniqueTables.set(entry.table, entry);
    }
  }

  return [...uniqueTables.values()];
}

function renderPolicyBlock(table: string): string {
  return [
    `DROP POLICY IF EXISTS tenant_bypass ON "${table}";`,
    `CREATE POLICY tenant_bypass ON "${table}"`,
    `  FOR ALL`,
    `  USING (current_setting('app.bypass_rls', true) = 'true')`,
    `  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');`,
  ].join('\n');
}

function renderRevertBlock(table: string): string {
  return `DROP POLICY IF EXISTS tenant_bypass ON "${table}";`;
}

function renderMigration(baseMigrationPath: string, tables: VerifiedTable[]): string {
  const tableBlocks = tables
    .map(({ model, table }) =>
      [`-- VERIFIED SOURCE: ${model} -> ${table}`, renderPolicyBlock(table)].join('\n')
    )
    .join('\n\n');

  return `${[
    '-- ============================================================================',
    '-- Migration: Add RLS bypass policies for explicitly-audited cross-tenant flows',
    `-- Generated from ${baseMigrationPath} VERIFIED comments`,
    `-- Source coverage: ${tables.length}/${tables.length} tables match existing tenant_isolation policies`,
    '-- IMPORTANT: when adding new tables to tenant_isolation, also add their tenant_bypass policy here or in a new migration',
    '-- ============================================================================',
    '',
    '-- This migration intentionally adds a second permissive policy to the same',
    '-- tables already covered by tenant_isolation. PostgreSQL OR-combines permissive',
    '-- policies, so tenant_bypass only opens access when the runtime sets:',
    "--   set_config('app.bypass_rls', 'true', true)",
    '',
    tableBlocks,
    '',
  ].join('\n')}`;
}

function renderRevert(baseMigrationPath: string, tables: VerifiedTable[]): string {
  return `${[
    '-- ============================================================================',
    '-- Revert: Drop RLS bypass policies added for explicitly-audited cross-tenant flows',
    `-- Generated from ${baseMigrationPath} VERIFIED comments`,
    `-- Source coverage: ${tables.length}/${tables.length} tables match existing tenant_isolation policies`,
    '-- ============================================================================',
    '',
    tables.map(({ table }) => renderRevertBlock(table)).join('\n'),
    '',
  ].join('\n')}`;
}

async function main() {
  const { baseMigration, outputDir, timestamp } = parseArgs(process.argv.slice(2));
  const migrationSql = await readTextFile(baseMigration);
  const verifiedTables = extractVerifiedTables(migrationSql);
  const repoRelativeBaseMigration = baseMigration.startsWith(`${process.cwd()}/`)
    ? baseMigration.slice(process.cwd().length + 1)
    : baseMigration;

  if (verifiedTables.length === 0) {
    throw new Error(`No VERIFIED comments found in ${baseMigration}`);
  }

  const migrationPath = join(outputDir, 'migration.sql');
  const revertPath = join(outputDir, 'revert.sql');

  mkdirSync(dirname(migrationPath), { recursive: true });

  writeFileSync(migrationPath, renderMigration(repoRelativeBaseMigration, verifiedTables), 'utf8');
  writeFileSync(revertPath, renderRevert(repoRelativeBaseMigration, verifiedTables), 'utf8');

  console.log(
    JSON.stringify(
      {
        timestamp,
        baseMigration,
        outputDir,
        tables: verifiedTables.length,
        migrationPath,
        revertPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
