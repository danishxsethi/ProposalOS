import { createHash, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

/**
 * Role definitions for the Proposal Engine
 * Aligned with specification:
 *
 * - super_admin: Platform-wide administration (maps to legacy 'owner')
 * - agency_admin: Full access to tenant including billing and team management
 * - agency_member: Manage team members, audits, proposals, and settings
 * - white_label_partner: API-only access for white-label partners (limited to their scoped data)
 * - bic_user: B2C User with read-only access to audits and reports
 *
 * Legacy aliases for backward compatibility with existing code
 */
export type Role =
  | 'super_admin'
  | 'agency_admin'
  | 'agency_member'
  | 'white_label_partner'
  | 'bic_user';

// Legacy role aliases - these are type aliases for backward compatibility
export type owner = 'super_admin';
export type admin = 'agency_admin';
export type member = 'agency_member';
export type viewer = 'bic_user';
export type partner = 'white_label_partner';

// Legacy role mapping for backward compatibility
export const LEGACY_ROLE_MAP: Record<'owner' | 'admin' | 'member' | 'viewer' | 'partner', Role> = {
  owner: 'super_admin',
  admin: 'agency_admin',
  member: 'agency_member',
  viewer: 'bic_user',
  partner: 'white_label_partner',
};

// Legacy role value aliases for string comparisons
export const LEGACY_ROLE_VALUES: Record<string, Role> = {
  // 'owner' historically meant "owner of their own self-registered tenant", never
  // platform-wide super_admin. Mapping it to super_admin (as this table previously did)
  // is a privilege-escalation bug: every self-registered tenant admin would normalize to
  // platform super_admin. agency_admin is the correct, least-privileged equivalent.
  owner: 'agency_admin',
  admin: 'agency_admin',
  member: 'agency_member',
  viewer: 'bic_user',
  partner: 'white_label_partner',
};

/** Roles that may be assigned via tenant team invitation (never super_admin). */
export const INVITE_ASSIGNABLE_ROLES: readonly Role[] = [
  'agency_admin',
  'agency_member',
  'white_label_partner',
  'bic_user',
] as const;

/**
 * Permission definitions
 * Each role maps to a set of permissions
 */
export const PERMISSIONS: Record<Role, string[]> = {
  super_admin: ['*'], // All platform-wide permissions
  agency_admin: [
    'manage_team',
    'manage_audits',
    'manage_proposals',
    'manage_settings',
    'view_audits',
    'view_proposals',
    'view_analytics',
    'manage_api_keys',
    'manage_billing',
  ],
  agency_member: [
    'manage_audits',
    'manage_proposals',
    'view_audits',
    'view_proposals',
    'view_analytics',
  ],
  white_label_partner: ['api_access', 'view_own_audits', 'view_own_proposals'],
  bic_user: ['view_audits', 'view_proposals', 'view_own_reports'],
};

/**
 * Role hierarchy for permission inheritance
 * Higher numbers have more privileges
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 5,
  agency_admin: 4,
  agency_member: 3,
  white_label_partner: 2,
  bic_user: 1,
};

/** Permission → API-key scopes that satisfy it (tenant keys only). */
const PERMISSION_TO_SCOPES: Record<string, string[]> = {
  manage_audits: ['audit:create', 'audit:update', 'audit:delete', 'audit:*'],
  view_audits: ['audit:read', 'audit:*'],
  manage_proposals: ['proposal:create', 'proposal:update', 'proposal:delete', 'proposal:*'],
  view_proposals: ['proposal:read', 'proposal:*'],
  manage_settings: ['tenant:update', 'tenant:*'],
  manage_api_keys: ['api_key:create', 'api_key:delete', 'api_key:*'],
  manage_team: ['tenant:update', 'tenant:*'],
  manage_billing: ['tenant:update', 'tenant:*'],
  view_analytics: ['audit:read', 'audit:*'],
  api_access: ['audit:read', 'audit:create', 'audit:*', 'proposal:read', 'proposal:*'],
  view_own_audits: ['audit:read', 'audit:*'],
  view_own_proposals: ['proposal:read', 'proposal:*'],
  view_own_reports: ['audit:read', 'audit:*'],
};

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function matchesEnvApiKey(token: string): boolean {
  const envKey = process.env.API_KEY;
  if (!envKey) return false;
  return timingSafeStringEqual(token, envKey);
}

function matchesInternalOpsKey(req: Request): boolean {
  const configured = process.env.INTERNAL_OPS_KEY;
  const supplied = req.headers.get('x-internal-ops-key');
  if (!configured || !supplied) return false;
  return timingSafeStringEqual(supplied, configured);
}

/**
 * Map tenant API-key scopes to a maximum Role.
 * Tenant keys never elevate to super_admin — platform admin is session-only
 * (or the server env API_KEY path, handled separately).
 */
export function effectiveRoleFromScopes(scopes: string[]): Role | undefined {
  if (!scopes.length) return undefined;

  // `*` is full *tenant* access, not platform super_admin.
  if (
    scopes.includes('*') ||
    scopes.includes('tenant:*') ||
    scopes.includes('tenant:update') ||
    scopes.includes('api_key:create') ||
    scopes.includes('api_key:delete') ||
    scopes.includes('api_key:*')
  ) {
    return 'agency_admin';
  }

  if (
    scopes.includes('audit:create') ||
    scopes.includes('audit:update') ||
    scopes.includes('audit:delete') ||
    scopes.includes('audit:*') ||
    scopes.includes('proposal:create') ||
    scopes.includes('proposal:update') ||
    scopes.includes('proposal:delete') ||
    scopes.includes('proposal:send') ||
    scopes.includes('proposal:*')
  ) {
    return 'agency_member';
  }

  if (
    scopes.includes('audit:read') ||
    scopes.includes('proposal:read') ||
    scopes.includes('tenant:read') ||
    scopes.includes('api_key:read')
  ) {
    return 'bic_user';
  }

  return undefined;
}

/** Whether a tenant API key's scopes satisfy a minimum role requirement. */
export function apiKeySatisfiesRole(scopes: string[], requiredRole: Role): boolean {
  // Tenant pe_live_* keys can never satisfy platform super_admin.
  if (requiredRole === 'super_admin') return false;
  const effective = effectiveRoleFromScopes(scopes);
  return hasRole(effective, requiredRole);
}

/** Whether a tenant API key's scopes satisfy a named permission. */
export function apiKeySatisfiesPermission(scopes: string[], permission: string): boolean {
  // `*` grants all *tenant* permissions — not a substitute for super_admin session.
  if (scopes.includes('*')) return true;

  const requiredScopes = PERMISSION_TO_SCOPES[permission];
  if (!requiredScopes?.length) return false;
  return requiredScopes.some(
    (s) =>
      scopes.includes(s) ||
      scopes.includes(`${s.split(':')[0]}:*`) ||
      (s.endsWith(':*') && scopes.some((k) => k.startsWith(`${s.slice(0, -1)}`)))
  );
}

/**
 * Validate invite role: enum + inviter ceiling. super_admin never assignable via invite.
 */
export function assertAssignableInviteRole(
  requestedRole: unknown,
  inviterRole: Role | undefined
): { role: Role } | { error: string } {
  if (typeof requestedRole !== 'string' || !requestedRole.trim()) {
    return { error: 'Invalid role' };
  }

  const role = normalizeRole(requestedRole);
  if (!role || !(role in ROLE_HIERARCHY)) {
    return { error: 'Invalid or unknown role' };
  }

  if (role === 'super_admin' || !INVITE_ASSIGNABLE_ROLES.includes(role)) {
    return { error: 'Role is not assignable via invitation' };
  }

  if (!inviterRole || !(inviterRole in ROLE_HIERARCHY)) {
    return { error: 'Inviter role is not authorized' };
  }

  // Inviter may only grant roles at or below their own authority.
  if (ROLE_HIERARCHY[inviterRole] < ROLE_HIERARCHY[role]) {
    return { error: 'Cannot assign a role above your own authority' };
  }

  // Tenant-scoped inviters (everyone except super_admin) already cannot assign super_admin.
  return { role };
}

/**
 * Get the current user's role from session (legacy values normalized).
 */
export async function getCurrentRole(): Promise<Role | undefined> {
  const session = await auth();
  return normalizeRole((session?.user as { role?: string } | undefined)?.role);
}

/**
 * Check if current role has required permission
 *
 * @param currentRole - The user's current role
 * @param requiredRole - The minimum role required
 * @returns True if user has sufficient privileges
 */
export function hasRole(currentRole: Role | undefined, requiredRole: Role): boolean {
  if (!currentRole) return false;
  const current = ROLE_HIERARCHY[currentRole];
  const required = ROLE_HIERARCHY[requiredRole];
  if (current === undefined || required === undefined) return false;
  return current >= required;
}

/**
 * Check if current role has specific permission
 *
 * @param currentRole - The user's current role
 * @param permission - The permission to check
 * @returns True if user has the permission
 */
export function hasPermission(currentRole: Role | undefined, permission: string): boolean {
  if (!currentRole) return false;

  const rolePermissions = PERMISSIONS[currentRole];
  if (!rolePermissions) return false;

  // Owner has all permissions
  if (rolePermissions.includes('*')) return true;

  return rolePermissions.includes(permission);
}

/**
 * Middleware HOF for API Routes - Role-based access control
 *
 * @param role - Minimum required role
 * @param handler - The route handler function
 *
 * @example
 * ```typescript
 * export const POST = withRole('agency_admin', async (req) => {
 *   // Only agency_admin and super_admin can access
 * });
 * ```
 */
export function withRole(role: Role, handler: Function) {
  return async (req: Request, ...args: any[]) => {
    if (matchesInternalOpsKey(req)) {
      return handler(req, ...args);
    }

    // 1. Check for API key in headers
    const authHeader = req.headers.get('Authorization');
    const xApiKey = req.headers.get('x-api-key')?.trim();
    const token =
      xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    if (token) {
      // Platform env key — server-to-server only; timing-safe compare.
      // Does not grant via tenant-scoped pe_live_* scopes.
      if (matchesEnvApiKey(token)) {
        return handler(req, ...args);
      }

      if (token.startsWith('pe_live_')) {
        const { validateApiKey } = await import('@/lib/auth/apiKeys');
        const validation = await validateApiKey(token);
        if (validation && !('error' in validation)) {
          if (apiKeySatisfiesRole(validation.scopes, role)) {
            return handler(req, ...args);
          }
        }
        return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
      }
    }

    const session = await auth();
    const userRole = normalizeRole((session?.user as { role?: string } | undefined)?.role);

    if (!userRole || !hasRole(userRole, role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
    }

    return handler(req, ...args);
  };
}

/**
 * Middleware HOF for API Routes - Permission-based access control
 *
 * @param permission - Required permission
 * @param handler - The route handler function
 *
 * @example
 * ```typescript
 * export const POST = withPermission('manage_api_keys', async (req) => {
 *   // Only users with manage_api_keys permission can access
 * });
 * ```
 */
export function withPermission(permission: string, handler: Function) {
  return async (req: Request, ...args: any[]) => {
    // Check for API key in headers
    const authHeader = req.headers.get('Authorization');
    const xApiKey = req.headers.get('x-api-key')?.trim();
    const token =
      xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    if (token) {
      if (matchesEnvApiKey(token)) {
        return handler(req, ...args);
      }

      if (token.startsWith('pe_live_')) {
        const { validateApiKey } = await import('@/lib/auth/apiKeys');
        const validation = await validateApiKey(token);
        if (validation && !('error' in validation)) {
          if (apiKeySatisfiesPermission(validation.scopes, permission)) {
            return handler(req, ...args);
          }
        }
        return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
      }
    }

    const session = await auth();
    const userRole = normalizeRole((session?.user as { role?: string } | undefined)?.role);

    if (!userRole || !hasPermission(userRole, permission)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
    }

    return handler(req, ...args);
  };
}

/**
 * Helper to normalize legacy role strings to Role type.
 * Unknown values fail closed (undefined) rather than casting through.
 */
export function normalizeRole(legacyRole: string | undefined): Role | undefined {
  if (!legacyRole) return undefined;
  if (legacyRole in LEGACY_ROLE_VALUES) {
    return LEGACY_ROLE_VALUES[legacyRole];
  }
  if (legacyRole in ROLE_HIERARCHY) {
    return legacyRole as Role;
  }
  return undefined;
}

/**
 * Check if role is API-only (white-label partner role)
 * White-label partner role can only access via API key authentication
 */
export function isApiOnlyRole(role: Role | undefined): boolean {
  return role === 'white_label_partner';
}
