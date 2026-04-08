import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { withRole } from '@/lib/middleware/withRole';
import { getTenantId } from '@/lib/tenant/context';
import { prisma } from '@/lib/prisma';

// P1-9: Revoking a key requires 'owner' role — same privilege as deleting team members
export const DELETE = withRole('owner', withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = await prisma.apiKey.findUnique({
        where: { id },
    });

    if (!apiKey || apiKey.tenantId !== tenantId) {
        return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    await prisma.apiKey.update({
        where: { id },
        data: { isActive: false },
    });

    return NextResponse.json({ success: true });
}));
