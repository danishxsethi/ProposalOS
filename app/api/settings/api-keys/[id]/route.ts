
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { prisma } from '@/lib/prisma';

export const DELETE = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;

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
});
