/**
 * P1-06: fail-fast / preflight detection of an unsafe (superuser or BYPASSRLS) database
 * role in production. RLS policies in this codebase explicitly special-case
 * `current_user = 'postgres'` (see prisma/migrations/20260429093000_enable_rls) and any
 * role with the BYPASSRLS attribute bypasses row-level security entirely regardless of
 * policy content — so connecting as such a role silently defeats tenant isolation.
 *
 * This does not (and cannot, from application code) change the live database role —
 * it only detects and refuses to boot/serve traffic under an unsafe role in production.
 *
 * Wire this into a startup health check / readiness probe. It intentionally does NOT
 * run on every request (one extra DB round trip per request is not acceptable), and it
 * never logs the DATABASE_URL or any credential.
 */

export interface DbRoleCheckResult {
  role: string;
  isSuperuser: boolean;
  bypassRls: boolean;
  safe: boolean;
}

interface RoleQueryClient {
  $queryRaw<T = unknown>(sql: unknown, ...values: unknown[]): Promise<T>;
}

/**
 * Query the connected role's privileges. Throws in production if the role is unsafe.
 * In non-production, logs a warning but does not throw (local/dev commonly uses a
 * superuser role for convenience).
 */
export async function assertSafeDbRole(client: RoleQueryClient): Promise<DbRoleCheckResult> {
  const rows = await client.$queryRaw<
    Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
  >`
    SELECT rolname, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `;

  const row = rows[0];
  const result: DbRoleCheckResult = {
    role: row?.rolname ?? 'unknown',
    isSuperuser: row?.rolsuper ?? false,
    bypassRls: row?.rolbypassrls ?? false,
    safe: !(row?.rolsuper || row?.rolbypassrls),
  };

  if (!result.safe) {
    const message =
      `Database connection role "${result.role}" has ` +
      `${result.isSuperuser ? 'SUPERUSER' : 'BYPASSRLS'} — ` +
      'row-level security tenant isolation is not enforced for this connection. ' +
      'Production must connect as a restricted application role (e.g. app_user).';

    if (process.env.NODE_ENV === 'production') {
      throw new Error(`P1-06: unsafe database role in production — ${message}`);
    }
    // eslint-disable-next-line no-console
    console.warn(`[dbRoleGuard] ${message} (non-fatal outside production)`);
  }

  return result;
}
