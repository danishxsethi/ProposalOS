
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { checkSeatLimit } from '@/lib/billing/limits';
import { withRole } from '@/lib/auth/rbac';
import { nanoid } from 'nanoid';
// import { Resend } from 'resend'; // Mocking for now to avoid dependency install issues if not present

// const resend = new Resend(process.env.RESEND_API_KEY);

export const POST = withAuth(async (req: Request) => {
    // 1. RBAC Check (Admin+)
    const rbacMiddleware = withRole('admin', async () => {
        try {
            const body = await req.json();
            const { email, role } = body;

            if (!email || !role) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

            // 2. Limit Check
            const seats = await checkSeatLimit();
            if (!seats.allowed) {
                return NextResponse.json({ error: seats.reason || 'Seat limit reached' }, { status: 429 });
            }

            const tenantId = await getTenantId();
            if (!tenantId) return NextResponse.json({ error: 'No Tenant' }, { status: 401 });
            const prisma = createScopedPrisma(tenantId);

            // 3. User Existence Check (Global)
            // Need global prisma to check if user exists in ANY tenant
            // Actually, we might allow user to be in multiple tenants in future, but for now:
            // "If user exists in another tenant -> error" per requirements
            // We need access to global prisma for this check, but `createScopedPrisma` gives us access to current tenant scope.
            // Using `prisma` from global import for this specific check.
            const globalPrisma = (await import('@/lib/prisma')).prisma;
            const existingUser = await globalPrisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return NextResponse.json({ error: 'User already has an account' }, { status: 409 });
            }

            // 4. Create Invitation
            const token = nanoid(32);
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const invitation = await prisma.invitation.create({
                data: {
                    email,
                    role,
                    token,
                    tenantId,
                    expiresAt,
                    invitedBy: 'current-user-id', // TODO: Get actual ID
                },
            });

            // 5. Send Email
            // console.log(`[Email Mock] Sending invite to ${email} with token ${token}`);
            // In real impl:
            // await resend.emails.send({ ... })

            return NextResponse.json({ success: true, invitation });

        } catch (e: any) {
            console.error(e);
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    });

    return rbacMiddleware(req);
});
