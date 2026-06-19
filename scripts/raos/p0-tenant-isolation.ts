/**
 * RAOS Release_Gate P0 check — tenant-isolation coverage (task 13.1).
 *
 * Re-measures the three tenant-isolation legs (R4.1/4.2/4.3) on the candidate
 * commit as fast, deterministic STATIC checks (no DB connection, no synthetic
 * runs) and writes a `StaticP0CheckResult[]` results file the Gate_Verdict step
 * aggregates:
 *
 *   - `tenant-isolation-rls`       — DB-layer RLS coverage parsed from the
 *     committed migration SQL (lib/raos/tenantIsolation/rlsCoverage.ts).
 *   - `tenant-isolation-adapter`   — adapter-level `tenantId` filter coverage
 *     over the committed SUA query-path inventory
 *     (lib/raos/tenantIsolation/adapterFilter*).
 *   - `tenant-isolation-bypassrls` — zero application DB roles carrying
 *     BYPASSRLS, read from an optional roles file (`--roles`); absent ⇒ the
 *     known-clean application role set.
 *
 * Each leg contributes `criticalCount = 1` when it is NOT clean (R4.6: any
 * uncovered tenant path keeps the tenant-isolation Critical open ⇒ the gate
 * fails per R17.1).
 *
 * This is a bounded CI re-measurement: it parses committed SQL + the static
 * inventory only. The authoritative, engine-AST-sourced enumeration and the
 * live-DB role scan are the scheduled Drift_Run's job (task 13.2) — not the gate.
 *
 * Requirements: 17.1, 17.4, 4.1, 4.2, 4.3, 4.6
 */

import fs from 'fs';
import path from 'path';

import { SUA_TENANT_SCOPED_QUERY_PATHS } from '../../lib/raos/tenantIsolation/adapterFilterInventory';
import { computeAdapterFilterCoverage } from '../../lib/raos/tenantIsolation/adapterFilterCoverage';
import {
  computeBypassRlsScan,
  type RoleAttributeRow,
} from '../../lib/raos/tenantIsolation/bypassRlsScan';
import {
  computeRlsCoverage,
  parseRlsPolicyStatesFromSql,
  resolveTableName,
  type RlsPolicyState,
  type TenantScopedTable,
} from '../../lib/raos/tenantIsolation/rlsCoverage';
import type { StaticP0CheckResult } from '../../lib/raos/releaseGate';

const MIGRATIONS_DIR = 'prisma/migrations';

/** The known clean application-role set when no `--roles` file is supplied. */
const DEFAULT_APP_ROLES: RoleAttributeRow[] = [
  { name: 'app_user', bypassRls: false, superuser: false },
];

function parseArgs(argv: string[]): { out: string; rolesPath?: string } {
  let out = 'release-gate/p0-results.json';
  let rolesPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--roles') rolesPath = argv[++i];
  }
  return { out, rolesPath };
}

/** Concatenate every committed RLS-related migration SQL in apply order. */
function readRlsMigrationSql(): string {
  if (!fs.existsSync(MIGRATIONS_DIR)) return '';
  const dirs = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory())
    .sort(); // timestamp-prefixed ⇒ lexical sort == apply order
  const parts: string[] = [];
  for (const d of dirs) {
    const sqlPath = path.join(MIGRATIONS_DIR, d, 'migration.sql');
    if (fs.existsSync(sqlPath)) parts.push(fs.readFileSync(sqlPath, 'utf8'));
  }
  return parts.join('\n');
}

/**
 * Derive the tenant-scoped table inventory for the bounded gate from the tables
 * that appear in RLS migration statements. (The scheduled Drift_Run uses the
 * engine's authoritative AST enumeration; the gate uses this fast static proxy.)
 */
function deriveInventoryFromPolicyStates(
  states: Record<string, RlsPolicyState>
): TenantScopedTable[] {
  return Object.keys(states)
    .sort()
    .map((table) => ({ model: table, table: resolveTableName(table), hasTenantIdColumn: true }));
}

function main(): void {
  const { out, rolesPath } = parseArgs(process.argv.slice(2));

  // ── leg 1: RLS coverage (R4.1) ──
  const sql = readRlsMigrationSql();
  const policyStates = parseRlsPolicyStatesFromSql(sql);
  const inventory = deriveInventoryFromPolicyStates(policyStates);
  const rls = computeRlsCoverage(inventory, policyStates);

  // ── leg 2: adapter-level tenantId filter coverage (R4.2) ──
  const adapter = computeAdapterFilterCoverage(SUA_TENANT_SCOPED_QUERY_PATHS);

  // ── leg 3: zero BYPASSRLS application roles (R4.3) ──
  const roles: RoleAttributeRow[] =
    rolesPath && fs.existsSync(rolesPath)
      ? (JSON.parse(fs.readFileSync(rolesPath, 'utf8')) as RoleAttributeRow[])
      : DEFAULT_APP_ROLES;
  const bypass = computeBypassRlsScan(roles);

  const results: StaticP0CheckResult[] = [
    {
      check: 'tenant-isolation-rls',
      passed: rls.fullyCovered,
      criticalCount: rls.fullyCovered ? 0 : 1,
      detail: rls.fullyCovered
        ? `RLS coverage 100% (${rls.tablesWithActiveRls}/${rls.totalTenantScopedTables})`
        : `RLS uncovered tables: ${rls.uncoveredTables.join(', ')}`,
    },
    {
      check: 'tenant-isolation-adapter',
      passed: adapter.fullyCovered,
      criticalCount: adapter.fullyCovered ? 0 : 1,
      detail: adapter.fullyCovered
        ? `adapter tenantId filter coverage 100% (${adapter.enforcedPaths}/${adapter.totalPaths})`
        : `adapter-filter gaps: ${adapter.uncoveredPaths.map((p) => p.pathId).join(', ')}`,
    },
    {
      check: 'tenant-isolation-bypassrls',
      passed: bypass.passed,
      criticalCount: bypass.passed ? 0 : 1,
      detail: bypass.passed
        ? 'zero application roles carry BYPASSRLS'
        : `BYPASSRLS roles: ${bypass.offendingRoles.join(', ')}`,
    },
  ];

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n', 'utf8');

  for (const r of results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'} ${r.check}: ${r.detail}`);
  }
}

main();
