import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
};

/**
 * RBAC middleware. Wraps a route handler and enforces that the
 * authenticated user has at least `requiredRole` in the hierarchy.
 *
 * Usage:
 *   export const POST = withRole('member', withAuth(handler));
 */
export function withRole(
    requiredRole: Role,
    handler: (req: Request, ...args: unknown[]) => Promise<Response | NextResponse>
) {
    return async (req: Request, ...args: unknown[]) => {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = ((session.user as { role?: string }).role as Role | undefined) ?? 'viewer';
        if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[requiredRole]) {
            return NextResponse.json(
                { error: `Requires ${requiredRole} role or higher` },
                { status: 403 }
            );
        }

        return handler(req, ...args);
    };
}
