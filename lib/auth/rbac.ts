import { auth } from '@/lib/auth';
import { getTenantId } from '@/lib/tenant/context';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const PERMISSIONS = {
    owner: ['*'],
    admin: ['manage_team', 'manage_audits', 'manage_proposals', 'view_audits'],
    member: ['manage_audits', 'manage_proposals', 'view_audits'],
    viewer: ['view_audits'],
};

export const ROLE_HIERARCHY: Record<Role, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1,
};

export async function getCurrentRole() {
    const session = await auth();
    return (session?.user as any)?.role as Role | undefined;
}

export function hasRole(currentRole: Role | undefined, requiredRole: Role) {
    if (!currentRole) return false;
    return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
}

// Middleware HOF for API Routes
export function withRole(role: Role, handler: Function) {
    return async (req: Request, ...args: any[]) => {
        const session = await auth();
        const userRole = (session?.user as any)?.role as Role;

        if (!userRole || !hasRole(userRole, role)) {
            return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
        }

        return handler(req, ...args);
    }
}
