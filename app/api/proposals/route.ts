
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';

export const GET = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const prisma = createScopedPrisma(tenantId);

    const proposals = await prisma.proposal.findMany({
        where: { tenantId },
        include: {
            audit: true,
            followUps: true
        },
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ proposals });
});
