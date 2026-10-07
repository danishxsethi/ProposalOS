import { Prisma } from '@prisma/client';

import { type ExtendedPrismaClient, prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

/**
 * Explicit, audited, minimum-scope bypass for genuinely system/global operations that
 * are not owned by a single tenant (e.g. cross-tenant intelligence aggregation, partner
 * matching across tenants, platform-level AgencyPartner records).
 *
 * Every call site MUST supply a specific, human-readable reason. `runWithTenantBypass`
 * (lib/tenant/context.ts) structurally logs the reason + caller stack frame on every
 * invocation, so bypass usage is always attributable and auditable.
 *
 * The underlying client is the SAME canonical RLS-aware client as `@/lib/prisma` — there
 * is only one Prisma client with tenant-isolation behavior in this codebase. This helper
 * does not create a second, differently-scoped client; it flips `bypassRls` on the shared
 * AsyncLocalStorage context for the duration of `fn`.
 *
 * Do NOT reach for this to avoid fixing a genuinely tenant-scoped query — prefer
 * `runWithTenantAsync(tenantId, fn)` with a real tenant ID whenever the operation logically
 * belongs to one tenant (P1-05).
 */
export async function withSystemDbBypass<T>(
  reason: string,
  fn: (client: ExtendedPrismaClient) => Promise<T>
): Promise<T> {
  try {
    return await runWithTenantBypass(reason, () => fn(prisma));
  } catch (error) {
    await alertOnRlsViolation(reason, error);
    throw error;
  }
}

/**
 * Best-effort alert when a system-bypass call still trips an RLS policy — this indicates
 * either a genuine cross-tenant data issue or a bypass that was granted incorrectly.
 * Never throws; alerting must not mask or replace the original error.
 */
async function alertOnRlsViolation(reason: string, error: unknown): Promise<void> {
  const isRlsError =
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') ||
    (error instanceof Error &&
      (error.message?.includes('row-level security') || error.message?.includes('RLS')));

  if (!isRlsError) return;

  try {
    await fetch(process.env.ALERT_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts', {
      method: 'POST',
      body: JSON.stringify({
        type: 'RLS_VIOLATION_EVENT',
        reason,
        error: error instanceof Error ? error.message : String(error),
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Alerting is best-effort only; never mask the original error.
  }
}
