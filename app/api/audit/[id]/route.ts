
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

import { withAuth } from '@/lib/middleware/auth';

export const GET = withAuth(async (
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();

        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use findFirst so we can filter by tenantId (findUnique requires unique constraint)
        const audit = await prisma.audit.findFirst({
            where: {
                id,
                tenantId
            },
            include: {
                findings: true,
                proposals: { select: { id: true, webLinkToken: true } },
            },
        });

        if (!audit) {
            return NextResponse.json(
                { error: 'Audit not found or access denied' },
                { status: 404 }
            );
        }

        return NextResponse.json(audit);

    } catch (error) {
        console.error('Error fetching audit:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
});
