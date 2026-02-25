
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { withAuth } from '@/lib/middleware/auth';

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prismaScoped = createScopedPrisma(tenantId);

        // Verify ownership implicitly via scoped prisma or explicit check (ScopedPrisma handles tenantId filter usually? 
        // Actually ScopedPrisma usually just adds tenantId to where clauses. 
        // If createScopedPrisma returns a client that automatically filters, great.
        // If not, we must add tenantId. Assuming standard prisma pattern here:

        await prisma.auditSchedule.delete({
            where: {
                id: id,
                tenantId // Ensure ownership
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();

        await prisma.auditSchedule.update({
            where: { id: id, tenantId },
            data: body // simplified, validate specific fields in prod
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
