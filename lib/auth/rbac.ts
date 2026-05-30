import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

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
  owner: 'super_admin',
  admin: 'agency_admin',
  member: 'agency_member',
  viewer: 'bic_user',
  partner: 'white_label_partner',
};

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

/**
 * Get the current user's role from session
 */
export async function getCurrentRole(): Promise<Role | undefined> {
  const session = await auth();
  return (session?.user as any)?.role as Role | undefined;
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
  return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
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
    // 1. Check for API key in headers
    const authHeader = req.headers.get('Authorization');
    const xApiKey = req.headers.get('x-api-key')?.trim();
    const token =
      xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    if (token) {
      if (process.env.API_KEY && token === process.env.API_KEY) {
        return handler(req, ...args);
      }

      if (token.startsWith('pe_live_')) {
        const { validateApiKey } = await import('@/lib/auth/apiKeys');
        const validation = await validateApiKey(token);
        if (validation && !('error' in validation)) {
          const scopes = validation.scopes;
          if (
            scopes.includes('*') ||
            scopes.includes('audit:create') ||
            scopes.includes('audit:*')
          ) {
            return handler(req, ...args);
          }
        }
      }
    }

    const session = await auth();
    const userRole = (session?.user as { role?: string })?.role as Role | undefined;

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
      if (process.env.API_KEY && token === process.env.API_KEY) {
        return handler(req, ...args);
      }

      if (token.startsWith('pe_live_')) {
        const { validateApiKey } = await import('@/lib/auth/apiKeys');
        const validation = await validateApiKey(token);
        if (validation && !('error' in validation)) {
          if (validation.scopes.includes('*')) {
            return handler(req, ...args);
          }
          const permToScopeMap: Record<string, string[]> = {
            manage_audits: ['audit:create', 'audit:update', 'audit:delete', 'audit:*'],
            view_audits: ['audit:read', 'audit:*'],
            manage_proposals: [
              'proposal:create',
              'proposal:update',
              'proposal:delete',
              'proposal:*',
            ],
            view_proposals: ['proposal:read', 'proposal:*'],
            manage_settings: ['tenant:update', 'tenant:*'],
            manage_api_keys: ['api_key:create', 'api_key:delete', 'api_key:*'],
          };
          const requiredScopes = permToScopeMap[permission] || [];
          if (requiredScopes.some((s) => validation.scopes.includes(s))) {
            return handler(req, ...args);
          }
        }
      }
    }

    const session = await auth();
    const userRole = (session?.user as { role?: string })?.role as Role | undefined;

    if (!userRole || !hasPermission(userRole, permission)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
    }

    return handler(req, ...args);
  };
}

/**
 * Helper to normalize legacy role strings to Role type
 */
export function normalizeRole(legacyRole: string | undefined): Role | undefined {
  if (!legacyRole) return undefined;
  return LEGACY_ROLE_VALUES[legacyRole] ?? (legacyRole as Role);
}

/**
 * Check if role is API-only (white-label partner role)
 * White-label partner role can only access via API key authentication
 */
export function isApiOnlyRole(role: Role | undefined): boolean {
  return role === 'white_label_partner';
}
