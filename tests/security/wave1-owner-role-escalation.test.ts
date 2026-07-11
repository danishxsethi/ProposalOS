/**
 * Critical fix discovered during Wave 1 (owner-role carryover, P2-07):
 * LEGACY_ROLE_VALUES.owner previously mapped to 'super_admin', meaning every
 * self-registered tenant admin (stored with role:'owner') normalized to PLATFORM-WIDE
 * super_admin. Confirmed via multiple write sites (register route, tenant provisioning,
 * prisma/seed.ts) that 'owner' universally means "owner of their own tenant", never
 * platform admin. Fixed to map to agency_admin (the correct, least-privileged
 * equivalent). This test proves the escalation is closed and legitimate tenant-admin
 * access is preserved.
 */
import { describe, expect, it } from 'vitest';

import { hasRole, normalizeRole } from '@/lib/auth/rbac';

describe('Critical fix: owner legacy role no longer escalates to super_admin', () => {
  it('normalizes "owner" to agency_admin, not super_admin', () => {
    expect(normalizeRole('owner')).toBe('agency_admin');
  });

  it('a self-registered "owner" cannot satisfy a super_admin gate', () => {
    const role = normalizeRole('owner');
    expect(hasRole(role, 'super_admin')).toBe(false);
  });

  it('a self-registered "owner" CAN administer their own tenant (agency_admin gate)', () => {
    const role = normalizeRole('owner');
    expect(hasRole(role, 'agency_admin')).toBe(true);
  });

  it('a self-registered "owner" cannot cross into platform-wide admin routes', () => {
    const role = normalizeRole('owner');
    // agency_admin is below super_admin in the hierarchy — never satisfies it.
    expect(hasRole(role, 'super_admin')).toBe(false);
  });
});
