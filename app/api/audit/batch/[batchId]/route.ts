import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';

export const GET = withAuth(async (
    req: Request,
    { params }: { params: Promise<{ batchId: string }> }
) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const { batchId } = await params;

    const audits = await prisma.audit.findMany({
        where: { batchId, tenantId },
        select: {
            id: true,
            businessName: true,
            status: true,
            apiCostCents: true,
            createdAt: true,
            completedAt: true
        },
        orderBy: { createdAt: 'asc' }
    });

    if (audits.length === 0) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const total = audits.length;
    const completed = audits.filter(a => a.status === 'COMPLETE' || a.status === 'PARTIAL').length;
    const failed = audits.filter(a => a.status === 'FAILED').length;

    // Status is 'COMPLETED' if all are done/failed
    const isBatchComplete = completed + failed === total;

    return NextResponse.json({
        batchId,
        status: isBatchComplete ? 'COMPLETED' : 'IN_PROGRESS',
        summary: {
            total,
            completed,
            failed,
            pending: total - completed - failed
        },
        audits
    });
});
